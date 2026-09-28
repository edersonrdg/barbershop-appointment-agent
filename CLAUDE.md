# CLAUDE.md

SaaS multi-barbearia em que um assistente de IA agenda, remarca e cancela horários pelo WhatsApp da barbearia, com painel web para Dono e Barbeiros.

**Fonte única de verdade: [docs/PRD.md](docs/PRD.md).** Antes de implementar qualquer coisa, leia a seção 0 do PRD.

Este repositório é **público**. Nunca versione segredos, dados reais de clientes ou `.env`.

## Stack

- Node.js v24 + TypeScript (strict)
- NestJS 11 (CommonJS). Não instale pacotes `@nestjs/*` v12: eles são só ESM e quebram o build e o Jest. Use as linhas compatíveis com Nest 11 (`@nestjs/config@4`, `@nestjs/typeorm@11`, `@nestjs/terminus@11`).
- PostgreSQL 17 + TypeORM
- Zod para validação de esquemas
- Swagger / OpenAPI via `@nestjs/swagger@11` (documentação da API)
- IA: Google Gemini via `@google/genai`
- Observabilidade: `nestjs-pino` (logs), `prom-client` (métricas), `@nestjs/terminus` (health checks)
- Docker Compose para orquestração local
- Jest (unitário e e2e)
- ESLint + Prettier (`singleQuote`, `trailingComma: all`) + `eslint-plugin-boundaries`

## Comandos

```bash
cp .env.example .env                   # primeira vez
docker compose up -d postgres          # banco local
npm run start:dev                      # API em modo watch (usa o Postgres do compose)
                                       # Swagger em http://localhost:3000/docs (JSON em /docs-json) com API_DOCS_ENABLED=true
docker compose --profile app up --build            # API + banco em containers
docker compose --profile observability up -d       # Prometheus em http://localhost:9090

npm run build          # compila para dist/
npm run typecheck      # tsc --noEmit
npm run lint           # eslint com --fix
npm run lint:check     # eslint sem corrigir
npm run format         # prettier em src/ e test/
npm test               # testes unitários (*.spec.ts em src/)
npm run test:e2e       # testes e2e (test/); exigem o Postgres do compose rodando
npm run test:cov       # cobertura

npm run migration:generate -- src/infrastructure/database/migrations/<Nome>
npm run migration:create -- src/infrastructure/database/migrations/<Nome>
npm run migration:run
npm run migration:revert
npm run migration:show
```

Antes de considerar uma task concluída, rode `npm run lint`, `npm run build`, `npm test` e `npm run test:e2e` e confirme que passam.

## Fluxo de trabalho (PRD)

- As histórias de usuário (PRD seção 11) são executadas na ordem da seção 12. Só comece uma história quando as dependências dela estiverem concluídas.
- Cada task técnica cita o ID da história e os `RF`/`RN` que implementa.
- Cada critério de aceite (`CA-xx.y`) vira pelo menos um teste automatizado, e o nome do teste cita o `CA` (ex.: `it('CA-07.4: rejects the second concurrent booking', ...)`).
- Não implemente comportamento que não esteja em `RF`/`RN`/`CA`, nem adiante histórias futuras (exceto o mínimo estrutural, como colunas de banco).
- Se uma **Pendência** bloqueante estiver aberta (ex.: fornecedor do WhatsApp, gateway de pagamento), pare e pergunte. Valores "sugestão, a validar" entram como padrão configurável, nunca hardcoded.
- Uma história só está pronta quando atende à Definição de Pronto (PRD 11.1).
- Para planejar e executar histórias, use a skill `tlc-spec-driven` (artefatos em `.specs/`, que são versionados).
- **Commits:** Conventional Commits citando a história, ex.: `feat(US-07): add availability engine`.
- **Branches:** uma branch por história, criada a partir da `main` atualizada (ex.: `feat/us-07-availability-engine`). Se a história depender de um PR ainda não mergeado, parta da branch dele e use-a como base do PR.
- **Pull Request ao finalizar:** quando a história estiver pronta (validações acima passando e Verifier com PASS), faça o push só da branch da história (`git push -u origin <branch>`, nunca na `main` e nunca com `--force`) e abra um PR novo com `gh pr create --base main`. Título no padrão dos commits (ex.: `feat(US-07): add availability engine`). A descrição, em português, traz:
  - **Resumo:** o que a história entrega e para quem.
  - **O que foi feito:** as mudanças principais por camada, incluindo rotas novas ou alteradas e migrations.
  - **Rastreabilidade:** história, `RF`/`RN` implementados e cada `CA` com o teste que o cobre.
  - **Como testar:** comandos e passos para validar localmente.
  - **Pendências e decisões:** o que ficou em aberto ou foi decidido durante a execução (`.specs/`).

## Arquitetura: Clean Architecture

```
src/
├── domain/                  # Regras de negócio puras
│   ├── entities/            # Objetos de negócio e suas regras intrínsecas
│   └── value-objects/       # Objetos de valor imutáveis
├── usecases/                # Orquestração do domínio, um diretório por caso de uso
│   └── <nome-do-caso-de-uso>/   # Ex.: create-appointment/ — contém as interfaces (ports) de repositórios
├── interface-adapters/      # Conversão de dados entre camadas
│   ├── controllers/         # Recebem dados da API e chamam os use cases
│   ├── presenters/          # Formatam a resposta para o cliente
│   └── gateways/            # Implementam as interfaces de acesso a dados
└── infrastructure/          # Detalhes e frameworks
    ├── config/              # Schema Zod das variáveis de ambiente
    ├── database/            # TypeORM: options, data-source (CLI), entities/, migrations/
    ├── http/                # Servidor, filtros, middlewares
    ├── observability/       # Logger, métricas, health checks
    └── external/            # Serviços de terceiros (WhatsApp, Gemini, gateway de pagamento)
```

**Regra de dependência:** as dependências apontam sempre para dentro (`infrastructure → interface-adapters → usecases → domain`). O ESLint (`boundaries/dependencies`) falha o lint quando ela é violada; não desative a regra.

- `domain/` não importa nada de NestJS, TypeORM, Zod, Gemini ou de outras camadas. É TypeScript puro.
- `usecases/` depende só de `domain/` e das próprias interfaces (ports). Não conhece TypeORM, HTTP nem Gemini.
- Entidades do TypeORM ficam em `infrastructure/database/entities/` (`*.entity.ts`) e são mapeadas para entidades de domínio. Nunca use entidade do TypeORM como entidade de domínio nem a retorne em um controller.
- A ligação entre ports e implementações é feita por injeção de dependência do NestJS, nos módulos em `infrastructure/`.
- Validação com Zod acontece na borda (controllers, payloads de integrações externas e respostas do Gemini). Invariantes de negócio ficam nas entidades e value objects.
- **Um arquivo por classe**, com nomes de arquivo em kebab-case no padrão do Nest (`create-appointment.use-case.ts`, `appointment.entity.ts`, `appointments.controller.ts`).

## Documentação da API (Swagger)

**Toda rota nova, e toda alteração em rota existente (payload, resposta, status, perfil de acesso), atualiza a documentação Swagger no mesmo commit.** A task não está concluída sem isso.

O documento é montado em [api-document.ts](src/infrastructure/http/api-docs/api-document.ts) e sai de três fontes:

- **Derivado automaticamente (não duplique):**
  - *Payload de entrada:* o body, os params e a query de cada rota vêm do schema Zod passado ao `ZodValidationPipe`, que também gera a resposta 400 de validação. Mudou o schema, mudou a documentação.
  - *Autorização:* `@Public()`, `@Roles(...)` e o padrão só-Dono (AD-007) viram `security` bearer, `x-roles`, a linha **Acesso** na descrição e as respostas 401 e 403. É o mesmo metadado que o `SessionGuard` usa.
- **Declarado no controller (obrigatório em toda rota):**
  - `@ApiTags(...)` na classe, agrupando por área do painel.
  - `@ApiOperation({ summary })`, com o resumo em português citando a história (ex.: `'Convida um Barbeiro por e-mail (US-02)'`). Use `description` para o comportamento que o consumidor precisa saber.
  - `@ApiZodResponse({ status, description, schema })` para a resposta de sucesso. `schema` é o schema Zod do presenter; omita só em 204.
  - `@ApiErrorResponse(status, descrição, mensagem)` para cada erro de domínio que a rota pode devolver, com o status mapeado no `DomainErrorFilter` e a mensagem real do erro como exemplo.
- **Formato das respostas:** cada presenter exporta o schema Zod da resposta (`xxxResponseSchema`) e o tipo com `z.infer`. Não crie interface ou classe DTO paralela ao schema.
- Enriqueça os schemas com `.meta({ description, example, format })`. O `.meta()` não altera a validação e ajuda nos campos validados por `refine`, que não aparecem no OpenAPI.
- O e2e [api-docs.e2e-spec.ts](test/api-docs.e2e-spec.ts) falha se alguma rota ficar sem `summary` ou sem resposta de sucesso descrita. Ao criar uma rota, confira também a UI em `/docs`.
- O Swagger só é publicado com `API_DOCS_ENABLED=true` (padrão `false`).

## Regras de domínio que atravessam todo o código

- **Multi-tenant (RN-26):** toda consulta e gravação é filtrada pela barbearia (tenant). Nenhum repositório expõe método sem o tenant.
- **Permissões por perfil (PRD seção 5):** Dono e Barbeiro, verificadas no backend em todo endpoint novo, não só na interface.
- **Motor de disponibilidade único (US-07):** bot e painel usam o mesmo serviço para calcular e validar horários. Nunca duplique regras de agenda.
- **Concorrência (RN-07):** sobreposição de agendamentos é barrada também no banco, com constraint de exclusão do Postgres (`EXCLUDE USING gist` sobre barbeiro + `tstzrange`), e não só na aplicação.
- **Conector de WhatsApp isolado (RNF-05):** o código do bot usa uma interface interna de mensageria, nunca o SDK/API do fornecedor diretamente.

## IA (Gemini)

- Acesso ao Gemini só em `infrastructure/external/`, atrás de um port definido em `usecases/`. Nenhum outro lugar importa `@google/genai`.
- **A IA não executa ações pelo texto:** o modelo apenas extrai intenção e dados, via function calling ou saída estruturada (JSON schema). A resposta é validada com Zod antes de chegar ao use case, e toda ação na agenda passa pelo motor de regras.
- O bot responde apenas com dados cadastrados da barbearia (RF-09) e recusa assuntos fora de contexto (RF-08).
- Modelo e chave vêm de `GEMINI_MODEL` e `GEMINI_API_KEY`. Nunca fixe o nome do modelo no código; em produção use uma versão fixa, não um alias `-latest`.
- Nos testes, o port do LLM é sempre um fake. Nenhum teste automatizado chama a API real.
- Registre latência, tokens e erros de cada chamada ao Gemini (RNF-01 e custo por conversa, seção 13 do PRD).

## Dados e persistência

- **Migrations sempre:** `synchronize: false`. Toda mudança de schema vira uma migration versionada em `infrastructure/database/migrations/`.
- **Datas:** grave tudo em UTC (`timestamptz`) e converta para o fuso da barbearia (padrão `America/Sao_Paulo`, RNF-04) só nas bordas.
- **Dinheiro:** valores em BRL guardados em centavos (inteiro). Nunca use float.

## Erros

- Use cases lançam erros de domínio próprios (ex.: `SlotUnavailableError`), que carregam o `RN` violado. Use cases nunca lançam `HttpException`.
- Um exception filter em `infrastructure/http/` mapeia erros de domínio para status HTTP.

## Configuração

- Variáveis de ambiente são validadas com Zod em [src/infrastructure/config/env.schema.ts](src/infrastructure/config/env.schema.ts) na inicialização. A aplicação falha se faltar alguma.
- Toda variável nova entra no schema e no [.env.example](.env.example).
- Leia configuração via `ConfigService<Env, true>` com `{ infer: true }`, nunca direto de `process.env`.

## Observabilidade

- **Logs:** use o `Logger` do Nest (roteado para o pino). Nunca use `console.log`. Logs são JSON em produção e `pino-pretty` em desenvolvimento.
- **Diagnóstico:** cada requisição tem um `x-request-id` (recebido ou gerado), devolvido na resposta e presente em todos os logs dela. Propague-o nas chamadas a serviços externos e jobs.
- **LGPD nos logs:** não logue telefone, conteúdo de conversa, senha nem token em texto puro. Ao adicionar campos sensíveis, amplie o `redact` em [logger.options.ts](src/infrastructure/observability/logger.options.ts).
- **Health checks:** `GET /health/live` (processo no ar) e `GET /health/ready` (dependências, hoje o banco). Integrações novas que sejam críticas (WhatsApp, Gemini) ganham um indicador no `ready`.
- **Métricas:** `GET /metrics` no formato Prometheus. Já existem as métricas padrão do Node e `http_request_duration_seconds`. Métricas de negócio novas (agendamentos criados, transferências para humano, chamadas ao Gemini) usam o registry `METRICS_REGISTRY`, com labels de baixa cardinalidade (nunca IDs de cliente ou de barbearia).

## Testes

- Use cases são testados com repositórios em memória (fakes dos ports), sem banco.
- Gateways TypeORM e fluxos HTTP são testados em e2e, contra o Postgres do compose.

## Convenções de código

- **Nomenclatura:** camelCase para variáveis e funções; PascalCase para classes, interfaces, tipos e componentes.
- **Early returns:** prefira retornos antecipados a `if`s aninhados.
- **Tipagem estrita:** nunca use `any` (o lint barra). Use `unknown` e estreite o tipo, ou tipos derivados de schemas Zod (`z.infer`).
- **Comentários:** comente apenas o *porquê* de uma regra de negócio complexa (cite o `RN-xx` quando fizer sentido). Nunca comente *o que* o código faz.
- **Idioma:** código (nomes, identificadores) em inglês; textos para o usuário final em português do Brasil.
