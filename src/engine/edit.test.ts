import { describe, expect, it } from 'vitest';
import {
  addRung,
  insertLogic,
  insertOutput,
  moveRung,
  nextFreeTag,
  removeLastBranch,
  removeNode,
  setLabel,
  updateNode,
  wrapInParallel,
} from './edit';
import { COIL, NA, NF, RUNG, TON, emptyProgram } from './examples';
import type { Contact, Parallel, Program } from './types';

function base(): Program {
  return { ...emptyProgram(), rungs: [RUNG('', [], [])] };
}

describe('inserção', () => {
  it('insere contato na série principal na posição indicada', () => {
    let p = base();
    const rid = p.rungs[0].id;
    p = insertLogic(p, rid, 'root', 0, NA('I0'));
    p = insertLogic(p, rid, 'root', 1, NF('I1'));
    p = insertLogic(p, rid, 'root', 1, NA('I2'));
    expect(p.rungs[0].logic.map((n) => (n as Contact).tag)).toEqual(['I0', 'I2', 'I1']);
  });

  it('insere saída', () => {
    let p = base();
    p = insertOutput(p, p.rungs[0].id, 0, COIL('Q0'));
    p = insertOutput(p, p.rungs[0].id, 1, TON('T0', 1000));
    expect(p.rungs[0].outputs.map((o) => o.kind)).toEqual(['coil', 'ton']);
  });

  it('não altera o programa original (imutável)', () => {
    const p = base();
    insertLogic(p, p.rungs[0].id, 'root', 0, NA('I0'));
    expect(p.rungs[0].logic).toHaveLength(0);
  });
});

describe('paralelo', () => {
  function withSeal(): { p: Program; rid: string; a: Contact } {
    let p = base();
    const rid = p.rungs[0].id;
    const a = NA('I0') as Contact;
    p = insertLogic(p, rid, 'root', 0, a);
    p = wrapInParallel(p, a.id);
    return { p, rid, a };
  }

  it('envolver um contato cria um grupo [[contato], []]', () => {
    const { p, a } = withSeal();
    const g = p.rungs[0].logic[0] as Parallel;
    expect(g.kind).toBe('parallel');
    expect(g.branches).toHaveLength(2);
    expect(g.branches[0][0].id).toBe(a.id);
    expect(g.branches[1]).toEqual([]);
  });

  it('insere contato no ramo vazio', () => {
    const { p, rid } = withSeal();
    const g = p.rungs[0].logic[0] as Parallel;
    const q = insertLogic(p, rid, `${g.id}:1`, 0, NA('Q0'));
    const g2 = q.rungs[0].logic[0] as Parallel;
    expect((g2.branches[1][0] as Contact).tag).toBe('Q0');
  });

  it('envolver um grupo existente acrescenta um ramo', () => {
    const { p } = withSeal();
    const g = p.rungs[0].logic[0] as Parallel;
    const q = wrapInParallel(p, g.id);
    expect((q.rungs[0].logic[0] as Parallel).branches).toHaveLength(3);
  });

  it('remover o último ramo desfaz o grupo e devolve o contato à série', () => {
    const { p, a } = withSeal();
    const g = p.rungs[0].logic[0] as Parallel;
    const q = removeLastBranch(p, g.id);
    expect(q.rungs[0].logic).toHaveLength(1);
    expect(q.rungs[0].logic[0].id).toBe(a.id);
  });

  it('apagar o único contato de um ramo mantém o grupo; apagar todos os conteúdos remove o grupo', () => {
    let { p, rid } = withSeal();
    const g = p.rungs[0].logic[0] as Parallel;
    p = insertLogic(p, rid, `${g.id}:1`, 0, NA('Q0'));
    const g1 = p.rungs[0].logic[0] as Parallel;
    const q0 = g1.branches[1][0];

    // apaga o contato do ramo inferior: ramo fica vazio, mas o grupo permanece (2 ramos)
    const afterOne = removeNode(p, q0.id);
    expect((afterOne.rungs[0].logic[0] as Parallel).branches[1]).toEqual([]);

    // apaga também o do ramo superior: tudo vazio => grupo some
    const afterBoth = removeNode(afterOne, g1.branches[0][0].id);
    expect(afterBoth.rungs[0].logic).toEqual([]);
  });

  it('remover o grupo inteiro pelo id', () => {
    const { p } = withSeal();
    const g = p.rungs[0].logic[0] as Parallel;
    expect(removeNode(p, g.id).rungs[0].logic).toEqual([]);
  });

  it('suporta grupos aninhados (inserir dentro do ramo de um grupo interno)', () => {
    let { p, rid } = withSeal();
    const outer = p.rungs[0].logic[0] as Parallel;
    const inner = outer.branches[0][0] as Contact;
    p = wrapInParallel(p, inner.id); // [[ [contato],[] ], []]
    const nested = (p.rungs[0].logic[0] as Parallel).branches[0][0] as Parallel;
    expect(nested.kind).toBe('parallel');
    p = insertLogic(p, rid, `${nested.id}:1`, 0, NF('I5'));
    const n2 = (p.rungs[0].logic[0] as Parallel).branches[0][0] as Parallel;
    expect((n2.branches[1][0] as Contact).tag).toBe('I5');
  });
});

describe('atualização e remoção', () => {
  it('updateNode altera contato e saída pelo id', () => {
    let p = base();
    const rid = p.rungs[0].id;
    const c = NA('I0');
    const t = TON('T0', 1000);
    p = insertLogic(p, rid, 'root', 0, c);
    p = insertOutput(p, rid, 0, t);
    p = updateNode(p, c.id, { tag: 'I4', nc: true });
    p = updateNode(p, t.id, { preset: 2500 });
    expect(p.rungs[0].logic[0]).toMatchObject({ tag: 'I4', nc: true });
    expect(p.rungs[0].outputs[0]).toMatchObject({ preset: 2500 });
  });

  it('removeNode apaga saída', () => {
    let p = base();
    const o = COIL('Q0');
    p = insertOutput(p, p.rungs[0].id, 0, o);
    expect(removeNode(p, o.id).rungs[0].outputs).toEqual([]);
  });
});

describe('degraus e rótulos', () => {
  it('adiciona, move e rotula', () => {
    let p = base();
    p = addRung(p);
    p = addRung(p, p.rungs[0].id);
    expect(p.rungs).toHaveLength(3);
    const ids = p.rungs.map((r) => r.id);
    p = moveRung(p, ids[0], 1);
    expect(p.rungs[1].id).toBe(ids[0]);
    expect(moveRung(p, p.rungs[0].id, -1)).toBe(p); // fora dos limites: sem mudança

    p = setLabel(p, 'I0', 'Botão');
    expect(p.labels.I0).toBe('Botão');
    p = setLabel(p, 'I0', '  ');
    expect(p.labels.I0).toBeUndefined();
  });

  it('nextFreeTag escolhe o primeiro endereço ainda não usado', () => {
    let p = base();
    p = insertOutput(p, p.rungs[0].id, 0, TON('T0', 1000));
    p = insertOutput(p, p.rungs[0].id, 1, COIL('Q0'));
    expect(nextFreeTag(p, 'T')).toBe('T1');
    expect(nextFreeTag(p, 'Q')).toBe('Q1');
    expect(nextFreeTag(p, 'C')).toBe('C0');
  });
});
