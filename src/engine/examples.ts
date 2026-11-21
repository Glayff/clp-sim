// Programas de exemplo (didáticos) carregáveis pelo app.

import {
  uid,
  type CoilKind,
  type InputKind,
  type LogicNode,
  type OutputKind,
  type OutputNode,
  type Program,
  type Rung,
} from './types';

// ---- Construtores curtos ----
export const NA = (tag: string): LogicNode => ({ id: uid(), kind: 'contact', tag, nc: false });
export const NF = (tag: string): LogicNode => ({ id: uid(), kind: 'contact', tag, nc: true });
export const PAR = (...branches: LogicNode[][]): LogicNode => ({ id: uid(), kind: 'parallel', branches });
export const COIL = (tag: string, kind: CoilKind = 'coil'): OutputNode => ({ id: uid(), kind, tag });
export const TON = (tag: string, preset: number): OutputNode => ({ id: uid(), kind: 'ton', tag, preset });
export const TOF = (tag: string, preset: number): OutputNode => ({ id: uid(), kind: 'tof', tag, preset });
export const CTU = (tag: string, preset: number): OutputNode => ({ id: uid(), kind: 'ctu', tag, preset });
export const RES = (tag: string): OutputNode => ({ id: uid(), kind: 'res', tag });

export const RUNG = (comment: string, logic: LogicNode[], outputs: OutputNode[]): Rung => ({
  id: uid(),
  comment,
  logic,
  outputs,
});

export const DEFAULT_INPUT_KINDS = (): Record<string, InputKind> => ({
  I0: 'pushNA',
  I1: 'pushNC',
  I2: 'toggle',
  I3: 'toggle',
  I4: 'toggle',
  I5: 'toggle',
  I6: 'toggle',
  I7: 'toggle',
});

export const DEFAULT_OUTPUT_KINDS = (): Record<string, OutputKind> => ({
  Q0: 'lamp',
  Q1: 'lamp',
  Q2: 'lamp',
  Q3: 'lamp',
  Q4: 'lamp',
  Q5: 'lamp',
  Q6: 'lamp',
  Q7: 'lamp',
});

export function emptyProgram(): Program {
  return {
    name: 'Programa novo',
    description: '',
    rungs: [RUNG('', [], [])],
    labels: {},
    inputKinds: DEFAULT_INPUT_KINDS(),
    outputKinds: DEFAULT_OUTPUT_KINDS(),
  };
}

export interface Example {
  id: string;
  title: string;
  build: () => Program;
}

function make(
  name: string,
  description: string,
  rungs: Rung[],
  labels: Record<string, string>,
  inputKinds: Record<string, InputKind> = {},
  outputKinds: Record<string, OutputKind> = {},
): Program {
  return {
    name,
    description,
    rungs,
    labels,
    inputKinds: { ...DEFAULT_INPUT_KINDS(), ...inputKinds },
    outputKinds: { ...DEFAULT_OUTPUT_KINDS(), ...outputKinds },
  };
}

export const EXAMPLES: Example[] = [
  {
    id: 'partida-selo',
    title: 'Partida direta com selo',
    build: () =>
      make(
        'Partida direta com selo',
        'Liga com I0 (botão NA), desliga com I1 (botão NF). O contato Q0 em paralelo com I0 "sela" o circuito: o motor continua ligado depois de soltar o botão. I1 é NF na botoeira e NA no Ladder — assim, se o fio romper, o motor desliga (falha segura).',
        [
          RUNG('Partida com selo', [PAR([NA('I0')], [NA('Q0')]), NA('I1')], [COIL('Q0')]),
          RUNG('Sinaleiro "motor ligado"', [NA('Q0')], [COIL('Q1')]),
        ],
        { I0: 'Botão LIGA', I1: 'Botão DESLIGA', Q0: 'Contator K1 (motor)', Q1: 'Sinaleiro verde' },
        {},
        { Q0: 'motor' },
      ),
  },
  {
    id: 'ton',
    title: 'Temporizador na energização (TON)',
    build: () =>
      make(
        'Temporizador na energização (TON)',
        'Ligue a chave I2: o temporizador T0 conta 3 s e só então energiza Q0. Desligar I2 antes do tempo zera a contagem.',
        [
          RUNG('Conta 3 s enquanto I2 estiver ligada', [NA('I2')], [TON('T0', 3000)]),
          RUNG('Saída liga quando o tempo termina', [NA('T0')], [COIL('Q0')]),
        ],
        { I2: 'Chave habilita', Q0: 'Lâmpada (após 3 s)' },
      ),
  },
  {
    id: 'tof',
    title: 'Temporizador na desenergização (TOF)',
    build: () =>
      make(
        'Temporizador na desenergização (TOF)',
        'A lâmpada acende junto com I2 e fica acesa por mais 4 s depois que I2 é desligada — como a luz de escada com retardo.',
        [
          RUNG('TOF: mantém T0.DN por 4 s após I2 desligar', [NA('I2')], [TOF('T0', 4000)]),
          RUNG('Lâmpada segue T0.DN', [NA('T0')], [COIL('Q0')]),
        ],
        { I2: 'Interruptor', Q0: 'Lâmpada da escada' },
      ),
  },
  {
    id: 'pisca',
    title: 'Pisca-pisca (2 temporizadores)',
    build: () =>
      make(
        'Pisca-pisca (2 temporizadores)',
        'Ligue I2 para piscar Q0: T0 conta 1 s (Q0 desligada), T1 conta mais 1 s (Q0 ligada) e o contato NF de T1 reinicia o ciclo.',
        [
          RUNG('T0: 1 s aceso/apagado', [NA('I2'), NF('T1')], [TON('T0', 1000)]),
          RUNG('T1: começa quando T0 termina', [NA('T0')], [TON('T1', 1000)]),
          RUNG('Saída pisca com T0.DN', [NA('T0')], [COIL('Q0')]),
        ],
        { I2: 'Habilita pisca', Q0: 'Sinaleiro' },
      ),
  },
  {
    id: 'contador',
    title: 'Contador de peças (CTU)',
    build: () =>
      make(
        'Contador de peças (CTU)',
        'Cada pulso em I0 conta uma peça. Ao chegar a 5, C0.DN liga a lâmpada Q0. O botão I3 zera a contagem (RES).',
        [
          RUNG('Conta pulsos de I0 até 5', [NA('I0')], [CTU('C0', 5)]),
          RUNG('Zera o contador', [NA('I3')], [RES('C0')]),
          RUNG('Lote completo', [NA('C0')], [COIL('Q0')]),
        ],
        { I0: 'Sensor de peça', I3: 'Reset do lote', Q0: 'Lote completo' },
        { I3: 'pushNA' },
      ),
  },
  {
    id: 'estrela-triangulo',
    title: 'Partida estrela-triângulo',
    build: () =>
      make(
        'Partida estrela-triângulo',
        'K1 (rede) e K2 (estrela) ligam juntos; após 5 s o K2 desliga, há 100 ms de tempo morto e o K3 (triângulo) liga. K2 e K3 têm intertravamento por contato NF — nunca ficam ligados ao mesmo tempo.',
        [
          RUNG('Selo do contator de rede K1', [PAR([NA('I0')], [NA('Q0')]), NA('I1')], [COIL('Q0')]),
          RUNG('Tempo de partida em estrela: 5 s', [NA('Q0')], [TON('T0', 5000)]),
          RUNG('Estrela K2 (intertravada com K3)', [NA('Q0'), NF('T0'), NF('Q2')], [COIL('Q1')]),
          RUNG('Tempo morto de 100 ms entre estrela e triângulo', [NA('T0')], [TON('T1', 100)]),
          RUNG('Triângulo K3 (intertravado com K2)', [NA('Q0'), NA('T1'), NF('Q1')], [COIL('Q2')]),
        ],
        {
          I0: 'Botão LIGA',
          I1: 'Botão DESLIGA',
          Q0: 'K1 - Rede',
          Q1: 'K2 - Estrela',
          Q2: 'K3 - Triângulo',
        },
        {},
        { Q0: 'motor' },
      ),
  },
  {
    id: 'set-reset',
    title: 'SET / RESET (biestável)',
    build: () =>
      make(
        'SET / RESET (biestável)',
        'Um pulso em I0 trava Q0 ligada (SET); um pulso em I3 destrava (RESET). Diferente do selo, a bobina não fica "presa" por contato — o estado é guardado pela própria instrução.',
        [
          RUNG('SET: liga e mantém', [NA('I0')], [COIL('Q0', 'set')]),
          RUNG('RESET: desliga', [NA('I3')], [COIL('Q0', 'rst')]),
        ],
        { I0: 'Pulso SET', I3: 'Pulso RESET', Q0: 'Saída travada' },
        { I3: 'pushNA' },
      ),
  },
];
