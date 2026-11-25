# Contagem paralela de palavras com MOM (RabbitMQ) - PPD Projeto 3

Um cliente escolhe um arquivo de texto e algumas palavras-chave. Dois leitores (linhas pares e
impares) jogam as linhas numa **fila**; varios contadores, processos independentes, competem
por essas linhas e publicam a contagem de cada uma num **topico**; o dashboard assina o topico,
soma as contagens parciais e mostra o resultado em tempo real. Toda a comunicacao passa pelo
broker **RabbitMQ** (Middleware Orientado a Mensagens). Nenhum processo conhece o outro.

IFCE - Programacao Paralela e Distribuida - Prof. Cidcley T. de Souza

## Fluxo

```
                                          (1) Cliente
                         pagina web :3001 / cli.ts
                                 |
              publica JobIniciado|  fork() de 2 processos
              (topico)           |
                  +--------------+--------------+
                  |                             |
          (2) Leitor Pares              (2) Leitor Impares
          (linhas 2,4,6...)             (linhas 1,3,5...)
                  |   sendToQueue               |
                  +--------------+--------------+
                                 v
                    (3) Fila de Linhas  ppd.linhas
                       (ponto a ponto, 1 linha -> 1 contador)
                                 |
              +------------------+------------------+
              v                  v                  v
        (4) Contador 1     (4) Contador 2     (4) Contador 3   ... N processos
              |   publica ContagemParcial no topico |
              +------------------+------------------+
                                 v
                  (5) Topico de Palavras  ppd.palavras (exchange topic)
                       (pub/sub, todo assinante recebe tudo)
                                 |
                                 v
                    (6) Dashboard  :3002
                  soma parciais -> WebSocket -> pagina
```

Os leitores tambem publicam `FimLeitura` (quantas linhas enviaram) no topico. E assim que o
dashboard sabe que o job terminou.

## Pre-requisitos

- Docker (Docker Desktop) para o RabbitMQ
- Node 22 e pnpm

## Como rodar

```bash
docker compose up -d     # RabbitMQ (imagem rabbitmq:3-management)
pnpm install
pnpm start                # build das paginas, dashboard, 3 contadores e cliente
```

`pnpm start` ja executa `docker compose up -d --wait` e gera `dados/grande.txt` (100 mil linhas)
se ele nao existir, entao o `docker compose up -d` manual e opcional.

| O que | URL |
|---|---|
| Cliente (escolhe arquivo e palavras) | http://localhost:3001 |
| Dashboard (resultado em tempo real) | http://localhost:3002 |
| Painel do RabbitMQ (guest / guest) | http://localhost:15672 |

Uso: abra o dashboard, abra o cliente, escolha `grande.txt`, digite as palavras e clique em iniciar.

Variaveis uteis: `CONTADORES=5 pnpm start` (quantos contadores), `ATRASO_MS=5` (atraso por linha
no contador, para ver a distribuicao ao vivo), `PREFETCH=1`, `AMQP_URL`, `PORTA_CLIENTE`,
`PORTA_DASHBOARD`.

Subir um contador extra a qualquer momento (outro terminal):

```bash
CONTADOR_ID=contador-4 pnpm contador
```

Cliente pela linha de comando (sem navegador):

```bash
pnpm cliente:cli --arquivo exemplo.txt --palavras "dados, fila"
```

## Como testar

```bash
pnpm typecheck
pnpm test            # unitarios (vitest), nao precisam de broker
pnpm test:e2e    # ponta a ponta, precisa do RabbitMQ no ar
```

- `src/contador/contagem.test.ts`: contagem por palavra inteira, acento, caixa, repeticao.
- `src/dashboard/estado.test.ts`: soma de parciais, ordem de chegada, regra de conclusao.
- `scripts/e2e.ts`: gera 60 mil linhas, sobe dashboard e 3 contadores, roda o cliente e compara
  o total do dashboard com a contagem sequencial (sem broker). Tem que bater exato.

## Mapa de arquivos

| Componente do diagrama | Arquivo |
|---|---|
| (1) Cliente (pagina + API + WebSocket) | `src/cliente/servidor.ts`, `web/cliente/` |
| (1) Cliente (instancia os 2 leitores) | `src/cliente/job.ts` |
| (1) Cliente headless | `src/cliente/cli.ts` |
| (2) Leitor Pares / Leitor Impares | `src/leitor/index.ts` |
| (3) Fila de Linhas | declarada em `src/shared/amqp.ts`, nome em `src/shared/contratos.ts` |
| (4) Contadores | `src/contador/index.ts`, regra de contagem em `src/contador/contagem.ts` |
| (5) Topico de Palavras | exchange declarada em `src/shared/amqp.ts` |
| (6) Dashboard (assina, soma, WebSocket) | `src/dashboard/servidor.ts`, `src/dashboard/estado.ts`, `web/dashboard/` |
| Formato das mensagens | `src/shared/contratos.ts` |
| Normalizacao (acento/caixa) | `src/shared/texto.ts` |
| Sobe tudo | `scripts/start.mjs` |
| Gera arquivo grande | `scripts/gerar-arquivo.mjs` |
