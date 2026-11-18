// Normalizacao unica para cliente e contador: sem acento, minusculo.
// Assim "Programação", "PROGRAMACAO" e "programacao" contam igual.
export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

// Palavra = sequencia de letras/digitos Unicode. O \b do JS e ASCII e quebraria em "acao".
export function tokenizar(linha: string): string[] {
  return normalizar(linha).match(/[\p{L}\p{N}]+/gu) ?? [];
}

// Entrada livre do usuario -> lista de palavras-chave unicas e normalizadas.
export function parsePalavras(entrada: string): string[] {
  return [...new Set(tokenizar(entrada))];
}
