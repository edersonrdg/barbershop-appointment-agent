# US-20: Cobrança recorrente da assinatura verification

**Verdict**: PASS
**Profile**: standard
**Diff range**: c2d1520..0081ad75ab387b52dcec6eaac30943dbe9c83832 (feature base c2d1520; round-2 fix range b2d5fa1..0081ad7)
**Round**: 2 - scoped
**Verifier**: independent sub-agent (author != verifier)

Round 1, at `b2d5fa1`, failed on coverage, not on any proof. Three coverage members had no proof: the `gateway_checkout_id` partial UNIQUE, the FK `barbershop_subscriptions -> barbershops`, and the metric value `event_group="payment_failed"`. The `Test policy` row "Gateways ... cada constraint" was unmet, and C29 and C6 had precision gaps.

The fix commit `0081ad7` changes only tests and `checks.md`; no production file is in `git diff --stat b2d5fa1..0081ad7`. The working tree also has an uncommitted rename of one Coverage row in `checks.md`; this report reads the file as it is now. The fix closes every round-1 gap:

- Every proof was re-run in full at `0081ad7` and is green.
- Each new assertion was shown able to fail, by 5 injected faults, all killed.
- The 3 members are now proven, the Test policy row is met, and both precision gaps are closed.

## Binding sources

Carried from b2d5fa1. Profile `standard`: step 1 does not run.

## Checks

Proofs verified at 0081ad7, with two batched invocations:

- unit: `npx jest <11 spec files> -t "US-20.*\((C[0-9]+)\)"` - exit 0, 96 passed, 0 failed
- e2e: `npx jest --config ./test/jest-e2e.json <5 spec files> -t "US-20.*\((C[0-9]+)\)"` - exit 0, 30 passed, 0 failed. C43 went from 7 to 9 tests.

Per-check counts of individually passed tests, from the jest JSON: C1 10, C2 5, C3 1, C4 2, C5 1, C6 2, C7 3, C8 2, C9 1, C10 1, C11 1, C12 1, C13 3, C14 13, C15 1, C16 1, C17 1, C18 1, C19 1, C20 1, C21 1, C22 1, C23 1, C24 6, C25 2, C26 1, C27 3, C28 1, C29 1, C30 1, C31 1, C32 2, C33 1, C34 1+1, C35 1, C36 1, C37 4, C38 1, C39 3, C40 30, C41 2, C42 1, C43 9, C44 4, C45 7.

Citations were refreshed (verified at 0081ad7) for the 4 files the fix touched: `start-subscription-checkout.use-case.spec.ts` (C3-C8), `test/subscription.e2e-spec.ts` (C9-C11, C19-C22, C29, C38), `test/payment-webhook.e2e-spec.ts` (C15-C18, C34, C35, C42) and `test/database/subscription-schema.e2e-spec.ts` (C43). All other citations are carried from b2d5fa1; their files are unchanged in `b2d5fa1..0081ad7`, so their line numbers still hold.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | CpfCnpj accepts 4, keeps digits; rejects 6 with message | unit batch exit 0 (10) | `src/domain/value-objects/cpf-cnpj.spec.ts:11` - `expect(CpfCnpj.create(raw).value).toBe(digits)`; `:24-27` - `toThrow(new InvalidValueError(CPF_CNPJ_MESSAGE))`, message `'Informe um CPF ou CNPJ válido.'` | PASS |
| C2 | +1 calendar month, 5 cases | unit batch exit 0 (5) | `src/domain/value-objects/calendar-date.spec.ts:11` - `expect(addCalendarMonth(date)).toBe(expected)` over `:5-9` | PASS |
| C3 | card checkout args, chk_1 stored, stays trialing | unit batch exit 0 | `src/usecases/start-subscription-checkout/start-subscription-checkout.use-case.spec.ts:60-67` - `cardCheckouts toEqual([{ ..., priceCents: 9900, firstDueDate: '2026-10-02', returnUrl: 'http://painel.test/assinatura' }])`; `:72-74` - `'chk_1'`, `'credit_card'`, `'trialing'` | PASS |
| C4 | first due date local in SP and Manaus | unit batch exit 0 (2) | `start-subscription-checkout.use-case.spec.ts:89-90` - `firstDueDate).toBe('2026-10-02')` for card and Pix | PASS |
| C5 | Pix args, stores sub_1/cus_1/pix, document not stored | unit batch exit 0 | `start-subscription-checkout.use-case.spec.ts:99-110` - `payer: { ..., cpfCnpj: '52998224725' }`; `:113-115`; `:127` - `persisted).not.toContain('52998224725')` | PASS |
| C6 | cancels sub_0 before creating; cancel failure creates nothing | unit batch exit 0 (2) | `start-subscription-checkout.use-case.spec.ts:148` - `expect(cancelledBeforeCreate).toEqual([['sub_0']])` (the order, captured inside the `createPixSubscription` spy); `:149` - `cancelled toEqual(['sub_0'])`; `:164-167` - `PaymentGatewayUnavailableError`, `pixSubscriptions toHaveLength(0)` | PASS |
| C7 | active/past_due -> error, no gateway; trialing proceeds | unit batch exit 0 (3) | `start-subscription-checkout.use-case.spec.ts:180-187` - `SubscriptionAlreadyExistsError`, `toThrow('Esta barbearia já tem uma assinatura.')`, `gateway.calls toBe(0)`; `:196` - `toBe(1)` | PASS |
| C8 | gateway failure propagates, nothing stored | unit batch exit 0 (2) | `start-subscription-checkout.use-case.spec.ts:208-215` - `PaymentGatewayUnavailableError`, `'trialing'`, three ids `toBeNull()` | PASS |
| C9 | route 201 card/pix, 400 x3 with messages | e2e batch exit 0 | `test/subscription.e2e-spec.ts:76-81`, `:86-92` `.expect(201)`; `:94-98` `.expect(400)` + `'Informe o CPF ou CNPJ para pagar com Pix.'`; `:100-107` `'Informe um CPF ou CNPJ válido.'`; `:109` boleto `.expect(400)` | PASS |
| C10 | route 409/502 with messages; stays trialing | e2e batch exit 0 | `test/subscription.e2e-spec.ts:116-117` `.expect(409)` `ALREADY_SUBSCRIBED`; `:121-126` `.expect(502)` `GATEWAY_DOWN`, `{ status: 'trialing', paymentMethod: null }` | PASS |
| C11 | concurrent Pix checkouts leave one live sub, the stored one | e2e batch exit 0 | `test/subscription.e2e-spec.ts:145` - `livePixSubscriptions).toHaveLength(1)`; `:152` - `row.gateway_subscription_id).toBe(livePixSubscriptions[0])` | PASS |
| C12 | confirmed -> active, paidUntil 2026-11-02, never shrinks | unit batch exit 0 | `src/usecases/apply-payment-event/apply-payment-event.use-case.spec.ts:76-78`, `:81`, `:84` - `paidUntil).toBe('2026-11-02')` | PASS |
| C13 | link via gateway; null -> ignored | unit batch exit 0 (3) | `apply-payment-event.use-case.spec.ts:98-101` - `lookups toEqual(['sub_1'])`, `'applied'`, `'sub_1'`, `'active'`; `:112-113`; `:123-126` - `'ignored'`, `'trialing'`, `events.size 0` | PASS |
| C14 | Asaas event table | unit batch exit 0 (13) | `src/infrastructure/external/payments/asaas/asaas-payment-event.spec.ts:24` - `toEqual({ ..., kind, ... })` over `:18-22`; `:42` - `kind).toBe('other')`; `:48` - no subscription `'other'` | PASS |
| C15 | webhook confirmed -> GET active/paidUntil/nextChargeDate | e2e batch exit 0 | `test/payment-webhook.e2e-spec.ts:124` `.expect(200)`; `:126-131` - `{ status: 'active', paidUntil: '2026-11-02', nextChargeDate: '2026-11-02' }` | PASS |
| C16 | 401 token; 200 no-op bad body / unknown sub | e2e batch exit 0 | `test/payment-webhook.e2e-spec.ts:138-140` `.expect(401)` x2, `'trialing'`; `:142-151` `.expect(200)` x3, `'trialing'`, `lookups toContain('sub_unknown')` | PASS |
| C17 | same event twice -> 1 row, 1 e-mail | e2e batch exit 0 | `test/payment-webhook.e2e-spec.ts:161-165` - `eventRows toBe(1)`, `failureEmails() toHaveLength(1)` | PASS |
| C18 | failure mid-apply -> 500, no row; redelivery applies | e2e batch exit 0 | `test/payment-webhook.e2e-spec.ts:173-180` - `.expect(500)`, `toBe(0)`, `'trialing'`; `.expect(200)`, `toBe(1)`, `'active'` | PASS |
| C19 | GET new barbershop: exact 9-field body | e2e batch exit 0 | `test/subscription.e2e-spec.ts:158-170` - `body).toEqual({ status: 'trialing', ..., priceCents: 9900, paymentMethod: null, ... paymentIssueUrl: null })` | PASS |
| C20 | GET active: nextChargeDate = paidUntil, cancelsAt null | e2e batch exit 0 | `test/subscription.e2e-spec.ts:176-182` | PASS |
| C21 | barber 403, no token 401, 3 routes, no gateway call | e2e batch exit 0 | `test/subscription.e2e-spec.ts:203-209` - `.expect(403)` `ACCESS_DENIED`, `.expect(401)`, `gateway.calls toBe(0)` | PASS |
| C22 | GET /me active and past_due | e2e batch exit 0 | `test/subscription.e2e-spec.ts:219-222` `'active'`; `:228-231` `'past_due'` | PASS |
| C23 | 2 owners exact copy, barber none, claim stored, rerun none | unit batch exit 0 | `src/usecases/send-trial-ending-warnings/send-trial-ending-warnings.use-case.spec.ts:76-93` | PASS |
| C24 | warning window, 6 rows | unit batch exit 0 (6) | `send-trial-ending-warnings.use-case.spec.ts:110-112` over `:97-102` | PASS |
| C25 | active/past_due not warned | unit batch exit 0 (2) | `send-trial-ending-warnings.use-case.spec.ts:123-125` | PASS |
| C26 | failing e-mail keeps claim, run goes on | unit batch exit 0 | `send-trial-ending-warnings.use-case.spec.ts:147-155`, `:166` | PASS |
| C27 | job logs, no e-mail in log, cron `0 * * * *` | unit batch exit 0 (3) | `src/infrastructure/jobs/trial-ending-warning.job.spec.ts:54-65`, `:83` - `cronTime).toBe('0 * * * *')` | PASS |
| C28 | two concurrent job runs -> 1 e-mail | e2e batch exit 0 | `test/trial-ending-warning.e2e-spec.ts:44-45` | PASS |
| C29 | trialEndingSoon true (also after e-mail), false, false (active) | e2e batch exit 0 | `test/subscription.e2e-spec.ts:241-243` - `{ trialEndingSoon: true }`; `:244-250` - after `UPDATE barbershops SET trial_warning_sent_at`, still `{ trialEndingSoon: true }` (round-1 precision gap closed); `:253-255` `false`; `:260-262` `false` for the active barbershop | PASS |
| C30 | failure -> past_due, exact e-mail per owner | unit batch exit 0 | `apply-payment-event.use-case.spec.ts:142-163` | PASS |
| C31 | failure before paidUntil ignored | unit batch exit 0 | `apply-payment-event.use-case.spec.ts:171-174` | PASS |
| C32 | failure while trialing/past_due ignored | unit batch exit 0 (2) | `apply-payment-event.use-case.spec.ts:196-199` | PASS |
| C33 | past_due + confirmed -> active, cleared | unit batch exit 0 | `apply-payment-event.use-case.spec.ts:213-216` - `paidUntil '2026-12-02'` | PASS |
| C34 | e-mail failure keeps past_due; webhook 200 + log | unit + e2e exit 0 | `apply-payment-event.use-case.spec.ts:226-228`; `test/payment-webhook.e2e-spec.ts:192-198` | PASS |
| C35 | webhook refused -> past_due + url, e-mail link | e2e batch exit 0 | `test/payment-webhook.e2e-spec.ts:208-215` | PASS |
| C36 | cancel, cancelsAt, stays active | unit batch exit 0 | `src/usecases/cancel-subscription/cancel-subscription.use-case.spec.ts:38-41` | PASS |
| C37 | nothing to cancel / gateway failure | unit batch exit 0 (4) | `cancel-subscription.use-case.spec.ts:58-62`, `:70-73` | PASS |
| C38 | route cancel 200/GET/409/502 | e2e batch exit 0 | `test/subscription.e2e-spec.ts:268-270` `.expect(200)` `{ cancelsAt: '2026-11-02' }`; `:271-275` `{ status: 'active', cancelsAt: '2026-11-02', nextChargeDate: null }`; `:276` `.expect(409)`; `:281` `.expect(502)` | PASS |
| C39 | adapter request shapes | unit batch exit 0 (3) | `src/infrastructure/external/payments/asaas/asaas-payment-gateway.spec.ts:102-115`, `:127-145`, `:165-168` | PASS |
| C40 | 12 failure combos; find by ref/checkout; 404 null | unit batch exit 0 (30) | `asaas-payment-gateway.spec.ts:181-200`, `:248-251`, `:260` | PASS |
| C41 | adapter log fields, no secrets; redact paths | unit batch exit 0 (2) | `asaas-payment-gateway.spec.ts:271-292`; `src/infrastructure/observability/logger.options.spec.ts:52`, `:74` | PASS |
| C42 | metrics: 4 outcomes, 3 groups, no tenant label | e2e batch exit 0 | `test/payment-webhook.e2e-spec.ts:224` - posts `PAYMENT_OVERDUE`; `:238-252` - `value(...) toBeGreaterThanOrEqual(1)` for `payment_confirmed`/applied, `payment_confirmed`/duplicate, `other`/ignored, `payment_failed`/applied (`:248`, new), `payment_confirmed`/failed; `:254-256` - every line matches the 2-label regex | PASS |
| C43 | CHECKs, uniques, PK, FKs, nullable column, migration down/up | e2e batch exit 0 (9) | `test/database/subscription-schema.e2e-spec.ts:84-91` `CHECK_VIOLATION`; `:96-98` `CHECK_VIOLATION`; `:109-117` sub UNIQUE `UNIQUE_VIOLATION`; `:120-131` checkout UNIQUE `UNIQUE_VIOLATION` (new); `:134-146` both FKs `toBe(FOREIGN_KEY_VIOLATION)` (new); `:152` PK; `:164` event PK; `:172` `toBeNull()`; `:182`, `:188` down/up | PASS |
| C44 | repo round-trip, cross-tenant lookup, conditional claim | e2e batch exit 0 (4) | `test/database/typeorm-subscription.repository.e2e-spec.ts:62-86`, `:102-108`, `:117-119` | PASS |
| C45 | env schema | unit batch exit 0 (7) | `src/infrastructure/config/env.schema.spec.ts:232`, `:238`, `:241`, `:246-249`, `:257` | PASS |

Level: carried from b2d5fa1, re-checked for the touched claims. The new C42/C43 assertions run against HTTP/Postgres. No level gap.

Remaining precision note (not a gap): the claim texts of C42 and C43 were not updated to name the new members. Those members now appear only in the Coverage rows of `checks.md` and in the proofs.

## Coverage

Verified at 0081ad7 for the 3 rows whose authority or proofs the fix touched: metrics `event_group`, door 1 constraints, door 2 constraints. The other rows are carried from b2d5fa1, because the fix touched no production file. Recomputed from `src/usecases/ports/payment-metrics.port.ts:3-4` and migration `src/infrastructure/database/migrations/1790956376701-AddSubscriptions.ts:13-35`. I also cross-checked the new `checks.md` row "constraints das doors 1 e 2, achadas pelo Verifier na rodada 1 (6)", which matches.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| métricas `event_group` (3) - verified at 0081ad7 | `payment-metrics.port.ts:3-4` | `payment_confirmed` C42 `:239` · `payment_failed` C42 `:248` (fault 3 killed) · `other` C42 `:245` | - |
| métricas `outcome` (4) - verified at 0081ad7 | `payment-metrics.port.ts:6-7` | applied, duplicate, ignored, failed C42 `:238-252` | - |
| door 1 constraints (5) - verified at 0081ad7 | Landing door 1; migration `:13-17`, `:30-32` | PK `barbershop_id` C43 `:152` · `payment_method` CHECK C43 `:96-98` · `gateway_subscription_id` partial UNIQUE C43 `:109-117` · `gateway_checkout_id` partial UNIQUE C43 `:120-131` (fault 1 killed) · FK -> `barbershops` C43 `:134-137` (fault 2 killed) | - |
| door 2 constraints (2) - verified at 0081ad7 | Landing door 2; migration `:21-23`, `:33-35` | PK `(gateway, event_id)` C43 `:164`, C17 · FK -> `barbershops` C43 `:138-146` | - |
| door 3 constraint (1) | carried from b2d5fa1 | `subscription_status` CHECK C43 `:84-91` | - |
| door 7 column + claim (2) | carried from b2d5fa1 | nullable C43 `:172` · conditional UPDATE C44 `:117-119`, C28 | - |
| door 8 lock (1) | carried from b2d5fa1 | C11 (round-1 fault killed) | - |
| `trialEndingSoon` (3 + independence) - verified at 0081ad7 | AC 22 | dentro C29 `:241` · after warning sent C29 `:249` (fault 5 killed) · fora C29 `:253` · não trialing C29 `:260` | - |
| métodos de pagamento (2) | carried from b2d5fa1 | C3, C5, C9, C39 | - |
| entrada inválida do checkout (3) | carried from b2d5fa1 | C1, C9 | - |
| formato do documento (10) | carried from b2d5fa1 | C1 | - |
| status no checkout (3) | carried from b2d5fa1 | C3, C7, C10 | - |
| fuso do primeiro vencimento (2) | carried from b2d5fa1 | C4 | - |
| soma de um mês (5) | carried from b2d5fa1 | C2 | - |
| eventos do Asaas mapeados (5) | carried from b2d5fa1, `asaas-payment-event.ts:10-16` | C14, C15, C17, C35 | - |
| eventos ignorados (3) | carried from b2d5fa1 | C14, C16 | - |
| tenant do webhook (4) | carried from b2d5fa1 | C12, C13, C15, C16, C40, C44 | - |
| desfecho do evento (6) | carried from b2d5fa1 | C12, C30-C33 | - |
| transições de `subscription_status` (3) | carried from b2d5fa1 | C12, C15, C30, C33, C35 | - |
| destinatários dos e-mails (2) | carried from b2d5fa1 | C23, C30 | - |
| janela do aviso (6) | carried from b2d5fa1 | C24 | - |
| status no aviso (3) | carried from b2d5fa1 | C23, C25 | - |
| status no cancelamento (4) | carried from b2d5fa1 | C36, C37, C38 | - |
| falhas do gateway (12) | carried from b2d5fa1 | C40; route C10, C38 | - |
| falha no envio de e-mail (2) | carried from b2d5fa1 | C26, C34 | - |
| concorrência (3) | carried from b2d5fa1 | C11, C17, C28 | - |
| `GET /subscription` campos (9) | carried from b2d5fa1 | C19 exact; C20, C29, C35, C38 | - |
| `GET /subscription` statuses (3) | carried from b2d5fa1 | C19, C21 | - |
| `POST /subscription/checkout` statuses (6) | carried from b2d5fa1 | C9, C10, C21 | - |
| `POST /subscription/cancel` statuses (5) | carried from b2d5fa1 | C21, C38 | - |
| `POST /webhooks/payments/asaas` statuses (2 + door-2 500) | carried from b2d5fa1 | C15, C16, C18 | - |
| rota existente `GET /me` (2 new values) | carried from b2d5fa1 | C22 | - |
| startup config: `SubscriptionsModule` / `PAYMENT_GATEWAY` factory | carried from b2d5fa1 | e2e `AppModule` boot C15, C28; factory read at `src/infrastructure/modules/subscriptions.module.ts:62-71` | - |
| startup config: new variables (2 places) | carried from b2d5fa1 | C45 | - |

## Test policy rows

Re-judged at 0081ad7: the row unmet in round 1. The other rows are carried from b2d5fa1, since the fix touched none of the files they classify except test files, which only strengthened them.

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Decide, alcançado por uma fronteira (carried from b2d5fa1) | the 4 use cases | use case + boundary e2e | yes |
| Decide, sem fronteira própria (carried from b2d5fa1) | `cpf-cnpj.ts`, `calendar-date.ts`, `asaas-payment-event.ts` | C1, C2, C14 tables | yes |
| Gateways (verified at 0081ad7) | `asaas-payment-gateway.ts`, `typeorm-subscription.repository.ts`, `1790956376701-AddSubscriptions.ts` | adapter C39-C41 · repository C44 · migration C43: all 8 migration constraints (2 CHECK, 2 PK, 2 partial UNIQUE, 2 FK) each asserted, with the new ones made to fail by faults 1-2 | yes |
| Repasse (carried from b2d5fa1) | controllers, guard, presenter, module, job | C27 + e2e | yes |

`Swept`: carried from b2d5fa1. No row resolves to an "existing" constraint.

## Faults injected

Verified at 0081ad7. These faults target only the surfaces the fix created, the 5 new assertions; the 5 round-1 faults are carried from b2d5fa1, all killed.

Isolation:

- Code was mutated only in `git worktree add /tmp/claude-1000/us20-verify HEAD`, with `node_modules` symlinked.
- For the migration faults, the worktree's `.env` pointed `DB_NAME` at a throwaway database, `us20_verify_scratch`, created on the compose Postgres server. It was dropped and recreated before each run and dropped at the end; afterwards `pg_database` has no `us20%` row.
- The shared `barbershop` database was never touched by a mutant. A control run of C43 against the scratch DB, unmutated, passed 9/9 first.
- The real tree's `git status --porcelain` matched its baseline (` M checks.md`, `?? verification.md`) before and after `git worktree remove --force`. `git stash` was never used.

| Mutation | Location | Killed |
| --- | --- | --- |
| migration without the `gateway_checkout_id` partial UNIQUE index (up and down) | `1790956376701-AddSubscriptions.ts:15-17`, `:55-57` | yes - C43 `Expected "23505" Received undefined` (checkout test `:120-131`) |
| migration without the `barbershop_subscriptions` FK (up and down) | `1790956376701-AddSubscriptions.ts:30-32`, `:42-44` | yes - C43 `Expected "23503" Received undefined` (`:134-137`) |
| metric relabels `payment_failed` as `other` | `src/infrastructure/observability/prometheus-payment-metrics.ts:21` | yes - C42 `:248` `Expected >= 1 Received 0` alone, and also when the whole US-20 webhook file runs (earlier failure posts do not mask it) |
| checkout cancels the unpaid Pix after creating the new one | `src/usecases/start-subscription-checkout/start-subscription-checkout.use-case.ts:64` moved after `:83` | yes - C6 `:148` received `[[]]` instead of `[['sub_0']]` |
| read path hides the trial banner once the warning was sent (`trialEndsAt` -> epoch when `trialWarningSentAt` set) | `src/infrastructure/database/repositories/typeorm-subscription.repository.ts:118` | yes - C29 `:249` `trialEndingSoon` `true` expected, `false` received |

## Gate

- `npx jest <11 unit spec files> -t "US-20.*\((C[0-9]+)\)"` at 0081ad7 - 96 passed, 0 failed
- `npx jest --config ./test/jest-e2e.json <5 e2e spec files> -t "US-20.*\((C[0-9]+)\)"` at 0081ad7 - 30 passed, 0 failed
- Total 126 passed, 0 failed. 45/45 checks proven, 0 unproven coverage members, 10/10 faults killed across the two rounds, all 4 Test policy rows met.
