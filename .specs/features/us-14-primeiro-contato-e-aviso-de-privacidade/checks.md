# US-14: Primeiro contato do cliente e aviso de privacidade checks

Profile: light
Plan: `.specs/features/us-14-primeiro-contato-e-aviso-de-privacidade/plan.md`

24 checks em 4 fatias · 5 one-way doors · 2 open, 0 block (2 blocks go-live)

Um check concluído termina com ✅. Convenção das provas: todo teste cita o `CA` (ou o AC do plano, quando o CA não cobre) e o id do check entre parênteses no nome, ex.: `it('CA-14.1 (C1): ...')`. O seletor `-t` usa esse id.

- e2e: `npx jest --config ./test/jest-e2e.json <arquivo> -t "<padrão>"` (Postgres do compose rodando; o `WHATSAPP_CONNECTOR` é trocado por um fake e o relógio por um `FixedClock`)
- unitário: `npx jest <arquivo> -t "<padrão>"`

Valores usados nas provas: relógio em `2026-09-29T15:00:00Z` (`messageTimestamp` `1790694000`); barbearia "Barbearia do Zé"; `PRIVACY_POLICY_URL` do ambiente de teste; aviso esperado, com essas duas substituições: "Olá! Aqui é o assistente virtual da {nome da barbearia}. O atendimento é feito por inteligência artificial, e usamos seu nome e telefone para agendar seus horários. Política de privacidade: {PRIVACY_POLICY_URL}".

## Checks

### S1 - Cadastro no primeiro contato · ~9 arquivos · ~45 KB · ~11k

**C1** - Com a barbearia com conexão gravada, um webhook `messages.upsert` com `key: { remoteJid: "5511987654321@s.whatsapp.net", fromMe: false }`, `pushName: "João Silva"` e `messageTimestamp` = agora responde `204` e deixa exatamente 1 linha em `clients` dessa barbearia, com `phone = '+5511987654321'` e `name = 'João Silva'`; `GET /clients?q=987654321` do Dono devolve esse cliente (AC 1, CA-14.1, RF-29)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-first-contact.e2e-spec.ts -t "\(C1\)"`

**C2** - A conversão de JID em telefone, testada por tabela, dá: `553188887777@s.whatsapp.net` → `+5531988887777`; `551162223333@s.whatsapp.net` → `+5511962223333`; `554177776666@s.whatsapp.net` → `+5541977776666`; `552199998888@s.whatsapp.net` → `+5521999998888`; `5511987654321@s.whatsapp.net` → `+5511987654321`; `551133334444@s.whatsapp.net` (fixo, começa por 3) → `+551133334444`; `551152223333@s.whatsapp.net` (fixo, começa por 5) → `+551152223333`; e `null` para `14155550123@s.whatsapp.net`, `5511@s.whatsapp.net` e `550187654321@s.whatsapp.net` (DDD inválido) (AC 2, AC 18, door 4)
Proof: `npx jest src/infrastructure/external/whatsapp/evolution/whatsapp-jid.spec.ts -t "\(C2\)"`

**C3** - Com um cliente `+5531988887777` chamado "Carlos" já cadastrado pelo painel, um webhook de `553188887777@s.whatsapp.net` com `pushName: "Carlão"` responde `204`, a barbearia continua com 1 cliente com esse telefone e o nome continua "Carlos" (AC 2, AC 3, door 4)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-first-contact.e2e-spec.ts -t "\(C3\)"`

**C4** - O nome do cliente novo, testado por tabela no use case, dá: `pushName` ausente → "Cliente do WhatsApp"; `""` → "Cliente do WhatsApp"; `"  A  "` → "Cliente do WhatsApp"; `"5511987654321"` → "Cliente do WhatsApp"; `"  Ana  "` → "Ana"; `"Jo"` → "Jo"; 80 caracteres → os 80; 81 caracteres → os 80 primeiros (AC 4, AC 5)
Proof: `npx jest src/usecases/receive-whatsapp-message/receive-whatsapp-message.use-case.spec.ts -t "\(C4\)"`

**C5** - Dois webhooks do mesmo número novo enviados em paralelo respondem `204` os dois, e a barbearia fica com exatamente 1 cliente com esse telefone (AC 6, door 2)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-first-contact.e2e-spec.ts -t "\(C5\)"`

**C6** - O mesmo número escrevendo para as barbearias A e B cria 2 clientes, um com `barbershop_id` de cada, e o fake registra 1 `sendText` para cada barbearia, cada um com o nome da própria barbearia no texto (AC 7, RN-26)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-first-contact.e2e-spec.ts -t "\(C6\)"`

### S2 - Aviso de privacidade uma única vez · ~6 arquivos · ~30 KB · ~8k

**C7** - Na primeira mensagem de um número novo para "Barbearia do Zé", o fake registra exatamente 1 `sendText(barbershopId, "+5511987654321", <aviso esperado>)`, com o texto exato do cabeçalho (AC 8, CA-14.2, RF-10, RN-20)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-first-contact.e2e-spec.ts -t "\(C7\)"`

**C8** - Depois do aviso, `clients.privacy_notice_sent_at` do cliente é `2026-09-29T15:00:00Z`, o instante do relógio (AC 9)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-first-contact.e2e-spec.ts -t "\(C8\)"`

**C9** - Uma segunda mensagem do mesmo cliente, depois do aviso, responde `204` e não gera outro `sendText`: o fake continua com 1 envio (AC 10, CA-14.3)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-first-contact.e2e-spec.ts -t "\(C9\)"`

**C10** - Um cliente criado pelo painel, com `privacy_notice_sent_at` nulo, recebe 1 `sendText` com o aviso na primeira mensagem que manda (AC 11)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-first-contact.e2e-spec.ts -t "\(C10\)"`

**C11** - Para um cliente sem aviso, dois webhooks em paralelo geram exatamente 1 `sendText`; o mesmo corpo de webhook enviado duas vezes em sequência também gera exatamente 1 (AC 12, door 3)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-first-contact.e2e-spec.ts -t "\(C11\)"`

**C12** - Com o fake rejeitando `sendText` com `WhatsAppConnectorUnavailableError`, o webhook responde `204` e `privacy_notice_sent_at` continua nulo; com o fake voltando a funcionar, a mensagem seguinte gera 1 `sendText` e grava o instante (AC 13)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-first-contact.e2e-spec.ts -t "\(C12\)"`

**C13** - O schema de ambiente recusa a configuração sem `PRIVACY_POLICY_URL` e com `PRIVACY_POLICY_URL=politica`, e aceita `https://barberbot.example/privacidade` (AC 14)
Proof: `npx jest src/infrastructure/config/env.schema.spec.ts -t "\(C13\)"`

**C14** - `clients` tem a coluna `privacy_notice_sent_at` do tipo `timestamp with time zone`, anulável e sem `DEFAULT`, e um cliente inserido sem ela fica com `NULL` (door 3)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-first-contact.e2e-spec.ts -t "\(C14\)"`

### S3 - O que o webhook ignora · ~3 arquivos · ~20 KB · ~5k

**C15** - O controller do webhook, testado por tabela com o use case falso, não chama o use case e resolve sem erro em cada um dos 13 casos: `fromMe: true`; `remoteJid` `120363000000000000@g.us`; `status@broadcast`; `120363000000000000@newsletter`; `123456789012345@lid`; `messageTimestamp` 301 s antes de agora; `messageTimestamp` ausente; `remoteJid` `14155550123@s.whatsapp.net`; `instance` `"barbearia"` (não UUID); `data` ausente; `data.key` ausente; `remoteJid` numérico; `fromMe` ausente. Com `messageTimestamp` exatamente 300 s antes de agora, chama o use case uma vez com `{ barbershopId, phone: "+5511987654321", profileName }` e nada mais (AC 15 a AC 18, AC 20, door 5, AC 26)
Proof: `npx jest src/infrastructure/external/whatsapp/evolution/evolution-webhook.controller.spec.ts -t "\(C15\)"`

**C16** - No e2e, webhooks com `fromMe: true`, de grupo `@g.us` e com `messageTimestamp` 10 minutos antes de agora respondem `204` os três, sem criar cliente e sem `sendText` (AC 15, AC 16, AC 17)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-first-contact.e2e-spec.ts -t "\(C16\)"`

**C17** - Um `messages.upsert` válido para uma barbearia sem conexão gravada responde `204`, sem criar cliente e sem `sendText` (AC 19)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-first-contact.e2e-spec.ts -t "\(C17\)"`

### S4 - Fornecedor isolado, instâncias e operação · ~6 arquivos · ~35 KB · ~9k

**C18** - O adaptador cria a instância nova com `webhook.events` igual a `["CONNECTION_UPDATE", "MESSAGES_UPSERT"]` (AC 21)
Proof: `npx jest src/infrastructure/external/whatsapp/evolution/evolution-whatsapp-connector.spec.ts -t "\(C18\)"`

**C19** - O adaptador, quando a instância já existe (`connectionState` responde `200`), chama `POST /webhook/set/{barbershopId}` com o header `apikey` e o corpo `{ webhook: { enabled: true, url: WHATSAPP_WEBHOOK_URL, byEvents: false, events: ["CONNECTION_UPDATE", "MESSAGES_UPSERT"], headers: { authorization: "Bearer <WHATSAPP_WEBHOOK_SECRET>" } } }`, sem chamar `POST /instance/create`; se essa chamada responde 5xx, `ensureInstance` rejeita com `WhatsAppConnectorUnavailableError` (AC 22)
Proof: `npx jest src/infrastructure/external/whatsapp/evolution/evolution-whatsapp-connector.spec.ts -t "\(C19\)"`

**C20** - `sendText("<id>", "+5511987654321", "oi")` chama `POST /message/sendText/<id>` com o header `apikey` e o corpo `{ number: "5511987654321", text: "oi" }`; rejeita com `WhatsAppConnectorUnavailableError` e soma 1 em `whatsapp_connector_errors_total{operation="sendText"}` em cada um dos 4 casos: sem resposta em `EVOLUTION_TIMEOUT_MS`, erro de rede, status 5xx e corpo `{ error: true }` com status 200 (AC 23, door 1)
Proof: `npx jest src/infrastructure/external/whatsapp/evolution/evolution-whatsapp-connector.spec.ts -t "\(C20\)"`

**C21** - Durante um primeiro contato com envio bem-sucedido e outro com o `sendText` falhando, nenhuma chamada a `Logger` (`log`, `warn`, `error`, `debug`, `verbose`) recebe argumento cujo JSON contenha `987654321`, `João Silva` ou `inteligência artificial` (AC 24)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-first-contact.e2e-spec.ts -t "\(C21\)"`

**C22** - Um primeiro contato com envio bem-sucedido soma 1 em `whatsapp_clients_created_total` e 1 em `whatsapp_privacy_notices_total{outcome="sent"}`; um envio que falha soma 1 em `whatsapp_privacy_notices_total{outcome="failed"}`; nenhuma linha dessas métricas em `/metrics` tem label além de `outcome` (AC 25)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-first-contact.e2e-spec.ts -t "\(C22\)"`

**C23** - `npx eslint src` termina com código 0, com a regra `boundaries/dependencies` ativa, e nenhum arquivo fora de `src/infrastructure/` importa `external/whatsapp` (AC 26, RNF-05)
Proof: `npx eslint src`
Proof: `! grep -rl "external/whatsapp" src --include=*.ts | grep -v "^src/infrastructure/"`

**C24** - No documento OpenAPI, a descrição de `POST /webhooks/whatsapp/evolution` contém `messages.upsert` e `US-14` (AC 27)
Proof: `npx jest --config ./test/jest-e2e.json test/api-docs.e2e-spec.ts -t "\(C24\)"`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| `POST /webhooks/whatsapp/evolution` statuses em `messages.upsert` (1) | `204` C1, C12, C16, C17 | - |
| JID → telefone (10) | 13 dígitos C2 · 8 dígitos começando por 6 C2 · por 7 C2 · por 8 C2 · por 9 C2 · fixo começando por 3 C2 · fixo começando por 5 C2 · estrangeiro C2 · curto C2 · DDD inválido C2 | - |
| nome do perfil (8) | ausente C4 · vazio C4 · 1 caractere C4 · só dígitos C4 · com espaços C4 · 2 caracteres C4 · 80 caracteres C4 · 81 caracteres C4 | - |
| mensagem ignorada (14) | `fromMe` C15, C16 · `@g.us` C15, C16 · `status@broadcast` C15 · `@newsletter` C15 · `@lid` C15 · 301 s C15, C16 · timestamp ausente C15 · telefone inválido C15 · `instance` não UUID C15 · `data` ausente C15 · `key` ausente C15 · `remoteJid` não texto C15 · `fromMe` ausente C15 · barbearia sem conexão C17 | - |
| limite da janela (2) | 300 s processa C15 · 301 s ignora C15 | - |
| cliente que escreve (3) | novo C1, C7 · do painel sem aviso C3, C10 · já avisado C9 | - |
| corridas e reentregas (3) | cadastro concorrente C5 · aviso concorrente C11 · evento reentregue C11 | - |
| falhas do `sendText` no adaptador (4) | timeout C20 · rede C20 · 5xx C20 · `{ error: true }` C20 | - |
| desfecho do aviso (2) | `sent` C7, C8, C22 · `failed` C12, C22 | - |
| caminhos do `ensureInstance` (2) | instância nova C18 · instância existente C19 | - |
| valores de `PRIVACY_POLICY_URL` (3) | ausente C13 · não URL C13 · URL C13 | - |
| doors do Landing (5) | door 1 C20, C7 · door 2 C5 · door 3 C11, C14 · door 4 C2, C3 · door 5 C15 | - |
| entidades do Relations com constraint nova (2) | `Client` (unicidade que decide o cadastro) C5 · aviso no cliente C14 | - |
| startup config: `WHATSAPP_CONNECTOR` e `PRIVACY_POLICY_URL` (2 assemblies) | `AppModule`, que o e2e importa, C1, C7 · `env.schema`, validado na inicialização, C13 | - |

- Checks que citam status, rota ou formato: C1, C3, C5-C12, C16, C17, C22, C24. Cada um tem uma prova e2e que cruza a rota HTTP
- C2, C4, C15, C18-C20 provam as tabelas de decisão no nível delas: o e2e percorre um caminho de cada e troca o adaptador inteiro pelo fake
- O teste da US-13 que fixa `events: ["CONNECTION_UPDATE"]` (C2 da US-13) passa a esperar os dois eventos, porque o AC 21 aprovado muda esse comportamento

## Swept

- validation: C2, C4, C13, C15
- failure modes: C12 - falha no envio desfaz a reivindicação e o próximo contato tenta de novo; C19 - falha ao regravar o webhook
- idempotency: C9 (aviso não se repete), C11 (evento reentregue), C3 (cliente existente não é recriado)
- authorization: existing - guard do segredo do webhook da US-13 (C23 da US-13); o tenant vem de `instance` (AD-011) e cada barbearia só vê o próprio cliente, C6
- concurrency: C5 (door 2), C11 (door 3)
- data lifecycle: C14 - clientes existentes ficam com o aviso nulo e o recebem na primeira mensagem (C10); nenhum conteúdo de mensagem é gravado (Out of scope do plano)
- dependency failure: C12, C19, C20
- state transitions: C8, C9, C12 - aviso nulo → enviado; nulo → reivindicado → nulo de novo quando o envio falha
- observability: C21, C22, C20

## Handoff

- Arquivos existentes tocados somam ≈ 70 KB (`wc -c`: `evolution-webhook.controller.ts` e spec, `evolution-webhook.schema.ts`, `evolution-whatsapp-connector.ts` e spec, `whatsapp-connector.port.ts`, `fake-whatsapp-connector.ts`, `client.ts`, `client.repository.port.ts`, `typeorm-client.repository.ts`, `in-memory-client.repository.ts`, `client.entity.ts`, `whatsapp.module.ts`, `prometheus-whatsapp-metrics.ts`, `whatsapp-metrics.port.ts`, `counting-whatsapp-metrics.ts`, `env.schema.ts` e spec, `.env.example`, `api-docs.e2e-spec.ts`, `whatsapp-connection.e2e-spec.ts` como modelo) ≈ 18k tokens; arquivos novos estimados em ~45 KB (conversão de JID e spec, use case e spec, migration, e2e) ≈ 11k tokens
- S1 ≈ 11k, S2 entra em ≈ 19k, S3 em ≈ 24k, S4 fecha em ≈ 33k (com os existentes, ≈ 51k), abaixo do orçamento de 150k - um builder
- Mechanism: one builder (dentro do orçamento, sem pergunta)
