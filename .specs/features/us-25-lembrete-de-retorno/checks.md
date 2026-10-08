# US-25: Lembrete de retorno com opt-in checks

Profile: light
Plan: `.specs/features/us-25-lembrete-de-retorno/plan.md`

32 checks em 5 fatias · 3 one-way doors · 0 open, 0 block

Um check concluído termina com ✅. Convenção das provas: todo teste cita o `CA` (ou o AC) e o id do check sob um `US-25` no nome, ex.: `it('US-25 CA-25.1 (C1): ...')`, porque os arquivos já têm checks de outras histórias com os mesmos ids. O seletor é `US-25.*\(Cn\)`.

- unitário: `npx jest <arquivo> -t "US-25.*\(Cn\)"`
- e2e: `npx jest --config ./test/jest-e2e.json <arquivo> -t "US-25.*\(Cn\)"` (Postgres do compose rodando)

Cenário-base dos unitários (`setupWhatsAppBooking`, terça 29/09/2026 12:00 em São Paulo, `returnReminderDays` 30): "Barbearia do Zé", Corte (30 min) com João; clientes Carlos Souza, Ana Lima (`+5511911110001`) e Bruno Reis (`+5511911110002`), todos com o lembrete desativado, sem pergunta enviada e sem registro de opt-in, salvo dito no check. O WhatsApp da barbearia está `connected` e ela não está suspensa. "Atendimento de X às HH:MM de DD/MM" é um agendamento de Corte com João, de 30 min, `attended`, do cliente X.

O `<N>` do convite é o número de dias entre a data local do fim do último atendimento e a data local de agora, que é `returnReminderDays` quando o convite sai na hora em que vence. O nome no convite é o primeiro nome do cliente.

Textos (Assumptions do plano):

- `PERGUNTA` = `Obrigado pela visita à Barbearia do Zé! Quer que eu te avise quando estiver na hora de voltar? Responda "sim" e eu te mando um lembrete daqui a 30 dias. Se não quiser, é só ignorar.`
- `ATIVADO` = `Combinado! Vou te lembrar de voltar 30 dias depois do seu último atendimento. Para parar, é só responder "parar lembretes".`
- `DESATIVADO` = `Pronto, você não vai mais receber lembretes de retorno. Se mudar de ideia, é só responder "quero lembrete".`
- `CONVITE_ANA_30` = `Oi, Ana! Já faz 30 dias do seu último atendimento na Barbearia do Zé. Que tal agendar o próximo? É só me dizer o dia e o horário. Para não receber mais este lembrete, responda "parar lembretes".`

## Checks

### S1 - Pergunta depois do atendimento · 8 files · 70 KB · ~18k

**C1** - Com o atendimento de Ana às 10:00 de 29/09 (fim 10:30), uma rodada envia exatamente `PERGUNTA` ao telefone de Ana, uma vez; Ana fica com `returnReminderAskedAt` = agora e `returnReminderEnabled` continua `false` (CA-25.1, AC 1, AC 3)
Proof: `npx jest src/usecases/send-return-reminders/send-return-reminders.use-case.spec.ts -t "US-25.*\(C1\)"`

**C2** - Janela e fonte da pergunta, linha a linha, só com Ana (AC 1): (a) atendimento terminado há 23h59 -> envia; (b) terminado há exatamente 24h -> não envia; (c) marcado `attended` com fim às 12:30 (depois de agora) -> não envia às 12:00 e envia numa rodada às 12:30; (d) agendamentos `confirmed`, `no_show` e `cancelled` com fim às 11:00 -> não envia; (e) agendamento `attended` sem cliente -> a rodada termina sem falha e nada é enviado; (f) atendimento de um cliente da barbearia B -> nada é enviado na barbearia A
Proof: `npx jest src/usecases/send-return-reminders/send-return-reminders.use-case.spec.ts -t "US-25.*\(C2\)"`

**C3** - Quem não recebe a pergunta, linha a linha, sempre com o atendimento de Ana às 10:00 de 29/09 (AC 1): (a) Ana com o lembrete ativado -> não envia; (b) Ana já recebeu a pergunta em 01/09 -> não envia; (c) Ana com uma mudança de opt-in registrada (ativou e desativou), lembrete desativado e sem pergunta -> não envia
Proof: `npx jest src/usecases/send-return-reminders/send-return-reminders.use-case.spec.ts -t "US-25.*\(C3\)"`

**C4** - Com dois atendimentos de Ana na janela (09:00 e 10:00 de 29/09), uma rodada envia 1 pergunta; uma segunda rodada não envia nenhuma (AC 2)
Proof: `npx jest src/usecases/send-return-reminders/send-return-reminders.use-case.spec.ts -t "US-25.*\(C4\)"`

**C5** - Com a conversa de Ana pausada para atendimento humano, a rodada não envia e Ana continua com `returnReminderAskedAt` `null`; depois de o Dono reativar a conversa, a rodada seguinte envia `PERGUNTA` (AC 4)
Proof: `npx jest src/usecases/send-return-reminders/send-return-reminders.use-case.spec.ts -t "US-25.*\(C5\)"`

**C6** - Com o WhatsApp `disconnected`, e depois com a barbearia suspensa (teste vencido sem assinatura, AD-017), a rodada não envia e Ana continua com `returnReminderAskedAt` `null`; de volta a `connected` e sem suspensão, a rodada envia (AC 5)
Proof: `npx jest src/usecases/send-return-reminders/send-return-reminders.use-case.spec.ts -t "US-25.*\(C6\)"`

**C7** - Com o conector falhando, Ana fica com `returnReminderAskedAt` = agora, o resultado traz 1 falha de envio com `barbershopId`, `clientId: 'ana'` e `kind: 'question'`, e uma segunda rodada com o conector funcionando não envia nada (AC 6)
Proof: `npx jest src/usecases/send-return-reminders/send-return-reminders.use-case.spec.ts -t "US-25.*\(C7\)"`

### S2 - Ativar e desativar pelo WhatsApp · 6 files · 110 KB · ~28k

**C8** - Entrada do intérprete, linha a linha, com Ana escrevendo ao bot (AC 7): (a) pergunta enviada há 1h, lembrete desativado, sem rascunho -> `returnReminderQuestion: true`; (b) pergunta enviada há exatamente 24h -> `true`; (c) há 24h01 -> `false`; (d) nunca recebeu a pergunta -> `false`; (e) pergunta há 1h com o lembrete ativado -> `false`; e, com a pergunta há 1h e o lembrete desativado, um rascunho em vigor com (f) oferta de horários -> `false`; (g) agendamentos listados para cancelar -> `false`; (h) adicional pendente -> `false`; (i) proposta de lista de espera -> `false`; (j) só os critérios (serviço, sem oferta) -> `true`
Proof: `npx jest src/usecases/answer-client-question/answer-client-question.use-case.spec.ts -t "US-25.*\(C8\)"`

**C9** - Ana com o lembrete desativado e `{ returnReminder: 'enable' }` fica com `returnReminderEnabled: true`, recebe exatamente `ATIVADO` e o resultado é `{ outcome: 'sent', kind: 'return_reminder' }` (RF-20, AC 8)
Proof: `npx jest src/usecases/answer-client-question/answer-client-question.use-case.spec.ts -t "US-25.*\(C9\)"`

**C10** - `{ returnReminder: 'disable' }`, linha a linha (CA-25.3, AC 9): (a) Ana com o lembrete ativado fica com `false` e recebe exatamente `DESATIVADO`; (b) Carlos, que nunca recebeu a pergunta, recebe exatamente `DESATIVADO` e continua com `false`; (c) logo depois de (a), uma rodada da rotina com o último atendimento de Ana vencido não envia convite
Proof: `npx jest src/usecases/answer-client-question/answer-client-question.use-case.spec.ts -t "US-25.*\(C10\)"`
Proof: `npx jest src/usecases/send-return-reminders/send-return-reminders.use-case.spec.ts -t "US-25.*\(C10\)"`

**C11** - Pedir o valor que já está, linha a linha (AC 10): (a) `enable` com o lembrete ativado responde `ATIVADO` e não grava registro; (b) `disable` com o lembrete desativado responde `DESATIVADO` e não grava registro; em ambos o repositório tem 0 registros de Ana
Proof: `npx jest src/usecases/answer-client-question/answer-client-question.use-case.spec.ts -t "US-25.*\(C11\)"`

**C12** - Precedência, linha a linha, com `returnReminder: 'enable'` e Ana com o lembrete desativado (AC 11, AC 12): (a) com `offTopic: true` -> responde `ATIVADO`, não a recusa da US-15; (b) com `bookingRequested: true` e `services: ['Corte']` -> responde `ATIVADO` e nenhum rascunho é gravado; (c) com `confirmRequested: true` e um agendamento lembrado -> responde `ATIVADO` e o agendamento continua sem confirmação; (d) com `humanRequested: true` -> transfere com motivo `requested` e o lembrete continua `false`; (e) com uma falha de entendimento já contada, a resposta de `ATIVADO` zera a contagem e soma 1 em `reply('return_reminder')`
Proof: `npx jest src/usecases/answer-client-question/answer-client-question.use-case.spec.ts -t "US-25.*\(C12\)"`

### S3 - Convite para voltar · 6 files · 80 KB · ~20k

**C13** - Ana com o lembrete ativado e o atendimento das 11:30 de 30/08 (fim 12:00 de 30/08), sem agendamento futuro: às 11:59 de 29/09 nada sai; às 12:00 de 29/09 sai exatamente `CONVITE_ANA_30` ao telefone de Ana, uma vez; uma rodada às 12:01 não envia de novo; com o fim às 12:00 de 15/08, o texto diz `Já faz 45 dias` (CA-25.2, RN-19, AC 13)
Proof: `npx jest src/usecases/send-return-reminders/send-return-reminders.use-case.spec.ts -t "US-25.*\(C13\)"`

**C14** - Quando não há convite, linha a linha, sempre com o atendimento de 30/08 vencido (AC 13 a AC 15): (a) Ana com um agendamento `confirmed` às 15:00 de 30/09 -> nada; depois de o agendamento ficar `cancelled`, a rodada seguinte envia (RN-19); (b) Bruno com o mesmo histórico e o lembrete desativado -> nada (CA-25.4); (c) Ana com outro atendimento às 10:00 de 19/09 -> nada, porque o prazo conta do último; (d) Ana com uma falta (`no_show`) em 25/09 depois do atendimento de 30/08 -> o convite sai; (e) `returnReminderDays` 45 -> nada às 12:00 de 29/09
Proof: `npx jest src/usecases/send-return-reminders/send-return-reminders.use-case.spec.ts -t "US-25.*\(C14\)"`

**C15** - Um convite por atendimento: depois do convite do atendimento de 30/08, um novo atendimento de Ana às 10:00 de 29/09 não gera convite até 12:00 de 29/10, e às 10:30 de 29/10 gera o segundo convite, com `Já faz 30 dias` (AC 16)
Proof: `npx jest src/usecases/send-return-reminders/send-return-reminders.use-case.spec.ts -t "US-25.*\(C15\)"`

**C16** - Linha a linha, com o atendimento de 30/08 vencido (AC 17): (a) Ana com 2 faltas (limite 2) -> nada e, com as faltas zeradas, a rodada seguinte envia; (b) conversa de Ana pausada -> nada e, depois de reativada, a rodada seguinte envia
Proof: `npx jest src/usecases/send-return-reminders/send-return-reminders.use-case.spec.ts -t "US-25.*\(C16\)"`

**C17** - Com o WhatsApp `disconnected`, e depois com a barbearia suspensa, nenhum convite sai; de volta a `connected` e sem suspensão, o convite sai (AC 18)
Proof: `npx jest src/usecases/send-return-reminders/send-return-reminders.use-case.spec.ts -t "US-25.*\(C17\)"`

**C18** - Com o conector falhando no convite, o resultado traz 1 falha de envio com `barbershopId`, `clientId: 'ana'` e `kind: 'invite'`, e uma segunda rodada com o conector funcionando não envia nada (AC 19)
Proof: `npx jest src/usecases/send-return-reminders/send-return-reminders.use-case.spec.ts -t "US-25.*\(C18\)"`

**C19** - Com a leitura da barbearia `barbershop-0` falhando, a rodada registra a falha dela no resultado e ainda envia a pergunta e o convite na barbearia A (AC 20)
Proof: `npx jest src/usecases/send-return-reminders/send-return-reminders.use-case.spec.ts -t "US-25.*\(C19\)"`

### S4 - Registro do consentimento · 4 files · 40 KB · ~10k

**C20** - No banco, ativar Ana às 10:00 e desativar às 11:00 deixa `clients.return_reminder_enabled` `false` e 2 linhas em `return_reminder_consents` da barbearia de Ana, em ordem de `recorded_at`: `(enabled true, channel 'whatsapp', recorded_at 10:00)` e `(enabled false, channel 'whatsapp', recorded_at 11:00)`; as duas chamadas resolvem `true` (CA-25.5, AC 21, AC 23)
Proof: `npx jest --config ./test/jest-e2e.json test/database/typeorm-client.repository.e2e-spec.ts -t "US-25.*\(C20\)"`

**C21** - No banco, pedir `true` com o lembrete já `true` resolve `false` e não grava linha; duas chamadas simultâneas (`Promise.all`) pedindo `true` gravam 1 linha e só uma resolve `true` (AC 10, AC 22)
Proof: `npx jest --config ./test/jest-e2e.json test/database/typeorm-client.repository.e2e-spec.ts -t "US-25.*\(C21\)"`

**C22** - Door 1 no banco, linha a linha: (a) `channel = 'sms'` é recusado pelo `CHECK`; (b) uma linha com a barbearia B e um cliente da barbearia A é recusada pela FK; (c) mudar o lembrete de um cliente de A passando a barbearia B resolve `false` e não grava nada (RN-26); (d) reivindicar a pergunta de Ana resolve `true` e depois `false`; com o lembrete ativado, `false`; com um registro de opt-in, `false`; (e) reivindicar o convite de um agendamento `attended` resolve `true` e depois `false`; de um `confirmed`, `false`; passando outra barbearia, `false`; (f) o `down` da migration remove a tabela e as duas colunas, e o `up` as recria
Proof: `npx jest --config ./test/jest-e2e.json test/database/typeorm-client.repository.e2e-spec.ts -t "US-25.*\(C22\)"`
Proof: `npx jest --config ./test/jest-e2e.json test/database/typeorm-appointment.repository.e2e-spec.ts -t "US-25.*\(C22\)"`
Proof: `npx jest --config ./test/jest-e2e.json test/database/return-reminder-schema.e2e-spec.ts -t "US-25.*\(C22\)"`

**C23** - As leituras da rotina no banco, linha a linha: (a) atendimentos que terminaram em `(depois, até]`: lista o `attended` com cliente dentro da janela, inclusive o que termina exatamente em `até`; deixa de fora o que termina exatamente em `depois`, os outros status, o sem cliente e o da barbearia B; (b) último atendimento dos clientes com o lembrete ativado e convite ainda não enviado, com fim até o limite dado: lista o de Ana; deixa de fora o de Bruno (lembrete desativado), o de Ana quando um atendimento mais novo dela ainda não venceu, o já convidado e o da barbearia B
Proof: `npx jest --config ./test/jest-e2e.json test/database/typeorm-schedule.query.e2e-spec.ts -t "US-25.*\(C23\)"`

### S5 - Observabilidade, documentação, doors e ponta a ponta · 10 files · 150 KB · ~38k

**C24** - Métricas, linha a linha (AC 24): a pergunta enviada soma 1 em `message('question', 'sent')`, a que falhou em `('question', 'failed')`, o convite em `('invite', 'sent')` e `('invite', 'failed')`; ativar soma 1 em `optInChanged(true)` e desativar em `optInChanged(false)`, e pedir o valor que já está não soma
Proof: `npx jest src/usecases/send-return-reminders/send-return-reminders.use-case.spec.ts -t "US-25.*\(C24\)"`
Proof: `npx jest src/usecases/answer-client-question/answer-client-question.use-case.spec.ts -t "US-25.*\(C24\)"`

**C25** - `GET /metrics` traz `return_reminder_messages_total` só com os labels `kind` e `outcome`, e `return_reminder_opt_in_changes_total{enabled="true"} 1` depois da ativação pelo webhook, sem label com id (AC 24)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-return-reminder.e2e-spec.ts -t "US-25.*\(C25\)"`

**C26** - O log de fim de rodada do `ReturnReminderJob` traz as contagens (`questions`, `invites`, `failed`, `failedBarbershops`) e não traz telefone nem nome de cliente; uma falha de envio é logada com `barbershopId`, `clientId` e `kind`; uma falha de barbearia é logada com `barbershopId` (AC 24)
Proof: `npx jest src/infrastructure/jobs/return-reminder.job.spec.ts -t "US-25.*\(C26\)"`

**C27** - A descrição do webhook `POST /webhooks/whatsapp/evolution` no documento OpenAPI gerado contém `US-25` (AC 25)
Proof: `npx jest --config ./test/jest-e2e.json test/api-docs.e2e-spec.ts -t "US-25.*\(C27\)"`

**C28** - Door 2: o `GeminiMessageInterpreter` repassa `returnReminder` `'enable'`, `'disable'` e `null`; uma resposta sem `returnReminder`, ou com `'maybe'`, rejeita com `MessageInterpreterUnavailableError`; o schema de resposta exige o campo com o enum `enable`/`disable` e `null`; a instrução traz a linha da pergunta do lembrete de retorno conforme `returnReminderQuestion` (`true` e `false`)
Proof: `npx jest src/infrastructure/external/gemini/gemini-message-interpreter.spec.ts -t "US-25.*\(C28\)"`

**C29** - Door 3: o `ReturnReminderJob` está registrado com `* * * * *` em `America/Sao_Paulo` no `AppModule`
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-return-reminder.e2e-spec.ts -t "US-25.*\(C29\)"`

**C30** - Ponta a ponta pelo banco e pelo webhook (CA-25.1, CA-25.3, CA-25.5): o atendimento de Ana gravado como `attended` com fim 1h antes de agora; `run()` faz o conector receber exatamente `PERGUNTA` para Ana e grava `return_reminder_asked_at`; Ana responde pelo webhook e o intérprete fake devolve `returnReminder: 'enable'` -> `return_reminder_enabled` `true`, 1 linha em `return_reminder_consents` com `channel 'whatsapp'` e o conector recebe `ATIVADO`; Ana escreve "parar lembretes" e o fake devolve `'disable'` -> `false`, 2 linhas, o conector recebe `DESATIVADO`
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-return-reminder.e2e-spec.ts -t "US-25.*\(C30\)"`

**C31** - Ponta a ponta do convite pelo banco (CA-25.2, CA-25.4): Bruno com o lembrete gravado `true` e um atendimento que terminou 30 dias antes de agora; Carlos com o mesmo histórico e o lembrete `false`; `run()` faz o conector receber o convite de Bruno (`Oi, Bruno! Já faz 30 dias ...`) e nada para Carlos, e grava `return_reminder_sent_at` no agendamento de Bruno
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-return-reminder.e2e-spec.ts -t "US-25.*\(C31\)"`

**C32** - Duas rodadas ao mesmo tempo (`Promise.all` de dois `run()`) sobre o banco, com a pergunta de Ana e o convite de Bruno pendentes, enviam 1 pergunta e 1 convite (AC 2, AC 16, door 1)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-return-reminder.e2e-spec.ts -t "US-25.*\(C32\)"`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| janela da pergunta (4 bordas) | dentro C2 (a) · 24h exatas C2 (b) · fim depois de agora C2 (c) · `até` incluído C23 (a) | - |
| status do agendamento que dispara a pergunta (4) | `attended` C1 · `confirmed` C2 (d) · `no_show` C2 (d) · `cancelled` C2 (d) | - |
| cliente que não recebe a pergunta (4) | lembrete ativado C3 (a) · já perguntado C3 (b) · com registro C3 (c) · sem cliente C2 (e) | - |
| rodada sem pergunta (3) | pausada C5 · desconectado C6 · suspensa C6 | - |
| `returnReminderQuestion` (10 linhas) | há 1h C8 (a) · 24h exatas C8 (b) · 24h01 C8 (c) · nunca perguntado C8 (d) · lembrete ativado C8 (e) · oferta C8 (f) · agendamentos listados C8 (g) · adicional C8 (h) · lista de espera C8 (i) · só critérios C8 (j) | - |
| `returnReminder` (3) | `enable` C9 · `disable` C10 · `null` C28 | - |
| valor pedido x valor atual (4) | off -> on C9 · on -> off C10 (a) · on -> on C11 (a) · off -> off C10 (b) C11 (b) | - |
| precedência no roteamento (5) | `offTopic` C12 (a) · agendamento C12 (b) · presença C12 (c) · `humanRequested` C12 (d) · falhas zeradas C12 (e) | - |
| prazo do convite (3 bordas) | 1 min antes C13 · no vencimento C13 · `returnReminderDays` 45 C14 (e) | - |
| quando não há convite (6) | agendamento futuro C14 (a) · lembrete desativado C14 (b) C10 (c) · atendimento mais novo C14 (c) · já convidado C13 C15 · bloqueado C16 (a) · pausado C16 (b) | - |
| rodada sem convite (2) | desconectado C17 · suspensa C17 | - |
| `kind` da mensagem (2) | `question` C1 · `invite` C13 | - |
| falhas da rotina (3) | envio da pergunta C7 · envio do convite C18 · barbearia C19 | - |
| restrições do door 1 (8) | pergunta única C22 (d) C4 C32 · convite único C22 (e) C32 · registro só acrescentado C20 · `CHECK` do canal C22 (a) · FK com tenant C22 (b) · mudança com tenant C22 (c) · concorrência no registro C21 · migration C22 (f) | - |
| `return_reminder_messages_total` (4) | `question`/`sent` C24 · `question`/`failed` C24 · `invite`/`sent` C24 · `invite`/`failed` C24 | - |
| `return_reminder_opt_in_changes_total` (2) | `true` C24 C25 · `false` C24 | - |
| one-way doors do plano (3) | door 1 C20 C21 C22 · door 2 C28 · door 3 C29 | - |
| CAs da história (5) | CA-25.1 C1 C30 · CA-25.2 C13 C31 · CA-25.3 C10 C30 · CA-25.4 C14 (b) C31 · CA-25.5 C20 C30 | - |
| startup config: rotina registrada (1 assembly) | `AppModule` C29 | - |

- Claims naming a route or response shape: C27 (documento OpenAPI gerado), C30 (webhook) e C25 (`GET /metrics`) - cada um tem uma prova que atravessa a borda
- Nenhum outro check afirma mais que os casos que a própria prova exercita; os conjuntos acima listam cada membro com sua prova
- Surface do plano: `None`; nenhuma rota muda de status

## Swept

- validation: C28 - resposta do modelo sem `returnReminder` ou com valor fora do enum é rejeitada pelo schema Zod; `returnReminderDays` já é validado de 7 a 365 (US-06)
- failure modes: C7 e C18 (envio falha, reivindicação mantida sem reenvio), C19 (falha de uma barbearia não para a rodada), C2 (e) (agendamento sem cliente não quebra a rodada)
- idempotency: C4, C13 e C15 - pergunta e convite reivindicados antes do envio e nunca reenviados; C11 - pedir o valor atual não grava; existing - mensagem reentregue do webhook respondida uma vez (US-15 door 3)
- authorization: existing - webhook autenticado pelo segredo compartilhado (AD-011); nenhuma rota de painel nova; C22 (b) (c) - tenant no registro e na mudança
- concurrency: C32 - duas rodadas simultâneas enviam 1 pergunta e 1 convite; C21 - duas mudanças simultâneas gravam 1 registro
- data lifecycle: C20 - registros só acrescentados; retenção e exclusão fora do escopo (plano, Out of scope); C22 (f) - migration reversível; existing - colunas novas nulas, sem backfill (plano, Impact)
- dependency failure: C7 e C18 (WhatsApp falha no envio), C6 e C17 (WhatsApp desconectado); existing - Gemini indisponível responde como na US-15
- state transitions: C9, C10, C11 - transições do opt-in; C3 (b) e C22 (d) - a pergunta não volta a ser feita
- observability: C24, C25 (métricas), C26 (log da rodada sem dados pessoais)

## Handoff

- S1-S5 tocam o roteamento do bot, o intérprete, os repositórios de cliente, agendamento e agenda e uma rotina nova no molde da US-19: `wc -c` dos 22 arquivos existentes mais tocados = 239 KB ≈ 60k tokens; arquivos novos (use cases, specs, metrics, migration, entidade ORM, job, e2e) ≈ 60 KB ≈ 15k; 16 arquivos com fixtures de interpretação, edição de uma linha cada ≈ 15k; módulos ≈ 5k -> ≈ 95k, abaixo do budget de 150k - one builder
