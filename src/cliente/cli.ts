// Cliente headless: mesmo fluxo da pagina, mas pela linha de comando (usado pelo e2e).
import { parseArgs } from 'node:util';
import { fecharConexao, iniciarJob } from './job.ts';

const { values } = parseArgs({ options: { arquivo: { type: 'string' }, palavras: { type: 'string' } } });

async function main(): Promise<number> {
  if (!values.arquivo || !values.palavras) {
    console.error('uso: --arquivo <nome em dados/> --palavras "<texto>"');
    return 1;
  }
  try {
    const { jobId, concluido } = await iniciarJob(values.arquivo, values.palavras, (e) => {
      if (e.tipo === 'leitor') console.log(`[leitor ${e.paridade}] ${e.enviadas} linhas enviadas${e.terminou ? ' (terminou)' : ''}`);
    });
    // O e2e faz parse exato desta linha.
    console.log(`JOB ${jobId}`);
    await concluido;
    return 0;
  } catch (e) {
    console.error('erro:', (e as Error).message);
    return 1;
  } finally {
    // Fecha o AMQP antes de sair para o broker nao registrar queda abrupta.
    await fecharConexao().catch(() => {});
  }
}

process.exit(await main());
