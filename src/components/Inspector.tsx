// Coluna da direita (aba "Propriedades"): edição do elemento selecionado e diagnóstico.

import { directOutputCoils, type Found } from '../engine/edit';
import {
  ANALOG_IN_TAGS,
  ANALOG_OUT_TAGS,
  COMPARE_SYMBOL,
  COUNTER_TAGS,
  INPUT_TAGS,
  MEMORY_TAGS,
  OUTPUT_TAGS,
  REGISTER_TAGS,
  SYSTEM_LABELS,
  SYSTEM_TAGS,
  TIMER_TAGS,
  tagClass,
  type CompareOp,
  type Operand,
  type Program,
  type Warning,
} from '../engine/types';
import { cx, trunc } from '../ui';
import { Icon } from './Icons';
import { NumInput } from './NumInput';

type Group = { title: string; tags: readonly string[] };
const G_IN: Group = { title: 'Entradas', tags: INPUT_TAGS };
const G_OUT: Group = { title: 'Saídas', tags: OUTPUT_TAGS };
const G_MEM: Group = { title: 'Memórias auxiliares (M)', tags: MEMORY_TAGS };
const G_SYS: Group = { title: 'Sistema (só leitura)', tags: SYSTEM_TAGS };
const G_TMR: Group = { title: 'Temporizadores (bit DN)', tags: TIMER_TAGS };
const G_CNT: Group = { title: 'Contadores (bit DN)', tags: COUNTER_TAGS };
const G_REG: Group = { title: 'Registradores (D)', tags: REGISTER_TAGS };
const G_AI: Group = { title: 'Entradas analógicas', tags: ANALOG_IN_TAGS };
const G_AQ: Group = { title: 'Saídas analógicas', tags: ANALOG_OUT_TAGS };
const G_TACC: Group = { title: 'Acumulado de temporizador', tags: TIMER_TAGS.map((t) => `${t}.ACC`) };
const G_CACC: Group = { title: 'Acumulado de contador', tags: COUNTER_TAGS.map((c) => `${c}.ACC`) };

const READ_GROUPS = [G_REG, G_AI, G_AQ, G_TACC, G_CACC];
const WRITE_GROUPS = [G_REG, G_AQ];

function TagSelect({
  value,
  groups,
  labels,
  onChange,
  aria = 'Endereço',
}: {
  value: string;
  groups: Group[];
  labels: Record<string, string>;
  onChange: (tag: string) => void;
  aria?: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={aria}>
      {groups.map((g) => (
        <optgroup key={g.title} label={g.title}>
          {g.tags.map((t) => {
            const name = labels[t] ?? SYSTEM_LABELS[t];
            return (
              <option key={t} value={t}>
                {t}
                {name ? ` — ${trunc(name, 28)}` : ''}
              </option>
            );
          })}
        </optgroup>
      ))}
    </select>
  );
}

function OperandEditor({
  title,
  value,
  labels,
  onChange,
}: {
  title: string;
  value: Operand;
  labels: Record<string, string>;
  onChange: (o: Operand) => void;
}) {
  const isConst = value.kind === 'const';
  return (
    <div className="field top">
      <span>{title}</span>
      <div className="operand">
        <div className="seg small" role="group" aria-label={`${title}: tipo de valor`}>
          <button className={cx(!isConst && 'on')} onClick={() => !isConst || onChange({ kind: 'tag', tag: 'D0' })}>
            Endereço
          </button>
          <button className={cx(isConst && 'on')} onClick={() => isConst || onChange({ kind: 'const', value: 0 })}>
            Constante
          </button>
        </div>
        {value.kind === 'const' ? (
          <NumInput
            value={value.value}
            label={`${title}: valor constante`}
            onCommit={(n) => onChange({ kind: 'const', value: Math.trunc(n) })}
          />
        ) : (
          <TagSelect
            value={value.tag}
            groups={READ_GROUPS}
            labels={labels}
            aria={`${title}: endereço`}
            onChange={(tag) => onChange({ kind: 'tag', tag })}
          />
        )}
      </div>
    </div>
  );
}

function RetentiveField({
  tag,
  program,
  onRetentive,
}: {
  tag: string;
  program: Program;
  onRetentive: (tag: string, on: boolean) => void;
}) {
  const cls = tagClass(tag);
  if (cls !== 'M' && cls !== 'D' && cls !== 'C') return null;
  return (
    <label className="check">
      <input type="checkbox" checked={program.retentive.includes(tag)} onChange={(e) => onRetentive(tag, e.target.checked)} />
      <span>
        <b>{tag}</b> retentivo — guarda o valor quando o CLP vai para STOP e volta
      </span>
    </label>
  );
}

const DESCRIPTIONS: Record<string, string> = {
  'contact-na': 'Deixa a energia passar quando o endereço vale 1.',
  'contact-nf': 'Deixa a energia passar quando o endereço vale 0.',
  'edge-p': 'Deixa a energia passar por UM único ciclo, no instante em que o endereço sobe de 0 para 1. Use para contar, alternar ou somar uma vez por acionamento.',
  'edge-n': 'Deixa a energia passar por UM único ciclo, no instante em que o endereço desce de 1 para 0.',
  compare: 'Deixa a energia passar enquanto a comparação for verdadeira. Compara registradores, entradas analógicas, acumulados de T/C ou constantes.',
  coil: 'Liga o endereço enquanto o degrau estiver energizado.',
  ncoil: 'Liga o endereço enquanto o degrau estiver sem energia.',
  set: 'Liga o endereço e o mantém ligado, mesmo depois que o degrau perde a energia.',
  rst: 'Desliga um endereço que foi mantido por SET.',
  ton: 'Conta enquanto o degrau está energizado. O bit DN liga ao chegar no preset e tudo zera quando a energia some.',
  tof: 'O bit DN liga assim que o degrau energiza e só desliga depois do preset, contado a partir da perda de energia.',
  ctu: 'Soma 1 a cada subida do degrau. O bit DN liga quando a contagem chega ao preset.',
  res: 'Zera o contador ou temporizador enquanto o degrau estiver energizado.',
  mov: 'Copia o valor para o destino a cada varredura em que o degrau estiver energizado.',
  add: 'Soma A + B e grava no destino a cada varredura com o degrau energizado. Se o destino também for A ou B, use um contato de borda (P) para somar uma vez só.',
  sub: 'Calcula A − B e grava no destino a cada varredura com o degrau energizado.',
  mul: 'Calcula A × B e grava no destino a cada varredura com o degrau energizado.',
  div: 'Divide A ÷ B (parte inteira). Divisão por zero não escreve nada — o CLP não para.',
  scl: 'Converte uma faixa em outra, com limite nas pontas. Ex.: entrada analógica 0–27648 vira 0–100 %.',
  parallel: 'Ramos em paralelo funcionam como OU: basta um deles deixar a energia passar.',
};

const TITLES: Record<string, string> = {
  'contact-na': 'Contato NA',
  'contact-nf': 'Contato NF',
  'edge-p': 'Contato de borda de subida (P)',
  'edge-n': 'Contato de borda de descida (N)',
  compare: 'Comparação',
  coil: 'Bobina',
  ncoil: 'Bobina negada',
  set: 'Bobina SET',
  rst: 'Bobina RESET',
  ton: 'Temporizador TON',
  tof: 'Temporizador TOF',
  ctu: 'Contador CTU',
  res: 'Zerar contador/temporizador',
  mov: 'MOV — mover valor',
  add: 'ADD — somar',
  sub: 'SUB — subtrair',
  mul: 'MUL — multiplicar',
  div: 'DIV — dividir',
  scl: 'SCL — escalonar',
  parallel: 'Ramos em paralelo',
};

const COMPARE_NAMES: Record<CompareOp, string> = {
  eq: 'igual',
  ne: 'diferente',
  gt: 'maior',
  ge: 'maior ou igual',
  lt: 'menor',
  le: 'menor ou igual',
};

export interface InspectorProps {
  program: Program;
  found: Found | null;
  warnings: Warning[];
  onUpdate: (id: string, patch: Record<string, unknown>) => void;
  onRemove: (id: string) => void;
  onWrap: (id: string) => void;
  onRemoveBranch: (id: string) => void;
  onLabel: (tag: string, text: string) => void;
  onRetentive: (tag: string, on: boolean) => void;
  onMoveToMemory: (coilId: string) => void;
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
          <b>Boa prática:</b> faça a lógica em memórias (<b>M</b>) e deixe as saídas (<b>Q</b>) só no final, copiando de uma
          memória. Poupa endereços de saída e deixa o programa mais fácil de testar.
        </p>
        <p className="help">
          Para fazer o selo de uma partida: selecione o contato do botão LIGA e use <b>Em paralelo</b>; depois insira um
          contato com o endereço da saída no ramo de baixo.
        </p>
      </div>
    );
  }

  const node = f.node;
  const labels = p.program.labels;
  const key =
    node.kind === 'contact'
      ? node.edge === 'rise'
        ? 'edge-p'
        : node.edge === 'fall'
          ? 'edge-n'
          : node.nc
            ? 'contact-nf'
            : 'contact-na'
      : node.kind;
  const tag = 'tag' in node ? node.tag : 'dst' in node ? node.dst : null;
  const direct = f.type === 'output' && directOutputCoils(p.program).includes(node.id);
  const isData =
    node.kind === 'mov' || node.kind === 'add' || node.kind === 'sub' || node.kind === 'mul' || node.kind === 'div' || node.kind === 'scl';

  return (
    <div className="sec">
      <h3>{TITLES[key]}</h3>
      <p className="help">{DESCRIPTIONS[key]}</p>

      {node.kind === 'contact' && (
        <>
          <div className="field">
            <span>Tipo</span>
            <select
              value={node.edge ?? (node.nc ? 'nf' : 'na')}
              aria-label="Tipo do contato"
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'na') p.onUpdate(node.id, { nc: false, edge: undefined });
                else if (v === 'nf') p.onUpdate(node.id, { nc: true, edge: undefined });
                else p.onUpdate(node.id, { nc: false, edge: v });
              }}
            >
              <option value="na">Nível — normalmente aberto (NA)</option>
              <option value="nf">Nível — normalmente fechado (NF)</option>
              <option value="rise">Borda de subida (P)</option>
              <option value="fall">Borda de descida (N)</option>
            </select>
          </div>
          <div className="field">
            <span>Endereço</span>
            <TagSelect
              value={node.tag}
              labels={labels}
              groups={[G_IN, G_OUT, G_MEM, G_SYS, G_TMR, G_CNT]}
              onChange={(t) => p.onUpdate(node.id, { tag: t })}
            />
          </div>
        </>
      )}

      {node.kind === 'compare' && (
        <>
          <OperandEditor title="Valor A" value={node.a} labels={labels} onChange={(a) => p.onUpdate(node.id, { a })} />
          <div className="field">
            <span>É</span>
            <select value={node.op} aria-label="Comparação" onChange={(e) => p.onUpdate(node.id, { op: e.target.value })}>
              {(Object.keys(COMPARE_SYMBOL) as CompareOp[]).map((op) => (
                <option key={op} value={op}>
                  {COMPARE_SYMBOL[op]} {COMPARE_NAMES[op]}
                </option>
              ))}
            </select>
          </div>
          <OperandEditor title="Valor B" value={node.b} labels={labels} onChange={(b) => p.onUpdate(node.id, { b })} />
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
            <TagSelect value={node.tag} labels={labels} groups={[G_MEM, G_OUT]} onChange={(t) => p.onUpdate(node.id, { tag: t })} />
          </div>
          {direct && (
            <p className="help tip">
              Esta bobina escreve direto na saída <b>{node.tag}</b>. Passando a lógica para uma memória, o {node.tag} vira só
              uma cópia no final do programa.
            </p>
          )}
          <RetentiveField tag={node.tag} program={p.program} onRetentive={p.onRetentive} />
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
              labels={labels}
              groups={[{ title: 'Temporizadores', tags: TIMER_TAGS }]}
              onChange={(t) => p.onUpdate(node.id, { tag: t })}
            />
          </div>
          <div className="field">
            <span>Preset (s)</span>
            <NumInput
              value={node.preset / 1000}
              min={0}
              max={3600}
              step={0.1}
              label="Preset em segundos"
              onCommit={(s) => {
                if (s >= 0) p.onUpdate(node.id, { preset: Math.round(s * 1000) });
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
              labels={labels}
              groups={[{ title: 'Contadores', tags: COUNTER_TAGS }]}
              onChange={(t) => p.onUpdate(node.id, { tag: t })}
            />
          </div>
          <div className="field">
            <span>Preset</span>
            <NumInput
              value={node.preset}
              min={1}
              max={32767}
              label="Preset do contador"
              onCommit={(n) => {
                if (Math.floor(n) >= 1) p.onUpdate(node.id, { preset: Math.floor(n) });
              }}
            />
          </div>
          <RetentiveField tag={node.tag} program={p.program} onRetentive={p.onRetentive} />
        </>
      )}

      {node.kind === 'res' && (
        <div className="field">
          <span>Zera</span>
          <TagSelect value={node.tag} labels={labels} groups={[G_CNT, G_TMR]} onChange={(t) => p.onUpdate(node.id, { tag: t })} />
        </div>
      )}

      {node.kind === 'mov' && (
        <>
          <OperandEditor title="Origem" value={node.src} labels={labels} onChange={(src) => p.onUpdate(node.id, { src })} />
          <div className="field">
            <span>Destino</span>
            <TagSelect value={node.dst} labels={labels} groups={WRITE_GROUPS} aria="Destino" onChange={(dst) => p.onUpdate(node.id, { dst })} />
          </div>
        </>
      )}

      {(node.kind === 'add' || node.kind === 'sub' || node.kind === 'mul' || node.kind === 'div') && (
        <>
          <div className="field">
            <span>Operação</span>
            <select value={node.kind} aria-label="Operação" onChange={(e) => p.onUpdate(node.id, { kind: e.target.value })}>
              <option value="add">ADD — A + B</option>
              <option value="sub">SUB — A − B</option>
              <option value="mul">MUL — A × B</option>
              <option value="div">DIV — A ÷ B</option>
            </select>
          </div>
          <OperandEditor title="Valor A" value={node.a} labels={labels} onChange={(a) => p.onUpdate(node.id, { a })} />
          <OperandEditor title="Valor B" value={node.b} labels={labels} onChange={(b) => p.onUpdate(node.id, { b })} />
          <div className="field">
            <span>Destino</span>
            <TagSelect value={node.dst} labels={labels} groups={WRITE_GROUPS} aria="Destino" onChange={(dst) => p.onUpdate(node.id, { dst })} />
          </div>
        </>
      )}

      {node.kind === 'scl' && (
        <>
          <OperandEditor title="Origem" value={node.src} labels={labels} onChange={(src) => p.onUpdate(node.id, { src })} />
          <div className="field">
            <span>Entrada</span>
            <div className="pair">
              <NumInput value={node.inMin} label="Entrada: mínimo" onCommit={(n) => p.onUpdate(node.id, { inMin: n })} />
              <NumInput value={node.inMax} label="Entrada: máximo" onCommit={(n) => p.onUpdate(node.id, { inMax: n })} />
            </div>
          </div>
          <div className="field">
            <span>Saída</span>
            <div className="pair">
              <NumInput value={node.outMin} label="Saída: mínimo" onCommit={(n) => p.onUpdate(node.id, { outMin: n })} />
              <NumInput value={node.outMax} label="Saída: máximo" onCommit={(n) => p.onUpdate(node.id, { outMax: n })} />
            </div>
          </div>
          <div className="field">
            <span>Destino</span>
            <TagSelect value={node.dst} labels={labels} groups={WRITE_GROUPS} aria="Destino" onChange={(dst) => p.onUpdate(node.id, { dst })} />
          </div>
          <p className="help">As entradas analógicas chegam como 0 a 27648 (4–20 mA).</p>
        </>
      )}

      {isData && tagClass(tag ?? '') === 'D' && tag && (
        <RetentiveField tag={tag} program={p.program} onRetentive={p.onRetentive} />
      )}

      {tag && (
        <div className="field">
          <span>Nome de {tag}</span>
          <input
            value={labels[tag] ?? ''}
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
        {(node.kind === 'contact' || node.kind === 'compare' || node.kind === 'parallel') && (
          <button onClick={() => p.onWrap(node.id)}>{node.kind === 'parallel' ? 'Adicionar ramo' : 'Em paralelo'}</button>
        )}
        {node.kind === 'parallel' && <button onClick={() => p.onRemoveBranch(node.id)}>Remover último ramo</button>}
        {direct && (
          <button className="primary" onClick={() => p.onMoveToMemory(node.id)}>
            Mover lógica para memória
          </button>
        )}
        <button className="danger" onClick={() => p.onRemove(node.id)}>
          <Icon name="trash" size={15} /> {node.kind === 'parallel' ? 'Excluir grupo' : 'Excluir'}
        </button>
      </div>
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
    </div>
  );
}
