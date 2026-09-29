# US-16: Transferência para atendimento humano checks

Profile: light
Plan: `.specs/features/us-16-transferencia-para-atendimento-humano/plan.md`

30 checks em 7 fatias · 3 one-way doors · 0 open, 0 block

Um check concluído termina com ✅. Convenção das provas: todo teste cita o `CA` (ou o AC do plano, quando o CA não cobre) e o id do check entre parênteses no nome, ex.: `it('CA-16.1 (C1): ...')`. O seletor `-t` usa esse id.

- e2e: `npx jest --config ./test/jest-e2e.json <arquivo> -t "<padrão>"` (Postgres do compose rodando; `WHATSAPP_CONNECTOR` e `MESSAGE_INTERPRETER` trocados por fakes, relógio por `FixedClock`)
- unitário: `npx jest <arquivo> -t "<padrão>"`

Valores usados nas provas: relógio em `2026-09-29T15:00:00Z` (`messageTimestamp` `1790694000`); barbearia A "Barbearia do Zé" e barbearia B "Barbearia B", as duas conectadas; cliente "João Silva" `+5511987654321` (jid `5511987654321@s.whatsapp.net`) já com o aviso de privacidade enviado; `WHATSAPP_HANDOFF_RESUME_HOURS` = 12. Uma conversa pausada "há X" é inserida por SQL com `paused_at` e `last_activity_at` = agora - X. A interpretação do fake é escolhida por teste; o padrão é sem tópico, `offTopic: false`, `humanRequested: false`.

Textos esperados, com `{barbearia}` = "Barbearia do Zé":

- transferência: "Vou chamar alguém da equipe para te ajudar."
- sem tópico (US-15): "Posso te ajudar com serviços, preços, endereço e horário de funcionamento da {barbearia}. O que você gostaria de saber?"

## Checks

### S1 - Pedido explícito de atendente · ~10 arquivos · ~70 KB · ~18k

**C1** - Com a interpretação `{ humanRequested: true }`, um webhook de texto "quero falar com alguém" responde `204`, o fake do conector registra exatamente 1 `sendText` para `+5511987654321` com o texto de transferência, e a linha de `whatsapp_conversations` do cliente tem `pause_reason = 'requested'` e `paused_at = 2026-09-29T15:00:00Z` (AC 1, CA-16.1, RF-11, RF-13)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-handoff.e2e-spec.ts -t "\(C1\)"`

**C2** - Por tabela no use case, `humanRequested: true` junto com `{ topics: ['services', 'address'], services: ['Corte'] }` e junto com `{ offTopic: true }` dá, nos dois casos, exatamente 1 `sendText` com só o texto de transferência (sem `R$`, sem "Endereço", sem a recusa) e a conversa pausada com `requested` (AC 2)
Proof: `npx jest src/usecases/answer-client-question/answer-client-question.use-case.spec.ts -t "\(C2\)"`

**C3** - Com o fake do conector falhando no `sendText` e a interpretação `{ humanRequested: true }`, o webhook responde `204`, a conversa fica com `paused_at` preenchido, o controller loga o erro com `barbershopId` e o nome do erro, e a serialização do que foi logado não contém o telefone nem o texto da mensagem (AC 3)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-handoff.e2e-spec.ts -t "\(C3\)"`
Proof: `npx jest src/infrastructure/external/whatsapp/evolution/evolution-webhook.controller.spec.ts -t "\(C3\)"`

**C4** - O schema da interpretação exige `humanRequested` booleano: o adaptador do Gemini rejeita com `MessageInterpreterUnavailableError` um JSON sem `humanRequested` e um com `humanRequested: "sim"`, resolve com `humanRequested: true` repassado; o `responseJsonSchema` enviado tem `humanRequested` em `properties` e em `required`; e o `systemInstruction` contém "humanRequested" (door 1)
Proof: `npx jest src/infrastructure/external/gemini/gemini-message-interpreter.spec.ts -t "\(C4\)"`

### S2 - Duas falhas seguidas de entendimento · ~4 arquivos · ~40 KB · ~10k

**C5** - Duas mensagens seguidas do mesmo cliente com a interpretação sem tópico: a primeira recebe exatamente o texto sem tópico e deixa `consecutive_failures = 1` sem pausa; a segunda recebe exatamente o texto de transferência (e não o sem tópico) e deixa a conversa pausada com `pause_reason = 'not_understood'` (AC 4, AC 5, CA-16.2, RF-12)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-handoff.e2e-spec.ts -t "\(C5\)"`

**C6** - Por tabela no use case, partindo de 1 falha, a mensagem seguinte com: tópico `address` → 0 falhas; `offTopic: true` → 0 falhas; e, depois disso, uma sem tópico → 1 falha e nenhuma pausa (AC 6)
Proof: `npx jest src/usecases/answer-client-question/answer-client-question.use-case.spec.ts -t "\(C6\)"`

**C7** - Partindo de 1 falha, o intérprete rejeitando deixa a contagem em 1 e envia o texto de indisponível; a próxima sem tópico transfere com `not_understood` (AC 7)
Proof: `npx jest src/usecases/answer-client-question/answer-client-question.use-case.spec.ts -t "\(C7\)"`

**C8** - Com a conversa já com `consecutive_failures = 1` no banco, dois webhooks do mesmo cliente com `key.id` diferentes e interpretação sem tópico, enviados em paralelo, deixam no fake do conector exatamente 1 `sendText` com o texto de transferência e a conversa pausada uma vez com `not_understood` (AC 8, door 2)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-handoff.e2e-spec.ts -t "\(C8\)"`

### S3 - Conversa pausada · ~5 arquivos · ~45 KB · ~11k

**C9** - Com a conversa pausada há 1h, um webhook de texto do cliente responde `204` e deixa o fake do intérprete com 0 chamadas e o fake do conector com 0 `sendText` (AC 9, CA-16.3)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-handoff.e2e-spec.ts -t "\(C9\)"`

**C10** - Por tabela, com a conversa pausada há 1h, cada uma destas mensagens deixa `last_activity_at = 2026-09-29T15:00:00Z` e nenhum `sendText`: texto do cliente; áudio do cliente (`audioMessage`, sem texto); mensagem `fromMe: true` com `remoteJid` do cliente e texto "oi, aqui é o Zé" (AC 10)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-handoff.e2e-spec.ts -t "\(C10\)"`

**C11** - Uma mensagem `fromMe: true` para um telefone sem cliente na barbearia não cria linha em `clients` nem em `whatsapp_conversations` e não gera `sendText`; e uma `fromMe: true` para o cliente com conversa ativa (0 falhas, sem pausa, `last_activity_at` 1h atrás) deixa `last_activity_at` e `paused_at` inalterados (AC 11)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-handoff.e2e-spec.ts -t "\(C11\)"`

**C12** - Com o mesmo telefone cliente nas barbearias A e B e só a conversa de A pausada há 1h, um texto para B com a interpretação `{ topics: ['address'] }` recebe resposta de B, e um texto para A não recebe nada (AC 12, RN-26)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-handoff.e2e-spec.ts -t "\(C12\)"`

### S4 - Reativação pelo Dono · ~8 arquivos · ~50 KB · ~13k

**C13** - Com a conversa pausada há 1h e 2 falhas, `POST /whatsapp/conversations/:clientId/resume` como Dono de A responde `204` sem corpo; a linha fica com `paused_at` e `pause_reason` nulos e `consecutive_failures = 0`; e um texto seguinte com `{ topics: ['address'] }` recebe resposta (AC 13, CA-16.4, RF-15)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-handoff.e2e-spec.ts -t "\(C13\)"`

**C14** - A reativação responde `204` para um cliente de A com conversa ativa (a linha fica igual) e para um cliente de A sem conversa (nenhuma linha é criada) (AC 14)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-handoff.e2e-spec.ts -t "\(C14\)"`

**C15** - A reativação responde `404` com `{ message: 'Cliente não encontrado.' }` para um uuid aleatório e para o id de um cliente da barbearia B, e a conversa pausada de B continua pausada (AC 15, RN-26)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-handoff.e2e-spec.ts -t "\(C15\)"`

**C16** - A reativação com `clientId = 'abc'` responde `400` (AC 16)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-handoff.e2e-spec.ts -t "\(C16\)"`

**C17** - Por tabela sobre as duas rotas novas, um Barbeiro de A recebe `403` com `{ message: 'Acesso negado.' }` e uma chamada sem token recebe `401`; depois disso a conversa pausada continua pausada (AC 17, AC 24, AD-007)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-handoff.e2e-spec.ts -t "\(C17\)"`

### S5 - Reativação automática · ~4 arquivos · ~30 KB · ~8k

**C18** - Por tabela, com a conversa pausada (motivo `requested`, 2 falhas) e a mais recente entre `paused_at` e `last_activity_at` a 11h59 de agora, um texto com `{ topics: ['address'] }` não gera `sendText` e a conversa segue pausada; a exatamente 12h00 e a 12h01, gera 1 `sendText` com a resposta de endereço, e a linha fica com `paused_at` nulo e `consecutive_failures = 0`. Um caso com `paused_at` 13h atrás e `last_activity_at` 11h atrás também não responde (AC 18, AC 19, CA-16.5, door 3)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-handoff.e2e-spec.ts -t "\(C18\)"`

**C19** - O schema de ambiente dá `WHATSAPP_HANDOFF_RESUME_HOURS = 12` quando ausente, aceita `24` e recusa `0`, `-1`, `1.5` e `abc` (AC 20)
Proof: `npx jest src/infrastructure/config/env.schema.spec.ts -t "\(C19\)"`

**C20** - O use case usa o prazo configurado: com `resumeAfterHours = 2`, uma conversa pausada há 2h01 é reativada e respondida, e uma pausada há 1h59 não (AC 18)
Proof: `npx jest src/usecases/answer-client-question/answer-client-question.use-case.spec.ts -t "\(C20\)"`

### S6 - Conversas aguardando humano · ~7 arquivos · ~45 KB · ~11k

**C21** - Com conversas de A pausadas há 3h (`not_understood`, cliente "Ana") e há 1h (`requested`, cliente "João Silva", `last_activity_at` há 30 min), `GET /whatsapp/conversations/waiting-human` como Dono de A responde `200` com exatamente `{ conversations: [ { clientId, clientName: 'Ana', phone, reason: 'not_understood', pausedAt: '2026-09-29T12:00:00.000Z', lastActivityAt: '2026-09-29T12:00:00.000Z' }, { ..., clientName: 'João Silva', reason: 'requested', pausedAt: '2026-09-29T14:00:00.000Z', lastActivityAt: '2026-09-29T14:30:00.000Z' } ] }`, nessa ordem (AC 21, CA-16.6)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-handoff.e2e-spec.ts -t "\(C21\)"`

**C22** - A lista do Dono de A omite, por tabela: conversa ativa com falhas; conversa reativada pelo Dono; conversa com pausa vencida há 12h01; conversa pausada da barbearia B (AC 22, RN-26)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-handoff.e2e-spec.ts -t "\(C22\)"`

**C23** - Sem conversa pausada, a lista responde `200` com `{ conversations: [] }` (AC 23)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-handoff.e2e-spec.ts -t "\(C23\)"`

### S7 - Observável, documentado e o schema · ~6 arquivos · ~40 KB · ~10k

**C24** - No e2e, uma transferência por pedido aumenta `whatsapp_handoffs_total{reason="requested"}` em 1, uma por duas falhas aumenta `whatsapp_handoffs_total{reason="not_understood"}` em 1, e cada uma aumenta `whatsapp_replies_total{kind="handoff"}` em 1; o texto de `/metrics` para essas duas métricas não traz label além de `reason` e `kind` (AC 25)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-handoff.e2e-spec.ts -t "\(C24\)"`

**C25** - No e2e, a reativação pelo Dono de uma conversa pausada aumenta `whatsapp_bot_resumes_total{trigger="owner"}` em 1 e a reativação por prazo vencido (C18) aumenta `whatsapp_bot_resumes_total{trigger="timeout"}` em 1; a reativação de conversa ativa (C14) não muda nenhuma das duas (AC 26)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-handoff.e2e-spec.ts -t "\(C25\)"`

**C26** - Na transferência, o use case loga um objeto com `barbershopId` e `reason`, e a serialização do que foi logado não contém o telefone nem o texto do cliente (AC 27)
Proof: `npx jest src/usecases/answer-client-question/answer-client-question.use-case.spec.ts -t "\(C26\)"`

**C27** - No documento OpenAPI, `GET /whatsapp/conversations/waiting-human` e `POST /whatsapp/conversations/{clientId}/resume` têm `summary` contendo `US-16`, `x-roles` = `['owner']`, resposta de sucesso (`200` com schema, `204`) e as respostas `401` e `403`; o `POST` tem `404` com o exemplo "Cliente não encontrado."; e a descrição de `POST /webhooks/whatsapp/evolution` contém `US-16` (AC 28)
Proof: `npx jest --config ./test/jest-e2e.json test/api-docs.e2e-spec.ts -t "\(C27\)"`

**C28** - A tabela `whatsapp_conversations` tem chave primária exatamente em `(barbershop_id, client_id)`, e o banco recusa: `pause_reason = 'bored'`; `paused_at` preenchido com `pause_reason` nulo; `pause_reason` preenchido com `paused_at` nulo; `consecutive_failures = -1`; `last_activity_at` nulo; e uma segunda linha para o mesmo `(barbershop_id, client_id)`; apagar o cliente apaga a conversa (door 2, Relations)
Proof: `npx jest --config ./test/jest-e2e.json test/database/whatsapp-conversations-schema.e2e-spec.ts -t "\(C28\)"`

**C29** - Uma mensagem de texto de um cliente sem conversa cria a linha com `consecutive_failures = 0`, `paused_at` nulo e `last_activity_at = 2026-09-29T15:00:00Z`; uma redelivery do mesmo `key.id` depois de uma transferência não gera outro `sendText` nem muda a linha (door 2, idempotência herdada da door 3 da US-15)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-handoff.e2e-spec.ts -t "\(C29\)"`

**C30** - Os e2e existentes da US-14 e da US-15 continuam passando sem mudança em asserções (Impact)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-questions.e2e-spec.ts test/whatsapp-first-contact.e2e-spec.ts`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| gatilhos de transferência (2) | `requested` C1 · `not_understood` C5 | - |
| efeito da resposta na contagem (5) | sem tópico soma C5 · com tópico zera C6 · fora de contexto zera C6 · indisponível mantém C7 · pedido de atendente pausa C1 | - |
| estados da conversa na chegada de um texto (4) | sem conversa C29 · ativa C5 · pausada no prazo C9 · pausada vencida C18 | - |
| fronteira do prazo (4) | 11h59 C18 · 12h00 C18 · 12h01 C18 · pausa velha com atividade nova C18 | - |
| o que conta como atividade na pausa (3) | texto do cliente C10 · mensagem sem texto C10 · `fromMe` da equipe C10 | - |
| `fromMe` fora de pausa (2) | telefone sem cliente C11 · conversa ativa C11 | - |
| `POST /whatsapp/conversations/:clientId/resume` statuses (5) | 204 C13, C14 · 400 C16 · 401 C17 · 403 C17 · 404 C15 | - |
| `GET /whatsapp/conversations/waiting-human` statuses (3) | 200 C21, C23 · 401 C17 · 403 C17 | - |
| omissões da lista (4) | ativa C22 · reativada C22 · vencida C22 · outra barbearia C22 | - |
| `reason` de `whatsapp_handoffs_total` (2) | `requested` C24 · `not_understood` C24 | - |
| `trigger` de `whatsapp_bot_resumes_total` (2) | `owner` C25 · `timeout` C25 | - |
| constraints da door 2 (6) | motivo fora do conjunto C28 · pausa sem motivo C28 · motivo sem pausa C28 · falhas negativas C28 · atividade nula C28 · PK duplicada C28 | - |
| doors do plano (3) | 1 `humanRequested` C4, C1 · 2 tabela C28, C8 · 3 prazo na leitura C18, C22 | - |
| `WHATSAPP_HANDOFF_RESUME_HOURS` (6) | ausente C19 · 24 C19 · 0 C19 · -1 C19 · 1.5 C19 · abc C19 | - |
| startup config: prazo de reativação (2 assemblies) | `WhatsAppModule` na aplicação C18 (sobe o `AppModule`, lê o env) · use case isolado C20 | - |

- Claims naming a status code, route or response shape: C1, C3, C9, C13-C17, C21-C23, C27 - each has a proof that crosses the boundary
- No other check claims more than the single case its proof exercises

## Swept

- validation: C4, C16, C19
- failure modes: C3, C7
- idempotency: C14 (reativar conversa ativa), C29 (redelivery depois da transferência)
- authorization: C17
- concurrency: C8 (duas segundas falhas em paralelo, um só aviso)
- data lifecycle: C28 (apagar o cliente apaga a conversa); a retenção das conversas segue em aberto (seção 19) e a tabela não guarda texto
- dependency failure: C3 (envio falha), C7 (Gemini fora não conta falha)
- state transitions: C1, C5 (ativa → pausada), C13 (pausada → ativa pelo Dono), C18 (pausada → ativa por prazo), C9 (pausada fica pausada)
- observability: C24, C25, C26

## Handoff

- S1 = 18k, S2 entra a 28k, S3 a 39k, S4 a 52k, S5 a 60k, S6 a 71k, S7 a 81k (arquivos tocados e vizinhos lidos, ~320 KB / 4), abaixo do budget de 150k - one builder
