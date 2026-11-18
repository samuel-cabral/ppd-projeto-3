// Contratos do MOM: nomes no broker e formato JSON de cada mensagem.
// Todo processo importa daqui, para que produtor e consumidor nunca divirjam.

export const AMQP_URL = process.env.AMQP_URL ?? 'amqp://localhost';

// Fila point-to-point: leitores produzem, contadores competem pelas linhas.
export const FILA_LINHAS = 'ppd.linhas';

// Exchange topic: contadores/leitores/cliente publicam, dashboard assina.
export const EXCHANGE_PALAVRAS = 'ppd.palavras';
export const RK_JOB = 'palavras.job';
export const RK_CONTAGEM = 'palavras.contagem';
export const RK_FIM = 'palavras.fim';
export const BINDING_DASHBOARD = 'palavras.#';

export const PORTA_CLIENTE = Number(process.env.PORTA_CLIENTE ?? 3001);
export const PORTA_DASHBOARD = Number(process.env.PORTA_DASHBOARD ?? 3002);
export const PREFETCH = Number(process.env.PREFETCH ?? 1);

export type Paridade = 'par' | 'impar';

/** Fila ppd.linhas: uma linha do arquivo. As palavras viajam junto para o contador nao ter estado. */
export interface MensagemLinha {
  jobId: string;
  paridade: Paridade;
  numero: number; // 1-based; impar = 1,3,5...
  texto: string;
  palavras: string[]; // ja normalizadas pelo cliente
}

/** Topico, RK_JOB: publicado pelo cliente ao iniciar, para o dashboard ja mostrar as palavras com 0. */
export interface JobIniciado {
  tipo: 'job';
  jobId: string;
  arquivo: string;
  palavras: string[];
  iniciadoEm: number; // Date.now()
}

/** Topico, RK_CONTAGEM: contagem de UMA linha. O dashboard soma; nunca substitui. */
export interface ContagemParcial {
  tipo: 'contagem';
  jobId: string;
  contadorId: string;
  numeroLinha: number;
  contagens: Record<string, number>; // so palavras com > 0; {} quando nada casou
}

/** Topico, RK_FIM: cada leitor avisa quantas linhas enviou. Total esperado = soma dos dois. */
export interface FimLeitura {
  tipo: 'fim';
  jobId: string;
  paridade: Paridade;
  linhasEnviadas: number;
}

export type MensagemTopico = JobIniciado | ContagemParcial | FimLeitura;

/** Estado de um job no dashboard (tambem e o JSON de GET /api/estado e do WS do dashboard). */
export interface EstadoJob {
  jobId: string;
  arquivo: string;
  palavras: string[];
  totais: Record<string, number>;
  linhasProcessadas: number;
  totalEsperado: number | null; // null ate chegarem os 2 fins
  finsRecebidos: number;
  porContador: Record<string, number>; // linhas processadas por contador
  iniciadoEm: number;
  concluidoEm: number | null;
}

/** Pedido que a pagina do cliente envia para POST /api/jobs. */
export interface PedidoJob {
  arquivo: string; // nome do arquivo dentro de dados/
  palavras: string; // texto livre; o servidor quebra por virgula/espaco
}

/** Mensagens IPC leitor -> cliente (process.send). */
export type MensagemLeitorIPC =
  | { tipo: 'progresso'; paridade: Paridade; enviadas: number }
  | { tipo: 'fim'; paridade: Paridade; enviadas: number };

/** Mensagens WS servidor do cliente -> pagina do cliente. */
export type EventoCliente =
  | { tipo: 'job'; jobId: string; arquivo: string; palavras: string[] }
  | { tipo: 'leitor'; jobId: string; paridade: Paridade; enviadas: number; terminou: boolean }
  | { tipo: 'erro'; mensagem: string };
