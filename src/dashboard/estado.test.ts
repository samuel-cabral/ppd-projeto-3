import { describe, expect, it } from 'vitest';
import { aplicar } from './estado.ts';
import type { EstadoJob } from '../shared/contratos.ts';

const contagem = (jobId: string, contadorId: string, n: number, contagens: Record<string, number>) =>
  ({ tipo: 'contagem', jobId, contadorId, numeroLinha: n, contagens }) as const;
const fim = (jobId: string, paridade: 'par' | 'impar', linhasEnviadas: number) =>
  ({ tipo: 'fim', jobId, paridade, linhasEnviadas }) as const;

describe('estado do dashboard', () => {
  it('soma varias parciais e conta linhas por contador', () => {
    const m = new Map<string, EstadoJob>();
    aplicar(m, { tipo: 'job', jobId: 'a', arquivo: 'x.txt', palavras: ['dados', 'fila'], iniciadoEm: 1 });
    aplicar(m, contagem('a', 'c1', 1, { dados: 2 }));
    aplicar(m, contagem('a', 'c2', 2, { dados: 1, fila: 3 }));
    const j = aplicar(m, contagem('a', 'c1', 3, {}));
    expect(j.totais).toEqual({ dados: 3, fila: 3 });
    expect(j.linhasProcessadas).toBe(3);
    expect(j.porContador).toEqual({ c1: 2, c2: 1 });
    expect(j.concluidoEm).toBeNull();
  });

  it('fim chegando antes das contagens ainda conclui', () => {
    const m = new Map<string, EstadoJob>();
    aplicar(m, fim('a', 'par', 1));
    aplicar(m, fim('a', 'impar', 2));
    aplicar(m, contagem('a', 'c1', 1, { x: 1 }));
    aplicar(m, contagem('a', 'c1', 2, {}));
    expect(m.get('a')!.concluidoEm).toBeNull();
    const j = aplicar(m, contagem('a', 'c2', 3, {}));
    expect(j.totalEsperado).toBe(3);
    expect(j.concluidoEm).not.toBeNull();
  });

  it('mantem jobs separados por jobId', () => {
    const m = new Map<string, EstadoJob>();
    aplicar(m, contagem('a', 'c1', 1, { dados: 5 }));
    aplicar(m, contagem('b', 'c1', 1, { dados: 1 }));
    expect(m.get('a')!.totais.dados).toBe(5);
    expect(m.get('b')!.totais.dados).toBe(1);
    expect(m.size).toBe(2);
  });

  it('contagem antes do job cria o job e o job posterior nao zera os totais', () => {
    const m = new Map<string, EstadoJob>();
    aplicar(m, contagem('a', 'c1', 1, { dados: 4 }));
    expect(m.get('a')!.arquivo).toBe('?');
    const j = aplicar(m, { tipo: 'job', jobId: 'a', arquivo: 'x.txt', palavras: ['dados', 'fila'], iniciadoEm: 9 });
    expect(j.totais).toEqual({ dados: 4, fila: 0 });
    expect(j.arquivo).toBe('x.txt');
    expect(j.linhasProcessadas).toBe(1);
  });
});
