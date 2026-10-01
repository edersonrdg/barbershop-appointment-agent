# US-18: Remarcação e cancelamento pelo WhatsApp

## Problem

Hoje, depois de agendar pelo WhatsApp (US-17), o único jeito de um cliente desmarcar ou trocar um horário é ligar ou ir até a barbearia — o bot não processa esse pedido (RF-04 ainda não implementado). Quando um imprevisto aparece perto do horário, a barbearia só descobre se o cliente aparecer ou não; sem um jeito de desmarcar, o horário fica reservado para ninguém até alguém da equipe perceber e liberar na mão. A fila de espera da US-24 também vai depender de saber quando um horário é liberado — hoje nada registra esse fato.

Com a entrega, o cliente escreve "quero cancelar" ou "quero remarcar" no WhatsApp, o bot acha o agendamento certo (perguntando qual, se houver mais de um), cancela com confirmação ou busca um novo horário como num agendamento normal, e só transfere para a equipe quando o pedido chega com menos de 2h de antecedência (RN-09, configurável).

## Flow

Reaproveita o webhook, a conversa e a desambiguação de intenção da US-15/US-16/US-17 (`AnswerClientQuestionUseCase`); localizar os agendamentos do cliente usa o `ScheduleQuery` da US-12, e a busca de um novo horário e a gravação do agendamento reaproveitam o `ListAvailableSlotsUseCase` e o `BookAppointmentUseCase` da US-07/US-17, com origem `bot`. Nenhuma regra de agenda é reescrita.

1. `POST /webhooks/whatsapp/evolution` com `messages.upsert` -> `EvolutionWebhookController` (exists) - sem mudança até chamar `AnswerClientQuestionUseCase`
2. `AnswerClientQuestionUseCase` (exists) - reivindica a mensagem e entra na conversa como hoje; pede ao `BookViaWhatsAppUseCase` (exists, estendido) o rascunho em vigor (door 2) e os rótulos a mandar ao intérprete (opções de horário e, agora, agendamentos candidatos)
3. `GeminiMessageInterpreter` (exists, estendido) - devolve `cancelRequested` e `rescheduleRequested` além do que já devolve (door 1 da US-17, ampliada)
4. mesmo use case - pedido de atendente transfere (US-16) e assunto fora de contexto recusa (US-15), como hoje; com `cancelRequested`, `rescheduleRequested` ou `choice`, delega a `BookViaWhatsAppUseCase` (exists, estendido)
5. `BookViaWhatsAppUseCase` - sem alvo resolvido, busca os agendamentos futuros do cliente em `ScheduleQuery.listForClient` (exists, filtrado a `confirmed` e início depois de agora); zero, um ou mais de um decide como no S1 da seção Criteria; mais de um grava os candidatos no rascunho (door 2)
6. mesmo use case - com o alvo resolvido, confere o prazo (`cancellationDeadlineMinutes`, RN-09) contra o início do agendamento; fora do prazo, devolve o pedido de transferência com motivo `late_cancellation` (door 3) para o `AnswerClientQuestionUseCase` (exists, estendido); dentro do prazo, cancelar chama `Appointment.cancel` (new method) e persiste via `AppointmentRepository.saveStatus` (exists); remarcar busca no `ListAvailableSlotsUseCase` (exists) como um agendamento novo, com os serviços e o barbeiro do agendamento alvo por padrão
7. mesmo use case - escolher uma opção de remarcação chama `BookAppointmentUseCase` (exists, origem `bot`, cliente existente) e só com sucesso marca o agendamento antigo como `cancelled` (CA-18.3); conflito ou antecedência mínima vencida volta ao passo 6 com o aviso (mesmo padrão do S3/S4 da US-17)
8. out: `WhatsAppConnector.sendText` (exists) com a pergunta, a confirmação de cancelamento ou de remarcação; o webhook responde `204` em todos os casos; a agenda do painel (US-08, `GET /appointments`) e o perfil do cliente (US-12, `GET /clients/:id`) mostram o novo status `cancelled` sem mudança de código, porque nenhuma das duas listagens filtra por status hoje

## Impact

| Front | What changes |
| --- | --- |
| domain | termo novo: agendamentos futuros candidatos a cancelar/remarcar - a lista que o bot mostra quando o cliente tem mais de um; vive só no rascunho da conversa (door 2) |
| domain | existente: `AppointmentStatus` (US-11) ganha `cancelled`. Quem ramifica hoje: `SLOT_HOLDING_STATUSES` (não lista `cancelled`, então o horário já sai livre sem mudança nele), `Appointment.markAttendance` (hoje não valida o status atual antes de trocar — ganha a guarda do AC 24), os schemas dos presenters que listam agendamentos |
| domain | existente: rascunho de agendamento (`BookingDraft`, AD-013, mesma coluna `booking_draft`) ganha `action`, `candidates` e `targetAppointmentId` (door 2). Quem ramifica: `BookViaWhatsAppUseCase` e as fixtures de teste da US-17 |
| domain | existente: motivo de transferência (`HANDOFF_REASONS`) ganha `late_cancellation` (o comentário em `handoff-reason.ts` já previa isso desde a US-17). Quem ramifica: métrica `whatsapp_handoffs_total{reason}`, o presenter/schema da lista `waiting-human`, o CHECK do banco |
| domain | existente: interpretação da mensagem (US-15/16/17) ganha `cancelRequested` e `rescheduleRequested`; `MessageInterpreterInput` ganha `appointmentOptions`. Quem ramifica: `AnswerClientQuestionUseCase`, o schema Zod da resposta do Gemini, o `FakeMessageInterpreter` (padrão `false` e `[]`) |
| stored data | `appointments_status_check` ganha `cancelled`; a constraint de exclusão (`appointments_no_overlap`) continua só com `confirmed`, `attended`, `no_show` — nada a migrar, nenhuma linha usa `cancelled` ainda |
| stored data | `whatsapp_conversations.booking_draft` ganha os campos novos, ausentes nas linhas existentes; nada a migrar (o jsonb não é validado pelo banco, AD-013) |
| rota existente | `GET /appointments`, `GET /clients/:id`: `appointments[].status` passa a aceitar `cancelled` |
| rota existente | `GET /whatsapp/conversations/waiting-human`: `reason` passa a aceitar `late_cancellation` |
| rota existente | `PATCH /appointments/:id/status`: ganha a resposta de erro do AC 24 |
| testes existentes | as fixtures de interpretação da US-15/16/17 ganham os campos novos com os padrões; specs do `GetClientProfileUseCase` e do `MarkAttendanceUseCase` cobrem o novo status |

## Relations

`None - nenhuma entidade ou cardinalidade nova. A relação Appointment-Client já existe e não muda; o valor de status novo e o formato do rascunho são mudanças de schema, não de relação - ver Landing.`

## Surface

| Route | In | Out | Status |
| --- | --- | --- | --- |
| `GET /appointments` | sem mudança | `appointments[].status` passa a aceitar `cancelled` | `200`, `401`, `403` (sem mudança) |
| `GET /clients/:id` | sem mudança | mesmo campo `status`, reaproveitando o schema de `GET /appointments` | `200`, `401`, `403`, `404` (sem mudança) |
| `PATCH /appointments/:id/status` | sem mudança | sem mudança | ganha `409` (AC 24) |
| `GET /whatsapp/conversations/waiting-human` | sem mudança | `reason` passa a aceitar `late_cancellation` | `200`, `401`, `403` (sem mudança) |

## Landing

| One-way door | Literal shape | Alternative rejected |
| --- | --- | --- |
| 1. status `cancelled` do agendamento | Migration troca `appointments_status_check` por `CHECK (status IN ('confirmed','attended','no_show','cancelled'))`; `appointments_no_overlap` continua `WHERE (status IN ('confirmed','attended','no_show'))`, sem mudança literal. `AppointmentStatus` ganha `'cancelled'`; `Appointment` ganha `cancel(now)`, que lança quando o status atual não é `confirmed` (mesma guarda de `markAttendance`) | uma coluna `cancelled_at timestamptz null` ao lado de `status = 'confirmed'`: todo lugar que já olha `status` (`SLOT_HOLDING_STATUSES`, a constraint de exclusão, os presenters) passaria a precisar de uma segunda condição, em vez de um valor a mais no mesmo enum |
| 2. pedido de cancelar/remarcar no rascunho da conversa | `BookingDraft` (AD-013, mesma coluna `booking_draft`) ganha `action: 'book' \| 'cancel' \| 'reschedule'`, `candidates: { appointmentId: string; barberId: string; startsAt: Date }[]` (só enquanto desambigua qual agendamento) e `targetAppointmentId: string \| null` (o agendamento resolvido); os campos já existentes (`serviceIds`, `barberId`, `anyBarber`, `date`, `period`, `time`, `offer`) são reaproveitados sem mudança para a busca do novo horário da remarcação, uma vez que `targetAppointmentId` está definido. Toda gravação passa a declarar `action` (o fluxo de agendamento de hoje grava `action: 'book'`) | uma segunda coluna jsonb (`appointment_action_draft`): duplicaria o TTL de 60 min, a trava de consumo único e a limpeza ao pausar/retomar que a AD-012/AD-013 já escreveram para `booking_draft`; os dois tipos de rascunho nunca coexistem na mesma conversa |
| 3. motivo `late_cancellation` | `HANDOFF_REASONS` ganha `'late_cancellation'`; migration troca `whatsapp_conversations_pause_reason_check` por um CHECK que também aceita o valor novo, no mesmo padrão do `blocked_client` da US-17; o enum de `reason` em `waiting-human` ganha o valor | reusar `requested`: pelo mesmo motivo da US-17 rejeitar isso para `blocked_client` — a equipe precisa ver que o cliente bateu no prazo, não que pediu um atendente |
| 4. como o CA-18.5 ("evento horário liberado") se realiza agora | Nada novo é despachado. O fato é a própria transição de status para `cancelled` (porta 1): o agendamento mantém `barberId`, `startsAt`/`endsAt` e `serviceIds`, e no momento em que o status sai de `SLOT_HOLDING_STATUSES` o motor (US-07) já trata o horário como livre. A US-24, quando for construída, lê esse fato do jeito que todo job deste código já lê estado (AD-009: listar e varrer, sem barramento) | uma porta de notificação (`AppointmentReleaseNotifier`) com um adaptador vazio por enquanto: seria uma dependência sem nenhum consumidor hoje, exatamente o que o "mínimo estrutural" do CLAUDE.md não cobre fora de colunas de banco simples; AD-009 e AD-012 mostram que este código prefere ler o estado na hora de usar a manter um mecanismo de despacho aquecido para um assinante que ainda não existe |
| 5. limite de `choice` na interpretação (door 1 da US-17, ampliada; decidida com o usuário na derivação dos checks) | `MAX_CHOICE = 10` em `message-interpreter.port.ts`; o schema Zod e o JSON Schema mandado ao Gemini passam a `choice: int 1..10 \| null`; `MAX_OFFERED_SLOTS` continua 3 para horários; a lista de candidatos do AC 4 traz no máximo os 10 agendamentos futuros mais próximos. No C37 da US-17 o caso recusado `choice 4` vira `choice 11` (continua afirmando o limite) | manter `1..3` e listar só 3 candidatos: contraria o "listá-los" do AC 4 para quem tem 4 ou mais agendamentos futuros |

- Nada mais nesta mudança é difícil de reverter.

## Criteria

### S1: Agendamento futuro localizado e desambiguado (P1)

O bot acha os agendamentos futuros do cliente e, havendo mais de um, pergunta qual (CA-18.2).

**Acceptance Criteria**

1. WHEN a interpretação traz `cancelRequested: true` ou `rescheduleRequested: true` THEN o sistema SHALL buscar os agendamentos do cliente com status `confirmed` e início depois de agora, pelo `ScheduleQuery.listForClient` (RN-26)
2. IF a busca do AC 1 não encontra nenhum agendamento THEN o sistema SHALL responder "Você não tem nenhum agendamento futuro." e não iniciar rascunho
3. WHEN a busca do AC 1 encontra exatamente um agendamento THEN o sistema SHALL tratá-lo como o alvo direto, sem perguntar
4. WHEN a busca do AC 1 encontra mais de um agendamento THEN o sistema SHALL listá-los em ordem cronológica (serviço, dia da semana, data, hora, barbeiro), perguntar qual deles e gravar a lista como candidatos no rascunho da conversa (CA-18.2)
5. WHEN uma mensagem seguinte traz `choice` entre 1 e o número de candidatos em vigor THEN o sistema SHALL resolver o alvo como o candidato dessa posição
6. IF `choice` chega fora dos candidatos em vigor, ou sem candidatos pendentes THEN o sistema SHALL responder "Não encontrei essa opção." seguido da mesma lista
7. The candidatos e o alvo resolvido SHALL pertencer à barbearia e ao cliente da conversa (RN-26)

**Independent test:** e2e com um cliente com 2 agendamentos futuros confirmados, mensagem "quero cancelar" -> lista numerada das 2 opções; mensagem seguinte com `choice: 2` -> resolve o segundo como alvo.

### S2: Cancelamento dentro do prazo (P1)

Cancelar dentro do prazo libera o horário e confirma (CA-18.1).

**Acceptance Criteria**

8. WHEN o alvo resolvido tem início a pelo menos `cancellationDeadlineMinutes` (RN-09, regras da barbearia) de distância de agora e a interpretação pediu cancelar THEN o sistema SHALL marcar o agendamento como `cancelled`, responder com a confirmação do cancelamento (Assumptions) e descartar o rascunho (CA-18.1)
9. The sistema SHALL contar o cancelamento numa métrica de negócio nova, sem label de cliente ou barbearia (observabilidade, CLAUDE.md)
10. IF o envio da confirmação de cancelamento falha THEN o cancelamento SHALL continuar gravado, o webhook SHALL responder `204` e o erro SHALL ser logado sem telefone nem texto

**Independent test:** e2e com um agendamento daqui 3h e prazo padrão de 2h, "quero cancelar" -> linha em `appointments` com `status = 'cancelled'`, confirmação enviada, e o `ListAvailableSlotsUseCase` volta a oferecer aquele horário.

### S3: Remarcação dentro do prazo (P1)

Remarcar dentro do prazo busca um novo horário como um agendamento novo e só libera o antigo depois (CA-18.3).

**Acceptance Criteria**

11. WHEN o alvo resolvido tem início a pelo menos o prazo de distância e a interpretação pediu remarcar THEN o sistema SHALL buscar novos horários do mesmo jeito que um agendamento novo da US-17 (mesmos serviços do agendamento alvo; barbeiro do agendamento alvo, a não ser que o cliente peça outro ou diga "tanto faz"), oferecendo até 3 opções (CA-18.3)
12. WHEN o cliente escolhe uma das opções de remarcação THEN o sistema SHALL criar o novo agendamento confirmado, origem `bot`, e só depois de criado com sucesso marcar o antigo como `cancelled` (CA-18.3, CA-18.5)
13. The confirmação da remarcação SHALL trazer serviço, barbeiro, data, hora, valor e endereço, no mesmo formato do resumo de agendamento (US-17)
14. The sistema SHALL contar a remarcação com a métrica de cancelamento (AC 9) para o agendamento liberado, e com a métrica existente de agendamento pelo bot para o novo
15. IF o envio da confirmação de remarcação falha THEN o novo agendamento e o cancelamento do antigo SHALL continuar gravados, o webhook SHALL responder `204` e o erro SHALL ser logado sem telefone nem texto

**Independent test:** e2e com um corte com o João daqui 5h, "quero remarcar pra amanhã de manhã" -> oferta de horários do João amanhã de manhã; escolher uma -> novo agendamento confirmado e o antigo com status `cancelled`.

### S4: Fora do prazo de cancelamento ou remarcação (P1)

Fora do prazo, o bot explica a regra e transfere (CA-18.4).

**Acceptance Criteria**

16. IF o alvo resolvido tem início a menos do que o prazo de distância THEN o sistema SHALL responder com a regra (Assumptions), pausar a conversa com motivo `late_cancellation` e enviar o aviso de transferência, sem alterar o agendamento (CA-18.4, RN-09, RN-22)
17. The prazo SHALL ser lido das regras de agendamento da barbearia a cada mensagem (US-06) e escrito no mesmo formato de duração da US-17 (`1h`, `30 min`, `1h30`)
18. The lista `GET /whatsapp/conversations/waiting-human` SHALL trazer a conversa com `reason: 'late_cancellation'`

**Independent test:** unitário com `FixedClock`, agendamento daqui 1h e prazo padrão de 2h, "quero cancelar" -> regra ("Só cancelamos ou remarcamos pelo WhatsApp com pelo menos 2h de antecedência.") seguida da transferência, conversa pausada com `late_cancellation`, agendamento intacto.

### S5: Horário de remarcação disputado ou vencido nesse meio tempo (P1)

Quem perde a nova opção recebe novas opções, e o agendamento antigo não é tocado (mesmo padrão do S3/S4 da US-17).

**Acceptance Criteria**

19. IF a opção de remarcação escolhida foi ocupada ou deixou de ser válida (conflito, bloqueio, folga ou jornada) depois de oferecida THEN o sistema SHALL não criar o novo agendamento, não tocar o antigo, responder "Esse horário acabou de ser ocupado." e oferecer um novo conjunto de horários com os mesmos critérios
20. IF a opção de remarcação escolhida caiu dentro da antecedência mínima de agendamento enquanto a oferta esperava THEN o sistema SHALL responder com a regra de antecedência mínima (US-17) e o primeiro horário válido, sem tocar o antigo

**Independent test:** unitário com repositório em memória: oferta de remarcação gravada, o horário ocupado por outro cliente antes da escolha, `choice: 1` -> nenhum agendamento novo criado, o antigo continua `confirmed`, aviso com nova oferta.

### S6: Consistência com o restante do sistema (P1)

**Acceptance Criteria**

21. WHILE o autoagendamento do cliente está bloqueado (RN-12) o sistema SHALL continuar permitindo cancelar um agendamento localizado, mas SHALL transferir para humano com motivo `blocked_client` em vez de buscar horários de remarcação (RN-12, CA-17.6 estendido)
22. IF uma mensagem traz `cancelRequested` ou `rescheduleRequested` junto com `humanRequested` ou um assunto fora de contexto THEN o sistema SHALL seguir a mesma precedência da US-16/US-17 (atendente > fora de contexto > agendamento)
23. IF `choice` chega com um rascunho de candidatos ou de remarcação vencido (mais de 60 min, AD-013) ou de outro tipo (ex.: oferta de agendamento novo) THEN o sistema SHALL tratar a mensagem como não entendida, contando falha da US-16
24. IF o painel tenta marcar atendimento (US-11, `PATCH /appointments/:id/status`) num agendamento já `cancelled` THEN o sistema SHALL rejeitar com "Esse agendamento foi cancelado." em vez de mudar o status
25. The sistema SHALL descrever no Swagger a resposta de erro do AC 24 em `PATCH /appointments/:id/status`, o novo valor `cancelled` em `GET /appointments` e `GET /clients/:id`, e o novo valor `late_cancellation` em `GET /whatsapp/conversations/waiting-human`

**Independent test:** e2e com um cliente bloqueado com 1 agendamento futuro: "quero remarcar" localiza o agendamento mas transfere com `blocked_client`, sem oferecer horário; "quero cancelar" cancela normalmente. Unitário do `MarkAttendanceUseCase` com um agendamento `cancelled` -> erro, status inalterado.

## Out of scope

| Excluded | Why |
| --- | --- |
| Oferecer lista de espera para quem fica sem horário na remarcação | US-23/US-24 |
| Cancelar ou remarcar pelo painel (web) | RF-04 é só o bot; nenhum CA desta história cobre o painel |
| Trocar o serviço durante a remarcação | RN-10 só exige que o novo horário siga RN-02 a RN-05; nenhum CA pede trocar o serviço |
| Limite de quantas vezes um agendamento pode ser remarcado | Nenhum RF ou RN pede |
| Avisar a equipe ou o barbeiro quando um horário é liberado | US-24; nenhum CA desta história pede |
| Desfazer um cancelamento | Nenhum CA pede |

## Assumptions

| Assumption | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Texto da confirmação de cancelamento (AC 8) | `Agendamento cancelado.` + `Serviço(s): <serviços>` + `Barbeiro: <nome>` + `Data: <dia da semana>, <dd/mm>` + `Horário: <HH:MM>` | L-007: texto literal antes do código; mesmo vocabulário do resumo da US-17, sem valor nem endereço (não há mais compromisso a pagar ou visitar) | n |
| Texto da confirmação de remarcação (AC 13) | O mesmo formato do resumo de agendamento da US-17, trocando só o cabeçalho para `Agendamento remarcado!` | Reaproveita um formato já testado; o cliente já reconhece esse layout do primeiro agendamento | n |
| Pergunta "qual deles" (AC 4) | `Você tem mais de um agendamento. Qual deles?` + uma linha por candidato `<n>. <serviços>, <dia da semana>, <dd/mm>, às <HH:MM>, com <barbeiro>` + `Responda com o número do agendamento.` | L-007; mesmo padrão visual da oferta de horários da US-17 | n |
| Sem agendamento futuro (AC 2) | `Você não tem nenhum agendamento futuro.` | L-007 | n |
| Regra de prazo (AC 16) | `Só cancelamos ou remarcamos pelo WhatsApp com pelo menos <antecedência> de antecedência.` | L-007; espelha o `minimumAdvanceText` da US-17 | n |
| Mensagem de erro do AC 24 | `Esse agendamento foi cancelado.` | L-007/L-008; citado como RN-11 (o agendamento não existe mais para receber um registro de atendimento) | n |
| Um pedido novo sobrescreve o rascunho em aberto | "Quero cancelar" ou "quero remarcar" sempre começa um rascunho novo, descartando qualquer rascunho de agendamento (US-17) ou de outro cancelamento/remarcação ainda em aberto | Evita misturar dois pedidos concorrentes na mesma conversa; a US-17 já assume só um pedido de agendamento por vez | n |
| Barbeiro padrão da remarcação (AC 11) | O mesmo barbeiro do agendamento alvo, a não ser que o cliente nomeie outro ou diga "tanto faz" | RN-10 só exige que o novo horário siga RN-02 a RN-05; manter o barbeiro é o que normalmente se espera ao "remarcar" | n |
| Dois cancelamentos concorrentes do mesmo agendamento | Terminam no mesmo estado (`cancelled`); nenhuma trava nova é necessária | Ao contrário de escolher uma oferta (que criaria dois agendamentos sem trava), cancelar duas vezes chega ao mesmo resultado final | n |
| Agendamentos cancelados continuam visíveis na agenda e no perfil do cliente | Nenhuma listagem existente (`GET /appointments`, `GET /clients/:id`) filtra por status hoje; `attended`/`no_show` já ficam visíveis como histórico | Esconder `cancelled` exigiria um filtro novo que nenhum CA pede | n |
| "Evento horário liberado" (CA-18.5) | A própria mudança de status para `cancelled` é o fato observável; nenhum mecanismo de notificação é criado agora (Landing, porta 4) | AD-009/AD-012: este código nunca usou barramento de eventos, sempre leu o estado quando precisou; a US-24 ainda não existe | n |

**Open questions:** none - all resolved or logged above. A porta 4 do Landing tem uma alternativa viva (ver nota ao apresentar o plano).

## Observable

| Surface | Decision | Landing |
| --- | --- | --- |
| API `GET /appointments` | response shape | existing - `status` ganha `cancelled` pela porta 1; nenhum campo novo |
| API `GET /clients/:id` | response shape | existing - mesmo enum, reaproveitando o schema de `GET /appointments` |
| API `PATCH /appointments/:id/status` | error shape and codes | AC 24, AC 25 |
| API `GET /whatsapp/conversations/waiting-human` | response shape | porta 3 |
| API todas as rotas alteradas | documentation | AC 25 |
| API `GET /appointments`, `GET /clients/:id`, `PATCH /appointments/:id/status`, `GET /whatsapp/conversations/waiting-human` | authorization, versioning, rate limit | existing - AD-007, sem mudança |
| webhook `POST /webhooks/whatsapp/evolution` | response shape, error shape, quem chama | existing - `204` da US-13, sem mudança |
| document confirmação de cancelamento | structure, depth | AC 8, Assumptions |
| document confirmação de remarcação | structure, depth | AC 13, Assumptions |
| document pergunta "qual deles" | structure, what the reader does next | AC 4, Assumptions |
| document aviso de prazo vencido | structure, what the reader does next | AC 16, Assumptions |
| document mensagens de recusa (sem agendamento futuro, opção inválida, horário ocupado) | structure, what the reader does next | AC 2, AC 6, AC 19, AC 20 |
| collection agendamentos candidatos (AC 4) | ordering, duplicates | ordem cronológica; um cliente não tem dois agendamentos confirmados sobrepostos com o mesmo barbeiro (RN-07), mas pode ter com barbeiros diferentes - cada um aparece uma vez |
| collection opções de remarcação (AC 11) | ordering, duplicates | mesmo padrão da US-17 (cronológica, um horário por opção) |

## Sources

- [docs/PRD.md](../../../docs/PRD.md) seção 11, US-18 (CA-18.1 a CA-18.5, RF-04, RN-09, RN-10, RN-22, Fluxo 9.2) - define a história
- [.specs/STATE.md](../../STATE.md) AD-013 - já reserva o rascunho de agendamento para este uso
- [.specs/features/us-17-agendamento-pelo-whatsapp/plan.md](../us-17-agendamento-pelo-whatsapp/plan.md) - convenções de texto e de fluxo reaproveitadas
