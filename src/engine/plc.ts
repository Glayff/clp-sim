// Motor de varredura (scan cycle) do CLP.
//
// Cada varredura:
//   1. Lê as entradas físicas e congela a imagem das entradas
//   2. Executa os degraus de cima para baixo, da esquerda para a direita
//   3. Atualiza a imagem das saídas (Q) — as bobinas escrevem na hora, então
//      os degraus seguintes já enxergam o novo valor
//
// O motor é determinístico: o tempo avança apenas pelo `dtMs` informado.

import {
  COUNTER_TAGS,
  INPUT_TAGS,
  MEMORY_TAGS,
  OUTPUT_TAGS,
  TIMER_TAGS,
  tagClass,
  type LogicNode,
  type OutputNode,
  type PlcState,
  type Program,
  type Trace,
  type Warning,
} from './types';

export const MAX_COUNT = 32767;

export function createState(): PlcState {
  const bits: Record<string, boolean> = {};
  for (const t of [...INPUT_TAGS, ...OUTPUT_TAGS, ...MEMORY_TAGS]) bits[t] = false;
  const timers: PlcState['timers'] = {};
  for (const t of TIMER_TAGS) timers[t] = { acc: 0, dn: false, tt: false };
  const counters: PlcState['counters'] = {};
  for (const c of COUNTER_TAGS) counters[c] = { acc: 0, dn: false };
  return { bits, timers, counters, edges: {}, scans: 0 };
}

export type ReadableState = Pick<PlcState, 'bits' | 'timers' | 'counters'>;

/** Lê o valor booleano de um endereço (T e C retornam o bit DN). */
export function readTag(state: ReadableState, tag: string): boolean {
  switch (tagClass(tag)) {
    case 'T':
      return state.timers[tag]?.dn ?? false;
    case 'C':
      return state.counters[tag]?.dn ?? false;
    default:
      return state.bits[tag] ?? false;
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
    pout = pin && (node.nc ? !value : value);
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
  }
}

/**
 * Executa uma varredura completa.
 * @param physicalInputs valor elétrico de cada entrada (I0..I7) neste instante
 * @param dtMs tempo decorrido desde a varredura anterior (tempo de ciclo)
 */
export function scan(
  program: Program,
  state: PlcState,
  physicalInputs: Record<string, boolean>,
  dtMs: number,
  trace: Trace,
): void {
  trace.clear();
  for (const tag of INPUT_TAGS) state.bits[tag] = !!physicalInputs[tag];

  for (const rung of program.rungs) {
    const power = evalSeries(rung.logic, true, state, trace);
    trace.set(rung.id, { pin: true, pout: power });
    for (const out of rung.outputs) {
      trace.set(out.id, { pin: power, pout: power });
      applyOutput(out, power, state, dtMs);
    }
  }
  state.scans += 1;
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

/** Todos os endereços referenciados pelo programa. */
export function collectTags(program: Program): Set<string> {
  const tags = new Set<string>();
  for (const r of program.rungs) {
    forEachLogic(r.logic, (n) => {
      if (n.kind === 'contact') tags.add(n.tag);
    });
    for (const o of r.outputs) tags.add(o.tag);
  }
  return tags;
}

/** Verificações didáticas: erros comuns de programação Ladder. */
export function validate(program: Program): Warning[] {
  const warnings: Warning[] = [];
  const coilOwner = new Map<string, string>();
  const blockOwner = new Map<string, string>();
  const defined = new Set<string>();

  for (const r of program.rungs)
    for (const o of r.outputs)
      if (o.kind === 'ton' || o.kind === 'tof' || o.kind === 'ctu') defined.add(o.tag);

  program.rungs.forEach((r, idx) => {
    const n = idx + 1;
    for (const o of r.outputs) {
      if (o.kind === 'coil' || o.kind === 'ncoil') {
        const first = coilOwner.get(o.tag);
        if (first && first !== r.id) {
          warnings.push({
            rungId: r.id,
            message: `Degrau ${n}: a bobina ${o.tag} já é escrita em outro degrau. Só a última vale — use SET/RESET se for intencional.`,
          });
        } else coilOwner.set(o.tag, r.id);
      }
      if (o.kind === 'ton' || o.kind === 'tof' || o.kind === 'ctu') {
        const first = blockOwner.get(o.tag);
        if (first && first !== r.id) {
          warnings.push({
            rungId: r.id,
            message: `Degrau ${n}: ${o.tag} já é usado em outro degrau. Cada temporizador/contador deve aparecer uma única vez.`,
          });
        } else blockOwner.set(o.tag, r.id);
      }
      if (o.kind === 'res' && !defined.has(o.tag)) {
        warnings.push({
          rungId: r.id,
          message: `Degrau ${n}: RES ${o.tag} zera um bloco que não existe no programa.`,
        });
      }
    }
    forEachLogic(r.logic, (node) => {
      if (node.kind !== 'contact') return;
      const cls = tagClass(node.tag);
      if ((cls === 'T' || cls === 'C') && !defined.has(node.tag)) {
        warnings.push({
          rungId: r.id,
          message: `Degrau ${n}: o contato ${node.tag} lê um bloco que não existe no programa.`,
        });
      }
    });
  });
  return warnings;
}
