// Liga o motor de varredura ao React: roda ciclos em tempo real (RUN), congela (PAUSA),
// executa um ciclo por vez (PASSO) e publica um "retrato" do estado para a interface desenhar.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collectEdgeIds, createState, restartState, scan, type Forces } from '../engine/plc';
import type { PlcState, Program, Trace } from '../engine/types';

export type RunMode = 'run' | 'pause' | 'stop';

export interface Snapshot {
  bits: PlcState['bits'];
  timers: PlcState['timers'];
  counters: PlcState['counters'];
  regs: PlcState['regs'];
  trace: Trace;
  scans: number;
  /** Tempo simulado desde a partida, em ms */
  timeMs: number;
  /** Tempo médio de execução de uma varredura, em ms (medido de verdade) */
  execMs: number;
  /** Contatos de borda que dispararam há pouco — um ciclo é rápido demais para o olho. */
  flash: Record<string, boolean>;
}

function snapshotOf(state: PlcState, trace: Trace, execMs: number, flash: Record<string, boolean>): Snapshot {
  return {
    bits: { ...state.bits },
    timers: Object.fromEntries(Object.entries(state.timers).map(([k, v]) => [k, { ...v }])),
    counters: Object.fromEntries(Object.entries(state.counters).map(([k, v]) => [k, { ...v }])),
    regs: { ...state.regs },
    trace: new Map(trace),
    scans: state.scans,
    timeMs: state.timeMs,
    execMs,
    flash,
  };
}

const TICK_MS = 25;
/** Quanto tempo (ms reais) um contato de borda fica aceso depois de disparar. */
const FLASH_MS = 380;

export interface PlcHandle {
  snap: Snapshot;
  /** Executa exatamente uma varredura (usado na pausa). */
  step: () => void;
  /** Partida a frio: zera tudo, inclusive os endereços retentivos. */
  coldStart: () => void;
}

export function usePlc(
  program: Program,
  physicalInputs: Record<string, boolean>,
  analog: Record<string, number>,
  forces: Forces,
  mode: RunMode,
  scanMs: number,
): PlcHandle {
  const stateRef = useRef<PlcState>(createState());
  const traceRef = useRef<Trace>(new Map());
  const execRef = useRef(0);
  const flashAtRef = useRef<Map<string, number>>(new Map());
  const programRef = useRef(program);
  const ioRef = useRef({ inputs: physicalInputs, analog, forces });
  const scanMsRef = useRef(scanMs);
  const edgeIds = useMemo(() => collectEdgeIds(program), [program]);
  const edgeIdsRef = useRef(edgeIds);
  programRef.current = program;
  ioRef.current = { inputs: physicalInputs, analog, forces };
  scanMsRef.current = scanMs;
  edgeIdsRef.current = edgeIds;

  const [snap, setSnap] = useState<Snapshot>(() => snapshotOf(stateRef.current, traceRef.current, 0, {}));

  const publish = useCallback((withFlash: boolean) => {
    const flash: Record<string, boolean> = {};
    if (withFlash) {
      const now = performance.now();
      for (const [id, at] of flashAtRef.current) if (now - at < FLASH_MS) flash[id] = true;
    }
    setSnap(snapshotOf(stateRef.current, traceRef.current, execRef.current, flash));
  }, []);

  const runOne = useCallback(() => {
    const io = ioRef.current;
    scan(programRef.current, stateRef.current, io.inputs, scanMsRef.current, traceRef.current, {
      analog: io.analog,
      forces: io.forces,
    });
    const now = performance.now();
    for (const id of edgeIdsRef.current) if (traceRef.current.get(id)?.pout) flashAtRef.current.set(id, now);
  }, []);

  const clear = useCallback(
    (next: PlcState) => {
      stateRef.current = next;
      traceRef.current = new Map();
      flashAtRef.current = new Map();
      execRef.current = 0;
      publish(false);
    },
    [publish],
  );

  const coldStart = useCallback(() => clear(createState()), [clear]);

  const step = useCallback(() => {
    flashAtRef.current = new Map();
    runOne();
    publish(false);
  }, [runOne, publish]);

  // STOP: saídas desligam e a memória volta a zero — menos o que foi marcado como retentivo.
  useEffect(() => {
    if (mode !== 'stop') return;
    clear(restartState(stateRef.current, programRef.current.retentive));
  }, [mode, clear]);

  // RUN: varre em tempo real. Se a aba ficar parada, recupera no máximo 250 ms de ciclos.
  useEffect(() => {
    if (mode !== 'run') return;
    let last = performance.now();
    let pending = 0;
    const id = window.setInterval(() => {
      const now = performance.now();
      pending += Math.min(now - last, 250);
      last = now;

      let n = 0;
      const t0 = performance.now();
      while (pending >= scanMs && n < 100) {
        runOne();
        pending -= scanMs;
        n += 1;
      }
      if (n > 0) {
        const per = (performance.now() - t0) / n;
        execRef.current = execRef.current === 0 ? per : execRef.current * 0.9 + per * 0.1;
        publish(true);
      }
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [mode, scanMs, runOne, publish]);

  return { snap, step, coldStart };
}
