import type { EstadoJob } from '../../src/shared/contratos.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const fmt = new Intl.NumberFormat('pt-BR');

// Mapa local; o servidor manda o completo na conexao e depois so os jobs alterados,
// entao mesclamos por jobId em vez de substituir tudo.
const jobs = new Map<string, EstadoJob>();
let escolhido: string | null = null; // null = acompanha o job mais recente
let maisRecente: string | null = null;

const seletor = $<HTMLSelectElement>('seletor');
seletor.addEventListener('change', () => {
  // Escolher o primeiro item (mais recente) volta ao modo automatico.
  escolhido = seletor.value === maisRecente ? null : seletor.value;
  desenhar();
});

function atual(): EstadoJob | undefined {
  return jobs.get(escolhido ?? maisRecente ?? '');
}

function atualizarSeletor() {
  const ordenados = [...jobs.values()].sort((a, b) => b.iniciadoEm - a.iniciadoEm);
  const novoRecente = ordenados[0]?.jobId ?? null;
  maisRecente = novoRecente;
  seletor.innerHTML = '';
  for (const j of ordenados) {
    const o = document.createElement('option');
    o.value = j.jobId;
    o.textContent = `${j.jobId} (${j.arquivo})`;
    seletor.append(o);
  }
  seletor.value = escolhido ?? novoRecente ?? '';
}

function desenhar() {
  atualizarSeletor();
  const j = atual();
  $('vazio').hidden = !!j;
  $('painel').hidden = !j;
  if (!j) return;

  $('arquivo').textContent = j.arquivo;
  $('selo').hidden = j.concluidoEm === null;

  // Cartoes: um por palavra-chave. Reaproveita o elemento para a animacao funcionar.
  const palavras = j.palavras.length ? j.palavras : Object.keys(j.totais);
  const cont = $('cartoes');
  if (cont.dataset.job !== j.jobId) {
    cont.innerHTML = '';
    cont.dataset.job = j.jobId;
  }
  for (const p of palavras) {
    let c = cont.querySelector<HTMLElement>(`[data-p="${CSS.escape(p)}"]`);
    if (!c) {
      c = document.createElement('div');
      c.className = 'cartao';
      c.dataset.p = p;
      c.innerHTML = '<div class="palavra"></div><div class="valor">0</div>';
      c.querySelector('.palavra')!.textContent = p;
      cont.append(c);
    }
    const v = c.querySelector<HTMLElement>('.valor')!;
    const txt = fmt.format(j.totais[p] ?? 0);
    if (v.textContent !== txt) {
      v.textContent = txt;
      c.classList.remove('pulso');
      void c.offsetWidth; // forca reflow para reiniciar a animacao
      c.classList.add('pulso');
    }
  }

  // Progresso: so ha total definitivo depois dos 2 fins; antes disso mostra "lendo".
  const barra = $('barra');
  const txt = $('texto-progresso');
  const lendo = j.finsRecebidos < 2;
  barra.classList.toggle('indeterminada', lendo);
  barra.classList.toggle('fim', j.concluidoEm !== null);
  if (lendo) {
    txt.textContent = `lendo arquivo... ${fmt.format(j.linhasProcessadas)} linhas processadas`;
  } else {
    const total = j.totalEsperado ?? 0;
    const pct = total ? Math.min(100, (j.linhasProcessadas / total) * 100) : 100;
    barra.style.width = `${pct}%`;
    txt.textContent = `${fmt.format(j.linhasProcessadas)} / ${fmt.format(total)} linhas (${pct.toFixed(1).replace('.', ',')}%)`;
  }

  // Contadores: a barra relativa ao maior mostra a distribuicao entre workers.
  const lista = Object.entries(j.porContador).sort(([a], [b]) => a.localeCompare(b, 'pt-BR', { numeric: true }));
  const maior = Math.max(1, ...lista.map(([, n]) => n));
  $('contadores').innerHTML = lista
    .map(
      ([, n]) =>
        `<div class="linha-c"><span class="nome"></span><div class="trilho"><div class="barra" style="width:${(n / maior) * 100}%"></div></div><span class="n">${fmt.format(n)} linhas</span></div>`,
    )
    .join('');
  $('contadores').querySelectorAll('.nome').forEach((el, i) => (el.textContent = lista[i][0]));
}

// Relogio: continua correndo ate o job concluir.
function tick() {
  const j = atual();
  if (!j) return;
  const fim = j.concluidoEm ?? Date.now();
  $('tempo').textContent = `${((fim - j.iniciadoEm) / 1000).toFixed(1).replace('.', ',')} s`;
}
setInterval(tick, 100);

function conectar() {
  const ws = new WebSocket(`ws://${location.host}/ws`);
  const status = $('conexao');
  ws.onopen = () => {
    status.textContent = 'conectado';
    status.className = 'conexao on';
  };
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data) as { tipo: 'estado'; jobs: EstadoJob[] };
    for (const j of msg.jobs) jobs.set(j.jobId, j);
    desenhar();
  };
  ws.onclose = () => {
    status.textContent = 'desconectado';
    status.className = 'conexao off';
    setTimeout(conectar, 1000); // reconecta; o servidor reenvia o estado completo
  };
}
conectar();
