// Programas de exemplo (didáticos) carregáveis pelo app.
//
// Padrão adotado nos exemplos maiores: a lógica interna fica em memórias (M) e
// cada saída física (Q) é escrita uma única vez, num degrau no final. Isso
// economiza saídas, evita bobina duplicada e deixa o programa mais fácil de ler.

import {
  uid,
  type CoilKind,
  type CompareOp,
  type InputKind,
  type LogicNode,
  type Operand,
  type OutputKind,
  type OutputNode,
  type Program,
  type Rung,
} from './types';

// ---- Construtores curtos ----
export const NA = (tag: string): LogicNode => ({ id: uid(), kind: 'contact', tag, nc: false });
export const NF = (tag: string): LogicNode => ({ id: uid(), kind: 'contact', tag, nc: true });
/** Contato de borda de subida (P) */
export const PUP = (tag: string): LogicNode => ({ id: uid(), kind: 'contact', tag, nc: false, edge: 'rise' });
/** Contato de borda de descida (N) */
export const PDN = (tag: string): LogicNode => ({ id: uid(), kind: 'contact', tag, nc: false, edge: 'fall' });
export const CMP = (op: CompareOp, a: Operand, b: Operand): LogicNode => ({ id: uid(), kind: 'compare', op, a, b });
export const PAR = (...branches: LogicNode[][]): LogicNode => ({ id: uid(), kind: 'parallel', branches });

/** Operando: endereço */
export const R = (tag: string): Operand => ({ kind: 'tag', tag });
/** Operando: constante */
export const K = (value: number): Operand => ({ kind: 'const', value });

export const COIL = (tag: string, kind: CoilKind = 'coil'): OutputNode => ({ id: uid(), kind, tag });
export const TON = (tag: string, preset: number): OutputNode => ({ id: uid(), kind: 'ton', tag, preset });
export const TOF = (tag: string, preset: number): OutputNode => ({ id: uid(), kind: 'tof', tag, preset });
export const CTU = (tag: string, preset: number): OutputNode => ({ id: uid(), kind: 'ctu', tag, preset });
export const RES = (tag: string): OutputNode => ({ id: uid(), kind: 'res', tag });
export const MOV = (src: Operand, dst: string): OutputNode => ({ id: uid(), kind: 'mov', src, dst });
export const ADD = (a: Operand, b: Operand, dst: string): OutputNode => ({ id: uid(), kind: 'add', a, b, dst });
export const SUB = (a: Operand, b: Operand, dst: string): OutputNode => ({ id: uid(), kind: 'sub', a, b, dst });
export const MUL = (a: Operand, b: Operand, dst: string): OutputNode => ({ id: uid(), kind: 'mul', a, b, dst });
export const DIV = (a: Operand, b: Operand, dst: string): OutputNode => ({ id: uid(), kind: 'div', a, b, dst });
export const SCL = (
  src: Operand,
  dst: string,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): OutputNode => ({ id: uid(), kind: 'scl', src, dst, inMin, inMax, outMin, outMax });

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
    retentive: [],
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
  opts: {
    inputKinds?: Record<string, InputKind>;
    outputKinds?: Record<string, OutputKind>;
    retentive?: string[];
  } = {},
): Program {
  return {
    name,
    description,
    rungs,
    labels,
    inputKinds: { ...DEFAULT_INPUT_KINDS(), ...opts.inputKinds },
    outputKinds: { ...DEFAULT_OUTPUT_KINDS(), ...opts.outputKinds },
    retentive: opts.retentive ?? [],
  };
}

export const EXAMPLES: Example[] = [
  {
    id: 'partida-selo',
    title: 'Partida direta com selo',
    build: () =>
      make(
        'Partida direta com selo',
        'Liga com I0 (botão NA), desliga com I1 (botão NF). A lógica de partida fica na memória M0, e as saídas físicas Q0 e Q1 só copiam M0 no final. O contato M0 em paralelo com I0 "sela" o circuito. I1 é NF na botoeira e NA no Ladder — assim, se o fio romper, o motor desliga (falha segura).',
        [
          RUNG('Partida com selo, na memória M0', [PAR([NA('I0')], [NA('M0')]), NA('I1')], [COIL('M0')]),
          RUNG('Saída física: contator do motor', [NA('M0')], [COIL('Q0')]),
          RUNG('Saída física: sinaleiro', [NA('M0')], [COIL('Q1')]),
        ],
        {
          I0: 'Botão LIGA',
          I1: 'Botão DESLIGA',
          M0: 'Motor ligado (comando)',
          Q0: 'Contator K1 (motor)',
          Q1: 'Sinaleiro verde',
        },
        { outputKinds: { Q0: 'motor' } },
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
        'Ligue I2 para piscar Q0: T0 conta 1 s (Q0 desligada), T1 conta mais 1 s (Q0 ligada) e o contato NF de T1 reinicia o ciclo. Compare com o exemplo "Pisca com clock do sistema", que faz o mesmo sem temporizadores.',
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
        { inputKinds: { I3: 'pushNA' } },
      ),
  },
  {
    id: 'estrela-triangulo',
    title: 'Partida estrela-triângulo',
    build: () =>
      make(
        'Partida estrela-triângulo',
        'A sequência inteira roda em memórias (M0 sequência, M1 estrela, M2 triângulo) e só no fim os degraus copiam para K1, K2 e K3. K1 e K2 ligam juntos; após 5 s o K2 desliga, há 100 ms de tempo morto e o K3 liga. K2 e K3 têm intertravamento por contato NF — nunca ficam ligados ao mesmo tempo.',
        [
          RUNG('Selo da sequência de partida', [PAR([NA('I0')], [NA('M0')]), NA('I1')], [COIL('M0')]),
          RUNG('Tempo de partida em estrela: 5 s', [NA('M0')], [TON('T0', 5000)]),
          RUNG('Comando estrela (intertravado com triângulo)', [NA('M0'), NF('T0'), NF('M2')], [COIL('M1')]),
          RUNG('Tempo morto de 100 ms entre estrela e triângulo', [NA('T0')], [TON('T1', 100)]),
          RUNG('Comando triângulo (intertravado com estrela)', [NA('M0'), NA('T1'), NF('M1')], [COIL('M2')]),
          RUNG('Saída física: K1 rede', [NA('M0')], [COIL('Q0')]),
          RUNG('Saída física: K2 estrela', [NA('M1')], [COIL('Q1')]),
          RUNG('Saída física: K3 triângulo', [NA('M2')], [COIL('Q2')]),
        ],
        {
          I0: 'Botão LIGA',
          I1: 'Botão DESLIGA',
          M0: 'Sequência ligada',
          M1: 'Comando estrela',
          M2: 'Comando triângulo',
          Q0: 'K1 - Rede',
          Q1: 'K2 - Estrela',
          Q2: 'K3 - Triângulo',
        },
        { outputKinds: { Q0: 'motor' } },
      ),
  },
  {
    id: 'set-reset',
    title: 'SET / RESET (biestável)',
    build: () =>
      make(
        'SET / RESET (biestável)',
        'Um pulso em I0 trava M0 ligada (SET); um pulso em I3 destrava (RESET). Diferente do selo, a memória não fica "presa" por contato — o estado é guardado pela própria instrução. Q0 só espelha M0.',
        [
          RUNG('SET: liga e mantém', [NA('I0')], [COIL('M0', 'set')]),
          RUNG('RESET: desliga', [NA('I3')], [COIL('M0', 'rst')]),
          RUNG('Saída física', [NA('M0')], [COIL('Q0')]),
        ],
        { I0: 'Pulso SET', I3: 'Pulso RESET', M0: 'Estado travado', Q0: 'Saída travada' },
        { inputKinds: { I3: 'pushNA' } },
      ),
  },
  {
    id: 'toggle-borda',
    title: 'Liga/desliga com um botão (borda)',
    build: () =>
      make(
        'Liga/desliga com um botão (borda)',
        'Cada aperto de I0 inverte a lâmpada. O contato P passa energia por um único ciclo, na subida do botão. Atenção à ordem: se um mesmo pulso ligasse e desligasse M0 no mesmo ciclo, o estado nunca mudaria. Por isso os pedidos "ligar" (M1) e "desligar" (M2) são calculados primeiro, com o valor antigo de M0.',
        [
          RUNG('Pedido de ligar: borda do botão com o estado desligado', [PUP('I0'), NF('M0')], [COIL('M1')]),
          RUNG('Pedido de desligar: borda do botão com o estado ligado', [PUP('I0'), NA('M0')], [COIL('M2')]),
          RUNG('Liga o estado', [NA('M1')], [COIL('M0', 'set')]),
          RUNG('Desliga o estado', [NA('M2')], [COIL('M0', 'rst')]),
          RUNG('Saída física', [NA('M0')], [COIL('Q0')]),
        ],
        {
          I0: 'Botão liga/desliga',
          M0: 'Estado da máquina',
          M1: 'Pedido: ligar',
          M2: 'Pedido: desligar',
          Q0: 'Lâmpada',
        },
      ),
  },
  {
    id: 'clock',
    title: 'Pisca com clock do sistema',
    build: () =>
      make(
        'Pisca com clock do sistema',
        'O CLP já tem bits de relógio prontos: S2 (2 Hz), S3 (1 Hz) e S4 (0,5 Hz). Ligue a chave I2 e as três lâmpadas piscam em ritmos diferentes, sem nenhum temporizador. O pisca é montado em M0, M1 e M2; as saídas Q só copiam no final. S1 é o bit de primeiro ciclo e S0 fica sempre ligado.',
        [
          RUNG('1 Hz: acende 0,5 s, apaga 0,5 s', [NA('I2'), NA('S3')], [COIL('M0')]),
          RUNG('0,5 Hz: acende 1 s, apaga 1 s', [NA('I2'), NA('S4')], [COIL('M1')]),
          RUNG('2 Hz: acende 0,25 s, apaga 0,25 s', [NA('I2'), NA('S2')], [COIL('M2')]),
          RUNG('Saída física: pisca 1 Hz', [NA('M0')], [COIL('Q0')]),
          RUNG('Saída física: pisca 0,5 Hz', [NA('M1')], [COIL('Q1')]),
          RUNG('Saída física: pisca 2 Hz', [NA('M2')], [COIL('Q2')]),
        ],
        {
          I2: 'Habilita piscas',
          M0: 'Pulso 1 Hz',
          M1: 'Pulso 0,5 Hz',
          M2: 'Pulso 2 Hz',
          Q0: 'Pisca 1 Hz',
          Q1: 'Pisca 0,5 Hz',
          Q2: 'Pisca 2 Hz',
        },
      ),
  },
  {
    id: 'tanque',
    title: 'Controle de nível com entrada analógica',
    build: () =>
      make(
        'Controle de nível com entrada analógica',
        'AI0 simula um sensor de nível de 4–20 mA (valor bruto de 0 a 27648). SCL converte para 0–100 % em D0. Abaixo de 20 % a bomba é pedida (SET em M0); ao chegar a 80 % o pedido é desfeito (RESET) — isso é histerese: entre 20 % e 80 % a bomba mantém o estado anterior. M1 libera a bomba só se não houver emergência (I1, botão NF). Toda a lógica fica em M; Q0 e Q1 só copiam no final. Mova o controle deslizante de AI0 no painel para simular o nível.',
        [
          RUNG(
            'Converte o sinal analógico (0–27648) em nível de 0 a 100 %',
            [NA('S0')],
            [SCL(R('AI0'), 'D0', 0, 27648, 0, 100)],
          ),
          RUNG('Nível abaixo de 20 %: pede a bomba', [CMP('lt', R('D0'), K(20))], [COIL('M0', 'set')]),
          RUNG('Nível a partir de 80 %: desfaz o pedido', [CMP('ge', R('D0'), K(80))], [COIL('M0', 'rst')]),
          RUNG('Bomba liberada: pedida e sem emergência', [NA('M0'), NA('I1')], [COIL('M1')]),
          RUNG('Alarme de nível muito alto (> 95 %)', [CMP('gt', R('D0'), K(95))], [COIL('M2')]),
          RUNG('Saída física: bomba', [NA('M1')], [COIL('Q0')]),
          RUNG('Saída física: alarme de nível alto', [NA('M2')], [COIL('Q1')]),
        ],
        {
          I1: 'Emergência',
          AI0: 'Sensor de nível (4–20 mA)',
          D0: 'Nível (%)',
          M0: 'Bomba pedida',
          M1: 'Bomba liberada',
          M2: 'Alarme de nível alto',
          Q0: 'Bomba de enchimento',
          Q1: 'Alarme nível alto',
        },
        { outputKinds: { Q0: 'motor' } },
      ),
  },
  {
    id: 'partidas',
    title: 'Contador de partidas (memória retentiva)',
    build: () =>
      make(
        'Contador de partidas (memória retentiva)',
        'A cada vez que o CLP vai para RUN, o primeiro ciclo (S1) soma 1 em D0. Como D0 é retentiva, a contagem sobrevive ao STOP: pare e rode o simulador várias vezes. Passando de 4 partidas, Q0 acende como aviso de manutenção preventiva. I3 zera a contagem. "Zerar memória" (partida a frio) também apaga as retentivas.',
        [
          RUNG('Primeiro ciclo de cada RUN: conta uma partida', [NA('S1')], [ADD(R('D0'), K(1), 'D0')]),
          RUNG('Mais de 4 partidas: pede manutenção', [CMP('gt', R('D0'), K(4))], [COIL('M0')]),
          RUNG('Manutenção feita: zera a contagem', [NA('I3')], [MOV(K(0), 'D0')]),
          RUNG('Saída física: aviso de manutenção', [NA('M0')], [COIL('Q0')]),
        ],
        { I3: 'Manutenção feita', D0: 'Partidas do motor', M0: 'Manutenção pedida', Q0: 'Manutenção preventiva' },
        { inputKinds: { I3: 'pushNA' }, retentive: ['D0'] },
      ),
  },
];
