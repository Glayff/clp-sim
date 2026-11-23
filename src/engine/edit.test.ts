import { describe, expect, it } from 'vitest';
import {
  addRung,
  directOutputCoils,
  insertLogic,
  insertOutput,
  moveAllToMemory,
  moveCoilToMemory,
  moveRung,
  nextFreeTag,
  removeLastBranch,
  removeNode,
  setLabel,
  setRetentive,
  updateNode,
  wrapInParallel,
} from './edit';
import { createState, scan } from './plc';
import { COIL, NA, NF, RUNG, TON, emptyProgram } from './examples';
import type { Contact, Parallel, Program, Trace } from './types';

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

describe('mover lógica para memória', () => {
  const direto = (): Program => ({
    ...emptyProgram(),
    rungs: [
      RUNG('partida', [NA('I0'), NF('I1')], [COIL('Q0')]),
      RUNG('usa a saída como condição', [NA('Q0')], [COIL('Q1')]),
    ],
    labels: { Q0: 'Motor' },
  });

  it('a bobina vai para M, um degrau copia M → Q e quem lia Q passa a ler M', () => {
    const p = direto();
    const id = p.rungs[0].outputs[0].id;
    const r = moveCoilToMemory(p, id);
    expect(r.rungs).toHaveLength(3);
    expect(r.rungs[0].outputs[0]).toMatchObject({ kind: 'coil', tag: 'M0' });
    // degrau-espelho logo abaixo do original
    expect(r.rungs[1].logic).toMatchObject([{ kind: 'contact', tag: 'M0', nc: false }]);
    expect(r.rungs[1].outputs).toMatchObject([{ kind: 'coil', tag: 'Q0' }]);
    // o contato que lia Q0 agora lê M0
    expect(r.rungs[2].logic).toMatchObject([{ kind: 'contact', tag: 'M0' }]);
    expect(r.labels.M0).toBe('Motor (comando)');
  });

  it('o comportamento não muda depois de mover', () => {
    const p = direto();
    const r = moveCoilToMemory(p, p.rungs[0].outputs[0].id);
    for (const prog of [p, r]) {
      const state = createState();
      const trace: Trace = new Map();
      scan(prog, state, { I0: true, I1: false }, 10, trace);
      scan(prog, state, { I0: true, I1: false }, 10, trace);
      expect(state.bits.Q0).toBe(true);
      expect(state.bits.Q1).toBe(true);
    }
  });

  it('usa o primeiro M livre e não reaproveita um M já usado', () => {
    const p = direto();
    p.rungs.push(RUNG('', [NA('I2')], [COIL('M0')]));
    const r = moveCoilToMemory(p, p.rungs[0].outputs[0].id);
    expect(r.rungs[0].outputs[0]).toMatchObject({ tag: 'M1' });
  });

  it('ignora bobinas que não são de saída física', () => {
    const p: Program = { ...emptyProgram(), rungs: [RUNG('', [NA('I0')], [COIL('M3')])] };
    expect(moveCoilToMemory(p, p.rungs[0].outputs[0].id)).toBe(p);
    expect(moveCoilToMemory(p, 'inexistente')).toBe(p);
  });

  it('directOutputCoils só aponta Q com lógica própria; cópias de M, T e C ficam de fora', () => {
    const p: Program = {
      ...emptyProgram(),
      rungs: [
        RUNG('direta', [NA('I0')], [COIL('Q0')]),
        RUNG('cópia de M', [NA('M0')], [COIL('Q1')]),
        RUNG('cópia de T', [NA('T0')], [COIL('Q2')]),
        RUNG('cópia de C', [NA('C0')], [COIL('Q3')]),
        RUNG('NF não é cópia', [NF('M0')], [COIL('Q4')]),
        RUNG('memória comum', [NA('I0')], [COIL('M1')]),
      ],
    };
    const ids = directOutputCoils(p);
    expect(ids).toHaveLength(2);
    expect(ids).toContain(p.rungs[0].outputs[0].id);
    expect(ids).toContain(p.rungs[4].outputs[0].id);
  });

  it('moveAllToMemory deixa o programa sem saídas diretas', () => {
    const p: Program = {
      ...emptyProgram(),
      rungs: [RUNG('a', [NA('I0')], [COIL('Q0')]), RUNG('b', [NA('I1'), NA('I2')], [COIL('Q1')])],
    };
    const r = moveAllToMemory(p);
    expect(directOutputCoils(r)).toEqual([]);
    expect(r.rungs).toHaveLength(4);
    const usados = r.rungs.flatMap((x) => x.outputs.map((o) => ('tag' in o ? o.tag : '')));
    expect(usados.filter((t) => t.startsWith('M'))).toEqual(['M0', 'M1']);
  });
});

describe('retentividade no programa', () => {
  it('liga e desliga só para M, D e C, sem duplicar', () => {
    let p = emptyProgram();
    p = setRetentive(p, 'M5', true);
    p = setRetentive(p, 'M5', true);
    p = setRetentive(p, 'D2', true);
    p = setRetentive(p, 'C1', true);
    expect(p.retentive).toEqual(['M5', 'D2', 'C1']);
    p = setRetentive(p, 'M5', false);
    expect(p.retentive).toEqual(['D2', 'C1']);
    const igual = setRetentive(p, 'Q0', true);
    expect(igual).toBe(p);
    expect(setRetentive(p, 'T0', true)).toBe(p);
    expect(setRetentive(p, 'I0', true)).toBe(p);
  });

  it('nextFreeTag para registradores', () => {
    const p: Program = { ...emptyProgram(), rungs: [RUNG('', [NA('S0')], [{ id: 'x', kind: 'mov', src: { kind: 'const', value: 1 }, dst: 'D0' }])] };
    expect(nextFreeTag(p, 'D')).toBe('D1');
    expect(nextFreeTag(emptyProgram(), 'M')).toBe('M0');
  });
});
