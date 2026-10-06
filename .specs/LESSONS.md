# LESSONS - auto-maintained by scripts/lessons.py

> Machine-owned. Do NOT hand-edit. Changes are overwritten on the next `lessons.py` write.
> Canonical state lives in `.specs/lessons.json`. Edit lessons only via the script.
> promote_threshold=2 distinct features · window_days=45 · quarantine_threshold=2

## Confirmed (load these at Plan/Checks)

Corroborated across multiple features. Safe to apply as guidance.

### L-007 - When the spec says only 'invalid value error', write the exact user-facing pt-BR message into the spec Assumptions before implementing, so tests are anchored to the spec and not to the author's choice.
- signal: `spec_precision_gap` · recurrence: 2 feature(s) · scope: `spec` · harmful: 1
- features: us-07-motor-de-disponibilidade, us-09-bloqueios-e-folgas
- evidence: AVL-35 + edge case seconds-in-start (booking-context.ts:25-26, book-appointment.use-case.ts:69) (spec) (+1 more)
- last seen: 2026-09-28T22:18:21Z

### L-008 - Every user-facing validation message a schema defines needs a test that asserts that exact message.
- signal: `spec_precision_gap` · recurrence: 2 feature(s) · scope: `schema` · harmful: 0
- features: us-09-bloqueios-e-folgas, us-10-agendamento-manual
- evidence: src/interface-adapters/controllers/schemas/barber-block.schema.ts:13 (confirmConflicts message untested) (schema) (+1 more)
- last seen: 2026-09-28T22:18:21Z

### L-016 - When a controller acts on a field of a use case result, assert that field on the value the use case returns, not only on a stubbed result in the controller test.
- signal: `ac_gap` · recurrence: 2 feature(s) · scope: `usecase-controller-seam` · harmful: 0
- features: us-16-transferencia-para-atendimento-humano, us-18-remarcacao-e-cancelamento-pelo-whatsapp
- evidence: C26 - src/usecases/answer-client-question/answer-client-question.use-case.spec.ts:144-150 (usecase-controller-seam) (+1 more)
- last seen: 2026-10-01T13:55:35Z

## Candidates (under observation - do NOT load as guidance yet)

Seen once or not yet corroborated. Tracked, not trusted.

### L-001 - Um check que afirma contagem absoluta de linhas depois de uma ação negada precisa considerar as linhas que o próprio fixture grava; afirme 'nada novo para o alvo e contagem inalterada' em vez de 'N linhas'.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `test/e2e` · harmful: 0
- features: us-02-convite-de-barbeiros
- evidence: checks.md C16 / test/users-permissions.e2e-spec.ts:128 (test/e2e)
- last seen: 2026-09-27T21:27:11Z

### L-002 - Database CHECK tests must include a row exactly on each strict boundary (equal values), not only clearly invalid rows.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `db-schema` · harmful: 0
- features: us-03-dados-e-horario-da-barbearia
- evidence: validation.md M15 / test/database/opening-hours-schema.e2e-spec.ts:74 (CFG-11) (db-schema) (+1 more)
- last seen: 2026-09-27T22:16:18Z

### L-003 - When a criterion lists symmetric invalid inputs (missing start or missing end), test each side separately.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `schema` · harmful: 0
- features: us-03-dados-e-horario-da-barbearia
- evidence: validation.md M19 / src/interface-adapters/controllers/schemas/barbershop-settings.schema.spec.ts:75 (CFG-10) (schema)
- last seen: 2026-09-27T22:16:18Z

### L-004 - Tenant-isolation tests for a repository write must target a row of another tenant by its own id (forged entity), including child rows, not only rows with different ids.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `repo-layer` · harmful: 0
- features: us-04-cadastro-de-servicos
- evidence: validation.md M19 / src/infrastructure/database/repositories/typeorm-service.repository.ts:62 / test/database/typeorm-service.repository.e2e-spec.ts:252 (SVC-26) (repo-layer)
- last seen: 2026-09-28T02:41:41Z

### L-005 - When a criterion says a changed setting applies to several operations, test each operation after changing the setting, with a value different from the fixture default.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `usecases` · harmful: 0
- features: us-07-motor-de-disponibilidade
- evidence: M11 src/usecases/book-appointment/book-appointment.use-case.ts:81 (AVL-17) (usecases)
- last seen: 2026-09-28T15:24:51Z

### L-006 - A criterion that names several paths (query and booking) needs evidence on each path; a shared helper does not count as coverage for the path that has no test.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `usecases` · harmful: 0
- features: us-07-motor-de-disponibilidade
- evidence: AVL-17 booking half, no evidence in book-appointment.use-case.spec.ts (usecases)
- last seen: 2026-09-28T15:24:51Z

### L-009 - Booking-rule tests must include an interval that ends exactly on each inclusive limit (closing time, end of the working day, start of the next appointment), not only intervals that cross it.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `usecases` · harmful: 0
- features: us-10-agendamento-manual
- evidence: validation.md M8 / src/domain/value-objects/barber-day-schedule.ts:90 (edge case: ends at closing) (usecases) (+1 more)
- last seen: 2026-09-28T22:18:21Z

### L-010 - A job that skips a failing tenant must log the caught error with the tenant id, and a test must assert that log.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `jobs` · harmful: 0
- features: us-11-atendimento-e-faltas
- evidence: ATD-27 Assumption 'Falha da rotina'; src/usecases/reset-expired-no-shows/reset-expired-no-shows.use-case.ts:35 (jobs)
- last seen: 2026-09-29T14:47:45Z

### L-011 - An availability test must use rules and times where the engine would offer the slot if the rule under test were broken, and assert the exact offered starts.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `e2e` · harmful: 0
- features: us-11-atendimento-e-faltas
- evidence: mutant E3 survived test/attendance.e2e-spec.ts:307 (e2e)
- last seen: 2026-09-29T14:47:45Z

### L-012 - Before committing, run every proof selector literally and confirm it selects at least one test: Jest exits 0 when -t matches nothing, so a describe named 'C35:' instead of '(C35)' ships an unproven check.
- signal: `gate_fail` · recurrence: 1 feature(s) · scope: `test` · harmful: 0
- features: us-13-conexao-do-whatsapp
- evidence: test/whatsapp-connection.e2e-spec.ts:551 (C35) (test)
- last seen: 2026-09-29T21:55:40Z

### L-013 - For a conditional UPDATE on Postgres, use the TypeORM query builder and check result.affected; dataSource.query returns [rows, count] for UPDATE ... RETURNING, so rows.length is always 2.
- signal: `gate_fail` · recurrence: 1 feature(s) · scope: `repository` · harmful: 0
- features: us-14-primeiro-contato-e-aviso-de-privacidade
- evidence: src/infrastructure/database/repositories/typeorm-client.repository.ts:100 (repository)
- last seen: 2026-09-29T22:38:12Z

### L-014 - When a check claims which part of an input is kept (first N, last N), build the test input from distinguishable characters so the assertion checks content, not only length.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `tests` · harmful: 0
- features: us-15-duvidas-sobre-a-barbearia
- evidence: C20 - answer-client-question.use-case.spec.ts:260-262 (tests)
- last seen: 2026-09-29T23:11:38Z

### L-015 - When a bound limits model output echoed back to a user, apply it to every field whose text can reach the reply, not only the field the criterion names.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `llm` · harmful: 0
- features: us-15-duvidas-sobre-a-barbearia
- evidence: AC 20 - client-question-reply.ts:79-81; message-interpretation.schema.ts services max(80) (llm)
- last seen: 2026-09-29T23:11:38Z

### L-017 - In a table-driven check, write the exact expected output of every row, including the boundary row where the rule does not fire.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `spec` · harmful: 0
- features: us-17-agendamento-pelo-whatsapp
- evidence: C25 (src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts:371) (spec)
- last seen: 2026-10-01T00:46:26Z

### L-018 - When a check reuses the reply of another check, assert the full reply text again, not a substring of it.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `spec` · harmful: 0
- features: us-17-agendamento-pelo-whatsapp
- evidence: C9 (src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts:183) (spec)
- last seen: 2026-10-01T00:46:26Z

### L-019 - When a check restates the statuses of an existing route, read them from the generated OpenAPI document and that route's own docs test, and cite a proof that asserts that route, not a generic test of another route.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `api-docs` · harmful: 0
- features: us-18-remarcacao-e-cancelamento-pelo-whatsapp
- evidence: checks.md C37 / test/api-docs.e2e-spec.ts:73-86 (asserts only /users/invitations and /me) / test/clients.e2e-spec.ts:664 (/clients/{id} documents no 403) (api-docs)
- last seen: 2026-10-01T13:41:45Z

### L-020 - When a check enumerates the members a multi-condition filter excludes, give each condition a member that only that condition excludes (e.g. a past appointment with the passing status), or deleting the condition goes unnoticed.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `checks` · harmful: 0
- features: us-19-lembretes-de-24h-e-1h
- evidence: F4 confirm-presence-via-whatsapp.use-case.ts:39 (checks)
- last seen: 2026-10-01T15:19:48Z

### L-021 - For each time condition in a filter, name the boundary member equal to now in checks.md, as the reminder windows do; otherwise swapping > for >= survives.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `checks` · harmful: 0
- features: us-19-lembretes-de-24h-e-1h
- evidence: confirm-presence-via-whatsapp.use-case.ts:39 (> vs >=) (checks)
- last seen: 2026-10-01T15:19:48Z

### L-022 - When a migration adds constraints, write one schema assertion per constraint (each CHECK, UNIQUE, partial index and FK with its 23503/23505/23514 code), not only those named in the check claim.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `schema` · harmful: 0
- features: us-20-cobranca-recorrente-da-assinatura
- evidence: C43 round 1: gateway_checkout_id UNIQUE and FKs (schema)
- last seen: 2026-10-02T16:19:16Z

### L-023 - A metric check over a label set must assert each label value by name; a regex that merely allows a value proves nothing about it.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `metrics` · harmful: 0
- features: us-20-cobranca-recorrente-da-assinatura
- evidence: C42 round 1: event_group payment_failed (metrics)
- last seen: 2026-10-02T16:19:16Z

### L-024 - When a check claims an order (A before B) or an independence (X does not depend on Y), assert it directly: capture state at the moment of B, or flip Y and re-read X.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `usecase` · harmful: 0
- features: us-20-cobranca-recorrente-da-assinatura
- evidence: C6 and C29 round 1 (usecase)
- last seen: 2026-10-02T16:19:16Z

### L-025 - A rule decided mid-build (a strict vs non-strict comparison) needs a test exactly on its boundary in the same commit that changes it, or a flipped operator survives.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `domain` · harmful: 0
- features: us-21-suspensao-por-assinatura-inativa
- evidence: verification.md F2 / src/domain/entities/barbershop-subscription.ts:183 (C35) (domain)
- last seen: 2026-10-06T16:08:27Z

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
