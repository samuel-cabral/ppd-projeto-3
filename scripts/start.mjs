// Sobe tudo: build web, RabbitMQ, dashboard, contadores e cliente. Ctrl+C encerra os processos.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const contadores = Number(process.env.CONTADORES ?? 3);

function passo(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`falhou: ${cmd} ${args.join(' ')}`);
    process.exit(1);
  }
}

passo('npx', ['vite', 'build']);
// --wait espera o healthcheck: os processos ja encontram o broker pronto.
passo('docker', ['compose', 'up', '-d', '--wait']);
if (!existsSync('dados/grande.txt')) passo('node', ['scripts/gerar-arquivo.mjs', '--linhas', '100000']);

const filhos = [];
function subir(nome, arquivo, env = {}) {
  const p = spawn('node', ['--import', 'tsx', arquivo], {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // Prefixa cada linha com o nome do processo para dar para ler o log misturado.
  const prefixa = (saida) => {
    let resto = '';
    p[saida].on('data', (d) => {
      const partes = (resto + d).split('\n');
      resto = partes.pop() ?? '';
      for (const l of partes) console.log(`[${nome}] ${l}`);
    });
  };
  prefixa('stdout');
  prefixa('stderr');
  filhos.push(p);
}

subir('dashboard', 'src/dashboard/servidor.ts');
for (let i = 1; i <= contadores; i++) {
  subir(`contador-${i}`, 'src/contador/index.ts', { CONTADOR_ID: `contador-${i}` });
}
subir('cliente', 'src/cliente/servidor.ts');

console.log('Cliente: http://localhost:3001  Dashboard: http://localhost:3002  RabbitMQ: http://localhost:15672');

const encerrar = () => {
  for (const p of filhos) p.kill('SIGTERM');
  setTimeout(() => process.exit(0), 500);
};
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
