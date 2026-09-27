# BarberBot — Agendamento de barbearias com IA no WhatsApp

> Nome provisório. Projeto em desenvolvimento (MVP).

SaaS para barbearias em que um assistente de IA atende os clientes no **número de WhatsApp da própria barbearia** e **agenda, remarca e cancela horários automaticamente**, em linguagem natural. O dono e os barbeiros gerenciam agenda, clientes e configurações por um painel web.

A especificação completa está no [PRD](docs/PRD.md).

## Funcionalidades (MVP)

- Agendamento, remarcação e cancelamento pelo WhatsApp em linguagem natural
- Transferência para atendimento humano quando o bot não resolve
- Lembretes automáticos (24h e 1h antes) e lembrete de retorno com opt-in
- Regras configuráveis de antecedência, cancelamento e bloqueio por faltas
- Lista de espera com oferta sequencial de horários liberados
- Painel web para Dono e Barbeiro: agenda, clientes, agendamento manual e relatórios
- Multi-tenant, com assinatura mensal e 14 dias de teste grátis

## Stack

| Área | Tecnologia |
|---|---|
| Runtime | Node.js 24 + TypeScript (strict) |
| Framework | NestJS 11 |
| Banco de dados | PostgreSQL 17 + TypeORM |
| Validação | Zod |
| IA | Google Gemini (`@google/genai`) |
| Observabilidade | Pino (logs), Prometheus (métricas), Terminus (health checks) |
| Infra local | Docker Compose |
| Qualidade | Jest, ESLint, Prettier, `eslint-plugin-boundaries` |

## Arquitetura

O projeto segue **Clean Architecture**. As dependências apontam sempre para dentro, e o lint falha quando essa regra é violada.

```
src/
├── domain/               # Entidades e value objects (TypeScript puro)
├── usecases/             # Casos de uso e interfaces (ports)
├── interface-adapters/   # Controllers, presenters e gateways
└── infrastructure/       # Config, banco, HTTP, observabilidade e serviços externos
```

Os detalhes de arquitetura e convenções estão no [CLAUDE.md](CLAUDE.md).

## Como rodar

### Pré-requisitos

- Node.js 24 (há um `.nvmrc`)
- Docker e Docker Compose

### Passo a passo

```bash
npm install
cp .env.example .env
docker compose up -d postgres
npm run migration:run
npm run start:dev
```

A API sobe em `http://localhost:3000`.

### Tudo em containers

```bash
docker compose --profile app up --build
```

### Com Prometheus

```bash
docker compose --profile observability up -d
```

O Prometheus fica em `http://localhost:9090` e coleta as métricas da API, esteja ela rodando no host ou no container.

## Variáveis de ambiente

As variáveis são validadas na inicialização; a aplicação não sobe se faltar alguma obrigatória. Veja o [.env.example](.env.example).

| Variável | Descrição | Padrão |
|---|---|---|
| `NODE_ENV` | `development`, `test` ou `production` | `development` |
| `PORT` | Porta HTTP | `3000` |
| `LOG_LEVEL` | Nível de log do Pino | `info` |
| `DB_HOST` | Host do Postgres | — |
| `DB_PORT` | Porta do Postgres | `5432` |
| `DB_USER` | Usuário do Postgres | — |
| `DB_PASSWORD` | Senha do Postgres | — |
| `DB_NAME` | Nome do banco | — |
| `GEMINI_API_KEY` | Chave da API do Gemini | — |
| `GEMINI_MODEL` | Modelo do Gemini | — |
| `JWT_SECRET` | Segredo do JWT de sessão (≥ 32 caracteres) | — |
| `AUTH_SESSION_TTL_SECONDS` | Validade da sessão, em segundos | `604800` |
| `APP_WEB_URL` | URL do painel web (usada nos links de e-mail) | — |
| `SMTP_HOST` | Host do servidor SMTP | — |
| `SMTP_PORT` | Porta do servidor SMTP | `1025` |
| `SMTP_SECURE` | Usa TLS na conexão SMTP | `false` |
| `SMTP_USER` | Usuário do SMTP | — |
| `SMTP_PASSWORD` | Senha do SMTP | — |
| `MAIL_FROM` | Remetente dos e-mails transacionais | — |

## Scripts

| Comando | O que faz |
|---|---|
| `npm run start:dev` | API em modo watch |
| `npm run build` | Compila para `dist/` |
| `npm run typecheck` | Checagem de tipos sem gerar build |
| `npm run lint` / `npm run lint:check` | ESLint com e sem correção automática |
| `npm run format` | Prettier |
| `npm test` | Testes unitários |
| `npm run test:e2e` | Testes e2e (exigem o Postgres do compose) |
| `npm run test:cov` | Cobertura de testes |
| `npm run migration:generate -- src/infrastructure/database/migrations/<Nome>` | Gera uma migration a partir das entidades |
| `npm run migration:run` / `migration:revert` / `migration:show` | Aplica, reverte e lista as migrations |

## Observabilidade

| Endpoint | Uso |
|---|---|
| `GET /health/live` | Liveness: o processo está no ar |
| `GET /health/ready` | Readiness: as dependências (banco) respondem |
| `GET /metrics` | Métricas no formato Prometheus |

Toda requisição recebe um `x-request-id`, que é devolvido na resposta e aparece nos logs. Envie o seu próprio cabeçalho `x-request-id` para rastrear uma chamada específica.
