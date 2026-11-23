// Operações imutáveis de edição do programa Ladder.
// Todas devolvem um novo Program; o original nunca é alterado.

import {
  COUNTER_TAGS,
  MEMORY_TAGS,
  OUTPUT_TAGS,
  REGISTER_TAGS,
  TIMER_TAGS,
  tagClass,
  uid,
  type LogicNode,
  type OutputNode,
  type Program,
  type Rung,
} from './types';
import { collectTags } from './plc';

/** Onde inserir: 'root' (série principal do degrau) ou `${idDoParalelo}:${indiceDoRamo}`. */
export type ContainerKey = string;

function editIn(
  series: LogicNode[],
  key: ContainerKey,
  fn: (s: LogicNode[]) => LogicNode[],
): LogicNode[] {
  if (key === 'root') return fn(series);
  const sep = key.lastIndexOf(':');
  const pid = key.slice(0, sep);
  const idx = Number(key.slice(sep + 1));
  return series.map((n) => {
    if (n.kind !== 'parallel') return n;
    if (n.id === pid) {
      return { ...n, branches: n.branches.map((b, i) => (i === idx ? fn(b) : b)) };
    }
    return { ...n, branches: n.branches.map((b) => editIn(b, key, fn)) };
  });
}

function removeFrom(series: LogicNode[], id: string): LogicNode[] {
  return series
    .filter((n) => n.id !== id)
    .map((n) =>
      n.kind === 'parallel' ? { ...n, branches: n.branches.map((b) => removeFrom(b, id)) } : n,
    );
}

/** Remove ramos redundantes: grupos com um só ramo viram série; grupos totalmente vazios somem. */
export function normalize(series: LogicNode[]): LogicNode[] {
  const out: LogicNode[] = [];
  for (const n of series) {
    if (n.kind !== 'parallel') {
      out.push(n);
      continue;
    }
    const branches = n.branches.map(normalize);
    if (branches.every((b) => b.length === 0)) continue;
    if (branches.length === 1) {
      out.push(...branches[0]);
      continue;
    }
    out.push({ ...n, branches });
  }
  return out;
}

function patchLogic(series: LogicNode[], id: string, patch: Record<string, unknown>): LogicNode[] {
  return series.map((n) => {
    if (n.id === id) return { ...n, ...patch } as LogicNode;
    if (n.kind === 'parallel') return { ...n, branches: n.branches.map((b) => patchLogic(b, id, patch)) };
    return n;
  });
}

function wrapLogic(series: LogicNode[], id: string): LogicNode[] {
  return series.map((n) => {
    if (n.id === id) {
      if (n.kind === 'parallel') return { ...n, branches: [...n.branches, []] };
      return { id: uid(), kind: 'parallel', branches: [[n], []] } as LogicNode;
    }
    if (n.kind === 'parallel') return { ...n, branches: n.branches.map((b) => wrapLogic(b, id)) };
    return n;
  });
}

function mapRung(program: Program, rungId: string, fn: (r: Rung) => Rung): Program {
  return { ...program, rungs: program.rungs.map((r) => (r.id === rungId ? fn(r) : r)) };
}

export function insertLogic(
  program: Program,
  rungId: string,
  key: ContainerKey,
  index: number,
  node: LogicNode,
): Program {
  return mapRung(program, rungId, (r) => ({
    ...r,
    logic: editIn(r.logic, key, (s) => [...s.slice(0, index), node, ...s.slice(index)]),
  }));
}

export function insertOutput(
  program: Program,
  rungId: string,
  index: number,
  node: OutputNode,
): Program {
  return mapRung(program, rungId, (r) => ({
    ...r,
    outputs: [...r.outputs.slice(0, index), node, ...r.outputs.slice(index)],
  }));
}

/** Remove um contato, um grupo paralelo inteiro ou uma saída, pelo id. */
export function removeNode(program: Program, nodeId: string): Program {
  return {
    ...program,
    rungs: program.rungs.map((r) => ({
      ...r,
      logic: normalize(removeFrom(r.logic, nodeId)),
      outputs: r.outputs.filter((o) => o.id !== nodeId),
    })),
  };
}

export function updateNode(program: Program, nodeId: string, patch: Record<string, unknown>): Program {
  return {
    ...program,
    rungs: program.rungs.map((r) => ({
      ...r,
      logic: patchLogic(r.logic, nodeId, patch),
      outputs: r.outputs.map((o) => (o.id === nodeId ? ({ ...o, ...patch } as OutputNode) : o)),
    })),
  };
}

/** Contato → coloca em paralelo com um ramo vazio. Grupo paralelo → acrescenta um ramo. */
export function wrapInParallel(program: Program, nodeId: string): Program {
  return {
    ...program,
    rungs: program.rungs.map((r) => ({ ...r, logic: wrapLogic(r.logic, nodeId) })),
  };
}

/** Remove o último ramo de um grupo paralelo (e desfaz o grupo se sobrar um só). */
export function removeLastBranch(program: Program, parallelId: string): Program {
  const drop = (series: LogicNode[]): LogicNode[] =>
    series.map((n) => {
      if (n.kind !== 'parallel') return n;
      if (n.id === parallelId) return { ...n, branches: n.branches.slice(0, -1) };
      return { ...n, branches: n.branches.map(drop) };
    });
  return {
    ...program,
    rungs: program.rungs.map((r) => ({ ...r, logic: normalize(drop(r.logic)) })),
  };
}

export function newRung(comment = ''): Rung {
  return { id: uid(), comment, logic: [], outputs: [] };
}

export function addRung(program: Program, afterRungId?: string): Program {
  const rung = newRung();
  if (!afterRungId) return { ...program, rungs: [...program.rungs, rung] };
  const i = program.rungs.findIndex((r) => r.id === afterRungId);
  const rungs = [...program.rungs];
  rungs.splice(i + 1, 0, rung);
  return { ...program, rungs };
}

export function removeRung(program: Program, rungId: string): Program {
  return { ...program, rungs: program.rungs.filter((r) => r.id !== rungId) };
}

export function moveRung(program: Program, rungId: string, dir: -1 | 1): Program {
  const i = program.rungs.findIndex((r) => r.id === rungId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= program.rungs.length) return program;
  const rungs = [...program.rungs];
  [rungs[i], rungs[j]] = [rungs[j], rungs[i]];
  return { ...program, rungs };
}

export function setRungComment(program: Program, rungId: string, comment: string): Program {
  return mapRung(program, rungId, (r) => ({ ...r, comment }));
}

export function setLabel(program: Program, tag: string, label: string): Program {
  const labels = { ...program.labels };
  if (label.trim() === '') delete labels[tag];
  else labels[tag] = label;
  return { ...program, labels };
}

export type Found =
  | { type: 'logic'; node: LogicNode; rungId: string }
  | { type: 'output'; node: OutputNode; rungId: string };

/** Procura um contato, grupo paralelo ou saída pelo id. */
export function findNode(program: Program, id: string): Found | null {
  const search = (series: LogicNode[]): LogicNode | null => {
    for (const n of series) {
      if (n.id === id) return n;
      if (n.kind === 'parallel') {
        for (const b of n.branches) {
          const hit = search(b);
          if (hit) return hit;
        }
      }
    }
    return null;
  };
  for (const r of program.rungs) {
    const l = search(r.logic);
    if (l) return { type: 'logic', node: l, rungId: r.id };
    const o = r.outputs.find((x) => x.id === id);
    if (o) return { type: 'output', node: o, rungId: r.id };
  }
  return null;
}

/** Primeiro endereço livre da lista (ainda não usado no programa), ou o primeiro se todos estiverem em uso. */
export function nextFreeTag(program: Program, kind: 'Q' | 'M' | 'T' | 'C' | 'D'): string {
  const used = collectTags(program);
  const pool: readonly string[] =
    kind === 'Q'
      ? [...OUTPUT_TAGS]
      : kind === 'M'
        ? MEMORY_TAGS
        : kind === 'T'
          ? TIMER_TAGS
          : kind === 'D'
            ? REGISTER_TAGS
            : COUNTER_TAGS;
  return pool.find((t) => !used.has(t)) ?? pool[0];
}

function retagLogic(series: LogicNode[], from: string, to: string): LogicNode[] {
  return series.map((n) => {
    if (n.kind === 'contact') return n.tag === from ? { ...n, tag: to } : n;
    if (n.kind === 'parallel') return { ...n, branches: n.branches.map((b) => retagLogic(b, from, to)) };
    return n;
  });
}

/**
 * Passa a lógica de uma bobina de saída (Q) para uma memória (M) livre:
 * a bobina e todos os contatos que liam o Q passam a usar o M, e um degrau
 * novo logo abaixo copia o M para a saída física. Assim o Q fica só no final.
 */
export function moveCoilToMemory(program: Program, coilId: string): Program {
  const found = findNode(program, coilId);
  if (!found || found.type !== 'output') return program;
  const coil = found.node;
  if (coil.kind !== 'coil' || tagClass(coil.tag) !== 'Q') return program;

  const q = coil.tag;
  const m = nextFreeTag(program, 'M');
  const mirror: Rung = {
    id: uid(),
    comment: 'Saída física',
    logic: [{ id: uid(), kind: 'contact', tag: m, nc: false }],
    outputs: [{ id: uid(), kind: 'coil', tag: q }],
  };

  const rungs: Rung[] = [];
  for (const r of program.rungs) {
    const next: Rung = {
      ...r,
      logic: retagLogic(r.logic, q, m),
      outputs: r.outputs.map((o) => (o.id === coilId ? { ...o, tag: m } : o)),
    };
    rungs.push(next);
    if (r.id === found.rungId) rungs.push(mirror);
  }

  const labels = { ...program.labels };
  if (labels[q] && !labels[m]) labels[m] = `${labels[q]} (comando)`;
  return { ...program, rungs, labels };
}

/** Liga ou desliga a retentividade de um endereço (M, D ou C). */
export function setRetentive(program: Program, tag: string, on: boolean): Program {
  const cls = tagClass(tag);
  if (cls !== 'M' && cls !== 'D' && cls !== 'C') return program;
  const has = program.retentive.includes(tag);
  if (on === has) return program;
  return {
    ...program,
    retentive: on ? [...program.retentive, tag] : program.retentive.filter((t) => t !== tag),
  };
}

/**
 * Degrau que só copia um bit interno (memória, temporizador ou contador) para a
 * saída física: `[M] → (Q)`, `[T0.DN] → (Q)`. É o "Q só no final" que queremos.
 */
function isMirrorRung(r: Rung): boolean {
  if (r.logic.length !== 1) return false;
  const c = r.logic[0];
  if (c.kind !== 'contact' || c.nc || c.edge) return false;
  const cls = tagClass(c.tag);
  return cls === 'M' || cls === 'T' || cls === 'C';
}

/** Ids das bobinas que escrevem direto em uma saída Q com lógica própria (candidatas a ir para memória). */
export function directOutputCoils(program: Program): string[] {
  const ids: string[] = [];
  for (const r of program.rungs) {
    if (isMirrorRung(r)) continue;
    for (const o of r.outputs) if (o.kind === 'coil' && tagClass(o.tag) === 'Q') ids.push(o.id);
  }
  return ids;
}

/** Leva todas as bobinas diretas de saída para memórias, deixando os Q só no final. */
export function moveAllToMemory(program: Program): Program {
  let next = program;
  for (const id of directOutputCoils(program)) next = moveCoilToMemory(next, id);
  return next;
}
