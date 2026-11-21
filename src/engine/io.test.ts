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
