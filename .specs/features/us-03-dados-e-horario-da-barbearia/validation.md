# US-03 Dados e horário da barbearia Validation

## Validation verdict: PASS ✅ (round 2, after fix round 1)

**Date**: 2026-09-27
**Round**: 2 (round 1 verdict was FAIL with 3 surviving mutants; fix commit `c0767c9` adds tests only)
**Spec**: `.specs/features/us-03-dados-e-horario-da-barbearia/spec.md`
**Diff range**: `e616dcd..c0767c9` (12 feature commits `73a017e..be23fe9` plus fix commit `c0767c9`; spec ACs unchanged in range, only the traceability status column moved to Implemented). Fix diff `be23fe9..c0767c9` touches only `src/interface-adapters/controllers/schemas/barbershop-settings.schema.spec.ts` and `test/database/opening-hours-schema.e2e-spec.ts`; no production code changed.
**Verifier**: independent sub-agent (author ≠ verifier)

Round 2: all 18 ACs have spec-anchored evidence, every gate is green, and the 3 mutants that survived round 1 (M15, M18, M19) are now killed by the tests added in `c0767c9`. The remaining 16 mutants target code that the fix did not touch, so their round 1 kills still hold.

Round 1 history: FAIL. The sensor left M15 and M18 (strict break boundaries of the CFG-11 database `CHECK`) and M19 (a break with no `startsAt`, CFG-10) alive. Fix 1 to Fix 3 below were routed and applied in `c0767c9`.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 TimeOfDay | ✅ Done | `73a017e` |
| T2 Weekday + BarbershopTimezone | ✅ Done | `8591dc0` |
| T3 DayOpeningHours + error | ✅ Done | `40d55c9` |
| T4 WeeklyOpeningHours | ✅ Done | `6fed197` |
| T5 Migration + ORM entities | ✅ Done | `dd3f413`; `IS NOT NULL` guards confirmed in migration and live DB (`\d barbershop_opening_hours`) |
| T6 Barbershop address/hours/timezone | ✅ Done | `623d038` |
| T7 saveSettings | ✅ Done | `5fe5650` |
| T8 GetBarbershopSettings | ✅ Done | `5eff1f5` |
| T9 UpdateBarbershopSettings | ✅ Done | `7d1d291` |
| T10 Zod schema | ✅ Done | `07dbd25`; "break without start" test added in `c0767c9` (M19 now killed) |
| T11 GET route | ✅ Done | `74531f6` |
| T12 PUT route | ✅ Done | `be23fe9` |

No unchecked boxes in tasks.md; no `SPEC_DEVIATION` markers in `src/` or `test/`.

---

## Spec-Anchored Acceptance Criteria

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| CFG-01 PUT saves, 200 with saved state in GET format | 200 + body = saved state = GET body | `test/barbershop-settings.e2e-spec.ts:121-123` - `expect(response.status).toBe(200)`; `expect(response.body).toEqual(SETTINGS)`; `expect(await currentSettings()).toEqual(SETTINGS)` | ✅ PASS |
| CFG-02 GET returns name, address, timezone, 7 days | exact object | `test/barbershop-settings.e2e-spec.ts:85-91` - `toEqual({ name, address: null, timezone: 'America/Sao_Paulo', openingHours: ALL_CLOSED })`; `:123` after a save | ✅ PASS |
| CFG-03 day sent as `null` saved/returned as `null` | `null` in response | `test/barbershop-settings.e2e-spec.ts:122` - `SETTINGS` has wednesday..sunday `null`, `toEqual(SETTINGS)`; repo `test/database/typeorm-barbershop.repository.e2e-spec.ts:310` - `describeWeek(found)).toEqual(MONDAY_AND_SATURDAY)` | ✅ PASS |
| CFG-04 break saved/returned; no break → `break: null` | break object; `break: null` | `test/barbershop-settings.e2e-spec.ts:122` (monday break 12:00-13:00); `:143-144` - `toEqual(expected)` with `friday.break: null`; `src/interface-adapters/controllers/schemas/barbershop-settings.schema.spec.ts:185` | ✅ PASS |
| CFG-05 open day re-sent as `null` becomes closed | GET returns `null` | `test/barbershop-settings.e2e-spec.ts:165-168` - `toEqual({ ...SETTINGS, openingHours: { ...SETTINGS.openingHours, monday: null } })`; `test/database/typeorm-barbershop.repository.e2e-spec.ts:337` - `forDay('monday')).toBeNull()` | ✅ PASS |
| CFG-06 never saved → address `null`, 7 days `null` | exact | `test/barbershop-settings.e2e-spec.ts:86-91`; `src/domain/entities/barbershop.spec.ts:84-88` | ✅ PASS |
| CFG-07 open periods in UTC: 0 / 1 / 2 periods | `[]`; `[12:00Z,22:00Z)`; `12:00Z-15:00Z`,`16:00Z-22:00Z` | `src/domain/entities/barbershop.spec.ts:96-99`, `:103-105`, `:109` - `toEqual([...ISO pairs])` / `toEqual([])` | ✅ PASS |
| CFG-08 closing ≤ opening → 400 exact message, nothing changes | 400 `{ message: 'Segunda-feira: o horário de fechamento deve ser depois do de abertura.' }` | `test/barbershop-settings.e2e-spec.ts:205-210` - status 400, exact body, `currentSettings()).toEqual(SETTINGS)`; equality case `src/domain/value-objects/day-opening-hours.spec.ts:35-38`; `src/usecases/update-barbershop-settings/update-barbershop-settings.use-case.spec.ts:338-342` | ✅ PASS |
| CFG-09 break not strictly inside → 400 exact message, nothing changes | 400 `{ message: 'Terça-feira: o intervalo deve ...' }` | `test/barbershop-settings.e2e-spec.ts:226-231`; all six strictness variants `src/domain/value-objects/day-opening-hours.spec.ts:72-83` - `toThrow(new InvalidOpeningHoursError(BREAK_MESSAGE))` | ✅ PASS |
| CFG-10 malformed payload → 400 with invalid field list, nothing changes | 400 `{ message, errors[{field,message}] }` for: missing day, bad HH:mm, name 2-100, address 5-200, break without start **or** without end | `test/barbershop-settings.e2e-spec.ts:249-270` (address, opensAt, missing sunday, exact errors, unchanged); `src/interface-adapters/controllers/schemas/barbershop-settings.schema.spec.ts:50,66,84,110,119,128,137,149`; break without `startsAt`: `src/interface-adapters/controllers/schemas/barbershop-settings.schema.spec.ts:92-107` - `expect(issuesOf(body)).toEqual([{ field: 'openingHours.monday.break.startsAt', message: 'Informe o horário no formato HH:mm, entre 00:00 e 23:59.' }])` (M19 killed) | ✅ PASS |
| CFG-11 DB `CHECK` rejects closing ≤ opening or break outside hours | `23514` CHECK violation | `test/database/opening-hours-schema.e2e-spec.ts:108-112` - `rejects.toMatchObject({ driverError: { code: '23514' } })`, `countDays()).toBe(0)` for 8 cases incl. one-sided break; strict boundaries pinned at `test/database/opening-hours-schema.e2e-spec.ts:87-94` (break 09:00-10:00 on a 09:00-19:00 day) and `:96-103` (break 18:00-19:00), both asserted by `:127-130` - `rejects.toMatchObject({ driverError: { code: '23514' } })`, `countDays()).toBe(0)` (M15, M18 killed) | ✅ PASS |
| CFG-12 default `America/Sao_Paulo` | `'America/Sao_Paulo'` | `test/barbershop-settings.e2e-spec.ts:89`; `src/domain/entities/barbershop.spec.ts:76` | ✅ PASS |
| CFG-13 other BR timezone returned on GET settings and GET /me | `'America/Manaus'` in both | `test/barbershop-settings.e2e-spec.ts:281-291` - `toEqual({...SETTINGS, timezone: 'America/Manaus'})`; `me.body.barbershop.timezone).toBe('America/Manaus')` | ✅ PASS |
| CFG-14 new timezone, same local hours | monday 09:00 → `13:00Z` in Manaus | `src/domain/entities/barbershop.spec.ts:122-125` - `['2026-10-05T13:00:00.000Z', ...]`; `src/domain/value-objects/barbershop-timezone.spec.ts:43-54` | ✅ PASS |
| CFG-15 non-BR timezone → 400 "Escolha um fuso horário do Brasil." on `timezone`, nothing changes | exact | `test/barbershop-settings.e2e-spec.ts:302-312` - `errors: [{ field: 'timezone', message: 'Escolha um fuso horário do Brasil.' }]`, unchanged | ✅ PASS |
| CFG-16 Barber → 403 `{ message: 'Acesso negado.' }` on GET and PUT, nothing changes | exact | `test/barbershop-settings.e2e-spec.ts:105-106` (GET); `:363-370` (PUT + state unchanged) | ✅ PASS |
| CFG-17 no session → 401 | 401 | `test/barbershop-settings.e2e-spec.ts:112-113` (GET), `:376-377` (PUT) - `toBe(401)`, body `UNAUTHORIZED` | ✅ PASS |
| CFG-18 only session tenant; ignore `barbershopId` in body/query/header | A changed, B identical | `test/barbershop-settings.e2e-spec.ts:328-349` - body, `?barbershopId=`, `x-barbershop-id` all carry B; A `toEqual({...SETTINGS, name: 'Barbearia A Nova'})`, B `toEqual(settingsBBefore)`; `test/database/typeorm-barbershop.repository.e2e-spec.ts:362-367` | ✅ PASS |

**Status**: ✅ 18/18 covered (round 1: CFG-10 and CFG-11 each had one uncovered sub-condition, fixed in `c0767c9`). No spec-precision gaps: every AC defines a precise outcome and the covered assertions target it exactly.

Payload/conjunction rule: persisted state is asserted field-by-field on value everywhere (whole-object `toEqual` on HTTP bodies, `describeWeek`/`describeSettings` snapshots in repo and use case tests); the use case "nothing saved" test is discriminating (see below).

Test naming (CLAUDE.md): every new test cites `CA-03.x` or `RN-26` in its own name or its enclosing `describe` (e.g. `describe('CA-03.2: incoherent opening hours')` at `test/barbershop-settings.e2e-spec.ts:190`). The 403/401 tests cite `CA-03.1` although CFG-16/17 trace to PRD §5 and have no CA; acceptable.

### Author disclosures, verified

- `dd3f413` break CHECK: `IS NOT NULL` guards present in the entity (`src/infrastructure/database/entities/barbershop-opening-hours.entity.ts:12`), the migration (`src/infrastructure/database/migrations/1790546186111-AddBarbershopSettings.ts:8`) and the live DB. Removing them (M16) is killed by `test/database/opening-hours-schema.e2e-spec.ts:113-120`.
- Recording subclass in `src/usecases/update-barbershop-settings/update-barbershop-settings.use-case.spec.ts:52-59`: discriminating. It records a value snapshot on every `saveSettings` call (`saved).toEqual([])` at `:151`), and `:152-153` compares a value snapshot (`before`, taken before the call) with the stored entity, so an in-place mutation of the by-reference instance would also fail. M14 (drop `saveSettings`) is killed by the same file.

---

## Discrimination Sensor

Isolated scratch: `git worktree add --detach <scratchpad>/wt HEAD` (node_modules symlinked, `.env` copied), each mutant reverted with `git checkout` in the worktree. DB-level mutants (M15-M18) edited the migration in the worktree and applied it via `migration:revert` + `migration:run`, then restored the original migration the same way; the live constraints were checked afterwards and match the committed migration. `git stash` never used.

| # | File:line | Description | Tests run | Killed? |
| - | --------- | ----------- | --------- | ------- |
| M1 | `src/domain/value-objects/day-opening-hours.ts:39` | `closes <= opens` → `<` (accept closing = opening) | day-opening-hours.spec | ✅ Killed |
| M2 | `src/domain/value-objects/day-opening-hours.ts:69` | `opens < break.start` → `<=` | day-opening-hours.spec | ✅ Killed |
| M3 | `src/domain/value-objects/day-opening-hours.ts:71` | `break.end < closes` → `<=` | day-opening-hours.spec | ✅ Killed |
| M4 | `src/domain/value-objects/barbershop-timezone.ts:48` | `toUtc` offset sign `-` → `+` | src/domain | ✅ Killed (8 failed) |
| M5 | `src/domain/entities/barbershop.ts:113` | `openIntervalsOn` end uses `period.start` | src/domain | ✅ Killed |
| M6 | `src/domain/value-objects/day-opening-hours.ts:58` | 2nd period starts at break start instead of break end | src/domain | ✅ Killed |
| M7 | `src/infrastructure/database/repositories/typeorm-barbershop.repository.ts:91` | drop DELETE of old day rows | repo e2e | ✅ Killed |
| M8 | `typeorm-barbershop.repository.ts:91` | DELETE without tenant filter (all barbershops) | repo e2e | ✅ Killed |
| M9 | `typeorm-barbershop.repository.ts:84` | UPDATE by `subscriptionStatus` instead of `id` (cross-tenant) | repo e2e | ✅ Killed |
| M10 | `src/interface-adapters/controllers/schemas/barbershop-settings.schema.ts:42` | drop address `.trim()` | schema spec | ✅ Killed |
| M11 | `barbershop-settings.schema.ts:47` | timezone refine accepts any non-empty string | schema spec | ✅ Killed |
| M12 | `src/infrastructure/http/domain-error.filter.ts:23` | `InvalidOpeningHoursError` → 422 | filter spec | ✅ Killed |
| M13 | `typeorm-barbershop.repository.ts:70` | `findById` drops address (`address: null`) | repo e2e | ✅ Killed (4 failed) |
| M14 | `src/usecases/update-barbershop-settings/update-barbershop-settings.use-case.ts:45` | drop `saveSettings` call | src/usecases | ✅ Killed |
| M15 | `src/infrastructure/database/migrations/1790546186111-AddBarbershopSettings.ts:8` | CHECK `opens_at < break_starts_at` → `<=` | opening-hours-schema e2e | Round 1: ❌ Survived (9/9 pass). Round 2: ✅ Killed (1 of 11 failed) |
| M16 | `1790546186111-AddBarbershopSettings.ts:8` | remove `IS NOT NULL` guards (disclosed original bug) | opening-hours-schema e2e | ✅ Killed (2 failed) |
| M17 | `1790546186111-AddBarbershopSettings.ts:8` | CHECK `closes_at > opens_at` → `>=` | opening-hours-schema e2e | ✅ Killed |
| M18 | `1790546186111-AddBarbershopSettings.ts:8` | CHECK `break_ends_at < closes_at` → `<=` | opening-hours-schema e2e | Round 1: ❌ Survived (9/9 pass). Round 2: ✅ Killed (1 of 11 failed) |
| M19 | `barbershop-settings.schema.ts:19` | break `startsAt` optional | schema spec + settings e2e | Round 1: ❌ Survived (17/17 unit, 16/16 e2e pass). Round 2: ✅ Killed (1 of 18 failed) |

**Sensor depth**: expanded (≥5; 19 manual mutants: time/timezone math, DB CHECK, tenant isolation)
**Result**: 19/19 killed (round 2) - PASS ✅

Round 2 re-injected M15, M18 and M19 in a fresh `git worktree` of `c0767c9` (M15/M18 via migration revert + run from the worktree, then the committed constraints restored; live `\d barbershop_opening_hours` matches the migration afterwards). M1-M14, M16 and M17 were not re-run, because the fix commit changed no production code and removed no assertion.

Isolation: round 1 real-tree porcelain before = after = `?? .claude/skills/tlc-spec-lean/`. In round 2, before = after = ` M .specs/LESSONS.md`, ` M .specs/lessons.json`, `?? .claude/skills/tlc-spec-lean/`, `?? .specs/features/us-03-dados-e-horario-da-barbearia/validation.md`. The worktree was removed and pruned in both rounds.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ |
| Surgical changes | ✅ (only `account.module.ts` export and `app.module.ts` import outside new files) |
| No scope creep | ✅ (no holidays, no slot logic, no new metrics/logs, matching Out of Scope) |
| Matches patterns | ✅ (one class per file, ports in usecases, Zod at the edge, domain errors mapped in the filter, migration with `synchronize: false`) |
| Spec-anchored outcome check (asserted values match spec) | ✅ for all covered branches |
| Per-layer Coverage Expectation met (domain 1:1 ACs; routes happy+edge+error) | ✅ (DB CHECK boundaries and the break-without-start branch added in round 2) |
| Every test maps to a spec requirement - no unclaimed tests | ✅ (weekday 0/8 CHECK tests map to design/T5 Done-when) |
| Documented guidelines followed: `CLAUDE.md` | ✅ |

Clean Architecture: `src/domain` imports nothing outside domain; `usecases` only domain + ports; lint `boundaries/dependencies` passes.

---

## Edge Cases

- [x] Extra body fields ignored: `src/interface-adapters/controllers/schemas/barbershop-settings.schema.spec.ts:165-177` (`barbershopId` dropped); e2e `test/barbershop-settings.e2e-spec.ts:335-342`
- [x] Name/address trimmed: `test/barbershop-settings.e2e-spec.ts:171-187` (exact trimmed values in PUT response and GET)
- [x] All 7 days `null` accepted: `test/barbershop-settings.e2e-spec.ts:176-187`
- [x] `00:00`-`23:59` accepted: `src/domain/value-objects/day-opening-hours.spec.ts:63-68`; `src/interface-adapters/controllers/schemas/barbershop-settings.schema.spec.ts:192-203` (domain + schema; no HTTP-level test, acceptable)
- [x] Same PUT twice → 200 both, same state: `test/barbershop-settings.e2e-spec.ts:147-155`

---

## Gate Check

- **Gate command**: `npm run lint:check && npm run build && npm test && npm run test:e2e` (tasks.md Build gate, with `lint:check` so the real tree is not modified)
- Round 2 (`c0767c9`): lint:check exit 0; build exit 0; unit 31 suites, 179 passed, 0 failed, 0 skipped; e2e 15 suites, 140 passed, 0 failed, 0 skipped
- Round 1 (`be23fe9`): lint:check exit 0; build exit 0; unit 178 passed; e2e 138 passed
- **Test count before feature** (`e616dcd`, measured in a scratch worktree): 100 unit / 107 e2e
- **Test count after feature**: 179 unit / 140 e2e
- **Delta**: +79 unit, +33 e2e; no test deleted or weakened (only additions to the pre-existing `domain-error.filter.spec.ts` and repository e2e)

---

## Fix Plans (round 1, all applied in `c0767c9`)

### Fix 1: DB CHECK does not pin `opens_at < break_starts_at` (M15)

- **Root cause**: `test/database/opening-hours-schema.e2e-spec.ts:74-114` only tries breaks clearly outside the hours or inverted; none starts exactly at opening.
- **Fix task**: add case `['a break starting at opening', { opensAt: '09:00', closesAt: '19:00', breakStartsAt: '09:00', breakEndsAt: '10:00' }]` to the `it.each` (expects `23514`, `countDays() === 0`).
- **Priority**: Minor (domain already rejects it; DB defense in depth is untested)

### Fix 2: DB CHECK does not pin `break_ends_at < closes_at` (M18)

- **Root cause**: same table; no break ending exactly at closing.
- **Fix task**: add `['a break ending at closing', { opensAt: '09:00', closesAt: '19:00', breakStartsAt: '18:00', breakEndsAt: '19:00' }]`.
- **Priority**: Minor

### Fix 3: CFG-10 "intervalo sem início" untested (M19)

- **Root cause**: `src/interface-adapters/controllers/schemas/barbershop-settings.schema.spec.ts:75-90` tests only a break without `endsAt`.
- **Fix task**: add `it('CA-03.2: rejects a break without its start')` with `break: { endsAt: '13:00' }` expecting `[{ field: 'openingHours.monday.break.startsAt', message: 'Informe o horário no formato HH:mm, entre 00:00 e 23:59.' }]`.
- **Priority**: Major (under the mutant the HTTP answer becomes 500 `Erro interno.` instead of the 400 field list the spec requires)

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| CFG-01..CFG-09 | Implemented | ✅ Verified |
| CFG-10 | Implemented | ✅ Verified (round 2, after Fix 3) |
| CFG-11 | Implemented | ✅ Verified (round 2, after Fix 1 and Fix 2) |
| CFG-12..CFG-18 | Implemented | ✅ Verified |

(spec.md not edited by the Verifier; the orchestrator updates the status column.)

---

## Summary

**Overall**: ✅ Ready (round 2)

**Spec-anchored check**: 18/18 ACs matched the spec outcome; 0 spec-precision gaps
**Sensor**: 19/19 mutations killed (M15, M18, M19 re-verified in round 2)
**Gate**: lint, build, 179 unit and 140 e2e all green

**What works**: domain rules and messages, UTC periods and the timezone switch, atomic tenant-scoped save, DB `CHECK` including strict break boundaries, the 400/403/401 mapping, trim, idempotent PUT, `/me` timezone.

**Issues found**: none remaining. Round 1 gaps Fix 1-3 closed by test-only commit `c0767c9`.

**Next steps**: the orchestrator updates the spec.md traceability status to Verified. Lessons L-002 and L-003 (grounded in round 1) stay recorded.
