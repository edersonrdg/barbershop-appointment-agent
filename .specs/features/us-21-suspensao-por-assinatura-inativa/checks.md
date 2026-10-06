# US-21: Suspensão por assinatura inativa checks

Profile: standard
Plan: `.specs/features/us-21-suspensao-por-assinatura-inativa/plan.md`

36 checks em 4 fatias · 3 one-way doors · 1 open, 0 block

Perfil `standard`: o repositório não declara perfil, e a US-20 foi verificada nele. Esta história põe um guard global na frente de toda escrita e decide por uma tabela de motivos com limites exatos, e o `light` não recalcula a cobertura nem injeta falhas.

Um check concluído termina com ✅. Convenção das provas: todo teste cita o `CA` (ou o AC/door do plano) e o id do check entre parênteses, dentro de um `describe('US-21 ...')`. O seletor `-t "US-21.*\(Cn\)"` evita colidir com os ids das histórias anteriores.

- e2e: `npx jest --config ./test/jest-e2e.json <arquivo> -t "<padrão>"` (Postgres do compose rodando; `PAYMENT_GATEWAY`, `EMAIL_SENDER`, `WHATSAPP_CONNECTOR` e `MESSAGE_INTERPRETER` trocados por fakes, relógio por `SettableClock`)
- unitário: `npx jest <arquivo> -t "<padrão>"`

Cenário das provas, salvo quando o check diz outra coisa:

- relógio em `2026-10-02T15:00:00Z` = sexta-feira, 02/10/2026, 12:00 em `America/Sao_Paulo` (`SUBSCRIPTION_NOW` de `test/support/subscription-test-app.ts`)
- "Barbearia do Zé", fuso `America/Sao_Paulo`; Dono "Ana Souza", `ana@barbearia.test`; barbeiro "João", `joao@barbearia.test`
- `SUBSCRIPTION_GRACE_DAYS = 5` (o padrão), salvo onde o check fixa outro valor
- **teste vencido:** `trialing` com `trialEndsAt = 2026-10-01T15:00:00Z`
- **atrasada:** `past_due`, `paidUntil = 2026-10-02`, `paymentFailedAt = 2026-09-26T15:00:00Z` (6 dias antes do relógio), `paymentIssueUrl = https://sandbox.asaas.com/i/pay_2`, assinatura `sub_1`
- **encerrada:** `active`, cartão, `sub_1` cancelada (`cancelRequestedAt` preenchido), `paidUntil = 2026-10-01` (a data local de hoje, 02/10, é posterior)
- **em dia:** `active`, `sub_1`, `paidUntil = 2026-11-02`, sem cancelamento

Textos esperados:

- `402`: `A assinatura desta barbearia está inativa. O painel está em modo leitura até a assinatura ser regularizada.`
- bot suspenso: `Olá! No momento o atendimento automático da Barbearia do Zé está indisponível. Para agendar ou tirar dúvidas, fale direto com a barbearia.`
- já assinada (US-20): `Esta barbearia já tem uma assinatura.`

## Checks

### S1 - A regra de suspensão · 5 arquivos · ~40 KB · ~10k

**C1** - `trialing` com `trialEndsAt` igual ao instante atual devolve `trial_ended`; com `trialEndsAt` 1 ms depois do instante atual devolve `null` (AC 1, AC 6, CA-21.1) ✅
Proof: `npx jest src/domain/entities/barbershop-subscription.spec.ts -t "US-21.*\(C1\)"`

**C2** - `past_due` com `paymentFailedAt` exatamente 5 × 24 h antes do instante atual devolve `payment_overdue`; com `paymentFailedAt` 5 × 24 h − 1 ms antes devolve `null` (AC 2, AC 3, CA-21.3) ✅
Proof: `npx jest src/domain/entities/barbershop-subscription.spec.ts -t "US-21.*\(C2\)"`

**C3** - Com `graceDays = 2`, `past_due` com `paymentFailedAt` 2 × 24 h antes devolve `payment_overdue` e 47 h antes devolve `null`; com `graceDays = 0`, `past_due` falhado no instante atual devolve `payment_overdue` (AC 2, AC 3; o valor da configuração é o que decide, não o 5 fixo) ✅
Proof: `npx jest src/domain/entities/barbershop-subscription.spec.ts -t "US-21.*\(C3\)"`

**C4** - `active` com pedido de cancelamento e `paidUntil = 2026-11-02` no fuso `America/Sao_Paulo`: em `2026-11-03T02:59:59.999Z` (02/11, 23:59 local) devolve `null`; em `2026-11-03T03:00:00Z` (03/11, 00:00 local) devolve `subscription_ended`. No fuso `America/Manaus`, em `2026-11-03T03:30:00Z` (02/11, 23:30 local) devolve `null` (AC 4, AC 5, RNF-04) ✅
Proof: `npx jest src/domain/entities/barbershop-subscription.spec.ts -t "US-21.*\(C4\)"`

**C5** - `active` sem pedido de cancelamento com `paidUntil = 2026-01-01` (meses no passado) devolve `null`; `trialing` com `trialEndsAt` 10 dias no futuro devolve `null` (AC 6) ✅
Proof: `npx jest src/domain/entities/barbershop-subscription.spec.ts -t "US-21.*\(C5\)"`

**C6** - `SUBSCRIPTION_GRACE_DAYS` ausente vira `5`; `0` é aceito; `-1`, `1.5` e `abc` reprovam a validação do ambiente (AC 7) ✅
Proof: `npx jest src/infrastructure/config/env.schema.spec.ts -t "US-21.*\(C6\)"`

**C7** - `.env.example` declara `SUBSCRIPTION_GRACE_DAYS=5` (AC 7, Impact: configuração) ✅
Proof: `grep -qx 'SUBSCRIPTION_GRACE_DAYS=5' .env.example`

### S2 - O bot suspenso · 8 arquivos · ~110 KB · ~28k

**C8** - Com a barbearia do **teste vencido**, conectada, e um cliente já avisado com a conversa não pausada, uma mensagem de texto faz o conector enviar exatamente o texto do bot suspenso a esse telefone, o interpretador não recebe nenhuma chamada e o resultado tem `kind: 'suspended'` (CA-21.1, AC 8) ✅
Proof: `npx jest src/usecases/answer-client-question/answer-client-question.use-case.spec.ts -t "US-21.*\(C8\)"`

**C9** - Com a barbearia suspensa e um rascunho de agendamento com uma oferta na conversa, a mensagem `1` não cria agendamento, não muda o rascunho gravado, não cancela nem confirma presença de agendamento nenhum e recebe o texto do bot suspenso (AC 9) ✅
Proof: `npx jest src/usecases/answer-client-question/answer-client-question.use-case.spec.ts -t "US-21.*\(C9\)"`

**C10** - Com a barbearia suspensa e a conversa pausada para atendimento humano (dentro de `WHATSAPP_HANDOFF_RESUME_HOURS`), uma mensagem não gera envio nenhum e o resultado é `outcome: 'none'` (AC 10) ✅
Proof: `npx jest src/usecases/answer-client-question/answer-client-question.use-case.spec.ts -t "US-21.*\(C10\)"`

**C11** - Com a barbearia suspensa (`whatsapp_connections` conectada), a primeira mensagem de um telefone novo pelo webhook `POST /webhooks/whatsapp/evolution` responde `204`, cria a linha em `clients`, e o conector envia, nesta ordem, o aviso de privacidade da US-14 e o texto do bot suspenso; o interpretador falso não recebe chamada (CA-21.1, AC 8, AC 11) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/subscription-suspension.e2e-spec.ts -t "US-21.*\(C11\)"`

**C12** - Depois da mensagem do C11, `GET /metrics` mostra `whatsapp_replies_total{kind="suspended"}` com valor 1 maior que antes da mensagem (AC 13) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/subscription-suspension.e2e-spec.ts -t "US-21.*\(C12\)"`

**C13** - O job de lembretes, com duas barbearias conectadas e cada uma com um agendamento confirmado a 24 h, envia o lembrete só da barbearia não suspensa; o agendamento da suspensa continua sem reivindicação de 24 h nem de 1 h (AC 12) ✅
Proof: `npx jest src/usecases/send-appointment-reminders/send-appointment-reminders.use-case.spec.ts -t "US-21.*\(C13\)"`

**C14** - Com a barbearia suspensa, `run()` do `AppointmentRemindersJob` deixa `reminder_24h_sent_at` e `reminder_1h_sent_at` nulos no agendamento dela e não envia texto pelo conector (AC 12, através do repositório real) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/subscription-suspension.e2e-spec.ts -t "US-21.*\(C14\)"`

### S3 - O painel em modo leitura · ~12 arquivos · ~150 KB · ~38k

**C15** - Com a barbearia do **teste vencido**, o Dono faz `POST /settings/services` com um serviço válido e recebe `402` com `{ message }` igual ao texto do `402`; a contagem de `services` da barbearia não muda. Com a mesma barbearia de volta a `trialEndsAt` no futuro, o mesmo `POST /settings/services` responde `201` (CA-21.2, AC 14, AC 6) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/subscription-suspension.e2e-spec.ts -t "US-21.*\(C15\)"`

**C16** - Com a barbearia suspensa, por tabela de método e perfil: `PUT /settings/rules` do Dono, `PATCH /appointments/:id/status` do Dono, `DELETE /users/:id` do Dono e `POST /blocks` do Barbeiro respondem `402` com o texto do `402`, e o registro alvo de cada uma não muda (AC 14) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/subscription-suspension.e2e-spec.ts -t "US-21.*\(C16\)"`

**C17** - Com a barbearia suspensa, `GET /settings/services`, `GET /appointments` (agenda), `GET /clients` e `GET /subscription` do Dono respondem `200` (AC 15) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/subscription-suspension.e2e-spec.ts -t "US-21.*\(C17\)"`

**C18** - Com a barbearia suspensa, toda rota `@Public()` de escrita do catálogo (`listRoutes`) recebe a chamada sem `402`: por tabela sobre o catálogo, cada uma responde com status diferente de `402`; e `POST /auth/login` do Dono dessa barbearia responde `200` com token (AC 16) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/subscription-suspension.e2e-spec.ts -t "US-21.*\(C18\)"`

**C19** - Com a barbearia do **teste vencido**, `POST /subscription/checkout` com `method: 'credit_card'` responde `201 { paymentUrl }`, e `POST /subscription/cancel` responde `409` com `Não há assinatura ativa para cancelar.`, nunca `402` (AC 14, door 2: exceção `@AllowWhileSuspended()`) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/subscription-suspension.e2e-spec.ts -t "US-21.*\(C19\)"`

**C20** - `GET /me` devolve `barbershop.suspensionReason: 'trial_ended'` ao Dono e ao Barbeiro da barbearia do teste vencido, e `null` ao Dono de uma barbearia em dia; sem token responde `401` (AC 17) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/subscription-suspension.e2e-spec.ts -t "US-21.*\(C20\)"`

**C21** - `GET /subscription` devolve `suspensionReason: 'payment_overdue'` à barbearia **atrasada** (falha há 6 dias) e `null` quando `paymentFailedAt` é de 4 dias antes; o Barbeiro recebe `403` com `Acesso negado.`; sem token, `401` (AC 18, AC 2, AC 3) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/subscription-suspension.e2e-spec.ts -t "US-21.*\(C21\)"`

**C22** - Com a barbearia **encerrada** (`paidUntil = 2026-10-01`, hoje 02/10 local), `GET /subscription` devolve `suspensionReason: 'subscription_ended'` e `POST /settings/services` responde `402`; com `paidUntil = 2026-10-02`, `suspensionReason: null` e `POST /settings/services` responde `201` (AC 4, AC 5, AC 14) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/subscription-suspension.e2e-spec.ts -t "US-21.*\(C22\)"`

**C23** - No documento OpenAPI, por tabela sobre o catálogo de rotas: toda operação autenticada `post`, `put`, `patch` ou `delete`, exceto `post /subscription/checkout` e `post /subscription/cancel`, tem a resposta `402` com o exemplo `{ message: <texto do 402> }`; nenhuma operação `get`, nenhuma pública e nenhuma das duas exceções tem `402` (AC 19) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/api-docs.e2e-spec.ts -t "US-21.*\(C23\)"`

**C24** - O guard, com um contador falso de métricas, por tabela dos três motivos: uma escrita barrada de uma barbearia com o motivo `trial_ended`, `payment_overdue` e `subscription_ended` incrementa o contador uma vez com esse motivo; uma escrita liberada e uma leitura não incrementam nada (AC 20) ✅
Proof: `npx jest src/infrastructure/http/subscription-access.guard.spec.ts -t "US-21.*\(C24\)"`

**C25** - Depois de um `402` da barbearia do teste vencido, `GET /metrics` mostra `subscription_blocked_writes_total{reason="trial_ended"}` com valor 1 maior que antes (AC 20) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/subscription-suspension.e2e-spec.ts -t "US-21.*\(C25\)"`

**C26** - Um controller de teste com `@Post()` sem decorator nenhum, montado no `AppModule` só para a prova, responde `402` à barbearia suspensa e `201` à em dia: uma rota de escrita nova nasce barrada (door 2) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/subscription-suspension.e2e-spec.ts -t "US-21.*\(C26\)"`

**C27** - O schema da resposta de `GET /me` e o de `GET /subscription` aceitam em `suspensionReason` exatamente `trial_ended`, `payment_overdue`, `subscription_ended` e `null`, e recusam `suspended` e a ausência do campo (door 3) ✅
Proof: `npx jest src/interface-adapters/presenters/subscription-suspension.presenter.spec.ts -t "US-21.*\(C27\)"`

### S4 - A regularização reativa na hora · 6 arquivos · ~70 KB · ~18k

**C28** - Com a barbearia **atrasada**, `POST /settings/services` responde `402`; depois de `POST /webhooks/payments/asaas` com `PAYMENT_RECEIVED` de `sub_1` (vencimento `2026-10-02`), o mesmo `POST /settings/services` responde `201` e `GET /me` traz `suspensionReason: null`, sem avançar o relógio (CA-21.4, AC 21) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/subscription-suspension.e2e-spec.ts -t "US-21.*\(C28\)"`

**C29** - Com a barbearia do **teste vencido** e uma assinatura Pix `sub_1` gravada, depois do webhook `PAYMENT_CONFIRMED` de `sub_1` uma mensagem de texto pelo WhatsApp chega ao interpretador falso e a resposta enviada não é o texto do bot suspenso (CA-21.4, AC 21) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/subscription-suspension.e2e-spec.ts -t "US-21.*\(C29\)"`

**C30** - Com a assinatura **encerrada**, o use case de checkout aceita `credit_card` (chama `createCardCheckout` uma vez) e, noutra execução, `pix` com CPF válido (chama `createPixSubscription` uma vez); em nenhum dos dois chama `cancelSubscription` para a `sub_1` já cancelada (AC 22) ✅
Proof: `npx jest src/usecases/start-subscription-checkout/start-subscription-checkout.use-case.spec.ts -t "US-21.*\(C30\)"`

**C31** - Com a barbearia **encerrada**, `POST /subscription/checkout` com `method: 'credit_card'` responde `201 { paymentUrl }` (AC 22) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/subscription-suspension.e2e-spec.ts -t "US-21.*\(C31\)"`

**C32** - `confirmPayment('2026-10-02')` sobre uma assinatura cancelada com `paidUntil = 2026-10-01` deixa `status: 'active'`, `cancelRequestedAt: null`, `cancelsAt: null`, `paidUntil: '2026-11-02'`, `nextChargeDate: '2026-11-02'` e motivo de suspensão `null` (AC 23) ✅
Proof: `npx jest src/domain/entities/barbershop-subscription.spec.ts -t "US-21.*\(C32\)"`

**C33** - Ponta a ponta: barbearia **encerrada** → `POST /subscription/checkout` de cartão (checkout `chk_2`) → webhook `PAYMENT_CONFIRMED` da assinatura `sub_2`, que o gateway falso liga ao `chk_2` → `GET /subscription` devolve `status: 'active'`, `cancelsAt: null`, `nextChargeDate: '2026-11-02'` e `suspensionReason: null` (CA-21.4, AC 23) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/subscription-suspension.e2e-spec.ts -t "US-21.*\(C33\)"`

**C34** - `active` com pedido de cancelamento e `paidUntil` igual à data local de hoje: `canStartCheckout()` é `false` e o use case de checkout lança `SubscriptionAlreadyExistsError` com `Esta barbearia já tem uma assinatura.` sem chamar o gateway (AC 24) ✅
Proof: `npx jest src/usecases/start-subscription-checkout/start-subscription-checkout.use-case.spec.ts -t "US-21.*\(C34\)"`

**C35** - `confirmPayment('2026-09-01')` sobre uma assinatura cancelada com `paidUntil = 2026-10-01` mantém `cancelRequestedAt`, `paidUntil: '2026-10-01'` e, no relógio de 02/10, o motivo `subscription_ended` (AC 25) ✅
Proof: `npx jest src/domain/entities/barbershop-subscription.spec.ts -t "US-21.*\(C35\)"`

**C36** - A história não acrescenta migration nem altera as existentes (door 1: nenhuma coluna, status ou `CHECK` novo) ✅
Proof: `test -z "$(git diff --name-only main...HEAD -- src/infrastructure/database/migrations)"`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| motivo de suspensão (4) | `trial_ended` C1 · `payment_overdue` C2 · `subscription_ended` C4 · `null` C1, C2, C4, C5 | - |
| limites exatos da regra (6) | `trialEndsAt` = agora C1 · `trialEndsAt` = agora + 1 ms C1 · falha + tolerância = agora C2 · falha + tolerância − 1 ms C2 · fim do dia `cancelsAt` local C4 · início do dia seguinte local C4 | - |
| valor da tolerância (3) | 5 (padrão) C2 · 2 C3 · 0 C3 | - |
| fuso da data local (2) | `America/Sao_Paulo` C4 · `America/Manaus` C4 | - |
| `SUBSCRIPTION_GRACE_DAYS` na validação (5) | ausente C6 · `0` C6 · `-1` C6 · `1.5` C6 · `abc` C6 | - |
| startup config: `SUBSCRIPTION_GRACE_DAYS` (2 lugares) | `env.schema.ts` C6 · `.env.example` C7 | - |
| startup config: guard de escrita (1 assembly) | `AppModule`, montado igual pela aplicação e por todas as suítes e2e C15, C26 | - |
| entrada do bot suspenso (4) | conversa ativa C8, C11 · rascunho com oferta C9 · conversa pausada C10 · telefone novo C11 | - |
| ações do bot barradas (4) | agendar C9 · cancelar C9 · remarcar C9 · confirmar presença C9 | - |
| lembretes (2) | 24 h C13, C14 · 1 h C13, C14 | - |
| método HTTP de escrita (4) | `POST` C15 · `PUT` C16 · `PATCH` C16 · `DELETE` C16 | - |
| perfil na escrita barrada (2) | Dono C15, C16 · Barbeiro C16 | - |
| motivo na escrita barrada (3) | `trial_ended` C15 · `payment_overdue` C28 · `subscription_ended` C22 | - |
| rotas que passam durante a suspensão (4) | leitura C17 · `@Public()` C18 · `POST /subscription/checkout` C19 · `POST /subscription/cancel` C19 | - |
| `GET /me` statuses (2) | 200 C20 · 401 C20 | - |
| `GET /subscription` statuses (3) | 200 C21 · 401 C21 · 403 C21 | - |
| `POST /subscription/checkout` statuses (6) | 201 C19, C31 · 400 US-20 C9 (inalterado) · 401 US-20 C17 (inalterado) · 403 US-20 C17 (inalterado) · 409 C34 · 502 US-20 C10 (inalterado) | - |
| escrita autenticada fora de `/subscription/*`: status novo (1) | 402 C15, C16, C26 | - |
| documentação do 402 (3 grupos) | escrita autenticada com 402 C23 · leitura e pública sem 402 C23 · as duas exceções sem 402 C23 | - |
| `suspensionReason` no contrato (5) | `trial_ended` C27 · `payment_overdue` C27 · `subscription_ended` C27 · `null` C27 · valor fora da lista recusado C27 | - |
| séries de métrica (2) | `whatsapp_replies_total{kind="suspended"}` C12 · `subscription_blocked_writes_total{reason}` C24 (3 motivos), C25 | - |
| saída da suspensão (3) | `trial_ended` → pagamento C29 · `payment_overdue` → pagamento C28 · `subscription_ended` → nova assinatura C30, C31, C32, C33 | - |
| pedido de cancelamento na confirmação (3) | vencimento depois do `paidUntil` limpa C32 · vencimento antes mantém C35 · ainda no período pago bloqueia o checkout C34 | - |
| one-way doors (3) | door 1 C1-C5, C36 · door 2 C26, C19, C23 · door 3 C15, C27 | - |

- Checks que afirmam status, rota ou formato de resposta: C11, C12, C15-C23, C25, C26, C28, C29, C31, C33. Cada um tem uma prova e2e que atravessa a borda HTTP.
- A regra de suspensão é provada na própria camada (C1-C5, C32, C35) e também na borda (C15, C21, C22, C28). As provas e2e não substituem a tabela unitária.
- O 400, o 401 e o 403 do checkout continuam com as provas da US-20, sem mudança. O AC 24 só exige que o 409 continue igual para a assinatura ainda no período pago (C34).

## Test policy

O repositório diz onde ficam os testes e como dublar dependências (use cases com fakes em memória, gateways e HTTP em e2e), mas não diz quanto de uma tabela de decisão precisa ser afirmado em cada camada. As linhas abaixo seguem as da US-20.

| Code | Required proofs | Coverage expectation |
| --- | --- | --- |
| Decide e é alcançado por uma borda (regra de suspensão, guard) | uma na própria camada **e** uma na borda | um caso afirmado por motivo e por limite na camada; o contrato (402, `suspensionReason`) na borda |
| Decide e não é alcançado por uma borda própria (desvio no bot, desvio no job de lembretes) | uma na própria camada | um caso por entrada da tabela (ativa, pausada, rascunho, telefone novo; 24 h, 1 h) |
| Entrada que não decide (presenters, controller) | uma na borda | o campo novo e cada status |
| Instrumentação (contador Prometheus, ligação no módulo) | nenhuma própria | coberta pela prova do consumidor (C12, C25) |

Evidence:

- `BarbershopSubscription` (regra nova): 3 motivos, 6 pontos de decisão (status × 3, comparação de instante × 2, comparação de data local × 1) → decide
- `SubscriptionAccessGuard`: público, método, exceção, motivo → 4 pontos de decisão → decide
- `AnswerClientQuestionUseCase`: 1 desvio novo depois da pausa → decide; `SendAppointmentRemindersUseCase`: 1 desvio novo antes da reivindicação → decide
- analogia no repositório: `isTrialEndingSoon` e `failPayment` da mesma entidade, provados em unitário por limite, e o `SessionGuard`, provado na borda por `users-permissions.e2e-spec.ts`

Custo: 15 provas na própria camada em 6 arquivos. Sem essas linhas, os limites da regra seriam provados só pelos e2e, que atravessam um motivo por cenário.

## Swept

- validation: C6
- failure modes: C15 e C16 (a escrita barrada não grava nada, porque o guard age antes do controller); C13 (a barbearia suspensa é pulada e o job segue para a próxima)
- idempotency: n/a - a suspensão é uma leitura pura, sem efeito a repetir; a reentrega do webhook que reativa é a door 2 da US-20, inalterada
- authorization: C16 e C20 (o Barbeiro também fica em modo leitura e vê o motivo); C21 (o `GET /subscription` continua só do Dono); C18 (rotas públicas intactas, inclusive o webhook que reativa)
- concurrency: n/a - não há estado gravado que duas requisições disputem (door 1); uma escrita que passou pelo guard um instante antes do início da suspensão termina, e o plano não promete o contrário
- data lifecycle: C36 (nada a migrar); n/a para retenção e exclusão, fora desta história
- dependency failure: C8 e C11 (o Gemini não é chamado durante a suspensão, então a queda dele não afeta a resposta fixa); o Asaas fora do ar no checkout continua `502` (US-20 C10)
- state transitions: C1-C5 (entrada em cada motivo), C28, C29, C33 (saída), C32, C34, C35 (pedido de cancelamento)
- observability: C12, C24, C25

## Handoff

- Arquivos existentes que a história toca (entidade da assinatura, repositório TypeORM e o em memória, fixtures de assinatura, bot, lembretes, checkout, `GetSubscription`, `GetMyAccount`, os dois presenters, `api-document.ts`, `route-catalog.ts`, `account.module.ts`, `whatsapp.module.ts`, `subscriptions.module.ts`, `env.schema.ts`, métricas do WhatsApp, `api-docs.e2e-spec.ts`, `subscription-test-app.ts`, `subscription.controller.ts`, `.env.example`): `wc -c` = 175.527 bytes ≈ 44k tokens. As 18+ suítes com `trial_ends_at = now()` (221.118 bytes) só têm a linha do `INSERT` trocada, sem leitura integral: ≈ 6k. Arquivos novos (guard e spec, decorator, métrica, presenter spec, entidade spec, suíte `subscription-suspension.e2e-spec.ts`) ≈ 70 KB ≈ 18k. Total ≈ 68k, abaixo do orçamento de 150k → one builder
- Mechanism: one builder (cabe no orçamento, sem pergunta)
- **Boundary:** C1-C36 fechados no commit `feat(US-21): suspend barbershops without an active subscription`
- **Abandoned:** nada. Fora do escopo, num commit à parte (`test(US-10): ...`): o AGM-07 da US-10 falhava também na `main`, porque ordenava clientes por `created_at` misturando o `now()` real do banco com o `FixedClock` da suíte; a fixture passou a usar o relógio da suíte. Numa das três rodadas completas o `scheduling.e2e-spec.ts` falhou uma vez e não se repetiu (passou isolado duas vezes e na rodada completa seguinte)
- **Settled mid-build:** (1) Os caminhos citados em C15, C16, C17, C22, C28 e no teste C23 foram corrigidos para as rotas reais (`/settings/services`, `/settings/rules`, `/appointments/:id/status`, `/blocks`, `GET /appointments`); método, perfil e valor de cada claim não mudaram. (2) `confirmPayment` limpa o cancelamento só com vencimento estritamente posterior ao `paidUntil` (o `Impact` do plano foi corrigido no mesmo commit): com `>=`, pagar a cobrança já gerada para o dia `paidUntil` desfaria o cancelamento de uma assinatura apagada no gateway. (3) O teste da US-13 que fixa o conjunto exato de status de `POST /whatsapp/connection` passa a incluir o `402`, como o `Impact` do plano prevê para toda rota de escrita. (4) O repositório de assinatura e as métricas de pagamento saíram do `SubscriptionsModule` para o novo `SubscriptionAccessModule`, que o `AccountModule` (guard e `/me`), o `WhatsAppModule` e o `SubscriptionsModule` importam, evitando import circular
