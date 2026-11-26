import type { ConsumeMessage } from 'amqplib';
import {
  EXCHANGE_PALAVRAS,
  FILA_LINHAS,
  PREFETCH,
  RK_CONTAGEM,
  type ContagemParcial,
  type MensagemLinha,
} from '../shared/contratos.ts';
import { conectar, declararTopologia } from '../shared/amqp.ts';
import { contarPalavras } from './contagem.ts';

// Worker independente: pode ser iniciado N vezes, em qualquer ordem, a qualquer momento.
const id = process.env.CONTADOR_ID ?? `c${process.pid}`;
const ATRASO_MS = Number(process.env.ATRASO_MS ?? 0);

const conn = await conectar();
const ch = await conn.createChannel();
await declararTopologia(ch);

// Fair dispatch: com prefetch=1 o broker so entrega a proxima linha depois do ack da
// anterior. Os contadores competem pela fila e um contador lento recebe menos linhas.
await ch.prefetch(PREFETCH);

let processadas = 0;
let encerrando = false; // vira true no Ctrl+C: para de publicar antes de fechar o canal
async function tratar(msg: ConsumeMessage | null): Promise<void> {
  if (!msg) return; // consumidor cancelado pelo broker
  let linha: MensagemLinha;
  try {
    linha = JSON.parse(msg.content.toString()) as MensagemLinha;
  } catch {
    // Mensagem invalida: descarta (requeue=false). Com requeue ela voltaria para sempre.
    ch.nack(msg, false, false);
    return;
  }

  const { jobId, numero, texto, palavras } = linha;
  const contagens = contarPalavras(texto, palavras);

  // Atraso artificial, so para mostrar ao vivo a distribuicao entre contadores.
  if (ATRASO_MS > 0) await new Promise((r) => setTimeout(r, ATRASO_MS));
  if (encerrando) return; // sem ack: ao fechar o canal, o RabbitMQ devolve a linha para a fila
  // Publica SEMPRE, mesmo com {}: o dashboard mede o progresso contando parciais.
  const parcial: ContagemParcial = { tipo: 'contagem', jobId, contadorId: id, numeroLinha: numero, contagens };
  ch.publish(EXCHANGE_PALAVRAS, RK_CONTAGEM, Buffer.from(JSON.stringify(parcial)));

  // Ack so DEPOIS do publish: se o processo morrer antes, o RabbitMQ reentrega a linha
  // a outro contador (at-least-once).
  ch.ack(msg);

  if (++processadas % 1000 === 0) console.log(`[${id}] ${processadas} linhas processadas`);
}

const { consumerTag } = await ch.consume(FILA_LINHAS, (msg) => void tratar(msg), { noAck: false });
console.log(`[${id}] aguardando linhas em ${FILA_LINHAS} (prefetch=${PREFETCH})`);

// Encerramento limpo: para de receber, deixa de publicar e so entao fecha o canal.
// Fechar com uma linha no meio do processamento fazia o publish usar um canal fechado
// (IllegalOperationError). A linha que ficou sem ack volta para a fila.
async function encerrar(): Promise<void> {
  if (encerrando) return;
  encerrando = true;
  await ch.cancel(consumerTag).catch(() => {});
  await ch.close().catch(() => {});
  await conn.close().catch(() => {});
  console.log(`[${id}] encerrado; ${processadas} linhas processadas`);
  process.exit(0);
}
process.on('SIGINT', () => void encerrar());
process.on('SIGTERM', () => void encerrar());
