// Salvar/abrir programas em JSON, com validação estrutural do que vem de fora.

import { DEFAULT_INPUT_KINDS, DEFAULT_OUTPUT_KINDS } from './examples';
import {
  ANALOG_IN_TAGS,
  ANALOG_OUT_TAGS,
  COUNTER_TAGS,
  INPUT_TAGS,
  MEMORY_TAGS,
  NUMERIC_READ_TAGS,
  NUMERIC_WRITE_TAGS,
  OUTPUT_TAGS,
  REGISTER_TAGS,
  SYSTEM_TAGS,
  TIMER_TAGS,
  type CompareOp,
  type Contact,
  type InputKind,
  type LogicNode,
  type MathKind,
  type Operand,
  type OutputKind,
  type OutputNode,
  type Program,
  type Rung,
} from './types';

const CONTACT_TAGS = new Set<string>([
  ...INPUT_TAGS,
  ...OUTPUT_TAGS,
  ...MEMORY_TAGS,
  ...SYSTEM_TAGS,
  ...TIMER_TAGS,
  ...COUNTER_TAGS,
]);
const COIL_TARGETS = new Set<string>([...OUTPUT_TAGS, ...MEMORY_TAGS]);
const LABEL_TAGS = new Set<string>([
  ...CONTACT_TAGS,
  ...REGISTER_TAGS,
  ...ANALOG_IN_TAGS,
  ...ANALOG_OUT_TAGS,
]);
const READ_NUM = new Set<string>(NUMERIC_READ_TAGS);
const WRITE_NUM = new Set<string>(NUMERIC_WRITE_TAGS);
const RETENTIVE_OK = new Set<string>([...MEMORY_TAGS, ...REGISTER_TAGS, ...COUNTER_TAGS]);

const COIL_KINDS = new Set(['coil', 'ncoil', 'set', 'rst']);
const COMPARE_OPS = new Set<string>(['eq', 'ne', 'gt', 'ge', 'lt', 'le']);
const MATH_KINDS = new Set<string>(['add', 'sub', 'mul', 'div']);
const INPUT_KIND_SET = new Set<string>(['toggle', 'pushNA', 'pushNC']);
const OUTPUT_KIND_SET = new Set<string>(['lamp', 'motor']);

type Rec = Record<string, unknown>;
const isRec = (x: unknown): x is Rec => typeof x === 'object' && x !== null && !Array.isArray(x);
const inSet = (set: Set<string>, x: unknown): x is string => typeof x === 'string' && set.has(x);
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const clampInt = (n: number): number => Math.max(-2147483648, Math.min(2147483647, Math.trunc(n)));

function cleanOperand(x: unknown): Operand | null {
  if (!isRec(x)) return null;
  if (x.kind === 'tag' && inSet(READ_NUM, x.tag)) return { kind: 'tag', tag: x.tag };
  if (x.kind === 'const' && finite(x.value)) return { kind: 'const', value: clampInt(x.value) };
  return null;
}

function cleanLogic(x: unknown): LogicNode[] | null {
  if (!Array.isArray(x)) return null;
  const out: LogicNode[] = [];
  for (const n of x) {
    if (!isRec(n) || typeof n.id !== 'string') return null;
    if (n.kind === 'contact') {
      if (!inSet(CONTACT_TAGS, n.tag)) return null;
      const node: Contact = { id: n.id, kind: 'contact', tag: n.tag, nc: n.nc === true };
      if (n.edge === 'rise' || n.edge === 'fall') node.edge = n.edge;
      out.push(node);
    } else if (n.kind === 'compare') {
      const a = cleanOperand(n.a);
      const b = cleanOperand(n.b);
      if (!a || !b || !inSet(COMPARE_OPS, n.op)) return null;
      out.push({ id: n.id, kind: 'compare', op: n.op as CompareOp, a, b });
    } else if (n.kind === 'parallel') {
      if (!Array.isArray(n.branches)) return null;
      const branches: LogicNode[][] = [];
      for (const b of n.branches) {
        const c = cleanLogic(b);
        if (!c) return null;
        branches.push(c);
      }
      out.push({ id: n.id, kind: 'parallel', branches });
    } else return null;
  }
  return out;
}

function cleanOutput(n: unknown): OutputNode | null {
  if (!isRec(n) || typeof n.id !== 'string') return null;
  const preset = finite(n.preset) ? Math.max(0, n.preset) : 0;

  if (typeof n.kind === 'string' && COIL_KINDS.has(n.kind)) {
    if (!inSet(COIL_TARGETS, n.tag)) return null;
    return { id: n.id, kind: n.kind as 'coil' | 'ncoil' | 'set' | 'rst', tag: n.tag };
  }
  if (n.kind === 'ton' || n.kind === 'tof') {
    return inSet(new Set(TIMER_TAGS), n.tag) ? { id: n.id, kind: n.kind, tag: n.tag, preset } : null;
  }
  if (n.kind === 'ctu') {
    return inSet(new Set(COUNTER_TAGS), n.tag) ? { id: n.id, kind: 'ctu', tag: n.tag, preset } : null;
  }
  if (n.kind === 'res') {
    return inSet(new Set([...TIMER_TAGS, ...COUNTER_TAGS]), n.tag) ? { id: n.id, kind: 'res', tag: n.tag } : null;
  }
  if (n.kind === 'mov') {
    const src = cleanOperand(n.src);
    return src && inSet(WRITE_NUM, n.dst) ? { id: n.id, kind: 'mov', src, dst: n.dst } : null;
  }
  if (typeof n.kind === 'string' && MATH_KINDS.has(n.kind)) {
    const a = cleanOperand(n.a);
    const b = cleanOperand(n.b);
    return a && b && inSet(WRITE_NUM, n.dst) ? { id: n.id, kind: n.kind as MathKind, a, b, dst: n.dst } : null;
  }
  if (n.kind === 'scl') {
    const src = cleanOperand(n.src);
    if (!src || !inSet(WRITE_NUM, n.dst)) return null;
    if (!finite(n.inMin) || !finite(n.inMax) || !finite(n.outMin) || !finite(n.outMax)) return null;
    return {
      id: n.id,
      kind: 'scl',
      src,
      dst: n.dst,
      inMin: n.inMin,
      inMax: n.inMax,
      outMin: n.outMin,
      outMax: n.outMax,
    };
  }
  return null;
}

export function sanitizeProgram(data: unknown): Program | null {
  if (!isRec(data) || !Array.isArray(data.rungs)) return null;
  const rungs: Rung[] = [];
  for (const r of data.rungs) {
    if (!isRec(r) || typeof r.id !== 'string' || !Array.isArray(r.outputs)) return null;
    const logic = cleanLogic(r.logic);
    if (!logic) return null;
    const outputs: OutputNode[] = [];
    for (const o of r.outputs) {
      const c = cleanOutput(o);
      if (!c) return null;
      outputs.push(c);
    }
    rungs.push({ id: r.id, comment: typeof r.comment === 'string' ? r.comment : '', logic, outputs });
  }

  const labels: Record<string, string> = {};
  if (isRec(data.labels)) {
    for (const [k, v] of Object.entries(data.labels)) {
      if (LABEL_TAGS.has(k) && typeof v === 'string') labels[k] = v.slice(0, 60);
    }
  }
  const inputKinds: Record<string, InputKind> = DEFAULT_INPUT_KINDS();
  if (isRec(data.inputKinds)) {
    for (const [k, v] of Object.entries(data.inputKinds)) {
      if ((INPUT_TAGS as readonly string[]).includes(k) && typeof v === 'string' && INPUT_KIND_SET.has(v)) {
        inputKinds[k] = v as InputKind;
      }
    }
  }
  const outputKinds: Record<string, OutputKind> = DEFAULT_OUTPUT_KINDS();
  if (isRec(data.outputKinds)) {
    for (const [k, v] of Object.entries(data.outputKinds)) {
      if ((OUTPUT_TAGS as readonly string[]).includes(k) && typeof v === 'string' && OUTPUT_KIND_SET.has(v)) {
        outputKinds[k] = v as OutputKind;
      }
    }
  }
  const retentive = Array.isArray(data.retentive)
    ? Array.from(new Set(data.retentive.filter((t): t is string => inSet(RETENTIVE_OK, t))))
    : [];

  return {
    name: typeof data.name === 'string' ? data.name.slice(0, 80) : 'Programa',
    description: typeof data.description === 'string' ? data.description.slice(0, 1000) : '',
    rungs,
    labels,
    inputKinds,
    outputKinds,
    retentive,
  };
}

/** Aceita o arquivo salvo pelo app ({ app, version, program }) ou o programa "cru". */
export function parseProgram(text: string): Program | null {
  try {
    const data: unknown = JSON.parse(text);
    if (isRec(data) && isRec(data.program)) return sanitizeProgram(data.program);
    return sanitizeProgram(data);
  } catch {
    return null;
  }
}

export function serializeProgram(program: Program): string {
  return JSON.stringify({ app: 'clp-sim', version: 2, program }, null, 2);
}
