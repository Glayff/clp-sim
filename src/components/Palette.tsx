import type { ReactNode } from 'react';
import { cx } from '../ui';
import type { Tool } from './Ladder';
import { Icon } from './Icons';

function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg width={40} height={24} viewBox="0 0 40 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      {children}
    </svg>
  );
}

const contact = (nc: boolean) => (
  <Glyph>
    <path d="M0 12h13M27 12h13M13 4v16M27 4v16" />
    {nc && <path d="M11 19L29 5" />}
  </Glyph>
);
const coil = (glyph: string) => (
  <Glyph>
    <path d="M0 12h13M27 12h13" />
    <circle cx={20} cy={12} r={7} />
    {glyph && (
      <text x={20} y={15.5} textAnchor="middle" fontSize={10} fontWeight={700} fill="currentColor" stroke="none" fontFamily="IBM Plex Mono, monospace">
        {glyph}
      </text>
    )}
  </Glyph>
);
const block = (text: string) => (
  <Glyph>
    <path d="M0 12h6M34 12h6" />
    <rect x={6} y={3} width={28} height={18} rx={1.5} />
    <text x={20} y={15.2} textAnchor="middle" fontSize={8.5} fontWeight={700} fill="currentColor" stroke="none" fontFamily="IBM Plex Mono, monospace">
      {text}
    </text>
  </Glyph>
);

const GROUPS: Array<Array<{ tool: Tool; label: string; hint: string; glyph: ReactNode }>> = [
  [
    { tool: 'contact-na', label: 'Contato NA', hint: 'Passa energia quando o endereço vale 1', glyph: contact(false) },
    { tool: 'contact-nf', label: 'Contato NF', hint: 'Passa energia quando o endereço vale 0', glyph: contact(true) },
  ],
  [
    { tool: 'coil', label: 'Bobina', hint: 'Liga o endereço enquanto houver energia', glyph: coil('') },
    { tool: 'ncoil', label: 'Negada', hint: 'Liga o endereço quando NÃO há energia', glyph: coil('/') },
    { tool: 'set', label: 'SET', hint: 'Liga e mantém ligado (trava)', glyph: coil('S') },
    { tool: 'rst', label: 'RESET', hint: 'Desliga um endereço travado por SET', glyph: coil('R') },
  ],
  [
    { tool: 'ton', label: 'TON', hint: 'Temporizador com retardo na energização', glyph: block('TON') },
    { tool: 'tof', label: 'TOF', hint: 'Temporizador com retardo na desenergização', glyph: block('TOF') },
    { tool: 'ctu', label: 'CTU', hint: 'Contador crescente (conta bordas de subida)', glyph: block('CTU') },
    { tool: 'res', label: 'RES', hint: 'Zera um contador ou temporizador', glyph: block('RES') },
  ],
];

export function Palette({
  tool,
  onTool,
  canParallel,
  onParallel,
}: {
  tool: Tool | null;
  onTool: (t: Tool | null) => void;
  canParallel: boolean;
  onParallel: () => void;
}) {
  return (
    <div className="palette" role="toolbar" aria-label="Instruções Ladder">
      {GROUPS.map((group, gi) => (
        <div className="palette-group" key={gi}>
          {group.map((it) => (
            <button
              key={it.tool}
              className={cx('tool', tool === it.tool && 'active')}
              aria-pressed={tool === it.tool}
              title={it.hint}
              onClick={() => onTool(tool === it.tool ? null : it.tool)}
            >
              {it.glyph}
              <span>{it.label}</span>
            </button>
          ))}
        </div>
      ))}
      <div className="palette-group">
        <button
          className="tool"
          disabled={!canParallel}
          onClick={onParallel}
          title="Seleciona um contato (ou grupo) e cria um ramo em paralelo — é assim que se faz o selo"
        >
          <svg width={40} height={24} viewBox="0 0 40 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path d="M0 8h6M34 8h6M6 8v10M34 8v10M6 8h8M26 8h8M6 18h28M14 3v10M26 3v10" />
          </svg>
          <span>Em paralelo</span>
        </button>
      </div>
      <div className="palette-hint">
        {tool ? (
          <>
            <Icon name="plus" size={14} /> Clique em um <b>+</b> no diagrama para inserir. <kbd>Esc</kbd> cancela.
          </>
        ) : (
          'Escolha uma instrução para começar a inserir.'
        )}
      </div>
    </div>
  );
}
