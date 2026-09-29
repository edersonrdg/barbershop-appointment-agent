# US-16: Transferência para atendimento humano verification

**Verdict**: PASS
**Profile**: light
**Diff range**: 9c29176..979d091 (implementation 3ff9d5f..8bb08aa; fix 8bb08aa..979d091)
**Round**: 2 - scoped
**Verifier**: independent sub-agent (author != verifier)

Round 1 (at `8bb08aa`) failed on C26: nothing asserted that `AnswerClientQuestionUseCase` returns `handoff: reason`. It also recorded two non-flipping gaps: the use case's failed hand-off return (C3) was unasserted, and the C18 test title was mislabelled. The fix `979d091` adds three use-case tests and a second `Proof:` line to C3 and C26 in `checks.md`. Nothing was removed. It also retitles the C18 table test. Outside `.specs/`, the fix's diff touches only `src/usecases/answer-client-question/answer-client-question.use-case.spec.ts` (+45: an `execute` helper at `:152-161` and three tests at `:346-378`) and `test/whatsapp-handoff.e2e-spec.ts:480` (the title only). No production file changed in the fix range.

Scope of this round:
- **Proofs:** all of them re-ran in full at `979d091`.
- **Citations:** refreshed for the two touched spec files.
- **Re-judged:** C26 (was not PASS), the C3 gap and the C18 title.
- **Carried forward:** every other row's evidence text, marked `carried from 8bb08aa`.

## Binding sources

Not run: profile `light` (step 1 runs under `ui` only). The fix does not touch any interface. Carried from 8bb08aa.

## Checks

Proof runs, verified at 979d091 (one invocation per target, each named test listed individually as passed in jest's `--json` per-test results):
- **unit:** `npx jest src/usecases/answer-client-question/answer-client-question.use-case.spec.ts src/infrastructure/external/whatsapp/evolution/evolution-webhook.controller.spec.ts src/infrastructure/external/gemini/gemini-message-interpreter.spec.ts src/infrastructure/config/env.schema.spec.ts --verbose --json -t "\(C2\)|\(C3\)|\(C4\)|\(C6\)|\(C7\)|\(C19\)|\(C20\)|\(C26\)"` exited 0 with 38 passed and 0 failed (round 1: 35).
  - The three new tests are `US-16 hand-off AC 27 (C26): returns the requested reason with the hand-off`, `US-16 hand-off AC 27 (C26): returns the not_understood reason with the hand-off` and `US-16 hand-off AC 3 (C3): a failed hand-off notice returns the error and the reason and keeps the pause`.
  - As in round 1, the C2/C3/C4/C6/C7/C20 hits outside `describe('US-16 hand-off')` and the controller `AC 18 (C19)` hit are US-15 tests matched by the alternation. They do not count toward US-16.
- **e2e:** `npx jest --config ./test/jest-e2e.json test/whatsapp-handoff.e2e-spec.ts test/api-docs.e2e-spec.ts test/database/whatsapp-conversations-schema.e2e-spec.ts test/whatsapp-questions.e2e-spec.ts test/whatsapp-first-contact.e2e-spec.ts --verbose --json` exited 0 with 88 passed, 0 failed and 0 pending. This is one invocation with no `-t` filter, so it covers the C30 suites too.
  - whatsapp-handoff: 32/32. Every C1, C3, C5, C8-C18, C21-C25 and C29 test appears by name.
  - api-docs: 14/14, including the 3x `US-16 (C27)`.
  - whatsapp-conversations-schema: 8/8 `door 2 (C28)`.
  - whatsapp-questions: 16/16.
  - whatsapp-first-contact: 18/18.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | humanRequested -> 204, 1 sendText with the hand-off text, paused `requested` at NOW | e2e `CA-16.1 (C1)` passed, verified at 979d091 | `test/whatsapp-handoff.e2e-spec.ts:277` - `messageUpsert().expect(204)`; `:279-281` - `expect(connector.sentTexts).toEqual([{ barbershopId: shopA, phone: PHONE, text: HANDOFF }])`; `:282-285` - `toMatchObject({ pause_reason: 'requested', paused_at: NOW })` (carried from 8bb08aa; no line shift before :480) | PASS |
| C2 | humanRequested with topics or offTopic -> only the hand-off text, paused `requested` | unit `US-16 hand-off AC 2 (C2)` x2 passed, verified at 979d091 | `src/usecases/answer-client-question/answer-client-question.use-case.spec.ts:336-338` - `expect(texts).toEqual([HANDOFF_REPLY])`, `not.toContain('R$')`, `not.toContain('Endereço')`; `:339-342` - `toMatchObject({ pauseReason: 'requested', pausedAt: NOW })` (citation refreshed at 979d091) | PASS |
| C3 | send fails -> 204, still paused, controller logs barbershopId + error name, no phone or text | e2e `AC 3 (C3)` + controller unit `AC 3 (C3)` + use-case unit `US-16 hand-off AC 3 (C3)` passed, verified at 979d091 | `test/whatsapp-handoff.e2e-spec.ts:292` - `.expect(204)`; `:294` - `expect((await conversationOf(joao))?.paused_at).toEqual(NOW)`; `src/infrastructure/external/whatsapp/evolution/evolution-webhook.controller.spec.ts:351` - `expect(context).toEqual({ barbershopId: SHOP, err: { name: 'SmtpError', code: 'EENVELOPE' } })`; `:356-357` - `not.toContain('5511987654321')`, `not.toContain('quero falar')` (carried from 8bb08aa). Seam closed at 979d091: `src/usecases/answer-client-question/answer-client-question.use-case.spec.ts:375` - `expect(result).toMatchObject({ outcome: 'failed', handoff: 'requested' })`; `:376` - `expect(result.outcome === 'failed' && result.error).toBeInstanceOf(Error)`; `:377` - `expect(conversation()?.pausedAt).toEqual(NOW)`, against the branch at `answer-client-question.use-case.ts:169`. Mutant (b) killed | PASS |
| C4 | schema requires boolean humanRequested; JSON schema + instruction carry it | unit `US-16 (C4)` x3 passed, verified at 979d091 | `src/infrastructure/external/gemini/gemini-message-interpreter.spec.ts:250` - `rejects.toBeInstanceOf(MessageInterpreterUnavailableError)` over rows missing / `'sim'` (:242-243); `:264` - `expect(result.humanRequested).toBe(true)`; `:269-270` - `toHaveProperty('humanRequested')`, `required` `toContain('humanRequested')`; `:271` - `systemInstruction` `toEqual(expect.stringContaining('humanRequested'))` (carried from 8bb08aa) | PASS |
| C5 | 1st no-topic -> fallback, failures 1, not paused; 2nd -> hand-off text, `not_understood` | e2e `CA-16.2 (C5)` passed, verified at 979d091 | `test/whatsapp-handoff.e2e-spec.ts:303` - `expect(textsTo()).toEqual([FALLBACK])`; `:304-307` - `toMatchObject({ consecutive_failures: 1, paused_at: null })`; `:310` - `toEqual([FALLBACK, HANDOFF])`; `:311-313` - `toMatchObject({ pause_reason: 'not_understood' })` (carried from 8bb08aa) | PASS |
| C6 | from 1 failure: topic -> 0; offTopic -> 0; then no-topic -> 1, no pause | unit `US-16 hand-off CA-16.2 (C6)` passed, verified at 979d091 | `src/usecases/answer-client-question/answer-client-question.use-case.spec.ts:388` - `expect(conversation()?.consecutiveFailures).toBe(0)` after `topics: ['address']`; `:393` - `toBe(0)` after `offTopic: true`; `:396-399` - `toMatchObject({ consecutiveFailures: 1, pausedAt: null })` (citation refreshed at 979d091) | PASS |
| C7 | unavailable keeps count 1 + unavailable text; next no-topic hands off `not_understood` | unit `US-16 hand-off CA-16.2 (C7)` passed, verified at 979d091 | `src/usecases/answer-client-question/answer-client-question.use-case.spec.ts:409` - `toBe(UNAVAILABLE)`; `:410-413` - `toMatchObject({ consecutiveFailures: 1, pausedAt: null })`; `:417-418` - `toBe(HANDOFF_REPLY)`, `pauseReason` `toBe('not_understood')` (citation refreshed at 979d091) | PASS |
| C8 | two parallel second failures -> exactly 1 hand-off sendText, paused `not_understood` | e2e `AC 8 (C8)` passed, verified at 979d091 | `test/whatsapp-handoff.e2e-spec.ts:320-323` - both `.expect(204)` under `Promise.all`; `:325` - `expect(textsTo()).toEqual([HANDOFF])`; `:326-328` - `toMatchObject({ pause_reason: 'not_understood' })` (carried from 8bb08aa) | PASS |
| C9 | paused 1h -> 204, 0 interpret, 0 sendText | e2e `CA-16.3 (C9)` passed, verified at 979d091 | `test/whatsapp-handoff.e2e-spec.ts:337` - `.expect(204)`; `:339-340` - `expect(interpreter.inputs).toHaveLength(0)`, `expect(connector.sentTexts).toHaveLength(0)` (carried from 8bb08aa) | PASS |
| C10 | paused: client text / audio / fromMe -> last_activity_at = NOW, no sendText | e2e `CA-16.5 (C10)` x3 passed, verified at 979d091 | `test/whatsapp-handoff.e2e-spec.ts:357-358` - `expect((await conversationOf(joao))?.last_activity_at).toEqual(NOW)`, `sentTexts` `toHaveLength(0)` over rows :344-349 (carried from 8bb08aa) | PASS |
| C11 | fromMe to unknown phone creates nothing; fromMe on active conversation changes nothing | e2e `AC 11 (C11)` passed, verified at 979d091 | `test/whatsapp-handoff.e2e-spec.ts:373` - clients for new phone `toHaveLength(0)`; `:377` - conversations `toHaveLength(1)`; `:378` - `expect(await conversationOf(joao)).toEqual(before)`; `:379` - `sentTexts` `toHaveLength(0)` (carried from 8bb08aa) | PASS |
| C12 | pause in A does not silence the same phone in B | e2e `RN-26 (C12)` passed, verified at 979d091 | `test/whatsapp-handoff.e2e-spec.ts:390-393` - `expect(textsTo(shopB)).toEqual(['A Barbearia B ainda não informou o endereço.'])`, `expect(textsTo(shopA)).toEqual([])` (carried from 8bb08aa) | PASS |
| C13 | Owner resume -> 204 no body, row reset, next text answered | e2e `CA-16.4 (C13)` passed, verified at 979d091 | `test/whatsapp-handoff.e2e-spec.ts:404-406` - `resume(joao).expect(204)`, `expect(response.text).toBe('')`; `:407-411` - `toMatchObject({ paused_at: null, pause_reason: null, consecutive_failures: 0 })`; `:416` - `toEqual([ADDRESS_REPLY])` (carried from 8bb08aa) | PASS |
| C14 | resume on active / missing conversation -> 204, nothing changes | e2e `AC 14 (C14)` passed, verified at 979d091 | `test/whatsapp-handoff.e2e-spec.ts:424-425` - both `.expect(204)`; `:427-428` - `toEqual(before)`, `expect(await conversationOf(ana)).toBeUndefined()` (carried from 8bb08aa) | PASS |
| C15 | random uuid / B's client -> 404 `Cliente não encontrado.`, B stays paused | e2e `RN-26 (C15)` passed, verified at 979d091 | `test/whatsapp-handoff.e2e-spec.ts:435-436` - `.expect(404, CLIENT_NOT_FOUND)` (`{ message: 'Cliente não encontrado.' }`, :37); `:438` - `paused_at` `not.toBeNull()` (carried from 8bb08aa) | PASS |
| C16 | clientId `abc` -> 400 | e2e `AC 16 (C16)` passed, verified at 979d091 | `test/whatsapp-handoff.e2e-spec.ts:442` - `await resume('abc').expect(400)` (carried from 8bb08aa) | PASS |
| C17 | Barber -> 403 `Acesso negado.`, no token -> 401, on both routes; stays paused | e2e `AD-007 (C17)` x4 passed, verified at 979d091 | `test/whatsapp-handoff.e2e-spec.ts:451` - `call().expect(403, FORBIDDEN)`; `:462` - `call().expect(401)`; `:453` / `:464` - `paused_at` `not.toBeNull()`, over rows :446-447 and :457-458 (carried from 8bb08aa) | PASS |
| C18 | 11h59 silent + paused; 12h00 / 12h01 answered + reset; 13h pause with 11h activity silent | e2e `CA-16.5 (C18)` x4 passed, verified at 979d091; titles now read `a pause 11h59 old (paused 43140000 ms ago, last activity 43140000 ms ago) answers: false` / `12h00 ... true` / `12h01 ... true` / `13h with activity 11h ago ... (paused 46800000 ms ago, last activity 39600000 ms ago) answers: false` | `test/whatsapp-handoff.e2e-spec.ts:495-499` - `expect(textsTo()).toEqual([ADDRESS_REPLY])`, `toMatchObject({ paused_at: null, consecutive_failures: 0 })`; `:501-502` - `toEqual([])`, `expect(row?.paused_at).toEqual(ago(pausedAgo))`, over rows :470-478; title at `:480` (citation refreshed at 979d091; cosmetic gap closed) | PASS |
| C19 | env default 12, accepts 24, refuses 0/-1/1.5/abc | unit `US-16 (C19)` x5 passed, verified at 979d091 | `src/infrastructure/config/env.schema.spec.ts:201` - `toBe(12)`; `:205` - `toBe(24)`; `:209-211` - `toThrow(/WHATSAPP_HANDOFF_RESUME_HOURS/)` over `['0', '-1', '1.5', 'abc']` (carried from 8bb08aa) | PASS |
| C20 | resumeAfterHours 2: 2h01 resumed and answered, 1h59 not | unit `US-16 hand-off CA-16.5 (C20)` x2 passed, verified at 979d091 | `src/usecases/answer-client-question/answer-client-question.use-case.spec.ts:441-444` - `expect(texts).toEqual(answered ? ['Endereço da Barbearia do Zé: Rua das Flores, 123'] : [])`, `expect(conversation()?.pausedAt).toEqual(answered ? null : pausedAt)` over rows :422-423 (citation refreshed at 979d091) | PASS |
| C21 | list 200 with exact two entries, oldest pause first | e2e `CA-16.6 (C21)` passed, verified at 979d091 | `test/whatsapp-handoff.e2e-spec.ts:520` - `.expect(200)`; `:522-541` - `expect(response.body).toEqual({ conversations: [ { clientName: 'Ana', reason: 'not_understood', pausedAt: '2026-09-29T12:00:00.000Z', ... }, { clientName: 'João Silva', reason: 'requested', pausedAt: '2026-09-29T14:00:00.000Z', lastActivityAt: '2026-09-29T14:30:00.000Z', ... } ] })` (carried from 8bb08aa) | PASS |
| C22 | list omits active / resumed / expired 12h01 / other barbershop | e2e `RN-26 (C22)` x4 passed, verified at 979d091 | `test/whatsapp-handoff.e2e-spec.ts:573` - `await listWaiting().expect(200, { conversations: [] })` over rows :545-569 (carried from 8bb08aa) | PASS |
| C23 | nothing waiting -> 200 `{ conversations: [] }` | e2e `CA-16.6 (C23)` passed, verified at 979d091 | `test/whatsapp-handoff.e2e-spec.ts:577` - `await listWaiting().expect(200, { conversations: [] })` (carried from 8bb08aa) | PASS |
| C24 | handoffs by reason +1 each, replies{kind=handoff} +1 each, no extra labels | e2e `AC 25 (C24)` passed, verified at 979d091 | `test/whatsapp-handoff.e2e-spec.ts:600-601` - `toBe(before.requested + 1)`, `toBe(before.replies + 1)`; `:609-610` - `toBe(before.notUnderstood + 1)`, `toBe(before.replies + 2)`; `:621-623` - each metric line `toMatch` a regex anchored on `whatsapp_handoffs_total{reason="[a-z_]+"} N` or `whatsapp_replies_total{kind="[a-z_]+"} N` with no other label (the regex's alternation pipe is not reproduced here because it breaks the table) (carried from 8bb08aa) | PASS |
| C25 | resumes owner +1, timeout +1, active-conversation resume changes neither | e2e `AC 26 (C25)` passed, verified at 979d091 | `test/whatsapp-handoff.e2e-spec.ts:637` - `toBe(before.owner + 1)`; `:640-641` - owner still `before.owner + 1`, timeout `toBe(before.timeout)`; `:651` - `toBe(before.timeout + 1)` (carried from 8bb08aa) | PASS |
| C26 | use case returns the reason in its result, and the controller logs `{ barbershopId, reason }` with no phone or text | controller unit `AC 27 (C26)` x2 + use-case unit `US-16 hand-off AC 27 (C26)` x2 passed, verified at 979d091 | Use-case half (re-judged at 979d091): `src/usecases/answer-client-question/answer-client-question.use-case.spec.ts:349-355` - `await expect(execute(interpretation({ humanRequested: true }))).resolves.toEqual({ outcome: 'sent', kind: 'handoff', handoff: 'requested' })`; `:362-366` - `await expect(execute(interpretation({}))).resolves.toEqual({ outcome: 'sent', kind: 'handoff', handoff: 'not_understood' })` (second consecutive misunderstanding after `:360`). The `execute` helper at `:152-161` returns `useCase.execute(...)` unmodified, so the asserted value is the real return from `answer-client-question.use-case.ts:172`. Controller half: `src/infrastructure/external/whatsapp/evolution/evolution-webhook.controller.spec.ts:376` - `expect(context).toEqual({ barbershopId: SHOP, reason })`; `:378-379` - `not.toContain('5511987654321')`, `not.toContain('quero falar')` (carried from 8bb08aa). Mutant (a) killed | PASS |
| C27 | OpenAPI: both routes summary US-16, x-roles owner, success + 401/403 (+400/404), 404 example; webhook description US-16 | e2e `US-16 (C27)` x3 passed, verified at 979d091 | `test/api-docs.e2e-spec.ts:184-185` - `summary` `toContain('US-16')`, `toMatchObject({ 'x-roles': ['owner'] })`; `:187-190` - description `toEqual(expect.any(String))` per status in rows :172-177; `:193` - 200 JSON schema `toBeDefined()`; `:196-198` - 404 `toContain('Cliente não encontrado.')`; `:207` - `hook.description` `toContain('US-16')` (carried from 8bb08aa) | PASS |
| C28 | PK (barbershop_id, client_id); DB refuses bad reason, pause w/o reason, reason w/o pause, -1, null activity, duplicate; client delete cascades | e2e `door 2 (C28)` x8 passed, verified at 979d091 | `test/database/whatsapp-conversations-schema.e2e-spec.ts:79-82` - PK columns `toEqual(['barbershop_id', 'client_id'])`; `:100-102` - `rejects.toMatchObject({ driverError: { code } })` over rows :86-98; `:108-110` - `code: UNIQUE_VIOLATION`; `:127` - rows after client delete `toHaveLength(0)` (carried from 8bb08aa) | PASS |
| C29 | first text creates row (0, null, NOW); redelivery after hand-off sends nothing and changes nothing | e2e `door 2 (C29)` passed, verified at 979d091 | `test/whatsapp-handoff.e2e-spec.ts:660-665` - `toEqual({ consecutive_failures: 0, paused_at: null, pause_reason: null, last_activity_at: NOW })`; `:675-676` - `sentTexts` `toHaveLength(sent)`, `toEqual(afterHandoff)` (carried from 8bb08aa) | PASS |
| C30 | US-14 and US-15 e2e still pass with no assertion change | whole suites passed (16 + 18, 0 failed, 0 pending), verified at 979d091 | `test/whatsapp-questions.e2e-spec.ts:41` - the only diff line in `9c29176..979d091` is the fixture field `humanRequested: false` in `interpretation()`; `test/whatsapp-first-contact.e2e-spec.ts` has no diff in range (the fix range touches neither file) | PASS |

Level judgment (carried from 8bb08aa): every claim that names a status code, route or response shape (C1, C3, C9, C13-C17, C21-C23, C27) has a proof that crosses the HTTP boundary. The fix adds only unit-level assertions under C3 and C26, and those close the use-case seam that round 1 flagged. They add to the existing boundary and controller proofs and replace none of them.

Swept rows resolving to `existing`: none (carried from 8bb08aa).

## Coverage

Not recomputed: profile `light`. The fix adds no branch or set member. Carried from 8bb08aa.

## Faults injected

`light` does not require fault injection. This section records the two targeted mutants the round-2 brief asked for, one on each surface the fix added. They ran in a scratch `git worktree add --detach <scratchpad>/wt HEAD` (with `node_modules` symlinked in). The real tree's `git status --porcelain` baseline was empty before the mutants. After `git worktree remove` it was still empty (`diff` of the two snapshots showed no change), and `git worktree list` shows only the real tree. Verified at 979d091.

| Mutation | Location | Narrowest proof | Killed |
| --- | --- | --- | --- |
| (a) drop `handoff: reason` from the successful hand-off return | `src/usecases/answer-client-question/answer-client-question.use-case.ts:172` | `npx jest answer-client-question.use-case.spec.ts -t "\(C26\)"` - 2 failed (`- "handoff": "requested"`, `- "handoff": "not_understood"`) | yes |
| (b) hand-off `catch` returns `{ outcome: 'none' }` | `src/usecases/answer-client-question/answer-client-question.use-case.ts:169` | `npx jest answer-client-question.use-case.spec.ts -t "US-16 hand-off AC 3 \(C3\)"` - 1 failed at `:375` (`+ "outcome": "none"`) | yes |

Both failures were assertion diffs, not compile errors. Before the mutations, the same file and pattern passed 3 tests in the scratch tree.

## Findings (ranked)

None open. The round-1 findings are resolved as follows:
1. C26 has use-case evidence at `answer-client-question.use-case.spec.ts:349-355,362-366`, and mutant (a) is killed. Resolved.
2. The C3 seam is closed at `answer-client-question.use-case.spec.ts:375-377`, and mutant (b) is killed. Resolved.
3. The C18 title now prints the case, both ages and the boolean (`test/whatsapp-handoff.e2e-spec.ts:480`). Resolved.

## Gate

Verified at 979d091:
- **Targeted proofs:** unit 38 passed, 0 failed. e2e (5 files including the C30 suites) 88 passed, 0 failed.
- **`npm run lint:check`:** exit 0.
- **`npm run build`:** exit 0.
- **`npm test`:** 91 suites, 1055 passed, 0 failed.
- **`npm run test:e2e`:** 45 suites, 680 passed, 0 failed.
- **Working tree:** `git status --porcelain` was clean before this report was written (read-only run).
