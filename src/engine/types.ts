// Modelo de dados do programa Ladder e do estado do CLP.

// ---- Espaço de endereços ----
//   I  entradas digitais        Q  saídas digitais        M  memórias (bits internos)
//   T  temporizadores (DN)      C  contadores (DN)        S  bits de sistema (só leitura)
//   D  registradores (inteiro de 32 bits)
//   AI entradas analógicas      AQ saídas analógicas      (valor bruto 0–27648)

export const INPUT_TAGS = ['I0', 'I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7'] as const;
export const OUTPUT_TAGS = ['Q0', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7'] as const;
export const MEMORY_TAGS: string[] = Array.from({ length: 64 }, (_, i) => `M${i}`);
export const TIMER_TAGS: string[] = Array.from({ length: 8 }, (_, i) => `T${i}`);
export const COUNTER_TAGS: string[] = Array.from({ length: 8 }, (_, i) => `C${i}`);
export const REGISTER_TAGS: string[] = Array.from({ length: 32 }, (_, i) => `D${i}`);
export const ANALOG_IN_TAGS = ['AI0', 'AI1', 'AI2', 'AI3'] as const;
export const ANALOG_OUT_TAGS = ['AQ0', 'AQ1'] as const;
export const SYSTEM_TAGS = ['S0', 'S1', 'S2', 'S3', 'S4'] as const;

/** Valor bruto de fundo de escala das entradas/saídas analógicas (como nos CLPs Siemens). */
export const ANALOG_FULL_SCALE = 27648;

export const SYSTEM_LABELS: Record<string, string> = {
  S0: 'Sempre ligado',
  S1: 'Primeiro ciclo',
  S2: 'Clock 2 Hz',
  S3: 'Clock 1 Hz',
  S4: 'Clock 0,5 Hz',
};

/** Endereços numéricos que podem ser lidos como operando (inclui o acumulado de T e C). */
export const NUMERIC_READ_TAGS: string[] = [
  ...REGISTER_TAGS,
  ...ANALOG_IN_TAGS,
  ...ANALOG_OUT_TAGS,
  ...TIMER_TAGS.map((t) => `${t}.ACC`),
  ...COUNTER_TAGS.map((c) => `${c}.ACC`),
];
/** Endereços numéricos onde MOV, matemática e SCL podem escrever. */
export const NUMERIC_WRITE_TAGS: string[] = [...REGISTER_TAGS, ...ANALOG_OUT_TAGS];

export type TagClass = 'I' | 'Q' | 'M' | 'T' | 'C' | 'D' | 'AI' | 'AQ' | 'S';

export function tagClass(tag: string): TagClass {
  if (tag.startsWith('AI')) return 'AI';
  if (tag.startsWith('AQ')) return 'AQ';
  const c = tag.charAt(0).toUpperCase();
  return c === 'I' || c === 'Q' || c === 'T' || c === 'C' || c === 'D' || c === 'S' ? c : 'M';
}

/** "T0.ACC" → "T0" */
export function baseTag(tag: string): string {
  return tag.endsWith('.ACC') ? tag.slice(0, -4) : tag;
}

// ---- Operandos numéricos ----

export type Operand = { kind: 'tag'; tag: string } | { kind: 'const'; value: number };

export type CompareOp = 'eq' | 'ne' | 'gt' | 'ge' | 'lt' | 'le';

export const COMPARE_SYMBOL: Record<CompareOp, string> = {
  eq: '=',
  ne: '≠',
  gt: '>',
  ge: '≥',
  lt: '<',
  le: '≤',
};

// ---- Lógica (lado esquerdo do degrau): contatos, comparações e ramos em paralelo ----

export interface Contact {
  id: string;
  kind: 'contact';
  tag: string;
  /** false = contato NA (normalmente aberto), true = NF (normalmente fechado) */
  nc: boolean;
  /** Contato de borda: passa energia por um único ciclo na subida (P) ou na descida (N) */
  edge?: 'rise' | 'fall';
}

export interface Compare {
  id: string;
  kind: 'compare';
  op: CompareOp;
  a: Operand;
  b: Operand;
}

export interface Parallel {
  id: string;
  kind: 'parallel';
  /** Cada ramo é uma série de nós. Um ramo vazio é um fio (curto-circuito). */
  branches: LogicNode[][];
}

export type LogicNode = Contact | Compare | Parallel;

// ---- Saídas (lado direito do degrau): bobinas, blocos e instruções de dados ----

export type CoilKind = 'coil' | 'ncoil' | 'set' | 'rst';

export interface Coil {
  id: string;
  kind: CoilKind;
  tag: string;
}

export interface TimerNode {
  id: string;
  kind: 'ton' | 'tof';
  tag: string;
  /** Preset em milissegundos */
  preset: number;
}

export interface CounterNode {
  id: string;
  kind: 'ctu';
  tag: string;
  preset: number;
}

/** Zera um contador ou temporizador enquanto o degrau estiver energizado. */
export interface ResetNode {
  id: string;
  kind: 'res';
  tag: string;
}

/** Copia um valor para um registrador enquanto o degrau estiver energizado. */
export interface MoveNode {
  id: string;
  kind: 'mov';
  src: Operand;
  dst: string;
}

export type MathKind = 'add' | 'sub' | 'mul' | 'div';

export interface MathNode {
  id: string;
  kind: MathKind;
  a: Operand;
  b: Operand;
  dst: string;
}

/** Escalonamento linear com limitação: [inMin, inMax] → [outMin, outMax]. */
export interface ScaleNode {
  id: string;
  kind: 'scl';
  src: Operand;
  dst: string;
  inMin: number;
  inMax: number;
  outMin: number;
  outMax: number;
}

export type OutputNode =
  | Coil
  | TimerNode
  | CounterNode
  | ResetNode
  | MoveNode
  | MathNode
  | ScaleNode;

export interface Rung {
  id: string;
  comment: string;
  logic: LogicNode[];
  outputs: OutputNode[];
}

// ---- Dispositivos virtuais de E/S ----

/** toggle = chave com trava; pushNA = botão pulsador NA; pushNC = botão pulsador NF */
export type InputKind = 'toggle' | 'pushNA' | 'pushNC';
export type OutputKind = 'lamp' | 'motor';

export interface Program {
  name: string;
  description: string;
  rungs: Rung[];
  /** Nomes simbólicos por endereço, ex.: { I0: 'Botão Liga' } */
  labels: Record<string, string>;
  inputKinds: Record<string, InputKind>;
  outputKinds: Record<string, OutputKind>;
  /** Endereços (M, D, C) que mantêm o valor entre STOP e RUN */
  retentive: string[];
}

// ---- Estado de execução ----

export interface TimerState {
  acc: number;
  dn: boolean;
  tt: boolean;
}

export interface CounterState {
  acc: number;
  dn: boolean;
}

export interface PlcState {
  /** Bits I, Q, M e S */
  bits: Record<string, boolean>;
  timers: Record<string, TimerState>;
  counters: Record<string, CounterState>;
  /** Registradores D e valores analógicos AI/AQ */
  regs: Record<string, number>;
  /** Estado anterior de CTUs e de contatos de borda (chave = id do nó ou do contador) */
  edges: Record<string, boolean>;
  scans: number;
  /** Tempo simulado desde a partida, em ms */
  timeMs: number;
}

export interface NodeTrace {
  pin: boolean;
  pout: boolean;
}

/** Fluxo de energia por elemento, na última varredura (chave = id do nó). */
export type Trace = Map<string, NodeTrace>;

export interface Warning {
  rungId: string;
  message: string;
}

let uidCounter = 0;
export function uid(): string {
  uidCounter += 1;
  return `n${Date.now().toString(36)}${uidCounter.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}
