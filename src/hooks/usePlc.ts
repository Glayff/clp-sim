// Liga o motor de varredura ao React: roda ciclos em tempo real e publica
// um "retrato" do estado para a interface desenhar.

import { useCallback, useEffect, useRef, useState } from 'react';
import { createState, scan } from '../engine/plc';
import type { PlcState, Program, Trace } from '../engine/types';

export interface Snapshot {
  bits: PlcState['bits'];
  timers: PlcState['timers'];
  counters: PlcState['counters'];
  trace: Trace;
  scans: number;
  /** Tempo médio de execução de uma varredura, em ms (medido de verdade) */
  execMs: number;
}

function snapshotOf(state: PlcState, trace: Trace, execMs: number): Snapshot {
  return {
    bits: { ...state.bits },
    timers: Object.fromEntries(Object.entries(state.timers).map(([k, v]) => [k, { ...v }])),
    counters: Object.fromEntries(Object.entries(state.counters).map(([k, v]) => [k, { ...v }])),
    trace: new Map(trace),
    scans: state.scans,
    execMs,
  };
}

const TICK_MS = 25;

export function usePlc(
  program: Program,
  physicalInputs: Record<string, boolean>,
  running: boolean,
  scanMs: number,
): { snap: Snapshot; reset: () => void } {
  const stateRef = useRef<PlcState>(createState());
  const traceRef = useRef<Trace>(new Map());
  const execRef = useRef(0);
  const programRef = useRef(program);
  const inputsRef = useRef(physicalInputs);
  programRef.current = program;
  inputsRef.current = physicalInputs;

  const [snap, setSnap] = useState<Snapshot>(() => snapshotOf(stateRef.current, traceRef.current, 0));

  const reset = useCallback(() => {
    stateRef.current = createState();
    traceRef.current = new Map();
    execRef.current = 0;
    setSnap(snapshotOf(stateRef.current, traceRef.current, 0));
  }, []);

  useEffect(() => {
    if (!running) {
      // STOP: saídas desligam e a próxima partida é "a frio".
      reset();
      return;
    }
    let last = performance.now();
    let pending = 0;
    const id = window.setInterval(() => {
      const now = performance.now();
      pending += Math.min(now - last, 250);
      last = now;

      let n = 0;
      const t0 = performance.now();
      while (pending >= scanMs && n < 100) {
        scan(programRef.current, stateRef.current, inputsRef.current, scanMs, traceRef.current);
        pending -= scanMs;
        n += 1;
      }
      if (n > 0) {
        const per = (performance.now() - t0) / n;
        execRef.current = execRef.current === 0 ? per : execRef.current * 0.9 + per * 0.1;
        setSnap(snapshotOf(stateRef.current, traceRef.current, execRef.current));
      }
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [running, scanMs, reset]);

  return { snap, reset };
}
