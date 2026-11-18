import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { conectar, declararTopologia } from '../shared/amqp.ts';
import {
  BINDING_DASHBOARD,
  EXCHANGE_PALAVRAS,
  PORTA_DASHBOARD,
  type EstadoJob,
  type MensagemTopico,
} from '../shared/contratos.ts';
import { aplicar } from './estado.ts';

const RAIZ_WEB = resolve(import.meta.dirname, '../../dist/web');
const TIPOS: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const estados = new Map<string, EstadoJob>();
const alterados = new Set<string>(); // jobs mudados desde o ultimo envio WS

const maisRecentesPrimeiro = () => [...estados.values()].sort((a, b) => b.iniciadoEm - a.iniciadoEm);

const conn = await conectar();
const ch = await conn.createChannel();
await declararTopologia(ch);

// Cada subscriber tem a sua propria fila (pub/sub): todos recebem todas as mensagens.
// Diferente da fila de linhas, em que os contadores competem e cada linha vai para um so.
const { queue } = await ch.assertQueue('', { exclusive: true, autoDelete: true });
await ch.bindQueue(queue, EXCHANGE_PALAVRAS, BINDING_DASHBOARD);
await ch.consume(
  queue,
  (msg) => {
    if (!msg) return;
    try {
      const job = aplicar(estados, JSON.parse(msg.content.toString()) as MensagemTopico);
      alterados.add(job.jobId);
    } catch {
      console.warn('[dashboard] mensagem invalida ignorada');
    }
  },
  { noAck: true }, // perder uma atualizacao de tela nao e critico
);

const http = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/api/estado') {
    res.writeHead(200, { 'Content-Type': TIPOS['.json'] });
    res.end(JSON.stringify(maisRecentesPrimeiro()));
    return;
  }
  if (url.pathname === '/') {
    res.writeHead(302, { Location: '/dashboard/' });
    res.end();
    return;
  }
  // Estatico: normalize + prefixo impedem sair de dist/web com '..'.
  let rel = normalize(decodeURIComponent(url.pathname));
  if (rel.endsWith('/')) rel = join(rel, 'index.html');
  const arquivo = join(RAIZ_WEB, rel);
  if (!arquivo.startsWith(RAIZ_WEB)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const dados = await readFile(arquivo);
    res.writeHead(200, { 'Content-Type': TIPOS[extname(arquivo)] ?? 'application/octet-stream' });
    res.end(dados);
  } catch {
    res.writeHead(404).end('nao encontrado');
  }
});

const wss = new WebSocketServer({ server: http, path: '/ws' });
const enviar = (ws: WebSocket, jobs: EstadoJob[]) => {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ tipo: 'estado', jobs }));
};

// Quem conecta recebe o estado completo; depois so os deltas.
wss.on('connection', (ws) => enviar(ws, maisRecentesPrimeiro()));

// Throttle: sao ~100k mensagens por job; um envio WS por mensagem travaria o navegador.
// A cada 150 ms mandamos so os jobs que mudaram, ja com os totais somados.
setInterval(() => {
  if (alterados.size === 0) return;
  const jobs = [...alterados].map((id) => estados.get(id)!);
  alterados.clear();
  for (const ws of wss.clients) enviar(ws, jobs);
}, 150);

http.listen(PORTA_DASHBOARD, () => console.log(`[dashboard] http://localhost:${PORTA_DASHBOARD}`));

const sair = async () => {
  await conn.close().catch(() => {});
  process.exit(0);
};
process.on('SIGINT', sair);
process.on('SIGTERM', sair);
