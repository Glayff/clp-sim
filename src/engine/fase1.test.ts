import { describe, expect, it } from 'vitest';
import { createState, operandValue, restartState, scan, validate, type Forces } from './plc';
import {
  ADD,
  CMP,
  COIL,
  DIV,
  EXAMPLES,
  K,
  MOV,
  MUL,
  NA,
  NF,
  PAR,
  PDN,
  PUP,
  R,
  RES,
  RUNG,
  SCL,
  SUB,
  CTU,
  emptyProgram,
} from './examples';
import { directOutputCoils } from './edit';
import { ANALOG_FULL_SCALE, type PlcState, type Program, type Trace } from './types';

const DT = 10;

/** Banco de ensaio com entradas digitais, analógicas e forçamentos controlados. */
function bench(program: Program, state: PlcState = createState()) {
  const trace: Trace = new Map();
  const inputs: Record<string, boolean> = {};
  const analog: Record<string, number> = {};
  const forces: Forces = {};
  return {
    state,
    trace,
    inputs,
    analog,
    forces,
    scans(n: number) {
      for (let i = 0; i < n; i++) scan(program, state, inputs, DT, trace, { analog, forces });
    },
    run(ms: number) {
      this.scans(Math.round(ms / DT));
    },
    bit: (t: string) => state.bits[t],
    reg: (t: string) => state.regs[t],
  };
}

const withRungs = (...rungs: ReturnType<typeof RUNG>[]): Program => ({ ...emptyProgram(), rungs });

describe('comparadores', () => {
  it.each([
    ['eq', 5, 5, true],
    ['eq', 5, 6, false],
    ['ne', 5, 6, true],
    ['gt', 6, 5, true],
    ['gt', 5, 5, false],
    ['ge', 5, 5, true],
    ['lt', 4, 5, true],
    ['lt', 5, 5, false],
    ['le', 5, 5, true],
  ] as const)('%s com D0=%i e constante %i dá %s', (op, d0, k, esperado) => {
    const b = bench(withRungs(RUNG('', [CMP(op, R('D0'), K(k))], [COIL('M0')])));
    b.state.regs.D0 = d0;
    b.scans(1);
    expect(b.bit('M0')).toBe(esperado);
  });

  it('compara dois registradores e o acumulado de um temporizador', () => {
    const p = withRungs(
      RUNG('', [CMP('gt', R('D0'), R('D1'))], [COIL('M0')]),
      RUNG('', [NA('S0')], [{ id: 'ton', kind: 'ton', tag: 'T0', preset: 5000 }]),
      RUNG('', [CMP('ge', R('T0.ACC'), K(100))], [COIL('M1')]),
    );
    const b = bench(p);
    b.state.regs.D0 = 3;
    b.state.regs.D1 = 2;
    b.run(50);
    expect(b.bit('M0')).toBe(true);
    expect(b.bit('M1')).toBe(false);
    b.run(100);
    expect(b.bit('M1')).toBe(true);
  });
});

describe('contatos de borda', () => {
  const prog = withRungs(
    RUNG('', [PUP('I0')], [COIL('M0')]),
    RUNG('', [PDN('I0')], [COIL('M1')]),
    RUNG('', [PUP('I0')], [CTU('C0', 99)]),
  );

  it('P dura exatamente uma varredura ao ligar; N ao desligar', () => {
    const b = bench(prog);
    b.scans(3);
    expect(b.bit('M0') || b.bit('M1')).toBe(false);
    b.inputs.I0 = true;
    b.scans(1);
    expect(b.bit('M0')).toBe(true);
    b.scans(1);
    expect(b.bit('M0')).toBe(false); // segurando o botão não repete
    b.inputs.I0 = false;
    b.scans(1);
    expect(b.bit('M1')).toBe(true);
    b.scans(1);
    expect(b.bit('M1')).toBe(false);
  });

  it('não gera borda falsa na primeira varredura com a entrada já ligada', () => {
    const b = bench(prog);
    b.inputs.I0 = true;
    b.scans(1);
    expect(b.bit('M0')).toBe(false);
  });

  it('conta uma vez por pressionamento', () => {
    const b = bench(prog);
    b.scans(2);
    for (let i = 0; i < 4; i++) {
      b.inputs.I0 = true;
      b.scans(5);
      b.inputs.I0 = false;
      b.scans(5);
    }
    expect(b.state.counters.C0.acc).toBe(4);
  });
});

describe('MOV, matemática e escala', () => {
  it('MOV copia constante e registrador', () => {
    const b = bench(withRungs(RUNG('', [NA('S0')], [MOV(K(42), 'D0'), MOV(R('D0'), 'D1')])));
    b.scans(1);
    expect(b.reg('D0')).toBe(42);
    expect(b.reg('D1')).toBe(42);
  });

  it('só executa com o degrau energizado', () => {
    const b = bench(withRungs(RUNG('', [NA('I0')], [MOV(K(7), 'D0')])));
    b.scans(2);
    expect(b.reg('D0')).toBe(0);
    b.inputs.I0 = true;
    b.scans(1);
    expect(b.reg('D0')).toBe(7);
  });

  it('ADD, SUB, MUL e DIV (divisão inteira)', () => {
    const b = bench(
      withRungs(
        RUNG('', [NA('S0')], [
          MOV(K(17), 'D0'),
          ADD(R('D0'), K(3), 'D1'),
          SUB(R('D0'), K(20), 'D2'),
          MUL(R('D0'), K(2), 'D3'),
          DIV(R('D0'), K(5), 'D4'),
        ]),
      ),
    );
    b.scans(1);
    expect([b.reg('D1'), b.reg('D2'), b.reg('D3'), b.reg('D4')]).toEqual([20, -3, 34, 3]);
  });

  it('ADD acumula a cada varredura quando o degrau fica energizado', () => {
    const b = bench(withRungs(RUNG('', [NA('S0')], [ADD(R('D0'), K(1), 'D0')])));
    b.scans(10);
    expect(b.reg('D0')).toBe(10);
  });

  it('divisão por zero não derruba nada e deixa o destino como estava', () => {
    const b = bench(withRungs(RUNG('', [NA('S0')], [MOV(K(9), 'D0'), DIV(K(5), K(0), 'D0')])));
    b.scans(3);
    expect(b.reg('D0')).toBe(9);
  });

  it('estouro de 32 bits dá a volta, como num CLP de verdade', () => {
    const b = bench(withRungs(RUNG('', [NA('S0')], [ADD(R('D0'), K(1), 'D0')])));
    b.state.regs.D0 = 2147483647;
    b.scans(1);
    expect(b.reg('D0')).toBe(-2147483648);
  });

  it('SCL converte 0–27648 em 0–100 % e limita fora da faixa', () => {
    const b = bench(withRungs(RUNG('', [NA('S0')], [SCL(R('AI0'), 'D0', 0, ANALOG_FULL_SCALE, 0, 100)])));
    for (const [raw, pct] of [
      [0, 0],
      [ANALOG_FULL_SCALE / 2, 50],
      [ANALOG_FULL_SCALE, 100],
      [32767, 100], // acima do fim de escala: limitado
    ]) {
      b.analog.AI0 = raw;
      b.scans(1);
      expect(b.reg('D0'), `AI0=${raw}`).toBe(pct);
    }
  });

  it('SCL aceita faixa invertida e arredonda', () => {
    const b = bench(withRungs(RUNG('', [NA('S0')], [SCL(R('AI0'), 'D0', 0, 100, 100, 0)])));
    b.analog.AI0 = 25;
    b.scans(1);
    expect(b.reg('D0')).toBe(75);
  });

  it('saída analógica fica entre 0 e 27648', () => {
    const b = bench(withRungs(RUNG('', [NA('S0')], [MOV(K(99999), 'AQ0'), MOV(K(-5), 'AQ1')])));
    b.scans(1);
    expect(b.reg('AQ0')).toBe(ANALOG_FULL_SCALE);
    expect(b.reg('AQ1')).toBe(0);
  });

  it('operandValue lê constante, registrador e acumulado', () => {
    const s = createState();
    s.regs.D5 = 8;
    s.timers.T1.acc = 1234;
    expect(operandValue(s, K(3))).toBe(3);
    expect(operandValue(s, R('D5'))).toBe(8);
    expect(operandValue(s, R('T1.ACC'))).toBe(1234);
  });
});

describe('bits de sistema', () => {
  it('S0 fica sempre ligado e S1 só na primeira varredura', () => {
    const b = bench(withRungs(RUNG('', [NA('S0')], [COIL('M0')]), RUNG('', [NA('S1')], [ADD(R('D0'), K(1), 'D0')])));
    b.scans(50);
    expect(b.bit('M0')).toBe(true);
    expect(b.reg('D0')).toBe(1);
  });

  it('S3 pisca a 1 Hz (500 ms ligado, 500 ms desligado)', () => {
    const b = bench(withRungs(RUNG('', [NA('S3')], [COIL('M0')])));
    const seen: boolean[] = [];
    for (let i = 0; i < 200; i++) {
      b.scans(1);
      seen.push(b.bit('M0'));
    }
    expect(seen.slice(0, 50).every(Boolean)).toBe(true);
    expect(seen.slice(50, 100).some(Boolean)).toBe(false);
    expect(seen.slice(100, 150).every(Boolean)).toBe(true);
  });

  it('S2 é o dobro da frequência de S3 e S4 é a metade', () => {
    const b = bench(withRungs(RUNG('', [NA('S2')], [COIL('M0')]), RUNG('', [NA('S4')], [COIL('M1')])));
    let m0 = 0;
    let m1 = 0;
    for (let i = 0; i < 400; i++) {
      b.scans(1);
      if (i > 0 && b.bit('M0') !== (b.state.timeMs - DT) % 500 < 250) throw new Error('S2 fora de fase');
      if (b.bit('M0')) m0++;
      if (b.bit('M1')) m1++;
    }
    expect(m0).toBe(200); // 50 % de 4 s
    expect(m1).toBe(200);
  });
});

describe('forçamento', () => {
  it('forçar um bit de memória ignora o que o programa escreve', () => {
    const b = bench(withRungs(RUNG('', [NA('I0')], [COIL('M0')])));
    b.forces.M0 = true;
    b.scans(3);
    expect(b.bit('M0')).toBe(true); // I0 está em 0, mas M0 está forçado em 1
    b.forces.M0 = false;
    b.inputs.I0 = true;
    b.scans(3);
    expect(b.bit('M0')).toBe(false);
  });

  it('forçar uma entrada vale para o resto do programa', () => {
    const b = bench(withRungs(RUNG('', [NA('I3')], [COIL('M0')])));
    b.forces.I3 = true;
    b.scans(1);
    expect(b.bit('M0')).toBe(true);
  });

  it('forçar um registrador numérico', () => {
    const b = bench(withRungs(RUNG('', [CMP('gt', R('D0'), K(50))], [COIL('M0')]), RUNG('', [NA('S0')], [MOV(K(1), 'D0')])));
    b.forces.D0 = 80;
    b.scans(2);
    expect(b.reg('D0')).toBe(80);
    expect(b.bit('M0')).toBe(true);
  });

  it('forçar uma entrada analógica sobrepõe o sensor', () => {
    const b = bench(withRungs(RUNG('', [NA('S0')], [SCL(R('AI0'), 'D0', 0, ANALOG_FULL_SCALE, 0, 100)])));
    b.analog.AI0 = 0;
    b.forces.AI0 = ANALOG_FULL_SCALE;
    b.scans(1);
    expect(b.reg('D0')).toBe(100);
  });

  it('soltar o forçamento devolve o controle ao programa', () => {
    const b = bench(withRungs(RUNG('', [NA('I0')], [COIL('M0')])));
    b.forces.M0 = true;
    b.scans(2);
    delete b.forces.M0;
    b.scans(1);
    expect(b.bit('M0')).toBe(false);
  });
});

describe('retentividade (STOP → RUN)', () => {
  it('sem retentivos, STOP zera tudo', () => {
    const b = bench(withRungs(RUNG('', [NA('S0')], [ADD(R('D0'), K(1), 'D0'), COIL('M0')])));
    b.scans(5);
    const depois = restartState(b.state, []);
    expect(depois.regs.D0).toBe(0);
    expect(depois.bits.M0).toBe(false);
  });

  it('M, D e C marcados como retentivos mantêm o valor; o resto zera', () => {
    const p = withRungs(
      RUNG('', [NA('S0')], [ADD(R('D0'), K(1), 'D0'), ADD(R('D1'), K(1), 'D1'), COIL('M0'), COIL('M1')]),
      RUNG('', [NA('S0')], [CTU('C0', 99)]),
    );
    const b = bench(p);
    b.scans(5);
    const s = restartState(b.state, ['D0', 'M0', 'C0']);
    expect(s.regs.D0).toBe(5);
    expect(s.regs.D1).toBe(0);
    expect(s.bits.M0).toBe(true);
    expect(s.bits.M1).toBe(false);
    expect(s.counters.C0.acc).toBe(b.state.counters.C0.acc);
    expect(s.scans).toBe(0); // primeira varredura de novo: S1 volta a valer
  });

  it('entradas, saídas e temporizadores nunca são retentivos', () => {
    const b = bench(withRungs(RUNG('', [NA('S0')], [COIL('Q0')])));
    b.scans(2);
    const s = restartState(b.state, ['Q0', 'I0', 'T0']);
    expect(s.bits.Q0).toBe(false);
  });

  it('exemplo "partidas": a contagem sobrevive ao STOP e o S1 conta de novo', () => {
    const ex = EXAMPLES.find((e) => e.id === 'partidas')!.build();
    let state = createState();
    for (let partida = 1; partida <= 6; partida++) {
      const b = bench(ex, state);
      b.scans(5);
      expect(b.reg('D0'), `partida ${partida}`).toBe(partida);
      expect(b.bit('Q0')).toBe(partida > 4);
      state = restartState(b.state, ex.retentive);
    }
  });
});

describe('exemplos com memória', () => {
  const get = (id: string) => EXAMPLES.find((e) => e.id === id)!.build();

  it('todos os exemplos são válidos e deixam o Q só no final (sem saída direta)', () => {
    for (const ex of EXAMPLES) {
      const p = ex.build();
      expect(validate(p), ex.title).toEqual([]);
      expect(directOutputCoils(p), `${ex.title}: bobinas diretas em Q`).toEqual([]);
    }
  });

  it('cada Q é escrito uma única vez, e só por cópia de memória', () => {
    for (const ex of EXAMPLES) {
      const p = ex.build();
      const escritas: Record<string, number> = {};
      for (const r of p.rungs)
        for (const o of r.outputs)
          if ((o.kind === 'coil' || o.kind === 'ncoil') && o.tag.startsWith('Q')) escritas[o.tag] = (escritas[o.tag] ?? 0) + 1;
      for (const [q, n] of Object.entries(escritas)) expect(n, `${ex.title}: ${q}`).toBe(1);
    }
  });

  it('tanque: histerese entre 20 % e 80 % e emergência', () => {
    const b = bench(get('tanque'));
    b.inputs.I1 = true; // emergência (NF) em repouso
    const nivel = (pct: number) => {
      b.analog.AI0 = Math.round((pct / 100) * ANALOG_FULL_SCALE);
      b.scans(3);
    };
    nivel(10);
    expect(b.bit('Q0')).toBe(true); // abaixo de 20 %: bomba liga
    nivel(50);
    expect(b.bit('Q0')).toBe(true); // histerese: continua ligada
    nivel(80);
    expect(b.bit('Q0')).toBe(false); // chegou em 80 %: desliga
    nivel(50);
    expect(b.bit('Q0')).toBe(false); // e continua desligada na faixa do meio
    nivel(10);
    expect(b.bit('Q0')).toBe(true);
    b.inputs.I1 = false; // aperta a emergência
    b.scans(3);
    expect(b.bit('Q0')).toBe(false);
    nivel(98);
    expect(b.bit('Q1')).toBe(true); // alarme de nível muito alto
    nivel(90);
    expect(b.bit('Q1')).toBe(false);
  });

  it('liga/desliga por borda: cada toque no botão inverte a saída', () => {
    const b = bench(get('toggle-borda'));
    b.scans(2);
    const toque = () => {
      b.inputs.I0 = true;
      b.scans(4);
      b.inputs.I0 = false;
      b.scans(4);
    };
    expect(b.bit('Q0')).toBe(false);
    toque();
    expect(b.bit('Q0')).toBe(true);
    toque();
    expect(b.bit('Q0')).toBe(false);
    toque();
    expect(b.bit('Q0')).toBe(true);
  });

  it('SET/RESET: SET liga e mantém, RESET desliga', () => {
    const b = bench(get('set-reset'));
    b.inputs.I0 = true;
    b.scans(2);
    b.inputs.I0 = false;
    b.scans(2);
    expect(b.bit('Q0')).toBe(true);
    b.inputs.I3 = true;
    b.scans(2);
    expect(b.bit('Q0')).toBe(false);
  });

  it('clock: as três saídas piscam em 2, 1 e 0,5 Hz quando habilitadas por I2', () => {
    const b = bench(get('clock'));
    b.scans(5);
    expect(b.bit('Q0') || b.bit('Q1') || b.bit('Q2')).toBe(false); // sem habilitar
    b.inputs.I2 = true;
    const onTime = { Q0: 0, Q1: 0, Q2: 0 };
    for (let i = 0; i < 400; i++) {
      b.scans(1);
      for (const q of ['Q0', 'Q1', 'Q2'] as const) if (b.bit(q)) onTime[q]++;
    }
    for (const q of ['Q0', 'Q1', 'Q2'] as const) expect(onTime[q], q).toBeGreaterThan(150);
    for (const q of ['Q0', 'Q1', 'Q2'] as const) expect(onTime[q], q).toBeLessThan(250);
  });

  it('partida com selo continua funcionando com a lógica em M', () => {
    const b = bench(get('partida-selo'));
    b.inputs.I1 = true;
    b.inputs.I0 = true;
    b.scans(2);
    b.inputs.I0 = false;
    b.scans(5);
    expect(b.bit('Q0')).toBe(true);
    b.inputs.I1 = false;
    b.scans(2);
    expect(b.bit('Q0')).toBe(false);
  });
});

describe('ramos com comparador e borda dentro de paralelo', () => {
  it('OU entre um contato e uma comparação', () => {
    const b = bench(withRungs(RUNG('', [PAR([NA('I0')], [CMP('gt', R('D0'), K(10))])], [COIL('M0')])));
    b.scans(1);
    expect(b.bit('M0')).toBe(false);
    b.state.regs.D0 = 11;
    b.scans(1);
    expect(b.bit('M0')).toBe(true);
    b.state.regs.D0 = 0;
    b.inputs.I0 = true;
    b.scans(1);
    expect(b.bit('M0')).toBe(true);
  });

  it('contador zerado por RES continua válido', () => {
    const p = withRungs(RUNG('', [NF('S0')], [RES('C0')]), RUNG('', [NA('S0')], [CTU('C0', 3)]));
    expect(validate(p)).toEqual([]);
  });
});
