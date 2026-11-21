// Estado do programa com desfazer/refazer. Edições seguidas com a mesma chave
// (ex.: digitar um nome) viram um único passo no histórico.

import { useCallback, useRef, useState } from 'react';
import type { Program } from '../engine/types';

interface History {
  past: Program[];
  present: Program;
  future: Program[];
}

const LIMIT = 100;
const COALESCE_MS = 1200;

export function useHistory(initial: Program) {
  const [h, setH] = useState<History>({ past: [], present: initial, future: [] });
  // Espelho síncrono: vários eventos antes de um novo render continuam encadeados.
  const ref = useRef(h);
  const coalesce = useRef<{ key: string; at: number } | null>(null);

  const apply = useCallback((next: History) => {
    ref.current = next;
    setH(next);
  }, []);

  const commit = useCallback(
    (update: (p: Program) => Program, key?: string) => {
      const cur = ref.current;
      const next = update(cur.present);
      if (next === cur.present) return;
      const now = Date.now();
      const merge =
        !!key && !!coalesce.current && coalesce.current.key === key && now - coalesce.current.at < COALESCE_MS;
      coalesce.current = key ? { key, at: now } : null;
      apply({
        past: merge ? cur.past : [...cur.past, cur.present].slice(-LIMIT),
        present: next,
        future: [],
      });
    },
    [apply],
  );

  const undo = useCallback(() => {
    const cur = ref.current;
    if (cur.past.length === 0) return;
    coalesce.current = null;
    apply({
      past: cur.past.slice(0, -1),
      present: cur.past[cur.past.length - 1],
      future: [cur.present, ...cur.future],
    });
  }, [apply]);

  const redo = useCallback(() => {
    const cur = ref.current;
    if (cur.future.length === 0) return;
    coalesce.current = null;
    apply({
      past: [...cur.past, cur.present],
      present: cur.future[0],
      future: cur.future.slice(1),
    });
  }, [apply]);

  return { program: h.present, canUndo: h.past.length > 0, canRedo: h.future.length > 0, commit, undo, redo };
}
