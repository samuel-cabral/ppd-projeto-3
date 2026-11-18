// Inicia um job: publica JobIniciado e instancia os 2 leitores (par e impar).
import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Channel, ChannelModel } from 'amqplib';
import { EXCHANGE_PALAVRAS, RK_JOB } from '../shared/contratos.ts';
import type { EventoCliente, JobIniciado, MensagemLeitorIPC, Paridade } from '../shared/contratos.ts';
import { conectar, declararTopologia } from '../shared/amqp.ts';
import { parsePalavras } from '../shared/texto.ts';

export const RAIZ = resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const DIR_DADOS = resolve(RAIZ, 'dados');

// Uma conexao so por processo do cliente (lazy): abrir uma por job seria desperdicio.
let conexao: ChannelModel | null = null;
let canal: Channel | null = null;
async function obterCanal(): Promise<Channel> {
  if (!canal) {
    conexao = await conectar();
    canal = await conexao.createChannel();
    await declararTopologia(canal);
  }
  return canal;
}

export async function fecharConexao(): Promise<void> {
  await canal?.close();
  await conexao?.close();
  canal = null;
  conexao = null;
}

export async function iniciarJob(
  arquivo: string,
  entrada: string,
  aoEvento: (e: EventoCliente) => void,
): Promise<{ jobId: string; palavras: string[]; concluido: Promise<void> }> {
  // Impede path traversal: so aceita nome simples de arquivo dentro de dados/.
  if (!arquivo || arquivo.includes('/') || arquivo.includes('\\') || arquivo.includes('..')) {
    throw new Error('nome de arquivo invalido');
  }
  const caminho = resolve(DIR_DADOS, arquivo);
  if (!existsSync(caminho)) throw new Error(`arquivo nao encontrado em dados/: ${arquivo}`);
  const palavras = parsePalavras(entrada);
  if (palavras.length === 0) throw new Error('informe ao menos uma palavra-chave');

  const jobId = 'job-' + randomUUID().slice(0, 8);
  const ch = await obterCanal();
  const job: JobIniciado = { tipo: 'job', jobId, arquivo, palavras, iniciadoEm: Date.now() };
  ch.publish(EXCHANGE_PALAVRAS, RK_JOB, Buffer.from(JSON.stringify(job)));
  aoEvento({ tipo: 'job', jobId, arquivo, palavras });

  // O enunciado manda o Cliente instanciar 2 execucoes de leitor; fork cria
  // processos do SO de verdade (nao threads), que rodam em paralelo.
  const leitorPath = fileURLToPath(new URL('../leitor/index.ts', import.meta.url));
  const filhos = (['par', 'impar'] as Paridade[]).map((paridade) => {
    const filho = fork(
      leitorPath,
      ['--job', jobId, '--arquivo', caminho, '--paridade', paridade, '--palavras', palavras.join(',')],
      { execArgv: ['--import', 'tsx'] },
    );
    filho.on('message', (m: MensagemLeitorIPC) => {
      aoEvento({ tipo: 'leitor', jobId, paridade: m.paridade, enviadas: m.enviadas, terminou: m.tipo === 'fim' });
    });
    return new Promise<void>((ok, falha) => {
      filho.on('error', falha);
      filho.on('exit', (codigo) => (codigo === 0 ? ok() : falha(new Error(`leitor ${paridade} saiu com codigo ${codigo}`))));
    });
  });

  const concluido = Promise.all(filhos).then(() => undefined);
  return { jobId, palavras, concluido };
}
