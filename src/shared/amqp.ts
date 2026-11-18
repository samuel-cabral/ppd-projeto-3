import amqp from 'amqplib';
import { AMQP_URL, EXCHANGE_PALAVRAS, FILA_LINHAS } from './contratos.ts';

// O broker demora ~10 s para subir; tentar de novo evita exigir ordem de inicializacao.
export async function conectar(url = AMQP_URL, tentativas = 30): Promise<amqp.ChannelModel> {
  for (let i = 1; ; i++) {
    try {
      return await amqp.connect(url);
    } catch (e) {
      if (i >= tentativas) throw e;
      console.log('[amqp] aguardando broker...');
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

// Declaracao idempotente: todo processo chama, entao nao importa quem sobe primeiro.
export async function declararTopologia(ch: amqp.Channel): Promise<void> {
  await ch.assertQueue(FILA_LINHAS, { durable: true });
  await ch.assertExchange(EXCHANGE_PALAVRAS, 'topic', { durable: true });
}
