import { describe, expect, it } from 'vitest';
import { contarPalavras } from './contagem.ts';

describe('contarPalavras', () => {
  it('ignora acento', () => {
    expect(contarPalavras('Programação distribuída', ['programacao'])).toEqual({ programacao: 1 });
  });

  it('ignora caixa', () => {
    expect(contarPalavras('DADOS Dados dados', ['dados'])).toEqual({ dados: 3 });
  });

  it('conta so palavra inteira', () => {
    expect(contarPalavras('bancodados dadosx xdados', ['dados'])).toEqual({});
  });

  it('pontuacao nao atrapalha', () => {
    expect(contarPalavras('veja dados, e (fila).', ['dados', 'fila'])).toEqual({ dados: 1, fila: 1 });
  });

  it('conta repeticoes na mesma linha', () => {
    expect(contarPalavras('dados dados, dados!', ['dados'])).toEqual({ dados: 3 });
  });

  it('linha vazia devolve {}', () => {
    expect(contarPalavras('', ['dados'])).toEqual({});
  });

  it('palavra ausente nao aparece no resultado', () => {
    const r = contarPalavras('fila de mensagens', ['fila', 'dados']);
    expect(r).toEqual({ fila: 1 });
    expect('dados' in r).toBe(false);
  });
});
