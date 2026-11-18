// Gera um arquivo grande de teste: node scripts/gerar-arquivo.mjs [--linhas 100000] [--saida dados/grande.txt]
import { createWriteStream, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { once } from 'node:events';

const args = process.argv.slice(2);
const pega = (nome, padrao) => {
  const i = args.indexOf(`--${nome}`);
  return i >= 0 ? args[i + 1] : padrao;
};
const linhas = Number(pega('linhas', 100000));
const saida = pega('saida', 'dados/grande.txt');

const vocabulario = ('dados fila paralela mensagem broker programação distribuída IFCE processo contador ' +
  'leitor cliente servidor rede sistema computação algoritmo thread memória arquivo linha palavra ' +
  'contagem tópico produtor consumidor protocolo latência vazão escalável cluster nó evento ' +
  'serviço aplicação função variável código teste projeto aluno professor disciplina ' +
  'engenharia software hardware banco consulta resposta pedido tarefa resultado ' +
  'sincronização concorrência paralelismo desempenho eficiência fila Dados PARALELA').split(' ');

mkdirSync(dirname(saida), { recursive: true });
const out = createWriteStream(saida);
for (let i = 0; i < linhas; i++) {
  const n = 5 + Math.floor(Math.random() * 11); // 5 a 15 palavras
  const l = Array.from({ length: n }, () => vocabulario[Math.floor(Math.random() * vocabulario.length)]);
  // Respeita backpressure para nao estourar memoria com arquivos enormes.
  if (!out.write(l.join(' ') + '\n')) await once(out, 'drain');
}
out.end();
await once(out, 'finish');
console.log(`${linhas} linhas gravadas em ${saida}`);
