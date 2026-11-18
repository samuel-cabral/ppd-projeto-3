// Leitor: processo filho do cliente. Le o arquivo em streaming e produz so as linhas da sua paridade.
import { createReadStream } from 'node:fs';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import { EXCHANGE_PALAVRAS, FILA_LINHAS, RK_FIM } from '../shared/contratos.ts';
import type { FimLeitura, MensagemLeitorIPC, MensagemLinha, Paridade } from '../shared/contratos.ts';
import { conectar, declararTopologia } from '../shared/amqp.ts';

const { values } = parseArgs({
  options: {
    job: { type: 'string' },
    arquivo: { type: 'string' },
    paridade: { type: 'string' },
    palavras: { type: 'string' },
  },
});

if (!values.job || !values.arquivo || !values.palavras || (values.paridade !== 'par' && values.paridade !== 'impar')) {
  console.error('uso: --job <id> --arquivo <caminho> --paridade par|impar --palavras a,b,c');
  process.exit(2);
}
const jobId = values.job;
const paridade: Paridade = values.paridade;
const palavras = values.palavras.split(',').filter(Boolean);
const resto = paridade === 'par' ? 0 : 1;

const conn = await conectar();
const ch = await conn.createChannel();
await declararTopologia(ch);

let enviadas = 0;
let numero = 0;
// readline sobre stream: o arquivo nunca fica inteiro na memoria.
const linhas = createInterface({ input: createReadStream(values.arquivo, 'utf8'), crlfDelay: Infinity });

for await (const texto of linhas) {
  numero++; // numeracao 1-based sobre TODAS as linhas, inclusive vazias
  if (numero % 2 !== resto) continue;
  const msg: MensagemLinha = { jobId, paridade, numero, texto, palavras };
  // persistent:false = mais rapido; perder linhas so se o broker cair, aceitavel aqui.
  const ok = ch.sendToQueue(FILA_LINHAS, Buffer.from(JSON.stringify(msg)), { persistent: false });
  // Backpressure: buffer do canal cheio, espera esvaziar antes de produzir mais.
  if (!ok) await once(ch, 'drain');
  enviadas++;
  if (enviadas % 1000 === 0) {
    const ipc: MensagemLeitorIPC = { tipo: 'progresso', paridade, enviadas };
    process.send?.(ipc);
  }
}

// Avisa o fim pelo topico: o dashboard soma os dois fins para saber o total esperado.
const fim: FimLeitura = { tipo: 'fim', jobId, paridade, linhasEnviadas: enviadas };
ch.publish(EXCHANGE_PALAVRAS, RK_FIM, Buffer.from(JSON.stringify(fim)));
const ipcFim: MensagemLeitorIPC = { tipo: 'fim', paridade, enviadas };
process.send?.(ipcFim);

// Fechar so depois do flush, senao as ultimas mensagens podem se perder.
await ch.close();
await conn.close();
console.log(`[leitor ${paridade}] ${enviadas} linhas enviadas`);
process.exit(0);
