// Pagina do cliente: TS puro. Dados vem da API HTTP; progresso dos leitores vem por WebSocket.
import type { EventoCliente, PedidoJob } from '../../src/shared/contratos.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = $<HTMLFormElement>('form');
const selArquivo = $<HTMLSelectElement>('arquivo');
const inPalavras = $<HTMLInputElement>('palavras');
const btn = $<HTMLButtonElement>('iniciar');
const erro = $<HTMLParagraphElement>('erro');
const listaJobs = $<HTMLDivElement>('jobs');
const seloWs = $<HTMLSpanElement>('ws');

interface Leitor { enviadas: number; terminou: boolean }
interface Job { jobId: string; arquivo: string; palavras: string[]; par: Leitor; impar: Leitor; el: HTMLElement }
const jobs = new Map<string, Job>();

function tamanho(bytes: number): string {
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

async function carregarArquivos(): Promise<void> {
  const arqs: { nome: string; bytes: number }[] = await (await fetch('/api/arquivos')).json();
  selArquivo.innerHTML = '';
  for (const a of arqs) selArquivo.add(new Option(`${a.nome} (${tamanho(a.bytes)})`, a.nome));
  if (arqs.length === 0) selArquivo.add(new Option('nenhum .txt em dados/', ''));
}

function mostrarErro(msg: string): void {
  erro.textContent = msg;
  erro.hidden = !msg;
}

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  mostrarErro('');
  btn.disabled = true;
  const pedido: PedidoJob = { arquivo: selArquivo.value, palavras: inPalavras.value };
  try {
    const r = await fetch('/api/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pedido) });
    const corpo = await r.json();
    if (!r.ok) mostrarErro(corpo.erro ?? 'erro ao iniciar');
  } catch {
    mostrarErro('nao foi possivel falar com o servidor do cliente');
  } finally {
    btn.disabled = false;
  }
});

// Constroi o HTML de um leitor; o texto e atualizado depois sem recriar o card.
const blocoLeitor = (rotulo: string, chave: string) => `
  <div class="leitor" data-l="${chave}">
    <div class="leitor-cab"><span>${rotulo}: <b class="n">0</b> enviadas</span><span class="selo andando">lendo...</span></div>
    <div class="barra indet"><i></i></div>
  </div>`;

function criarJob(e: Extract<EventoCliente, { tipo: 'job' }>): Job {
  const el = document.createElement('article');
  el.className = 'job';
  const chips = e.palavras.map((p) => `<span class="chip">${p.replace(/[<>&]/g, '')}</span>`).join('');
  el.innerHTML = `
    <div class="job-cab"><span class="job-id">${e.jobId}</span><span class="selo andando" data-geral>em andamento</span></div>
    <div class="job-info">${e.arquivo.replace(/[<>&]/g, '')}<div class="chips">${chips}</div></div>
    ${blocoLeitor('Leitor de linhas pares', 'par')}
    ${blocoLeitor('Leitor de linhas impares', 'impar')}`;
  if (jobs.size === 0) listaJobs.innerHTML = '';
  listaJobs.prepend(el); // mais recente no topo
  const job: Job = { jobId: e.jobId, arquivo: e.arquivo, palavras: e.palavras, par: { enviadas: 0, terminou: false }, impar: { enviadas: 0, terminou: false }, el };
  jobs.set(e.jobId, job);
  return job;
}

function pintar(job: Job): void {
  for (const k of ['par', 'impar'] as const) {
    const bloco = job.el.querySelector(`[data-l="${k}"]`)!;
    const l = job[k];
    bloco.querySelector('.n')!.textContent = l.enviadas.toLocaleString('pt-BR');
    const selo = bloco.querySelector('.selo')!;
    selo.textContent = l.terminou ? 'terminou' : 'lendo...';
    selo.className = l.terminou ? 'selo' : 'selo andando';
    bloco.querySelector('.barra')!.className = l.terminou ? 'barra fim' : 'barra indet';
  }
  const geral = job.el.querySelector('[data-geral]')!;
  const fim = job.par.terminou && job.impar.terminou;
  geral.textContent = fim ? 'leitura concluida' : 'em andamento';
  geral.className = fim ? 'selo' : 'selo andando';
}

function tratar(e: EventoCliente): void {
  if (e.tipo === 'erro') return mostrarErro(e.mensagem);
  if (e.tipo === 'job') return pintar(criarJob(e));
  const job = jobs.get(e.jobId); // evento de job de outra aba/sessao antiga e ignorado
  if (!job) return;
  job[e.paridade] = { enviadas: e.enviadas, terminou: e.terminou };
  pintar(job);
}

// Reconecta se o servidor cair (ex.: reinicio durante o desenvolvimento).
function conectarWs(): void {
  const ws = new WebSocket(`ws://${location.host}/ws`);
  ws.onopen = () => { seloWs.textContent = 'conectado'; seloWs.className = 'selo'; };
  ws.onmessage = (m) => tratar(JSON.parse(m.data));
  ws.onclose = () => {
    seloWs.textContent = 'desconectado';
    seloWs.className = 'selo off';
    setTimeout(conectarWs, 1500);
  };
}

carregarArquivos().catch(() => mostrarErro('falha ao listar arquivos'));
conectarWs();
