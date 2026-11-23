// Painel de campo: dispositivos virtuais ligados às entradas e saídas do CLP.

import type { Forces } from '../engine/plc';
import type { InputKind, OutputKind, Program } from '../engine/types';
import { ANALOG_FULL_SCALE, ANALOG_IN_TAGS, ANALOG_OUT_TAGS, INPUT_TAGS, OUTPUT_TAGS } from '../engine/types';
import { cx } from '../ui';

const LAMP_COLORS = [
  { off: '#15402e', on: '#2ee283' }, // verde
  { off: '#4a3a12', on: '#ffb020' }, // âmbar
  { off: '#4a1a21', on: '#ff4d5e' }, // vermelho
  { off: '#193256', on: '#4da3ff' }, // azul
];

function Lamp({ on, index }: { on: boolean; index: number }) {
  const c = LAMP_COLORS[index % LAMP_COLORS.length];
  return (
    <svg
      className="device"
      viewBox="0 0 44 44"
      width={44}
      height={44}
      style={on ? { filter: `drop-shadow(0 0 8px ${c.on})` } : undefined}
      role="img"
      aria-label={on ? 'Sinaleiro aceso' : 'Sinaleiro apagado'}
    >
      <circle cx={22} cy={22} r={20} fill="#0b0f13" />
      <circle cx={22} cy={22} r={15.5} fill={on ? c.on : c.off} />
      <path
        d="M12.5 19 A10.5 10.5 0 0 1 24 11.5"
        stroke="#fff"
        strokeOpacity={on ? 0.6 : 0.16}
        strokeWidth={2.6}
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function Motor({ on }: { on: boolean }) {
  return (
    <svg
      className="device"
      viewBox="0 0 44 44"
      width={44}
      height={44}
      role="img"
      aria-label={on ? 'Motor girando' : 'Motor parado'}
      style={on ? { filter: 'drop-shadow(0 0 6px rgba(46,226,131,.55))' } : undefined}
    >
      <circle cx={22} cy={22} r={20} fill="#0b0f13" />
      <circle cx={22} cy={22} r={16} fill="#232d36" stroke={on ? '#2ee283' : '#46535f'} strokeWidth={1.5} />
      <g className={cx('rotor', on && 'spin')}>
        {[0, 120, 240].map((a) => (
          <path
            key={a}
            d="M22 22 C 17 17, 18 9, 22 7.5 C 26 9, 27 17, 22 22 Z"
            transform={`rotate(${a} 22 22)`}
            fill={on ? '#2ee283' : '#6b7a88'}
          />
        ))}
      </g>
      <circle cx={22} cy={22} r={3.2} fill="#0b0f13" />
    </svg>
  );
}

function Knob({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button className="device-btn" role="switch" aria-checked={on} aria-label={label} onClick={onToggle}>
      <svg className="device" viewBox="0 0 44 44" width={44} height={44}>
        <circle cx={22} cy={22} r={20} fill="#0b0f13" />
        <circle cx={22} cy={22} r={15} fill="#2f3a45" stroke="#4d5a67" strokeWidth={1.2} />
        <g transform={`rotate(${on ? 45 : -45} 22 22)`} style={{ transition: 'transform 120ms ease-out' }}>
          <rect x={20} y={6} width={4} height={14} rx={2} fill={on ? '#2ee283' : '#d8dfe6'} />
        </g>
      </svg>
    </button>
  );
}

function PushButton({
  kind,
  pressed,
  onChange,
  label,
}: {
  kind: 'pushNA' | 'pushNC';
  pressed: boolean;
  onChange: (pressed: boolean) => void;
  label: string;
}) {
  const nc = kind === 'pushNC';
  const color = nc ? (pressed ? '#a92a35' : '#e03e4b') : pressed ? '#1f8f55' : '#2fbf71';
  return (
    <button
      className="device-btn"
      aria-label={label}
      aria-pressed={pressed}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onChange(true);
      }}
      onPointerUp={() => onChange(false)}
      onPointerCancel={() => onChange(false)}
      onKeyDown={(e) => {
        if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
          e.preventDefault();
          onChange(true);
        }
      }}
      onKeyUp={(e) => {
        if (e.key === ' ' || e.key === 'Enter') onChange(false);
      }}
      onBlur={() => onChange(false)}
    >
      <svg className="device" viewBox="0 0 44 44" width={44} height={44}>
        <circle cx={22} cy={22} r={20} fill="#0b0f13" />
        <circle cx={22} cy={22} r={16.5} fill="#3a4550" />
        <circle cx={22} cy={pressed ? 23 : 22} r={pressed ? 12.2 : 13.5} fill={color} />
        <circle cx={22} cy={pressed ? 23 : 22} r={pressed ? 12.2 : 13.5} fill="none" stroke="#000" strokeOpacity={0.25} />
        <path
          d="M14 20 A9 9 0 0 1 23 13.5"
          stroke="#fff"
          strokeOpacity={pressed ? 0.15 : 0.4}
          strokeWidth={2}
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </button>
  );
}

const pct1 = (n: number): string => n.toFixed(1).replace('.', ',');
/** 0–27648 ↔ 4–20 mA, como nos módulos analógicos de campo. */
const rawToPct = (raw: number): number => (raw / ANALOG_FULL_SCALE) * 100;
const pctToMa = (pct: number): string => pct1(4 + pct * 0.16);

function ForceBadge() {
  return (
    <i className="fbadge" title="Valor forçado: o programa não controla este endereço" aria-label="forçado">
      F
    </i>
  );
}

export interface IOPanelProps {
  program: Program;
  /** Dispositivo acionado (chave ligada / botão pressionado) */
  actuated: Record<string, boolean>;
  /** Nível elétrico real de cada entrada */
  physical: Record<string, boolean>;
  outputs: Record<string, boolean>;
  /** Valores dos registradores (para as saídas analógicas) */
  regs: Record<string, number>;
  forces: Forces;
  /** Posição de cada entrada analógica, de 0 a 100 % */
  analogPct: Record<string, number>;
  onAnalog: (tag: string, pct: number) => void;
  onActuate: (tag: string, value: boolean) => void;
  onInputKind: (tag: string, kind: InputKind) => void;
  onOutputKind: (tag: string, kind: OutputKind) => void;
  onLabel: (tag: string, text: string) => void;
}

const INPUT_KIND_LABEL: Record<InputKind, string> = {
  toggle: 'Chave seletora',
  pushNA: 'Botão NA',
  pushNC: 'Botão NF',
};

export function IOPanel(p: IOPanelProps) {
  return (
    <div className="io">
      <h2>Entradas</h2>
      {INPUT_TAGS.map((tag) => {
        const kind = p.program.inputKinds[tag] ?? 'toggle';
        const on = !!p.actuated[tag];
        const name = p.program.labels[tag] ?? '';
        const label = name ? `${tag}, ${name}` : tag;
        const forced = tag in p.forces;
        const level = forced ? !!p.forces[tag] : p.physical[tag];
        return (
          <div className="io-row" key={tag}>
            <span className="addr">{tag}</span>
            {kind === 'toggle' ? (
              <Knob on={on} label={label} onToggle={() => p.onActuate(tag, !on)} />
            ) : (
              <PushButton kind={kind} pressed={on} label={label} onChange={(v) => p.onActuate(tag, v)} />
            )}
            <input
              className="plate"
              value={name}
              placeholder="Sem nome"
              maxLength={40}
              aria-label={`Nome da entrada ${tag}`}
              onChange={(e) => p.onLabel(tag, e.target.value)}
            />
            <div className="io-sub">
              <select
                className="mini"
                value={kind}
                aria-label={`Tipo do dispositivo em ${tag}`}
                onChange={(e) => p.onInputKind(tag, e.target.value as InputKind)}
              >
                {(Object.keys(INPUT_KIND_LABEL) as InputKind[]).map((k) => (
                  <option key={k} value={k}>
                    {INPUT_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
              {forced && <ForceBadge />}
              <span className={cx('led', level && 'on')} title={level ? 'Entrada em nível 1' : 'Entrada em nível 0'} />
            </div>
          </div>
        );
      })}

      <h2>Saídas</h2>
      {OUTPUT_TAGS.map((tag, i) => {
        const kind = p.program.outputKinds[tag] ?? 'lamp';
        const on = !!p.outputs[tag];
        const name = p.program.labels[tag] ?? '';
        return (
          <div className="io-row" key={tag}>
            <span className="addr">{tag}</span>
            {kind === 'motor' ? <Motor on={on} /> : <Lamp on={on} index={i} />}
            <input
              className="plate"
              value={name}
              placeholder="Sem nome"
              maxLength={40}
              aria-label={`Nome da saída ${tag}`}
              onChange={(e) => p.onLabel(tag, e.target.value)}
            />
            <div className="io-sub">
              <select
                className="mini"
                value={kind}
                aria-label={`Tipo do dispositivo em ${tag}`}
                onChange={(e) => p.onOutputKind(tag, e.target.value as OutputKind)}
              >
                <option value="lamp">Sinaleiro</option>
                <option value="motor">Motor</option>
              </select>
              {tag in p.forces && <ForceBadge />}
              <span className={cx('led', on && 'on')} title={on ? 'Saída ligada' : 'Saída desligada'} />
            </div>
          </div>
        );
      })}

      <h2>Entradas analógicas</h2>
      {ANALOG_IN_TAGS.map((tag) => {
        const forced = tag in p.forces;
        const pct = forced ? rawToPct(Number(p.forces[tag])) : (p.analogPct[tag] ?? 0);
        const raw = forced ? Number(p.forces[tag]) : Math.round((pct / 100) * ANALOG_FULL_SCALE);
        const name = p.program.labels[tag] ?? '';
        return (
          <div className="io-an" key={tag}>
            <span className="addr">{tag}</span>
            <input
              className="plate"
              value={name}
              placeholder="Sem nome"
              maxLength={40}
              aria-label={`Nome da entrada analógica ${tag}`}
              onChange={(e) => p.onLabel(tag, e.target.value)}
            />
            <div className="an-slide">
              <input
                type="range"
                min={0}
                max={100}
                step={0.5}
                value={pct}
                disabled={forced}
                style={{ '--p': `${pct}%` } as React.CSSProperties}
                aria-label={`${tag}${name ? `, ${name}` : ''}: sinal de 0 a 100 por cento`}
                onChange={(e) => p.onAnalog(tag, Number(e.target.value))}
              />
              <output>{pct1(pct)} %</output>
            </div>
            <div className="an-sub">
              <span>
                {pctToMa(pct)} mA · {raw.toLocaleString('pt-BR')}
              </span>
              {forced && <ForceBadge />}
            </div>
          </div>
        );
      })}

      <h2>Saídas analógicas</h2>
      {ANALOG_OUT_TAGS.map((tag) => {
        const raw = p.regs[tag] ?? 0;
        const pct = rawToPct(raw);
        const name = p.program.labels[tag] ?? '';
        return (
          <div className="io-an" key={tag}>
            <span className="addr">{tag}</span>
            <input
              className="plate"
              value={name}
              placeholder="Sem nome"
              maxLength={40}
              aria-label={`Nome da saída analógica ${tag}`}
              onChange={(e) => p.onLabel(tag, e.target.value)}
            />
            <div className="an-slide">
              <div
                className="an-gauge"
                role="meter"
                aria-label={`${tag}${name ? `, ${name}` : ''}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(pct)}
              >
                <i style={{ width: `${pct}%` }} />
              </div>
              <output>{pct1(pct)} %</output>
            </div>
            <div className="an-sub">
              <span>
                {pctToMa(pct)} mA · {raw.toLocaleString('pt-BR')}
              </span>
              {tag in p.forces && <ForceBadge />}
            </div>
          </div>
        );
      })}
    </div>
  );
}
