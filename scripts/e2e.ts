// Teste ponta a ponta REAL com RabbitMQ (docker compose precisa estar de pe).
// Sobe dashboard + 3 contadores como processos do SO, roda o cliente headless e
// compara o total acumulado no dashboard com uma contagem sequencial de referencia.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { contarPalavras } from '../src/contador/contagem.ts';
import { parsePalavras } from '../src/shared/texto.ts';
import type { EstadoJob } from '../src/shared/contratos.ts';

const LINHAS = Number(process.env.E2E_LINHAS ?? 60000);
const ARQUIVO = 'e2e.txt';
const PALAVRAS = 'dados, paralela, fila, programacao';
const PORTA = 3092; // porta propria: nao colide com um dashboard aberto na 3002
const N_CONTADORES = 3;

const filhos: ChildProcess[] = [];
const logs: Record<string, string> = {};
function subir(nome: string, arquivo: string, env: Record<string, string>) {
  const p = spawn('node', ['--import', 'tsx', arquivo], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  logs[nome] = '';
  p.stdout!.on('data', (d) => (logs[nome] += d));
  p.stderr!.on('data', (d) => (logs[nome] += d));
  filhos.push(p);
}
const dorme = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function encerrar() {
  for (const p of filhos) p.kill('SIGTERM');
  await dorme(500);
  for (const p of filhos) if (p.exitCode === null) p.kill('SIGKILL');
}
async function falhar(msg: string): Promise<never> {
  console.error('FALHOU:', msg);
  await encerrar();
  process.exit(1);
}

// 1. Arquivo grande (gera so se faltar ou tiver tamanho diferente).
const gerado = spawnSync('node', ['scripts/gerar-arquivo.mjs', '--linhas', String(LINHAS), '--saida', `dados/${ARQUIVO}`], { encoding: 'utf8' });
if (gerado.status !== 0) await falhar('nao consegui gerar o arquivo: ' + gerado.stderr);
console.log(gerado.stdout.trim());

// 2. Esperado: mesma funcao pura do contador, sequencial, sem broker.
const palavras = parsePalavras(PALAVRAS);
const linhas = readFileSync(`dados/${ARQUIVO}`, 'utf8').split('\n');
if (linhas.at(-1) === '') linhas.pop();
const esperado: Record<string, number> = Object.fromEntries(palavras.map((p) => [p, 0]));
for (const l of linhas) for (const [p, n] of Object.entries(contarPalavras(l, palavras))) esperado[p] += n;

// 3. Fila limpa: sobras de execucoes anteriores nao podem contaminar o total.
const amqp = (await import('amqplib')).default;
const c = await amqp.connect(process.env.AMQP_URL ?? 'amqp://localhost');
const ch = await c.createChannel();
await ch.assertQueue('ppd.linhas', { durable: true });
await ch.purgeQueue('ppd.linhas');
await ch.close();
await c.close();

// 4. Sobe dashboard e contadores; espera ficarem prontos (log de subida).
subir('dashboard', 'src/dashboard/servidor.ts', { PORTA_DASHBOARD: String(PORTA) });
for (let i = 1; i <= N_CONTADORES; i++) subir(`contador-${i}`, 'src/contador/index.ts', { CONTADOR_ID: `contador-${i}` });
const pronto = Date.now() + 30_000;
while (!Object.values(logs).every((l) => /aguardando linhas|\[dashboard\] http/.test(l))) {
  if (Date.now() > pronto) await falhar('processos nao subiram:\n' + JSON.stringify(logs, null, 2));
  await dorme(200);
}

// 5. Cliente headless.
const t0 = Date.now();
const r = spawnSync('node', ['--import', 'tsx', 'src/cliente/cli.ts', '--arquivo', ARQUIVO, '--palavras', PALAVRAS], { encoding: 'utf8' });
const jobId = /^JOB (\S+)/m.exec(r.stdout)?.[1];
if (!jobId) await falhar('sem "JOB <id>" na saida do cliente:\n' + r.stdout + r.stderr);
const leitor = (par: string) => Number(new RegExp(`\\[leitor ${par}\\] (\\d+) linhas enviadas \\(terminou\\)`).exec(r.stdout)?.[1] ?? NaN);
const lPar = leitor('par');
const lImpar = leitor('impar');

// 6. Espera o dashboard acumular tudo.
let job: EstadoJob | undefined;
const limite = Date.now() + 120_000;
while (Date.now() < limite) {
  const estados = (await (await fetch(`http://localhost:${PORTA}/api/estado`)).json()) as EstadoJob[];
  job = estados.find((e) => e.jobId === jobId);
  if (job?.concluidoEm != null) break;
  await dorme(300);
}
const segundos = ((Date.now() - t0) / 1000).toFixed(1);
if (!job || job.concluidoEm == null) await falhar(`job nao concluiu em 120 s: ${JSON.stringify(job)}`);
const j = job!;

// 7. Relatorio e verificacao.
let ok = true;
const checa = (cond: boolean, msg: string) => { if (!cond) { ok = false; console.log('  ERRO:', msg); } };
console.log(`\njob ${jobId} concluiu em ${segundos}s`);
console.log(`linhas: esperado ${linhas.length} x processadas ${j.linhasProcessadas}`);
checa(j.linhasProcessadas === linhas.length, 'linhas processadas diferente do total');
console.log('palavra        esperado   obtido');
for (const p of palavras) {
  const obtido = j.totais[p] ?? 0;
  checa(obtido === esperado[p], `total de "${p}" difere`);
  console.log(`${p.padEnd(13)} ${String(esperado[p]).padStart(9)} ${String(obtido).padStart(8)}`);
}
console.log(`leitores: par=${lPar} impar=${lImpar} (soma ${lPar + lImpar})`);
checa(lPar + lImpar === linhas.length, 'soma dos leitores diferente do total');
checa(lPar > 0 && lImpar > 0, 'um dos leitores nao produziu');
console.log('distribuicao por contador:', JSON.stringify(j.porContador));
checa(Object.keys(j.porContador).length === N_CONTADORES, 'nem todos os contadores processaram linhas');
checa(Object.values(j.porContador).reduce((a, b) => a + b, 0) === linhas.length, 'soma por contador diferente do total');

console.log(ok ? '\nOK' : '\nFALHOU');
await encerrar();
process.exit(ok ? 0 : 1);
