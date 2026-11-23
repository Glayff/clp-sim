// Motor de varredura (scan cycle) do CLP.
//
// Cada varredura:
//   1. Lê as entradas (digitais e analógicas), atualiza os bits de sistema
//      (primeiro ciclo, clocks) e aplica os forçamentos
//   2. Executa os degraus de cima para baixo, da esquerda para a direita
//   3. Atualiza a imagem das saídas — as bobinas escrevem na hora, então
//      os degraus seguintes já enxergam o novo valor
//
// O motor é determinístico: o tempo avança apenas pelo `dtMs` informado.

import {
  ANALOG_FULL_SCALE,
  ANALOG_IN_TAGS,
  ANALOG_OUT_TAGS,
  COUNTER_TAGS,
  INPUT_TAGS,
  MEMORY_TAGS,
  OUTPUT_TAGS,
  REGISTER_TAGS,
  SYSTEM_TAGS,
  TIMER_TAGS,
  baseTag,
  tagClass,
  type CompareOp,
  type LogicNode,
  type Operand,
  type OutputNode,
  type PlcState,
  type Program,
  type Trace,
  type Warning,
} from './types';

export const MAX_COUNT = 32767;
const INT_MIN = -2147483648;
const INT_MAX = 2147483647;

/** Valores forçados: booleano para bits (I, Q, M), número para registradores/analógicas. */
export type Forces = Record<string, boolean | number>;

/** Dados que vêm de fora do programa em cada varredura. */
export interface ScanIO {
  /** Valor bruto (0–27648) de cada entrada analógica */
  analog?: Record<string, number>;
  forces?: Forces;
}

export function createState(): PlcState {
  const bits: Record<string, boolean> = {};
  for (const t of [...INPUT_TAGS, ...OUTPUT_TAGS, ...MEMORY_TAGS, ...SYSTEM_TAGS]) bits[t] = false;
  const regs: Record<string, number> = {};
  for (const t of [...REGISTER_TAGS, ...ANALOG_IN_TAGS, ...ANALOG_OUT_TAGS]) regs[t] = 0;
  const timers: PlcState['timers'] = {};
  for (const t of TIMER_TAGS) timers[t] = { acc: 0, dn: false, tt: false };
  const counters: PlcState['counters'] = {};
  for (const c of COUNTER_TAGS) counters[c] = { acc: 0, dn: false };
  return { bits, timers, counters, regs, edges: {}, scans: 0, timeMs: 0 };
}

/**
 * Estado depois de um STOP: tudo volta a zero (partida a frio), exceto os
 * endereços retentivos (M, D e C), que guardam o valor que tinham.
 */
export function restartState(prev: PlcState, retentive: readonly string[]): PlcState {
  const next = createState();
  for (const tag of retentive) {
    switch (tagClass(tag)) {
      case 'M':
        next.bits[tag] = prev.bits[tag] ?? false;
        break;
      case 'D':
        next.regs[tag] = prev.regs[tag] ?? 0;
        break;
      case 'C': {
        const c = prev.counters[tag];
        if (c) next.counters[tag] = { ...c };
        break;
      }
    }
  }
  return next;
}

export type ReadableState = Pick<PlcState, 'bits' | 'timers' | 'counters' | 'regs'>;

/** Lê o valor booleano de um endereço (T e C retornam o bit DN). */
export function readTag(state: Pick<PlcState, 'bits' | 'timers' | 'counters'>, tag: string): boolean {
  switch (tagClass(tag)) {
    case 'T':
      return state.timers[tag]?.dn ?? false;
    case 'C':
      return state.counters[tag]?.dn ?? false;
    default:
      return state.bits[tag] ?? false;
  }
}

/** Lê o valor numérico de um endereço (D, AI, AQ, T0.ACC, C0.ACC). */
export function readNum(state: ReadableState, tag: string): number {
  if (tag.endsWith('.ACC')) {
    const base = baseTag(tag);
    return tagClass(base) === 'T' ? (state.timers[base]?.acc ?? 0) : (state.counters[base]?.acc ?? 0);
  }
  return state.regs[tag] ?? 0;
}

export function operandValue(state: ReadableState, o: Operand): number {
  return o.kind === 'const' ? o.value : readNum(state, o.tag);
}

const toInt = (n: number): number => Math.max(INT_MIN, Math.min(INT_MAX, Math.trunc(n))) | 0;

function writeNum(state: PlcState, tag: string, value: number): void {
  const cls = tagClass(tag);
  if (cls === 'D') state.regs[tag] = toInt(value);
  else if (cls === 'AQ') state.regs[tag] = Math.max(0, Math.min(ANALOG_FULL_SCALE, Math.round(value)));
}

function compareValues(op: CompareOp, a: number, b: number): boolean {
  switch (op) {
    case 'eq':
      return a === b;
    case 'ne':
      return a !== b;
    case 'gt':
      return a > b;
    case 'ge':
      return a >= b;
    case 'lt':
      return a < b;
    case 'le':
      return a <= b;
  }
}

function applyForces(state: PlcState, forces: Forces): void {
  for (const [tag, value] of Object.entries(forces)) {
    if (typeof value === 'boolean') state.bits[tag] = value;
    else if (tagClass(tag) === 'AI') state.regs[tag] = Math.max(0, Math.min(32767, Math.round(value)));
    else writeNum(state, tag, value);
  }
}

function evalSeries(nodes: LogicNode[], pin: boolean, state: PlcState, trace: Trace): boolean {
  let power = pin;
  for (const node of nodes) power = evalNode(node, power, state, trace);
  return power;
}

function evalNode(node: LogicNode, pin: boolean, state: PlcState, trace: Trace): boolean {
  let pout: boolean;
  if (node.kind === 'contact') {
    const value = readTag(state, node.tag);
    let pass: boolean;
    if (node.edge) {
      // Sem borda artificial na primeira leitura: o estado anterior começa igual ao atual.
      const prev = state.edges[node.id] ?? value;
      pass = node.edge === 'rise' ? value && !prev : !value && prev;
      state.edges[node.id] = value;
    } else {
      pass = node.nc ? !value : value;
    }
    pout = pin && pass;
  } else if (node.kind === 'compare') {
    pout = pin && compareValues(node.op, operandValue(state, node.a), operandValue(state, node.b));
  } else {
    pout = false;
    // Avalia todos os ramos (sem curto-circuito) para o rastro ficar completo.
    node.branches.forEach((branch, i) => {
      const out = evalSeries(branch, pin, state, trace);
      trace.set(`${node.id}:${i}`, { pin, pout: out });
      if (out) pout = true;
    });
  }
  trace.set(node.id, { pin, pout });
  return pout;
}

function applyOutput(o: OutputNode, power: boolean, state: PlcState, dtMs: number): void {
  switch (o.kind) {
    case 'coil':
      state.bits[o.tag] = power;
      break;
    case 'ncoil':
      state.bits[o.tag] = !power;
      break;
    case 'set':
      if (power) state.bits[o.tag] = true;
      break;
    case 'rst':
      if (power) state.bits[o.tag] = false;
      break;
    case 'ton': {
      const t = (state.timers[o.tag] ??= { acc: 0, dn: false, tt: false });
      if (power) {
        t.acc = Math.min(t.acc + dtMs, o.preset);
        t.dn = t.acc >= o.preset;
        t.tt = !t.dn;
      } else {
        t.acc = 0;
        t.dn = false;
        t.tt = false;
      }
      break;
    }
    case 'tof': {
      const t = (state.timers[o.tag] ??= { acc: 0, dn: false, tt: false });
      if (power) {
        t.dn = true;
        t.acc = 0;
        t.tt = false;
      } else if (t.dn) {
        t.acc = Math.min(t.acc + dtMs, o.preset);
        if (t.acc >= o.preset) {
          t.dn = false;
          t.tt = false;
        } else {
          t.tt = true;
        }
      }
      break;
    }
    case 'ctu': {
      const c = (state.counters[o.tag] ??= { acc: 0, dn: false });
      const prev = state.edges[o.tag] ?? false;
      if (power && !prev) c.acc = Math.min(c.acc + 1, MAX_COUNT);
      state.edges[o.tag] = power;
      c.dn = c.acc >= o.preset;
      break;
    }
    case 'res':
      if (power) {
        if (tagClass(o.tag) === 'T') state.timers[o.tag] = { acc: 0, dn: false, tt: false };
        else if (tagClass(o.tag) === 'C') state.counters[o.tag] = { acc: 0, dn: false };
      }
      break;
    case 'mov':
      if (power) writeNum(state, o.dst, operandValue(state, o.src));
      break;
    case 'add':
    case 'sub':
    case 'mul':
    case 'div': {
      if (!power) break;
      const a = operandValue(state, o.a);
      const b = operandValue(state, o.b);
      if (o.kind === 'add') writeNum(state, o.dst, (a + b) | 0);
      else if (o.kind === 'sub') writeNum(state, o.dst, (a - b) | 0);
      else if (o.kind === 'mul') writeNum(state, o.dst, Math.imul(a, b));
      else if (b !== 0) writeNum(state, o.dst, Math.trunc(a / b));
      // Divisão por zero: o destino fica como estava (o CLP não para).
      break;
    }
    case 'scl': {
      if (!power || o.inMax === o.inMin) break;
      const x = operandValue(state, o.src);
      const lo = Math.min(o.outMin, o.outMax);
      const hi = Math.max(o.outMin, o.outMax);
      const y = o.outMin + ((x - o.inMin) * (o.outMax - o.outMin)) / (o.inMax - o.inMin);
      writeNum(state, o.dst, Math.round(Math.min(hi, Math.max(lo, y))));
      break;
    }
  }
}

/**
 * Executa uma varredura completa.
 * @param physicalInputs valor elétrico de cada entrada digital (I0..I7) neste instante
 * @param dtMs tempo decorrido desde a varredura anterior (tempo de ciclo)
 * @param io entradas analógicas e forçamentos
 */
export function scan(
  program: Program,
  state: PlcState,
  physicalInputs: Record<string, boolean>,
  dtMs: number,
  trace: Trace,
  io: ScanIO = {},
): void {
  trace.clear();
  const forces = io.forces;
  const hasForces = !!forces && Object.keys(forces).length > 0;

  for (const tag of INPUT_TAGS) state.bits[tag] = !!physicalInputs[tag];
  for (const tag of ANALOG_IN_TAGS) {
    state.regs[tag] = Math.max(0, Math.min(32767, Math.round(io.analog?.[tag] ?? 0)));
  }

  // Bits de sistema
  state.bits.S0 = true;
  state.bits.S1 = state.scans === 0;
  state.bits.S2 = state.timeMs % 500 < 250;
  state.bits.S3 = state.timeMs % 1000 < 500;
  state.bits.S4 = state.timeMs % 2000 < 1000;

  if (hasForces) applyForces(state, forces);

  for (const rung of program.rungs) {
    const power = evalSeries(rung.logic, true, state, trace);
    trace.set(rung.id, { pin: true, pout: power });
    for (const out of rung.outputs) {
      trace.set(out.id, { pin: power, pout: power });
      applyOutput(out, power, state, dtMs);
      if (hasForces) applyForces(state, forces);
    }
  }
  state.scans += 1;
  state.timeMs += dtMs;
}

/** Presets de temporizadores/contadores definidos no programa, por endereço. */
export function collectPresets(program: Program): Record<string, number> {
  const presets: Record<string, number> = {};
  for (const r of program.rungs)
    for (const o of r.outputs)
      if (o.kind === 'ton' || o.kind === 'tof' || o.kind === 'ctu') presets[o.tag] = o.preset;
  return presets;
}

function forEachLogic(nodes: LogicNode[], fn: (n: LogicNode) => void): void {
  for (const n of nodes) {
    fn(n);
    if (n.kind === 'parallel') for (const b of n.branches) forEachLogic(b, fn);
  }
}

/** Ids dos contatos de borda (P/N) do programa — a interface os destaca quando disparam. */
export function collectEdgeIds(program: Program): string[] {
  const ids: string[] = [];
  for (const r of program.rungs) {
    forEachLogic(r.logic, (n) => {
      if (n.kind === 'contact' && n.edge) ids.push(n.id);
    });
  }
  return ids;
}

/** Operandos lidos por uma saída (instruções de dados). */
function outputReads(o: OutputNode): Operand[] {
  switch (o.kind) {
    case 'mov':
    case 'scl':
      return [o.src];
    case 'add':
    case 'sub':
    case 'mul':
    case 'div':
      return [o.a, o.b];
    default:
      return [];
  }
}

/** Destino numérico de uma saída, se ela escrever em um registrador. */
function outputDst(o: OutputNode): string | null {
  return o.kind === 'mov' || o.kind === 'scl' || o.kind === 'add' || o.kind === 'sub' || o.kind === 'mul' || o.kind === 'div'
    ? o.dst
    : null;
}

/** Todos os endereços (sem o sufixo .ACC) referenciados pelo programa. */
export function collectTags(program: Program): Set<string> {
  const tags = new Set<string>();
  const addOperand = (o: Operand) => {
    if (o.kind === 'tag') tags.add(baseTag(o.tag));
  };
  for (const r of program.rungs) {
    forEachLogic(r.logic, (n) => {
      if (n.kind === 'contact') tags.add(n.tag);
      else if (n.kind === 'compare') {
        addOperand(n.a);
        addOperand(n.b);
      }
    });
    for (const o of r.outputs) {
      const dst = outputDst(o);
      if (dst) tags.add(dst);
      for (const op of outputReads(o)) addOperand(op);
      if (!dst) tags.add((o as { tag: string }).tag);
    }
  }
  return tags;
}

/** Verificações didáticas: erros comuns de programação Ladder. */
export function validate(program: Program): Warning[] {
  const warnings: Warning[] = [];
  const coilOwner = new Map<string, string>();
  const blockOwner = new Map<string, string>();
  const definedBlocks = new Set<string>();
  const writtenBits = new Set<string>();
  const writtenRegs = new Set<string>();

  for (const r of program.rungs) {
    for (const o of r.outputs) {
      if (o.kind === 'ton' || o.kind === 'tof' || o.kind === 'ctu') definedBlocks.add(o.tag);
      if (o.kind === 'coil' || o.kind === 'ncoil' || o.kind === 'set' || o.kind === 'rst') writtenBits.add(o.tag);
      const dst = outputDst(o);
      if (dst) writtenRegs.add(dst);
    }
  }

  program.rungs.forEach((r, idx) => {
    const n = idx + 1;
    const seen = new Set<string>();
    const warn = (message: string) => {
      if (seen.has(message)) return;
      seen.add(message);
      warnings.push({ rungId: r.id, message });
    };

    // Degrau que só energiza por um instante: contato de borda ou primeiro ciclo (S1).
    let oneShot = false;
    forEachLogic(r.logic, (node) => {
      if (node.kind === 'contact' && (node.edge || node.tag === 'S1')) oneShot = true;
    });

    for (const o of r.outputs) {
      if (o.kind === 'coil' || o.kind === 'ncoil') {
        const first = coilOwner.get(o.tag);
        if (first && first !== r.id) {
          warn(
            `Degrau ${n}: a bobina ${o.tag} já é escrita em outro degrau. Só a última vale — use SET/RESET se for intencional.`,
          );
        } else coilOwner.set(o.tag, r.id);
      }
      if (o.kind === 'ton' || o.kind === 'tof' || o.kind === 'ctu') {
        const first = blockOwner.get(o.tag);
        if (first && first !== r.id) {
          warn(
            `Degrau ${n}: ${o.tag} já é usado em outro degrau. Cada temporizador/contador deve aparecer uma única vez.`,
          );
        } else blockOwner.set(o.tag, r.id);
      }
      if (o.kind === 'res' && !definedBlocks.has(o.tag)) {
        warn(`Degrau ${n}: RES ${o.tag} zera um bloco que não existe no programa.`);
      }
      if (o.kind === 'div' && o.b.kind === 'const' && o.b.value === 0) {
        warn(`Degrau ${n}: DIV por zero — o resultado nunca é escrito.`);
      }
      for (const op of outputReads(o)) {
        if (op.kind === 'tag' && tagClass(op.tag) === 'D' && !writtenRegs.has(op.tag)) {
          warn(`Degrau ${n}: ${op.tag} é lido, mas nenhuma instrução escreve nele (vale sempre 0, a menos que seja forçado).`);
        }
      }
      if (o.kind === 'add' || o.kind === 'sub' || o.kind === 'mul' || o.kind === 'div') {
        const selfRef = [o.a, o.b].some((x) => x.kind === 'tag' && x.tag === o.dst);
        if (selfRef && !oneShot) {
          warn(
            `Degrau ${n}: ${o.kind.toUpperCase()} lê e escreve ${o.dst}, então roda a cada varredura enquanto o degrau estiver energizado. Use um contato de borda (P) para executar uma vez só.`,
          );
        }
      }
    }

    forEachLogic(r.logic, (node) => {
      if (node.kind === 'contact') {
        const cls = tagClass(node.tag);
        if ((cls === 'T' || cls === 'C') && !definedBlocks.has(node.tag)) {
          warn(`Degrau ${n}: o contato ${node.tag} lê um bloco que não existe no programa.`);
        }
        if ((cls === 'Q' || cls === 'M') && !writtenBits.has(node.tag)) {
          warn(
            `Degrau ${n}: o contato ${node.tag} lê um endereço que nenhuma bobina escreve — ele nunca muda (a menos que seja forçado).`,
          );
        }
      } else if (node.kind === 'compare') {
        for (const op of [node.a, node.b]) {
          if (op.kind === 'tag' && tagClass(op.tag) === 'D' && !writtenRegs.has(op.tag)) {
            warn(`Degrau ${n}: ${op.tag} é lido, mas nenhuma instrução escreve nele (vale sempre 0, a menos que seja forçado).`);
          }
        }
      }
    });
  });
  return warnings;
}
