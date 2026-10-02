# US-20: Cobrança recorrente da assinatura checks

Profile: standard
Plan: `.specs/features/us-20-cobranca-recorrente-da-assinatura/plan.md`

45 checks em 6 fatias · 7 one-way doors · 2 open, 0 block

Perfil `standard`: o repositório não declara perfil, e a US-19 foi verificada nele; uma história com dinheiro, webhook e tabela de estados não cabe no `light`, que não recalcula a cobertura nem injeta falhas.

Um check concluído termina com ✅. Convenção das provas: todo teste cita o `CA` (ou o AC/door do plano) e o id do check entre parênteses, dentro de um `describe('US-20 ...')`; o seletor `-t "US-20.*\(Cn\)"` evita colidir com os ids das histórias anteriores.

- e2e: `npx jest --config ./test/jest-e2e.json <arquivo> -t "<padrão>"` (Postgres do compose rodando; `PAYMENT_GATEWAY` trocado por um fake, `EMAIL_SENDER` pelo `FakeEmailSender`, relógio por `SettableClock`)
- unitário: `npx jest <arquivo> -t "<padrão>"`
- Nenhum teste chama o Asaas real: o adaptador é provado com um `fetch` falso, como o da Evolution.

Cenário das provas, salvo quando o check diz outra coisa:

- relógio em `2026-10-02T15:00:00Z` = sexta-feira, 02/10/2026, 12:00 em `America/Sao_Paulo`
- "Barbearia do Zé", fuso `America/Sao_Paulo`, `trialing`, `trialEndsAt = 2026-10-04T15:00:00Z` (2 dias depois do relógio)
- Dono "Ana Souza", `ana@barbearia.test`; barbeiro "João", `joao@barbearia.test`
- `SUBSCRIPTION_PRICE_CENTS = 9900`, `SUBSCRIPTION_TRIAL_WARNING_DAYS = 3`, `APP_WEB_URL = http://painel.test`
- CPF válido `529.982.247-25` (dígitos `52998224725`); CNPJ válido `11.222.333/0001-81` (dígitos `11222333000181`)
- assinatura no gateway `sub_1`, checkout `chk_1`, fatura `https://sandbox.asaas.com/i/pay_1`
- **ativa:** a barbearia `active`, método `credit_card`, `gateway_subscription_id = sub_1`, `paidUntil = 2026-11-02`

Textos esperados:

- erro sem documento: `Informe o CPF ou CNPJ para pagar com Pix.`
- documento inválido: `Informe um CPF ou CNPJ válido.`
- já assinada: `Esta barbearia já tem uma assinatura.`
- gateway fora: `Não foi possível falar com o serviço de pagamento. Tente novamente.`
- nada a cancelar: `Não há assinatura ativa para cancelar.`
- e-mail de fim do teste: assunto `Seu teste gratuito termina em breve`; texto `Olá, Ana Souza! O teste gratuito da Barbearia do Zé termina em 04/10/2026. Para continuar usando, assine em http://painel.test/assinatura.`
- e-mail de falha: assunto `Não conseguimos cobrar sua assinatura`; texto `Olá, Ana Souza! Não conseguimos cobrar a assinatura da Barbearia do Zé. Para continuar usando, faça o pagamento por este link: https://sandbox.asaas.com/i/pay_1`

## Checks

### S1 - Assinar e ficar ativa · ~22 arquivos · ~150 KB · ~38k

**C1** - Por tabela, `CpfCnpj.create` aceita `529.982.247-25`, `52998224725`, `11.222.333/0001-81` e `11222333000181` e guarda só os dígitos; recusa com `InvalidValueError` e a mensagem `Informe um CPF ou CNPJ válido.` os valores `52998224724` (dígito errado), `11222333000180` (dígito errado), `11111111111` (repetido), `5299822472` (10 dígitos), `112223330001811` (15 dígitos) e `abc` (AC 6) ✅
Proof: `npx jest src/domain/value-objects/cpf-cnpj.spec.ts -t "US-20.*\(C1\)"`

**C2** - Por tabela, somar um mês de calendário a uma data: `2026-10-02` → `2026-11-02`, `2026-01-31` → `2026-02-28`, `2028-01-31` → `2028-02-29`, `2026-03-31` → `2026-04-30`, `2026-12-15` → `2027-01-15` (AC 9) ✅
Proof: `npx jest src/domain/value-objects/calendar-date.spec.ts -t "US-20.*\(C2\)"`

**C3** - Com o Dono de uma barbearia `trialing`, `method: 'credit_card'`, o use case chama `createCardCheckout` uma vez com `barbershopId` = id da barbearia, `priceCents: 9900`, `firstDueDate: '2026-10-02'` e as URLs `http://painel.test/assinatura`, grava o checkout `chk_1` e o método `credit_card` na assinatura da barbearia, devolve `paymentUrl` = link do gateway e a barbearia continua `trialing` (CA-20.1, AC 1) ✅
Proof: `npx jest src/usecases/start-subscription-checkout/start-subscription-checkout.use-case.spec.ts -t "US-20.*\(C3\)"`

**C4** - Com o relógio em `2026-10-03T02:30:00Z` (02/10 23:30 em São Paulo) e a barbearia no fuso `America/Sao_Paulo`, o `firstDueDate` é `2026-10-02`; com a barbearia em `America/Manaus` e o relógio em `2026-10-03T03:30:00Z`, é `2026-10-02` (AC 1, AC 2, RNF-04) ✅
Proof: `npx jest src/usecases/start-subscription-checkout/start-subscription-checkout.use-case.spec.ts -t "US-20.*\(C4\)"`

**C5** - Com `method: 'pix'` e `cpfCnpj: '529.982.247-25'`, o use case chama `createPixSubscription` uma vez com `cpfCnpj: '52998224725'`, nome e e-mail do Dono, `priceCents: 9900` e `firstDueDate: '2026-10-02'`, grava `sub_1`, o id do cliente no gateway e o método `pix`, devolve `paymentUrl` = link da primeira fatura, e o documento não aparece em nada que o repositório grava (CA-20.1, AC 2, Assumptions: CPF/CNPJ) ✅
Proof: `npx jest src/usecases/start-subscription-checkout/start-subscription-checkout.use-case.spec.ts -t "US-20.*\(C5\)"`

**C6** - Com uma assinatura Pix `sub_0` já gravada e não paga, um novo checkout Pix chama `cancelSubscription('sub_0')` antes de `createPixSubscription`, e a assinatura passa a guardar a nova; se o cancelamento falha, nada é criado e o use case lança `PaymentGatewayUnavailableError` (AC 3) ✅
Proof: `npx jest src/usecases/start-subscription-checkout/start-subscription-checkout.use-case.spec.ts -t "US-20.*\(C6\)"`

**C7** - Por tabela de status: `active` e `past_due` lançam `SubscriptionAlreadyExistsError` com `Esta barbearia já tem uma assinatura.` sem nenhuma chamada ao gateway; `trialing` segue (AC 7) ✅
Proof: `npx jest src/usecases/start-subscription-checkout/start-subscription-checkout.use-case.spec.ts -t "US-20.*\(C7\)"`

**C8** - Com o gateway lançando `PaymentGatewayUnavailableError` em `createCardCheckout` e em `createPixSubscription`, o use case repassa o erro, a barbearia continua `trialing` e a assinatura não ganha checkout nem assinatura nova (AC 8) ✅
Proof: `npx jest src/usecases/start-subscription-checkout/start-subscription-checkout.use-case.spec.ts -t "US-20.*\(C8\)"`

**C9** - Pela rota, com o Dono logado: `POST /subscription/checkout` com `{ method: 'credit_card' }` responde `201 { paymentUrl }` com o link do fake; com `{ method: 'pix', cpfCnpj: '529.982.247-25' }` responde `201 { paymentUrl }`; com `{ method: 'pix' }` responde `400` com `Informe o CPF ou CNPJ para pagar com Pix.`; com `{ method: 'pix', cpfCnpj: '52998224724' }` responde `400` com `Informe um CPF ou CNPJ válido.`; com `{ method: 'boleto' }` responde `400` (CA-20.1, AC 1, AC 2, AC 5, AC 6) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/subscription.e2e-spec.ts -t "US-20.*\(C9\)"`

**C10** - Pela rota: barbearia `active` responde `409` com `Esta barbearia já tem uma assinatura.`; fake do gateway falhando responde `502` com `Não foi possível falar com o serviço de pagamento. Tente novamente.` e `GET /subscription` continua `trialing` (AC 7, AC 8) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/subscription.e2e-spec.ts -t "US-20.*\(C10\)"`

**C11** - Dois `POST /subscription/checkout` Pix simultâneos da mesma barbearia, com o fake do gateway segurando a primeira criação até a segunda chegar: no fim, o fake tem exatamente uma assinatura Pix não cancelada, e é a que está gravada na barbearia (AC 4, door 1) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/subscription.e2e-spec.ts -t "US-20.*\(C11\)"`

**C12** - Com a barbearia `trialing` e `sub_1` gravada, `PAYMENT_CONFIRMED` de uma cobrança com vencimento `2026-10-02` deixa a barbearia `active` com `paidUntil = 2026-11-02`; um `PAYMENT_RECEIVED` seguinte da mesma cobrança mantém `2026-11-02`; um `PAYMENT_RECEIVED` de vencimento `2026-09-02` com `paidUntil = 2026-11-02` não diminui `paidUntil` (CA-20.1, AC 9) ✅
Proof: `npx jest src/usecases/apply-payment-event/apply-payment-event.use-case.spec.ts -t "US-20.*\(C12\)"`

**C13** - Com a barbearia em que só `chk_1` está gravado, um `PAYMENT_CONFIRMED` de `sub_1` faz o use case perguntar ao gateway (`findSubscriptionBarbershop('sub_1')`), que responde a barbearia pelo checkout `chk_1`; o use case grava `sub_1` e deixa a barbearia `active`. Com o gateway respondendo `null`, nada muda e o resultado é `ignored` (AC 10, AC 11, door 6) ✅
Proof: `npx jest src/usecases/apply-payment-event/apply-payment-event.use-case.spec.ts -t "US-20.*\(C13\)"`

**C14** - Por tabela de eventos do Asaas, o adaptador traduz `PAYMENT_CONFIRMED` e `PAYMENT_RECEIVED` para pagamento confirmado; `PAYMENT_CREDIT_CARD_CAPTURE_REFUSED`, `PAYMENT_REPROVED_BY_RISK_ANALYSIS` e `PAYMENT_OVERDUE` para pagamento falho; e `PAYMENT_CREATED`, `PAYMENT_UPDATED`, `PAYMENT_REFUNDED`, `CHECKOUT_PAID`, `SUBSCRIPTION_CREATED` e um evento inventado para `other`; um evento sem `payment.subscription` também vira `other` (AC 9, AC 23, door 5) ✅
Proof: `npx jest src/infrastructure/external/payments/asaas/asaas-payment-event.spec.ts -t "US-20.*\(C14\)"`

**C15** - Pelo webhook: `POST /webhooks/payments/asaas` com `asaas-access-token` certo e um `PAYMENT_CONFIRMED` de `sub_1` (vencimento `2026-10-02`) responde `200`, e `GET /subscription` do Dono mostra `status: 'active'`, `paidUntil: '2026-11-02'` e `nextChargeDate: '2026-11-02'` (CA-20.1, AC 9) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/payment-webhook.e2e-spec.ts -t "US-20.*\(C15\)"`

**C16** - Pelo webhook: sem o header e com um token diferente, a rota responde `401` e a barbearia continua `trialing`; um corpo sem `id` ou sem `event` responde `200` sem mudar nada; um evento de uma assinatura que nem o banco nem o fake conhecem responde `200` sem mudar nada (AC 11, AC 12, door 5) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/payment-webhook.e2e-spec.ts -t "US-20.*\(C16\)"`

**C17** - Pelo webhook: o mesmo `PAYMENT_CREDIT_CARD_CAPTURE_REFUSED` (mesmo `id`) postado duas vezes para a barbearia **ativa** responde `200` nas duas, grava uma única linha em `payment_gateway_events` e manda exatamente 1 e-mail (AC 13, door 2) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/payment-webhook.e2e-spec.ts -t "US-20.*\(C17\)"`

**C18** - Pelo webhook: com o `EmailSender` sem falha e o repositório da assinatura falhando ao gravar (gatilho no banco que rejeita o `UPDATE` só nesse teste), a rota responde `500` e `payment_gateway_events` não tem o `id`; removido o gatilho, o mesmo evento responde `200` e é aplicado (AC 14, door 2) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/payment-webhook.e2e-spec.ts -t "US-20.*\(C18\)"`

### S2 - Ver a assinatura · ~6 arquivos · ~30 KB · ~8k

**C19** - `GET /subscription` de uma barbearia recém-cadastrada responde `200` com `{ status: 'trialing', trialEndsAt: <o do cadastro>, trialEndingSoon: <conforme C29>, priceCents: 9900, paymentMethod: null, paidUntil: null, nextChargeDate: null, cancelsAt: null, paymentIssueUrl: null }`, sem nenhum campo além desses (AC 15) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/subscription.e2e-spec.ts -t "US-20.*\(C19\)"`

**C20** - `GET /subscription` da barbearia **ativa** sem cancelamento responde `paymentMethod: 'credit_card'`, `paidUntil: '2026-11-02'`, `nextChargeDate: '2026-11-02'`, `cancelsAt: null` (AC 15, AC 16) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/subscription.e2e-spec.ts -t "US-20.*\(C20\)"`

**C21** - Por tabela de rotas (`GET /subscription`, `POST /subscription/checkout`, `POST /subscription/cancel`): o Barbeiro logado recebe `403` com `Acesso negado.` e sem token a resposta é `401`; nenhuma chamada chega ao fake do gateway (AC 17, CA-02.2) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/subscription.e2e-spec.ts -t "US-20.*\(C21\)"`

**C22** - `GET /me` de uma barbearia **ativa** responde `200` com `barbershop.subscriptionStatus: 'active'`, e de uma `past_due` com `'past_due'` (Impact: `GET /me`, door 3) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/subscription.e2e-spec.ts -t "US-20.*\(C22\)"`

### S3 - Aviso de fim do teste · ~8 arquivos · ~45 KB · ~11k

**C23** - Com a barbearia do cenário (teste acaba em 2 dias) e dois Donos ("Ana Souza" e "Bia Lima") mais o barbeiro João, uma execução do `SendTrialEndingWarningsUseCase` manda exatamente 2 e-mails, um para cada Dono, com o assunto e o texto do e-mail de fim do teste (o de Bia com `Olá, Bia Lima!`), nenhum para João, e grava `trialWarningSentAt = 2026-10-02T15:00:00Z`; uma segunda execução não manda nada (CA-20.2, AC 18, AC 19) ✅
Proof: `npx jest src/usecases/send-trial-ending-warnings/send-trial-ending-warnings.use-case.spec.ts -t "US-20.*\(C23\)"`

**C24** - Por tabela de `trialEndsAt` com o relógio do cenário: `2026-10-05T15:00:00Z` (exatamente 3 dias) avisa; `2026-10-05T15:01:00Z` (3 dias e 1 min) não avisa; `2026-10-02T15:01:00Z` (1 min) avisa; `2026-10-02T15:00:00Z` (agora) não avisa; `2026-10-01T15:00:00Z` (passado) não avisa. Com `SUBSCRIPTION_TRIAL_WARNING_DAYS = 5`, `2026-10-07T15:00:00Z` avisa (AC 18, AC 22) ✅
Proof: `npx jest src/usecases/send-trial-ending-warnings/send-trial-ending-warnings.use-case.spec.ts -t "US-20.*\(C24\)"`

**C25** - Por tabela de status com o teste acabando em 2 dias: `active` e `past_due` não recebem aviso nem têm o aviso gravado (AC 20) ✅
Proof: `npx jest src/usecases/send-trial-ending-warnings/send-trial-ending-warnings.use-case.spec.ts -t "US-20.*\(C25\)"`

**C26** - Com duas barbearias devidas e o `EmailSender` falhando para a primeira, a execução devolve `failures` com o id da primeira, avisa a segunda e mantém `trialWarningSentAt` gravado nas duas; uma execução seguinte com o e-mail bom não manda nada (AC 21, door 7) ✅
Proof: `npx jest src/usecases/send-trial-ending-warnings/send-trial-ending-warnings.use-case.spec.ts -t "US-20.*\(C26\)"`

**C27** - O `TrialEndingWarningJob.run` loga um resumo com `warned` e `failedBarbershops`; para cada barbearia que falhou, loga um erro com o `barbershopId` e só `name` e `code` do erro, sem e-mail em nenhum argumento do log; o `@Cron` do job é `0 * * * *` (AC 21, Observable, door 7) ✅
Proof: `npx jest src/infrastructure/jobs/trial-ending-warning.job.spec.ts -t "US-20.*\(C27\)"`

**C28** - Pelo banco: duas execuções simultâneas do `run()` do job sobre a barbearia do cenário mandam exatamente 1 e-mail ao Dono (door 7) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/trial-ending-warning.e2e-spec.ts -t "US-20.*\(C28\)"`

**C29** - `GET /subscription` responde `trialEndingSoon: true` para a barbearia do cenário, `false` com `trialEndsAt = 2026-10-06T15:00:00Z` e `false` para uma barbearia `active` com o mesmo `trialEndsAt` do cenário; o valor não depende de o e-mail ter sido enviado (AC 22) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/subscription.e2e-spec.ts -t "US-20.*\(C29\)"`

### S4 - Cobrança recusada · ~5 arquivos · ~30 KB · ~8k

**C30** - Com a barbearia **ativa** (`paidUntil = 2026-11-02`), um evento de falha com vencimento `2026-11-02` e fatura `https://sandbox.asaas.com/i/pay_1` deixa a barbearia `past_due`, grava `paymentFailedAt = 2026-10-02T15:00:00Z` e `paymentIssueUrl`, e manda 1 e-mail a cada Dono com o assunto e o texto do e-mail de falha, nenhum ao barbeiro (CA-20.3, AC 23) ✅
Proof: `npx jest src/usecases/apply-payment-event/apply-payment-event.use-case.spec.ts -t "US-20.*\(C30\)"`

**C31** - Com a barbearia **ativa**, um evento de falha com vencimento `2026-11-01` (antes de `paidUntil`) é `ignored`: status, instante da falha e e-mails ficam como estavam (AC 24) ✅
Proof: `npx jest src/usecases/apply-payment-event/apply-payment-event.use-case.spec.ts -t "US-20.*\(C31\)"`

**C32** - Por tabela de status: com a barbearia `trialing` o evento de falha é `ignored`; com a barbearia `past_due` e `paymentFailedAt = 2026-10-01T10:00:00Z`, um segundo evento de falha (outro `id`) é `ignored`, sem e-mail e sem mudar `paymentFailedAt` (AC 25) ✅
Proof: `npx jest src/usecases/apply-payment-event/apply-payment-event.use-case.spec.ts -t "US-20.*\(C32\)"`

**C33** - Com a barbearia `past_due`, um pagamento confirmado com vencimento `2026-11-02` a deixa `active` com `paidUntil = 2026-12-02`, `paymentIssueUrl` e `paymentFailedAt` nulos (AC 26) ✅
Proof: `npx jest src/usecases/apply-payment-event/apply-payment-event.use-case.spec.ts -t "US-20.*\(C33\)"`

**C34** - Com o `EmailSender` falhando, o evento de falha mantém a barbearia `past_due` gravada e devolve o erro do e-mail no resultado; pelo webhook, a rota responde `200` e loga o erro com o `barbershopId` (AC 27) ✅
Proof: `npx jest src/usecases/apply-payment-event/apply-payment-event.use-case.spec.ts -t "US-20.*\(C34\)"`
Proof: `npx jest --config ./test/jest-e2e.json test/payment-webhook.e2e-spec.ts -t "US-20.*\(C34\)"`

**C35** - Pelo webhook, com a barbearia **ativa**: `PAYMENT_CREDIT_CARD_CAPTURE_REFUSED` com vencimento `2026-11-02` responde `200`, e `GET /subscription` mostra `status: 'past_due'` e `paymentIssueUrl: 'https://sandbox.asaas.com/i/pay_1'`; o e-mail no `FakeEmailSender` traz o link (CA-20.3, AC 23) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/payment-webhook.e2e-spec.ts -t "US-20.*\(C35\)"`

### S5 - Cancelar mantendo o período pago · ~5 arquivos · ~25 KB · ~6k

**C36** - Com a barbearia **ativa**, o use case chama `cancelSubscription('sub_1')` uma vez, grava `cancelRequestedAt = 2026-10-02T15:00:00Z`, devolve `cancelsAt: '2026-11-02'` e a barbearia continua `active` (CA-20.4, AC 28) ✅
Proof: `npx jest src/usecases/cancel-subscription/cancel-subscription.use-case.spec.ts -t "US-20.*\(C36\)"`

**C37** - Por tabela: `trialing`, `past_due` e **ativa** já cancelada lançam `NoActiveSubscriptionError` com `Não há assinatura ativa para cancelar.` sem chamar o gateway; com o gateway falhando, o use case repassa `PaymentGatewayUnavailableError` e não grava `cancelRequestedAt` (AC 30, AC 31) ✅
Proof: `npx jest src/usecases/cancel-subscription/cancel-subscription.use-case.spec.ts -t "US-20.*\(C37\)"`

**C38** - Pela rota, com a barbearia **ativa**: `POST /subscription/cancel` responde `200 { cancelsAt: '2026-11-02' }`; depois, `GET /subscription` mostra `status: 'active'`, `cancelsAt: '2026-11-02'` e `nextChargeDate: null`; um segundo `POST /subscription/cancel` responde `409` com `Não há assinatura ativa para cancelar.`; com o fake falhando numa barbearia ativa nova, responde `502` com `Não foi possível falar com o serviço de pagamento. Tente novamente.` (CA-20.4, AC 28, AC 29, AC 30, AC 31) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/subscription.e2e-spec.ts -t "US-20.*\(C38\)"`

### S6 - Adaptador, banco e observabilidade · ~10 arquivos · ~70 KB · ~18k

**C39** - O `AsaasPaymentGateway`, com `fetch` falso: `createCardCheckout` faz `POST {ASAAS_API_URL}/checkouts` com o header `access_token` = chave, `billingTypes: ['CREDIT_CARD']`, `chargeTypes: ['RECURRENT']`, `minutesToExpire: 60`, `subscription.cycle: 'MONTHLY'`, `subscription.nextDueDate: '2026-10-02'`, um item de `value: 99` e `externalReference` = id da barbearia, e devolve o id e o `link` da resposta; `createPixSubscription` faz `POST /customers` (`name`, `cpfCnpj`, `email`, `externalReference`), `POST /subscriptions` (`billingType: 'PIX'`, `cycle: 'MONTHLY'`, `value: 99`, `nextDueDate`, `externalReference`) e lê a primeira cobrança da assinatura para devolver o `invoiceUrl`; `cancelSubscription` faz `DELETE /subscriptions/sub_1` (AC 1, AC 2, AC 28, door 4) ✅
Proof: `npx jest src/infrastructure/external/payments/asaas/asaas-payment-gateway.spec.ts -t "US-20.*\(C39\)"`

**C40** - O `AsaasPaymentGateway`, por tabela de falhas (`500`, `400`, erro de rede, sem resposta em `ASAAS_TIMEOUT_MS`) em cada uma das três operações, lança `PaymentGatewayUnavailableError`; `findSubscriptionBarbershop` faz `GET /subscriptions/sub_1` e devolve o id da barbearia pela `externalReference` (um UUID) ou pela sessão de checkout guardada, e `null` para `404` (AC 8, AC 10, AC 31, door 6) ✅
Proof: `npx jest src/infrastructure/external/payments/asaas/asaas-payment-gateway.spec.ts -t "US-20.*\(C40\)"`

**C41** - O `AsaasPaymentGateway` loga cada chamada com a operação, a duração em ms e o status HTTP ou o nome do erro, e nenhum argumento de log contém o `cpfCnpj`, a chave de API nem o corpo; o `redact` do logger cobre `*.cpfCnpj` e `req.headers["asaas-access-token"]` (AC 33) ✅
Proof: `npx jest src/infrastructure/external/payments/asaas/asaas-payment-gateway.spec.ts -t "US-20.*\(C41\)"`
Proof: `npx jest src/infrastructure/observability/logger.options.spec.ts -t "US-20.*\(C41\)"`

**C42** - Depois de um webhook aplicado, um repetido, um ignorado e um com falha no banco, `GET /metrics` mostra `payment_webhook_events_total` com `outcome` `applied`, `duplicate`, `ignored` e `failed` e `event_group` em `payment_confirmed`, `payment_failed` ou `other`, sem label com id de barbearia ou de evento (AC 32) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/payment-webhook.e2e-spec.ts -t "US-20.*\(C42\)"`

**C43** - Pelo banco, depois das migrations: `subscription_status = 'expired'` é recusado pelo `CHECK`; `payment_method = 'boleto'` é recusado; duas linhas de `barbershop_subscriptions` com o mesmo `gateway_subscription_id` são recusadas e com os dois nulos são aceitas; uma segunda linha para o mesmo `barbershop_id` é recusada; `(gateway, event_id)` repetido em `payment_gateway_events` é recusado; `barbershops.trial_warning_sent_at` aceita nulo; a migration desfaz e refaz sem erro (doors 1, 2, 3, 7) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/database/subscription-schema.e2e-spec.ts -t "US-20.*\(C43\)"`

**C44** - Pelo repositório TypeORM, contra o banco: gravar e ler a assinatura devolve os mesmos campos (método, ids do gateway, `paidUntil` como `YYYY-MM-DD`, instantes, link); achar a barbearia por `gateway_subscription_id` funciona entre barbearias; reivindicar o aviso do teste é um `UPDATE` condicional que devolve `true` uma vez e `false` depois, e `false` para barbearia `active` (doors 1, 6, 7, RN-26) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/database/typeorm-subscription.repository.e2e-spec.ts -t "US-20.*\(C44\)"`

**C45** - O `envSchema` recusa a falta de `SUBSCRIPTION_PRICE_CENTS`, `ASAAS_API_URL`, `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN`, recusa `SUBSCRIPTION_PRICE_CENTS = 0` e `ASAAS_WEBHOOK_TOKEN` com menos de 32 caracteres, e aplica `ASAAS_TIMEOUT_MS = 10000` e `SUBSCRIPTION_TRIAL_WARNING_DAYS = 3` por padrão; o `.env.example` validado pelo schema passa (Impact: configuração) ✅
Proof: `npx jest src/infrastructure/config/env.schema.spec.ts -t "US-20.*\(C45\)"`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| métodos de pagamento (2) | `credit_card` C3, C9, C39 · `pix` C5, C9, C39 | - |
| entrada do checkout inválida (3) | Pix sem documento C9 · documento inválido C1, C9 · método desconhecido C9 | - |
| formato do documento (10) | CPF formatado C1 · CPF só dígitos C1 · CNPJ formatado C1 · CNPJ só dígitos C1 · CPF dígito errado C1 · CNPJ dígito errado C1 · dígitos repetidos C1 · 10 dígitos C1 · 15 dígitos C1 · letras C1 | - |
| status no checkout (3) | `trialing` C3, C7 · `active` C7, C10 · `past_due` C7 | - |
| fuso do primeiro vencimento (2) | `America/Sao_Paulo` C4 · `America/Manaus` C4 | - |
| soma de um mês (5) | mesmo dia C2 · 31 → fevereiro C2 · 31 → fevereiro bissexto C2 · 31 → mês de 30 C2 · virada de ano C2 | - |
| eventos do Asaas que mudam o estado (5) | `PAYMENT_CONFIRMED` C12, C14, C15 · `PAYMENT_RECEIVED` C12, C14 · `PAYMENT_CREDIT_CARD_CAPTURE_REFUSED` C14, C17, C35 · `PAYMENT_REPROVED_BY_RISK_ANALYSIS` C14 · `PAYMENT_OVERDUE` C14 | - |
| eventos ignorados (2) | evento de outro tipo C14 · evento sem assinatura C14 | - |
| tenant do webhook (3) | `sub_1` gravado C12, C15 · ligado pelo gateway C13, C40 · desconhecido C13, C16 | - |
| desfecho do evento de pagamento (6) | `trialing` → `active` C12 · `past_due` → `active` C33 · `paidUntil` nunca diminui C12 · `active` → `past_due` C30 · falha do período pago C31 · falha fora de `active` C32 | - |
| transições de `subscription_status` (3) | `trialing` → `active` C12, C15 · `active` → `past_due` C30, C35 · `past_due` → `active` C33 | - |
| destinatários dos e-mails (2) | cada Dono C23, C30 · barbeiro nunca C23, C30 | - |
| janela do aviso do teste (6) | exatamente 3 dias C24 · 3 dias e 1 min C24 · 1 min C24 · agora C24 · passado C24 · dias configuráveis C24 | - |
| status no aviso do teste (3) | `trialing` C23 · `active` C25 · `past_due` C25 | - |
| `trialEndingSoon` (3) | dentro C29 · fora C29 · não `trialing` C29 | - |
| status no cancelamento (4) | ativa C36 · `trialing` C37 · `past_due` C37 · já cancelada C37, C38 | - |
| falhas do gateway (12) | checkout×500 C40 · checkout×400 C40 · checkout×rede C40 · checkout×timeout C40 · pix×500 C40 · pix×400 C40 · pix×rede C40 · pix×timeout C40 · cancelar×500 C40 · cancelar×400 C40 · cancelar×rede C40 · cancelar×timeout C40; pela rota C10 (checkout), C38 (cancelar) | - |
| falha no envio de e-mail (2) | aviso do teste C26 · cobrança recusada C34 | - |
| concorrência (3) | checkout Pix simultâneo C11 · webhook repetido C17 · job em duas instâncias C28 | - |
| atomicidade do webhook (1) | falha depois de iniciado desfaz o registro C18 | - |
| `GET /subscription` campos (9) | `status` C19, C20 · `trialEndsAt` C19 · `trialEndingSoon` C19, C29 · `priceCents` C19 · `paymentMethod` C19, C20 · `paidUntil` C19, C20 · `nextChargeDate` C19, C20, C38 · `cancelsAt` C19, C20, C38 · `paymentIssueUrl` C19, C35 | - |
| métricas (2 labels) | `outcome` 4 valores C42 · `event_group` `payment_confirmed` C42 · `event_group` `payment_failed` C42 · `event_group` `other` C42 | - |
| doors do plano (7) | 1 tabela e lock C43, C44, C11 · 2 deduplicação C17, C18, C43 · 3 estados C43, C22 · 4 port C39, C40 · 5 contrato das rotas C9, C16, C21 · 6 tenant C13, C40, C44 · 7 aviso do teste C26, C27, C28, C44 | - |
| constraints das doors 1 e 2, achadas pelo Verifier na rodada 1 (6) | `CHECK` do método C43 · PK por barbearia C43 · `UNIQUE` parcial da assinatura C43 · `UNIQUE` parcial do checkout C43 · FK de `barbershop_subscriptions` C43 · FK de `payment_gateway_events` C43 | - |
| `GET /subscription` statuses (3) | 200 C19 · 401 C21 · 403 C21 | - |
| `POST /subscription/checkout` statuses (6) | 201 C9 · 400 C9 · 401 C21 · 403 C21 · 409 C10 · 502 C10 | - |
| `POST /subscription/cancel` statuses (5) | 200 C38 · 401 C21 · 403 C21 · 409 C38 · 502 C38 | - |
| `POST /webhooks/payments/asaas` statuses (2) | 200 C15, C16 · 401 C16 | - |
| rota existente `GET /me` (1) | enum ampliado C22 | - |
| startup config: `PAYMENT_GATEWAY`, `SubscriptionsModule` e o job (2 montagens) | `AppModule` dos e2e C15, C28 · setup próprio dos unitários C3, C23 | - |
| startup config: variáveis novas (2 lugares) | `env.schema.ts` C45 · `.env.example` C45 | - |

- Claims naming a status code, route or response shape: C9, C10, C15, C16, C19, C20, C21, C22, C29, C35, C38 - each has a proof that crosses the boundary
- `500` do webhook (C18) é a falha deliberada da door 2, não um status do contrato; está provado sem entrar no `Surface`
- No other check claims more than the single case its proof exercises


## Test policy

O repositório diz como os testes são montados (use cases com fakes, gateways e HTTP em e2e), não quanto de cada tabela de decisão precisa ser afirmado. Para esta história:

| Code | Required proofs | Coverage expectation |
| --- | --- | --- |
| Decide, alcançado por uma fronteira (`StartSubscriptionCheckoutUseCase`, `ApplyPaymentEventUseCase`, `CancelSubscriptionUseCase` pelas rotas e pelo webhook; `SendTrialEndingWarningsUseCase` pelo job) | um no use case **e** um e2e pela fronteira | um caso afirmado por linha das tabelas de decisão no use case; o contrato (status, mensagem, campo da resposta, linha no banco) no e2e |
| Decide, sem fronteira própria (`CpfCnpj`, soma de um mês, tradução de evento do Asaas) | um na própria camada | um caso por fronteira e por valor da tabela |
| Gateways (adaptador do Asaas, repositório TypeORM, migration) | um na própria camada (`fetch` falso; Postgres do compose) | cada campo enviado, cada modo de falha, cada constraint |
| Repasse (controllers, presenters, módulo, job) | nenhum próprio, salvo o log do job (C27) | coberto pelo e2e de quem consome |

Evidence:

- `ApplyPaymentEventUseCase`: tipo do evento (2) × status (3) × vencimento antes/depois de `paidUntil` + tenant (gravado, ligado, desconhecido) = 9 pontos de decisão -> decide
- `StartSubscriptionCheckoutUseCase`: status (3), método (2), assinatura Pix anterior, falha do gateway = 7 pontos -> decide
- `CancelSubscriptionUseCase`: status, já cancelada, falha do gateway = 3 pontos -> decide
- `SendTrialEndingWarningsUseCase`: status, janela (2 bordas), reivindicação, falha por barbearia = 5 pontos -> decide
- closest analogue: `SendAppointmentRemindersUseCase` e `ApplyWhatsAppConnectionStateUseCase` (rotina com reivindicação; webhook que muda estado e manda e-mail), provados no mesmo formato

Cost: ~30 provas na própria camada em 9 arquivos de teste. Sem estas linhas, a tabela de eventos × status do webhook só seria percorrida pelos 4 caminhos do e2e.

## Swept

- validation: C1, C9 (documento e método na borda), C16 (corpo do webhook sem `id`/`event`), C45 (variáveis de ambiente)
- failure modes: C8, C10, C38 (gateway fora nas rotas), C18 (falha no meio do webhook desfaz), C26, C34 (e-mail que falha)
- idempotency: C17 (evento repetido pelo `id`), C12 (`CONFIRMED` + `RECEIVED` da mesma cobrança), C23 (aviso não repete), C6 (novo checkout Pix cancela o anterior)
- authorization: C21 (só Dono nas três rotas, AD-007), C16 (token do webhook)
- concurrency: C11 (checkout Pix simultâneo, lock da door 1), C28 (job em duas instâncias), C17 (reentrega)
- data lifecycle: C43 (tabelas novas vazias, `CHECK` sobre linhas todas `trialing`, colunas nulas, migration reversível); CPF/CNPJ não é guardado (C5); `payment_gateway_events` cresce sem limpeza - um evento por cobrança e por falha, volume pequeno; retenção fica para quando houver política de dados (PRD seção 19)
- dependency failure: C40 (12 combinações no adaptador), C10, C38 (502 pelas rotas), C13 (consulta ao gateway para ligar o tenant)
- state transitions: C12, C30, C33 (`trialing` → `active` → `past_due` → `active`), C31, C32 (falhas que não transicionam), C36, C37 (cancelar não muda o status)
- observability: C42 (métrica sem alta cardinalidade), C41 (log do adaptador sem dado sensível, `redact`), C27 (log do job)

## Handoff

- Arquivos existentes que a história toca (entidade, repositório, entidade ORM e fake da barbearia, `env.schema.ts` e spec, `.env.example`, `logger.options.ts` e spec, `domain-error.filter.ts`, `my-account.presenter.ts`, `app.module.ts`, `metrics.registry.ts`, fixtures de barbearia dos testes, `create-account-test-app.ts`, `truncate-account-tables.ts`, `api-docs.e2e-spec.ts`): `wc -c` = 62.662 bytes ≈ 16k tokens; analogias lidas para copiar o formato (adaptador, spec, guard e webhook da Evolution, use case e job dos lembretes, `whatsapp.module.ts`, `ApplyWhatsAppConnectionStateUseCase`): `wc -c` = 52.811 bytes ≈ 13k; arquivos novos de S1-S6 estimados pelas somas das fatias ≈ 280 KB ≈ 70k. Total ≈ 99k, abaixo do orçamento de 150k - one builder
- Mechanism: one builder (cabe no orçamento, sem pergunta)
- **Boundary:** C1-C45 fechados no commit `feat(US-20): bill subscriptions through asaas with card or pix`
- **Settled mid-build:** (1) O usuário confirmou pela referência de `POST /v3/subscriptions` que `billingType` aceita `PIX` (também `UNDEFINED`, `BOLETO`, `CREDIT_CARD`); a Assumption do plano ficou `PIX`, confirmada, sem o `BOLETO` de reserva. (2) O lock trava a linha de `barbershops`, não a de `barbershop_subscriptions`, que não existe antes do primeiro checkout: door 8 acrescentada ao `Landing` antes do código. (3) O 400 do CPF/CNPJ sai do schema Zod da rota (`InvalidValueError` não tem status no `DomainErrorFilter`), no formato `{ message: 'Dados inválidos.', errors: [{ field: 'cpfCnpj', message }] }` que as provas C9 afirmam. (4) Um checkout em teste cancela qualquer assinatura do gateway ainda gravada (só pode ser uma Pix não paga), também quando o novo método é cartão; o AC 3 só pede para o Pix, e deixar a Pix viva ao trocar para cartão geraria fatura dupla. (5) O adaptador apaga a assinatura Pix que acabou de criar quando o Asaas não devolve a fatura, e trata o `404` do `DELETE` como já cancelada, para um checkout repetido depois de uma falha no meio. (6) As variáveis novas também entraram no `.env` local (não versionado) para os e2e subirem.
- **Abandoned:** nada
- **Verificação, rodada 1 (FAIL de cobertura, sem teste vermelho):** o Verifier achou sem prova o `UNIQUE` parcial de `gateway_checkout_id`, as duas FKs para `barbershops` e o valor `event_group="payment_failed"` da métrica, além de duas lacunas de precisão (C29 depois do e-mail enviado; ordem cancelar-antes-de-criar no C6). Fechadas com asserções novas nas provas de C43, C42, C29 e C6; nenhuma asserção existente mudou
