// Salvar/abrir programas em JSON, com validação estrutural do que vem de fora.

import { DEFAULT_INPUT_KINDS, DEFAULT_OUTPUT_KINDS } from './examples';
import {
  COUNTER_TAGS,
  INPUT_TAGS,
  MEMORY_TAGS,
  OUTPUT_TAGS,
  TIMER_TAGS,
  type InputKind,
  type LogicNode,
  type OutputKind,
  type OutputNode,
  type Program,
  type Rung,
} from './types';

const VALID_TAGS = new Set<string>([
  ...INPUT_TAGS,
  ...OUTPUT_TAGS,
  ...MEMORY_TAGS,
  ...TIMER_TAGS,
  ...COUNTER_TAGS,
]);
const COIL_KINDS = new Set(['coil', 'ncoil', 'set', 'rst']);
const INPUT_KIND_SET = new Set<string>(['toggle', 'pushNA', 'pushNC']);
const OUTPUT_KIND_SET = new Set<string>(['lamp', 'motor']);

type Rec = Record<string, unknown>;
const isRec = (x: unknown): x is Rec => typeof x === 'object' && x !== null && !Array.isArray(x);
const isTag = (x: unknown): x is string => typeof x === 'string' && VALID_TAGS.has(x);

function cleanLogic(x: unknown): LogicNode[] | null {
  if (!Array.isArray(x)) return null;
  const out: LogicNode[] = [];
  for (const n of x) {
    if (!isRec(n) || typeof n.id !== 'string') return null;
    if (n.kind === 'contact') {
      if (!isTag(n.tag)) return null;
      out.push({ id: n.id, kind: 'contact', tag: n.tag, nc: n.nc === true });
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
  if (!isRec(n) || typeof n.id !== 'string' || !isTag(n.tag)) return null;
  const preset = typeof n.preset === 'number' && Number.isFinite(n.preset) ? Math.max(0, n.preset) : 0;
  if (typeof n.kind === 'string' && COIL_KINDS.has(n.kind)) {
    return { id: n.id, kind: n.kind as 'coil' | 'ncoil' | 'set' | 'rst', tag: n.tag };
  }
  if (n.kind === 'ton' || n.kind === 'tof') return { id: n.id, kind: n.kind, tag: n.tag, preset };
  if (n.kind === 'ctu') return { id: n.id, kind: 'ctu', tag: n.tag, preset };
  if (n.kind === 'res') return { id: n.id, kind: 'res', tag: n.tag };
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
      if (VALID_TAGS.has(k) && typeof v === 'string') labels[k] = v.slice(0, 60);
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

  return {
    name: typeof data.name === 'string' ? data.name.slice(0, 80) : 'Programa',
    description: typeof data.description === 'string' ? data.description.slice(0, 1000) : '',
    rungs,
    labels,
    inputKinds,
    outputKinds,
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
  return JSON.stringify({ app: 'clp-sim', version: 1, program }, null, 2);
}
