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

const contact = (nc: boolean, edge?: string) => (
  <Glyph>
    <path d="M0 12h13M27 12h13M13 4v16M27 4v16" />
    {nc && <path d="M11 19L29 5" />}
    {edge && (
      <text x={20} y={15.5} textAnchor="middle" fontSize={10} fontWeight={700} fill="currentColor" stroke="none" fontFamily="IBM Plex Mono, monospace">
        {edge}
      </text>
    )}
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

type Item = { tool: Tool; label: string; hint: string; glyph: ReactNode };

const GROUPS: Array<{ title: string; items: Item[] }> = [
  {
    title: 'Contatos',
    items: [
      { tool: 'contact-na', label: 'Contato NA', hint: 'Passa energia quando o endereço vale 1', glyph: contact(false) },
      { tool: 'contact-nf', label: 'Contato NF', hint: 'Passa energia quando o endereço vale 0', glyph: contact(true) },
      { tool: 'edge-p', label: 'Borda ↑', hint: 'Passa energia por UM ciclo, quando o endereço sobe de 0 para 1', glyph: contact(false, 'P') },
      { tool: 'edge-n', label: 'Borda ↓', hint: 'Passa energia por UM ciclo, quando o endereço desce de 1 para 0', glyph: contact(false, 'N') },
      { tool: 'compare', label: 'Comparar', hint: 'Passa energia quando a comparação entre dois valores é verdadeira (=, ≠, >, ≥, <, ≤)', glyph: block('≥') },
    ],
  },
  {
    title: 'Bobinas',
    items: [
      { tool: 'mcoil', label: 'Memória M', hint: 'Bobina em uma memória auxiliar (M): é onde a lógica deve ficar', glyph: coil('M') },
      { tool: 'coil', label: 'Saída Q', hint: 'Bobina em uma saída física (Q): use só no final do programa', glyph: coil('') },
      { tool: 'ncoil', label: 'Negada', hint: 'Liga o endereço quando NÃO há energia', glyph: coil('/') },
      { tool: 'set', label: 'SET', hint: 'Liga e mantém ligado (trava)', glyph: coil('S') },
      { tool: 'rst', label: 'RESET', hint: 'Desliga um endereço travado por SET', glyph: coil('R') },
    ],
  },
  {
    title: 'Blocos',
    items: [
      { tool: 'ton', label: 'TON', hint: 'Temporizador com retardo na energização', glyph: block('TON') },
      { tool: 'tof', label: 'TOF', hint: 'Temporizador com retardo na desenergização', glyph: block('TOF') },
      { tool: 'ctu', label: 'CTU', hint: 'Contador crescente (conta bordas de subida)', glyph: block('CTU') },
      { tool: 'res', label: 'RES', hint: 'Zera um contador ou temporizador', glyph: block('RES') },
    ],
  },
  {
    title: 'Dados',
    items: [
      { tool: 'mov', label: 'MOV', hint: 'Copia um valor (constante ou registrador) para um registrador', glyph: block('MOV') },
      { tool: 'add', label: 'ADD', hint: 'Soma A + B e guarda no destino', glyph: block('ADD') },
      { tool: 'sub', label: 'SUB', hint: 'Subtrai A − B e guarda no destino', glyph: block('SUB') },
      { tool: 'mul', label: 'MUL', hint: 'Multiplica A × B e guarda no destino', glyph: block('MUL') },
      { tool: 'div', label: 'DIV', hint: 'Divide A ÷ B (inteiro) e guarda no destino', glyph: block('DIV') },
      { tool: 'scl', label: 'SCL', hint: 'Escalona um valor: ex. entrada analógica 0–27648 → 0–100 %', glyph: block('SCL') },
    ],
  },
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
      {GROUPS.map((group) => (
        <div className="palette-group" key={group.title} role="group" aria-label={group.title}>
          {group.items.map((it) => (
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
