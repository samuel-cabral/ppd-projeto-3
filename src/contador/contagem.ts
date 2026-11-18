import { tokenizar } from '../shared/texto.ts';

// Conta quantas vezes cada palavra-chave aparece em UMA linha.
// Funcao pura (sem I/O) para ser testavel sem broker; scripts/e2e.ts tambem a importa.
//
// Palavra inteira: a linha e quebrada em tokens (letras/digitos Unicode, sem acento,
// minusculos) e cada token e comparado com as palavras-chave. Assim "bancodados" e
// "dadosx" NAO contam como "dados". Nao usamos regex com \b porque o \b do JS e ASCII:
// ele trata "ç" e "ã" como nao-letras e quebraria "acao" no meio de "ação".
// As palavras-chave ja chegam normalizadas pelo cliente.
export function contarPalavras(linha: string, palavras: string[]): Record<string, number> {
  const alvo = new Set(palavras);
  const contagens: Record<string, number> = {};
  for (const token of tokenizar(linha)) {
    if (alvo.has(token)) contagens[token] = (contagens[token] ?? 0) + 1;
  }
  return contagens; // so entram palavras com ocorrencia > 0
}
