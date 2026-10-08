# US-25: Lembrete de retorno com opt-in verification

**Verdict**: PASS
**Profile**: light
**Diff range**: f63677e..654444c8151996dec844c8e9e0be12a3c723d3ba
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

## Binding sources

Not run at profile light (step 1 runs only under `ui`).

## Checks

Proofs were run once per target at HEAD `654444c`, with per-test results read from `--json` output (every named test listed individually as `passed`; none skipped by the filter, none missing):

- unit: `npx jest src/usecases/send-return-reminders/send-return-reminders.use-case.spec.ts src/usecases/answer-client-question/answer-client-question.use-case.spec.ts src/infrastructure/jobs/return-reminder.job.spec.ts src/infrastructure/external/gemini/gemini-message-interpreter.spec.ts -t "US-25"` exit 0, 60 passed, 0 failed
- e2e: `npx jest --config ./test/jest-e2e.json test/database/typeorm-client.repository.e2e-spec.ts test/database/typeorm-appointment.repository.e2e-spec.ts test/database/return-reminder-schema.e2e-spec.ts test/database/typeorm-schedule.query.e2e-spec.ts test/whatsapp-return-reminder.e2e-spec.ts test/api-docs.e2e-spec.ts -t "US-25" --runInBand` exit 0, 17 passed, 0 failed

Paths below are abbreviated: `srr.spec` = `src/usecases/send-return-reminders/send-return-reminders.use-case.spec.ts`, `acq.spec` = `src/usecases/answer-client-question/answer-client-question.use-case.spec.ts`. Every proof file is in the diff `f63677e..HEAD`. The text constants `PERGUNTA`, `ATIVADO`, `DESATIVADO` and `convite(...)` in the specs (`srr.spec:10-16`, `acq.spec:1458-1461`, `test/whatsapp-return-reminder.e2e-spec.ts:36-43`) were compared character by character with the literals in `checks.md` and match.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | pergunta enviada uma vez, askedAt = agora, lembrete continua off | unit batch, `US-25 CA-25.1 (C1)` passed | `src/usecases/send-return-reminders/send-return-reminders.use-case.spec.ts:34` - `expect(textsTo(ANA_PHONE)).toEqual([PERGUNTA])`; `:35` `toHaveLength(1)`; `:37` `expect(ana.returnReminderAskedAt).toEqual(BOOKING_NOW)`; `:38` `expect(ana.returnReminderEnabled).toBe(false)` | PASS |
| C2 | janela e fonte da pergunta (a)-(f) | unit batch, 8 tests `US-25 CA-25.1 (C2) (a)..(f)` passed (d as it.each over 3 statuses) | `src/usecases/send-return-reminders/send-return-reminders.use-case.spec.ts:47` (a) `toEqual([PERGUNTA])` with end 23h59 ago (`:43`); `:56` (b) `expect(connector.sentTexts).toEqual([])` at 24h (`:52`); `:64`/`:68` (c) `[]` at 12:00 then `[PERGUNTA]` at 12:30; `:79` (d) `toEqual([])` for confirmed/no_show/cancelled (`:71`); `:104-105` (e) `result.failures` `[]` and `sentTexts` `[]`; `:116` (f) `toEqual([])` | PASS |
| C3 | quem não recebe a pergunta (a)-(c) | unit batch, `US-25 CA-25.1 (C3) (a)/(b)/(c)` passed | `src/usecases/send-return-reminders/send-return-reminders.use-case.spec.ts:127` (a) `expect(connector.sentTexts).toEqual([])`; `:140` (b) same; `:163-164` (c) precondition `returnReminderEnabled` false and `returnReminderAskedAt` null, `:169` `toEqual([])` | PASS |
| C4 | dois atendimentos, 1 pergunta, segunda rodada nada | unit batch, `US-25 (C4)` passed | `src/usecases/send-return-reminders/send-return-reminders.use-case.spec.ts:178` and `:181` - `expect(textsTo(ANA_PHONE)).toEqual([PERGUNTA])` after each run | PASS |
| C5 | conversa pausada não envia nem reivindica; reativada envia | unit batch, `US-25 (C5)` passed | `src/usecases/send-return-reminders/send-return-reminders.use-case.spec.ts:191-192` - `toEqual([])`, `returnReminderAskedAt` `toBeNull()`; `:196` `toEqual([PERGUNTA])` | PASS |
| C6 | desconectado e suspensa não enviam nem reivindicam; de volta envia | unit batch, `US-25 (C6)` passed | `src/usecases/send-return-reminders/send-return-reminders.use-case.spec.ts:206-207` and `:212-213` - `toEqual([])` and `returnReminderAskedAt` `toBeNull()`; `:217` `toEqual([PERGUNTA])` | PASS |
| C7 | conector falhando: reivindicação mantida, 1 falha `question`, sem reenvio | unit batch, `US-25 (C7)` passed | `src/usecases/send-return-reminders/send-return-reminders.use-case.spec.ts:228` - `returnReminderAskedAt` `toEqual(BOOKING_NOW)`; `:231-238` `result.sendFailures` `toEqual([{ barbershopId, clientId: 'ana', kind: 'question', error }])`; `:242` `sentTexts` `toEqual([])` | PASS |
| C8 | returnReminderQuestion (a)-(j) | unit batch, 10 tests `US-25 (C8) (a)..(j)` passed | `src/usecases/answer-client-question/answer-client-question.use-case.spec.ts:1520` (a) `toBe(true)`; `:1524` (b) `toBe(true)`; `:1528-1530` (c) `toBe(false)`; `:1534` (d) false; `:1538` (e) false; `:1544-1556` (f) false; `:1560-1574` (g) false; `:1578-1588` (h) false; `:1592-1606` (i) false; `:1610-1615` (j) `toBe(true)`; value read at `:1516` `interpreter.inputs.at(-1)?.returnReminderQuestion` | PASS |
| C9 | enable ativa, responde ATIVADO, resultado `return_reminder` | unit batch, `US-25 (C9)` passed | `src/usecases/answer-client-question/answer-client-question.use-case.spec.ts:1623` - `expect(result).toEqual({ outcome: 'sent', kind: 'return_reminder' })`; `:1624` `returnReminderEnabled` `toBe(true)`; `:1625` `toEqual([ATIVADO])` | PASS |
| C10 | disable (a)(b) no bot, (c) sem convite depois | unit batch, `US-25 CA-25.3 (C10) (a)/(b)` in acq.spec and `(c)` in srr.spec passed | `src/usecases/answer-client-question/answer-client-question.use-case.spec.ts:1635-1636` (a) `toBe(false)`, `toEqual([DESATIVADO])`; `:1644-1645` (b) Carlos `toEqual([DESATIVADO])`, `toBe(false)`; `src/usecases/send-return-reminders/send-return-reminders.use-case.spec.ts:262` (c) `expect(textsTo(ANA_PHONE)).toEqual([DESATIVADO])` (no invite after the run) | PASS |
| C11 | pedir o valor atual responde e não grava | unit batch, `US-25 (C11) (a)/(b)` passed | `src/usecases/answer-client-question/answer-client-question.use-case.spec.ts:1655-1656` (a) `toEqual([ATIVADO])`, `expect(changesOf('ana')).toHaveLength(0)`; `:1664-1665` (b) `toEqual([DESATIVADO])`, `toHaveLength(0)` | PASS |
| C12 | precedência (a)-(e) | unit batch, `US-25 (C12) (a)..(e)` passed | `src/usecases/answer-client-question/answer-client-question.use-case.spec.ts:1673` (a) `toEqual([ATIVADO])`; `:1686-1687` (b) `[ATIVADO]`, `findDraft(...)` `toBeNull()`; `:1705-1708` (c) `[ATIVADO]`, `clientConfirmedAt` `toBeNull()`; `:1717-1719` (d) `whatsAppMetrics.handoffs` `toEqual(['requested'])`, `returnReminderEnabled` `toBe(false)`; `:1730-1733` (e) `consecutiveFailures` `toBe(0)`, `replies` `toEqual(['return_reminder'])` | PASS |
| C13 | convite no vencimento, uma vez; 45 dias no texto | unit batch, 2 tests `US-25 CA-25.2 (C13)` passed | `src/usecases/send-return-reminders/send-return-reminders.use-case.spec.ts:271` 11:59 `toEqual([])`; `:275` 12:00 `toEqual([CONVITE_ANA_30])`; `:279` 12:01 still `[CONVITE_ANA_30]`; `:288` `toEqual([convite('Ana', 45)])` | PASS |
| C14 | quando não há convite (a)-(e) | unit batch, `US-25 (C14) (a)..(e)` passed | `src/usecases/send-return-reminders/send-return-reminders.use-case.spec.ts:300`/`:305` (a) `[]` then `[CONVITE_ANA_30]` after cancel; `:314` (b) `textsTo(BRUNO_PHONE)` `toEqual([])`; `:324` (c) `sentTexts` `[]`; `:334` (d) `[CONVITE_ANA_30]`; `:344` (e) `sentTexts` `[]` with `setDays(45)` | PASS |
| C15 | um convite por atendimento; segundo às 10:30 de 29/10 | unit batch, `US-25 (C15)` passed | `src/usecases/send-return-reminders/send-return-reminders.use-case.spec.ts:356` at 10:29 `toEqual([CONVITE_ANA_30])`; `:360` at 10:30 `toEqual([CONVITE_ANA_30, CONVITE_ANA_30])` | PASS |
| C16 | bloqueado por faltas e pausado (a)(b) | unit batch, `US-25 (C16) (a)/(b)` passed | `src/usecases/send-return-reminders/send-return-reminders.use-case.spec.ts:371`/`:375` (a) `[]` then `[CONVITE_ANA_30]` after reset; `:384`/`:388` (b) `[]` then `[CONVITE_ANA_30]` after resume | PASS |
| C17 | desconectado e suspensa sem convite; de volta envia | unit batch, `US-25 (C17)` passed | `src/usecases/send-return-reminders/send-return-reminders.use-case.spec.ts:398`, `:403` `toEqual([])`; `:407` `toEqual([CONVITE_ANA_30])` | PASS |
| C18 | falha de envio do convite, sem reenvio | unit batch, `US-25 (C18)` passed | `src/usecases/send-return-reminders/send-return-reminders.use-case.spec.ts:417-424` - `result.sendFailures` `toEqual([{ barbershopId, clientId: 'ana', kind: 'invite', error }])`; `:427` `sentTexts` `toEqual([])` | PASS |
| C19 | barbearia falhando registrada, a seguinte recebe pergunta e convite | unit batch, `US-25 (C19)` passed | `src/usecases/send-return-reminders/send-return-reminders.use-case.spec.ts:446-448` - `result.failures` `toEqual([{ barbershopId: 'barbershop-0', error }])`; `:449` `[PERGUNTA]`; `:450` `toEqual([convite('Bruno', 30)])` | PASS |
| C20 | 2 linhas de consentimento ordenadas, cliente false, ambas resolvem true | e2e batch, `US-25 CA-25.5 (C20)` passed | `test/database/typeorm-client.repository.e2e-spec.ts:156-157` - `expect(await change(true, TEN)).toBe(true)` and `change(false, ELEVEN)` `toBe(true)`; `:159` `enabledOf()` `toBe(false)`; `:160-175` `consents()` (ORDER BY recorded_at) `toEqual([{..., enabled: true, channel: 'whatsapp', recorded_at: TEN}, {..., enabled: false, channel: 'whatsapp', recorded_at: ELEVEN}])` | PASS |
| C21 | valor atual resolve false sem linha; concorrência grava 1 | e2e batch, 2 tests `US-25 (C21)` passed | `test/database/typeorm-client.repository.e2e-spec.ts:181-182` - `change(true, ELEVEN)` `toBe(false)`, `consents()` `toHaveLength(1)`; `:188-189` `results.filter(Boolean)` `toHaveLength(1)`, `consents()` `toHaveLength(1)` | PASS |
| C22 | door 1 no banco (a)-(f) | e2e batch, `US-25 ... (C22) (a)..(f)` passed across 3 files | `test/database/typeorm-client.repository.e2e-spec.ts:202` (a) `toBe(CHECK_VIOLATION)` ('23514'); `:214` (b) `toBe(FOREIGN_KEY_VIOLATION)` ('23503'); `:218-221` (c) `toBe(false)`, `enabledOf()` false, `consents()` `[]`; `:225-230`, `:240-242`, `:261-263` (d) true, false, false, false; `test/database/typeorm-appointment.repository.e2e-spec.ts:744-758` (e) other shop false, true, false, `sentAtOf` `toEqual(LATER)`, confirmed false; `test/database/return-reminder-schema.e2e-spec.ts:49-60` (f) `toEqual({ consents: false, askedAt: false, sentAt: false })` after down, all true after up | PASS |
| C23 | leituras da rotina (a)(b) | e2e batch, `US-25 (C23) (a)/(b)` passed | `test/database/typeorm-schedule.query.e2e-spec.ts:756` (a) `expect(entries.map((entry) => entry.id)).toEqual([inside, atUntil])`; `:793` (b) `expect(entries.map((entry) => entry.id)).toEqual([due])` | PASS |
| C24 | métricas de mensagem e de opt-in | unit batch, `US-25 (C24)` in srr.spec and acq.spec passed | `src/usecases/send-return-reminders/send-return-reminders.use-case.spec.ts:462-465` - `toEqual(['invite:sent', 'question:sent'])`; `:476-479` `toEqual(['invite:failed', 'question:failed'])`; `src/usecases/answer-client-question/answer-client-question.use-case.spec.ts:1743` `expect(metrics.optInChanges).toEqual([true, false])` (third, repeated disable not counted) | PASS |
| C25 | GET /metrics com labels fechados e opt_in true 1 | e2e batch, `US-25 AC 24 (C25)` passed | `test/whatsapp-return-reminder.e2e-spec.ts:244-246` - `expect(lines).toContain('return_reminder_opt_in_changes_total{enabled="true"} 1')`; `:253-256` every `return_reminder_*` sample `toMatch(...)` an anchored regex allowing only `kind` in question/invite with `outcome` in sent/failed, or `enabled` in true/false (no id label) | PASS |
| C26 | log de fim de rodada com contagens, sem telefone/nome; falhas logadas | unit batch, 2 tests `US-25 ... (C26)` passed | `src/infrastructure/jobs/return-reminder.job.spec.ts:77-80` - `logSpy` `toHaveBeenCalledWith({ questions: 2, invites: 3, failed: 1, failedBarbershops: 1 }, 'Return reminders finished.')`; `:61-76` send failure with `{ barbershopId, clientId, kind }` and barbershop failure with `{ barbershopId }`; `:82-83` `not.toContain('+5511911110001')`, `not.toContain('Ana')` | PASS |
| C27 | descrição do webhook no OpenAPI contém US-25 | e2e batch, `US-25 AC 25 (C27)` passed | `test/api-docs.e2e-spec.ts:226` - `expect(hook.description).toContain('US-25')` | PASS |
| C28 | door 2: Gemini repassa, rejeita, schema e instrução | unit batch, 6 tests `US-25 door 2 (C28)` passed | `src/infrastructure/external/gemini/gemini-message-interpreter.spec.ts:570` - `resolves.toEqual(answered)` for enable/disable/null; `:583-585` `rejects.toBeInstanceOf(MessageInterpreterUnavailableError)` for missing and 'maybe'; `:598-606` `required` contains `returnReminder`, enum `["enable","disable"]` and `"type":"null"`; `:608-614` instruction lines for `returnReminderQuestion` true and false | PASS |
| C29 | door 3: cron `* * * * *` em America/Sao_Paulo no AppModule | e2e batch, `US-25 door 3 (C29)` passed | `test/whatsapp-return-reminder.e2e-spec.ts:263-264` - `expect(cron.cronTime.source).toBe('* * * * *')`, `expect(cron.cronTime.timeZone).toBe('America/Sao_Paulo')` (module built from `AppModule`, `:171-173`) | PASS |
| C30 | ponta a ponta pergunta, ativar e desativar pelo webhook | e2e batch, `US-25 CA-25.1, CA-25.3, CA-25.5 (C30)` passed | `test/whatsapp-return-reminder.e2e-spec.ts:272-276` - `[PERGUNTA]`, `clientRow` `toEqual({ return_reminder_enabled: false, return_reminder_asked_at: NOW })`; `:281-285` enabled true, `consentsOf` `toEqual([{ enabled: true, channel: 'whatsapp' }])`, last text `ATIVADO`; `:289-298` false, `toHaveLength(2)`, last text `DESATIVADO` | PASS |
| C31 | ponta a ponta do convite para Bruno, nada para Carlos | e2e batch, `US-25 CA-25.2, CA-25.4 (C31)` passed | `test/whatsapp-return-reminder.e2e-spec.ts:308-309` - `expect(textsTo(BRUNO_PHONE)).toEqual([CONVITE_BRUNO])`, `textsTo(CARLOS_PHONE)` `toEqual([])`; `:315` `row.return_reminder_sent_at` `toEqual(NOW)` | PASS |
| C32 | duas rodadas concorrentes: 1 pergunta e 1 convite | e2e batch, `US-25 door 1 (C32)` passed | `test/whatsapp-return-reminder.e2e-spec.ts:323-327` - after `Promise.all([job.run(), job.run()])`, `[PERGUNTA]`, `[CONVITE_BRUNO]`, `connector.sentTexts` `toHaveLength(2)` | PASS |

Level and sampling: the claims naming a route or response shape (C25 `GET /metrics`, C27 the generated OpenAPI document, C30 the webhook) each have a proof crossing that boundary through the booted `AppModule` with supertest or the built document. C29 reads the cron from the real `AppModule` assembly. Every enumerated claim (C2 6 rows with 3 statuses, C3 3, C8 10, C12 5, C14 5, C22 6, C23 2 sides, C24 6 counters, C28 3 values and 2 rejections) is proven on every member it names.

Swept rows resolving to `existing`, re-read against the code:

- idempotency, webhook redelivery answered once: present at `src/usecases/answer-client-question/answer-client-question.use-case.ts:116-123` (`inboundMessages.claim(...)`, `if (!claimed) return NO_REPLY`).
- authorization, webhook shared secret (AD-011): present at `src/infrastructure/external/whatsapp/evolution/evolution-webhook.controller.ts:57-59` (`@Public()` plus `@UseGuards(EvolutionWebhookGuard)`), and the e2e sends `authorization: Bearer <WHATSAPP_WEBHOOK_SECRET>`.
- data lifecycle, new columns nullable without backfill: `src/infrastructure/database/migrations/1791465704690-AddReturnReminder.ts` adds `return_reminder_asked_at` and `return_reminder_sent_at` as `TIMESTAMP WITH TIME ZONE` without `NOT NULL` or `UPDATE`.
- dependency failure, Gemini unavailable answers as in US-15: present at `src/usecases/answer-client-question/answer-client-question.use-case.ts:223-225` (`MessageInterpreterUnavailableError` -> `UNAVAILABLE_REPLY`).

Findings (none blocks the verdict; all are precision notes about the checks' literals versus the fixtures):

1. C30, precision: the claim says Ana's attendance ends "1h antes de agora"; the test records it from 10:00 to 10:30 with now 12:00, so it ends 1h30 before (`test/whatsapp-return-reminder.e2e-spec.ts:268`). Both are inside the 24h window, so the CA holds, but the literal value is not the one exercised. Also, the order of the two consent rows is not asserted there (`:292-297` uses `arrayContaining`); the test comment defers the order to C20, which proves it.
2. C31, precision: "Carlos com o mesmo histórico" is an attendance 30 min earlier than Bruno's (`test/whatsapp-return-reminder.e2e-spec.ts:304`, 11:00 vs 11:30). It is still due, so the CA-25.4 negative holds.
3. C23 (b), precision: the claim names "o de Ana quando um atendimento mais novo dela ainda não venceu"; the test uses a different opted-in client, Caio, for that case (`test/database/typeorm-schedule.query.e2e-spec.ts:775-776`). The behaviour is the same, but the actor named in the check is different.
4. C2 (f), precision: "um cliente da barbearia B" is Ana's id stored under `barbershop-b` (`src/usecases/send-return-reminders/send-return-reminders.use-case.spec.ts:110-112`), not a client registered in B. The tenant filter is still exercised.

## Coverage

Not run at profile light (the Coverage recompute runs under `standard` and `ui`).

## Test policy rows

Not run at profile light, and `checks.md` carries no `Test policy` section.

## Faults injected

Not run at profile light (fault injection runs under `standard` and `ui`).

## Gate

- `npx jest <4 unit files> -t "US-25"` - 60 passed, 0 failed (128 skipped by the filter, belonging to other stories)
- `npx jest --config ./test/jest-e2e.json <6 e2e files> -t "US-25" --runInBand` - 17 passed, 0 failed (65 skipped by the filter, belonging to other stories)
- Total: 77 passed, 0 failed; all 32 checks C1-C32 appear individually as passed
