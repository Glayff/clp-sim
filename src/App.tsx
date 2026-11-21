import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Inspector } from './components/Inspector';
import { IOPanel } from './components/IOPanel';
import { Ladder, isLogicTool, type LadderApi, type Tool } from './components/Ladder';
import { Palette } from './components/Palette';
import { TopBar } from './components/TopBar';
import {
  addRung,
  findNode,
  insertLogic,
  insertOutput,
  moveRung,
  nextFreeTag,
  removeLastBranch,
  removeNode,
  removeRung,
  setLabel,
  setRungComment,
  updateNode,
  wrapInParallel,
} from './engine/edit';
import { EXAMPLES, emptyProgram } from './engine/examples';
import { parseProgram, serializeProgram } from './engine/io';
import { collectPresets, validate } from './engine/plc';
import {
  INPUT_TAGS,
  tagClass,
  uid,
  type Contact,
  type InputKind,
  type OutputKind,
  type OutputNode,
  type Program,
  type Warning,
} from './engine/types';
import { useHistory } from './hooks/useHistory';
import { usePlc } from './hooks/usePlc';

const STORAGE_KEY = 'clp-sim:program:v1';

function loadInitial(): Program {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = parseProgram(raw);
      if (p) return p;
    }
  } catch {
    /* sem armazenamento: começa pelo primeiro exemplo */
  }
  return EXAMPLES[0].build();
}

function makeOutput(tool: Tool, p: Program): OutputNode {
  const id = uid();
  switch (tool) {
    case 'coil':
    case 'ncoil':
    case 'set':
      return { id, kind: tool, tag: nextFreeTag(p, 'Q') };
    case 'rst': {
      // Normalmente o RESET fecha o par de um SET já existente.
      let target = nextFreeTag(p, 'Q');
      for (const r of p.rungs) for (const o of r.outputs) if (o.kind === 'set') target = o.tag;
      return { id, kind: 'rst', tag: target };
    }
    case 'ton':
    case 'tof':
      return { id, kind: tool, tag: nextFreeTag(p, 'T'), preset: 3000 };
    case 'ctu':
      return { id, kind: 'ctu', tag: nextFreeTag(p, 'C'), preset: 10 };
    default: {
      const defined = Object.keys(collectPresets(p));
      const target = defined.find((t) => tagClass(t) === 'C') ?? defined[0] ?? 'C0';
      return { id, kind: 'res', tag: target };
    }
  }
}

function Legend(props: {
  program: Program;
  warnings: Warning[];
  onName: (v: string) => void;
  onDescription: (v: string) => void;
}) {
  return (
    <footer className="legend" onClick={(e) => e.stopPropagation()}>
      <label>
        Projeto
        <input value={props.program.name} maxLength={80} onChange={(e) => props.onName(e.target.value)} />
      </label>
      <label>
        Descrição
        <textarea
          rows={3}
          value={props.program.description}
          maxLength={1000}
          placeholder="O que este programa faz?"
          onChange={(e) => props.onDescription(e.target.value)}
        />
      </label>
      <div className="stat">
        Degraus
        <b>{props.program.rungs.length}</b>
      </div>
      <div className="stat">
        Avisos
        <b>{props.warnings.length}</b>
      </div>
    </footer>
  );
}

export default function App() {
  const [initial] = useState(loadInitial);
  const { program, canUndo, canRedo, commit, undo, redo } = useHistory(initial);

  const [actuated, setActuated] = useState<Record<string, boolean>>({});
  const [running, setRunning] = useState(true);
  const [scanMs, setScanMs] = useState(10);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Nível elétrico de cada entrada: botão NF dá 1 em repouso e 0 quando pressionado.
  const physical = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const tag of INPUT_TAGS) {
      const kind = program.inputKinds[tag] ?? 'toggle';
      const on = !!actuated[tag];
      m[tag] = kind === 'pushNC' ? !on : on;
    }
    return m;
  }, [program.inputKinds, actuated]);

  const { snap, reset } = usePlc(program, physical, running, scanMs);
  const warnings = useMemo(() => validate(program), [program]);
  const warnRungs = useMemo(() => new Set(warnings.map((w) => w.rungId)), [warnings]);
  const found = useMemo(() => (selectedId ? findNode(program, selectedId) : null), [program, selectedId]);

  // Salva automaticamente no navegador/aplicativo.
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, serializeProgram(program));
    } catch {
      /* ignora: o salvamento em arquivo continua disponível */
    }
  }, [program]);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(id);
  }, [notice]);

  const loadProgram = useCallback(
    (p: Program, message: string) => {
      commit(() => p);
      setActuated({});
      setSelectedId(null);
      setTool(null);
      reset();
      setNotice(message);
    },
    [commit, reset],
  );

  // ---- Atalhos de teclado ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest('input, textarea, select')) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if (e.key === 'Escape') {
        setTool(null);
        setSelectedId(null);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        commit((p) => removeNode(p, selectedId));
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, commit, selectedId]);

  // ---- Arquivo ----
  const onSave = () => {
    const blob = new Blob([serializeProgram(program)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const slug =
      program.name
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase() || 'programa';
    a.href = url;
    a.download = `${slug}.clp.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const p = parseProgram(await file.text());
    if (p) loadProgram(p, `Aberto: ${file.name}`);
    else setNotice('Não foi possível abrir: o arquivo não é um programa do CLP Sim.');
  };

  // ---- Edição ----
  const api: LadderApi = {
    snap,
    program,
    selectedId,
    tool,
    warnRungs,
    onSelect: setSelectedId,
    onInsertLogic: (rungId, key, index) => {
      if (!isLogicTool(tool)) return;
      const node: Contact = { id: uid(), kind: 'contact', tag: 'I0', nc: tool === 'contact-nf' };
      commit((p) => insertLogic(p, rungId, key, index, node));
      setSelectedId(node.id);
    },
    onInsertOutput: (rungId, index) => {
      if (!tool || isLogicTool(tool)) return;
      const node = makeOutput(tool, program);
      commit((p) => insertOutput(p, rungId, index, node));
      setSelectedId(node.id);
    },
    onComment: (id, text) => commit((p) => setRungComment(p, id, text), `comment:${id}`),
    onAddRung: (afterId) => commit((p) => addRung(p, afterId)),
    onRemoveRung: (id) => {
      commit((p) => removeRung(p, id));
      setSelectedId(null);
    },
    onMoveRung: (id, dir) => commit((p) => moveRung(p, id, dir)),
  };

  return (
    <div className="app">
      <TopBar
        running={running}
        onRun={() => setRunning(true)}
        onStop={() => setRunning(false)}
        scanMs={scanMs}
        onScanMs={setScanMs}
        examples={EXAMPLES}
        onExample={(id) => {
          const ex = EXAMPLES.find((e) => e.id === id);
          if (ex) loadProgram(ex.build(), `Exemplo carregado: ${ex.title}. Ctrl+Z volta ao programa anterior.`);
        }}
        onNew={() => loadProgram(emptyProgram(), 'Programa novo. Ctrl+Z volta ao programa anterior.')}
        onOpen={() => fileRef.current?.click()}
        onSave={onSave}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        snap={snap}
      />

      <div className="workspace">
        <aside className="field-panel" aria-label="Painel de campo">
          <IOPanel
            program={program}
            actuated={actuated}
            physical={physical}
            outputs={snap.bits}
            onActuate={(tag, value) => setActuated((a) => ({ ...a, [tag]: value }))}
            onInputKind={(tag, kind: InputKind) => {
              commit((p) => ({ ...p, inputKinds: { ...p.inputKinds, [tag]: kind } }));
              setActuated((a) => ({ ...a, [tag]: false }));
            }}
            onOutputKind={(tag, kind: OutputKind) =>
              commit((p) => ({ ...p, outputKinds: { ...p.outputKinds, [tag]: kind } }))
            }
            onLabel={(tag, text) => commit((p) => setLabel(p, tag, text), `label:${tag}`)}
          />
        </aside>

        <main className="sheet-col">
          <Palette
            tool={tool}
            onTool={setTool}
            canParallel={found?.type === 'logic'}
            onParallel={() => {
              if (selectedId && found?.type === 'logic') commit((p) => wrapInParallel(p, selectedId));
            }}
          />
          <div className="sheet-scroll" onClick={() => setSelectedId(null)}>
            <div className="sheet">
              <div className="sheet-frame">
                <Ladder api={api} />
                <Legend
                  program={program}
                  warnings={warnings}
                  onName={(name) => commit((p) => ({ ...p, name }), 'meta:name')}
                  onDescription={(description) => commit((p) => ({ ...p, description }), 'meta:description')}
                />
              </div>
            </div>
          </div>
        </main>

        <aside className="side" aria-label="Propriedades e monitor">
          <Inspector
            program={program}
            snap={snap}
            found={found}
            warnings={warnings}
            onUpdate={(id, patch) => commit((p) => updateNode(p, id, patch), `upd:${id}`)}
            onRemove={(id) => {
              commit((p) => removeNode(p, id));
              setSelectedId(null);
            }}
            onWrap={(id) => commit((p) => wrapInParallel(p, id))}
            onRemoveBranch={(id) => commit((p) => removeLastBranch(p, id))}
            onLabel={(tag, text) => commit((p) => setLabel(p, tag, text), `label:${tag}`)}
          />
        </aside>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
    </div>
  );
}
