# US-18: Remarcação e cancelamento pelo WhatsApp checks

Profile: standard
Plan: `.specs/features/us-18-remarcacao-e-cancelamento-pelo-whatsapp/plan.md`

37 checks em 6 fatias · 5 one-way doors · 0 open, 0 block

Um check concluído termina com ✅. Convenção das provas: todo teste cita o `CA` (ou o AC/door do plano) e o id do check entre parênteses, dentro de um `describe('US-18 ...')`; o seletor `-t "US-18.*\(Cn\)"` evita colidir com os ids da US-15 a US-17 nos mesmos arquivos.

- e2e: `npx jest --config ./test/jest-e2e.json <arquivo> -t "<padrão>"` (Postgres do compose rodando; `WHATSAPP_CONNECTOR` e `MESSAGE_INTERPRETER` trocados por fakes, relógio por `FixedClock`)
- unitário: `npx jest <arquivo> -t "<padrão>"`

Cenário das provas unitárias: o da US-17 (`setupWhatsAppBooking`), salvo quando o check diz outra coisa:

- relógio em `2026-09-29T15:00:00Z` = terça-feira, 29/09, 12:00 em `America/Sao_Paulo`; antecedência mínima de 60 min; prazo de cancelamento padrão de 120 min
- "Barbearia do Zé", endereço "Rua das Flores, 123", aberta de segunda a sábado das 09:00 às 19:00
- Corte (30 min, R$ 45,00), Barba (20 min, R$ 30,00); João (Corte, Barba) e Pedro (Corte)
- cliente "Carlos Souza", sem faltas; limite de faltas 2
- agendamentos do Carlos usados pelos checks (todos `confirmed`, salvo indicação): **A** = Corte com João, terça 29/09 às 15:00; **B** = Barba com João, quarta 30/09 às 10:00; **R** = Corte com João, terça 29/09 às 17:00 (alvo da remarcação)

Textos esperados (blocos separados por `\n\n`, linhas por `\n`):

- lista: `Você tem mais de um agendamento. Qual deles?` + uma linha por candidato `<n>. <serviços unidos por " + ">, <dia da semana>, <dd/mm>, às <HH:MM>, com <barbeiro>` + `Responda com o número do agendamento.`
- cancelado: `Agendamento cancelado.` + `Serviço: <...>` (ou `Serviços: <a>, <b>`) + `Barbeiro: <nome>` + `Data: <dia da semana>, <dd/mm>` + `Horário: <HH:MM>`
- remarcado: o resumo da US-17 com o cabeçalho `Agendamento remarcado!`
- prazo: `Só cancelamos ou remarcamos pelo WhatsApp com pelo menos <duração> de antecedência.`
- transferência: `Vou chamar alguém da equipe para te ajudar.`
- sem tópico (US-15): `Posso te ajudar com serviços, preços, endereço e horário de funcionamento da Barbearia do Zé. O que você gostaria de saber?`

## Checks

### S1 - Agendamento localizado e desambiguado · ~8 arquivos · ~110 KB · ~28k

**C1** - O adaptador do Gemini repassa `{ cancelRequested: true, rescheduleRequested: false, choice: 10 }`; rejeita com `MessageInterpreterUnavailableError`, por tabela, `choice: 11` e JSON sem `cancelRequested` e sem `rescheduleRequested`; o `responseJsonSchema` tem `cancelRequested` e `rescheduleRequested` em `required`; o `systemInstruction` contém cada linha de `appointmentOptions` (door 1 ampliada, door 5) ✅
Proof: `npx jest src/infrastructure/external/gemini/gemini-message-interpreter.spec.ts -t "US-18.*\(C1\)"`

**C2** - Com B semeado antes de A, mais um agendamento passado `attended` do Carlos, um futuro `cancelled` do Carlos, um futuro de outro cliente e um futuro do Carlos na barbearia B, `{ cancelRequested: true }` responde exatamente `Você tem mais de um agendamento. Qual deles?\n1. Corte, terça-feira, 29/09, às 15:00, com João\n2. Barba, quarta-feira, 30/09, às 10:00, com João\nResponda com o número do agendamento.` e o rascunho fica com `action: 'cancel'`, `candidates` = [A, B] nessa ordem (id, barbeiro, início) e `targetAppointmentId: null` (AC 1, AC 4, AC 7, CA-18.2, RN-26) ✅
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "US-18.*\(C2\)"`

**C3** - Por tabela (`cancelRequested` e `rescheduleRequested`), com o Carlos tendo só um agendamento passado `attended` e um futuro `cancelled`, a resposta é exatamente `Você não tem nenhum agendamento futuro.` e o rascunho fica nulo (AC 2) ✅
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "US-18.*\(C3\)"`

**C4** - Com 11 agendamentos futuros confirmados do Carlos, a lista traz exatamente 10 linhas, a última numerada `10.`, e o 11º (o mais distante) fica fora de `candidates` (door 5) ✅
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "US-18.*\(C4\)"`

**C5** - Depois da lista do C2, `{ choice: 2 }` deixa B com status `cancelled`, A com `confirmed`, e responde exatamente `Agendamento cancelado.\nServiço: Barba\nBarbeiro: João\nData: quarta-feira, 30/09\nHorário: 10:00` (AC 5) ✅
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "US-18.*\(C5\)"`

**C6** - Depois da lista do C2, `{ choice: 3 }` responde exatamente `Não encontrei essa opção.\n\n` + a mesma lista do C2, nenhum agendamento muda de status e o rascunho continua com os 2 candidatos (AC 6) ✅
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "US-18.*\(C6\)"`

**C7** - No `AnswerClientQuestionUseCase`, sem rascunho o intérprete recebe `appointmentOptions: []`; depois da lista do C2, a mensagem seguinte manda `appointmentOptions` = `['Corte, terça-feira, 29/09, às 15:00, com João', 'Barba, quarta-feira, 30/09, às 10:00, com João']` e `offeredOptions: []` (AC 4, door 1) ✅
Proof: `npx jest src/usecases/answer-client-question/answer-client-question.use-case.spec.ts -t "US-18.*\(C7\)"`

### S2 - Cancelamento dentro do prazo · ~6 arquivos · ~60 KB · ~15k

**C8** - Com só A, `{ cancelRequested: true }` deixa A com status `cancelled` e responde exatamente `Agendamento cancelado.\nServiço: Corte\nBarbeiro: João\nData: terça-feira, 29/09\nHorário: 15:00`, sem a pergunta da lista, e o rascunho fica nulo; com A tendo Corte e Barba, a segunda linha é `Serviços: Corte, Barba` (AC 3, AC 8, CA-18.1) ✅
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "US-18.*\(C8\)"`

**C9** - Antes do cancelamento do C8, os horários livres de Corte com João na terça 29/09 (origem `bot`) não trazem 15:00; depois, trazem 15:00 (CA-18.5, door 4) ✅
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "US-18.*\(C9\)"`

**C10** - Por tabela de prazo e início do único agendamento: prazo 120 e início às 14:00 (exatamente 120 min) → cancela; prazo 120 e início às 13:55 → não cancela e devolve transferência `late_cancellation`; prazo 30 e início às 12:30 → cancela (AC 8, AC 16, AC 17, RN-09) ✅
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "US-18.*\(C10\)"`

**C11** - No e2e, um webhook de cancelamento aumenta `appointments_cancelled_total{origin="bot"}` e `whatsapp_replies_total{kind="cancelled"}` em 1 cada; as linhas de `/metrics` dessas métricas não trazem label além de `origin` e `kind` (AC 9) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-reschedule-cancel.e2e-spec.ts -t "US-18.*\(C11\)"`

**C12** - Com o fake do conector falhando no `sendText` da confirmação de cancelamento, o use case devolve `{ outcome: 'failed' }` com o `appointmentId` de A e A fica `cancelled` no repositório; no e2e o webhook responde `204` e a linha de A tem `status = 'cancelled'` (AC 10) ✅
Proof: `npx jest src/usecases/answer-client-question/answer-client-question.use-case.spec.ts -t "US-18.*\(C12\)"`
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-reschedule-cancel.e2e-spec.ts -t "US-18.*\(C12\)"`

### S3 - Remarcação dentro do prazo · ~4 arquivos · ~60 KB · ~15k

**C13** - Com só R, `{ rescheduleRequested: true, date: '2026-09-30', period: 'morning' }` responde exatamente `Horários para Corte (R$ 45,00, 30 min):\n1. quarta-feira, 30/09, às 09:00, com João\n2. quarta-feira, 30/09, às 09:30, com João\n3. quarta-feira, 30/09, às 10:00, com João\nResponda com o número do horário que você quer.`, e o rascunho fica com `action: 'reschedule'`, `targetAppointmentId` = id de R, `serviceIds: ['corte']`, `barberId` = João e 3 opções em `offer`; R continua `confirmed` (AC 3, AC 11, CA-18.3) ✅
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "US-18.*\(C13\)"`

**C14** - Por tabela, com só R e pedido de remarcação para amanhã de manhã: `anyBarber: true` com João ocupado das 09:00 às 10:00 oferece `09:00 com Pedro`, `09:30 com Pedro`, `10:00 com João`; `barber: 'Pedro'` oferece 09:00, 09:30 e 10:00 com Pedro (AC 11) ✅
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "US-18.*\(C14\)"`

**C15** - Depois da oferta do C13, `{ choice: 1 }` cria exatamente 1 agendamento novo do Carlos com `status: 'confirmed'`, `origin: 'bot'`, João, `serviceIds: ['corte']`, `startsAt 2026-09-30T12:00:00Z` e `endsAt 2026-09-30T12:30:00Z`; R fica `cancelled`; a resposta é exatamente `Agendamento remarcado!\nServiço: Corte\nBarbeiro: João\nData: quarta-feira, 30/09\nHorário: 09:00\nValor: R$ 45,00\nEndereço: Rua das Flores, 123` e o rascunho fica nulo (AC 12, AC 13, CA-18.3, CA-18.5) ✅
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "US-18.*\(C15\)"`

**C16** - Na remarcação do C15, as métricas contadas são exatamente `booked` = `['bot']` e `cancelled` = `['bot']` (AC 14) ✅
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "US-18.*\(C16\)"`

**C17** - Com o fake do conector falhando no `sendText` da confirmação de remarcação, o use case devolve `{ outcome: 'failed' }` com o `appointmentId` do agendamento novo, que fica `confirmed`, e R fica `cancelled` (AC 15) ✅
Proof: `npx jest src/usecases/answer-client-question/answer-client-question.use-case.spec.ts -t "US-18.*\(C17\)"`

**C18** - Depois da oferta do C13, `{ bookingRequested: true, date: '2026-10-01' }` responde a oferta de quinta-feira, 01/10, às 09:00, 09:30 e 10:00 com João, mantendo `action: 'reschedule'` e o alvo R; `{ choice: 2 }` em seguida cria o agendamento das 09:30 de 01/10 e cancela R (AC 11) ✅
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "US-18.*\(C18\)"`

### S4 - Fora do prazo · ~4 arquivos · ~50 KB · ~12k

**C19** - Por tabela no `AnswerClientQuestionUseCase` (`cancelRequested` e `rescheduleRequested`), com só um agendamento de Corte com João às 13:00 de hoje (1h): exatamente 1 `sendText` com `Só cancelamos ou remarcamos pelo WhatsApp com pelo menos 2h de antecedência.\n\nVou chamar alguém da equipe para te ajudar.`, conversa com `pauseReason: 'late_cancellation'`, rascunho nulo, agendamento ainda `confirmed` e nenhum agendamento novo (AC 16, CA-18.4, RN-09, RN-22) ✅
Proof: `npx jest src/usecases/answer-client-question/answer-client-question.use-case.spec.ts -t "US-18.*\(C19\)"`

**C20** - Por tabela, com o único agendamento às 12:20 de hoje: prazo 120 → `... pelo menos 2h de antecedência.`; prazo 30 → `... pelo menos 30 min de antecedência.`; prazo 90 → `... pelo menos 1h30 de antecedência.` (AC 17) ✅
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "US-18.*\(C20\)"`

**C21** - Com A e um agendamento de Corte com João às 13:00 de hoje (L), `{ cancelRequested: true }` lista L e A; `{ choice: 1 }` devolve a transferência `late_cancellation` com o texto do prazo e L continua `confirmed` (AC 16) ✅
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "US-18.*\(C21\)"`

**C22** - No e2e, com um agendamento daqui 1h, o webhook de cancelamento responde `204`, envia o texto do C19, `GET /whatsapp/conversations/waiting-human` como Dono traz a conversa com `reason: 'late_cancellation'` e `/metrics` mostra `whatsapp_handoffs_total{reason="late_cancellation"} 1` (AC 18) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-reschedule-cancel.e2e-spec.ts -t "US-18.*\(C22\)"`

### S5 - Opção de remarcação disputada ou vencida · ~2 arquivos · ~40 KB · ~10k

**C23** - Depois da oferta do C13, com outro agendamento do João criado amanhã das 09:00 às 09:30, `{ choice: 1 }` não cria agendamento do Carlos, R continua `confirmed` e a resposta é exatamente `Esse horário acabou de ser ocupado.\n\n` + oferta de 09:30, 10:00 e 10:30 de 30/09 com João; com um repositório cujo `create` rejeita com `AppointmentConflictError`, a resposta começa com a mesma frase e R continua `confirmed` (AC 19, RN-07) ✅
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "US-18.*\(C23\)"`

**C24** - Com só R, `{ rescheduleRequested: true }` oferece terça-feira, 29/09, às 13:00, 13:30 e 14:00 com João; com o relógio em `2026-09-29T15:01:00Z`, `{ choice: 1 }` não cria agendamento, R continua `confirmed` e a resposta é exatamente `Só agendamos pelo WhatsApp com pelo menos 1h de antecedência.\n\n` + `Horários para Corte (R$ 45,00, 30 min):\n1. terça-feira, 29/09, às 13:30, com João\nResponda com o número do horário que você quer.` (AC 20) ✅
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "US-18.*\(C24\)"`

### S6 - Consistência, painel, documentação e doors · ~16 arquivos · ~190 KB · ~48k

**C25** - Com o Carlos com 2 faltas (limite 2) e só A: `{ cancelRequested: true }` cancela A e responde o texto de cancelado; com A restaurado, `{ rescheduleRequested: true }` envia exatamente 1 `sendText` com o texto de transferência, pausa com `pauseReason: 'blocked_client'`, A continua `confirmed` e nenhuma oferta é gravada (AC 21, RN-12) ✅
Proof: `npx jest src/usecases/answer-client-question/answer-client-question.use-case.spec.ts -t "US-18.*\(C25\)"`

**C26** - Por tabela no `AnswerClientQuestionUseCase`, com só A: `{ humanRequested: true, cancelRequested: true }` transfere com `requested` e A continua `confirmed`; `{ offTopic: true, cancelRequested: true }` responde a recusa da US-15 e A continua `confirmed` (AC 22) ✅
Proof: `npx jest src/usecases/answer-client-question/answer-client-question.use-case.spec.ts -t "US-18.*\(C26\)"`

**C27** - Por tabela no `AnswerClientQuestionUseCase`: `{ choice: 1 }` com a lista do C2 gravada há 61 min, e com a oferta de remarcação do C13 gravada há 61 min, recebe o texto sem tópico, deixa `consecutiveFailures = 1` e nenhum agendamento muda; com a lista gravada há 59 min, cancela A (AC 23, AD-013) ✅
Proof: `npx jest src/usecases/answer-client-question/answer-client-question.use-case.spec.ts -t "US-18.*\(C27\)"`

**C28** - Com uma oferta de agendamento novo da US-17 em vigor e só A, `{ cancelRequested: true }` cancela A e deixa o rascunho nulo; com a lista do C2 em vigor, `{ bookingRequested: true, services: ['Corte'], barber: 'João', date: '2026-09-30', period: 'afternoon' }` responde a oferta de agendamento da US-17 (12:00, 12:30, 13:00) com `action: 'book'` e `candidates: []` no rascunho (Assumptions: um pedido novo sobrescreve o rascunho) ✅
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "US-18.*\(C28\)"`

**C29** - `MarkAttendanceUseCase` sobre um agendamento `cancelled` já iniciado rejeita com `AppointmentCancelledError` de mensagem `Esse agendamento foi cancelado.` e o status continua `cancelled`; no e2e, `PATCH /appointments/:id/status` com `attended` nesse agendamento responde `409` com `message: 'Esse agendamento foi cancelado.'` e a linha continua `cancelled` (AC 24) ✅
Proof: `npx jest src/usecases/mark-attendance/mark-attendance.use-case.spec.ts -t "US-18.*\(C29\)"`
Proof: `npx jest --config ./test/jest-e2e.json test/attendance.e2e-spec.ts -t "US-18.*\(C29\)"`

**C30** - `Appointment.cancel(now)`: `confirmed` vira `cancelled` mantendo barbeiro, início, fim e serviços; por tabela, `attended`, `no_show` e `cancelled` lançam erro (door 1) ✅
Proof: `npx jest src/domain/entities/appointment.spec.ts -t "US-18.*\(C30\)"`

**C31** - No documento OpenAPI: `PATCH /appointments/{id}/status` tem resposta `409` com exemplo `Esse agendamento foi cancelado.`; o `status` do item de `GET /appointments` e o de `upcomingAppointments` em `GET /clients/{id}` têm `enum` igual a `['confirmed', 'attended', 'no_show', 'cancelled']`; o `reason` de `GET /whatsapp/conversations/waiting-human` tem `enum` igual a `['requested', 'not_understood', 'blocked_client', 'late_cancellation']` (AC 25, Surface) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/api-docs.e2e-spec.ts -t "US-18.*\(C31\)"`

**C32** - No banco, `appointments.status = 'cancelled'` é aceito e `'bogus'` continua recusado; um agendamento `confirmed` sobreposto a um `cancelled` do mesmo barbeiro é aceito, e dois `confirmed` sobrepostos continuam recusados; `whatsapp_conversations.pause_reason = 'late_cancellation'` é aceito com `paused_at` preenchido (door 1, door 3) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/database/appointments-schema.e2e-spec.ts -t "US-18.*\(C32\)"`
Proof: `npx jest --config ./test/jest-e2e.json test/database/whatsapp-conversations-schema.e2e-spec.ts -t "US-18.*\(C32\)"`

**C33** - No repositório TypeORM de agendamentos, `saveStatus` de um agendamento cancelado grava `cancelled` e `listBusyPeriods` deixa de devolvê-lo; no de conversas, um rascunho com `action: 'cancel'`, 2 `candidates` e `targetAppointmentId: null` volta igual na leitura, e um rascunho da US-17 gravado por SQL sem `action`, `candidates` nem `targetAppointmentId` é lido com `action: 'book'`, `candidates: []` e `targetAppointmentId: null` (door 1, door 2) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/database/typeorm-appointment.repository.e2e-spec.ts -t "US-18.*\(C33\)"`
Proof: `npx jest --config ./test/jest-e2e.json test/database/typeorm-conversation.repository.e2e-spec.ts -t "US-18.*\(C33\)"`

**C34** - No e2e, o cancelamento completo: com 2 agendamentos futuros confirmados do cliente, o webhook de `{ cancelRequested: true }` envia a lista; o de `{ choice: 2 }` envia o texto de cancelado; a linha do segundo tem `status = 'cancelled'` e a do primeiro `confirmed`; `GET /appointments` do dia do segundo como Dono traz a entrada com `status: 'cancelled'`, e `GET /clients/:id` traz o mesmo `status` em `upcomingAppointments` (CA-18.1, CA-18.2, Surface) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-reschedule-cancel.e2e-spec.ts -t "US-18.*\(C34\)"`

**C35** - No e2e, a remarcação completa: com um agendamento de Corte com João amanhã às 17:00, o webhook de `{ rescheduleRequested: true, date: amanhã, period: 'morning' }` envia a oferta de 09:00, 09:30 e 10:00 com João; o de `{ choice: 1 }` envia o texto de remarcado; há uma linha nova com `origin = 'bot'`, `status = 'confirmed'` e início às 09:00 de amanhã, e a antiga tem `status = 'cancelled'` (CA-18.3, CA-18.5) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-reschedule-cancel.e2e-spec.ts -t "US-18.*\(C35\)"`

**C36** - Os e2e e unitários da US-11 a US-17 passam; as únicas asserções existentes alteradas são as que enumeram um conjunto que esta história amplia (`choice 4` → `choice 11` no C37 da US-17, door 5; o `enum` de `reason` no C36 da US-17 ganha `late_cancellation`; os `toEqual` do input do intérprete ganham `appointmentOptions: []`; o exemplo de status fora da lista em `appointments-schema.e2e-spec.ts` passa de `'cancelled'`, agora válido pela door 1, a `'bogus'`; a lista de respostas do ATD-22 em `attendance.e2e-spec.ts` ganha `'409'`), nenhuma enfraquecida (Flow, Impact) ✅
Proof: `npm test`
Proof: `npm run test:e2e`

**C37** - As rotas do painel que esta história altera mantêm as respostas de erro de hoje: `GET /appointments` sem sessão responde `401` e com Barbeiro pedindo outro barbeiro `403`; `GET /clients/:id` sem sessão `401` e com id desconhecido `404`; o documento OpenAPI marca as duas com `401` e `403` (Surface, sem mudança) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/schedule.e2e-spec.ts -t "answers 401 without a session|CA-08.2"`
Proof: `npx jest --config ./test/jest-e2e.json test/clients.e2e-spec.ts -t "CA-12.3 \(C25\)|CA-12.2 \(C17\)"`
Proof: `npx jest --config ./test/jest-e2e.json test/api-docs.e2e-spec.ts -t "marks protected routes with bearer auth, roles, 401 and 403"`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| agendamentos futuros encontrados (4) | zero C3 · um C8, C13 · mais de um C2 · mais de 10 C4 | - |
| filtro dos candidatos (5) | passado C2 · `cancelled` C2, C3 · outro cliente C2 · outra barbearia C2 · ordem cronológica C2 | - |
| desfecho do `choice` sobre candidatos (4) | dentro da lista C5 · fora da lista C6 · lista vencida C27 · candidato fora do prazo C21 | - |
| ação pedida (2) | cancelar C8 · remarcar C13 | - |
| fronteira do prazo (3) | exatamente no prazo C10 · 5 min antes do prazo C10 · outro valor de prazo C10 | - |
| formato do prazo (3) | `2h` C20 · `30 min` C20 · `1h30` C20 | - |
| barbeiro da remarcação (3) | o do alvo C13 · `anyBarber` C14 · outro nomeado C14 | - |
| desfecho da escolha de remarcação (5) | remarca C15 · ocupada (app e constraint) C23 · antecedência vencida C24 · oferta vencida C27 · mensagem seguinte acumula critérios C18 | - |
| fora do prazo por ação (2) | cancelar C19 · remarcar C19 | - |
| cliente bloqueado por ação (2) | cancelar C25 · remarcar C25 | - |
| precedência na mesma mensagem (2) | atendente C26 · fora de contexto C26 | - |
| pedido novo sobre rascunho em aberto (2) | cancelar sobre oferta de agendamento C28 · agendar sobre lista de candidatos C28 | - |
| falha no envio da confirmação (2) | cancelado C12 · remarcado C17 | - |
| métricas novas (4) | `appointments_cancelled_total{origin="bot"}` C11, C16 · `whatsapp_replies_total{kind="cancelled"}` C11 · `kind="rescheduled"` C35 (contado no envio, mesmo caminho do C11) · `whatsapp_handoffs_total{reason="late_cancellation"}` C22 | - |
| transições de `cancel` (4) | `confirmed` C30 · `attended` C30 · `no_show` C30 · `cancelled` C30 | - |
| doors do plano (5) | 1 status `cancelled` C30, C32, C33, C9 · 2 rascunho C2, C13, C33 · 3 `late_cancellation` C32, C22, C31 · 4 horário liberado C9, C15 · 5 `choice` 1..10 C1, C4 | - |
| `GET /appointments` statuses (3) | 200 C34 (com `cancelled`) · 401 C37 · 403 C37 | - |
| `GET /clients/:id` statuses (4) | 200 C34 · 401 C37 · 403 C37 · 404 C37 | - |
| `PATCH /appointments/:id/status` statuses (1 novo) | 409 C29 | - |
| `GET /whatsapp/conversations/waiting-human` statuses (3) | 200 C22 (com `late_cancellation`) · 401 existing C17 da US-16 · 403 existing C17 da US-16 | - |
| startup config: ScheduleQuery, AppointmentRepository e métricas no `BookViaWhatsAppUseCase` (2 montagens) | `WhatsAppModule` do app C34, C35 · `setupWhatsAppBooking` dos unitários C2, C15 | - |

- Claims naming a status code, route or response shape: C12, C22, C29, C31, C34, C35 - each has a proof that crosses the boundary
- No other check claims more than the single case its proof exercises

## Test policy

O repositório diz como os testes são montados (use cases com fakes, gateways e HTTP em e2e), não quanto de cada tabela de decisão precisa ser afirmado. Para esta história:

| Code | Required proofs | Coverage expectation |
| --- | --- | --- |
| Decide, alcançado pelo webhook (`BookViaWhatsAppUseCase`, `AnswerClientQuestionUseCase`) | um no use case **e** um e2e pelo webhook | um caso afirmado por linha das tabelas de decisão no use case; o contrato (status, texto, linha no banco) no e2e |
| Decide, sem fronteira própria (`Appointment.cancel`, `markAttendance`) | um na própria camada | um caso por transição |
| Gateways (schema do Gemini, repositórios TypeORM, migrations) | um e2e/unitário na própria camada | cada campo novo e cada valor novo de enum |
| Repasse (módulo, presenters, controller) | nenhum próprio | coberto pelo e2e de quem consome |

Evidence:

- `book-via-whatsapp.use-case.ts`: passa a despachar sobre 3 ações × (com/sem `choice`) e sobre 0/1/vários candidatos, prazo e bloqueio -> decide, ~14 pontos de decisão novos
- `answer-client-question.use-case.ts`: precedência e motivo da transferência ganham 2 ramos -> decide
- `appointment.ts`: `cancel` com 4 estados de origem -> decide
- análogo no repositório: a própria US-17 provou o `BookViaWhatsAppUseCase` por tabela no unitário e o caminho no e2e (`whatsapp-booking.e2e-spec.ts`)

Cost: 27 provas na própria camada em 6 arquivos. Sem estas linhas, as tabelas de candidatos, prazo e desfecho da escolha seriam provadas só pelo caminho que o e2e percorre.

## Swept

- validation: C1 (campos novos e `choice` 1..10 vindos do modelo), C33 (rascunho antigo sem os campos novos), C6 (escolha fora da lista)
- failure modes: C12, C17 (confirmação não enviada, gravação mantida), C29 (atendimento sobre cancelado)
- idempotency: existing - a reivindicação por `key.id` da US-15 roda antes; C30 (cancelar duas vezes lança em vez de gravar de novo, e o use case só cancela `confirmed`)
- authorization: existing - webhook com segredo (AD-011), rotas do painel com AD-007; C2 (candidatos só do cliente e da barbearia, RN-26)
- concurrency: C23 (opção de remarcação tomada, incluindo a constraint de exclusão); a escolha sobre a mesma oferta usa a trava de consumo único da US-17 (C21 da US-17, mesmo `consumeDraft`)
- data lifecycle: C27 (rascunho vence em 60 min), C28 (pedido novo descarta o rascunho), C8, C15 (rascunho limpo ao concluir), C19 (limpo na transferência)
- dependency failure: C12, C17 (conector); o intérprete fora segue o C33 da US-17 sem mudança
- state transitions: C30 (`confirmed` → `cancelled`), C15 (novo antes do cancelamento do antigo), C19, C25 (ativa → pausada por `late_cancellation` e `blocked_client`)
- observability: C11, C16, C22 (métricas); logs de erro de envio e de transferência: existing - o controller do webhook já loga `outcome: 'failed'` e `handoff` sem telefone nem texto (C35 da US-17, C26 da US-16)

## Handoff

- S1 = 28k, S2 entra a 43k, S3 a 58k, S4 a 70k, S5 a 80k, S6 a 128k (arquivos tocados e vizinhos lidos, ~510 KB / 4), abaixo do budget de 150k - one builder

Decisões tomadas na derivação (não renegociam o plano):

- AC 6 × AC 23: "fora dos candidatos em vigor" responde a opção inválida com a lista (C6); "sem candidatos pendentes" não tem lista para repetir e segue o AC 23 (texto sem tópico e falha contada, C27)
- AC 23 "de outro tipo": o `choice` é despachado pelo `action` do rascunho; uma oferta de agendamento novo continua agendando (C15 da US-17)
- A pergunta "qual deles" junta os serviços com ` + `, porque a linha já usa vírgulas; o texto de cancelado usa `, ` como o resumo da US-17
- Fora do prazo envia uma mensagem só: o texto do prazo e o de transferência em blocos (C19)
- Cliente bloqueado que pede para remarcar e tem pelo menos um agendamento futuro é transferido sem a pergunta "qual deles"; sem agendamento futuro recebe o AC 2
- Com `cancelRequested` e `rescheduleRequested` juntos, vale a remarcação (não destrói nada antes de o cliente escolher)

- **Boundary:** C1-C37 closed by the `feat(US-18)` commit after `d953fb3`
- **Settled mid-build:** `Appointment.cancel` sobre um status diferente de `confirmed` lança `AppointmentNotConfirmedError` (`Só um agendamento confirmado pode ser cancelado.`, mapeado para `409`), não o `AppointmentCancelledError` do AC 24, cuja mensagem só vale para o agendamento já cancelado; nenhuma rota chama `cancel` hoje, o use case só cancela `confirmed`. Os unitários da US-18 usam um `ScheduleQuery` de teste lido do repositório de agendamentos em memória (`AppointmentBackedScheduleQuery`), para que o status gravado apareça na listagem seguinte como no banco. O C36 ganhou as duas asserções antigas que enumeram conjuntos ampliados e que o e2e completo revelou (status fora da lista em `appointments-schema` e respostas do ATD-22)
- **Abandoned:** nada

