// Aba "Memória": quanto do espaço de endereços o programa usa, mapa das memórias,
// tabela de variáveis ao vivo com retentividade (R) e forçamento (F).

import { useState } from 'react';
import { collectPresets, collectTags, type Forces } from '../engine/plc';
import {
  ANALOG_IN_TAGS,
  ANALOG_OUT_TAGS,
  COUNTER_TAGS,
  INPUT_TAGS,
  MEMORY_TAGS,
  OUTPUT_TAGS,
  REGISTER_TAGS,
  SYSTEM_LABELS,
  SYSTEM_TAGS,
  TIMER_TAGS,
  tagClass,
  type Program,
  type TagClass,
} from '../engine/types';
import type { RunMode, Snapshot } from '../hooks/usePlc';
import { cx, fmtSec } from '../ui';
import { NumInput } from './NumInput';

interface Pool {
  cls: TagClass;
  title: string;
  short: string;
  tags: readonly string[];
}

const POOLS: Pool[] = [
  { cls: 'I', title: 'Entradas', short: 'I', tags: INPUT_TAGS },
  { cls: 'Q', title: 'Saídas', short: 'Q', tags: OUTPUT_TAGS },
  { cls: 'M', title: 'Memórias', short: 'M', tags: MEMORY_TAGS },
  { cls: 'D', title: 'Registradores', short: 'D', tags: REGISTER_TAGS },
  { cls: 'T', title: 'Temporizadores', short: 'T', tags: TIMER_TAGS },
  { cls: 'C', title: 'Contadores', short: 'C', tags: COUNTER_TAGS },
  { cls: 'AI', title: 'Entradas analógicas', short: 'AI', tags: ANALOG_IN_TAGS },
  { cls: 'AQ', title: 'Saídas analógicas', short: 'AQ', tags: ANALOG_OUT_TAGS },
  { cls: 'S', title: 'Bits de sistema', short: 'S', tags: SYSTEM_TAGS },
];

const FORCEABLE = new Set<TagClass>(['I', 'Q', 'M', 'D', 'AI', 'AQ']);
const RETENTIVE = new Set<TagClass>(['M', 'D', 'C']);
const BIT_CLASSES = new Set<TagClass>(['I', 'Q', 'M', 'S']);

export interface MemoryPanelProps {
  program: Program;
  snap: Snapshot;
  forces: Forces;
  mode: RunMode;
  /** Quantas bobinas escrevem direto em Q com lógica própria */
  directCount: number;
  onForce: (tag: string, value: boolean | number | null) => void;
  onRetentive: (tag: string, on: boolean) => void;
  onMoveAll: () => void;
  onColdStart: () => void;
  onClearForces: () => void;
}

function Meters({ program, used }: { program: Program; used: Set<string> }) {
  return (
    <div className="meters">
      {POOLS.filter((p) => p.cls !== 'S').map((p) => {
        const n = p.tags.filter((t) => used.has(t)).length;
        const ratio = n / p.tags.length;
        return (
          <div className="meter" key={p.cls} title={`${p.title}: ${n} de ${p.tags.length} endereços em uso`}>
            <span className="addr">{p.short}</span>
            <span className="meter-bar" aria-hidden="true">
              <i style={{ width: `${Math.round(ratio * 100)}%` }} className={cx(ratio >= 0.9 && 'hot')} />
            </span>
            <span className="meter-n">
              {n}/{p.tags.length}
            </span>
          </div>
        );
      })}
      <p className="help small">
        {program.retentive.length > 0
          ? `${program.retentive.length} endereço(s) retentivo(s).`
          : 'Nenhum endereço retentivo: tudo zera quando o CLP vai para STOP.'}
      </p>
    </div>
  );
}

function MapGrid({
  title,
  tags,
  used,
  isOn,
  program,
  forces,
}: {
  title: string;
  tags: readonly string[];
  used: Set<string>;
  isOn: (tag: string) => boolean;
  program: Program;
  forces: Forces;
}) {
  const usedN = tags.filter((t) => used.has(t)).length;
  return (
    <div className="mapbox">
      <div className="map-title">
        {title} <span>{usedN} de {tags.length} em uso</span>
      </div>
      <div className="mapgrid" role="img" aria-label={`${title}: ${usedN} de ${tags.length} endereços em uso`}>
        {tags.map((t) => {
          const name = program.labels[t];
          return (
            <i
              key={t}
              className={cx(
                'mcell',
                used.has(t) && 'used',
                isOn(t) && 'on',
                program.retentive.includes(t) && 'ret',
                t in forces && 'forced',
              )}
              title={`${t}${name ? ` — ${name}` : ''} · ${used.has(t) ? 'em uso' : 'livre'}`}
            />
          );
        })}
      </div>
    </div>
  );
}

function Row({
  tag,
  p,
  presets,
}: {
  tag: string;
  p: MemoryPanelProps;
  presets: Record<string, number>;
}) {
  const cls = tagClass(tag);
  const forced = tag in p.forces;
  const isBit = BIT_CLASSES.has(cls);
  const name = p.program.labels[tag] ?? SYSTEM_LABELS[tag] ?? '';
  const live = isBit ? !!p.snap.bits[tag] : (p.snap.regs[tag] ?? 0);
  const retentive = p.program.retentive.includes(tag);

  let value;
  if (cls === 'T') {
    const s = p.snap.timers[tag];
    value = (
      <>
        <span className="mon-val">
          {fmtSec(s?.acc ?? 0)} / {fmtSec(presets[tag] ?? 0)}
        </span>
        <span className={cx('led', s?.dn && 'on')} title="Bit DN" />
      </>
    );
  } else if (cls === 'C') {
    const s = p.snap.counters[tag];
    value = (
      <>
        <span className="mon-val">
          {s?.acc ?? 0} / {presets[tag] ?? 0}
        </span>
        <span className={cx('led', s?.dn && 'on')} title="Bit DN" />
      </>
    );
  } else if (isBit) {
    const v = forced ? !!p.forces[tag] : (live as boolean);
    value = forced ? (
      <button
        className={cx('led-btn', v && 'on')}
        role="switch"
        aria-checked={v}
        aria-label={`Valor forçado de ${tag}`}
        title="Clique para alternar o valor forçado"
        onClick={() => p.onForce(tag, !v)}
      >
        {v ? '1' : '0'}
      </button>
    ) : (
      <>
        <span className="mon-val">{v ? '1' : '0'}</span>
        <span className={cx('led', v && 'on')} />
      </>
    );
  } else {
    value = forced ? (
      <NumInput
        className="force-num"
        value={Number(p.forces[tag])}
        label={`Valor forçado de ${tag}`}
        onCommit={(n) => p.onForce(tag, Math.trunc(n))}
      />
    ) : (
      <span className="mon-val">{live as number}</span>
    );
  }

  return (
    <div className={cx('mem-row', forced && 'forced')}>
      <span className="addr">{tag}</span>
      <span className="mon-name" title={name}>
        {name}
      </span>
      <span className="mem-val">{value}</span>
      {RETENTIVE.has(cls) ? (
        <button
          className={cx('tgl', retentive && 'on')}
          aria-pressed={retentive}
          aria-label={`${tag} retentivo`}
          title={retentive ? 'Retentivo: mantém o valor após STOP → RUN' : 'Tornar retentivo (manter o valor após STOP → RUN)'}
          onClick={() => p.onRetentive(tag, !retentive)}
        >
          R
        </button>
      ) : (
        <span />
      )}
      {FORCEABLE.has(cls) ? (
        <button
          className={cx('tgl force', forced && 'on')}
          aria-pressed={forced}
          aria-label={`Forçar ${tag}`}
          title={forced ? 'Forçado: ignora o programa. Clique para liberar.' : 'Forçar um valor (ignora o programa)'}
          onClick={() => p.onForce(tag, forced ? null : isBit ? !!live : (live as number))}
        >
          F
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}

export function MemoryPanel(p: MemoryPanelProps) {
  const [showAll, setShowAll] = useState(false);
  const used = collectTags(p.program);
  const presets = collectPresets(p.program);
  const forcedCount = Object.keys(p.forces).length;

  return (
    <div className="inspector">
      <div className="sec">
        <h3>Uso de endereços</h3>
        <Meters program={p.program} used={used} />
        {p.directCount > 0 ? (
          <div className="nudge">
            <p>
              <b>{p.directCount}</b> {p.directCount === 1 ? 'bobina escreve' : 'bobinas escrevem'} direto em saídas Q. A
              lógica fica melhor em memórias (M), com o Q só no final.
            </p>
            <button onClick={p.onMoveAll}>Mover para memórias</button>
          </div>
        ) : (
          <p className="help ok small">Nenhuma saída direta: a lógica está em memórias e o Q só copia no final.</p>
        )}
      </div>

      <div className="sec">
        <h3>Mapa de memória</h3>
        <MapGrid
          title="Memórias M"
          tags={MEMORY_TAGS}
          used={used}
          isOn={(t) => !!p.snap.bits[t]}
          program={p.program}
          forces={p.forces}
        />
        <MapGrid
          title="Registradores D"
          tags={REGISTER_TAGS}
          used={used}
          isOn={(t) => (p.snap.regs[t] ?? 0) !== 0}
          program={p.program}
          forces={p.forces}
        />
        <div className="map-legend" aria-hidden="true">
          <span>
            <i className="mcell" /> livre
          </span>
          <span>
            <i className="mcell used" /> em uso
          </span>
          <span>
            <i className="mcell used on" /> ligada
          </span>
          <span>
            <i className="mcell used ret" /> retentiva
          </span>
        </div>
      </div>

      <div className="sec">
        <h3>Variáveis</h3>
        <p className="help small">
          <b>R</b> mantém o valor depois de um STOP. <b>F</b> força um valor, ignorando o programa — como no monitor de um CLP
          de verdade.
        </p>
        <label className="check">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          <span>Mostrar todos os endereços (para forçar os que o programa não usa)</span>
        </label>
        {POOLS.map((pool) => {
          const tags = pool.tags.filter((t) => showAll || used.has(t) || t in p.forces);
          if (tags.length === 0) return null;
          return (
            <div className="mem-group" key={pool.cls}>
              <div className="mem-head">{pool.title}</div>
              {tags.map((t) => (
                <Row key={t} tag={t} p={p} presets={presets} />
              ))}
            </div>
          );
        })}
        {used.size === 0 && !showAll && <p className="help">Os endereços usados no programa aparecem aqui, ao vivo.</p>}
        <div className="actions">
          <button onClick={p.onColdStart} title="Zera toda a memória, inclusive as retentivas, como uma partida a frio">
            Zerar memória
          </button>
          {forcedCount > 0 && <button onClick={p.onClearForces}>Soltar {forcedCount} forçado(s)</button>}
        </div>
        {p.mode === 'stop' && <p className="help small">CLP parado: os valores mostrados são os que ficaram retidos.</p>}
      </div>
    </div>
  );
}
