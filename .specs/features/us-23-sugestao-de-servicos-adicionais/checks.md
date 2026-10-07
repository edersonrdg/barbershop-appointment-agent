# US-23: Sugestão de serviços adicionais checks

Profile: light
Plan: `.specs/features/us-23-sugestao-de-servicos-adicionais/plan.md`

21 checks em 4 fatias · 2 one-way doors · 0 open, 0 block

Um check concluído termina com ✅. Convenção das provas: todo teste cita o `CA` (ou o AC) e o id do check sob um `US-23` no nome, ex.: `it('US-23 CA-23.1 (C1): ...')`, porque os arquivos já têm checks de outras histórias com os mesmos ids. O seletor é `US-23.*\(Cn\)`.

- unitário: `npx jest <arquivo> -t "US-23.*\(Cn\)"`
- e2e: `npx jest --config ./test/jest-e2e.json <arquivo> -t "US-23.*\(Cn\)"` (Postgres do compose rodando)

Cenário-base dos unitários (`setupWhatsAppBooking`, terça 29/09 12:00 em São Paulo, antecedência de 60 min): Corte (R$ 45,00, 30 min), Barba (R$ 30,00, 20 min), Pigmentação (que ninguém faz), Hidratação (inativa); João faz Corte e Barba, Pedro só Corte. Salvo dito no check, Corte tem `suggestedAddOnIds: ['barba']`, e o pedido é `JOAO_AFTERNOON` (Corte, João, amanhã 30/09, tarde). `SUGESTAO` é o texto `Quer incluir Barba por +R$ 30,00? Responda "sim" para incluir ou "não" para seguir só com Corte.`

## Checks

### S1 - O bot sugere o adicional uma vez · 6 files · 120 KB · ~30k

**C1** - Com Barba como adicional de Corte, o pedido `JOAO_AFTERNOON` recebe exatamente `SUGESTAO` e o `ListAvailableSlotsUseCase` não é chamado nessa mensagem (0 chamadas) (CA-23.1, AC 1)
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "US-23.*\(C1\)"` ✅

**C2** - O adicional sugerido é o primeiro sugerível, linha a linha (AC 2), com o texto completo de cada linha:
(a) Corte com `[hidratacao, barba]` -> sugere Barba (inativo pulado);
(b) pedido `['Corte', 'Barba']` com Corte `[barba]` -> nenhuma sugestão, oferta `Horários para Corte + Barba (R$ 75,00, 50 min):`;
(c) Corte com `[pigmentacao, barba]` -> sugere Barba (sem barbeiro apto pulado);
(d) pedido com `barber: 'Pedro'` e Corte `[barba]` -> nenhuma sugestão, oferta de Corte com Pedro;
(e) pedido com `anyBarber: true` e Corte `[barba]` -> sugere Barba;
(f) Corte com `[lavagem, sobrancelha]` (os dois feitos por João) -> sugere Lavagem (ordem cadastrada);
(g) pedido `['Barba', 'Corte']` com Barba `[sobrancelha]` e Corte `[lavagem]` -> sugere Sobrancelha (ordem dos serviços do pedido)
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "US-23.*\(C2\)"` ✅

**C3** - Depois de `SUGESTAO`, o rascunho tem `addOnSuggestion: { serviceId: 'barba', pending: true }`, `serviceIds: ['corte']`, `barberId: 'joao'`, `date: '2026-09-30'`, `period: 'afternoon'` e `offer: []` (AC 3)
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "US-23.*\(C3\)"` ✅

**C4** - Sem adicional sugerível o pedido `JOAO_AFTERNOON` recebe exatamente a oferta da US-17 (`Horários para Corte (R$ 45,00, 30 min):` com 12:00, 12:30 e 13:00 de quarta com João), tanto com Corte sem adicionais quanto com Corte `[hidratacao]` (só inativo), e o rascunho fica com `addOnSuggestion: null` (CA-23.4, AC 4)
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "US-23.*\(C4\)"` ✅

**C5** - Com `addOnSuggestion` diferente de `null` nenhuma sugestão volta (AC 5), com a resposta exata de cada caso:
(a) aceito Barba, com Barba `[sobrancelha]` -> a resposta é a oferta de Corte + Barba, sem sugerir Sobrancelha;
(b) recusado e, em seguida, `{ date: '2026-10-01' }` -> oferta de Corte de quinta 01/10, sem `SUGESTAO`;
(c) recusado, oferta mostrada, horário 1 ocupado por outro agendamento e `choice: 1` -> `Esse horário acabou de ser ocupado.` seguido de nova oferta de Corte, sem `SUGESTAO`
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "US-23.*\(C5\)"` ✅

**C6** - Um cliente com um agendamento de Corte (amanhã 15:00, João) que pede `rescheduleRequested: true` recebe a oferta de Corte para o novo horário, sem `SUGESTAO`, mesmo com Corte `[barba]` (AC 6)
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "US-23.*\(C6\)"` ✅

**C7** - Um cliente com 2 faltas (limite 2) que pede `JOAO_AFTERNOON` com Corte `[barba]` recebe o desfecho `{ type: 'handoff', reason: 'blocked_client' }`, sem sugestão e sem rascunho gravado (AC 7)
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "US-23.*\(C7\)"` ✅

**C8** - `prepare().interpreterInput.suggestedAddOn` é `'Barba'` com a sugestão pendente, `null` sem rascunho e `null` depois da recusa (`pending: false`) (AC 8)
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "US-23.*\(C8\)"` ✅

### S2 - Aceitar soma o adicional · 4 files · 95 KB · ~24k

**C9** - Com a sugestão pendente, `{ addOnAccepted: true }` recebe exatamente `Horários para Corte + Barba (R$ 75,00, 50 min):` com 12:00, 12:30 e 13:00 de quarta com João, e o rascunho fica com `serviceIds: ['corte', 'barba']` e `addOnSuggestion: { serviceId: 'barba', pending: false }` (CA-23.2, AC 9)
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "US-23.*\(C9\)"` ✅

**C10** - Pedido `{ services: ['Corte'], date: '2026-09-30' }` sem barbeiro recebe `SUGESTAO`; o aceite recebe exatamente `Tem preferência de barbeiro? Fazem Corte + Barba: João. Se não tiver, responda "tanto faz".` (AC 9)
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "US-23.*\(C10\)"` ✅

**C11** - Com a sugestão pendente, `{ services: ['Barba'] }` com `addOnAccepted: false` recebe a mesma oferta do C9 e o rascunho fica com `serviceIds: ['corte', 'barba']` (AC 10)
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "US-23.*\(C11\)"` ✅

**C12** - Depois do aceite, toda chamada ao `ListAvailableSlotsUseCase` recebe `serviceIds: ['corte', 'barba']` (CA-23.2, AC 11)
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "US-23.*\(C12\)"` ✅

**C13** - Depois do aceite, `choice: 1` cria um agendamento com `serviceIds: ['corte', 'barba']`, início quarta 12:00 e fim 50 min depois, e o resumo é exatamente `Agendamento confirmado!\nServiços: Corte, Barba\nBarbeiro: João\nData: quarta-feira, 30/09\nHorário: 12:00\nValor: R$ 75,00\nEndereço: Rua das Flores, 123` (CA-23.2, AC 12)
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "US-23.*\(C13\)"` ✅

**C14** - Com a sugestão pendente, `{ addOnAccepted: true, date: '2026-10-01' }` recebe exatamente a oferta de Corte + Barba com 12:00, 12:30 e 13:00 de quinta 01/10 com João (AC 13)
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "US-23.*\(C14\)"` ✅

**C15** - No `AnswerClientQuestionUseCase`, linha a linha (AC 14): (a) `addOnAccepted: true` com `bookingRequested: false` chama o agendamento e envia a resposta dele; (b) `addOnAccepted: true` com `humanRequested: true` transfere com motivo `requested`, sem chamar o agendamento; (c) `addOnAccepted: true` com `offTopic: true` envia a recusa da US-15, sem chamar o agendamento
Proof: `npx jest src/usecases/answer-client-question/answer-client-question.use-case.spec.ts -t "US-23.*\(C15\)"` ✅

### S3 - Recusar não insiste · 1 file · 35 KB · ~9k

**C16** - Com a sugestão pendente, `{ bookingRequested: true }` sem aceite recebe exatamente a oferta de Corte (12:00, 12:30 e 13:00 de quarta com João), e o rascunho fica com `serviceIds: ['corte']` e `addOnSuggestion: { serviceId: 'barba', pending: false }` (CA-23.3, AC 15)
Proof: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts -t "US-23.*\(C16\)"` ✅

### S4 - Documentação, doors e ponta a ponta · 7 files · 110 KB · ~28k

**C17** - A descrição do webhook `POST /webhooks/whatsapp/evolution` no documento OpenAPI gerado contém `US-23` (AC 16)
Proof: `npx jest --config ./test/jest-e2e.json test/api-docs.e2e-spec.ts -t "US-23.*\(C17\)"` ✅

**C18** - Door 1: o `GeminiMessageInterpreter` repassa `addOnAccepted: true`; uma resposta sem `addOnAccepted` rejeita com `MessageInterpreterUnavailableError`; o schema de resposta exige `addOnAccepted`; a instrução traz `Serviço adicional sugerido ao cliente na mensagem anterior:` seguido de `Barba` quando `suggestedAddOn: 'Barba'`, e de `(nenhum serviço adicional sugerido)` quando `null`
Proof: `npx jest src/infrastructure/external/gemini/gemini-message-interpreter.spec.ts -t "US-23.*\(C18\)"` ✅

**C19** - Door 2: `saveDraft` seguido de `findDraft` devolve `addOnSuggestion: { serviceId, pending: true }` igual ao gravado, e um `booking_draft` gravado sem o campo é lido com `addOnSuggestion: null`
Proof: `npx jest --config ./test/jest-e2e.json test/database/typeorm-conversation.repository.e2e-spec.ts -t "US-23.*\(C19\)"` ✅

**C20** - Pelo webhook, com Barba como adicional de Corte no banco: o pedido faz o conector receber exatamente `SUGESTAO`; `addOnAccepted: true` faz receber a oferta `Horários para Corte + Barba (R$ 75,00, 50 min):` …; `choice: 1` grava em `appointments` uma linha `origin = 'bot'`, `status = 'confirmed'` com os serviços Corte e Barba e 50 min de duração (CA-23.1, CA-23.2)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-booking.e2e-spec.ts -t "US-23.*\(C20\)"` ✅

**C21** - A sugestão é enviada com `kind: 'booking'`, conta `whatsapp_replies_total{kind="booking"}` e zera a contagem de falhas: depois de 1 falha, a mensagem que recebe `SUGESTAO` deixa `consecutive_failures` em 0 (Assumptions, contagem da resposta)
Proof: `npx jest src/usecases/answer-client-question/answer-client-question.use-case.spec.ts -t "US-23.*\(C21\)"` ✅

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| regra do adicional sugerível, AC 2 (7) | inativo pulado C2 (a) · já no pedido C2 (b) · sem barbeiro apto C2 (c) · barbeiro pedido não faz C2 (d) · sem barbeiro pedido basta um apto C2 (e) · ordem cadastrada C2 (f) · ordem dos serviços do pedido C2 (g) | - |
| estado da sugestão no rascunho (3) | `null` -> sugere C1 C3 · `pending: true` -> responde C9 C16 · `pending: false` -> não sugere C5 | - |
| resposta à sugestão pendente (3) | `addOnAccepted` C9 · nome do adicional em `services` C11 · outra resposta C16 | - |
| próximo passo depois da resposta (2) | pergunta de barbeiro C10 · oferta C9 C16 | - |
| "uma única vez" (3 contextos) | depois do aceite C5 (a) · depois da recusa C5 (b) · nova busca por horário ocupado C5 (c) | - |
| ação do rascunho (2) | `book` C1 · `reschedule` C6 | - |
| precedência no roteamento (3) | `humanRequested` C15 (b) · `offTopic` C15 (c) · `addOnAccepted` sozinho C15 (a) | - |
| `suggestedAddOn` na entrada do intérprete (3) | pendente C8 · sem rascunho C8 · respondida C8 | - |
| one-way doors do plano (2) | door 1 C18 · door 2 C19 | - |
| CAs da história (4) | CA-23.1 C1 C20 · CA-23.2 C9 C12 C13 C20 · CA-23.3 C16 · CA-23.4 C4 | - |

- Claims naming a route or response shape: C17 (documento OpenAPI gerado) e C20 (webhook) - cada um tem uma prova que atravessa a borda
- Nenhum outro check afirma mais que os casos que a própria prova exercita; os conjuntos acima listam cada membro com sua prova
- Surface do plano: `None`; nenhuma rota muda de status

## Swept

- validation: C18 - resposta do modelo sem `addOnAccepted` é rejeitada pelo schema Zod
- failure modes: existing - intérprete indisponível mantém o rascunho e a contagem de falhas (US-17 AC 38); a sugestão pendente vive no rascunho
- idempotency: existing - a reivindicação da mensagem do webhook (US-15 door 3) responde uma mensagem reentregue uma vez só
- authorization: existing - webhook autenticado pelo segredo compartilhado (AD-011); nenhuma rota de painel nova
- concurrency: n/a - responder à sugestão não grava agendamento; duas respostas simultâneas só sobrescrevem o rascunho, e o único caminho que agenda continua sendo o `consumeDraft` (AD-013, US-17 C21)
- data lifecycle: C19 - rascunho gravado antes da US-23 é lido como sem sugestão; a sugestão some com o rascunho (agendar, pausar, vencer)
- dependency failure: existing - US-17 AC 38 (Gemini indisponível responde como na US-15)
- state transitions: C3 (nada -> pendente), C9 e C16 (pendente -> respondida), C5 (respondida não volta)
- observability: C21 - sugestão contada como `kind="booking"` sem label nova

## Handoff

- S1-S4 tocam os mesmos módulos (agendamento pelo WhatsApp, port e adaptador do intérprete, repositório da conversa, fixtures): `wc -c` dos 17 arquivos principais = 221 KB ≈ 55k tokens, mais ~10 fixtures de interpretação com edição de uma linha (≈ 20k) -> ≈ 75k, abaixo do budget de 150k - one builder
