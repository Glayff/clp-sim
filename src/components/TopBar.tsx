import type { Example } from '../engine/examples';
import type { Snapshot } from '../hooks/usePlc';
import { cx } from '../ui';
import { Icon, Logo } from './Icons';

export const SCAN_OPTIONS = [5, 10, 20, 50, 100, 250];

export interface TopBarProps {
  running: boolean;
  onRun: () => void;
  onStop: () => void;
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

export function TopBar(p: TopBarProps) {
  const exec = p.snap.execMs;
  return (
    <header className="topbar">
      <div className="brand">
        <Logo />
        <span>CLP Sim</span>
      </div>

      <div className={cx('mode', p.running ? 'run' : 'stop')} role="status" aria-live="polite">
        <i />
        <b>{p.running ? 'RUN' : 'STOP'}</b>
      </div>

      <div className="group">
        <button className="btn run" disabled={p.running} onClick={p.onRun}>
          <Icon name="play" size={15} /> <span className="lbl">Rodar</span>
        </button>
        <button className="btn stop" disabled={!p.running} onClick={p.onStop}>
          <Icon name="stop" size={15} /> <span className="lbl">Parar</span>
        </button>
      </div>

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
        {p.running ? (
          <>
            <span>
              Varreduras <b>{p.snap.scans.toLocaleString('pt-BR')}</b>
            </span>
            <span>
              Execução <b>{exec.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ms</b>
            </span>
          </>
        ) : (
          <span>Parado: saídas desligadas</span>
        )}
      </div>

      <div className="spacer" />

      <label className="select-inline">
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
