# US-19: Lembretes de 24h e 1h checks

Profile: standard
Plan: `.specs/features/us-19-lembretes-de-24h-e-1h/plan.md`

36 checks em 5 fatias · 4 one-way doors · 0 open, 0 block

Um check concluído termina com ✅. Convenção das provas: todo teste cita o `CA` (ou o AC/door do plano) e o id do check entre parênteses, dentro de um `describe('US-19 ...')`; o seletor `-t "US-19.*\(Cn\)"` evita colidir com os ids das histórias anteriores nos mesmos arquivos.

- e2e: `npx jest --config ./test/jest-e2e.json <arquivo> -t "<padrão>"` (Postgres do compose rodando; `WHATSAPP_CONNECTOR` e `MESSAGE_INTERPRETER` trocados por fakes, relógio por `SettableClock`)
- unitário: `npx jest <arquivo> -t "<padrão>"`

Cenário das provas, salvo quando o check diz outra coisa:

- relógio em `2026-09-29T15:00:00Z` = terça-feira, 29/09, 12:00 em `America/Sao_Paulo`; prazo de cancelamento padrão de 120 min
- "Barbearia do Zé", fuso `America/Sao_Paulo`, conexão do WhatsApp `connected`
- Corte (30 min), Barba (20 min); barbeiro João
- cliente "Carlos Souza", telefone `+5511987654321`
- **X** = Corte com João, quarta-feira 30/09 às 11:00 local (`2026-09-30T14:00:00Z`), `confirmed`, criado em `2026-09-27T12:00:00Z`: o lembrete de 24h dele vence em `2026-09-29T14:00:00Z`, antes do relógio
- **Z** = Corte com João, terça-feira 29/09 às 13:00 local (`2026-09-29T16:00:00Z`), `confirmed`, criado em `2026-09-27T12:00:00Z`: o lembrete de 1h dele vence exatamente no relógio

Textos esperados (linhas por `\n`):

- lembrete 24h de X: `Lembrete do seu horário na Barbearia do Zé:\nServiço: Corte\nBarbeiro: João\nData: quarta-feira, 30/09\nHorário: 11:00\n\nResponda *confirmar* para confirmar presença, *remarcar* para trocar o horário ou *cancelar* para desmarcar.` (com mais de um serviço, a linha é `Serviços: Corte, Barba`, como no cancelamento da US-18)
- lembrete 1h de Z: `Seu horário na Barbearia do Zé é hoje às 13:00, com João. Até já!`
- presença confirmada de X: `Presença confirmada!\nCorte, quarta-feira, 30/09, às 11:00, com João` (uma linha por agendamento, no formato da lista de candidatos da US-18)
- nada a confirmar: `Você não tem nenhum agendamento aguardando confirmação.`

## Checks

### S1 - Lembrete de 24h enviado · ~10 arquivos · ~90 KB · ~23k

**C1** - Por tabela, `isReminderDue` com `T = 2026-09-30T14:00:00Z`: `24h` é devido com agora em `T-24h` e em `T-1h-1min`, e não é com agora em `T-24h-1min` nem em `T-1h`; com agora em `T-23h`, criado em `T-24h` é devido e criado em `T-24h+1min` não é. `1h` é devido com agora em `T-1h` e em `T-1min`, e não é com agora em `T-1h-1min` nem em `T`; com agora em `T-30min`, criado em `T-1h` é devido e criado em `T-1h+1min` não é (AC 1, AC 4, AC 7, Assumptions: janela)
Proof: `npx jest src/domain/value-objects/appointment-reminder.spec.ts -t "US-19.*\(C1\)"`

**C2** - Com X, uma execução do `SendAppointmentRemindersUseCase` faz exatamente 1 `sendText` para `+5511987654321` na barbearia com o texto do lembrete 24h de X e grava `reminder24hSentAt = 2026-09-29T15:00:00Z` em X; uma segunda execução no mesmo relógio não faz nenhum `sendText` (AC 1, AC 2, CA-19.1, RF-16)
Proof: `npx jest src/usecases/send-appointment-reminders/send-appointment-reminders.use-case.spec.ts -t "US-19.*\(C2\)"`

**C3** - Por tabela: X com Corte e Barba manda a linha `Serviços: Corte, Barba`; X numa barbearia de fuso `America/Manaus` manda `Horário: 10:00` e `Data: quarta-feira, 30/09` (AC 2, RNF-04)
Proof: `npx jest src/usecases/send-appointment-reminders/send-appointment-reminders.use-case.spec.ts -t "US-19.*\(C3\)"`

**C4** - Com X e Y (Barba com João, quarta-feira 30/09 às 11:30, mesmo cliente, devido) e o conector falhando só no primeiro `sendText`, a execução devolve `failed: 1` e `sent: 1`, grava `reminder24hSentAt` nos dois, registra a métrica `24h`/`failed` e `24h`/`sent`; com o conector bom, a execução seguinte não faz nenhum `sendText` (AC 3, Assumptions: sem reenvio)
Proof: `npx jest src/usecases/send-appointment-reminders/send-appointment-reminders.use-case.spec.ts -t "US-19.*\(C4\)"`

**C5** - O `AppointmentRemindersJob.run` loga um resumo com `sent`, `failed` e `failedBarbershops`; para cada barbearia que falhou, loga um erro com o `barbershopId` e só `name` e `code` do erro, sem o telefone nem o texto do lembrete em nenhum argumento do log; uma execução sem falhas não loga erro (AC 3, Observable, AD-009)
Proof: `npx jest src/infrastructure/jobs/appointment-reminders.job.spec.ts -t "US-19.*\(C5\)"`

### S2 - Lembrete de 1h enviado · ~3 arquivos · ~30 KB · ~8k

**C6** - Com Z, uma execução faz exatamente 1 `sendText` com o texto do lembrete 1h de Z e grava `reminder1hSentAt = 2026-09-29T15:00:00Z`; uma segunda execução não faz nenhum `sendText` (AC 4, CA-19.3, RF-17)
Proof: `npx jest src/usecases/send-appointment-reminders/send-appointment-reminders.use-case.spec.ts -t "US-19.*\(C6\)"`

**C7** - Por tabela, Z com `clientConfirmedAt` preenchido e Z sem `reminder24hSentAt` recebem cada um exatamente 1 lembrete de 1h (AC 5)
Proof: `npx jest src/usecases/send-appointment-reminders/send-appointment-reminders.use-case.spec.ts -t "US-19.*\(C7\)"`

**C8** - Com o conector falhando no `sendText`, a execução sobre Z devolve `failed: 1`, mantém `reminder1hSentAt` gravado e registra `1h`/`failed`; a seguinte, com o conector bom, não faz nenhum `sendText` (AC 6)
Proof: `npx jest src/usecases/send-appointment-reminders/send-appointment-reminders.use-case.spec.ts -t "US-19.*\(C8\)"`

### S3 - Lembretes que não saem · ~6 arquivos · ~70 KB · ~18k

**C9** - Um agendamento de Corte com João em `2026-09-29T18:00:00Z`, criado em `2026-09-29T15:00:00Z` (3h antes): com o relógio em `2026-09-29T15:00:00Z` (T-3h, dentro da janela de 24h) nenhum `sendText`; com o relógio em `2026-09-29T17:01:00Z` (T-59min) exatamente 1 `sendText`, o do lembrete de 1h (AC 7, CA-19.4, RN-18)
Proof: `npx jest src/usecases/send-appointment-reminders/send-appointment-reminders.use-case.spec.ts -t "US-19.*\(C9\)"`

**C10** - Por tabela de status (`cancelled`, `attended`, `no_show`), X e Z com esse status não recebem nenhum `sendText` e ficam com `reminder24hSentAt` e `reminder1hSentAt` nulos (AC 8, CA-19.6)
Proof: `npx jest src/usecases/send-appointment-reminders/send-appointment-reminders.use-case.spec.ts -t "US-19.*\(C10\)"`

**C11** - Com X listado como devido e cancelado no repositório antes da reivindicação, a execução não faz nenhum `sendText` e X fica com `reminder24hSentAt` nulo (AC 9, CA-19.6, door 1)
Proof: `npx jest src/usecases/send-appointment-reminders/send-appointment-reminders.use-case.spec.ts -t "US-19.*\(C11\)"`

**C12** - X sem cliente (`client_id` nulo) não recebe `sendText` e fica com `reminder24hSentAt` nulo (AC 10)
Proof: `npx jest src/usecases/send-appointment-reminders/send-appointment-reminders.use-case.spec.ts -t "US-19.*\(C12\)"`

**C13** - Por tabela de conexão (sem conexão, `disconnected`, `connecting`), a execução sobre X não faz `sendText` e deixa `reminder24hSentAt` nulo; com a conexão passada a `connected`, a execução seguinte faz exatamente 1 `sendText` (AC 11)
Proof: `npx jest src/usecases/send-appointment-reminders/send-appointment-reminders.use-case.spec.ts -t "US-19.*\(C13\)"`

**C14** - No e2e, com X no banco, duas execuções simultâneas do use case (`Promise.all`) sobre o mesmo Postgres fazem exatamente 1 `sendText`, e a linha de X tem `reminder_24h_sent_at` preenchido (AC 12, door 1)
Proof: `npx jest --config ./test/jest-e2e.json test/appointment-reminders.e2e-spec.ts -t "US-19.*\(C14\)"`

**C15** - Com duas barbearias, cada uma com um agendamento devido do próprio cliente, cada `sendText` vai com o `barbershopId` e o telefone do cliente daquela barbearia; com a leitura da primeira barbearia falhando, a execução devolve essa barbearia em `failures` e ainda envia o lembrete da segunda (AD-009, RN-26)
Proof: `npx jest src/usecases/send-appointment-reminders/send-appointment-reminders.use-case.spec.ts -t "US-19.*\(C15\)"`

### S4 - Cliente confirma presença · ~10 arquivos · ~150 KB · ~38k

**C16** - O adaptador do Gemini repassa `{ confirmRequested: true }`; rejeita com `MessageInterpreterUnavailableError` um JSON sem `confirmRequested`; o `responseJsonSchema` tem `confirmRequested` em `required`; o `systemInstruction` contém a linha `- confirmRequested: true quando o cliente confirma que vai comparecer ao agendamento (por exemplo, "confirmo", "confirmar", "estarei lá").` (door 2)
Proof: `npx jest src/infrastructure/external/gemini/gemini-message-interpreter.spec.ts -t "US-19.*\(C16\)"`

**C17** - No `AnswerClientQuestionUseCase`, com X tendo `reminder24hSentAt` preenchido, `{ confirmRequested: true }` faz exatamente 1 `sendText` com o texto de presença confirmada de X e grava `clientConfirmedAt = 2026-09-29T15:00:00Z`; uma segunda mensagem igual, com o relógio 10 min depois, manda o mesmo texto e deixa `clientConfirmedAt` em `2026-09-29T15:00:00Z` (AC 13, CA-19.2)
Proof: `npx jest src/usecases/answer-client-question/answer-client-question.use-case.spec.ts -t "US-19.*\(C17\)"`

**C18** - Com X e W (Barba com João, quinta-feira 01/10 às 10:00) lembrados, mais um futuro sem lembrete, um passado lembrado `attended`, um futuro lembrado `cancelled`, um lembrado de outro cliente e um lembrado do Carlos na barbearia B, `{ confirmRequested: true }` responde exatamente `Presença confirmada!\nCorte, quarta-feira, 30/09, às 11:00, com João\nBarba, quinta-feira, 01/10, às 10:00, com João` e grava `clientConfirmedAt` só em X e W (AC 13, AC 18, RN-26, Assumptions: confirma todos)
Proof: `npx jest src/usecases/answer-client-question/answer-client-question.use-case.spec.ts -t "US-19.*\(C18\)"`

**C19** - Com X sem lembrete enviado, `{ confirmRequested: true }` responde exatamente `Você não tem nenhum agendamento aguardando confirmação.` e X fica com `clientConfirmedAt` nulo (AC 14)
Proof: `npx jest src/usecases/answer-client-question/answer-client-question.use-case.spec.ts -t "US-19.*\(C19\)"`

**C20** - Por tabela, com só X lembrado: `{ confirmRequested: true, cancelRequested: true }` responde o texto de cancelado da US-18 e deixa X `cancelled`; `{ confirmRequested: true, rescheduleRequested: true }` responde a oferta de remarcação da US-18; nos dois, X fica com `clientConfirmedAt` nulo (AC 15, CA-19.2)
Proof: `npx jest src/usecases/answer-client-question/answer-client-question.use-case.spec.ts -t "US-19.*\(C20\)"`

**C21** - Por tabela, com só X lembrado: `{ humanRequested: true, confirmRequested: true }` transfere com `requested`; `{ offTopic: true, confirmRequested: true }` responde a recusa da US-15; `{ bookingRequested: true, confirmRequested: true }` responde a pergunta de serviço da US-17; nos três, X fica com `clientConfirmedAt` nulo (AC 16)
Proof: `npx jest src/usecases/answer-client-question/answer-client-question.use-case.spec.ts -t "US-19.*\(C21\)"`

**C22** - Com a conversa pausada para atendimento humano e X lembrado, `{ confirmRequested: true }` não faz nenhum `sendText` e X fica com `clientConfirmedAt` nulo (AC 17)
Proof: `npx jest src/usecases/answer-client-question/answer-client-question.use-case.spec.ts -t "US-19.*\(C22\)"`

**C23** - As métricas de uma confirmação: a primeira de X conta 1 em `presenceConfirmed` e `reply('presence_confirmed')`; a segunda conta 0 confirmações novas e `reply('presence_confirmed')`; a de nada a confirmar conta `reply('nothing_to_confirm')` (AC 19)
Proof: `npx jest src/usecases/answer-client-question/answer-client-question.use-case.spec.ts -t "US-19.*\(C23\)"`

**C24** - No e2e, com X no banco e o relógio em `2026-09-29T15:00:00Z`: `AppointmentRemindersJob.run()` envia o texto do lembrete 24h de X; o webhook de `{ confirmRequested: true }` responde `204` e envia o texto de presença confirmada; a linha de X tem `client_confirmed_at` preenchido; `GET /appointments?view=day&date=2026-09-30` como Dono traz X com `clientConfirmedAt` igual a esse instante e `unconfirmed: false` (CA-19.1, CA-19.2, Surface)
Proof: `npx jest --config ./test/jest-e2e.json test/appointment-reminders.e2e-spec.ts -t "US-19.*\(C24\)"`

**C25** - No e2e, depois do lembrete de 24h de X, o webhook de `{ cancelRequested: true }` envia o texto de cancelado da US-18 e a linha de X fica `cancelled`; com o relógio em `2026-09-30T13:01:00Z` (T-59min), `AppointmentRemindersJob.run()` não envia nada (CA-19.2, CA-19.6)
Proof: `npx jest --config ./test/jest-e2e.json test/appointment-reminders.e2e-spec.ts -t "US-19.*\(C25\)"`

**C26** - No e2e, `/metrics` depois do C24 tem `whatsapp_presence_confirmations_total 1` e `whatsapp_replies_total{kind="presence_confirmed"} 1`, e as linhas de `whatsapp_presence_confirmations_total` não trazem label (AC 19)
Proof: `npx jest --config ./test/jest-e2e.json test/appointment-reminders.e2e-spec.ts -t "US-19.*\(C26\)"`

### S5 - Alerta "não confirmado", métricas, documentação e doors · ~16 arquivos · ~200 KB · ~50k

**C27** - No e2e, `/metrics` depois de uma execução com um lembrete de 24h enviado e um de 1h que falhou tem `whatsapp_reminders_total{kind="24h",outcome="sent"} 1` e `whatsapp_reminders_total{kind="1h",outcome="failed"} 1`, e as linhas dessa métrica não trazem label além de `kind` e `outcome` (AC 20)
Proof: `npx jest --config ./test/jest-e2e.json test/appointment-reminders.e2e-spec.ts -t "US-19.*\(C27\)"`

**C28** - Por tabela, `isUnconfirmed` com `T = 2026-09-30T14:00:00Z`, lembrete de 24h enviado e sem confirmação do cliente: prazo 120 e agora em `T-120min` → `true`; prazo 120 e agora em `T-121min` → `false`; prazo 30 e agora em `T-30min` → `true`; prazo 30 e agora em `T-31min` → `false`; agora em `T-60min` com `clientConfirmedAt` preenchido → `false`; sem lembrete de 24h → `false`; status `cancelled`, `attended` e `no_show` → `false` (AC 21, AC 22, CA-19.5)
Proof: `npx jest src/domain/value-objects/appointment-reminder.spec.ts -t "US-19.*\(C28\)"`

**C29** - O `ListScheduleUseCase` com o relógio em `2026-09-30T12:30:00Z` (T-90min de X), X lembrado sem confirmação e um prazo de cancelamento gravado de 60 min devolve X com `unconfirmed: false`; com prazo de 120 min, `unconfirmed: true` (AC 21, regras da barbearia lidas)
Proof: `npx jest src/usecases/list-schedule/list-schedule.use-case.spec.ts -t "US-19.*\(C29\)"`

**C30** - No e2e `GET /appointments?view=day&date=2026-09-30` como Dono, com X lembrado e sem confirmação: relógio em `2026-09-30T12:01:00Z` (T-1h59) → X com `unconfirmed: true` e `clientConfirmedAt: null`; relógio em `2026-09-30T11:59:00Z` (T-2h01) → `unconfirmed: false` (AC 21, AC 22, AC 23, CA-19.5)
Proof: `npx jest --config ./test/jest-e2e.json test/appointment-reminders.e2e-spec.ts -t "US-19.*\(C30\)"`

**C31** - No e2e, com X confirmado pelo cliente em `2026-09-29T15:00:00Z`: `GET /clients/:id` traz X em `upcomingAppointments` com `clientConfirmedAt: '2026-09-29T15:00:00.000Z'`; `POST /blocks` sobre o horário de X sem confirmação responde `409` com X em `appointments` com o mesmo `clientConfirmedAt`; `PATCH /appointments/:id/status` de outro agendamento já iniciado sem confirmação responde `200` com `appointment.clientConfirmedAt: null` (AC 23, Surface)
Proof: `npx jest --config ./test/jest-e2e.json test/appointment-reminders.e2e-spec.ts -t "US-19.*\(C31\)"`

**C32** - No documento OpenAPI, o item de `appointments` de `GET /appointments` tem `unconfirmed` com `type: 'boolean'` e `description`, e `clientConfirmedAt` com `format: 'date-time'`, aceitando `null`, e `description`; o item de `upcomingAppointments` de `GET /clients/{id}` tem `clientConfirmedAt` e não tem `unconfirmed` (AC 24, door 4)
Proof: `npx jest --config ./test/jest-e2e.json test/api-docs.e2e-spec.ts -t "US-19.*\(C32\)"`

**C33** - No banco, `appointments` tem `reminder_24h_sent_at`, `reminder_1h_sent_at` e `client_confirmed_at` do tipo `timestamp with time zone`, aceitando nulo e sem `DEFAULT`; um `INSERT` sem essas colunas grava as três nulas (door 1)
Proof: `npx jest --config ./test/jest-e2e.json test/database/appointments-schema.e2e-spec.ts -t "US-19.*\(C33\)"`

**C34** - No repositório TypeORM: `claimReminder` de X devolve `true` e depois `false` para `24h`, e independente para `1h`; devolve `false` para X `cancelled` e para o id de X com outra barbearia; `confirmByClient` grava `client_confirmed_at` só em X lembrado `confirmed` sem confirmação anterior, e não muda um já confirmado, um sem lembrete nem um `cancelled`. Na `TypeOrmScheduleQuery`, `listPendingReminders` devolve, para `24h` e por tabela, só os agendamentos `confirmed`, com cliente, sem o lembrete daquele tipo, da barbearia e começando depois de `after` e até `until`, com `createdAt`; e as entradas de `listForClient` trazem `reminder24hSentAt` e `clientConfirmedAt` (door 1, RN-26)
Proof: `npx jest --config ./test/jest-e2e.json test/database/typeorm-appointment.repository.e2e-spec.ts -t "US-19.*\(C34\)"`
Proof: `npx jest --config ./test/jest-e2e.json test/database/typeorm-schedule.query.e2e-spec.ts -t "US-19.*\(C34\)"`

**C35** - No app montado, o `SchedulerRegistry` tem o cron `appointment-reminders` com `cronTime.source` igual a `* * * * *` e fuso `America/Sao_Paulo` (door 3)
Proof: `npx jest --config ./test/jest-e2e.json test/appointment-reminders.e2e-spec.ts -t "US-19.*\(C35\)"`

**C36** - Os unitários e e2e das histórias anteriores passam, e as rotas alteradas mantêm as respostas de erro de hoje (`GET /appointments` 401 e 403; `GET /clients/:id` 401 e 404; `PATCH /appointments/:id/status` 401, 403, 404 e 409; `POST /blocks` 409). As únicas asserções existentes alteradas são as que enumeram um formato que esta história amplia (o `confirmRequested: false` nas fixtures de interpretação e nos `toEqual` do input do intérprete; `clientConfirmedAt` e `reminder24hSentAt` nas fixtures de `ScheduleEntry`; `clientConfirmedAt` e `unconfirmed` nos `toEqual` das respostas de agenda), nenhuma enfraquecida (Impact)
Proof: `npm test`
Proof: `npm run test:e2e`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| fronteiras da janela do lembrete (8) | 24h início C1 · 24h fim C1 · 24h antes da janela C1 · 24h no fim exato C1 · 1h início C1 · 1h fim C1 · 1h antes da janela C1 · 1h no início do agendamento C1 | - |
| criado depois do momento (4) | 24h criado no momento C1 · 24h um minuto depois C1, C9 · 1h no momento C1 · 1h um minuto depois C1 | - |
| tipo de lembrete enviado (2) | `24h` C2, C24 · `1h` C6, C9 | - |
| formato do texto do lembrete (3) | um serviço C2 · mais de um serviço C3 · outro fuso C3 | - |
| falha no envio por tipo (2) | `24h` C4 · `1h` C8 | - |
| status que não recebe lembrete (3) | `cancelled` C10, C25 · `attended` C10 · `no_show` C10 | - |
| corrida com o cancelamento (1) | cancelado entre listar e reivindicar C11, C34 | - |
| sem cliente (1) | `client_id` nulo C12 | - |
| estado da conexão (4) | sem conexão C13 · `disconnected` C13 · `connecting` C13 · `connected` C2, C13 | - |
| concorrência entre instâncias (1) | duas execuções simultâneas C14 | - |
| barbearias da rotina (2) | isolamento por barbearia C15 · uma barbearia falha e a outra segue C15, C5 | - |
| lembrete de 1h sem depender do de 24h (2) | já confirmado C7 · sem lembrete de 24h C7 | - |
| desfecho de "confirmar" (4) | um lembrado C17 · vários lembrados C18 · nenhum C19 · repetido C17 | - |
| filtro da confirmação (6) | sem lembrete C18 · passado C18 · `cancelled` C18 · outro cliente C18 · outra barbearia C18 · ordem cronológica C18 | - |
| confirmar com outra intenção (5) | cancelar C20 · remarcar C20 · atendente C21 · fora de contexto C21 · agendar C21 | - |
| conversa pausada (1) | silêncio C22 | - |
| métricas novas (5) | `whatsapp_reminders_total{kind,outcome}` C27, C4, C8 · `whatsapp_presence_confirmations_total` C26, C23 · `whatsapp_replies_total{kind="presence_confirmed"}` C26, C23 · `kind="nothing_to_confirm"` C23 · sem label de cliente ou barbearia C26, C27 | - |
| condições do `unconfirmed` (7) | no prazo C28, C30 · antes do prazo C28, C30 · outro prazo C28, C29 · já confirmado C28, C24 · sem lembrete C28 · `cancelled` C28 · `attended` e `no_show` C28 | - |
| doors do plano (4) | 1 colunas e reivindicação C33, C34, C11, C14 · 2 `confirmRequested` C16 · 3 cron C35, C5 · 4 formato da resposta C32, C24, C30, C31 | - |
| `GET /appointments` statuses (3) | 200 C24, C30 (com os campos novos) · 401 C36 · 403 C36 | - |
| `GET /clients/:id` statuses (3) | 200 C31 · 401 C36 · 404 C36 | - |
| `PATCH /appointments/:id/status` statuses (6) | 200 C31 · 400 C36 · 401 C36 · 403 C36 · 404 C36 · 409 C36 | - |
| `POST /blocks` statuses (6) | 201 C36 (formato do `scheduleAppointmentSchema` já afirmado em `affectedAppointments`) · 400 C36 · 401 C36 · 403 C36 · 404 C36 · 409 C31 | - |
| startup config: `SendAppointmentRemindersUseCase` e `AppointmentRemindersJob` (2 montagens) | `AppModule` dos e2e C14, C24, C35 · setup próprio dos unitários C2 | - |
| startup config: `ConfirmPresence` no `AnswerClientQuestionUseCase` (2 montagens) | `WhatsAppModule` do app C24 · setup dos unitários de `answer-client-question` C17 | - |
| startup config: regras e relógio no `ListScheduleUseCase` (2 montagens) | `ScheduleModule` do app C30 · setup do unitário C29 | - |

- Claims naming a status code, route or response shape: C24, C25, C30, C31, C32 - each has a proof that crosses the boundary
- No other check claims more than the single case its proof exercises

## Test policy

O repositório diz como os testes são montados (use cases com fakes, gateways e HTTP em e2e), não quanto de cada tabela de decisão precisa ser afirmado. Para esta história:

| Code | Required proofs | Coverage expectation |
| --- | --- | --- |
| Decide, alcançado por uma fronteira (`SendAppointmentRemindersUseCase` pelo job, confirmação no `AnswerClientQuestionUseCase` pelo webhook, `ListScheduleUseCase` pela rota) | um no use case **e** um e2e pela fronteira | um caso afirmado por linha das tabelas de decisão no use case; o contrato (texto, linha no banco, campo da resposta) no e2e |
| Decide, sem fronteira própria (`isReminderDue`, `isUnconfirmed`) | um na própria camada | um caso por fronteira e por condição |
| Gateways (schema do Gemini, repositório e query TypeORM, migration) | um e2e/unitário na própria camada | cada campo novo, cada condição do `WHERE` |
| Repasse (job, módulo, presenters, controller) | nenhum próprio, salvo o log do job (C5) | coberto pelo e2e de quem consome |

Evidence:

- `isReminderDue`: 2 tipos × (início da janela, fim da janela, criado depois do momento) = 6 pontos de decisão -> decide
- `isUnconfirmed`: status, lembrete enviado, confirmação, prazo = 4 pontos -> decide
- `SendAppointmentRemindersUseCase`: conexão, devido, reivindicado, envio ok/falha, falha por barbearia = 5 pontos -> decide
- closest analogue: `ResetExpiredNoShowsUseCase` (rotina por barbearia, AD-009) e o fluxo de cancelamento da US-18 no `AnswerClientQuestionUseCase`, provados no mesmo formato

Cost: ~24 provas na própria camada em 6 arquivos de teste. Sem estas linhas, as tabelas das janelas e do alerta só seriam percorridas por um caminho do e2e.

## Swept

- validation: C16 (`confirmRequested` obrigatório na resposta do Gemini); a rota não ganha entrada nova
- failure modes: C4, C8, C15 (envio que falha e barbearia que falha)
- idempotency: C2, C6, C17 (segunda execução não reenvia; confirmar duas vezes não muda o instante)
- authorization: existing - AD-007 nas rotas alteradas (C36); o job não tem chamador externo; o webhook segue o segredo da AD-011
- concurrency: C14 (duas instâncias), C11 (cancelamento entre listar e reivindicar)
- data lifecycle: C33 (colunas nulas, nada migrado); efeito do deploy sobre agendamentos existentes no Impact do plano, sem backfill
- dependency failure: C13 (WhatsApp não conectado não reivindica), C4/C8 (falha do conector)
- state transitions: C10, C25 (só `confirmed` recebe lembrete), C28 (alerta some fora de `confirmed`)
- observability: C5 (log sem telefone nem texto), C26, C27 (métricas sem label de alta cardinalidade)

## Handoff

- Arquivos existentes que a história toca (use case e spec do `AnswerClientQuestionUseCase`, adaptador e schema do Gemini, os quatro ports, repositório e query TypeORM, entidade ORM, fakes de teste, métricas, `ListScheduleUseCase`, presenter da agenda, módulos `whatsapp` e `schedule`, jobs, e2e de schema/repositório/query/api-docs, `booking-reply.ts`): `wc -c` = 207.985 bytes ≈ 52k tokens; arquivos novos (domínio dos lembretes, use case e spec do envio, job e spec, migration, e2e `appointment-reminders`) ≈ 80 KB ≈ 20k. S1-S5 ≈ 72k, abaixo do orçamento de 150k - one builder
- Mechanism: one builder (cabe no orçamento, sem pergunta)
