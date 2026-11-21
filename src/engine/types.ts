// Modelo de dados do programa Ladder e do estado do CLP.

export const INPUT_TAGS = ['I0', 'I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7'] as const;
export const OUTPUT_TAGS = ['Q0', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7'] as const;
export const MEMORY_TAGS = Array.from({ length: 16 }, (_, i) => `M${i}`);
export const TIMER_TAGS = Array.from({ length: 8 }, (_, i) => `T${i}`);
export const COUNTER_TAGS = Array.from({ length: 8 }, (_, i) => `C${i}`);

export type TagClass = 'I' | 'Q' | 'M' | 'T' | 'C';

export function tagClass(tag: string): TagClass {
  const c = tag.charAt(0).toUpperCase();
  return c === 'I' || c === 'Q' || c === 'T' || c === 'C' ? c : 'M';
}

// ---- Lógica (lado esquerdo do degrau): contatos e ramos em paralelo ----

export interface Contact {
  id: string;
  kind: 'contact';
  tag: string;
  /** false = contato NA (normalmente aberto), true = NF (normalmente fechado) */
  nc: boolean;
}

export interface Parallel {
  id: string;
  kind: 'parallel';
  /** Cada ramo é uma série de nós. Um ramo vazio é um fio (curto-circuito). */
  branches: LogicNode[][];
}

export type LogicNode = Contact | Parallel;

// ---- Saídas (lado direito do degrau): bobinas, temporizadores, contadores ----

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

export type OutputNode = Coil | TimerNode | CounterNode | ResetNode;

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
  bits: Record<string, boolean>;
  timers: Record<string, TimerState>;
  counters: Record<string, CounterState>;
  /** Estado anterior da energia do degrau de cada CTU, para detectar borda de subida */
  edges: Record<string, boolean>;
  scans: number;
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
