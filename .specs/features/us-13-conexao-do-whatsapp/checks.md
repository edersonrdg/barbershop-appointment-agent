# US-13: Conexão do WhatsApp da barbearia checks

Profile: light
Plan: `.specs/features/us-13-conexao-do-whatsapp/plan.md`

36 checks em 5 fatias · 7 one-way doors · 1 open, 0 block (1 blocks go-live)

Um check concluído termina com ✅. Convenção das provas: todo teste cita o `CA` (ou o AC do plano, quando o CA não cobre) e o id do check entre parênteses no nome, ex.: `it('CA-13.1 (C1): ...')`. O seletor `-t` usa esse id.

- e2e: `npx jest --config ./test/jest-e2e.json <arquivo> -t "<padrão>"` (Postgres do compose rodando; a Evolution nunca é chamada, o `WHATSAPP_CONNECTOR` é trocado por um fake)
- unitário: `npx jest <arquivo> -t "<padrão>"`

## Checks

### S1 - Conectar o número pelo QR code · ~14 arquivos · ~70 KB · ~18k

**C1** - `POST /whatsapp/connection` como Dono de uma barbearia sem conexão responde `200` com exatamente as chaves `status` (`"connecting"`) e `qrCode`, que começa por `data:image/png;base64,`, e o fake registra `ensureInstance(barbershopId)` antes de `requestQrCode(barbershopId)` (AC 1, AC 2, CA-13.1) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-connection.e2e-spec.ts -t "\(C1\)"`

**C2** - O adaptador Evolution, quando `GET /instance/connectionState/{barbershopId}` responde `404`, chama `POST /instance/create` com o header `apikey: EVOLUTION_API_KEY` e um corpo com `instanceName` = `barbershopId`, `integration: "WHATSAPP-BAILEYS"`, `alwaysOnline: false`, `readMessages: false` e `webhook: { enabled: true, url: WHATSAPP_WEBHOOK_URL, byEvents: false, events: ["CONNECTION_UPDATE"], headers: { authorization: "Bearer <WHATSAPP_WEBHOOK_SECRET>" } }` (AC 2, AC 7, CA-13.4, doors 2, 3 e 5) ✅
Proof: `npx jest src/infrastructure/external/whatsapp/evolution/evolution-whatsapp-connector.spec.ts -t "\(C2\)"`

**C3** - O adaptador, quando a instância já existe (`connectionState` responde `200`), não chama `POST /instance/create`; `requestQrCode` chama `GET /instance/connect/{barbershopId}` e devolve o `base64` da resposta. No e2e, um segundo `POST /whatsapp/connection` responde `200` com o QR que o fake devolve na segunda chamada (AC 3) ✅
Proof: `npx jest src/infrastructure/external/whatsapp/evolution/evolution-whatsapp-connector.spec.ts -t "\(C3\)"`
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-connection.e2e-spec.ts -t "\(C3\)"`

**C4** - Depois do `POST`, `whatsapp_connections` tem uma linha da barbearia com `status = 'connecting'`, e a tabela tem exatamente as colunas `barbershop_id`, `status`, `disconnected_at` e `updated_at`, nenhuma delas com o QR (AC 4, door 1) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-connection.e2e-spec.ts -t "\(C4\)"`

**C5** - Com a conexão `connected`, `POST /whatsapp/connection` responde `409` com exatamente "O WhatsApp já está conectado." e o fake não recebe `requestQrCode` (AC 5, L-008) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-connection.e2e-spec.ts -t "\(C5\)"`

**C6** - Com o fake rejeitando `requestQrCode` com `WhatsAppConnectorUnavailableError`, `POST /whatsapp/connection` responde `502` com exatamente "Não foi possível falar com o WhatsApp. Tente de novo em instantes.", e uma conexão que estava `connecting` continua `connecting` com o mesmo `updated_at` (AC 6, L-008) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-connection.e2e-spec.ts -t "\(C6\)"`

**C7** - O adaptador rejeita com `WhatsAppConnectorUnavailableError` em cada um dos 5 casos: sem resposta em `EVOLUTION_TIMEOUT_MS`, erro de rede, status HTTP 5xx, corpo `{ error: true }` com status 200, e `connect` sem `base64` (AC 6) ✅
Proof: `npx jest src/infrastructure/external/whatsapp/evolution/evolution-whatsapp-connector.spec.ts -t "\(C7\)"`

### S2 - Ver o status da conexão · ~6 arquivos · ~25 KB · ~7k

**C8** - `GET /whatsapp/connection` como Dono responde `200` com exatamente as chaves `status` e `disconnectedAt` (AC 8, CA-13.2) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-connection.e2e-spec.ts -t "\(C8\)"`

**C9** - Numa barbearia que nunca pediu a conexão, `GET` responde `200` com `{ status: "disconnected", disconnectedAt: null }` e o fake não recebe `getState` (AC 9) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-connection.e2e-spec.ts -t "\(C9\)"`

**C10** - A tabela de transição, testada por completo sobre os 9 pares (estado gravado × evento `open` / `connecting` / `close`), dá: `connecting`+`open` → `connected`; `disconnected`+`open` → `connected` com `disconnectedAt` nulo; `connected`+`open` → sem mudança; `connecting`+`connecting` → sem mudança; `connected`+`connecting` → `connected`; `disconnected`+`connecting` → `connecting`; `connecting`+`close` → `disconnected` com `disconnectedAt` inalterado e sem alerta; `connected`+`close` → `disconnected` com `disconnectedAt` = agora e alerta; `disconnected`+`close` → sem mudança e sem alerta (AC 10, AC 11, AC 12, AC 15, AC 19) ✅
Proof: `npx jest src/domain/entities/whatsapp-connection.spec.ts -t "\(C10\)"`

**C11** - Com a conexão `connecting` e o fake devolvendo `open` em `getState`, `GET` responde `connected` com `disconnectedAt: null`, e a linha gravada fica `connected` (AC 10) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-connection.e2e-spec.ts -t "\(C11\)"`

**C12** - Com a conexão `connected` e o fake rejeitando `getState`, `GET` responde `200` com `status: "connected"`, que é o estado gravado (AC 13) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-connection.e2e-spec.ts -t "\(C12\)"`

**C13** - O adaptador traduz `connectionState` `{ instance: { state } }` para `open`, `connecting` e `close` quando `state` é um desses; `404` e `state` ausente viram `close` (AC 14) ✅
Proof: `npx jest src/infrastructure/external/whatsapp/evolution/evolution-whatsapp-connector.spec.ts -t "\(C13\)"`

### S3 - Alertar o Dono quando a conexão cai · ~6 arquivos · ~30 KB · ~8k

**C14** - Com a conexão `connected`, relógio em `2026-09-29T15:00:00Z`, dois usuários `owner` e um `barber` na barbearia, um webhook `close` grava `status = 'disconnected'` e `disconnected_at = 2026-09-29T15:00:00Z` e envia exatamente 2 e-mails, um para cada Dono, com o assunto "O WhatsApp da barbearia desconectou"; o Barbeiro não recebe (AC 15, CA-13.3) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-connection.e2e-spec.ts -t "\(C14\)"`

**C15** - Uma queda às `2026-09-29T15:00:00Z` numa barbearia `America/Sao_Paulo` chamada "Barbearia do Zé" gera um e-mail cujo texto contém "Barbearia do Zé", "29/09/2026 12:00" e `${APP_WEB_URL}/configuracoes/whatsapp` (AC 16) ✅
Proof: `npx jest src/usecases/apply-whatsapp-connection-state/apply-whatsapp-connection-state.use-case.spec.ts -t "\(C15\)"`

**C16** - Depois da queda, `GET` responde `{ status: "disconnected", disconnectedAt: "2026-09-29T15:00:00.000Z" }`; depois de um webhook `open`, responde `{ status: "connected", disconnectedAt: null }` (AC 17, CA-13.3) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-connection.e2e-spec.ts -t "\(C16\)"`

**C17** - Com a conexão `connected`, dois webhooks `close` enviados em paralelo respondem `204` e geram exatamente 1 e-mail por Dono (AC 18, door 6) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-connection.e2e-spec.ts -t "\(C17\)"`

**C18** - Com a conexão `connected`, um webhook `close` e um `GET` com o fake devolvendo `close`, disparados em paralelo, geram exatamente 1 e-mail por Dono (AC 18, door 6) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-connection.e2e-spec.ts -t "\(C18\)"`

**C19** - Com a conexão já `disconnected` e `disconnected_at` preenchido, um webhook `close` não envia e-mail e não altera `disconnected_at` (AC 19) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-connection.e2e-spec.ts -t "\(C19\)"`

**C20** - Com o `EmailSender` rejeitando, o use case de transição resolve sem lançar, a conexão fica gravada `disconnected` com `disconnectedAt` e o resultado indica a falha do alerta; no e2e, o webhook responde `204` (AC 20) ✅
Proof: `npx jest src/usecases/apply-whatsapp-connection-state/apply-whatsapp-connection-state.use-case.spec.ts -t "\(C20\)"`
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-connection.e2e-spec.ts -t "\(C20\)"`

**C21** - Quando o alerta falha, o log de erro, pelo webhook e pelo `GET`, leva só `barbershopId` e o `name`/`code` do erro, e nenhum dos seus argumentos contém o e-mail do Dono (AC 20) ✅
Proof: `npx jest src/infrastructure/external/whatsapp/evolution/evolution-webhook.controller.spec.ts -t "\(C21\)"`
Proof: `npx jest src/interface-adapters/controllers/whatsapp-connection.controller.spec.ts -t "\(C21\)"`

### S4 - Receber o webhook da Evolution · ~4 arquivos · ~20 KB · ~5k

**C22** - Com a conexão `connecting`, `POST /webhooks/whatsapp/evolution` com `authorization: Bearer <segredo>` e `{ event: "connection.update", instance: <barbershopId>, data: { state: "open" } }` responde `204` com corpo vazio, e `GET` passa a mostrar `connected` (AC 21) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-connection.e2e-spec.ts -t "\(C22\)"`

**C23** - O webhook responde `401` e não altera a conexão em cada um dos 3 casos: sem `authorization`, com outro segredo e com o segredo sem o prefixo `Bearer ` (AC 22) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-connection.e2e-spec.ts -t "\(C23\)"`

**C24** - Com o segredo certo, o webhook responde `400` em cada um dos 3 casos: sem `event`, sem `instance` e com `instance` numérico (AC 23) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-connection.e2e-spec.ts -t "\(C24\)"`

**C25** - Com o segredo certo, o webhook responde `204` sem alterar nenhuma linha em cada um dos 4 casos: `event: "messages.upsert"`, `data.state: "pending"`, `instance` de uma barbearia sem conexão gravada e `instance` que não é UUID (AC 24) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-connection.e2e-spec.ts -t "\(C25\)"`

**C26** - `data.state: "refused"` com a conexão `connecting` grava `disconnected` sem e-mail; com a conexão `connected`, grava `disconnected` e envia o e-mail de queda (AC 25) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-connection.e2e-spec.ts -t "\(C26\)"`

**C27** - O controller do webhook, nos casos aplicado, ignorado e inválido, não passa ao logger nenhum argumento com o corpo recebido, o `apikey` do corpo ou o header `authorization` (AC 26) ✅
Proof: `npx jest src/infrastructure/external/whatsapp/evolution/evolution-webhook.controller.spec.ts -t "\(C27\)"`

### S5 - Isolamento do fornecedor, permissões e operação · ~12 arquivos · ~45 KB · ~12k

**C28** - Nenhum arquivo de `src/domain/`, `src/usecases/` ou `src/interface-adapters/` importa de `infrastructure/external/whatsapp` nem menciona `evolution`, e o lint passa (AC 27, CA-13.5, door 4) ✅
Proof: `! grep -rniE "infrastructure/external/whatsapp|evolution" src/domain src/usecases src/interface-adapters`
Proof: `npm run lint:check`

**C29** - Com sessão de Barbeiro, `POST` e `GET /whatsapp/connection` respondem `403` com exatamente "Acesso negado." (AC 28) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-connection.e2e-spec.ts -t "\(C29\)"`

**C30** - Sem sessão, `POST` e `GET /whatsapp/connection` respondem `401` (AC 29) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-connection.e2e-spec.ts -t "\(C30\)"`

**C31** - Com as barbearias A (`connected`) e B (sem conexão), o `GET` do Dono de B responde `disconnected`, e um webhook `close` com `instance` = A altera só a linha de A e só envia e-mail ao Dono de A (AC 30, RN-26, door 2) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-connection.e2e-spec.ts -t "\(C31\)"`

**C32** - Com o `ping` do fake rejeitando, `GET /health/ready` responde `503` com `details.whatsapp.status = "down"`; com o `ping` resolvendo, responde `200` com `details.whatsapp.status = "up"` e `details.database.status = "up"` (AC 31, door 7) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/app.e2e-spec.ts -t "\(C32\)"`

**C33** - Depois de uma queda, `GET /metrics` mostra `whatsapp_disconnections_total 1`; depois de um `POST` com o fake falhando, o adaptador soma 1 em `whatsapp_connector_errors_total{operation="requestQrCode"}`; nenhuma das duas métricas tem label com id de barbearia (AC 32) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-connection.e2e-spec.ts -t "\(C33\)"`
Proof: `npx jest src/infrastructure/external/whatsapp/evolution/evolution-whatsapp-connector.spec.ts -t "\(C33\)"`

**C34** - O `/docs-json` traz as três rotas com `summary` citando "US-13", `POST /whatsapp/connection` com respostas `200`, `401`, `403`, `409` e `502`, `GET /whatsapp/connection` com `200`, `401` e `403`, e `POST /webhooks/whatsapp/evolution` com `204`, `400` e `401`, sem `security` bearer (AC 33) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/api-docs.e2e-spec.ts -t "\(C34\)"`

**C35** - A migration cria `whatsapp_connections` com as constraints do door 1: inserir `status = 'foo'` falha, uma segunda linha da mesma barbearia falha pela chave primária, `status` nulo falha, e apagar a barbearia apaga a linha (door 1) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-connection.e2e-spec.ts -t "\(C35\)"`

**C36** - `validateEnv` falha sem `EVOLUTION_API_URL`, sem `EVOLUTION_API_KEY`, sem `WHATSAPP_WEBHOOK_URL`, sem `WHATSAPP_WEBHOOK_SECRET` e com `WHATSAPP_WEBHOOK_SECRET` de 31 caracteres; aceita 32; `EVOLUTION_TIMEOUT_MS` ausente vira `10000`. O `.env.example` traz as 5 chaves, e o compose, no perfil `whatsapp`, usa `evoapicloud/evolution-api:v2.3.7` (door 5) ✅
Proof: `npx jest src/infrastructure/config/env.schema.spec.ts -t "\(C36\)"`
Proof: `grep -cE "^(EVOLUTION_API_URL|EVOLUTION_API_KEY|EVOLUTION_TIMEOUT_MS|WHATSAPP_WEBHOOK_URL|WHATSAPP_WEBHOOK_SECRET)=" .env.example | grep -qx 5`
Proof: `docker compose --profile whatsapp config | grep -q "image: evoapicloud/evolution-api:v2.3.7"`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| `POST /whatsapp/connection` statuses (5) | `200` C1 · `401` C30 · `403` C29 · `409` C5 · `502` C6 | - |
| `GET /whatsapp/connection` statuses (3) | `200` C8 · `401` C30 · `403` C29 | - |
| `POST /webhooks/whatsapp/evolution` statuses (3) | `204` C22 · `400` C24 · `401` C23 | - |
| transição estado gravado × evento (9) | `connecting`+`open` C10 · `disconnected`+`open` C10 · `connected`+`open` C10 · `connecting`+`connecting` C10 · `connected`+`connecting` C10 · `disconnected`+`connecting` C10 · `connecting`+`close` C10 · `connected`+`close` C10 · `disconnected`+`close` C10 | - |
| `data.state` do webhook (5) | `open` C22 · `connecting` C10 · `close` C14 · `refused` C26 · outro C25 | - |
| webhook ignorado (4) | outro evento C25 · outro estado C25 · barbearia sem conexão C25 · `instance` não UUID C25 | - |
| webhook recusado por segredo (3) | sem header C23 · segredo errado C23 · sem `Bearer ` C23 | - |
| corpo inválido do webhook (3) | sem `event` C24 · sem `instance` C24 · `instance` não texto C24 | - |
| falhas do conector (5) | timeout C7 · rede C7 · 5xx C7 · `{ error: true }` C7 · sem `base64` C7 | - |
| estados lidos do `connectionState` (5) | `open` C13 · `connecting` C13 · `close` C13 · `404` C13 · sem `state` C13 | - |
| caminhos que detectam queda (2) | webhook C14 · `GET` C18 | - |
| corridas que podem duplicar o alerta (2) | webhook + webhook C17 · webhook + `GET` C18 | - |
| destinatários do alerta (2) | Donos recebem C14 · Barbeiro não recebe C14 | - |
| logs do alerta que falha (2 lugares) | webhook C21 · `GET` C21 | - |
| doors do Landing (7) | door 1 C4, C35 · door 2 C31 · door 3 C2 · door 4 C28 · door 5 C2, C36 · door 6 C17, C18 · door 7 C32 | - |
| entidades do Relations com constraint nova (1) | `WhatsAppConnection` C35 | - |
| variáveis de ambiente novas (5) | `EVOLUTION_API_URL` C36 · `EVOLUTION_API_KEY` C36 · `EVOLUTION_TIMEOUT_MS` C36 · `WHATSAPP_WEBHOOK_URL` C36 · `WHATSAPP_WEBHOOK_SECRET` C36 | - |
| startup config: `WHATSAPP_CONNECTOR` registrado (2 assemblies) | `AppModule`, que o e2e importa e troca pelo fake, C1 · `app.e2e-spec`, que monta o próprio app, C32 | - |

- Checks que citam status, rota ou formato de resposta: C1, C3, C5, C6, C8, C9, C11, C12, C16, C17, C22-C26, C29-C32, C34. Cada um tem uma prova e2e que cruza a rota HTTP
- C2, C3, C7, C13 e C33 provam o adaptador no nível dele, com um `fetch` falso: o e2e troca o adaptador inteiro pelo fake e nunca passa por ele
- C10 prova a tabela de transição inteira no domínio; os e2e (C11, C14, C16, C19, C22, C26) só percorrem um caminho cada e não substituem essa prova

## Swept

- validation: C24, C25, C36
- failure modes: C6, C12, C20 - falha do conector não altera o estado gravado; falha do e-mail não desfaz a queda
- idempotency: C3 (pedir o QR de novo não cria outra instância), C19 (`close` repetido não alerta de novo)
- authorization: C23, C29, C30; existing - `SessionGuard` com o padrão só-Dono (AD-007) nas rotas do painel
- concurrency: C17, C18 - `UPDATE` condicional do door 6
- data lifecycle: C35 - a linha some com a barbearia (`ON DELETE CASCADE`); o QR nunca é gravado (C4); nenhuma barbearia existente ganha linha (tabela nova, vazia)
- dependency failure: C6, C7, C12, C32
- state transitions: C10, C26
- observability: C21, C27, C32, C33

## Handoff

- Arquivos existentes tocados somam 53.275 bytes (`wc -c`: `env.schema.ts`, `.env.example`, `docker-compose.yml`, `domain-error.filter.ts`, `app.module.ts`, `health.controller.ts`, `observability.module.ts`, métricas de agendamento e port como modelo, `create-account-test-app.ts`, `app.e2e-spec.ts`, `api-docs.e2e-spec.ts`, `account.module.ts`, `fake-email-sender.ts`, um e2e de referência e a última migration) ≈ 13k tokens; arquivos novos estimados em ~110 KB (entidade e spec, erro, port, fake, repositório TypeORM e entidade ORM, migration, 3 use cases e specs, controller do painel, presenter, adaptador e spec, controller do webhook e spec, schema do webhook, métricas, indicador, módulo, e2e) ≈ 28k tokens
- S1 ≈ 18k, S2 entra em ≈ 25k, S3 em ≈ 33k, S4 em ≈ 38k, S5 fecha em ≈ 50k (com os existentes, ≈ 63k), abaixo do orçamento de 150k - um builder
- Mechanism: one builder (dentro do orçamento, sem pergunta)

- **Boundary:** C1-C36 fechados na branch `feat/us-13-whatsapp-connection` (um builder)
- **Settled mid-build:** o usuário aprovou o plano sem mudanças. O Landing ganhou a linha 7 (`ping()` no port, para o indicador do ready) antes do código. A resposta `401` do webhook usa "Webhook não autorizado.". O nome da FK na migration segue o nome gerado pelo TypeORM (`FK_c8e3cebf5c2d858ef3e5eece667`), como nas outras migrations, e `migration:generate --check` não acha diferenças. O C33 no e2e mede o aumento de 1 no contador, porque o registry é compartilhado pela suite
- **Abandoned:** o guard do webhook com o segredo no construtor deu lugar a um guard `@Injectable()` que lê o `ConfigService`, para funcionar com `@UseGuards`

