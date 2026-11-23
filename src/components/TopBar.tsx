import type { Example } from '../engine/examples';
import type { RunMode, Snapshot } from '../hooks/usePlc';
import { cx } from '../ui';
import { Icon, Logo } from './Icons';

export const SCAN_OPTIONS = [5, 10, 20, 50, 100, 250];

const MODE_TEXT: Record<RunMode, string> = { run: 'RUN', pause: 'PAUSA', stop: 'STOP' };

export interface TopBarProps {
  mode: RunMode;
  onRun: () => void;
  onPause: () => void;
  onStep: () => void;
  onStop: () => void;
  forcedCount: number;
  onClearForces: () => void;
  scanMs: number;
  onScanMs: (ms: number) => void;
  examples: Example[];
  onExample: (id: string) => void;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  snap: Snapshot;
}

function statsText(p: TopBarProps) {
  if (p.mode === 'stop') return <span>Parado: saídas desligadas</span>;
  const exec = p.snap.execMs;
  return (
    <>
      <span>
        Varreduras <b>{p.snap.scans.toLocaleString('pt-BR')}</b>
      </span>
      {p.mode === 'run' ? (
        <span>
          Execução <b>{exec.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ms</b>
        </span>
      ) : (
        <span>Use Passo para rodar um ciclo</span>
      )}
    </>
  );
}

export function TopBar(p: TopBarProps) {
  return (
    <header className="topbar">
      <div className="brand">
        <Logo />
        <span>CLP Sim</span>
      </div>

      <div className={cx('mode', p.mode)} role="status" aria-live="polite">
        <i />
        <b>{MODE_TEXT[p.mode]}</b>
      </div>

      <div className="group">
        <button className="btn run" aria-label="Rodar" disabled={p.mode === 'run'} onClick={p.onRun} title="Rodar o programa em tempo real">
          <Icon name="play" size={15} /> <span className="lbl">Rodar</span>
        </button>
        <button className="btn" aria-label="Pausar" disabled={p.mode !== 'run'} onClick={p.onPause} title="Pausar: congela o programa, mantendo a memória">
          <Icon name="pause" size={15} /> <span className="lbl">Pausar</span>
        </button>
        <button className="btn" aria-label="Passo a passo: uma varredura" disabled={p.mode === 'run'} onClick={p.onStep} title="Executar uma única varredura">
          <Icon name="step" size={15} /> <span className="lbl">Passo</span>
        </button>
        <button className="btn stop" aria-label="Parar" disabled={p.mode === 'stop'} onClick={p.onStop} title="Parar: zera a memória (menos as retentivas)">
          <Icon name="stop" size={15} /> <span className="lbl">Parar</span>
        </button>
      </div>

      {p.forcedCount > 0 && (
        <button
          className="chip-force"
          onClick={p.onClearForces}
          title="Há endereços forçados (valor imposto, ignorando o programa). Clique para remover todos."
        >
          <Icon name="bolt" size={14} />
          {p.forcedCount} {p.forcedCount === 1 ? 'forçado' : 'forçados'}
          <Icon name="close" size={13} />
        </button>
      )}

      <label className="select-inline">
        <span>Ciclo</span>
        <select value={p.scanMs} onChange={(e) => p.onScanMs(Number(e.target.value))}>
          {SCAN_OPTIONS.map((ms) => (
            <option key={ms} value={ms}>
              {ms} ms
            </option>
          ))}
        </select>
      </label>

      <div className="stats" aria-label="Estatísticas da varredura">
        {statsText(p)}
      </div>

      <div className="spacer" />

      <label className="select-inline examples">
        <span>Exemplos</span>
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) p.onExample(e.target.value);
          }}
        >
          <option value="">Abrir um exemplo…</option>
          {p.examples.map((ex) => (
            <option key={ex.id} value={ex.id}>
              {ex.title}
            </option>
          ))}
        </select>
      </label>

      <div className="group">
        <button className="icon-btn" onClick={p.onUndo} disabled={!p.canUndo} title="Desfazer (Ctrl+Z)" aria-label="Desfazer">
          <Icon name="undo" />
        </button>
        <button className="icon-btn" onClick={p.onRedo} disabled={!p.canRedo} title="Refazer (Ctrl+Y)" aria-label="Refazer">
          <Icon name="redo" />
        </button>
      </div>
      <div className="group">
        <button className="btn ghost" onClick={p.onNew} title="Novo: começar um programa vazio" aria-label="Novo">
          <Icon name="file" size={16} /> <span className="lbl">Novo</span>
        </button>
        <button className="btn ghost" onClick={p.onOpen} title="Abrir um programa salvo (.json)" aria-label="Abrir">
          <Icon name="open" size={16} /> <span className="lbl">Abrir</span>
        </button>
        <button className="btn ghost" onClick={p.onSave} title="Salvar o programa em um arquivo .json" aria-label="Salvar">
          <Icon name="save" size={16} /> <span className="lbl">Salvar</span>
        </button>
      </div>
    </header>
  );
}
