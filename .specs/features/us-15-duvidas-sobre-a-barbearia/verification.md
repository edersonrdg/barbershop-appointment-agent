# US-15: Bot responde dúvidas sobre a barbearia verification

**Verdict**: PASS
**Profile**: light
**Diff range**: 9773d65..6f8db58
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

Every check C1-C29 was re-run at `6f8db58`, each named test appeared individually as passed (jest `--json` per-test results), and each check has one located settling assertion below. Under `light`, fault injection and the `Coverage` recompute are not run (profile table in `verify.md`); the author's `Coverage` table was not re-derived and no mutant was tried, so "a test that would pass under a wrong implementation" is not ruled out by this report.

## Binding sources

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| docs/PRD.md US-15 (CA-15.1 to CA-15.5) | yes - docs/PRD.md:620-634 | none | - |
| docs/PRD.md RF-05, RF-08, RF-09 | yes - docs/PRD.md:145, 148, 149 | none | - |
| docs/PRD.md RNF-01 | yes - docs/PRD.md:915 | none | - |
| CLAUDE.md "IA (Gemini)" | yes - port in usecases/, structured JSON output validated with Zod, model from env, fake in tests, latency/tokens/errors recorded | none | - |

Notes (not contradictions; see findings): CA-15.5 / RNF-01 (reply within 10 s at p95) is a production SLO. The checks bound it (C18 timeout, C22 abortSignal, C23 default 8000 ms) and measure the Gemini leg (C24), but no check asserts an end-to-end reply time, and the only test name citing CA-15.5 is the fallback test (C17). The step-1 composition enumeration applies to `ui` designs and has no input here (no screen in this feature).

## Checks

Proof runs (one per target):
- unit: `npx jest src/usecases/answer-client-question/answer-client-question.use-case.spec.ts src/infrastructure/external/gemini/gemini-message-interpreter.spec.ts src/infrastructure/config/env.schema.spec.ts src/infrastructure/external/whatsapp/evolution/evolution-webhook.controller.spec.ts --verbose --json -t "\(C2\)|\(C3\)|\(C4\)|\(C5\)|\(C6\)|\(C7\)|\(C9\)|\(C11\)|\(C13\)|\(C18\)|\(C19\)|\(C20\)|\(C22\)|\(C23\)|\(C24\)|\(C25\)"` exit 0 - 52 passed, 0 failed (3 of them are US-14 `CA-14.2 (C13)` tests in env.schema.spec.ts matched by the `(C13)` alternation; irrelevant to US-15 C13, which resolves to the use-case test)
- e2e: `npx jest --config ./test/jest-e2e.json test/whatsapp-questions.e2e-spec.ts test/app.e2e-spec.ts test/api-docs.e2e-spec.ts --verbose --json -t "\(C1\)|\(C4\)|\(C8\)|\(C10\)|\(C12\)|\(C14\)|\(C15\)|\(C16\)|\(C17\)|\(C19\)|\(C26\)|\(C27\)|\(C28\)|\(C29\)"` exit 0 - 19 passed, 0 failed
- shell: C21 command exit 0

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | services named -> 1 sendText with registered prices in catalog order, 204 | e2e `CA-15.1 (C1)` passed | `test/whatsapp-questions.e2e-spec.ts:204` - `messageUpsert().expect(204)`; `:206-212` - `expect(connector.sentTexts).toEqual([{ barbershopId: shopA, phone: PHONE, text: 'Na Barbearia do Zé:\n- Barba: R$ 30,00, 20 min\n- Corte: R$ 45,00, 30 min' }])` | PASS |
| C2 | price and duration formatting table | unit `AC 2 (C2)` x11 passed | `src/usecases/answer-client-question/answer-client-question.use-case.spec.ts:132` - `expect(formatPrice(cents)).toBe(expected)` over the 5 rows at :126-130; `:143` - `expect(formatDuration(minutes)).toBe(expected)` over the 6 rows at :136-141 | PASS |
| C3 | services with nothing named lists all active, no inactive | unit `CA-15.1 (C3)` passed | `answer-client-question.use-case.spec.ts:149` - `expect(await reply(interpretation({ topics: ['services'] }))).toEqual([SERVICES_REPLY])` (SERVICES_REPLY at :26-27, no Hidratação) | PASS |
| C4 | unknown service -> "não oferece", no R$; mixed in use case | e2e `CA-15.2 (C4)` + unit `CA-15.2 (C4)` passed | `test/whatsapp-questions.e2e-spec.ts:232-233` - `expect(textsTo()).toEqual(['A Barbearia do Zé não oferece Pé e mão.'])`, `expect(textsTo()[0]).not.toContain('R$')`; `answer-client-question.use-case.spec.ts:165` - `toEqual(['Na Barbearia do Zé:\n- Corte: R$ 45,00, 30 min\nA Barbearia do Zé não oferece Pé e mão.'])` | PASS |
| C5 | case-insensitive match; inactive and other-tenant are unknown | unit `CA-15.2 (C5)` x3 passed | `answer-client-question.use-case.spec.ts:183-185` - `expect(await reply(interpretation({ topics: ['services'], services: [name] }))).toEqual([expected])` over rows :171-177 ('corte', 'Hidratação', 'Luzes') | PASS |
| C6 | no active service -> "ainda não tem serviços cadastrados" | unit `AC 6 (C6)` passed | `answer-client-question.use-case.spec.ts:192-194` - `toEqual(['A Barbearia do Zé ainda não tem serviços cadastrados.'])` | PASS |
| C7 | interpreter gets only active names of the tenant | unit `RN-26 (C7)` passed | `answer-client-question.use-case.spec.ts:202-208` - `expect(interpreter.inputs).toEqual([{ barbershopName: SHOP, serviceNames: ['Barba', 'Corte'], text: 'tem luzes?' }])` | PASS |
| C8 | address topic -> "Endereço da ...: Rua das Flores, 123 - Centro" | e2e `CA-15.4 (C8)` passed | `test/whatsapp-questions.e2e-spec.ts:249-251` - `expect(textsTo()).toEqual(['Endereço da Barbearia do Zé: Rua das Flores, 123 - Centro'])` | PASS |
| C9 | null address -> "ainda não informou o endereço" | unit `CA-15.4 (C9)` passed | `answer-client-question.use-case.spec.ts:214-216` - `toEqual(['A Barbearia do Zé ainda não informou o endereço.'])` | PASS |
| C10 | opening hours 7 lines with break and fechado | e2e `CA-15.4 (C10)` passed | `test/whatsapp-questions.e2e-spec.ts:271-273` - `expect(textsTo()).toEqual(['Horário de funcionamento:\nSegunda-feira: 09:00 às 18:00 (intervalo 12:00 às 13:00)\n...\nSábado: 08:00 às 12:00\nDomingo: fechado'])` | PASS |
| C11 | multiple topics -> 1 message, services/address/hours order | unit `AC 11 (C11)` passed | `answer-client-question.use-case.spec.ts:229-235` - `expect(texts).toEqual([[services, address, hours].join('\n\n')])` with topics given as `['opening_hours','address','services']` at :224 | PASS |
| C12 | offTopic (extendedTextMessage) -> exact refusal | e2e `CA-15.3 (C12)` passed | `test/whatsapp-questions.e2e-spec.ts:292` - `expect(textsTo()).toEqual([REFUSAL])`; `:293-295` - interpreter received the `extendedTextMessage.text` | PASS |
| C13 | no topic, not offTopic -> fallback text | unit `CA-15.3 (C13)` passed | `answer-client-question.use-case.spec.ts:241` - `expect(await reply(interpretation({}))).toEqual([FALLBACK])` (FALLBACK literal at :24-25) | PASS |
| C14 | audio/blank/no message -> 204, 0 interpret, 0 sendText; new-number audio -> only notice | e2e `AC 14 (C14)` x2 passed | `test/whatsapp-questions.e2e-spec.ts:299-304` - three `.expect(204)` then `expect(interpreter.inputs).toHaveLength(0)`, `expect(connector.sentTexts).toHaveLength(0)`; `:313-321` - `toHaveLength(0)`, `textsTo()` equals only the privacy notice, client row `toHaveLength(1)` | PASS |
| C15 | notice then reply, both before 204 | e2e `AC 15 (C15)` passed | `test/whatsapp-questions.e2e-spec.ts:332` - `.expect(204)` awaited before `:334-341` - `expect(textsTo()).toEqual([expect.stringContaining('Política de privacidade'), 'A Barbearia do Zé ainda não informou o endereço.'])` | PASS |
| C16 | same key.id 2x parallel + 1x sequential -> 1 interpret, 1 reply; shop B answered | e2e `AC 16 (C16)` passed | `test/whatsapp-questions.e2e-spec.ts:356-358` - statuses `[204, 204]`, `expect(interpreter.inputs).toHaveLength(1)`, `expect(textsTo()).toHaveLength(1)`; `:363-365` - `expect(textsTo(shopB)).toEqual(['Na Barbearia B:\n- Luzes: R$ 90,00, 1h'])` | PASS |
| C17 | interpreter rejects -> 204 + exact unavailable text | e2e `CA-15.5 (C17)` passed | `test/whatsapp-questions.e2e-spec.ts:371-373` - `messageUpsert().expect(204)`; `expect(textsTo()).toEqual([UNAVAILABLE])` | PASS |
| C18 | adapter rejects on SDK error, timeout, bad JSON, schema violations; accepts 3x60 | unit `AC 17, AC 20 (C18)` x8 + `AC 20 (C18)` passed | `src/infrastructure/external/gemini/gemini-message-interpreter.spec.ts:160-162` - `await expect(interpreter.interpret(INPUT)).rejects.toBeInstanceOf(MessageInterpreterUnavailableError)` over rows :124-155; `:170-172` - `resolves.toMatchObject({ unknownServices })` | PASS |
| C19 | send fails -> 204, log has barbershopId + error name, no phone/text | e2e `AC 18 (C19)` + unit `AC 18 (C19)` passed | `test/whatsapp-questions.e2e-spec.ts:387` - `.expect(204)`; `:392-395` - logged contains `'Reply could not be sent.'` and `shopA`, `not.toContain('5511987654321')`, `not.toContain('quanto custa')`; `src/infrastructure/external/whatsapp/evolution/evolution-webhook.controller.spec.ts:306-309` - `expect(context).toEqual({ barbershopId: SHOP, err: { name: 'SmtpError', code: 'EENVELOPE' } })` | PASS |
| C20 | text truncated to 1000 chars; 1000 passes whole | unit `AC 19 (C20)` x2 passed | `answer-client-question.use-case.spec.ts:262` - `expect(interpreter.inputs[0].text).toHaveLength(expected)` over rows `[1500, 1000]`, `[1000, 1000]` (precision gap: see findings) | PASS |
| C21 | `@google/genai` imported only under src/infrastructure/external/gemini/ | the C21 shell proof from checks.md (grep of `@google/genai` in src, excluding the gemini folder, piped to `test -z`) exit 0 | hits only `src/infrastructure/external/gemini/create-gemini-message-interpreter.ts:1`, `src/infrastructure/external/gemini/gemini-message-interpreter.ts:2`, and its spec | PASS |
| C22 | generateContent params and ping via models.get | unit `AC 22 (C22)` x2 passed | `gemini-message-interpreter.spec.ts:97-106` - `toHaveLength(1)`, `expect(call.model).toBe(MODEL)`, `expect(call.contents).toBe(CLIENT_TEXT)`, `expect(call.config).toMatchObject({ responseMimeType: 'application/json', responseJsonSchema: z.toJSONSchema(messageInterpretationSchema), temperature: 0 })`, `expect(call.config?.abortSignal).toBeInstanceOf(AbortSignal)`; `:110` - instruction `toContain` each name; `:119` - `expect(models.gets).toEqual([{ model: MODEL }])` | PASS |
| C23 | env refuses missing/empty key, missing model, -latest in prod; defaults timeout 8000 | unit `US-15 (C23)` x7 passed | `src/infrastructure/config/env.schema.spec.ts:171` - `expect(() => validateEnv({ ...validEnv, ...override })).toThrow(message)` over rows :154-169; `:181` / `:191` - accepted models `toBe(...)`; `:195` - `expect(validateEnv(validEnv).GEMINI_TIMEOUT_MS).toBe(8000)` | PASS |
| C24 | gemini metrics: ok counts, tokens, duration; error/timeout/invalid; labels only outcome/type | unit `RNF-01 (C24)` x5 passed | `gemini-message-interpreter.spec.ts:180-183` - `gemini_requests_total{outcome="ok"}` 1, tokens prompt 120 / output 15, duration count 1; `:196` - `expect(await metric(\`gemini_requests_total{outcome="${outcome}"}\`)).toBe(1)`; `:211` - `expect(new Set(labels)).toEqual(new Set(['outcome', 'type', 'le']))` | PASS |
| C25 | per-call log has model, latencyMs, outcome, tokens; no client text or model output | unit `AC 25 (C25)` x2 passed | `gemini-message-interpreter.spec.ts:227-235` - `toMatchObject({ model: MODEL, outcome })`, `typeof entry.latencyMs` `'number'`, `toMatchObject({ promptTokens: 120, outputTokens: 15 })`, `serialized` `not.toContain(CLIENT_TEXT)` / `not.toContain(JSON.stringify(VALID))` | PASS |
| C26 | each scenario bumps exactly one whatsapp_replies_total kind | e2e `US-15 (C26)` x4 passed | `test/whatsapp-questions.e2e-spec.ts:427-429` - `expect(after.map((value, index) => value - before[index])).toEqual(kinds.map((each) => (each === kind ? 1 : 0)))` over answer/off_topic/fallback/unavailable | PASS |
| C27 | /health/ready 200 gemini up, 503 gemini down | e2e `US-15 (C27)` x2 passed | `test/app.e2e-spec.ts:90-92` - `.expect(200)`, `toMatchObject({ details: { gemini: { status: 'up' } } })`; `:103-107` - `.expect(503)`, `toMatchObject({ details: { gemini: { status: 'down' } } })` | PASS |
| C28 | OpenAPI webhook description cites US-15 | e2e `US-15 (C28)` passed | `test/api-docs.e2e-spec.ts:168` - `expect(hook.description).toContain('US-15')` (also `:167` summary) | PASS |
| C29 | table PK (barbershop_id, message_id), received_at timestamptz NOT NULL, 3 columns; row stored | e2e `US-15 (C29)` passed | `test/whatsapp-questions.e2e-spec.ts:439-449` - columns `toEqual(['barbershop_id','message_id','received_at'])`, `toMatchObject({ data_type: 'timestamp with time zone', is_nullable: 'NO' })`; `:458-461` - PK `toEqual(['barbershop_id','message_id'])`; `:469-471` - `expect(rows).toEqual([{ barbershop_id: shopA, message_id: id, received_at: NOW }])` | PASS |

Level judgment: every claim naming a status code or HTTP shape (C1, C14, C15, C17, C19, C27, C28) has a proof that crosses the HTTP boundary (supertest against the booted `AppModule`). C21 is a repository-wide grep. All proof tests are new in the diff range (added in `test/whatsapp-questions.e2e-spec.ts`, `answer-client-question.use-case.spec.ts`, `gemini-message-interpreter.spec.ts`, and new blocks in `env.schema.spec.ts`, `evolution-webhook.controller.spec.ts`, `app.e2e-spec.ts`, `api-docs.e2e-spec.ts`).

Swept rows resolving to `existing`, re-read against the code:
- authorization: `EvolutionWebhookGuard` is present - `src/infrastructure/external/whatsapp/evolution/evolution-webhook.controller.ts:52` `@UseGuards(EvolutionWebhookGuard)`. Confirmed.

## Coverage

Not recomputed - profile `light`. The author's `Coverage` table in `checks.md` was read, not re-derived.

## Faults injected

Not run - profile `light`.

## Findings (non-blocking, ranked)

1. CA-15.5 / RNF-01 has no end-to-end latency assertion or end-to-end metric. Only the Gemini leg is timed (`gemini_request_duration_seconds`, `src/infrastructure/external/gemini/gemini-message-interpreter.ts:58-63`). The synchronous path (door 4) is notice send, then Gemini (up to `GEMINI_TIMEOUT_MS` 8000), then the reply send (bounded by `EVOLUTION_TIMEOUT_MS` default 10000, `src/infrastructure/config/env.schema.ts`), so the worst case exceeds 10 s and the p95 cannot be observed from `/metrics`. The only test name citing CA-15.5 is the fallback test (`test/whatsapp-questions.e2e-spec.ts:368`, C17). This is a traceability and precision gap in the checks, not a contradiction.
2. C20 precision gap: `answer-client-question.use-case.spec.ts:260-262` uses `'a'.repeat(length)` and asserts only `toHaveLength`, so it cannot tell "the first 1000" from any other 1000 characters. The implementation is correct on read (`src/usecases/answer-client-question/answer-client-question.use-case.ts:103` `.slice(0, MAX_TEXT_LENGTH)`).
3. The AC 20 echo bound can be bypassed through `services`. A name in `interpretation.services` that is not an active catalog name is echoed as "não oferece {name}" (`src/usecases/answer-client-question/client-question-reply.ts:79-81,98-99`). The schema bounds those names only to 80 characters and 20 items (`src/infrastructure/external/gemini/message-interpretation.schema.ts`, `services: z.array(z.string().min(1).max(80)).max(20)`), not the 3 x 60 limit AC 20 sets. So model-echoed text in the reply is bounded more loosely than the plan's rationale intends. No check covers it, and it does not contradict any check as written.
4. `ping()` has no timeout (`gemini-message-interpreter.ts:108-114`). A slow `models.get` would stall `GET /health/ready` instead of reporting `down`. This is outside the checks.
5. Test-name labelling: `CA-15.5 (C17)` (`test/whatsapp-questions.e2e-spec.ts:368`) and `CA-15.3 (C13)` (`answer-client-question.use-case.spec.ts:238`) cite CAs that only loosely match what they prove (the unavailable fallback and the no-topic fallback). This is cosmetic and relates to finding 1.

## Gate

- Targeted proofs: unit 52 passed, 0 failed; e2e 19 passed, 0 failed; C21 shell exit 0
- Full `npx jest` - 91 suites, 1034 passed, 0 failed
- Full `npx jest --config ./test/jest-e2e.json` - 43 suites, 637 passed, 0 failed
- `git status --porcelain` clean before writing this report (read-only run)
