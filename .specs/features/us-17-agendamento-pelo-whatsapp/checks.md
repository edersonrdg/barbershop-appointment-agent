# US-17: Agendamento pelo WhatsApp checks

Profile: light
Plan: `.specs/features/us-17-agendamento-pelo-whatsapp/plan.md`

40 checks em 7 fatias · 3 one-way doors · 0 open, 0 block

Um check concluído termina com ✅. Convenção das provas: todo teste cita o `CA` (ou o AC do plano, quando o CA não cobre) e o id do check entre parênteses no nome, ex.: `it('CA-17.1 (C1): ...')`. O seletor `-t` usa esse id; os testes da US-17 ficam num `describe('US-17 ...')` para não colidir com os ids da US-15/US-16.

- e2e: `npx jest --config ./test/jest-e2e.json <arquivo> -t "<padrão>"` (Postgres do compose rodando; `WHATSAPP_CONNECTOR` e `MESSAGE_INTERPRETER` trocados por fakes, relógio por `FixedClock`)
- unitário: `npx jest <arquivo> -t "<padrão>"`

Cenário das provas unitárias (`book-via-whatsapp.use-case.spec.ts` e `answer-client-question.use-case.spec.ts`), salvo quando o check diz outra coisa:

- relógio em `2026-09-29T15:00:00Z` = terça-feira, 29/09, 12:00 em `America/Sao_Paulo`; antecedência mínima de 60 min
- "Barbearia do Zé", endereço "Rua das Flores, 123", aberta de segunda a sábado das 09:00 às 19:00, sem intervalo; domingo fechada
- serviços ativos: Corte (30 min, R$ 45,00), Barba (20 min, R$ 30,00), Pigmentação (40 min, R$ 80,00, sem barbeiro que faça)
- barbeiros ativos: João (Corte, Barba) e Pedro (Corte), os dois de segunda a sábado das 09:00 às 19:00; um barbeiro inativo "Lucas" e um "Marcos" da barbearia B
- cliente "Carlos Souza" `+5511987654321`, sem faltas; o limite de faltas é 2
- "amanhã" é quarta-feira, 30/09 (`2026-09-30`)

Textos esperados (`{oferta}` é o bloco de oferta abaixo; blocos separados por uma linha em branco, `\n\n`):

- oferta: `Horários para Corte (R$ 45,00, 30 min):` + uma linha por opção `1. quarta-feira, 30/09, às 12:00, com João` + `Responda com o número do horário que você quer.`, linhas separadas por `\n`
- transferência: "Vou chamar alguém da equipe para te ajudar."
- sem tópico (US-15): "Posso te ajudar com serviços, preços, endereço e horário de funcionamento da Barbearia do Zé. O que você gostaria de saber?"

## Checks

### S1 - Pedido vira oferta de horários · ~8 arquivos · ~110 KB · ~28k

**C1** - Com `{ bookingRequested: true, services: ['Corte'], barber: 'João', date: '2026-09-30', period: 'afternoon' }`, a resposta é exatamente `Horários para Corte (R$ 45,00, 30 min):\n1. quarta-feira, 30/09, às 12:00, com João\n2. quarta-feira, 30/09, às 12:30, com João\n3. quarta-feira, 30/09, às 13:00, com João\nResponda com o número do horário que você quer.` (AC 1, CA-17.1, RF-01, RF-02)
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "\(C1\)"`

**C2** - Por tabela, João pedido para amanhã: `morning` oferece 09:00, 09:30, 10:00; `evening` oferece só 18:00 e 18:30 (2 opções); com João bloqueado amanhã das 12:00 às 17:30, `afternoon` oferece só 17:30 (não 11:30 nem 18:00) (AC 2)
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "\(C2\)"`

**C3** - Sem `date` (Corte, João), a oferta é terça-feira, 29/09, às 13:00, 13:30 e 14:00 (a partir de agora + 60 min) (AC 3)
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "\(C3\)"`

**C4** - Com `anyBarber: true` (Corte, amanhã, `afternoon`) e João ocupado amanhã das 12:00 às 13:00, as opções são exatamente `1. quarta-feira, 30/09, às 12:00, com Pedro`, `2. quarta-feira, 30/09, às 12:30, com Pedro`, `3. quarta-feira, 30/09, às 13:00, com João` (AC 4, CA-17.3, RN-06)
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "\(C4\)"`

**C5** - Com Corte e amanhã, sem `barber` nem `anyBarber`, a resposta é exatamente `Tem preferência de barbeiro? Fazem Corte: João, Pedro. Se não tiver, responda "tanto faz".` e nenhuma oferta é gravada no rascunho (AC 5, RF-03)
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "\(C5\)"`

**C6** - Com `bookingRequested: true` e `services: []`, a resposta é exatamente `Qual serviço você quer agendar? Temos: Barba, Corte, Pigmentação.`; um nome fora do catálogo ativo ("Hidratação") dá a mesma resposta (AC 6)
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "\(C6\)"`

**C7** - Com Barba e `barber: 'Pedro'`, a resposta é exatamente `Pedro não faz Barba. Fazem Barba: João. Se não tiver preferência, responda "tanto faz".` (AC 7)
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "\(C7\)"`

**C8** - Com Pigmentação, a resposta é exatamente `Nenhum barbeiro faz Pigmentação no momento.` e o rascunho fica nulo (AC 8)
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "\(C8\)"`

**C9** - Mensagem 1 `{ bookingRequested, services: ['Corte'], date: '2026-09-30', period: 'afternoon' }` recebe a pergunta do C5; mensagem 2 `{ bookingRequested, anyBarber: true }` recebe a oferta de Corte amanhã à tarde (12:00, 12:30, 13:00, todas com João); mensagem 3 `{ bookingRequested, date: '2026-10-01' }` recebe a oferta de quinta-feira, 01/10, à tarde, mantendo Corte e "tanto faz" (AC 9)
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "\(C9\)"`

**C10** - Com Corte, João, amanhã e `time: '15:00'`, as opções são exatamente uma: `1. quarta-feira, 30/09, às 15:00, com João`; com `anyBarber` e João ocupado das 15:00 às 15:30, a opção única é `... às 15:00, com Pedro` (AC 10)
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "\(C10\)"`

**C11** - Com João ocupado amanhã das 15:00 às 15:30 e pedido de João às 15:00, a resposta é exatamente `O horário das 15:00 de quarta-feira, 30/09 não está livre.\n\n` + oferta de 12:00, 12:30 e 13:00 da mesma data (período da tarde) (AC 11)
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "\(C11\)"`

**C12** - Com `date: '2026-09-28'`, a resposta é exatamente `Essa data já passou.\n\n` + oferta de terça-feira, 29/09, às 13:00, 13:30 e 14:00 (AC 12)
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "\(C12\)"`

**C13** - O intérprete recebe `barberNames: ['João', 'Pedro']` (sem o inativo Lucas nem Marcos da barbearia B), `today` = `{ date: '2026-09-29', weekday: 'terça-feira' }` e, sem rascunho, `offeredOptions: []`; depois da oferta do C1, a mensagem seguinte manda `offeredOptions` com as 3 linhas da oferta, sem o número (AC 13, RN-26)
Proof: `npx jest src/usecases/answer-client-question/answer-client-question.use-case.spec.ts -t "\(C13\)"`

**C14** - Depois da oferta do C4, o rascunho guarda `offer` = `[{ barberId: pedro, startsAt: 2026-09-30T15:00:00Z }, { barberId: pedro, startsAt: 2026-09-30T15:30:00Z }, { barberId: joao, startsAt: 2026-09-30T16:00:00Z }]`, nessa ordem, com `serviceIds: ['corte']` e `anyBarber: true` (AC 14, door 2)
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "\(C14\)"`

### S2 - Escolha vira agendamento confirmado · ~6 arquivos · ~90 KB · ~22k

**C15** - Depois da oferta do C1, `{ choice: 2 }` cria exatamente 1 agendamento com `status: 'confirmed'`, `origin: 'bot'`, `clientId` do Carlos, `barberId` do João, `serviceIds: ['corte']`, `startsAt 2026-09-30T15:30:00Z` e `endsAt 2026-09-30T16:00:00Z` (AC 15, CA-17.2, RN-01)
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "\(C15\)"`

**C16** - A resposta do C15 é exatamente `Agendamento confirmado!\nServiço: Corte\nBarbeiro: João\nData: quarta-feira, 30/09\nHorário: 12:30\nValor: R$ 45,00\nEndereço: Rua das Flores, 123` e o rascunho fica nulo (AC 16, CA-17.2)
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "\(C16\)"`

**C17** - Com `services: ['Corte', 'Barba']` e João, a oferta começa com `Horários para Corte + Barba (R$ 75,00, 50 min):` e o resumo da escolha 1 traz `Serviços: Corte, Barba` e `Valor: R$ 75,00`, com `endsAt` 50 min depois do início (AC 17, RN-04)
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "\(C17\)"`

**C18** - Com a barbearia sem endereço, o resumo termina com a linha `Endereço: ainda não informado` (AC 18)
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "\(C18\)"`

**C19** - Com a oferta de 2 opções do C2 (`evening`), `{ choice: 3 }` responde exatamente `Não encontrei essa opção.\n\n` + a mesma oferta de 18:00 e 18:30, não cria agendamento e mantém a oferta (AC 19)
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "\(C19\)"`

**C20** - Por tabela no `AnswerClientQuestionUseCase`, `{ choice: 1 }` sem rascunho e com rascunho de oferta gravado há 61 min recebe o texto sem tópico e deixa `consecutiveFailures = 1`, sem agendamento; com o rascunho gravado há 59 min, agenda (AC 20)
Proof: `npx jest src/usecases/answer-client-question/answer-client-question.use-case.spec.ts -t "\(C20\)"`

**C21** - No e2e, com uma oferta de 3 opções gravada, dois webhooks do mesmo cliente com `key.id` diferentes, `{ choice: 1 }` e `{ choice: 2 }`, enviados em paralelo, deixam exatamente 1 linha em `appointments` do cliente e exatamente 1 `sendText` começando com `Agendamento confirmado!` (AC 21, door 2)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-booking.e2e-spec.ts -t "\(C21\)"`

**C22** - Com o fake do conector falhando no `sendText` do resumo, o use case devolve `{ outcome: 'failed' }` e o agendamento fica no repositório; no e2e o webhook responde `204` e a linha de `appointments` existe (AC 22)
Proof: `npx jest src/usecases/answer-client-question/answer-client-question.use-case.spec.ts -t "\(C22\)"`
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-booking.e2e-spec.ts -t "\(C22\)"`

### S3 - Horário ocupado durante a conversa · ~2 arquivos · ~40 KB · ~10k

**C23** - Depois da oferta do C1, com outro agendamento do João criado amanhã das 12:00 às 12:30, `{ choice: 1 }` não cria agendamento do Carlos e responde exatamente `Esse horário acabou de ser ocupado.\n\n` + oferta de 12:30, 13:00 e 13:30; com um repositório cujo `create` rejeita com `AppointmentConflictError` (constraint de exclusão), a resposta é a mesma frase seguida de nova oferta (AC 23, CA-17.4, RN-07)
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "\(C23\)"`

**C24** - Depois da oferta do C1, com um bloqueio do João criado amanhã das 12:00 às 13:00, `{ choice: 1 }` responde `Esse horário acabou de ser ocupado.\n\n` + oferta de 13:00, 13:30 e 14:00, sem agendar (AC 24)
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "\(C24\)"`

### S4 - Antecedência mínima · ~2 arquivos · ~30 KB · ~8k

**C25** - Por tabela, pedido de João para hoje (29/09) às 12:30: com antecedência 60 → `Só agendamos pelo WhatsApp com pelo menos 1h de antecedência.\n\n` + oferta de uma opção `1. terça-feira, 29/09, às 13:00, com João`; com 30 → `... pelo menos 30 min de antecedência.` e nenhuma recusa (12:30 é oferecido, é exatamente o limite); com 90 → `... pelo menos 1h30 de antecedência.` + opção `às 13:30` (AC 25, AC 27, CA-17.5, RN-02)
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "\(C25\)"`

**C26** - Oferta gravada com a opção 1 = hoje às 13:00 (relógio às 12:00); com o relógio em `2026-09-29T15:01:00Z`, `{ choice: 1 }` não agenda e responde `Só agendamos pelo WhatsApp com pelo menos 1h de antecedência.\n\n` + opção única `1. terça-feira, 29/09, às 13:30, com João` (AC 26)
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "\(C26\)"`

### S5 - Sem horário no período pedido · ~2 arquivos · ~30 KB · ~8k

**C27** - Com João bloqueado amanhã das 12:00 às 18:00, pedido de João amanhã `afternoon` responde exatamente `Não há horário livre à tarde em quarta-feira, 30/09.\n\n` + oferta de 30/09 às 09:00, 09:30 e 10:00; com João bloqueado amanhã das 09:00 às 12:00 e `morning`, a frase é `... de manhã em quarta-feira, 30/09.` e as opções são 12:00, 12:30 e 13:00 (AC 28, CA-17.7)
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "\(C27\)"`

**C28** - Com João bloqueado amanhã das 09:00 às 19:00, pedido de João amanhã sem período responde exatamente `Não há horário livre em quarta-feira, 30/09.\n\n` + oferta de quinta-feira, 01/10, às 09:00, 09:30 e 10:00 (AC 29)
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "\(C28\)"`

**C29** - Com João bloqueado de 29/09 09:00 a 05/10 19:00, pedido de Corte com João sem data responde exatamente `Não encontrei horário livre para Corte até segunda-feira, 05/10.` e o rascunho fica sem oferta; com pedido para `2026-09-30` e o mesmo bloqueio até 06/10, a data final é `terça-feira, 06/10` (AC 30)
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "\(C29\)"`

### S6 - Cliente bloqueado por faltas · ~6 arquivos · ~60 KB · ~15k

**C30** - Por tabela no `AnswerClientQuestionUseCase`, com o Carlos com 2 faltas e limite 2: `{ bookingRequested: true, services: ['Corte'] }` e `{ choice: 1 }` com oferta em vigor enviam exatamente 1 `sendText` com o texto de transferência, deixam a conversa com `pauseReason: 'blocked_client'` e o rascunho nulo, e nenhum agendamento é criado (AC 31, CA-17.6, RN-12)
Proof: `npx jest src/usecases/answer-client-question/answer-client-question.use-case.spec.ts -t "\(C30\)"`

**C31** - Com o Carlos bloqueado, `{ topics: ['address'] }` responde `Endereço da Barbearia do Zé: Rua das Flores, 123` e a conversa não é pausada (AC 32)
Proof: `npx jest src/usecases/answer-client-question/answer-client-question.use-case.spec.ts -t "\(C31\)"`

**C32** - No e2e, com o cliente com 2 faltas gravadas, um webhook com `{ bookingRequested: true, services: ['Corte'] }` responde `204`, envia o texto de transferência, e `GET /whatsapp/conversations/waiting-human` como Dono traz a conversa com `reason: 'blocked_client'` (AC 31, AC 33)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-booking.e2e-spec.ts -t "\(C32\)"`

### S7 - Conversa, métricas, documentação e doors · ~10 arquivos · ~120 KB · ~30k

**C33** - Por tabela no `AnswerClientQuestionUseCase`, com a oferta do C1 em vigor: `{ humanRequested: true, bookingRequested: true, services: ['Corte'] }` transfere com `requested` e deixa o rascunho nulo; `{ offTopic: true, bookingRequested: true }` responde a recusa da US-15 e mantém o rascunho; `{ bookingRequested: true, services: ['Corte'], barber: 'João', date: '2026-09-30', topics: ['address'] }` partindo de 1 falha responde só a oferta (sem `Endereço`) e deixa `consecutiveFailures = 0`; `{ topics: ['address'] }` responde o endereço e mantém o rascunho igual; o intérprete rejeitando responde o texto de indisponível e mantém rascunho e falhas (AC 34 a AC 38)
Proof: `npx jest src/usecases/answer-client-question/answer-client-question.use-case.spec.ts -t "\(C33\)"`

**C34** - No e2e, um webhook de pedido (oferta) e outro de escolha aumentam `whatsapp_replies_total{kind="booking"}` e `whatsapp_replies_total{kind="booked"}` em 1 cada e `appointments_booked_total{origin="bot"}` em 1; o texto de `/metrics` para essas métricas não traz label além de `kind` e `origin` (AC 39)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-booking.e2e-spec.ts -t "\(C34\)"`

**C35** - No agendamento, o use case devolve `appointmentId` no resultado, e o controller do webhook loga um objeto com `barbershopId` e `appointmentId`; a serialização do que foi logado não contém o telefone, o nome do cliente nem o texto (AC 40)
Proof: `npx jest src/infrastructure/external/whatsapp/evolution/evolution-webhook.controller.spec.ts -t "\(C35\)"`

**C36** - No documento OpenAPI, a descrição de `POST /webhooks/whatsapp/evolution` contém `US-17`, e o schema da resposta `200` de `GET /whatsapp/conversations/waiting-human` tem `reason.enum` igual a `['requested', 'not_understood', 'blocked_client']` (AC 41, Surface)
Proof: `npx jest --config ./test/jest-e2e.json test/api-docs.e2e-spec.ts -t "\(C36\)"`

**C37** - O schema da interpretação exige os campos da door 1: o adaptador do Gemini resolve com `{ bookingRequested: true, barber: 'João', anyBarber: false, date: '2026-09-30', period: 'afternoon', time: '15:00', choice: 2 }` repassado; rejeita com `MessageInterpreterUnavailableError`, por tabela, `date: '30/09/2026'`, `time: '25:00'`, `period: 'night'`, `choice: 0`, `choice: 4`, `choice: 1.5` e JSON sem `bookingRequested`; o `responseJsonSchema` tem os 7 campos em `required`; o `systemInstruction` contém `2026-09-29`, `terça-feira`, cada nome de `barberNames` e cada linha de `offeredOptions` (door 1)
Proof: `npx jest src/infrastructure/external/gemini/gemini-message-interpreter.spec.ts -t "\(C37\)"`

**C38** - No banco, `whatsapp_conversations.booking_draft` existe, é `jsonb` e aceita nulo; `pause_reason = 'blocked_client'` é aceito com `paused_at` preenchido e `pause_reason = 'bored'` continua recusado (door 2, door 3)
Proof: `npx jest --config ./test/jest-e2e.json test/database/whatsapp-conversations-schema.e2e-spec.ts -t "\(C38\)"`

**C39** - No repositório TypeORM, um rascunho gravado volta igual na leitura; um `booking_draft` inválido gravado por SQL (`'{"foo": 1}'`) é lido como sem rascunho; consumir a oferta com o `id` gravado resolve `true` uma vez e `false` na segunda e com `id` diferente; pausar e reativar a conversa deixam `booking_draft` nulo (door 2)
Proof: `npx jest --config ./test/jest-e2e.json test/database/typeorm-conversation.repository.e2e-spec.ts -t "\(C39\)"`

**C40** - No e2e, o caminho completo: webhook de pedido (Corte, João do cadastro, amanhã, `afternoon`) recebe a oferta; webhook de `{ choice: 1 }` recebe o resumo; a linha de `appointments` tem `origin = 'bot'`, `status = 'confirmed'` e o `client_id` do cliente; e `GET /schedule` do dia como Dono traz a entrada com `origin: 'bot'`. Os e2e da US-14, US-15 e US-16 passam sem mudança em asserções (Flow, Impact)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-booking.e2e-spec.ts -t "\(C40\)"`
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-questions.e2e-spec.ts test/whatsapp-first-contact.e2e-spec.ts test/whatsapp-handoff.e2e-spec.ts`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| períodos (3) | `morning` C2 · `afternoon` C1, C2 · `evening` C2 | - |
| fronteiras do período da tarde (3) | 11:30 fora C2 · 17:30 dentro C2 · 18:00 fora C2 | - |
| dado faltando no pedido (3) | serviço C6 · barbeiro C5 · data C3 | - |
| escolha do barbeiro (4) | nomeado C1 · `anyBarber` C4 · nomeado inapto C7 · ninguém faz C8 | - |
| hora exata (3) | livre C10 · ocupada C11 · dentro da antecedência C25 | - |
| desfecho da escolha (6) | agenda C15 · fora das opções C19 · sem oferta ou vencida C20 · ocupada (app e constraint) C23 · bloqueio C24 · antecedência vencida C26 | - |
| sem horário (3) | período vazio C27 · data vazia C28 · 7 dias vazios C29 | - |
| formato da antecedência (3) | `1h` C25 · `30 min` C25 · `1h30` C25 | - |
| precedência na mesma mensagem (5) | atendente C33 · fora de contexto C33 · agendamento com tópicos C33 · tópicos com rascunho C33 · intérprete fora C33 | - |
| mensagens de cliente bloqueado (3) | pedido C30 · escolha C30 · só tópico C31 | - |
| `kind` novos de `whatsapp_replies_total` (2) | `booking` C34 · `booked` C34 | - |
| `GET /whatsapp/conversations/waiting-human` statuses (3) | 200 C32 (com `blocked_client`) · 401 existing C17 da US-16 · 403 existing C17 da US-16 | - |
| campos da door 1 (7) | `bookingRequested` C37 · `barber` C37 · `anyBarber` C37 · `date` C37 · `period` C37 · `time` C37 · `choice` C37 | - |
| doors do plano (3) | 1 interpretação C37, C13 · 2 rascunho C38, C39, C21, C14 · 3 `blocked_client` C38, C32, C36 | - |
| ciclo de vida do rascunho (5) | gravado na oferta C14 · limpo ao agendar C16 · limpo na transferência C30, C39 · limpo na reativação C39 · vencido em 60 min C20 | - |

- Claims naming a status code, route or response shape: C21, C22, C32, C34, C36, C40 - each has a proof that crosses the boundary
- No other check claims more than the single case its proof exercises

## Swept

- validation: C37 (formato de data, hora, período e escolha vindos do modelo), C6 (serviço fora do catálogo), C39 (rascunho inválido no banco)
- failure modes: C22 (resumo não enviado, agendamento mantido)
- idempotency: existing - a reivindicação por `key.id` da US-15 (door 3) roda antes do agendamento; C21 cobre duas mensagens distintas sobre a mesma oferta
- authorization: existing - webhook com segredo (AD-011) e `waiting-human` só-Dono (AD-007, C17 da US-16); nenhuma rota nova
- concurrency: C21 (mesma oferta, duas escolhas), C23 (horário tomado por outro, incluindo a constraint de exclusão)
- data lifecycle: C20 (rascunho vence em 60 min), C16, C30, C39 (rascunho limpo ao agendar, transferir e reativar)
- dependency failure: C33 (Gemini fora mantém rascunho e falhas), C22 (conector falha)
- state transitions: C9 (rascunho acumula dados), C15 (oferta → agendado), C30 (ativa → pausada por `blocked_client`)
- observability: C34, C35

## Handoff

- S1 = 28k, S2 entra a 50k, S3 a 60k, S4 a 68k, S5 a 76k, S6 a 91k, S7 a 121k (arquivos tocados e vizinhos lidos, ~480 KB / 4), abaixo do budget de 150k - one builder
