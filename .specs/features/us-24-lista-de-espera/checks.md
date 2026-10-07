# US-24: Lista de espera checks

Profile: light
Plan: `.specs/features/us-24-lista-de-espera/plan.md`

32 checks em 6 fatias · 4 one-way doors · 0 open, 0 block

Um check concluído termina com ✅. Convenção das provas: todo teste cita o `CA` (ou o AC) e o id do check sob um `US-24` no nome, ex.: `it('US-24 CA-24.2 (C9): ...')`, porque os arquivos já têm checks de outras histórias com os mesmos ids. O seletor é `US-24.*\(Cn\)`.

- unitário: `npx jest <arquivo> -t "US-24.*\(Cn\)"`
- e2e: `npx jest --config ./test/jest-e2e.json <arquivo> -t "US-24.*\(Cn\)"` (Postgres do compose rodando)

Cenário-base dos unitários (`setupWhatsAppBooking`, terça 29/09 12:00 em São Paulo, antecedência de 60 min, `waitlistOfferMinutes` 15): Corte (R$ 45,00, 30 min), Barba (R$ 30,00, 20 min); João faz Corte e Barba, Pedro só Corte; cliente Carlos. Na rotina, Ana (entrou antes) e Bruno são clientes com inscrição para Corte, barbeiro `null`, 30/09 a 30/09, `afternoon`, salvo dito no check; o horário liberado é um agendamento de Corte com João, quarta 30/09 15:00, `cancelled`. O WhatsApp da barbearia está `connected` e ela não está suspensa.

Textos (Assumptions do plano):

- `PROPOSTA_SEMANA` = `Se preferir, posso te colocar na lista de espera para Corte à tarde até segunda-feira, 05/10 e te aviso se vagar um horário. Responda "lista de espera" para entrar.`
- `PROPOSTA_DIA` = `Se preferir, posso te colocar na lista de espera para Corte à tarde em quarta-feira, 30/09 e te aviso se vagar um horário. Responda "lista de espera" para entrar.`
- `INSCRITO` = `Pronto! Você está na lista de espera para Corte à tarde em quarta-feira, 30/09. Se vagar um horário, eu te aviso por aqui.`
- `OFERTA` = `Vagou um horário: Corte, quarta-feira, 30/09, às 15:00, com João (R$ 45,00, 30 min). Responda "sim" em até 15 min para agendar ou "não" para recusar.`
- `EXPIRADA` = `O prazo para aceitar esse horário acabou. Você continua na lista de espera.`
- `RECUSADA` = `Tudo bem, você continua na lista de espera.`

## Checks

### S1 - Entrar na lista de espera · 8 files · 250 KB · ~62k

**C1** - Com João bloqueado de 29/09 a 05/10, `{ bookingRequested, services: ['Corte'], barber: 'João', period: 'afternoon' }` recebe exatamente `Não encontrei horário livre para Corte até segunda-feira, 05/10.` + `\n\n` + `PROPOSTA_SEMANA`, e o rascunho fica com `waitlistProposal: { startsOn: '2026-09-29', endsOn: '2026-10-05', period: 'afternoon' }` (CA-24.1, AC 1)
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "US-24.*\(C1\)"` ✅

**C2** - Data pedida sem horário, com oferta de outros horários (AC 2), linha a linha, com a resposta terminando em `\n\n` + a proposta e o rascunho com a janela:
(a) 30/09 `afternoon` cheio para João -> termina em `PROPOSTA_DIA`; `{ startsOn: '2026-09-30', endsOn: '2026-09-30', period: 'afternoon' }`;
(b) `time: '15:00'` em 30/09 com a tarde cheia -> termina em `PROPOSTA_DIA`; mesma janela da (a);
(c) 30/09 sem turno, dia todo cheio -> termina em `... para Corte em quarta-feira, 30/09 e te aviso ...`; `period: null`
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "US-24.*\(C2\)"` ✅

**C3** - `prepare().interpreterInput`, linha a linha (AC 3): (a) rascunho com a proposta da C2 (a) -> `waitlistProposal: 'Corte à tarde em quarta-feira, 30/09'`; (b) sem rascunho -> `null`; (c) rascunho com oferta comum da US-17 -> `null` e `waitlistOffer: false`; (d) rascunho com `waitlistOfferId` -> `waitlistOffer: true`
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "US-24.*\(C3\)"` ✅

**C4** - Com a proposta da C2 (a) em vigor, `{ waitlistAccepted: true }` grava uma inscrição de Carlos com `serviceIds: ['corte']`, `barberId: 'joao'`, `startsOn: '2026-09-30'`, `endsOn: '2026-09-30'`, `period: 'afternoon'` e `createdAt` = agora; o rascunho fica `null`; a resposta é exatamente `INSCRITO`. Com "tanto faz" no rascunho, `barberId` é `null` (CA-24.1, AC 4)
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "US-24.*\(C4\)"` ✅

**C5** - Carlos entra na fila às 12:00 e, às 12:10, entra de novo com outra janela: a barbearia tem 1 inscrição de Carlos, com a janela nova e `createdAt` 12:10 (AC 5)
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "US-24.*\(C5\)"` ✅

**C6** - Sem proposta em vigor (sem rascunho, e com rascunho de oferta comum), `{ waitlistAccepted: true }` não grava inscrição e responde como a US-17 responderia ao mesmo rascunho (sem rascunho: `Qual serviço você quer agendar? Temos: Barba, Corte, Pigmentação.`) (AC 6)
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "US-24.*\(C6\)"` ✅

**C7** - Remarcação de um agendamento de Corte com João com a semana toda bloqueada recebe `Não encontrei horário livre para Corte até segunda-feira, 05/10.` sem a proposta, e o rascunho fica com `waitlistProposal: null` (AC 7)
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "US-24.*\(C7\)"` ✅

**C8** - No `AnswerClientQuestionUseCase`, linha a linha (AC 8): (a) `waitlistAccepted: true` sem `bookingRequested` chama o agendamento e envia a resposta dele; (b) idem com `offerDeclined: true`; (c) `waitlistAccepted: true` com `humanRequested: true` transfere com motivo `requested`, sem chamar o agendamento; (d) `offerDeclined: true` com `offTopic: true` envia a recusa da US-15, sem chamar o agendamento
Proof: `npx jest src/usecases/answer-client-question/answer-client-question.use-case.spec.ts -t "US-24.*\(C8\)"` ✅

### S2 - Oferta ao primeiro compatível · 9 files · 120 KB · ~30k

**C9** - Uma rodada com Ana e Bruno compatíveis grava 1 oferta, de Ana, `pending`, para `appointmentId` do cancelado, barbeiro `joao`, início 30/09 15:00 e `expiresAt` = agora + 15 min; com `waitlistOfferMinutes` 30, `expiresAt` = agora + 30 min. Fontes que não geram oferta: agendamento `confirmed` no mesmo horário, agendamento `cancelled` com início antes de agora, agendamento `cancelled` de outra barbearia (CA-24.2, RN-15, RN-16, AC 9, AC 11)
Proof: `npx jest src/usecases/process-waitlist/process-waitlist.use-case.spec.ts -t "US-24.*\(C9\)"` ✅

**C10** - Compatibilidade, linha a linha, só com a inscrição de Ana (AC 10): (a) barbeiro `pedro` -> sem oferta; (b) barbeiro `null` -> oferta; (c) janela 01/10 a 01/10 -> sem oferta; (d) `period: 'morning'` -> sem oferta; (e) `period: null` -> oferta; (f) serviços Corte + Barba (50 min) com João ocupado das 15:30 às 16:00 -> sem oferta; (g) com um serviço da inscrição inativo -> sem oferta, sem erro na rodada, e a inscrição continua
Proof: `npx jest src/usecases/process-waitlist/process-waitlist.use-case.spec.ts -t "US-24.*\(C10\)"` ✅

**C11** - Depois da oferta a Ana, o rascunho dela tem `action: 'book'`, `serviceIds: ['corte']`, `barberId: null`, `anyBarber: true`, `date: '2026-09-30'`, `period: 'afternoon'`, `offer: [{ barberId: 'joao', startsAt: 30/09 15:00 }]` e `waitlistOfferId` = id da oferta, e o conector recebeu exatamente `OFERTA` para o telefone de Ana, uma vez (AC 11)
Proof: `npx jest src/usecases/process-waitlist/process-waitlist.use-case.spec.ts -t "US-24.*\(C11\)"` ✅

**C12** - Com o horário liberado hoje às 12:30 (agora 12:00, antecedência 60 min) e Ana e Bruno com janela de hoje à tarde, nenhuma oferta é gravada e nada é enviado (CA-24.5, AC 12)
Proof: `npx jest src/usecases/process-waitlist/process-waitlist.use-case.spec.ts -t "US-24.*\(C12\)"` ✅

**C13** - Linha a linha (AC 13): (a) Ana com 2 faltas (limite 2) -> a oferta vai para Bruno, sem oferta gravada para Ana; (b) conversa de Ana pausada -> idem; (c) na rodada seguinte, com Ana desbloqueada e a oferta de Bruno pendente, Ana não recebe esse horário enquanto a de Bruno está pendente
Proof: `npx jest src/usecases/process-waitlist/process-waitlist.use-case.spec.ts -t "US-24.*\(C13\)"` ✅

**C14** - Duas rodadas ao mesmo tempo (`Promise.all` de dois `run()`) sobre o banco gravam 1 oferta `pending` e enviam 1 mensagem; e Ana, com dois horários liberados, recebe só 1 oferta pendente (AC 14, door 1)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-waitlist.e2e-spec.ts -t "US-24.*\(C14\)"` ✅

**C15** - Com o WhatsApp `disconnected`, e depois com a barbearia suspensa (teste vencido sem assinatura, AD-017), a rodada não grava oferta nem envia mensagem (AC 15)
Proof: `npx jest src/usecases/process-waitlist/process-waitlist.use-case.spec.ts -t "US-24.*\(C15\)"` ✅

**C16** - Com o conector falhando no envio, a oferta de Ana fica `pending` com o mesmo `expiresAt`, o resultado traz 1 falha de envio com `barbershopId` e o id da oferta, e uma segunda rodada antes de `expiresAt` não envia de novo (AC 16)
Proof: `npx jest src/usecases/process-waitlist/process-waitlist.use-case.spec.ts -t "US-24.*\(C16\)"` ✅

**C17** - Com a leitura da fila da barbearia A falhando, a rodada registra a falha de A no resultado e ainda oferta na barbearia B (AC 17)
Proof: `npx jest src/usecases/process-waitlist/process-waitlist.use-case.spec.ts -t "US-24.*\(C17\)"` ✅

### S3 - Aceitar a oferta · 3 files · 90 KB · ~23k

**C18** - Com a oferta de Carlos pendente, `{ choice: 1 }` antes de `expiresAt` aceita a oferta (conta `accepted`, C26), cria um agendamento `origin: 'bot'`, `confirmed`, Corte com João em 30/09 15:00, responde exatamente `Agendamento confirmado!\nServiço: Corte\nBarbeiro: João\nData: quarta-feira, 30/09\nHorário: 15:00\nValor: R$ 45,00\nEndereço: Rua das Flores, 123` e remove a inscrição de Carlos com as ofertas dela (door 1, cascata) (CA-24.3, AC 18)
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "US-24.*\(C18\)"` ✅

**C19** - Linha a linha (AC 19), sempre sem agendamento novo, com o rascunho `null`, a inscrição mantida e a resposta exatamente `EXPIRADA`: (a) `{ choice: 1 }` com o relógio em `expiresAt`; (b) a oferta já `declined`; (c) a oferta já `expired`
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "US-24.*\(C19\)"` ✅

**C20** - Com o horário das 15:00 de João ocupado por outro agendamento antes do aceite, `{ choice: 1 }` recebe `Esse horário acabou de ser ocupado.` + `\n\n` + uma oferta de Corte (formato da US-17) com os critérios da inscrição; a inscrição continua; e uma rodada seguinte, com o agendamento ocupante cancelado, não oferta esse agendamento liberado de novo a Carlos (AC 20)
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "US-24.*\(C20\)"` ✅

### S4 - Recusa e prazo passam a vez · 2 files · 70 KB · ~18k

**C21** - Com a oferta de Carlos pendente, `{ offerDeclined: true }` deixa a oferta `declined`, o rascunho `null`, a inscrição mantida e responde exatamente `RECUSADA` (CA-24.4, AC 21)
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "US-24.*\(C21\)"` ✅

**C22** - Com a oferta de Ana pendente, uma rodada com o relógio em `expiresAt` deixa a oferta de Ana `expired` e grava a oferta de Bruno `pending` na mesma rodada; uma rodada 1 min antes de `expiresAt` não muda nada (CA-24.4, AC 22)
Proof: `npx jest src/usecases/process-waitlist/process-waitlist.use-case.spec.ts -t "US-24.*\(C22\)"` ✅

**C23** - Depois de Ana recusar, a rodada oferta a Bruno, não a Ana; depois de a oferta de Bruno vencer, a rodada seguinte não grava nenhuma oferta e o `ListAvailableSlotsUseCase` ainda lista 30/09 15:00 com João (CA-24.4, AC 23, AC 24, Fluxo 9.3)
Proof: `npx jest src/usecases/process-waitlist/process-waitlist.use-case.spec.ts -t "US-24.*\(C23\)"` ✅

**C24** - Sem nenhuma inscrição compatível (só Ana, com barbeiro `pedro`), a rodada não grava oferta nem envia mensagem, e o horário continua listado pelo motor (AC 24)
Proof: `npx jest src/usecases/process-waitlist/process-waitlist.use-case.spec.ts -t "US-24.*\(C24\)"` ✅

### S5 - Inscrição vencida sai da fila · 2 files · 40 KB · ~10k

**C25** - Limites do fim do período, linha a linha (AC 25), com inscrições de 29/09: `morning` continua às 11:59 e sai às 12:00; `afternoon` continua às 17:59 e sai às 18:00; `evening` e `null` continuam às 23:59 de 29/09 e saem às 00:00 de 30/09; uma janela 29/09 a 30/09 `afternoon` continua às 18:00 de 29/09; a remoção acontece também com o WhatsApp `disconnected` e com a barbearia suspensa (CA-24.6, RN-17)
Proof: `npx jest src/usecases/process-waitlist/process-waitlist.use-case.spec.ts -t "US-24.*\(C25\)"` ✅

### S6 - Observabilidade, documentação, doors e ponta a ponta · 10 files · 160 KB · ~40k

**C26** - Métricas, linha a linha (AC 26): entrar conta `joined`; a inscrição vencida conta `expired`; o aceite que agenda conta `booked`; ofertas contam `sent`, `send_failed`, `accepted`, `declined`, `expired`; e `GET /metrics` traz `waitlist_entries_total` e `waitlist_offers_total` só com os labels `event` e `outcome`
Proof: `npx jest src/usecases/process-waitlist/process-waitlist.use-case.spec.ts -t "US-24.*\(C26\)"` ✅
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "US-24.*\(C26\)"` ✅
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-waitlist.e2e-spec.ts -t "US-24.*\(C26\)"` ✅

**C27** - O log de fim de rodada do `WaitlistJob` traz as contagens (`offered`, `sendFailed`, `expiredOffers`, `removedEntries`, `failedBarbershops`) e não traz telefone nem nome de cliente; uma falha de envio é logada com `barbershopId` e o id da oferta (AC 26)
Proof: `npx jest src/infrastructure/jobs/waitlist.job.spec.ts -t "US-24.*\(C27\)"` ✅

**C28** - A descrição do webhook `POST /webhooks/whatsapp/evolution` no documento OpenAPI gerado contém `US-24` (AC 27)
Proof: `npx jest --config ./test/jest-e2e.json test/api-docs.e2e-spec.ts -t "US-24.*\(C28\)"` ✅

**C29** - Door 1 no banco: (a) uma segunda inscrição do mesmo cliente na barbearia substitui a primeira; (b) uma segunda oferta `pending` para o mesmo agendamento não é gravada; (c) uma segunda oferta `pending` para a mesma inscrição não é gravada; (d) a mesma inscrição não recebe o mesmo agendamento duas vezes, mesmo com a primeira `declined`; (e) `status = 'other'` é recusado pelo `CHECK`; (f) remover a inscrição remove as ofertas dela; (g) a leitura da fila de uma barbearia não traz inscrições de outra (RN-26)
Proof: `npx jest --config ./test/jest-e2e.json test/database/typeorm-waitlist.repository.e2e-spec.ts -t "US-24.*\(C29\)"` ✅

**C30** - Door 2: o `GeminiMessageInterpreter` repassa `waitlistAccepted: true` e `offerDeclined: true`; uma resposta sem algum dos dois rejeita com `MessageInterpreterUnavailableError`; o schema de resposta exige os dois; a instrução traz a linha da proposta com `Corte à tarde em quarta-feira, 30/09` quando `waitlistProposal` tem valor e com `(nenhuma lista de espera proposta)` quando `null`, e a linha da oferta da lista de espera conforme `waitlistOffer`
Proof: `npx jest src/infrastructure/external/gemini/gemini-message-interpreter.spec.ts -t "US-24.*\(C30\)"` ✅

**C31** - Door 3: `saveDraft` seguido de `findDraft` devolve `waitlistProposal` e `waitlistOfferId` iguais aos gravados, e um `booking_draft` gravado sem os campos é lido com os dois `null`
Proof: `npx jest --config ./test/jest-e2e.json test/database/typeorm-conversation.repository.e2e-spec.ts -t "US-24.*\(C31\)"` ✅

**C32** - Door 4 e ponta a ponta pelo webhook, com o banco: o `WaitlistJob` está registrado com `* * * * *` em `America/Sao_Paulo`; Carlos pede Corte com João à tarde de 30/09 com a tarde cheia e recebe a resposta terminando em `PROPOSTA_DIA`; responde com `waitlistAccepted` e recebe `INSCRITO`; outro cliente cancela pelo webhook o agendamento das 15:00; `run()` faz o conector receber exatamente a `OFERTA` (com João) para Carlos; `choice: 1` grava em `appointments` uma linha `origin = 'bot'`, `status = 'confirmed'` de Carlos às 15:00, `waitlist_offers_total{outcome="accepted"}` sobe 1, e nem `waitlist_entries` nem `waitlist_offers` têm linha de Carlos (CA-24.1, CA-24.2, CA-24.3)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-waitlist.e2e-spec.ts -t "US-24.*\(C32\)"` ✅

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| quando o bot propõe a fila (4) | nada em 7 dias C1 · data com turno C2 (a) · hora ocupada C2 (b) · data sem turno C2 (c) | - |
| ação do rascunho ao propor (2) | `book` C1 C2 · `reschedule` C7 | - |
| `waitlistAccepted` (2) | com proposta C4 · sem proposta C6 | - |
| entrada do intérprete (4) | `waitlistProposal` com valor C3 (a) · `null` C3 (b) C3 (c) · `waitlistOffer` true C3 (d) · false C3 (c) | - |
| precedência no roteamento (4) | `waitlistAccepted` sozinho C8 (a) · `offerDeclined` sozinho C8 (b) · `humanRequested` C8 (c) · `offTopic` C8 (d) | - |
| fonte do horário liberado (4) | `cancelled` futuro C9 · `confirmed` C9 · `cancelled` passado C9 · outra barbearia C9 | - |
| compatibilidade, AC 10 (7) | barbeiro outro C10 (a) · barbeiro `null` C10 (b) · fora da janela C10 (c) · turno outro C10 (d) · sem turno C10 (e) · duração não cabe C10 (f) · serviço inativo C10 (g) | - |
| ordem da fila (2) | ordem de entrada C9 · pula já ofertada C23 | - |
| inscrição pulada na rodada (3) | bloqueado C13 (a) · pausado C13 (b) · com oferta pendente C13 (c) | - |
| rodada sem oferta (3) | WhatsApp desconectado C15 · suspensa C15 · antecedência mínima C12 | - |
| `waitlist_offers.status` transições (4) | nada -> `pending` C9 · `pending` -> `accepted` C18 C26 · `pending` -> `declined` C21 · `pending` -> `expired` C22 | - |
| aceite da oferta (4) | dentro do prazo C18 · no prazo exato C19 (a) · já `declined` C19 (b) · já `expired` C19 (c) | - |
| horário ocupado no aceite (1) | C20 | - |
| fim do período, AC 25 (5) | `morning` C25 · `afternoon` C25 · `evening` C25 · `null` C25 · janela de vários dias C25 | - |
| `waitlist_entries_total{event}` (3) | `joined` C26 · `expired` C26 · `booked` C26 | - |
| `waitlist_offers_total{outcome}` (5) | `sent` C26 · `send_failed` C26 · `accepted` C26 · `declined` C26 · `expired` C26 | - |
| restrições do door 1 (7) | inscrição única C29 (a) C5 · pendente por agendamento C29 (b) C14 · pendente por inscrição C29 (c) C14 · agendamento uma vez por inscrição C29 (d) · `CHECK` do status C29 (e) · cascata C29 (f) · tenant C29 (g) | - |
| one-way doors do plano (4) | door 1 C29 · door 2 C30 · door 3 C31 · door 4 C32 | - |
| CAs da história (6) | CA-24.1 C1 C2 C4 C32 · CA-24.2 C9 C32 · CA-24.3 C18 C32 · CA-24.4 C21 C22 C23 · CA-24.5 C12 · CA-24.6 C25 | - |

- Claims naming a route or response shape: C28 (documento OpenAPI gerado), C32 (webhook) e C26 (`GET /metrics`) - cada um tem uma prova que atravessa a borda
- Nenhum outro check afirma mais que os casos que a própria prova exercita; os conjuntos acima listam cada membro com sua prova
- Surface do plano: `None`; nenhuma rota muda de status

## Swept

- validation: C30 - resposta do modelo sem `waitlistAccepted` ou `offerDeclined` é rejeitada pelo schema Zod; C31 - rascunho ilegível conta como sem proposta (AD-013)
- failure modes: C16 (envio falha, oferta fica pendente sem reenvio), C17 (falha de uma barbearia não para a rodada), C10 (g) (inscrição com serviço inativo não quebra a rodada)
- idempotency: C16 - a oferta é gravada antes do envio e nunca reenviada; existing - mensagem reentregue do webhook respondida uma vez (US-15 door 3)
- authorization: existing - webhook autenticado pelo segredo compartilhado (AD-011); nenhuma rota de painel nova; toda leitura e gravação da fila pelo tenant, C29 (g)
- concurrency: C14 - duas rodadas simultâneas gravam e enviam uma oferta (índices parciais únicos); C19 (a) - aceite no prazo exato não agenda; existing - só um `consumeDraft` agenda a partir de uma oferta (AD-013)
- data lifecycle: C25 - inscrição removida ao fim do período; C18 - removida ao agendar; C29 (f) - ofertas vão com a inscrição; C31 - rascunho antigo lido com `null`
- dependency failure: C16 (WhatsApp falha no envio), C15 (WhatsApp desconectado); existing - Gemini indisponível responde como na US-15 (US-17 AC 38)
- state transitions: C9, C18, C21, C22 - transições de `waitlist_offers.status`; C19 (b) (c) - estado final não volta
- observability: C26 (métricas), C27 (log da rodada sem dados pessoais)

## Handoff

- S1-S6 tocam o agendamento pelo WhatsApp, o intérprete, o repositório da conversa e uma rotina nova no molde da US-19: `wc -c` dos 17 arquivos existentes mais tocados = 254 KB ≈ 63k tokens; arquivos novos (use case, spec, repositório, entidades, migration, job, e2e) ≈ 60 KB ≈ 15k; ~15 fixtures de interpretação com edição de uma linha ≈ 20k; módulos e métricas ≈ 10k -> ≈ 108k, abaixo do budget de 150k - one builder
- **Settled mid-build:** (1) C18 e C32 não podem ver a oferta `accepted` depois que a inscrição sai, porque o door 1 apaga as ofertas junto (cascata); o usuário escolheu manter a cascata e provar o aceite pela métrica `accepted` e pela ausência da inscrição e das ofertas. (2) O literal da C6 trazia o catálogo fora da ordem da US-17 (alfabética); corrigido para `Barba, Corte, Pigmentação`, com a afirmação ("responde como a US-17") intacta.
