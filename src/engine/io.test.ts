import { describe, expect, it } from 'vitest';
import { parseProgram, sanitizeProgram, serializeProgram } from './io';
import { EXAMPLES, emptyProgram } from './examples';

describe('salvar e abrir', () => {
  it('cada exemplo sobrevive ao ciclo serializar → ler', () => {
    for (const ex of EXAMPLES) {
      const original = ex.build();
      const back = parseProgram(serializeProgram(original));
      expect(back, ex.title).toEqual(original);
    }
  });

  it('aceita o programa sem o envelope', () => {
    const p = emptyProgram();
    expect(parseProgram(JSON.stringify(p))).toEqual(p);
  });

  it('rejeita lixo e estruturas inválidas', () => {
    expect(parseProgram('não é json')).toBeNull();
    expect(parseProgram('[]')).toBeNull();
    expect(parseProgram('{"rungs": 3}')).toBeNull();
    expect(
      parseProgram(JSON.stringify({ rungs: [{ id: 'a', logic: [{ id: 'b', kind: 'contact', tag: 'X9' }], outputs: [] }] })),
    ).toBeNull();
    expect(
      parseProgram(JSON.stringify({ rungs: [{ id: 'a', logic: [], outputs: [{ id: 'c', kind: 'bomba', tag: 'Q0' }] }] })),
    ).toBeNull();
  });

  it('corrige valores soltos sem derrubar o programa', () => {
    const p = sanitizeProgram({
      name: 42,
      rungs: [{ id: 'r', logic: [], outputs: [{ id: 'o', kind: 'ton', tag: 'T0', preset: -5 }] }],
      labels: { Q0: 'Motor', ZZ: 'ignorado', I0: 7 },
      inputKinds: { I0: 'alavanca', I1: 'pushNC' },
    })!;
    expect(p.name).toBe('Programa');
    expect(p.rungs[0].outputs[0]).toMatchObject({ preset: 0 });
    expect(p.labels).toEqual({ Q0: 'Motor' });
    expect(p.inputKinds.I0).toBe('pushNA'); // valor inválido volta ao padrão
    expect(p.inputKinds.I1).toBe('pushNC');
  });
});

describe('salvar e abrir — instruções novas', () => {
  const rung = (outputs: unknown[], logic: unknown[] = []) => ({ id: 'r', logic, outputs });

  it('mantém operandos, escala, comparação, borda e retentivos', () => {
    const p = sanitizeProgram({
      rungs: [
        rung(
          [
            { id: 'a', kind: 'scl', src: { kind: 'tag', tag: 'AI0' }, dst: 'D0', inMin: 0, inMax: 27648, outMin: 0, outMax: 100 },
            { id: 'b', kind: 'add', a: { kind: 'tag', tag: 'D0' }, b: { kind: 'const', value: 2 }, dst: 'D1' },
            { id: 'c', kind: 'mov', src: { kind: 'const', value: 5 }, dst: 'AQ0' },
          ],
          [
            { id: 'x', kind: 'compare', op: 'ge', a: { kind: 'tag', tag: 'T0.ACC' }, b: { kind: 'const', value: 10 } },
            { id: 'y', kind: 'contact', tag: 'I0', nc: false, edge: 'rise' },
          ],
        ),
      ],
      retentive: ['D0', 'M3', 'M3', 'Q0', 'T0', 'zzz'],
    })!;
    expect(p).not.toBeNull();
    expect(p.rungs[0].logic[0]).toMatchObject({ kind: 'compare', op: 'ge' });
    expect(p.rungs[0].logic[1]).toMatchObject({ kind: 'contact', edge: 'rise' });
    expect(p.rungs[0].outputs.map((o) => o.kind)).toEqual(['scl', 'add', 'mov']);
    expect(p.retentive).toEqual(['D0', 'M3']); // sem duplicata e só M, D e C
  });

  it('rejeita operando inventado e destino que não aceita escrita', () => {
    const ruim = [
      rung([{ id: 'a', kind: 'mov', src: { kind: 'tag', tag: 'X9' }, dst: 'D0' }]),
      rung([{ id: 'a', kind: 'mov', src: { kind: 'const', value: 1 }, dst: 'AI0' }]), // entrada analógica não se escreve
      rung([{ id: 'a', kind: 'mov', src: { kind: 'const', value: 1 }, dst: 'Q0' }]),
      rung([{ id: 'a', kind: 'add', a: { kind: 'const', value: 1 }, b: { kind: 'const', value: NaN }, dst: 'D0' }]),
      rung([], [{ id: 'x', kind: 'compare', op: 'maior', a: { kind: 'const', value: 1 }, b: { kind: 'const', value: 1 } }]),
    ];
    for (const r of ruim) expect(sanitizeProgram({ rungs: [r] })).toBeNull();
  });

  it('tipo de borda desconhecido vira contato comum em vez de derrubar o arquivo', () => {
    const p = sanitizeProgram({
      rungs: [rung([], [{ id: 'y', kind: 'contact', tag: 'I0', nc: false, edge: 'sempre' }])],
    })!;
    expect(p.rungs[0].logic[0]).not.toHaveProperty('edge');
  });

  it('arquivo da versão 1 (sem retentive) ainda abre', () => {
    const p = parseProgram(
      JSON.stringify({
        app: 'clp-sim',
        version: 1,
        program: { name: 'Antigo', description: '', rungs: [rung([{ id: 'o', kind: 'coil', tag: 'Q0' }])], labels: {} },
      }),
    )!;
    expect(p.name).toBe('Antigo');
    expect(p.retentive).toEqual([]);
  });

  it('nomes simbólicos aceitam D, AI, AQ e M', () => {
    const p = sanitizeProgram({ rungs: [], labels: { D0: 'Nível', AI0: 'Sensor', AQ1: 'Válvula', M9: 'Pedido', X1: 'não' } })!;
    expect(p.labels).toEqual({ D0: 'Nível', AI0: 'Sensor', AQ1: 'Válvula', M9: 'Pedido' });
  });
});
