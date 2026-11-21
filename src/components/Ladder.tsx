// Diagrama Ladder: desenha degraus, contatos, bobinas, blocos e ramos em paralelo,
// colorindo cada fio conforme o fluxo de energia da última varredura.

import { createContext, useContext, type ReactNode } from 'react';
import { readTag } from '../engine/plc';
import type { Contact, LogicNode, OutputNode, Parallel, Program, Rung } from '../engine/types';
import type { Snapshot } from '../hooks/usePlc';
import { cx, fmtSec, trunc } from '../ui';
import { Icon } from './Icons';

export type Tool = 'contact-na' | 'contact-nf' | 'coil' | 'ncoil' | 'set' | 'rst' | 'ton' | 'tof' | 'ctu' | 'res';
export const isLogicTool = (t: Tool | null): boolean => t === 'contact-na' || t === 'contact-nf';
export const isOutputTool = (t: Tool | null): boolean => t !== null && !isLogicTool(t);

export const CELL_H = 88;
export const WIRE_Y = 44;
const CELL_W = 92;
const BLOCK_W = 132;
const SLOT_W = 30;

export interface LadderApi {
  snap: Snapshot;
  program: Program;
  selectedId: string | null;
  tool: Tool | null;
  warnRungs: Set<string>;
  onSelect(id: string | null): void;
  onInsertLogic(rungId: string, key: string, index: number): void;
  onInsertOutput(rungId: string, index: number): void;
  onComment(rungId: string, text: string): void;
  onAddRung(afterId: string): void;
  onRemoveRung(id: string): void;
  onMoveRung(id: string, dir: -1 | 1): void;
}

const ApiContext = createContext<LadderApi | null>(null);

function useApi(): LadderApi {
  const api = useContext(ApiContext);
  if (!api) throw new Error('Ladder fora do provider');
  return api;
}

// ---------- Fios ----------

/** Trecho de fio na altura do eixo do degrau, que se estica para ocupar o espaço sobrando. */
function Filler({ on, minWidth = 0 }: { on: boolean; minWidth?: number }) {
  return (
    <div className="filler" style={{ minWidth }}>
      <i className={cx('w', on && 'on')} />
    </div>
  );
}

type BusPos = 'first' | 'mid' | 'last' | 'only';

function busPos(i: number, n: number): BusPos {
  if (n === 1) return 'only';
  return i === 0 ? 'first' : i === n - 1 ? 'last' : 'mid';
}

function Bus(props: {
  side: 'l' | 'r';
  pos: BusPos;
  onV: boolean;
  onStub: boolean;
  selected?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <div
      className={cx('bus', props.side, props.pos, props.selected && 'selected', props.onClick && 'clickable')}
      onClick={
        props.onClick
          ? (e) => {
              e.stopPropagation();
              props.onClick?.();
            }
          : undefined
      }
      title={props.title}
    >
      <i className={cx('bv', props.onV && 'on')} />
      <i className={cx('bh', props.onStub && 'on')} />
    </div>
  );
}

function Slot({ on, active, onClick, label }: { on: boolean; active: boolean; onClick: () => void; label: string }) {
  return (
    <div className="slot" style={{ width: SLOT_W }}>
      <i className={cx('w', on && 'on')} />
      {active && (
        <button
          className="slot-btn"
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          aria-label={label}
          title={label}
        >
          <Icon name="plus" size={14} />
        </button>
      )}
    </div>
  );
}

// ---------- Elementos ----------

function ContactCell({ node }: { node: Contact }) {
  const api = useApi();
  const t = api.snap.trace.get(node.id);
  const value = readTag(api.snap, node.tag);
  const closed = node.nc ? !value : value;
  const label = api.program.labels[node.tag];
  const symClass = cx('sym', t?.pout ? 'on' : closed ? 'closed' : 'open');
  return (
    <button
      className={cx('cell', api.selectedId === node.id && 'selected')}
      style={{ width: CELL_W }}
      onClick={(e) => {
        e.stopPropagation();
        api.onSelect(node.id);
      }}
      aria-label={`${node.nc ? 'Contato NF' : 'Contato NA'} ${node.tag}${label ? `, ${label}` : ''}`}
      title={label ? `${node.tag} — ${label}` : node.tag}
    >
      <svg width={CELL_W} height={CELL_H} viewBox={`0 0 ${CELL_W} ${CELL_H}`}>
        <line x1={0} x2={34} y1={WIRE_Y} y2={WIRE_Y} className={cx('ln', t?.pin && 'on')} />
        <line x1={58} x2={CELL_W} y1={WIRE_Y} y2={WIRE_Y} className={cx('ln', t?.pout && 'on')} />
        <line x1={34} x2={34} y1={28} y2={60} className={symClass} />
        <line x1={58} x2={58} y1={28} y2={60} className={symClass} />
        {node.nc && <line x1={30} y1={58} x2={62} y2={30} className={symClass} />}
        <text x={CELL_W / 2} y={18} className="tag" textAnchor="middle">
          {node.tag}
        </text>
        <text x={CELL_W / 2} y={80} className="name" textAnchor="middle">
          {trunc(label, 16)}
        </text>
      </svg>
    </button>
  );
}

function OutputCell({ node }: { node: OutputNode }) {
  const api = useApi();
  const pin = api.snap.trace.get(node.id)?.pin ?? false;
  const label = api.program.labels[node.tag];
  const selected = api.selectedId === node.id;
  const select = (e: React.MouseEvent) => {
    e.stopPropagation();
    api.onSelect(node.id);
  };

  if (node.kind === 'ton' || node.kind === 'tof' || node.kind === 'ctu') {
    const isCounter = node.kind === 'ctu';
    const st = isCounter ? api.snap.counters[node.tag] : api.snap.timers[node.tag];
    const acc = st?.acc ?? 0;
    const dn = st?.dn ?? false;
    const ratio = node.preset > 0 ? Math.min(acc / node.preset, 1) : dn ? 1 : 0;
    const pre = isCounter ? String(node.preset) : fmtSec(node.preset);
    const accText = isCounter ? String(acc) : fmtSec(acc);
    return (
      <button
        className={cx('cell', selected && 'selected')}
        style={{ width: BLOCK_W }}
        onClick={select}
        aria-label={`${node.kind.toUpperCase()} ${node.tag}${label ? `, ${label}` : ''}`}
        title={label ? `${node.tag} — ${label}` : node.tag}
      >
        <svg width={BLOCK_W} height={CELL_H} viewBox={`0 0 ${BLOCK_W} ${CELL_H}`}>
          <line x1={0} x2={14} y1={WIRE_Y} y2={WIRE_Y} className={cx('ln', pin && 'on')} />
          <line x1={118} x2={BLOCK_W} y1={WIRE_Y} y2={WIRE_Y} className={cx('ln', pin && 'on')} />
          <rect x={14} y={10} width={104} height={68} rx={2} className={cx('box', dn && 'on')} />
          <text x={22} y={27} className="blk-head">
            {node.kind.toUpperCase()} {node.tag}
          </text>
          <text x={22} y={43} className="blk-line">
            PRE {pre}
          </text>
          <text x={22} y={58} className="blk-line">
            ACC {accText}
          </text>
          <rect x={22} y={66} width={88} height={5} className="bar-track" />
          <rect x={22} y={66} width={88 * ratio} height={5} className={cx('bar-fill', dn && 'on')} />
        </svg>
      </button>
    );
  }

  if (node.kind === 'res') {
    return (
      <button
        className={cx('cell', selected && 'selected')}
        style={{ width: CELL_W }}
        onClick={select}
        aria-label={`Zerar ${node.tag}${label ? `, ${label}` : ''}`}
        title={label ? `${node.tag} — ${label}` : node.tag}
      >
        <svg width={CELL_W} height={CELL_H} viewBox={`0 0 ${CELL_W} ${CELL_H}`}>
          <line x1={0} x2={16} y1={WIRE_Y} y2={WIRE_Y} className={cx('ln', pin && 'on')} />
          <line x1={76} x2={CELL_W} y1={WIRE_Y} y2={WIRE_Y} className={cx('ln', pin && 'on')} />
          <rect x={16} y={27} width={60} height={34} rx={2} className={cx('box', pin && 'on')} />
          <text x={CELL_W / 2} y={49} className="blk-head" textAnchor="middle">
            RES
          </text>
          <text x={CELL_W / 2} y={18} className="tag" textAnchor="middle">
            {node.tag}
          </text>
          <text x={CELL_W / 2} y={80} className="name" textAnchor="middle">
            {trunc(label, 16)}
          </text>
        </svg>
      </button>
    );
  }

  const glyph = node.kind === 'ncoil' ? '/' : node.kind === 'set' ? 'S' : node.kind === 'rst' ? 'R' : '';
  const names = { coil: 'Bobina', ncoil: 'Bobina negada', set: 'SET', rst: 'RESET' } as const;
  return (
    <button
      className={cx('cell', selected && 'selected')}
      style={{ width: CELL_W }}
      onClick={select}
      aria-label={`${names[node.kind]} ${node.tag}${label ? `, ${label}` : ''}`}
      title={label ? `${node.tag} — ${label}` : node.tag}
    >
      <svg width={CELL_W} height={CELL_H} viewBox={`0 0 ${CELL_W} ${CELL_H}`}>
        <line x1={0} x2={29} y1={WIRE_Y} y2={WIRE_Y} className={cx('ln', pin && 'on')} />
        <line x1={63} x2={CELL_W} y1={WIRE_Y} y2={WIRE_Y} className={cx('ln', pin && 'on')} />
        <circle cx={46} cy={WIRE_Y} r={17} className={cx('coil', pin && 'on')} />
        {glyph && (
          <text x={46} y={WIRE_Y + 5} className="coil-glyph" textAnchor="middle">
            {glyph}
          </text>
        )}
        <text x={CELL_W / 2} y={18} className="tag" textAnchor="middle">
          {node.tag}
        </text>
        <text x={CELL_W / 2} y={80} className="name" textAnchor="middle">
          {trunc(label, 16)}
        </text>
      </svg>
    </button>
  );
}

// ---------- Séries e ramos ----------

function NodeView({ node, rungId }: { node: LogicNode; rungId: string }) {
  return node.kind === 'contact' ? <ContactCell node={node} /> : <ParallelView node={node} rungId={rungId} />;
}

function Series({
  nodes,
  containerKey,
  rungId,
  pin,
}: {
  nodes: LogicNode[];
  containerKey: string;
  rungId: string;
  pin: boolean;
}) {
  const api = useApi();
  const trace = api.snap.trace;
  const slotsActive = isLogicTool(api.tool);
  const endPower = nodes.length ? (trace.get(nodes[nodes.length - 1].id)?.pout ?? false) : pin;

  const items: ReactNode[] = [];
  for (let i = 0; i <= nodes.length; i++) {
    const on = i < nodes.length ? (trace.get(nodes[i].id)?.pin ?? false) : endPower;
    items.push(
      <Slot
        key={`slot-${i}`}
        on={on}
        active={slotsActive}
        label="Inserir contato aqui"
        onClick={() => api.onInsertLogic(rungId, containerKey, i)}
      />,
    );
    if (i < nodes.length) items.push(<NodeView key={nodes[i].id} node={nodes[i]} rungId={rungId} />);
  }
  return <div className="series">{items}</div>;
}

function ParallelView({ node, rungId }: { node: Parallel; rungId: string }) {
  const api = useApi();
  const t = api.snap.trace.get(node.id);
  const selected = api.selectedId === node.id;
  const n = node.branches.length;
  return (
    <div className="par">
      {node.branches.map((branch, i) => {
        const bt = api.snap.trace.get(`${node.id}:${i}`);
        const pos = busPos(i, n);
        return (
          <div className="par-row" key={i}>
            <Bus
              side="l"
              pos={pos}
              onV={t?.pin ?? false}
              onStub={t?.pin ?? false}
              selected={selected}
              onClick={() => api.onSelect(node.id)}
              title="Ramo em paralelo — clique para selecionar"
            />
            <Series nodes={branch} containerKey={`${node.id}:${i}`} rungId={rungId} pin={t?.pin ?? false} />
            <Filler on={bt?.pout ?? false} />
            <Bus
              side="r"
              pos={pos}
              onV={t?.pout ?? false}
              onStub={bt?.pout ?? false}
              selected={selected}
              onClick={() => api.onSelect(node.id)}
              title="Ramo em paralelo — clique para selecionar"
            />
          </div>
        );
      })}
    </div>
  );
}

// ---------- Degrau ----------

function OutputColumn({ rung, power }: { rung: Rung; power: boolean }) {
  const api = useApi();
  const slotActive = isOutputTool(api.tool);
  const showSlotRow = slotActive || rung.outputs.length === 0;
  const rowCount = rung.outputs.length + (showSlotRow ? 1 : 0);

  return (
    <div className="out-col">
      {rung.outputs.map((o, i) => (
        <div className="par-row" key={o.id}>
          <Bus side="l" pos={busPos(i, rowCount)} onV={power} onStub={power} />
          <OutputCell node={o} />
          <Filler on={power} />
        </div>
      ))}
      {showSlotRow && (
        <div className="par-row">
          <Bus side="l" pos={busPos(rowCount - 1, rowCount)} onV={power} onStub={power} />
          {slotActive ? (
            <div className="out-slot" style={{ width: CELL_W }}>
              <i className={cx('w', power && 'on')} />
              <button
                className="out-slot-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  api.onInsertOutput(rung.id, rung.outputs.length);
                }}
              >
                <Icon name="plus" size={14} /> saída
              </button>
            </div>
          ) : (
            <div style={{ width: SLOT_W }} className="slot">
              <i className={cx('w', power && 'on')} />
            </div>
          )}
          <Filler on={power} />
        </div>
      )}
    </div>
  );
}

function RungView({ rung, index, total }: { rung: Rung; index: number; total: number }) {
  const api = useApi();
  const t = api.snap.trace.get(rung.id);
  const power = t?.pout ?? false;
  const warned = api.warnRungs.has(rung.id);
  return (
    <section className="rung">
      <header className="rung-head">
        <span className={cx('rung-no', power && 'on')} title={power ? 'Degrau energizado' : 'Degrau sem energia'}>
          {index + 1}
        </span>
        <input
          className="rung-comment"
          value={rung.comment}
          placeholder="Comentário do degrau"
          aria-label={`Comentário do degrau ${index + 1}`}
          onChange={(e) => api.onComment(rung.id, e.target.value)}
          onClick={(e) => e.stopPropagation()}
        />
        {warned && (
          <span className="rung-warn" title="Este degrau tem avisos — veja o diagnóstico">
            <Icon name="warn" size={16} />
          </span>
        )}
        <div className="rung-actions">
          <button title="Subir degrau" aria-label="Subir degrau" disabled={index === 0} onClick={() => api.onMoveRung(rung.id, -1)}>
            <Icon name="up" size={16} />
          </button>
          <button title="Descer degrau" aria-label="Descer degrau" disabled={index === total - 1} onClick={() => api.onMoveRung(rung.id, 1)}>
            <Icon name="down" size={16} />
          </button>
          <button title="Novo degrau abaixo" aria-label="Novo degrau abaixo" onClick={() => api.onAddRung(rung.id)}>
            <Icon name="plus" size={16} />
          </button>
          <button
            title="Excluir degrau"
            aria-label="Excluir degrau"
            disabled={total === 1 && rung.logic.length === 0 && rung.outputs.length === 0}
            onClick={() => api.onRemoveRung(rung.id)}
          >
            <Icon name="trash" size={16} />
          </button>
        </div>
      </header>
      <div className="rung-scroll">
        <div className="rung-body">
          <i className="rail" />
          <Series nodes={rung.logic} containerKey="root" rungId={rung.id} pin={t?.pin ?? false} />
          <Filler on={power} minWidth={24} />
          <OutputColumn rung={rung} power={power} />
          <i className="rail" />
        </div>
      </div>
    </section>
  );
}

export function Ladder({ api }: { api: LadderApi }) {
  return (
    <ApiContext.Provider value={api}>
      <div className="ladder">
        {api.program.rungs.map((r, i) => (
          <RungView key={r.id} rung={r} index={i} total={api.program.rungs.length} />
        ))}
        <button className="add-rung" onClick={() => api.onAddRung(api.program.rungs[api.program.rungs.length - 1]?.id ?? '')}>
          <Icon name="plus" size={16} /> Novo degrau
        </button>
      </div>
    </ApiContext.Provider>
  );
}
