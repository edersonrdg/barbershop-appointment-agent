# US-21: Suspensão por assinatura inativa

## Problem

Hoje uma barbearia continua com tudo funcionando depois que o teste gratuito acaba sem pagamento, depois de uma cobrança recusada que ninguém regulariza e depois do fim do mês pago de uma assinatura cancelada. O bot segue agendando e chamando o Gemini, os lembretes seguem saindo e o painel aceita qualquer alteração. A US-20 só registra o estado (`trialing` com `trialEndsAt` vencido, `past_due` com `paymentFailedAt`, `cancelsAt`) e não age sobre ele. Quem paga é a plataforma: serviço e custo de IA entregues a quem não paga, e nenhum motivo para o Dono regularizar. Sem isso o MVP Must não fecha (entrega da etapa 6 do PRD: "pronto para pilotos pagos"). O PRD não traz números de inadimplência.

Com a entrega, uma barbearia sem assinatura válida fica suspensa. O bot para de agendar e responde a toda mensagem pedindo que o cliente fale direto com a barbearia, os lembretes param e o painel fica em modo leitura, com o motivo à vista para o Dono regularizar. Uma cobrança recusada tem 5 dias de tolerância. Assim que o pagamento é confirmado, tudo volta na mesma hora, inclusive para quem cancelou e decide assinar de novo.

## Flow

Reaproveita a leitura da assinatura da US-20 (`SubscriptionRepository.findByBarbershopId`), o padrão de negar por padrão do `SessionGuard` (AD-007), a derivação de respostas da documentação a partir dos metadados de rota (`route-catalog.ts`), o pipeline do bot e o job de lembretes. A suspensão é calculada na leitura, sem job e sem estado novo (door 1).

1. `BarbershopSubscription` (exists) ganha a regra de suspensão (door 1): a partir do status, de `trialEndsAt`, `paymentFailedAt`, `cancelsAt`, do fuso da barbearia, do instante atual e da tolerância `SUBSCRIPTION_GRACE_DAYS`, devolve o motivo ou `null`.
2. Painel, escrita: requisição autenticada → `SessionGuard` (exists) → `SubscriptionAccessGuard` (door 2) lê a assinatura da sessão; em `POST`/`PUT`/`PATCH`/`DELETE` sem `@AllowWhileSuspended()` e com motivo ≠ `null`, responde `402` (door 3) antes do controller. Leituras e rotas `@Public()` passam direto.
3. Painel, leitura: `GET /me` (`GetMyAccountUseCase`, exists) e `GET /subscription` (`GetSubscriptionUseCase`, exists) devolvem `suspensionReason` (door 3).
4. Bot: `POST /webhooks/whatsapp/evolution` → `ReceiveWhatsAppMessageUseCase` (exists, sem mudança: cadastro e aviso de privacidade) → `AnswerClientQuestionUseCase` (exists): depois da reivindicação da mensagem e do teste de conversa pausada, se a barbearia está suspensa, envia a resposta fixa pelo `WhatsAppConnector` (exists) e para. Não chama o `MessageInterpreter` nem o agendamento.
5. Lembretes: `AppointmentRemindersJob` → `SendAppointmentRemindersUseCase` (exists) pula a barbearia suspensa antes de reivindicar qualquer lembrete.
6. Reativação: `POST /webhooks/payments/asaas` → `ApplyPaymentEventUseCase` (exists) → `BarbershopSubscription.confirmPayment` (exists) deixa `active` e, numa barbearia cujo período cancelado acabou, limpa o pedido de cancelamento. A próxima leitura do passo 1 já não acha motivo.
7. Recontratação: `POST /subscription/checkout` → `StartSubscriptionCheckoutUseCase` (exists) aceita também a barbearia suspensa por `subscription_ended`.
8. Documentação: `api-document.ts` (exists) acrescenta a resposta `402` a toda rota que o guard do passo 2 barra, lendo os mesmos metadados.

## Impact

| Front | What changes |
| --- | --- |
| domain | termo novo: **suspensão** (`suspensionReason`): `trial_ended`, `payment_overdue` ou `subscription_ended`, calculada na leitura e nunca gravada. Vive em `BarbershopSubscription` |
| domain | termo existente: `canStartCheckout` era "só `trialing`" e passa a aceitar também a barbearia suspensa por `subscription_ended`. Quem ramifica hoje: `StartSubscriptionCheckoutUseCase` (o `409` do critério 7 da US-20) |
| domain | termo existente: `confirmPayment` passa a limpar `cancelRequestedAt` quando o pagamento é de um período que começa no fim do período cancelado ou depois dele. Quem ramifica: `ApplyPaymentEventUseCase`, e `cancelsAt`/`nextChargeDate` em `GET /subscription` |
| stored data | nada a migrar: nenhuma coluna, status ou `CHECK` novo. O `CHECK` de `subscription_status` (AD-016) fica como está |
| stored data | efeito no deploy: toda barbearia `trialing` com `trial_ends_at` já vencido fica suspensa na primeira requisição depois do deploy. É o comportamento pedido |
| rotas existentes | toda rota autenticada de escrita, exceto `POST /subscription/checkout` e `POST /subscription/cancel`, pode responder `402`. Inclui `POST /whatsapp/conversations/:clientId/resume` e `POST /whatsapp/connection`. `GET /me` e `GET /subscription` ganham um campo (só acréscimo) |
| bot | nova resposta, com o `kind` `suspended` no `ClientReplyKind` e nos labels da métrica de respostas |
| testes existentes | 18 fixtures e2e inserem barbearias com `trial_ends_at = now()`, ou seja, com o teste já vencido: ficariam suspensas e as escritas e respostas do bot dessas suítes quebrariam. Elas passam a usar um fim de teste no futuro que cubra também o `FixedClock` das suítes que o usam. As fixtures em memória (`subscription-fixtures.ts`, `barber-fixtures.ts`) passam pela mesma revisão |
| configuração | `SUBSCRIPTION_GRACE_DAYS` (padrão 5) no `env.schema.ts` e no `.env.example` |
| métricas | contador novo `subscription_blocked_writes_total{reason}` no `METRICS_REGISTRY` |
| docs | `STATE.md` ganha o AD-017 (suspensão derivada na leitura e guard de escrita, alcançando toda rota nova). A previsão do AD-016 de "ampliar o `CHECK` para o estado suspenso" deixa de valer, e a decisão do AD-016 continua ativa. PRD seção 19: a tolerância de 5 dias segue como sugestão, agora configurável |
| painel (repo `barbershop-panel`) | precisa do aviso de suspensão e de tratar o `402` como modo leitura. Fica fora deste repositório (Out of scope) |

## Relations

None - no stored-data shape change. A suspensão é derivada de colunas que a US-20 já grava (door 1).

## Surface

Only routes this adds or whose signature changes.

| Route | In | Out | Status |
| --- | --- | --- | --- |
| `GET /me` | sessão (Dono ou Barbeiro) | campos atuais · `barbershop.suspensionReason` (`trial_ended`, `payment_overdue`, `subscription_ended` ou `null`) | `200`, `401` |
| `GET /subscription` | sessão (só Dono) | campos atuais · `suspensionReason` | `200`, `401`, `403` |
| `POST /subscription/checkout` | inalterado | inalterado | `201` também para a barbearia suspensa por `subscription_ended`; `400`, `401`, `403`, `409`, `502` |
| toda rota autenticada `POST`/`PUT`/`PATCH`/`DELETE` fora de `/subscription/*` | inalterado | `{ message }` no `402` | `402` acrescentado aos status atuais de cada rota |

## Landing

| One-way door | Literal shape | Alternative rejected |
| --- | --- | --- |
| 1. Suspensão derivada na leitura | `BarbershopSubscription.suspensionReason(now, graceDays)`, que devolve `'trial_ended'`, `'payment_overdue'`, `'subscription_ended'` ou `null`, calculada em toda leitura a partir de `subscription_status`, `trial_ends_at`, `payment_failed_at`, `cancel_requested_at`, `paid_until` e o fuso da barbearia. Nenhuma coluna, nenhum status novo, nenhum job | Status `suspended` gravado por um cron, como o AD-016 previa: aplica a suspensão com até um intervalo de atraso, precisa de uma transição de volta no webhook para cumprir o "imediatamente" do CA-21.4, e um estado gravado pode discordar das datas de que ele deriva. A regra fica no domínio, como a pausa do AD-012 |
| 2. Modo leitura por guard, negado por padrão | `SubscriptionAccessGuard` como segundo `APP_GUARD`, registrado depois do `SessionGuard`; barra todo `POST`/`PUT`/`PATCH`/`DELETE` não `@Public()`; a exceção é o decorator `@AllowWhileSuspended()`, hoje só no `SubscriptionController`. Toda rota de escrita nova nasce barrada | Checar em cada use case de escrita: são mais de 20 hoje, e uma rota nova que esquecer a checagem nasce aberta. Opt-in por decorator nas rotas barradas: mesmo defeito, ao contrário do AD-007 |
| 3. Contrato da suspensão | status `402` com `{ "message": "A assinatura desta barbearia está inativa. O painel está em modo leitura até a assinatura ser regularizada." }`; campo `suspensionReason` com os três valores literais acima em `GET /me` (`barbershop.suspensionReason`) e em `GET /subscription` | `403`: é o status da negação por perfil (`Acesso negado.`), e o painel não teria como distinguir. `423 Locked`: semântica de WebDAV (recurso travado), não de pagamento. Só um booleano `suspended`: o painel teria de rederivar o motivo, duplicando a regra do door 1 |

- Nothing else in this change is hard to reverse

## Criteria

### S1: a barbearia sem assinatura válida fica suspensa, com tolerância para falha de pagamento (P1)

CA-21.1 (gatilho) e CA-21.3: quando a suspensão começa e quando ainda não começou.

**Acceptance Criteria**

1. WHILE a barbearia está `trialing` e o instante atual é igual ou posterior a `trialEndsAt` the system SHALL considerá-la suspensa com o motivo `trial_ended`
2. WHILE a barbearia está `past_due` e o instante atual é igual ou posterior a `paymentFailedAt` + `SUBSCRIPTION_GRACE_DAYS` × 24 h (padrão 5) the system SHALL considerá-la suspensa com o motivo `payment_overdue`
3. WHILE a barbearia está `past_due` e o instante atual é anterior a `paymentFailedAt` + `SUBSCRIPTION_GRACE_DAYS` × 24 h the system SHALL não considerá-la suspensa
4. WHILE a barbearia está `active` com pedido de cancelamento e a data local de hoje, no fuso da barbearia, é posterior a `cancelsAt` the system SHALL considerá-la suspensa com o motivo `subscription_ended`
5. WHILE a barbearia está `active` com pedido de cancelamento e a data local de hoje é igual ou anterior a `cancelsAt` the system SHALL não considerá-la suspensa
6. WHILE a barbearia está `trialing` com `trialEndsAt` no futuro, ou `active` sem pedido de cancelamento, the system SHALL não considerá-la suspensa
7. IF `SUBSCRIPTION_GRACE_DAYS` não é um inteiro maior ou igual a 0 THEN the system SHALL falhar na inicialização com o erro de validação do ambiente

**Independent test:** teste unitário da regra com um relógio fixo nos limites exatos de cada motivo (L-002): `trialEndsAt` igual ao instante atual, `paymentFailedAt` + 5 dias igual ao instante atual, `cancelsAt` igual à data local de hoje.

### S2: o bot de uma barbearia suspensa para de agendar e pede contato direto (P1)

CA-21.1: o bot deixa de agendar e responde pedindo que o cliente entre em contato com a barbearia.

**Acceptance Criteria**

8. WHILE a barbearia está suspensa, WHEN um cliente com a conversa não pausada manda uma mensagem de texto THEN the system SHALL responder pelo WhatsApp com o texto `Olá! No momento o atendimento automático da {nome da barbearia} está indisponível. Para agendar ou tirar dúvidas, fale direto com a barbearia.` e não chamar o interpretador de mensagens
9. WHILE a barbearia está suspensa the system SHALL não criar, cancelar, remarcar nem confirmar presença de agendamento a partir de uma mensagem, nem consumir o rascunho de agendamento da conversa
10. WHILE a barbearia está suspensa, WHEN chega uma mensagem de um cliente com a conversa pausada para atendimento humano THEN the system SHALL não responder
11. WHILE a barbearia está suspensa, WHEN um telefone novo manda a primeira mensagem THEN the system SHALL cadastrar o cliente e enviar o aviso de privacidade como na US-14, e responder com o texto do critério 8
12. WHILE a barbearia está suspensa, WHEN o job de lembretes roda THEN the system SHALL não enviar nem reivindicar lembretes de 24h ou de 1h dessa barbearia
13. WHEN o bot envia o texto do critério 8 THEN the system SHALL incrementar a métrica de respostas do bot com `kind="suspended"`

**Independent test:** e2e com o conector e o interpretador falsos: uma barbearia com o teste vencido recebe uma mensagem pedindo horário, o conector registra o texto do critério 8, o interpretador não é chamado e nenhum agendamento é criado.

### S3: o painel fica em modo leitura com o motivo à vista (P1)

CA-21.2: o Dono vê os dados mas não cria nem altera nada, e vê o aviso para regularizar.

**Acceptance Criteria**

14. WHILE a barbearia está suspensa, WHEN um Dono ou um Barbeiro chama uma rota autenticada `POST`, `PUT`, `PATCH` ou `DELETE` diferente de `POST /subscription/checkout` e `POST /subscription/cancel` THEN the system SHALL responder `402` com a mensagem `A assinatura desta barbearia está inativa. O painel está em modo leitura até a assinatura ser regularizada.` sem executar a rota
15. WHILE a barbearia está suspensa, WHEN um usuário chama uma rota autenticada `GET` THEN the system SHALL responder como responderia sem suspensão
16. WHILE a barbearia está suspensa the system SHALL atender as rotas `@Public()` (login, cadastro, recuperação de senha, aceite de convite, webhooks do WhatsApp e do Asaas) como sem suspensão
17. WHEN um usuário faz `GET /me` THEN the system SHALL devolver `barbershop.suspensionReason` com o motivo atual ou `null`
18. WHEN o Dono faz `GET /subscription` THEN the system SHALL devolver `suspensionReason` com o motivo atual ou `null`
19. The system SHALL documentar no OpenAPI a resposta `402` com a mensagem do critério 14 em toda rota autenticada `POST`, `PUT`, `PATCH` ou `DELETE`, exceto `POST /subscription/checkout` e `POST /subscription/cancel`, e em nenhuma outra
20. WHEN uma escrita é barrada pela suspensão THEN the system SHALL incrementar `subscription_blocked_writes_total` no `METRICS_REGISTRY` com o label `reason` igual ao motivo

**Independent test:** e2e com uma barbearia de teste vencido: `GET /services` responde `200`, `POST /services` responde `402` com a mensagem e nada é gravado, e `GET /me` traz `suspensionReason: 'trial_ended'`.

### S4: o pagamento regularizado reativa tudo na hora (P1)

CA-21.4: barbearia suspensa, pagamento regularizado, tudo reativado imediatamente.

**Acceptance Criteria**

21. WHEN o webhook confirma o pagamento de uma barbearia suspensa por `trial_ended` ou `payment_overdue` THEN the system SHALL tratá-la como não suspensa já na requisição seguinte: escrita do painel aceita, `suspensionReason: null` e bot respondendo normalmente
22. WHILE a barbearia está suspensa por `subscription_ended`, WHEN o Dono faz `POST /subscription/checkout` com cartão ou com Pix THEN the system SHALL criar o checkout como para uma barbearia `trialing` e responder `201 { paymentUrl }`
23. WHEN o webhook confirma o primeiro pagamento da nova assinatura de uma barbearia suspensa por `subscription_ended` THEN the system SHALL deixá-la `active` sem pedido de cancelamento: `cancelsAt: null`, `nextChargeDate` = novo `paidUntil` e `suspensionReason: null`
24. WHILE a barbearia está `active` com pedido de cancelamento e a data local de hoje é igual ou anterior a `cancelsAt`, WHEN o Dono faz `POST /subscription/checkout` THEN the system SHALL responder `409` com `Esta barbearia já tem uma assinatura.`, como na US-20
25. IF chega uma confirmação atrasada de uma cobrança da assinatura cancelada, com vencimento anterior ao `paidUntil` gravado, THEN the system SHALL manter o pedido de cancelamento e o motivo `subscription_ended`

**Independent test:** e2e com o port de pagamento falso: barbearia `past_due` há 6 dias responde `402` a `POST /services`; depois de postar `PAYMENT_RECEIVED`, o mesmo `POST /services` responde `201`.

## Out of scope

| Excluded | Why |
| --- | --- |
| E-mail ou WhatsApp ao Dono quando a suspensão começa | Nenhum CA pede; o aviso do CA-21.2 é no painel. Os avisos de fim do teste e de falha da US-20 continuam |
| Mostrar até quando vai a tolerância (`suspendsAt`) | Nenhum CA pede; o painel tem `paymentIssueUrl` e `status` para o aviso de falha |
| Cancelar ou mexer em agendamentos já marcados ao suspender | O CA-21.2 pede só leitura; os agendamentos continuam visíveis e intactos |
| Bloquear login ou leitura | O CA-21.2 diz que o Dono consegue ver os dados |
| Apagar dados depois de muito tempo suspensa | Retenção é da seção 15 do PRD, não desta história |
| Desconectar o WhatsApp ao suspender | O número continua com a equipe da barbearia, que responde pelo app; o bot só muda a resposta |
| Mensagens e telas do modo leitura no painel | Ficam no repositório `barbershop-panel` |

## Assumptions

| Assumption | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Resposta do bot suspenso | Texto fixo a toda mensagem de texto, sem chamar o Gemini | Escolha do usuário nesta sessão: a plataforma não paga IA para quem não paga, e é a leitura literal da RN-25 | y |
| Lembretes durante a suspensão | Param; os que vencerem durante a suspensão não são enviados depois. Um lembrete ainda dentro da janela quando a barbearia volta sai normalmente | Escolha do usuário nesta sessão: o RF-43 suspende o bot, e o lembrete é mensagem do bot | y |
| Tolerância de falha de pagamento | `SUBSCRIPTION_GRACE_DAYS`, padrão 5, contada de `paymentFailedAt` (a primeira falha, que a US-20 nunca sobrescreve) em períodos de 24 h | PRD RN-25 e CA-21.3: "sugestão, a validar", então configurável | n |
| Fim do período cancelado | Ativa até o fim do dia `cancelsAt` no fuso da barbearia; suspensa a partir de 00:00 local do dia seguinte | A US-20 documenta `cancelsAt` como "último dia pago" | n |
| Assinatura `active` sem cancelamento | Nunca suspensa só por data; a suspensão vem do `past_due` que o webhook de falha grava | O Asaas reenvia webhooks até receber `200` (AD-016); uma suspensão por `paidUntil` vencido cortaria quem paga por Pix no dia do vencimento | n |
| Conversa pausada durante a suspensão | Continua calada (critério 10) | A equipe está atendendo aquele cliente; a resposta fixa atrapalharia a conversa humana | n |
| Aviso de privacidade durante a suspensão | Continua sendo enviado na primeira mensagem (critério 11) | RN-20 e LGPD não dependem da assinatura | n |
| Rotas públicas | Inalteradas durante a suspensão, inclusive o aceite de convite | O guard age só sobre sessão; o login é necessário para ver os dados (CA-21.2), e o webhook do Asaas é o caminho da reativação | n |
| Jobs que não falam com o cliente | O reset de faltas (US-11) e o aviso de fim do teste (US-20) seguem rodando | São manutenção interna e aviso ao Dono, não ações do bot nem do painel | n |
| Texto da resposta do bot | `Olá! No momento o atendimento automático da {nome da barbearia} está indisponível. Para agendar ou tirar dúvidas, fale direto com a barbearia.` | L-007: copy em pt-BR fixada antes do build | n |
| Mensagem do `402` | `A assinatura desta barbearia está inativa. O painel está em modo leitura até a assinatura ser regularizada.` | L-007; serve ao Dono e ao Barbeiro, que também recebem o `402` | n |

**Open questions:**

| # | Kind | Question | Until answered |
| --- | --- | --- | --- |
| 1 | open | A tolerância de 5 dias (RN-25) é o valor final? | `SUBSCRIPTION_GRACE_DAYS` usa o padrão 5; mudar o valor é só configuração |

## Observable

| Surface | Decision | Landing |
| --- | --- | --- |
| API toda rota autenticada de escrita | error shape and codes | AC 14 (`402` + `{ message }`), door 3 |
| API toda rota autenticada de escrita | who may call it | AC 14; exceção por `@AllowWhileSuspended()` (door 2) |
| API toda rota autenticada de escrita | documentação do novo status | AC 19 |
| API `GET /me` | response shape | AC 17 |
| API `GET /subscription` | response shape | AC 18 |
| API `GET /me`, `GET /subscription` | error shape and codes | existing - `401` do `SessionGuard`, `403` só-Dono em `/subscription` (AD-007); nada muda |
| API `POST /subscription/checkout` | response shape and codes | AC 22, AC 24 |
| all changed routes | versioning | n/a - nenhuma rota da API é versionada; o painel é o único consumidor e o campo novo é só acréscimo |
| all changed routes | rate limit | n/a - a API não tem throttling em nenhuma rota, e o `402` não cria trabalho novo |
| document resposta do bot suspenso | structure, tone, next step | AC 8 e Assumption "texto da resposta do bot": o próximo passo é falar direto com a barbearia |
| document mensagem do `402` | structure, tone, next step | AC 14 e Assumption "mensagem do `402`": o próximo passo é regularizar a assinatura |
| scheduled task lembretes | output and failure halfway | existing - `AppointmentRemindersJob` loga enviados e falhas; a barbearia suspensa é só pulada (AC 12) |
| scheduled task lembretes | flags and exit codes | n/a - cron interno, sem flags nem processo próprio |

## Sources

- [docs/PRD.md](../../../docs/PRD.md) seção 11, US-21 (CA-21.1 a CA-21.4), RF-43, RN-25; seção 12 (etapa 6)
- [.specs/features/us-20-cobranca-recorrente-da-assinatura/plan.md](../us-20-cobranca-recorrente-da-assinatura/plan.md): Out of scope "suspender" e "fim do acesso quando passa o `cancelsAt`", passados para esta história
- `.specs/STATE.md` AD-007 (negar por padrão), AD-012 (estado calculado na leitura), AD-016 (status e colunas da assinatura)
