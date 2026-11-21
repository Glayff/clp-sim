// Coluna da direita: propriedades do elemento selecionado, diagnóstico e monitor de variáveis.

import { collectPresets, collectTags } from '../engine/plc';
import type { Found } from '../engine/edit';
import {
  COUNTER_TAGS,
  INPUT_TAGS,
  MEMORY_TAGS,
  OUTPUT_TAGS,
  TIMER_TAGS,
  type Program,
  type Warning,
} from '../engine/types';
import type { Snapshot } from '../hooks/usePlc';
import { cx, fmtSec, trunc } from '../ui';
import { Icon } from './Icons';

type Group = { title: string; tags: readonly string[] };
const G_IN: Group = { title: 'Entradas', tags: INPUT_TAGS };
const G_OUT: Group = { title: 'Saídas', tags: OUTPUT_TAGS };
const G_MEM: Group = { title: 'Memórias auxiliares', tags: MEMORY_TAGS };
const G_TMR: Group = { title: 'Temporizadores (bit DN)', tags: TIMER_TAGS };
const G_CNT: Group = { title: 'Contadores (bit DN)', tags: COUNTER_TAGS };

function TagSelect({
  value,
  groups,
  labels,
  onChange,
}: {
  value: string;
  groups: Group[];
  labels: Record<string, string>;
  onChange: (tag: string) => void;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Endereço">
      {groups.map((g) => (
        <optgroup key={g.title} label={g.title}>
          {g.tags.map((t) => (
            <option key={t} value={t}>
              {t}
              {labels[t] ? ` — ${trunc(labels[t], 28)}` : ''}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

const DESCRIPTIONS: Record<string, string> = {
  'contact-na': 'Deixa a energia passar quando o endereço vale 1.',
  'contact-nf': 'Deixa a energia passar quando o endereço vale 0.',
  coil: 'Liga o endereço enquanto o degrau estiver energizado.',
  ncoil: 'Liga o endereço enquanto o degrau estiver sem energia.',
  set: 'Liga o endereço e o mantém ligado, mesmo depois que o degrau perde a energia.',
  rst: 'Desliga um endereço que foi mantido por SET.',
  ton: 'Conta enquanto o degrau está energizado. O bit DN liga ao chegar no preset e tudo zera quando a energia some.',
  tof: 'O bit DN liga assim que o degrau energiza e só desliga depois do preset, contado a partir da perda de energia.',
  ctu: 'Soma 1 a cada subida do degrau. O bit DN liga quando a contagem chega ao preset.',
  res: 'Zera o contador ou temporizador enquanto o degrau estiver energizado.',
  parallel: 'Ramos em paralelo funcionam como OU: basta um deles deixar a energia passar.',
};

const TITLES: Record<string, string> = {
  'contact-na': 'Contato NA',
  'contact-nf': 'Contato NF',
  coil: 'Bobina',
  ncoil: 'Bobina negada',
  set: 'Bobina SET',
  rst: 'Bobina RESET',
  ton: 'Temporizador TON',
  tof: 'Temporizador TOF',
  ctu: 'Contador CTU',
  res: 'Zerar contador/temporizador',
  parallel: 'Ramos em paralelo',
};

export interface InspectorProps {
  program: Program;
  snap: Snapshot;
  found: Found | null;
  warnings: Warning[];
  onUpdate: (id: string, patch: Record<string, unknown>) => void;
  onRemove: (id: string) => void;
  onWrap: (id: string) => void;
  onRemoveBranch: (id: string) => void;
  onLabel: (tag: string, text: string) => void;
}

function Selection({ p }: { p: InspectorProps }) {
  const f = p.found;
  if (!f) {
    return (
      <div className="sec">
        <h3>Como editar</h3>
        <p className="help">
          Escolha uma instrução na barra acima e clique em um <b>+</b> do degrau para inserir. Clique em qualquer elemento
          para trocar endereço, tipo e valores aqui.
        </p>
        <p className="help">
          Para fazer o selo de uma partida: selecione o contato do botão LIGA e use <b>Em paralelo</b>; depois insira um
          contato com o endereço da saída no ramo de baixo.
        </p>
      </div>
    );
  }

  const node = f.node;
  const key = node.kind === 'contact' ? (node.nc ? 'contact-nf' : 'contact-na') : node.kind;
  const tag = node.kind === 'parallel' ? null : node.tag;

  return (
    <div className="sec">
      <h3>{TITLES[key]}</h3>
      <p className="help">{DESCRIPTIONS[key]}</p>

      {node.kind === 'contact' && (
        <>
          <div className="field">
            <span>Tipo</span>
            <div className="seg">
              <button className={cx(!node.nc && 'on')} onClick={() => p.onUpdate(node.id, { nc: false })}>
                NA
              </button>
              <button className={cx(node.nc && 'on')} onClick={() => p.onUpdate(node.id, { nc: true })}>
                NF
              </button>
            </div>
          </div>
          <div className="field">
            <span>Endereço</span>
            <TagSelect
              value={node.tag}
              labels={p.program.labels}
              groups={[G_IN, G_OUT, G_MEM, G_TMR, G_CNT]}
              onChange={(t) => p.onUpdate(node.id, { tag: t })}
            />
          </div>
        </>
      )}

      {(node.kind === 'coil' || node.kind === 'ncoil' || node.kind === 'set' || node.kind === 'rst') && (
        <>
          <div className="field">
            <span>Instrução</span>
            <select value={node.kind} onChange={(e) => p.onUpdate(node.id, { kind: e.target.value })} aria-label="Instrução">
              <option value="coil">Bobina</option>
              <option value="ncoil">Bobina negada</option>
              <option value="set">SET (trava)</option>
              <option value="rst">RESET (destrava)</option>
            </select>
          </div>
          <div className="field">
            <span>Endereço</span>
            <TagSelect
              value={node.tag}
              labels={p.program.labels}
              groups={[G_OUT, G_MEM]}
              onChange={(t) => p.onUpdate(node.id, { tag: t })}
            />
          </div>
        </>
      )}

      {(node.kind === 'ton' || node.kind === 'tof') && (
        <>
          <div className="field">
            <span>Tipo</span>
            <div className="seg">
              <button className={cx(node.kind === 'ton' && 'on')} onClick={() => p.onUpdate(node.id, { kind: 'ton' })}>
                TON
              </button>
              <button className={cx(node.kind === 'tof' && 'on')} onClick={() => p.onUpdate(node.id, { kind: 'tof' })}>
                TOF
              </button>
            </div>
          </div>
          <div className="field">
            <span>Endereço</span>
            <TagSelect
              value={node.tag}
              labels={p.program.labels}
              groups={[{ title: 'Temporizadores', tags: TIMER_TAGS }]}
              onChange={(t) => p.onUpdate(node.id, { tag: t })}
            />
          </div>
          <div className="field">
            <span>Preset (s)</span>
            <input
              type="number"
              min={0}
              max={3600}
              step={0.1}
              value={node.preset / 1000}
              aria-label="Preset em segundos"
              onChange={(e) => {
                const s = Number(e.target.value);
                if (Number.isFinite(s) && s >= 0) p.onUpdate(node.id, { preset: Math.round(s * 1000) });
              }}
            />
          </div>
        </>
      )}

      {node.kind === 'ctu' && (
        <>
          <div className="field">
            <span>Endereço</span>
            <TagSelect
              value={node.tag}
              labels={p.program.labels}
              groups={[{ title: 'Contadores', tags: COUNTER_TAGS }]}
              onChange={(t) => p.onUpdate(node.id, { tag: t })}
            />
          </div>
          <div className="field">
            <span>Preset</span>
            <input
              type="number"
              min={1}
              max={32767}
              step={1}
              value={node.preset}
              aria-label="Preset do contador"
              onChange={(e) => {
                const n = Math.floor(Number(e.target.value));
                if (Number.isFinite(n) && n >= 1) p.onUpdate(node.id, { preset: n });
              }}
            />
          </div>
        </>
      )}

      {node.kind === 'res' && (
        <div className="field">
          <span>Zera</span>
          <TagSelect
            value={node.tag}
            labels={p.program.labels}
            groups={[G_CNT, G_TMR]}
            onChange={(t) => p.onUpdate(node.id, { tag: t })}
          />
        </div>
      )}

      {tag && (
        <div className="field">
          <span>Nome de {tag}</span>
          <input
            value={p.program.labels[tag] ?? ''}
            placeholder="Sem nome"
            maxLength={40}
            aria-label={`Nome simbólico de ${tag}`}
            onChange={(e) => p.onLabel(tag, e.target.value)}
          />
        </div>
      )}

      {node.kind === 'parallel' && (
        <p className="help">
          {node.branches.length} ramos. Clique em um <b>+</b> dentro de um ramo para colocar contatos nele.
        </p>
      )}

      <div className="actions">
        {(node.kind === 'contact' || node.kind === 'parallel') && (
          <button onClick={() => p.onWrap(node.id)}>
            {node.kind === 'parallel' ? 'Adicionar ramo' : 'Em paralelo'}
          </button>
        )}
        {node.kind === 'parallel' && <button onClick={() => p.onRemoveBranch(node.id)}>Remover último ramo</button>}
        <button className="danger" onClick={() => p.onRemove(node.id)}>
          <Icon name="trash" size={15} /> {node.kind === 'parallel' ? 'Excluir grupo' : 'Excluir'}
        </button>
      </div>
    </div>
  );
}

function Monitor({ program, snap }: { program: Program; snap: Snapshot }) {
  const tags = collectTags(program);
  const presets = collectPresets(program);
  const mem = MEMORY_TAGS.filter((t) => tags.has(t));
  const tmr = TIMER_TAGS.filter((t) => tags.has(t));
  const cnt = COUNTER_TAGS.filter((t) => tags.has(t));

  if (mem.length + tmr.length + cnt.length === 0) {
    return <p className="help">Memórias, temporizadores e contadores usados no programa aparecem aqui, ao vivo.</p>;
  }
  const name = (t: string) => program.labels[t] ?? '';
  return (
    <div className="monitor">
      {mem.map((t) => (
        <div className="mon-row" key={t}>
          <span className="addr">{t}</span>
          <span className="mon-name">{name(t)}</span>
          <span className={cx('led', snap.bits[t] && 'on')} />
        </div>
      ))}
      {tmr.map((t) => {
        const s = snap.timers[t];
        return (
          <div className="mon-row" key={t}>
            <span className="addr">{t}</span>
            <span className="mon-name">{name(t)}</span>
            <span className="mon-val">
              {fmtSec(s?.acc ?? 0)} / {fmtSec(presets[t] ?? 0)}
            </span>
            <span className={cx('led', s?.dn && 'on')} title="Bit DN" />
          </div>
        );
      })}
      {cnt.map((t) => {
        const s = snap.counters[t];
        return (
          <div className="mon-row" key={t}>
            <span className="addr">{t}</span>
            <span className="mon-name">{name(t)}</span>
            <span className="mon-val">
              {s?.acc ?? 0} / {presets[t] ?? 0}
            </span>
            <span className={cx('led', s?.dn && 'on')} title="Bit DN" />
          </div>
        );
      })}
    </div>
  );
}

export function Inspector(p: InspectorProps) {
  return (
    <div className="inspector">
      <Selection p={p} />
      <div className="sec">
        <h3>Diagnóstico</h3>
        {p.warnings.length === 0 ? (
          <p className="help ok">Nenhum aviso. O programa não tem bobinas duplicadas nem blocos faltando.</p>
        ) : (
          <ul className="warnings">
            {p.warnings.map((w, i) => (
              <li key={i}>
                <Icon name="warn" size={15} />
                <span>{w.message}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="sec">
        <h3>Monitor</h3>
        <Monitor program={p.program} snap={p.snap} />
      </div>
    </div>
  );
}
