# US-21: Suspensão por assinatura inativa verification

**Verdict**: PASS
**Profile**: standard
**Diff range**: aa4e121..2a1f830 (fix diff a93432f..2a1f830)
**Round**: 2 - scoped
**Verifier**: independent sub-agent (author != verifier)

Round 2 is scoped by the fix diff `a93432f..2a1f830` and by every verdict that was not PASS in round 1. The fix touches no production code. It adds one test labelled `(C35)` in `src/domain/entities/barbershop-subscription.spec.ts` (lines 139-151) and changes the `Coverage` and `Handoff` sections of `checks.md`. All proofs were re-run in full at 2a1f830. Fault F2, the round-1 survivor, was re-injected in a fresh worktree and is now killed by the new test. The coverage member it exposed is now proven, and the Test policy row it left unmet is now met. Nothing in round 1 failed for any other reason. Gaps 3 and 4 stay observations, judged the same way as in round 1.

## Binding sources

_carried from a93432f: the fix touches no route, schema or behaviour, only a domain test and `checks.md`._

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| `docs/PRD.md` §11 US-21, CA-21.1 to CA-21.4 (lines 743-760), no UI screens | yes - read in full | none: CA-21.1 maps to C8, C11; CA-21.2 maps to C15-C20 (the "aviso" is the `suspensionReason` field; screens are out of scope, in `barbershop-panel`); CA-21.3 maps to C2, C21; CA-21.4 maps to C28, C29, C33 | - |
| `docs/PRD.md` RF-43 (line 223), RN-25 (line 321), D-16 | yes | none. `subscription_ended` goes beyond RN-25's two triggers ("fim do teste" / "falha de pagamento"). It is still an inactive subscription under RF-43, and the US-20 plan's Out of scope defers it here, so it extends the PRD rather than contradicting it. The 5-day tolerance is configurable (`SUBSCRIPTION_GRACE_DAYS`), as the "sugestão, a validar" rule in CLAUDE.md requires | - |
| `CLAUDE.md` (Swagger, RN-26, metrics, config rules) | yes | none: 402 documented by derivation (`api-document.ts:139-148`); tenant comes from session (`subscription-access.guard.ts:62`); metric label `reason` is low-cardinality; new env var is in `env.schema.ts:112` and `.env.example:53` | - |

## Checks

_verified at 2a1f830: proofs re-run in full. Citations were refreshed for the one touched file, `barbershop-subscription.spec.ts`; lines after 136 moved by 14. Every other citation is unchanged because those files are not in the fix diff._

Proof runs (one invocation per runner, each named test confirmed individually via `--json` `assertionResults`, all 34 check ids present among the passed tests):

- unit: `npx jest <7 spec files> -t "US-21.*\((C1|C2|C3|C4|C5|C6|C8|C9|C10|C13|C24|C27|C30|C32|C34|C35)\)"` exit 0: 31 passed, 145 skipped, 0 failed (C35 now matches 2 tests)
- e2e: `npx jest --config ./test/jest-e2e.json test/subscription-suspension.e2e-spec.ts test/api-docs.e2e-spec.ts -t "US-21.*\((C11|...|C33)\)"` exit 0: 18 passed, 19 skipped, 0 failed
- shell: C7 `grep -qx ...` exit 0; C36 `test -z "$(git diff --name-only main...HEAD -- src/infrastructure/database/migrations)"` exit 0 (main = aa4e121)

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | trial: `trialEndsAt` = now -> `trial_ended`; +1 ms -> null | unit batch, passed | `src/domain/entities/barbershop-subscription.spec.ts:58` - `expect(subscription({ trialEndsAt: NOW }).suspensionReason(NOW, 5)).toBe('trial_ended')`; `:61-65` - `trialEndsAt: NOW+1` -> `.toBeNull()` | PASS |
| C2 | past_due exactly 5×24h -> `payment_overdue`; −1 ms -> null | unit batch, passed | `barbershop-subscription.spec.ts:69` - `expect(pastDue(5 * DAY_MS).suspensionReason(NOW, 5)).toBe('payment_overdue')`; `:72` - `expect(pastDue(5 * DAY_MS - 1).suspensionReason(NOW, 5)).toBeNull()` | PASS |
| C3 | graceDays 2: 48h overdue, 47h null; graceDays 0: overdue at once | unit batch, passed | `barbershop-subscription.spec.ts:76` - `pastDue(2 * DAY_MS).suspensionReason(NOW, 2)).toBe('payment_overdue')`; `:79` - `pastDue(47 * HOUR_MS)...toBeNull()`; `:80` - `pastDue(0).suspensionReason(NOW, 0)).toBe('payment_overdue')` | PASS |
| C4 | cancelled, local-day boundary in SP; Manaus 23:30 local -> null | unit batch, passed | `barbershop-subscription.spec.ts:85-87` - `suspensionReason(new Date('2026-11-03T02:59:59.999Z'), 5)).toBeNull()`; `:88` - `'2026-11-03T03:00:00.000Z'` -> `.toBe('subscription_ended')`; `:91-96` - Manaus `'2026-11-03T03:30:00.000Z'` -> `.toBeNull()` | PASS |
| C5 | active without cancel (paidUntil in past) and future trial -> null | unit batch, passed | `barbershop-subscription.spec.ts:100-107` - active `paidUntil: '2026-01-01'` -> `.toBeNull()`; `:108-112` - `trialEndsAt` +10 days -> `.toBeNull()` | PASS |
| C6 | default 5, `0` accepted, `-1`/`1.5`/`abc` rejected | unit batch, passed (4 tests) | `src/infrastructure/config/env.schema.spec.ts:263` - `toMatchObject({ SUBSCRIPTION_GRACE_DAYS: 5 })`; `:266` - `'0'` -> `{ SUBSCRIPTION_GRACE_DAYS: 0 }`; `:274-276` - `validateEnv({...SUBSCRIPTION_GRACE_DAYS: value})).toThrow()` for each of `-1`,`1.5`,`abc` | PASS |
| C7 | `.env.example` declares `SUBSCRIPTION_GRACE_DAYS=5` | `grep -qx` exit 0 | `.env.example:53` - `SUBSCRIPTION_GRACE_DAYS=5` | PASS |
| C8 | suspended bot sends exact fixed text, interpreter not called, `kind: 'suspended'` | unit batch, passed | `src/usecases/answer-client-question/answer-client-question.use-case.spec.ts:1256` - `expect(connector.sentTexts).toEqual([{ barbershopId: 'barbershop-a', phone: PHONE, text: SUSPENDED_REPLY }])` (literal at `:84-85`); `:1259` - `expect(interpreter.inputs).toEqual([])`; `:1260` - `toEqual({ outcome: 'sent', kind: 'suspended' })` | PASS |
| C9 | with an offer in force: choice/cancel/reschedule/confirm act on nothing, draft unchanged | unit batch, passed | `answer-client-question.use-case.spec.ts:1024` - `expect(texts).toEqual(Array(4).fill(SUSPENDED_REPLY))`; `:1026` - `bookedBy(...)).toHaveLength(booked)`; `:1027` - `statusOf('X')).toBe('confirmed')`; `:1028` - `bookingDraft).toEqual(draft)` | PASS |
| C10 | paused conversation: no send, `outcome: 'none'` | unit batch, passed | `answer-client-question.use-case.spec.ts:1278` - `expect(result).toEqual({ outcome: 'none' })`; `:1279` - `expect(connector.sentTexts).toEqual([])` | PASS |
| C11 | new phone via webhook: 204, client row, privacy notice then fixed reply, no interpreter | e2e batch, passed | `test/subscription-suspension.e2e-spec.ts:229` - helper `.expect(204)`; `:352` - `expect(Number(row.count)).toBe(1)`; `:353-363` - `connector.sentTexts).toEqual([{...privacyNoticeText(SHOP_NAME, ...)}, {..., text: SUSPENDED_REPLY}])`; `:364` - `interpreter.inputs).toEqual([])` | PASS |
| C12 | `whatsapp_replies_total{kind="suspended"}` +1 | e2e batch, passed | `subscription-suspension.e2e-spec.ts:380-382` - `expect(await metricValue('whatsapp_replies_total{kind="suspended"}')).toBe(before + 1)` | PASS |
| C13 | job reminds only the non-suspended shop; suspended gets no 24h/1h claim | unit batch, passed | `src/usecases/send-appointment-reminders/send-appointment-reminders.use-case.spec.ts:539-541` - `sentTexts.map(...barbershopId)).toEqual(['barbershop-b'])`; `:543-544` - `reminder24hSentAt`/`reminder1hSentAt` `.toBeNull()` for `x` (24h) and `z` (1h); `:546` - `marks('bx','barbershop-b').reminder24hSentAt).toEqual(NOW)` | PASS |
| C14 | `AppointmentRemindersJob.run()` leaves both marks null, no send (real repo) | e2e batch, passed | `subscription-suspension.e2e-spec.ts:406` - `rows).toHaveLength(2)`; `:408-409` - `reminder_24h_sent_at`/`reminder_1h_sent_at` `.toBeNull()`; `:411` - `connector.sentTexts).toEqual([])` | PASS |
| C15 | `POST /settings/services` 402 + exact message, nothing stored; back in trial 201 | e2e batch, passed | `subscription-suspension.e2e-spec.ts:419` - `.expect(402)`; `:421` - `refused.body).toEqual({ message: SUSPENDED_WRITE })`; `:422` - `serviceCount()).toBe(0)`; `:428-429` - `.expect(201)`, `serviceCount()).toBe(1)` | PASS |
| C16 | PUT rules / PATCH status / DELETE user (Owner), POST blocks (Barber) -> 402, targets unchanged | e2e batch, passed | `subscription-suspension.e2e-spec.ts:465-466` - per call `response.status).toBe(402)`, `body).toEqual({ message: SUSPENDED_WRITE })`; `:473` rules unchanged; `:478` `status.status).toBe('confirmed')`; `:483` user still there; `:488` `blocks).toEqual([])` | PASS |
| C17 | GET services/appointments/clients/subscription -> 200 | e2e batch, passed | `subscription-suspension.e2e-spec.ts:503-506` - `expect({ path, status: response.status }).toEqual({ path, status: 200 })` over the 4 paths | PASS |
| C18 | every `@Public()` write in `listRoutes` is not 402; login 200 with token | e2e batch, passed | `subscription-suspension.e2e-spec.ts:516` - `publicWrites.length).toBeGreaterThan(0)`; `:523-526` - `{route,status}).not.toEqual({ ..., status: 402 })`; `:531-532` - `.expect(200)`, `toHaveProperty('accessToken')` | PASS |
| C19 | expired trial: checkout 201 `{paymentUrl}`, cancel 409 with message, never 402 | e2e batch, passed | `subscription-suspension.e2e-spec.ts:542-543` - `.expect(201)`, `toHaveProperty('paymentUrl')`; `:548-551` - `.expect(409)`, `toEqual({ message: 'Não há assinatura ativa para cancelar.' })` | PASS |
| C20 | `GET /me` `trial_ended` to Owner and Barber, null in good standing, 401 without token | e2e batch, passed | `subscription-suspension.e2e-spec.ts:562-565` - `.suspensionReason).toBe('trial_ended')` per token; `:571-573` - other owner `.toBeNull()`; `:575` - `.expect(401)` | PASS |
| C21 | `GET /subscription` `payment_overdue` at 6 days, null at 4; Barber 403 `Acesso negado.`; 401 | e2e batch, passed | `subscription-suspension.e2e-spec.ts:582-584` - `toMatchObject({ suspensionReason: 'payment_overdue' })`; `:591` - `{ suspensionReason: null }`; `:593-594` - `.expect(403)`, `toEqual({ message: 'Acesso negado.' })`; `:595` - `.expect(401)` | PASS |
| C22 | ended (`paidUntil` 10-01) -> `subscription_ended` + 402; `paidUntil` 10-02 -> null + 201 | e2e batch, passed | `subscription-suspension.e2e-spec.ts:602-604` - `toMatchObject({ suspensionReason: 'subscription_ended' })`; `:605` - `postService().expect(402)`; `:612` - `{ suspensionReason: null }`; `:613` - `.expect(201)` | PASS |
| C23 | OpenAPI: 402 with the message on every authenticated write except the 2 subscription routes, nowhere else | e2e batch, passed | `test/api-docs.e2e-spec.ts:345-347` - `schema).toMatchObject({ example: { message: SUSPENDED_WRITE } })`; `:356` - `expect(documented.sort()).toEqual(expected.sort())`; `:357` - `documented).not.toContain(id)` for both exemptions | PASS |
| C24 | guard: each of 3 reasons -> 402 and one count with the reason; read / allowed write / good standing count nothing | unit batch, passed (5 tests) | `src/infrastructure/http/subscription-access.guard.spec.ts:110-112` - `getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED)`; `:116` - `metrics.blockedWrites).toEqual([reason])`; `:127` and `:134` - `metrics.blockedWrites).toEqual([])` | PASS |
| C25 | `subscription_blocked_writes_total{reason="trial_ended"}` +1 after a 402 | e2e batch, passed | `subscription-suspension.e2e-spec.ts:621` - `.expect(402)`; `:623` - `expect(await metricValue(metric)).toBe(before + 1)` | PASS |
| C26 | undecorated probe `@Post()` in AppModule: 201 in good standing, 402 suspended | e2e batch, passed | `subscription-suspension.e2e-spec.ts:630` - `probe().expect(201)`; `:632-633` - `.expect(402)`, `body).toEqual({ message: SUSPENDED_WRITE })` | PASS |
| C27 | both response schemas accept exactly the 3 reasons and null; refuse `suspended` and absence | unit batch, passed (6 tests) | `src/interface-adapters/presenters/subscription-suspension.presenter.spec.ts:51-57` - `safeParse(...).success).toBe(true)` on both schemas; `:64-70` - `.toBe(false)` for `'suspended'` and `undefined` | PASS |
| C28 | past_due 402 -> `PAYMENT_RECEIVED` -> 201 and `/me` null, same clock | e2e batch, passed | `subscription-suspension.e2e-spec.ts:640` - `.expect(402)`; `:644` - `.expect(201)`; `:649-652` - `.suspensionReason).toBeNull()` | PASS |
| C29 | expired trial + Pix `sub_1` -> `PAYMENT_CONFIRMED` -> bot calls interpreter, reply not the fixed text | e2e batch, passed | `subscription-suspension.e2e-spec.ts:665` - `interpreter.inputs).toHaveLength(1)`; `:667` - `sentTexts[0].text).not.toBe(SUSPENDED_REPLY)` | PASS |
| C30 | ended: card -> 1 card checkout, Pix -> 1 Pix subscription, never `cancelSubscription` | unit batch, passed (2 tests) | `src/usecases/start-subscription-checkout/start-subscription-checkout.use-case.spec.ts:234-235` - `cardCheckouts).toHaveLength(1)`, `cancelled).toEqual([])`; `:243-244` - `pixSubscriptions).toHaveLength(1)`, `cancelled).toEqual([])` | PASS |
| C31 | ended: `POST /subscription/checkout` card -> 201 `{paymentUrl}` | e2e batch, passed | `subscription-suspension.e2e-spec.ts:677` - `.expect(201)`; `:679` - `toHaveProperty('paymentUrl')` | PASS |
| C32 | `confirmPayment('2026-10-02')` on cancelled `paidUntil` 10-01 -> active, cancel cleared, 11-02, reason null | unit batch, passed | `barbershop-subscription.spec.ts:120-125` - `status).toBe('active')`, `cancelRequestedAt).toBeNull()`, `cancelsAt).toBeNull()`, `paidUntil).toBe('2026-11-02')`, `nextChargeDate).toBe('2026-11-02')`, `suspensionReason(NOW, 5)).toBeNull()` | PASS |
| C33 | ended -> checkout `chk_2` -> `PAYMENT_CONFIRMED` `sub_2` -> active, `cancelsAt` null, next 11-02, reason null | e2e batch, passed | `subscription-suspension.e2e-spec.ts:701-706` - `after.body).toMatchObject({ status: 'active', cancelsAt: null, nextChargeDate: '2026-11-02', suspensionReason: null })` | PASS |
| C34 | cancelled with `paidUntil` = today: `canStartCheckout` false, use case throws `SubscriptionAlreadyExistsError` with message, gateway untouched | unit batch, passed | `start-subscription-checkout.use-case.spec.ts:254` - `toBeInstanceOf(SubscriptionAlreadyExistsError)`; `:255-257` - `message).toBe('Esta barbearia já tem uma assinatura.')`; `:258` - `gateway.calls).toBe(0)`; also `barbershop-subscription.spec.ts:154` - `canStartCheckout(NOW)).toBe(false)` | PASS |
| C35 | late confirmation keeps the cancellation: `confirmPayment('2026-09-01')` keeps cancel, `paidUntil` 10-01, `subscription_ended`; and (round 2) a due date equal to `paidUntil` keeps it too | unit batch, both tests passed | `barbershop-subscription.spec.ts:134` - `cancelRequestedAt).toEqual(requestedAt)`; `:135` - `paidUntil).toBe('2026-10-01')`; `:136` - `suspensionReason(NOW, 5)).toBe('subscription_ended')`; equal case `:145` - `cancelRequestedAt).toEqual(requestedAt)`, `:146` - `paidUntil).toBe('2026-11-01')`, `:147` - `cancelsAt).toBe('2026-11-01')`, `:148-150` - `suspensionReason(new Date('2026-11-02T03:00:00.000Z'), 5)).toBe('subscription_ended')` | PASS |
| C36 | no migration added or changed | shell exit 0, empty diff list | `git diff --name-only main...HEAD -- src/infrastructure/database/migrations` printed nothing (main = aa4e121, HEAD = 2a1f830) | PASS |

## Coverage

_The rows for `confirmPayment` cancel-clearing and the `POST /subscription/checkout` statuses were verified at 2a1f830, because the fix touched their authority or their citation. Every other row is carried from a93432f: no production code changed, so no member was added or removed._

Each set was recomputed from the source that holds authority over it: the code for routes, branches and assemblies, and the plan or PRD for behaviour. The author's table was not reused.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| suspension reason values (4) | `SUSPENSION_REASONS` in `barbershop-subscription.ts:12-16` plus `null` | `trial_ended` C1 · `payment_overdue` C2 · `subscription_ended` C4 · `null` C1, C2, C4, C5 | - |
| boundaries of `suspensionReason` / `hasEnded` (6) | branches `barbershop-subscription.ts:117-131` | `>= trialEndsAt` both sides C1 · `>= failed + grace` both sides C2, C3 · `localDate > paidUntil` both sides C4 · no cancel C5 | - |
| `confirmPayment` cancel-clearing (`startsNewPeriod`, 4) - verified at 2a1f830 | `barbershop-subscription.ts:183` plus plan `Impact` row 3 and checks Handoff "Settled mid-build (2)" | `previous === null` (US-20 first payment, unchanged) · `dueDate > paidUntil` clears C32, C33 · `dueDate < paidUntil` keeps C35 (`spec.ts:134-136`) · `dueDate == paidUntil` keeps C35 (`spec.ts:145-150`; F2 re-injected and killed) | - |
| `canStartCheckout(now)` branches (3) | `barbershop-subscription.ts:110-112` | trialing US-20 C7 · ended -> true `barbershop-subscription.spec.ts:158`, C30, C31 · cancelled still in period -> false C34 | - |
| tolerance values (3) | AC 2/3 and `env.schema.ts:112` | 5 C2 · 2 C3 · 0 C3 | - |
| timezone of the local date (2) | AC 4 / RNF-04 | `America/Sao_Paulo` C4 · `America/Manaus` C4 | - |
| `SUBSCRIPTION_GRACE_DAYS` validation (5) | `env.schema.ts:112` (`coerce.number().int().min(0).default(5)`) | absent C6 · `0` C6 · `-1` C6 · `1.5` C6 · `abc` C6 | - |
| startup config: grace days (2 places) | file read directly | `env.schema.ts:112` C6 · `.env.example:53` C7 · consumed at `subscription-access.module.ts:48` and `subscriptions.module.ts:75` (`graceDays`) | - |
| startup config: guard assembly (1) | `account.module.ts:330` `{ APP_GUARD, SessionGuard }`, then `:332` `{ APP_GUARD, SubscriptionAccessGuard }`; `app.module.ts:36` imports `AccountModule`; `main.ts:9` boots `AppModule`, the same assembly the e2e suite boots (`subscription-suspension.e2e-spec.ts:145`) | C15, C26 | - |
| authenticated write routes outside `/subscription` (18) | every controller's `@Post/@Put/@Patch/@Delete` without `@Public()`: services ×4, barbers ×4, users ×2, blocks ×2, appointments ×2, `PUT /settings/rules`, `PUT /settings/barbershop`, `POST /whatsapp/connection`, `POST /whatsapp/conversations/:clientId/resume` | per route: 402 documented, with the same `isPublic`/`allowWhileSuspended` metadata the guard reads, C23 (`documented == expected` over all 18) · runtime: route-agnostic global guard C26 (an undecorated route is refused) plus samples C15, C16 (5 routes) · `@AllowWhileSuspended` appears only on `subscription.controller.ts:37` (grep) | - |
| exempt writes (2) | `@AllowWhileSuspended()` at `subscription.controller.ts:37` | checkout C19, C31 · cancel C19 · both absent from docs 402 C23 | - |
| public write routes (7) | `@Public()` controllers: auth signup/login/forgot/reset/invitations-accept, Asaas webhook, Evolution webhook | all 7 iterated from `listRoutes` C18 · webhook also C11, C28 | - |
| HTTP write methods (4) | `READ_ONLY_WRITE_METHODS` `subscription-access.guard.ts:20-25` | POST C15 · PUT, PATCH, DELETE C16 (also unit `guard.spec.ts:137-146`) | - |
| role on a refused write (2) | PRD §5 roles | Owner C15, C16 · Barber C16 | - |
| reason on a refused write (3) | `SUSPENSION_REASONS` | `trial_ended` C15, C24 · `payment_overdue` C28, C24 · `subscription_ended` C22, C24 | - |
| `GET /me` statuses (2) | Surface | 200 C20 · 401 C20 | - |
| `GET /subscription` statuses (3) | Surface | 200 C21 · 401 C21 · 403 C21 | - |
| `POST /subscription/checkout` statuses (6) - verified at 2a1f830 | Surface | 201 C19, C31 · 400 US-20 C9 (`test/subscription.e2e-spec.ts:75`, re-run green) · 401/403 US-20 C21 (`test/subscription.e2e-spec.ts:186-208`; checks.md now cites C21 correctly) · 409 at HTTP US-20 C10 (`subscription.e2e-spec.ts:116`), AC 24 path C34 (unit) · 502 US-20 C10 (`:121`) | - |
| bot entry cases (4) | AC 8-11 | active C8, C11 · draft with offer C9 · paused C10 · new phone C11 | - |
| bot actions barred (4) | AC 9 | book, cancel, reschedule, confirm C9 (`texts` = 4× fixed reply, nothing booked, X still confirmed, draft unchanged) | - |
| reminder kinds (2) | `REMINDER_KINDS` | 24h C13, C14 · 1h C13, C14 | - |
| metric series (2) | `prometheus-payment-metrics.ts`, `ClientReplyKind` | `whatsapp_replies_total{kind="suspended"}` C8 (unit), C12 · `subscription_blocked_writes_total{reason}` C24 (3 reasons), C25 | - |
| exit from suspension (3) | AC 21, AC 23 | `trial_ended` -> payment C29 · `payment_overdue` -> payment C28 · `subscription_ended` -> new subscription C30-C33 | - |
| `suspensionReason` in the contract (5) | `suspension-reason.schema.ts` | 3 reasons + null accepted, out-of-list and absent refused C27; live values C20, C21, C22, C28, C33 | - |
| one-way doors (3) | plan Landing | door 1 C1-C5, C36 · door 2 C26, C19, C23 · door 3 C15, C27 | - |

Notes from the recompute (not counted as unproven):

- `barbershop-subscription.ts:122` returns `null` for a `past_due` subscription with no `paymentFailedAt`. No test covers this branch. Neither the plan nor the PRD decides this case, so it is an observation and not a coverage member.
- AC 24 names a `409` on `POST /subscription/checkout` for a subscription that was cancelled but is still inside its paid period. C34 proves that path only at the use-case layer. The `SubscriptionAlreadyExistsError` -> `409` mapping is proven at HTTP by US-20 C10. The member is therefore covered by composing two proofs, not by one end-to-end proof of this exact path.
- The round-1 precision gap ("US-20 C17") is closed: checks.md now cites US-20 C21, which matches `test/subscription.e2e-spec.ts:186`.
- Gaps 3 and 4 are now recorded in the checks.md Handoff. They are judged as before: observations, not unproven members.

## Test policy rows

_Row 1 was re-judged at 2a1f830 because it was unmet in round 1 and classifies the touched spec's subject. Rows 2-4 are carried from a93432f because no file they classify changed._

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Decides, reached across a boundary (suspension rule, guard) | `barbershop-subscription.ts`, `subscription-access.guard.ts` | own layer C1-C5, C24, C32, C35 · boundary C15, C16, C21, C22, C26, C28 | yes - every limit in `barbershop-subscription.ts` now has a case at its own layer, including the `dueDate == paidUntil` limit of `confirmPayment` (`spec.ts:145-150`; F2 killed). The guard part was met in round 1 and is unchanged |
| Decides, no boundary of its own (bot branch, reminders branch) | `answer-client-question.use-case.ts`, `send-appointment-reminders.use-case.ts` | own layer C8, C9, C10, C13 | yes - active, paused and draft cases at their own layer; the new-phone case is proven higher, at e2e (C11), because the branch it reaches is the same one C8 asserts; 24h and 1h both asserted in C13 |
| Input that does not decide (presenters, controller) | `my-account.presenter.ts`, `subscription.presenter.ts`, `suspension-reason.schema.ts`, `subscription.controller.ts` | boundary C20, C21, C19 (+ schema C27) | yes - the new field and each status of `GET /me` (200/401) and `GET /subscription` (200/401/403) at HTTP |
| Instrumentation (Prometheus counter, module wiring) | `prometheus-payment-metrics.ts`, `subscription-access.module.ts`, `account.module.ts`, `whatsapp.module.ts` | consumer proofs C12, C25 | yes - both series are read from `GET /metrics` in the real assembly |

## Faults injected

_F2 was re-injected at 2a1f830 in a fresh worktree, `/tmp/claude-1000/us21-verify-wt2`. As before, `node_modules` was symlinked, `.env` was copied and no stash was used. `git status --porcelain` of the real tree was identical before and after, and the worktree was removed. F1, F3, F4 and F5 are carried from a93432f: their surfaces (production code) are untouched by the fix, which adds no new assertion surface beyond the F2 one._

Each fault ran in a scratch worktree (`git worktree add --detach /tmp/claude-1000/us21-verify-wt HEAD`, with `node_modules` symlinked and `.env` copied). It was reverted with `git checkout -- src` after each run, and the worktree was removed with `git worktree remove --force`. `git status --porcelain` of the real tree was empty both before and after.

| Mutation | Location | Killed |
| --- | --- | --- |
| F1 grace boundary `now >= graceEnds` -> `now > graceEnds` | `src/domain/entities/barbershop-subscription.ts:124` | yes - C2 failed |
| F2 cancel clearing `dueDate > previous` -> `dueDate >= previous` (round 1: survived; round 2: re-injected) | `src/domain/entities/barbershop-subscription.ts:183` | yes - at 2a1f830 the C35 test "a charge due on paidUntil itself ... keeps it cancelled" failed (1 failed, 2 passed) |
| F3 guard drops the `@AllowWhileSuspended()` exemption (`exempt \|\| allowed` -> `exempt`) | `src/infrastructure/http/subscription-access.guard.ts:53` | yes - C24 "a read and an allowed write ... count nothing" failed |
| F4 bot suspension check moved before the paused-conversation check | `src/usecases/answer-client-question/answer-client-question.use-case.ts:126-130` | yes - C10 failed |
| F5 reminders skip of a suspended barbershop removed | `src/usecases/send-appointment-reminders/send-appointment-reminders.use-case.ts:81` | yes - C14 (e2e, real repository) failed |

The 402 derivation in `api-document.ts:139-148` was not mutated because of the five-fault cap. C23 asserts the documented set equals the expected set exactly, so dropping `!route.allowWhileSuspended` would add the two exempt routes and fail `:356`/`:357`.

## Gate

_verified at 2a1f830_

- Proof runs: unit 31 passed, 0 failed; e2e 18 passed, 0 failed; shell C7 and C36 exit 0.
- Full unit suite at 2a1f830: `npx jest`: 107 suites, 1358 passed, 0 failed. The full e2e suite (768 passed) is carried from a93432f, because the fix changes no file that an e2e suite loads.
- `python3 .claude/skills/tlc-spec-lean/scripts/validate_verification.py us-21-suspensao-por-assinatura-inativa`: exit code recorded in the hand-off.

Remaining observations (not gaps; they do not change the verdict):

1. C34 / AC 24: the 409 for a subscription that is cancelled but still in its paid period is proven at the use-case layer (`start-subscription-checkout.use-case.spec.ts:254-258`). The error -> 409 mapping is proven at HTTP by US-20 C10 (`test/subscription.e2e-spec.ts:116`). Together the two proofs cover it, and both are recorded in the checks.md Handoff.
2. `barbershop-subscription.ts:122`: `past_due` with no `paymentFailedAt` returns null. No test covers it. Neither the plan nor the PRD specifies this state, and the Handoff says the webhook never writes it.
