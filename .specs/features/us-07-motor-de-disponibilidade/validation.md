# US-07 Motor de disponibilidade Validation

**Date**: 2026-09-28
**Spec**: `.specs/features/us-07-motor-de-disponibilidade/spec.md`
**Diff range**: `cf2394d..HEAD` on `feat/us-07-availability-engine` (53b788c docs; 3bf3600..0088c3a = T1..T11; cf41317 = F1)
**Verifier**: independent sub-agent (author ≠ verifier)
**Verdict**: PASS (round 2, after fix F1). Round 1 was FAIL; its report is kept below, and the round-2 evidence is in "Re-verification (round 2)" at the end.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 | ✅ Done | 3bf3600 |
| T2 | ✅ Done | 2ba9d9d |
| T3 | ✅ Done | 7750131 |
| T4 | ✅ Done | e84255a |
| T5 | ✅ Done | a36373d |
| T6 | ✅ Done | ff74b59 (the AVL-17 booking half has no test, see Fix 1) |
| T7 | ✅ Done | 9795c7b |
| T8 | ✅ Done | baa0e4f |
| T9 | ✅ Done | 36a9806 |
| T10 | ✅ Done | d3cf4d1 |
| T11 | ✅ Done | 0088c3a |

All 11 tasks are marked done in `tasks.md`. None is blocked or partial.

---

## Spec-Anchored Acceptance Criteria

Abbreviations: `DS` = `src/domain/value-objects/barber-day-schedule.spec.ts`, `LS` = `src/usecases/list-available-slots/list-available-slots.use-case.spec.ts`, `BA` = `src/usecases/book-appointment/book-appointment.use-case.spec.ts`, `PM` = `src/infrastructure/observability/prometheus-appointment-metrics.spec.ts`, `SCH` = `test/database/appointments-schema.e2e-spec.ts`, `ARE` = `test/database/typeorm-appointment.repository.e2e-spec.ts`, `BRE` = `test/database/typeorm-barber-block.repository.e2e-spec.ts`, `SE` = `test/scheduling.e2e-spec.ts`.

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| AVL-01 fits inside opening and working hours | Independent Test: exactly 10:00, 10:30, 11:00, 13:00, 14:45, 16:00 | `LS:101` `expect(slots).toEqual([...6 slots with barberId/startsAt/endsAt])`; `DS:50` same six | ✅ PASS |
| AVL-02 duration = sum (RN-04) | 30 + 15 = 45 min, so end = start + 45 | `LS:102` `endsAt: at('10:45')`; `BA:169` `endsAt: at('10:45')` for `['beard','haircut']` | ✅ PASS |
| AVL-03 30-min grid from the start of each free period | 14:45 start after an appointment ending 14:45; grid of 30 | `DS:50` (14:45 and 16:00 present); `DS:78` `[09:00, 09:30]` | ✅ PASS |
| AVL-04 blocks removed | block overlapping by 1 min removes the start | `DS:120` `toEqual([09:00, 09:30, 11:00, 11:30])`; `LS:101` (15:30 block) | ✅ PASS |
| AVL-05 appointments removed | 1-min overlap removes the start | `DS:106` `toEqual([09:00, 09:30, 11:00, 11:30])` | ✅ PASS |
| AVL-06 touching intervals are free | start == appointment end, end == block start → offered | `DS:97` `toEqual([at('10:00')])`; `DS:195` `violationOf(14:45-15:00)` `toBeNull()` | ✅ PASS |
| AVL-07 closed day / no working day → `[]` | empty list | `LS:144` `toEqual([])` (Wednesday closed); `LS:155` `toEqual([])` (Tuesday off); `DS:129-130` | ✅ PASS |
| AVL-08 start, end (UTC), barberId, ascending | ascending order regardless of period order | `DS:138` `toEqual([09:00, 09:30, 13:00, 13:30])` with periods given out of order; `LS:101` | ✅ PASS |
| AVL-09 barbershop timezone | Manaus 09:00 = 13:00Z | `LS:127` `toEqual([2026-10-05T13:00Z, 13:30Z])` | ✅ PASS |
| AVL-10 any barber: all eligible | each eligible barber computed | `LS:209` (Bruno and Ana both contribute); `LS:236` only Bruno does both services | ✅ PASS |
| AVL-11 one entry per start, first by name | 10:00 → Bruno (Ana busy), 10:30 → Ana | `LS:209` `toEqual([{bruno,10:00},{ana,10:30},{ana,11:30}])`, seeded out of name order; case-insensitive order is the pre-existing port contract (`test/database/typeorm-barber.repository.e2e-spec.ts:253`) | ✅ PASS |
| AVL-12 no inactive, no ineligible | Caio (inactive) and Davi (no haircut) never appear | `LS:209` (exact list, no caio/davi) | ✅ PASS |
| AVL-13 no eligible barber → `[]` | empty list | `LS:255` `toEqual([])` | ✅ PASS |
| AVL-14 bot uses now + advance | 10:05 + 60 → from 11:30 | `LS:280` it.each `['bot', grid('11:30','11:30')]` | ✅ PASS |
| AVL-15 panel only from now | 10:05 → from 10:30 | `LS:280` it.each `['manual', grid('10:30','11:30')]` | ✅ PASS |
| AVL-16 exact boundary is available | bot 10:00+60 → 11:00 offered; manual 10:00 offered | `LS:289` `grid('11:00','11:30')`; `LS:292` `grid('10:00','11:30')`; `DS:152` | ✅ PASS |
| AVL-17 changed advance applies to the next query **and booking** | query and booking read the new value | Query: `LS:304-305` before `grid('10:00',…)`, after 120 min `grid('11:00',…)`. **Booking: no evidence** (no booking test changes the rule; every booking test runs with 60 min) | ❌ GAP (booking half) |
| AVL-18 persists confirmed booking | status confirmed, origin, barber, services in order, start, end = start + total | `BA:169-170` `toEqual(expected)` and stored list `[SEEDED, expected]` for bot and manual; `ARE:119,135` row columns and `appointment_services` positions 0/1 | ✅ PASS |
| AVL-19 bot inside advance → RN-02 | `MinimumAdvanceNotMetError`, rule RN-02 | `BA:235-241` + `BA:285` `expectRefusal(…, MinimumAdvanceNotMetError, '…60 minutos…', 'RN-02')` | ✅ PASS |
| AVL-20 past → "O horário já passou." | exact message, no RN | `BA:243-248` + `BA:285` (`SlotInPastError`, `'O horário já passou.'`, `undefined`) | ✅ PASS |
| AVL-21 outside opening → RN-05 | outside-opening error citing RN-05 | `BA:251-256` + `BA:285` (`OutsideOpeningHoursError`, `'RN-05'`); `DS:175` | ✅ PASS |
| AVL-22 outside working → RN-05 | outside-working error citing RN-05 | `BA:259-264` + `BA:285`; `DS:181` | ✅ PASS |
| AVL-23 blocked → RN-05 | blocked error citing RN-05 | `BA:267-272` + `BA:285` (`BarberUnavailableError`, `'RN-05'`); `DS:187` | ✅ PASS |
| AVL-24 overlap → RN-03 | conflict error citing RN-03 | `BA:275-280` + `BA:285` (`AppointmentConflictError`, `'RN-03'`); `DS:191` | ✅ PASS |
| AVL-25 first rule in order | barber/services → past → advance → opening → working → block → overlap | `BA:302-357` six pairwise cases, `BA:354` `rejects.toBeInstanceOf(errorType)`; `DS:215-223` | ✅ PASS |
| AVL-26 refusal persists nothing | no appointment, no appointment_service | `BA:291` `stored(...)).toEqual([SEEDED])` for every rule; `ARE:175-181` `count('appointments')).toBe(1)`, `secondServices).toHaveLength(0)`; `ARE:201-202` rollback both tables 0 | ✅ PASS |
| AVL-27 offered slot is accepted | every slot returned books with same now | `BA:214` for bot and manual; `DS:69` all `null`; `SE:233,244` real DB | ✅ PASS |
| AVL-28 concurrent → exactly one, other RN-07 | one fulfilled, one `AppointmentConflictError` RN-07, one row | `SE:180-191` `fulfilled).toHaveLength(1)`, `reason).toMatchObject({rule:'RN-07',…})`, `rows).toEqual([{id}])`, services count 1 (barrier, no sleep) | ✅ PASS |
| AVL-29 exclusion constraint on direct INSERT | 23P01 on `appointments_no_overlap` | `SCH:135` and `SCH:155` `toMatchObject({driverError:{code:'23P01', constraint:'appointments_no_overlap'}})` + count 1 | ✅ PASS |
| AVL-30 touching accepted by DB | both sides accepted | `SCH:179` `count('appointments')).toBe(3)` | ✅ PASS |
| AVL-31 different barbers accepted | overlap across barbers accepted | `SCH:195` `toBe(2)` | ✅ PASS |
| AVL-32 missing/inactive barber → "Barbeiro não encontrado." | query and booking | `LS:340-349` (ghost, bia, zeca); `BA:403-420` + `BA:456-462` | ✅ PASS |
| AVL-33 missing/inactive service → "Serviço não encontrado." | query and booking | `LS:353-366` (ghost, old, foreign, with barber and any); `BA:421-438` + `BA:456-462` | ✅ PASS |
| AVL-34 barber does not perform service | query and booking refused | `LS:373` `ServiceNotPerformedError`; `BA:475` | ✅ PASS |
| AVL-35 empty or repeated list → invalid value | `InvalidValueError` (message not defined in spec) | `LS:380-396` `'Escolha pelo menos um serviço.'` / `'Escolha cada serviço uma única vez.'`; `BA:439-450` | ⚠️ Spec-precision gap (messages chosen by author) |
| AVL-36 tenant-scoped reads | other tenant's blocks/appointments do not affect result | `LS:435` full grid kept; `ARE:266` `toEqual([])` with wrong tenant; `BRE:422` `toEqual([])`; foreign service/barber in `LS:340,353` | ✅ PASS |
| AVL-37 composite FKs refuse cross-tenant rows | 23503 on each composite FK | `SCH:269` `appointments_barber_fk`; `SCH:291` `appointment_services_service_fk`; `SCH:313` `appointment_services_appointment_fk`; `SCH:346` `barber_blocks_barber_fk` | ✅ PASS |
| AVL-38 booked counter with origin | +1 with `origin` of the booking | `BA:521` `bookings).toEqual([origin])`; `PM:165` `{labels:{origin:'bot'}, value:1}`; `SE:265` `appointments_booked_total{origin="manual"} 1` | ✅ PASS |
| AVL-39 conflict counter with origin | +1 on RN-03 and on RN-07 | `BA:535` (RN-03 path); `BA:507` `conflicts).toEqual(['bot'])` (RN-07 path); `PM:177`; `SE:268` | ✅ PASS |

**Status**: ❌ 1 gap (AVL-17 booking half) · ⚠️ 2 spec-precision gaps (AVL-35 messages; seconds-in-start message)

Test names: every `CA-07.1..CA-07.5` has tests naming it (`DS`, `LS`, `BA`, `SCH:123` describe, `ARE:151`, `SE:154`). Requirements without a CA cite the RN or the AVL id (`RN-26`, `AVL-32`, `AVL-38`). Test `ARE:184` (rollback) cites neither; it maps to T9's Done-when.

---

## Edge Cases

- [x] Past date → `[]`: `LS:166` `toEqual([])`.
- [x] Invalid date format / non-existent date → invalid value: `LS:400-410` `'2026-02-30'`, `'05/10/2026'`, `'2026-10-5'` → `InvalidValueError('Data inválida.')` for one barber and any barber.
- [x] ⚠️ Start with seconds or milliseconds → invalid value: `BA:378-390` `InvalidValueError('Horário inválido.')`, nothing stored. The message is not defined in the spec (author's choice).
- [x] Free period shorter than the duration → nothing: `DS:87` `toEqual([])`.
- [x] Working day starting before opening → grid from opening: `DS:78` `[09:00, 09:30]`.
- [x] Free period off the grid → grid restarts at the appointment end: `DS:50` / `LS:101` (14:45).
- [x] Same booking twice → conflict, one appointment: `BA:361-375` (RN-03, one new row); `SE:257` in the real DB.
- [x] No saved rules → `BookingRules.defaults()`: `LS:308-314` bot from 10:00 with now 09:00 (60 min). Booking reuses the same `loadBookingContext` (`src/usecases/shared/booking-context.ts:72-74`) but has no test of its own.

---

## Discrimination Sensor

Isolated scratch: `git worktree add <scratchpad>/verifier-wt HEAD`, `.env` copied, `node_modules` symlinked. Real tree `git status --porcelain` was empty before and still empty after `git worktree remove --force`. No stash. No migration mutation, because the DB is shared; the `'[)'` range is covered by the boundary tests `SCH:155` (1-min overlap refused) and `SCH:179` (touching accepted).

| # | File:line | Description | Suite | Killed? |
| - | --------- | ----------- | ----- | ------- |
| M1 | `src/domain/value-objects/barber-day-schedule.ts:4` | Grid step 30 → 15 | unit | ✅ Killed (18 failed) |
| M2 | `src/domain/value-objects/barber-day-schedule.ts:46` | Grid anchored to the absolute half hour instead of the free-period start | unit | ✅ Killed (3) |
| M3 | `src/domain/value-objects/barber-day-schedule.ts:95` | Half-open overlap `<` → `<=` | unit | ✅ Killed (6) |
| M4 | `src/domain/value-objects/barber-day-schedule.ts:50` | Earliest filter `start < earliest` → `<=` | unit | ✅ Killed (4) |
| M5 | `src/usecases/book-appointment/book-appointment.use-case.ts:78-83` | Swap past and advance checks | unit | ✅ Killed (1) |
| M6 | `src/usecases/shared/booking-context.ts:80` | Minimum advance applied to `manual` too | unit | ✅ Killed (2) |
| M7 | `src/usecases/list-available-slots/list-available-slots.use-case.ts:70` | Any-barber tie-break: last barber wins instead of first by name | unit | ✅ Killed (1) |
| M8 | `src/infrastructure/database/repositories/typeorm-appointment.repository.ts:26` | Tenant filter removed from `listBusyPeriods` | e2e | ✅ Killed (1) |
| M9 | `src/infrastructure/database/repositories/typeorm-appointment.repository.ts:68` | 23P01 translated to RN-03 instead of RN-07 | e2e | ✅ Killed (2) |
| M10 | `src/infrastructure/observability/prometheus-appointment-metrics.ts:25` | `booked()` increments the conflicts counter | unit | ✅ Killed (1) |
| M11 | `src/usecases/book-appointment/book-appointment.use-case.ts:81` | Booking ignores the rule in force: `context.earliest` → `now + 60 min` hardcoded | unit | ❌ **Survived** (577/577 pass) → Fix 1 |
| M12 | `src/infrastructure/database/repositories/typeorm-barber-block.repository.ts:18` | Tenant filter removed from blocks `listBusyPeriods` | e2e | ✅ Killed (2) |
| M13 | `src/domain/value-objects/barber-day-schedule.ts:71-72` | Swap block and overlap checks (AVL-25 order) | unit | ✅ Killed (2) |
| M14 | `src/usecases/book-appointment/book-appointment.use-case.ts:114-116` | RN-07 path no longer counts the conflict metric | unit | ✅ Killed (1) |
| M15 | `src/usecases/shared/booking-context.ts:116` | `performsAll` uses `some` instead of `every` | unit | ✅ Killed (3) |
| M16 | `src/usecases/shared/booking-context.ts:196` | Duration = max instead of sum (RN-04) | unit | ✅ Killed (8) |
| M17 | `src/usecases/shared/booking-context.ts:153` | Busy periods not filtered by barber (other barber's appointments block this one) | unit | ✅ Killed (1) |

Line numbers are the positions inside each source file.

**Sensor depth**: P0-full (17 manual behavior-level mutations; no JS mutation tool installed)
**Round-1 outcome**: 16/17 killed. ❌ FAIL (M11 survived). Round 2 re-injected M11 and it is now killed (see below).

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ |
| Surgical changes (only `app.module.ts` +1 import and `booking-rules.module.ts` +1 export outside the new files) | ✅ |
| No scope creep (no HTTP routes, no client, no block CRUD, per Out of Scope) | ✅ |
| Matches patterns (ports in `usecases/ports`, TypeORM entities mapped, DI in `infrastructure/modules`, one class per file, kebab-case) | ✅ |
| Layer boundaries (`eslint-plugin-boundaries` passes; `domain/` is pure TS) | ✅ |
| No `any`, no `console.log`, no `eslint-disable` in the diff | ✅ |
| Comments explain *why* and cite CA/RN | ✅ |
| Exclusion constraint `EXCLUDE USING gist (barber_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&) WHERE status = 'confirmed'` (`1790607839456-AddAppointments.ts:10`) | ✅ |
| Metrics labels low-cardinality (`origin` only) on `METRICS_REGISTRY` | ✅ |
| Spec-anchored outcome check | ❌ AVL-17 booking half has no evidence |
| Per-layer coverage (domain 1:1; e2e covers constraint, repos, module) | ✅ |
| Every test maps to an AC, edge case or Done-when | ✅ |
| Documented guidelines followed: `CLAUDE.md` | ✅ |

Observation (not a gap, not in the spec): an unknown `barbershopId` raises `InvalidCredentialsError` (`src/usecases/shared/booking-context.ts:62-64`). This is reasonable because the tenant comes from the session (US-10) or the WhatsApp number (US-17), but no test covers it.

---

## Gate Check

- **Gate command**: `npm run lint:check && npm run build && npm test && npm run test:e2e` (Build gate from tasks.md, run in check mode)
- **Round-1 outcome**: exit 0. Unit: 59 suites, 577 passed, 0 failed. E2e: 29 suites, 369 passed, 0 failed.
- **Test count before feature**: 481 unit (reported at `cf2394d`); 346 e2e (derived: 369 minus the 23 new e2e tests in the 4 new e2e files)
- **Test count after feature**: 577 unit / 369 e2e
- **Delta**: +96 unit, +23 e2e. No test was deleted.
- **Skipped tests**: none
- **Failures**: none

---

## Fix Plans

### Fix 1: Booking does not prove it reads the minimum advance in force (AVL-17, mutant M11)

- **Root cause**: AVL-17 says the query **and the booking** that follow a rule change use the new value. `LS:297-306` covers only the query. Every `BA` test runs with the fixture's 60 min, so a booking that hardcodes 60 min (M11) passes the whole suite. The code is correct today because it reads `context.earliest` from the shared `loadBookingContext`. The gap is in the tests.
- **Fix task**:
  - What: in `src/usecases/book-appointment/book-appointment.use-case.spec.ts`, add `it('CA-07.3: a changed minimum advance applies to the next booking (AVL-17)')`. With now = `at('10:05')`, call `bookingRules.save('barbershop-a', rulesWithMinimumAdvance(120))`. Then a bot booking at `at('11:30')` (inside 120, outside 60) must be refused with `MinimumAdvanceNotMetError`, message `'Escolha um horário com pelo menos 120 minutos de antecedência.'`, rule `'RN-02'`, and nothing stored. Optionally also lower the rule to 30 and check that a bot booking at `at('10:45')` is accepted.
  - Where: `src/usecases/book-appointment/book-appointment.use-case.spec.ts` (import `rulesWithMinimumAdvance`).
  - Verify: `npm test`; re-inject M11 in a scratch worktree and confirm the new test fails.
  - Done when: the test passes on HEAD and kills M11.
- **Priority**: Major (behavior is correct, but an RN-02 regression on the bot path would go unnoticed)

### Note: spec-precision gaps (no code fix needed; confirm or record in spec)

- AVL-35: the spec says only "erro de valor inválido". The author chose `'Escolha pelo menos um serviço.'` and `'Escolha cada serviço uma única vez.'` (`src/usecases/shared/booking-context.ts:25-26`).
- Edge case "start with seconds": the spec says only "erro de valor inválido". The author chose `'Horário inválido.'` (`src/usecases/book-appointment/book-appointment.use-case.ts:69`).
- Suggestion: record these three strings in the spec Assumptions table so the tests are anchored to the spec.

---

## Requirement Traceability Update

spec.md is left unchanged until the fix lands and re-verification passes.

| Requirement | Previous Status | New Status (after this run) |
| ----------- | --------------- | --------------------------- |
| AVL-01..AVL-16 | Implementing | ✅ Verified (pending overall PASS) |
| AVL-17 | Implementing | ❌ Needs Fix (booking half, Fix 1) |
| AVL-18..AVL-34 | Implementing | ✅ Verified (pending overall PASS) |
| AVL-35 | Implementing | ✅ Verified ⚠️ spec-precision gap on messages |
| AVL-36..AVL-39 | Implementing | ✅ Verified (pending overall PASS) |

---

## Summary (round 1)

**Overall (round 1)**: ❌ Not Ready (one small test gap). Superseded by round 2: ✅ Ready.

**Spec-anchored check**: 38/39 ACs matched the spec outcome; 1 gap (AVL-17 booking); 2 spec-precision gaps flagged (AVL-35 messages, seconds-in-start message)
**Sensor**: 16/17 mutations killed (M11 survived)
**Gate**: 577 unit + 369 e2e passed, 0 failed; lint and build clean

**What works**: 30-minute grid restarting at each free period; half-open intervals; opening × working-hours intersection in the barbershop's timezone; any barber with a name-order tie-break; bot-only minimum advance; rule order on booking; tenant-scoped reads; exclusion constraint with RN-07 translation and a real concurrency test (barrier, no sleep); composite FKs; metrics by origin.

**Issues found**: AVL-17 on the booking path is untested (Fix 1).

**Next steps**: implement Fix 1, then re-run the Verifier (iteration 1 of 3).

---

## Re-verification (round 2)

## Validation: US-07 (round 2) - PASS ✅

**Date**: 2026-09-28
**Diff range**: `0088c3a..cf41317` (fix F1, `test(US-07): cover the minimum advance in force on booking`)
**Verifier**: independent sub-agent (author ≠ verifier), fix→re-verify iteration 1 of 3

### Fix check

`BA` = `src/usecases/book-appointment/book-appointment.use-case.spec.ts`, `LS` = `src/usecases/list-available-slots/list-available-slots.use-case.spec.ts`.

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| AVL-17 (booking half): a changed advance applies to the next booking | Booking reads the new value: RN-02 error with the new minutes, nothing stored; a start allowed by the new value is accepted | `BA:193` `bookingRules.save('barbershop-a', rulesWithMinimumAdvance(120))`, then `BA:194-199` `expectRefusal(execute({origin:'bot', startsAt: at('11:30')}), MinimumAdvanceNotMetError, 'Escolha um horário com pelo menos 120 minutos de antecedência.', 'RN-02')` with now 10:05 (11:30 is inside 120 min, outside 60 min); `BA:200` `expect(await stored(appointments)).toEqual([SEEDED])`; `BA:202` rule lowered to 30, `BA:206` `expect(appointment.startsAt).toEqual(at('10:45'))` (inside 60 min, outside 30 min) | ✅ PASS |
| AVL-17 (query half) | unchanged from round 1 | `LS:304-305` | ✅ PASS |
| Edge case "barbearia sem regras usa `BookingRules.defaults()`" on booking | Default 60 min applies to the bot | `BA:211` `store.bookingRules.delete('barbershop-a')`; `BA:213-218` `expectRefusal(execute({origin:'bot', startsAt: at('11:00')}), MinimumAdvanceNotMetError, 'Escolha um horário com pelo menos 60 minutos de antecedência.', 'RN-02')` with now 10:05; `BA:219` `toEqual([SEEDED])`. Query side stays at `LS:308` | ✅ PASS |
| AVL-35 messages (was ⚠️) | spec Assumptions row "Mensagens de valor inválido" (`.specs/features/us-07-motor-de-disponibilidade/spec.md:49`): "Escolha pelo menos um serviço." / "Escolha cada serviço uma única vez." | `BA:480` and `BA:486` `rejects.toThrow('Escolha pelo menos um serviço.')` / `('Escolha cada serviço uma única vez.')` + `InvalidValueError`; `LS:381`, `LS:385` same strings | ✅ PASS (spec-precision gap closed) |
| Start with seconds or milliseconds (was ⚠️) | same row, `spec.md:49`: "Horário inválido.", `InvalidValueError`, no RN | `BA:415-427` `expectRefusal(…, InvalidValueError, 'Horário inválido.', undefined)` + `BA:427` `toEqual([SEEDED])` | ✅ PASS (spec-precision gap closed) |

The three strings in the spec match the source (`src/usecases/shared/booking-context.ts:25-26`, `src/usecases/book-appointment/book-appointment.use-case.ts:69`) and the test assertions character for character.

**Status**: ✅ 39/39 ACs matched the spec outcome. 0 gaps, 0 open spec-precision gaps.

F1 is marked ✅ Done in `tasks.md`, and its Done-when boxes are all checked. The only other change in `cf41317` to the spec's Assumptions table is removing a stray empty cell (`|| y |` → `| y |`) from 11 rows. That change fixes the table's shape and does not change any content.

### Discrimination sensor (round 2)

Isolated scratch: `git worktree add <scratchpad>/verifier-wt2 HEAD` (cf41317), with `node_modules` symlinked and `.env` copied. The real tree's `git status --porcelain` before (`M .specs/LESSONS.md`, `M .specs/lessons.json`, `?? …/validation.md`) was identical after `git worktree remove --force`. `git worktree list` shows only the main tree. No stash was used. The unmutated baseline in the scratch was 25 suites and 186 tests passing under `src/usecases`.

| # | File:line | Description | Suite | Killed? |
| - | --------- | ----------- | ----- | ------- |
| M11 (re-run) | `src/usecases/book-appointment/book-appointment.use-case.ts:81` | `input.startsAt < context.earliest` → `input.startsAt < now + 60 min` (hardcoded) | unit | ✅ Killed (1 failed: `BA:190` AVL-17 booking test) |
| M18 | `src/usecases/shared/booking-context.ts:72-76` | Defaults fallback dropped: a barbershop without saved rules gets a 0-minute advance instead of `BookingRules.defaults()` | unit | ✅ Killed (2 failed: `BA:209` and `LS:308`) |
| M19 | `src/usecases/book-appointment/book-appointment.use-case.ts:54-56` | Rules read once, not per call: the booking use case memoizes `bookingRules.findByBarbershopId` per barbershop (the mutant type-checks) | unit | ✅ Killed (1 failed: `BA:190`, second half, 10:45 refused with the stale 120 min) |

**Sensor depth**: P0 (a targeted re-run on top of round 1's 17 mutations)
**Round-2 sensor**: 3/3 killed. Cumulative 19/20 over both rounds; the only survivor, M11 in round 1, is now killed.

### Gate check (round 2)

- **Gate command**: `npm run lint:check && npm run build && npm test && npm run test:e2e` (Postgres from compose healthy)
- **Result**: PASS, exit 0. Lint clean, build clean. Unit: 59 suites, 579 passed, 0 failed. E2e: 29 suites, 369 passed, 0 failed.
- **Delta vs round 1**: +2 unit (the two F1 tests), e2e unchanged. No test was deleted or weakened.
- **Skipped tests**: none

### Requirement traceability (round 2)

`spec.md` is updated: AVL-01..AVL-39 are all `Verified`, and the Coverage line now shows 39/39 verified.

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| AVL-01..AVL-16 | Implementing | ✅ Verified |
| AVL-17 | Implementing (❌ Needs Fix in round 1) | ✅ Verified |
| AVL-18..AVL-39 | Implementing | ✅ Verified |

### Summary (round 2)

**Overall**: ✅ Ready
**Spec-anchored check**: 39/39 ACs matched the spec outcome; the 2 round-1 spec-precision gaps are closed by `spec.md:49`
**Sensor**: 3/3 killed this round (M11, M18, M19)
**Gate**: 579 unit + 369 e2e passed, 0 failed; lint and build clean
**Issues found**: none
**Next steps**: open the US-07 PR.
