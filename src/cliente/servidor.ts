// Servidor do cliente: API HTTP + WebSocket para a pagina e estaticos do build do Vite.
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { PORTA_CLIENTE } from '../shared/contratos.ts';
import type { EventoCliente, PedidoJob } from '../shared/contratos.ts';
import { DIR_DADOS, RAIZ, iniciarJob } from './job.ts';

const DIR_WEB = resolve(RAIZ, 'dist/web');
const TIPOS: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
};

const wss = new WebSocketServer({ noServer: true });
// Broadcast: qualquer aba aberta acompanha o job, mesmo que outra tenha iniciado.
function difundir(e: EventoCliente): void {
  const txt = JSON.stringify(e);
  for (const c of wss.clients) if (c.readyState === WebSocket.OPEN) c.send(txt);
}

function json(res: ServerResponse, status: number, corpo: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(corpo));
}

function lerCorpo(req: IncomingMessage): Promise<string> {
  return new Promise((ok, falha) => {
    let buf = '';
    req.on('data', (d) => {
      buf += d;
      if (buf.length > 1e6) req.destroy();
    });
    req.on('end', () => ok(buf));
    req.on('error', falha);
  });
}

async function estatico(url: string, res: ServerResponse): Promise<void> {
  if (!existsSync(DIR_WEB)) {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Paginas nao encontradas. Rode: pnpm build:web');
    return;
  }
  let caminho = join(DIR_WEB, normalize(decodeURIComponent(url)));
  // Bloqueia saida de dist/web via ../
  if (!caminho.startsWith(DIR_WEB)) caminho = DIR_WEB;
  if (existsSync(caminho) && statSync(caminho).isDirectory()) caminho = join(caminho, 'index.html');
  try {
    const dados = await readFile(caminho);
    res.writeHead(200, { 'Content-Type': TIPOS[extname(caminho)] ?? 'application/octet-stream' });
    res.end(dados);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('nao encontrado');
  }
}

const servidor = createServer(async (req, res) => {
  const url = (req.url ?? '/').split('?')[0];
  try {
    if (req.method === 'GET' && url === '/api/arquivos') {
      const lista = existsSync(DIR_DADOS)
        ? readdirSync(DIR_DADOS)
            .filter((n) => n.endsWith('.txt'))
            .map((nome) => ({ nome, bytes: statSync(join(DIR_DADOS, nome)).size }))
        : [];
      return json(res, 200, lista);
    }
    if (req.method === 'POST' && url === '/api/jobs') {
      let pedido: PedidoJob;
      try {
        pedido = JSON.parse(await lerCorpo(req));
      } catch {
        return json(res, 400, { erro: 'JSON invalido' });
      }
      try {
        const { jobId, palavras, concluido } = await iniciarJob(String(pedido.arquivo ?? ''), String(pedido.palavras ?? ''), difundir);
        // Falha de leitor chega na pagina como evento de erro.
        concluido.catch((e: Error) => difundir({ tipo: 'erro', mensagem: e.message }));
        return json(res, 200, { jobId, palavras });
      } catch (e) {
        return json(res, 400, { erro: (e as Error).message });
      }
    }
    if (url === '/') {
      res.writeHead(302, { Location: '/cliente/' });
      return void res.end();
    }
    await estatico(url, res);
  } catch (e) {
    json(res, 500, { erro: (e as Error).message });
  }
});

servidor.on('upgrade', (req, socket, head) => {
  if (req.url === '/ws') wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  else socket.destroy();
});

servidor.listen(PORTA_CLIENTE, () => console.log(`[cliente] http://localhost:${PORTA_CLIENTE}`));
