import type { EstadoJob, MensagemTopico } from '../shared/contratos.ts';

// Cria um job vazio. Serve tanto para o 'job' quanto para quando uma contagem/fim
// chega antes dele (o topico nao garante ordem entre publishers diferentes).
function novoJob(jobId: string): EstadoJob {
  return {
    jobId,
    arquivo: '?',
    palavras: [],
    totais: {},
    linhasProcessadas: 0,
    totalEsperado: null,
    finsRecebidos: 0,
    porContador: {},
    iniciadoEm: Date.now(),
    concluidoEm: null,
  };
}

// Aplica uma mensagem do topico ao estado e devolve o job alterado.
export function aplicar(estados: Map<string, EstadoJob>, msg: MensagemTopico): EstadoJob {
  let job = estados.get(msg.jobId);
  if (!job) {
    job = novoJob(msg.jobId);
    estados.set(msg.jobId, job);
  }

  switch (msg.tipo) {
    case 'job':
      // Nao zera totais: parciais podem ter chegado antes deste aviso.
      job.arquivo = msg.arquivo;
      job.palavras = msg.palavras;
      job.iniciadoEm = msg.iniciadoEm;
      for (const p of msg.palavras) job.totais[p] = job.totais[p] ?? 0;
      break;
    case 'contagem':
      // SOMA, nunca substitui: cada parcial e a contagem de UMA linha e varios
      // contadores publicam em paralelo, entao o total e a soma de todas elas.
      for (const [p, n] of Object.entries(msg.contagens)) {
        job.totais[p] = (job.totais[p] ?? 0) + n;
      }
      job.linhasProcessadas++;
      job.porContador[msg.contadorId] = (job.porContador[msg.contadorId] ?? 0) + 1;
      break;
    case 'fim':
      // O total esperado so fecha quando os 2 leitores (par e impar) avisaram.
      job.finsRecebidos++;
      job.totalEsperado = (job.totalEsperado ?? 0) + msg.linhasEnviadas;
      break;
  }

  // Concluido = os 2 fins chegaram e todas as linhas enviadas ja foram contadas.
  // A ordem de chegada nao importa, so a condicao final.
  if (job.finsRecebidos === 2 && job.linhasProcessadas === job.totalEsperado && job.concluidoEm === null) {
    job.concluidoEm = Date.now();
  }
  return job;
}
