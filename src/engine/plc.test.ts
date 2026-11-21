import { describe, expect, it } from 'vitest';
import { collectPresets, createState, readTag, scan, validate } from './plc';
import { COIL, CTU, EXAMPLES, NA, NF, PAR, RES, RUNG, TOF, TON, emptyProgram } from './examples';
import type { Program, Trace } from './types';

const DT = 10;

/** Pequeno banco de ensaio: executa varreduras com entradas controladas. */
function bench(program: Program) {
  const state = createState();
  const trace: Trace = new Map();
  const inputs: Record<string, boolean> = { I1: true }; // I1 = botão NF em repouso => nível 1
  return {
    state,
    trace,
    inputs,
    run(ms: number) {
      const n = Math.round(ms / DT);
      for (let i = 0; i < n; i++) scan(program, state, inputs, DT, trace);
    },
    q: (tag: string) => state.bits[tag],
  };
}

function withRungs(...rungs: ReturnType<typeof RUNG>[]): Program {
  return { ...emptyProgram(), rungs };
}

describe('contatos e bobinas', () => {
  it('contato NA liga a bobina e NF inverte', () => {
    const p = withRungs(RUNG('', [NA('I2')], [COIL('Q0')]), RUNG('', [NF('I2')], [COIL('Q1')]));
    const b = bench(p);
    b.run(DT);
    expect(b.q('Q0')).toBe(false);
    expect(b.q('Q1')).toBe(true);
    b.inputs.I2 = true;
    b.run(DT);
    expect(b.q('Q0')).toBe(true);
    expect(b.q('Q1')).toBe(false);
  });

  it('bobina negada, SET e RESET', () => {
    const p = withRungs(
      RUNG('', [NA('I2')], [COIL('Q0', 'ncoil')]),
      RUNG('', [NA('I3')], [COIL('Q1', 'set')]),
      RUNG('', [NA('I4')], [COIL('Q1', 'rst')]),
    );
    const b = bench(p);
    b.run(DT);
    expect(b.q('Q0')).toBe(true); // negada: sem energia => liga
    b.inputs.I3 = true;
    b.run(DT);
    b.inputs.I3 = false;
    b.run(DT);
    expect(b.q('Q1')).toBe(true); // SET mantém depois do pulso
    b.inputs.I4 = true;
    b.run(DT);
    expect(b.q('Q1')).toBe(false);
  });

  it('degrau sem lógica fica sempre energizado', () => {
    const b = bench(withRungs(RUNG('', [], [COIL('M0')])));
    b.run(DT);
    expect(b.state.bits.M0).toBe(true);
  });
});

describe('partida com selo', () => {
  const build = () => EXAMPLES.find((e) => e.id === 'partida-selo')!.build();

  it('liga, mantém após soltar e desliga com o botão NF', () => {
    const b = bench(build());
    b.run(100);
    expect(b.q('Q0')).toBe(false);

    b.inputs.I0 = true; // aperta LIGA
    b.run(DT);
    expect(b.q('Q0')).toBe(true);
    b.inputs.I0 = false; // solta LIGA
    b.run(200);
    expect(b.q('Q0')).toBe(true); // selo mantém

    b.inputs.I1 = false; // aperta DESLIGA (NF abre => nível 0)
    b.run(DT);
    expect(b.q('Q0')).toBe(false);
    b.inputs.I1 = true; // solta
    b.run(200);
    expect(b.q('Q0')).toBe(false); // não religa sozinho
  });

  it('o sinaleiro Q1 acompanha o motor', () => {
    const b = bench(build());
    b.inputs.I0 = true;
    b.run(DT);
    expect(b.q('Q1')).toBe(true);
  });

  it('fio rompido na botoeira de desligar (nível 0) impede a partida', () => {
    const b = bench(build());
    b.inputs.I1 = false;
    b.inputs.I0 = true;
    b.run(100);
    expect(b.q('Q0')).toBe(false);
  });
});

describe('temporizadores', () => {
  it('TON só liga depois do preset e zera ao perder a energia', () => {
    const p = withRungs(RUNG('', [NA('I2')], [TON('T0', 3000)]), RUNG('', [NA('T0')], [COIL('Q0')]));
    const b = bench(p);
    b.inputs.I2 = true;
    b.run(2900);
    expect(b.q('Q0')).toBe(false);
    b.run(100);
    expect(b.q('Q0')).toBe(true);
    expect(b.state.timers.T0.acc).toBe(3000);

    b.inputs.I2 = false;
    b.run(DT);
    expect(b.q('Q0')).toBe(false);
    expect(b.state.timers.T0.acc).toBe(0);
  });

  it('TON interrompido antes do tempo recomeça do zero', () => {
    const p = withRungs(RUNG('', [NA('I2')], [TON('T0', 1000)]));
    const b = bench(p);
    b.inputs.I2 = true;
    b.run(900);
    b.inputs.I2 = false;
    b.run(DT);
    b.inputs.I2 = true;
    b.run(900);
    expect(b.state.timers.T0.dn).toBe(false);
    b.run(100);
    expect(b.state.timers.T0.dn).toBe(true);
  });

  it('TOF liga na hora e desliga após o preset', () => {
    const p = withRungs(RUNG('', [NA('I2')], [TOF('T0', 2000)]), RUNG('', [NA('T0')], [COIL('Q0')]));
    const b = bench(p);
    b.run(DT);
    expect(b.q('Q0')).toBe(false); // sem energia desde o início
    b.inputs.I2 = true;
    b.run(DT);
    expect(b.q('Q0')).toBe(true);
    b.inputs.I2 = false;
    b.run(1900);
    expect(b.q('Q0')).toBe(true);
    b.run(100);
    expect(b.q('Q0')).toBe(false);
  });

  it('pisca-pisca alterna a saída a cada ~1 s', () => {
    const b = bench(EXAMPLES.find((e) => e.id === 'pisca')!.build());
    b.inputs.I2 = true;
    const samples: boolean[] = [];
    for (let s = 0; s < 8; s++) {
      b.run(500);
      samples.push(b.q('Q0'));
    }
    // 4 s => dois ciclos completos: apagada 1 s, acesa 1 s
    expect(samples).toContain(true);
    expect(samples).toContain(false);
    const transitions = samples.filter((v, i) => i > 0 && v !== samples[i - 1]).length;
    expect(transitions).toBeGreaterThanOrEqual(3);
  });
});

describe('contador', () => {
  const build = () => EXAMPLES.find((e) => e.id === 'contador')!.build();

  it('conta só bordas de subida e liga o DN no preset', () => {
    const b = bench(build());
    for (let i = 0; i < 4; i++) {
      b.inputs.I0 = true;
      b.run(50); // sinal alto por vários ciclos conta uma vez só
      b.inputs.I0 = false;
      b.run(50);
    }
    expect(b.state.counters.C0.acc).toBe(4);
    expect(b.q('Q0')).toBe(false);
    b.inputs.I0 = true;
    b.run(DT);
    expect(b.state.counters.C0.acc).toBe(5);
    expect(b.q('Q0')).toBe(true);
  });

  it('RES zera a contagem e o DN', () => {
    const b = bench(build());
    for (let i = 0; i < 5; i++) {
      b.inputs.I0 = true;
      b.run(DT);
      b.inputs.I0 = false;
      b.run(DT);
    }
    expect(b.q('Q0')).toBe(true);
    b.inputs.I3 = true;
    b.run(DT);
    b.run(DT);
    expect(b.state.counters.C0.acc).toBe(0);
    expect(b.q('Q0')).toBe(false);
  });
});

describe('estrela-triângulo', () => {
  it('segue a sequência K1+K2 → tempo morto → K1+K3, sem sobreposição', () => {
    const b = bench(EXAMPLES.find((e) => e.id === 'estrela-triangulo')!.build());
    b.inputs.I0 = true;
    b.run(DT);
    b.inputs.I0 = false;

    let overlap = false;
    const watch = (ms: number) => {
      for (let t = 0; t < ms; t += DT) {
        b.run(DT);
        if (b.q('Q1') && b.q('Q2')) overlap = true;
      }
    };

    watch(4000);
    expect(b.q('Q0')).toBe(true);
    expect(b.q('Q1')).toBe(true);
    expect(b.q('Q2')).toBe(false);

    watch(1100); // passa dos 5 s e do tempo morto de 100 ms
    expect(b.q('Q0')).toBe(true);
    expect(b.q('Q1')).toBe(false);
    expect(b.q('Q2')).toBe(true);
    expect(overlap).toBe(false);

    b.inputs.I1 = false; // DESLIGA
    b.run(DT);
    expect(b.q('Q0')).toBe(false);
    expect(b.q('Q1')).toBe(false);
    expect(b.q('Q2')).toBe(false);
  });

  it('há um intervalo em que K2 e K3 estão desligados (tempo morto)', () => {
    const b = bench(EXAMPLES.find((e) => e.id === 'estrela-triangulo')!.build());
    b.inputs.I0 = true;
    b.run(DT);
    b.inputs.I0 = false;
    let dead = false;
    for (let t = 0; t < 6000; t += DT) {
      b.run(DT);
      if (b.q('Q0') && !b.q('Q1') && !b.q('Q2')) dead = true;
    }
    expect(dead).toBe(true);
  });
});

describe('ramos em paralelo', () => {
  it('OU entre ramos e energia aninhada', () => {
    const p = withRungs(
      RUNG('', [PAR([NA('I2')], [NA('I3'), NA('I4')])], [COIL('Q0')]),
    );
    const b = bench(p);
    b.run(DT);
    expect(b.q('Q0')).toBe(false);
    b.inputs.I2 = true;
    b.run(DT);
    expect(b.q('Q0')).toBe(true);
    b.inputs.I2 = false;
    b.inputs.I3 = true;
    b.run(DT);
    expect(b.q('Q0')).toBe(false); // só um dos dois contatos do ramo inferior
    b.inputs.I4 = true;
    b.run(DT);
    expect(b.q('Q0')).toBe(true);
  });

  it('ramo vazio é um fio (curto-circuito)', () => {
    const p = withRungs(RUNG('', [PAR([NA('I2')], [])], [COIL('Q0')]));
    const b = bench(p);
    b.run(DT);
    expect(b.q('Q0')).toBe(true);
  });
});

describe('rastro de energia e utilidades', () => {
  it('registra pin/pout de cada elemento', () => {
    const p = withRungs(RUNG('', [NA('I2'), NA('I3')], [COIL('Q0')]));
    const b = bench(p);
    b.inputs.I2 = true;
    b.run(DT);
    const [c1, c2] = p.rungs[0].logic;
    expect(b.trace.get(c1.id)).toEqual({ pin: true, pout: true });
    expect(b.trace.get(c2.id)).toEqual({ pin: true, pout: false });
    expect(b.trace.get(p.rungs[0].outputs[0].id)?.pin).toBe(false);
  });

  it('readTag lê DN de temporizadores e contadores', () => {
    const s = createState();
    s.timers.T0.dn = true;
    s.counters.C1.dn = true;
    expect(readTag(s, 'T0')).toBe(true);
    expect(readTag(s, 'C1')).toBe(true);
    expect(readTag(s, 'T1')).toBe(false);
  });

  it('collectPresets lista presets do programa', () => {
    const p = withRungs(RUNG('', [], [TON('T0', 1500), CTU('C2', 7), RES('C2')]));
    expect(collectPresets(p)).toEqual({ T0: 1500, C2: 7 });
  });
});

describe('validação', () => {
  it('avisa bobina duplicada em degraus diferentes', () => {
    const p = withRungs(RUNG('', [NA('I2')], [COIL('Q0')]), RUNG('', [NA('I3')], [COIL('Q0')]));
    const w = validate(p);
    expect(w).toHaveLength(1);
    expect(w[0].rungId).toBe(p.rungs[1].id);
    expect(w[0].message).toMatch(/Q0/);
  });

  it('SET e RESET na mesma tag não são duplicidade', () => {
    const p = withRungs(RUNG('', [NA('I2')], [COIL('Q0', 'set')]), RUNG('', [NA('I3')], [COIL('Q0', 'rst')]));
    expect(validate(p)).toHaveLength(0);
  });

  it('avisa contato de temporizador inexistente e RES órfão', () => {
    const p = withRungs(RUNG('', [NA('T3')], [COIL('Q0')]), RUNG('', [NA('I2')], [RES('C4')]));
    expect(validate(p)).toHaveLength(2);
  });

  it('todos os exemplos embutidos são válidos', () => {
    for (const ex of EXAMPLES) expect(validate(ex.build()), ex.title).toEqual([]);
  });
});
