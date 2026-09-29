# US-12: Perfil e histórico do cliente verification

**Verdict**: PASS
**Profile**: light
**Diff range**: c88b7c4..7f382b6684c692223ba625a91d2aaa035260d6ef
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

All 27 checks were proven at HEAD `7f382b6` with located evidence. Each named test showed up individually as `passed` in the Jest `--json` output (see Proof runs). The full gate passed.

## Proof runs

Both batches ran at HEAD `7f382b6`. The `--json` output listed every named test with status `passed`, so none was matched by an empty filter.

- e2e: `npx jest --config ./test/jest-e2e.json test/clients.e2e-spec.ts test/database/clients-schema.e2e-spec.ts test/attendance.e2e-spec.ts -t "\(C[0-9]+\)|CA-11.1: marks a started appointment as attended" --json`, exit 0. 29 passed, 0 failed, 27 skipped (tests outside the filter). All 27 `(Cn)` tests plus the C19 attendance test ran.
- unit: `npx jest src/interface-adapters/controllers/schemas/client-search.query.schema.spec.ts src/usecases/get-client-profile/get-client-profile.use-case.spec.ts src/usecases/search-clients/search-clients.use-case.spec.ts -t "\(C[0-9]+\)" --json`, exit 0. 15 passed, 0 failed. This covers C6 ×7, C16 ×3, C10, C11, C12 and C20 ×2.

## Binding sources

Did not run. Step 1 runs only under profile `ui`, and this feature was approved under `light`. The plan's binding sources (docs/PRD.md US-12 CA-12.1 to CA-12.3, RF-30, section 5, and US-25 CA-25.1) were not compared against the checks in this round.

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| docs/PRD.md US-12, RF-30, section 5, US-25 CA-25.1 | no - step 1 does not run under `light` | - | - |

## Checks

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | `q=joão` finds only João, `q=JOÃO` finds the same | e2e batch, exit 0, `(C1)` passed | `test/clients.e2e-spec.ts:293` - `expect(await found({ q: 'joão' })).toEqual([{ id: joao, name: 'João Silva', phone: JOAO_PHONE }])`; `:296` - `expect(await foundIds({ q: 'JOÃO' })).toEqual([joao])` | PASS |
| C2 | `98765` and `(11) 98765` match the phone; `987` does not | e2e batch, exit 0, `(C2)` passed | `test/clients.e2e-spec.ts:302` - `expect(await foundIds({ q: '(11) 98765' })).toEqual([joao])`; `:304` - `expect(await foundIds({ q: '987' })).toEqual([])` | PASS |
| C3 | no `q` answers every client of the barbershop | e2e batch, exit 0, `(C3)` passed | `test/clients.e2e-spec.ts:308` - `expect(await foundIds({})).toEqual([joao, maria])` | PASS |
| C4 | 51 clients -> exactly 50, case-insensitive name then id, keys only `id`, `name`, `phone` | e2e batch, exit 0, both `(C4)` passed | `test/clients.e2e-spec.ts:321` - `expect(clients.map((client) => client.name)).toEqual(['ana','Bruno', ...47 'Cliente NN', 'João Silva'])` (50 names, Maria dropped); `:331` - `expect(Object.keys(client).sort()).toEqual(['id','name','phone'])`; `:341` - `expect(await foundIds({ q: 'Zeca' })).toEqual([first, last])` | PASS |
| C5 | a term with no match answers `200 { clients: [] }` | e2e batch, exit 0, `(C5)` passed | `test/clients.e2e-spec.ts:345` - `.expect(200)`; `:347` - `expect(response.body).toEqual({ clients: [] })` | PASS |
| C6 | 1, 81 and `"  a  "` are rejected with the exact message; 2 and 80 are accepted; the route answers 400 for `q=a` | unit batch (7 `(C6)` cases) and e2e batch, exit 0 | `src/interface-adapters/controllers/schemas/client-search.query.schema.spec.ts:40` - `expect(issuesOf(clientSearchQuerySchema, { q })).toEqual([{ field: 'q', message: SEARCH_MESSAGE }])` (rows `1`, `81`, `1 after trimming`); `:28` - `expect(clientSearchQuerySchema.parse({ q })).toEqual({ q: expected })` (rows `2`, `80`); `test/clients.e2e-spec.ts:351` - `.expect(400)`, `:353` - `toEqual({ message: 'Dados inválidos.', errors: [{ field: 'q', message: SEARCH_MESSAGE }] })` | PASS |
| C7 | `%%` and `__` match nothing; `50%` matches only `Promo 50%` | e2e batch, exit 0, `(C7)` passed | `test/clients.e2e-spec.ts:362` - `expect(await foundIds({ q: '%%' })).toEqual([])`; `:363` - `...'__'...toEqual([])`; `:364` - `expect(await foundIds({ q: '50%' })).toEqual([promo])` | PASS |
| C8 | the owner of B never receives A's clients, with or without `q` | e2e batch, exit 0, `(C8)` passed | `test/clients.e2e-spec.ts:370` - `expect(await foundIds({ q: 'joão' }, ownerBToken)).toEqual([joaoOfB])`; `:371` - `expect(await foundIds({}, ownerBToken)).toEqual([joaoOfB])` | PASS |
| C9 | 200 with exactly the 10 profile keys, `timezone` `America/Sao_Paulo`, appointments in the US-08 item format | e2e batch, exit 0, `(C9)` passed | `test/clients.e2e-spec.ts:391` - `expect(Object.keys(body).sort()).toEqual(PROFILE_KEYS)`; `:398` - `expect(body.pastAppointments).toEqual([{ id, barber, client, services, startsAt, endsAt, status: 'attended', origin: 'manual' }])`; `timezone: 'America/Sao_Paulo'` at `:396` | PASS |
| C10 | past = start <= now in `confirmed`/`attended`/`no_show`, most recent first, includes start == now | unit and e2e batches, exit 0, `(C10)` passed in both | `test/clients.e2e-spec.ts:435` - `expect(ids(body.pastAppointments)).toEqual([startingNow, unmarked, noShow, old])`; `src/usecases/get-client-profile/get-client-profile.use-case.spec.ts:102` - `expect(ids(result.pastAppointments)).toEqual(['starting-now','unmarked','no-show','attended-old'])` | PASS |
| C11 | upcoming = start > now only, nearest first | unit and e2e batches, exit 0, `(C11)` passed in both | `test/clients.e2e-spec.ts:454` - `expect(ids(body.upcomingAppointments)).toEqual([laterToday, nextWeek])` (the start == now row is excluded); `get-client-profile.use-case.spec.ts:119` - `toEqual(['later-today','tomorrow','next-week'])` | PASS |
| C12 | only `attended`, at most 3 `{ id, name, count }`, count desc then name: Corte 3, Barba 2, Sobrancelha 2 | unit and e2e batches, exit 0, `(C12)` passed in both | `src/usecases/get-client-profile/get-client-profile.use-case.spec.ts:143` - `expect(result.topServices).toEqual([{ id: 'haircut', name: 'Corte', count: 3 }, { id: 'beard', name: 'Barba', count: 2 }, { id: 'brows', name: 'Sobrancelha', count: 2 }])`; `test/clients.e2e-spec.ts:481` - `expect(body.topServices).toEqual([{ id: haircut, name: 'Corte', count: 2 }, { id: beard, name: 'Barba', count: 1 }])` | PASS |
| C13 | limit 2, 2 no-shows after the reset and 1 before -> `noShowCount: 2`, blocked; limit 3 -> not blocked | e2e batch, exit 0, `(C13)` passed | `test/clients.e2e-spec.ts:511` - `expect(await profileOf(joao)).toMatchObject({ noShowCount: 2, selfBookingBlocked: true })`; `:522` - `toMatchObject({ noShowCount: 2, selfBookingBlocked: false })` | PASS |
| C14 | `false` for an inserted client and for a client from `POST /appointments`; `true` after the column is set | e2e batch, exit 0, `(C14)` passed | `test/clients.e2e-spec.ts:529` - `expect((await profileOf(joao)).returnReminderEnabled).toBe(false)`; `:542` - `expect((await profileOf(pedro)).returnReminderEnabled).toBe(false)`; `:548` - `...toBe(true)` | PASS |
| C15 | a client with no appointments -> 200 with empty lists, 0 no-shows, not blocked | e2e batch, exit 0, `(C15)` passed | `test/clients.e2e-spec.ts:554` - `expect(body).toMatchObject({ pastAppointments: [], upcomingAppointments: [], topServices: [], noShowCount: 0, selfBookingBlocked: false })` (the 200 comes from the helper at `:225` `.expect(200)`) | PASS |
| C16 | `GET /clients/abc` -> 400 "Informe um id de cliente válido." | e2e batch, exit 0, `(C16)` passed | `test/clients.e2e-spec.ts:564` - `getProfile('abc', ownerToken).expect(400)`; `:566` - `expect(response.body).toEqual({ message: 'Dados inválidos.', errors: [{ field: 'id', message: CLIENT_ID_MESSAGE }] })` | PASS |
| C17 | unknown UUID and B's client -> 404 "Cliente não encontrado." | e2e batch, exit 0, `(C17)` passed | `test/clients.e2e-spec.ts:575` - `getProfile(randomUUID(), ownerToken).expect(404, CLIENT_NOT_FOUND)`; `:576` - `getProfile(joaoOfB, ownerToken).expect(404, CLIENT_NOT_FOUND)` | PASS |
| C18 | `return_reminder_enabled` NOT NULL DEFAULT false; an insert without it -> false; NULL -> 23502 | e2e batch, exit 0, `(C18)` passed | `test/database/clients-schema.e2e-spec.ts:169` - `expect(row.return_reminder_enabled).toBe(false)`; `:176` - `rejects.toMatchObject({ driverError: { code: NOT_NULL_VIOLATION, column: 'return_reminder_enabled' } })` | PASS |
| C19 | the US-11 `PATCH` response is unchanged: `client` has exactly `id`, `noShowCount`, `selfBookingBlocked` | e2e batch, exit 0, `CA-11.1: marks a started appointment as attended...` passed | `test/attendance.e2e-spec.ts:246` - `expect(body).toEqual({ appointment: {...}, client: { id: maria, noShowCount: 0, selfBookingBlocked: false } })` (line 257). The test is unchanged in the diff, as a regression proof should be: the feature refactored `MarkAttendanceUseCase` to use `clientNoShowStatus` | PASS |
| C20 | Bruno's search returns only clients with his appointments (a `no_show` counts), not Ana-only clients | unit and e2e batches, exit 0, `(C20)` passed | `test/clients.e2e-spec.ts:592` - `expect(await foundIds({}, brunoToken)).toEqual([joao])`; `:593` - `expect(await foundIds({ q: 'Maria' }, brunoToken)).toEqual([])`; `src/usecases/search-clients/search-clients.use-case.spec.ts:77` - `expect(await search({ userId: 'user-bruno', role: 'barber' })).toEqual([...])` | PASS |
| C21 | Bruno's view of João has only Bruno's appointments in past, upcoming and topServices | e2e batch, exit 0, `(C21)` passed | `test/clients.e2e-spec.ts:615` - `expect(ids(body.pastAppointments)).toEqual([brunoPast])`; `:616` - `expect(ids(body.upcomingAppointments)).toEqual([brunoNext])`; `:617` - `expect(body.topServices).toEqual([{ id: beard, name: 'Barba', count: 1 }])` | PASS |
| C22 | Bruno's `noShowCount` also counts João's no-show with Ana | e2e batch, exit 0, `(C22)` passed | `test/clients.e2e-spec.ts:633` - `expect(await profileOf(joao, brunoToken)).toMatchObject({ noShowCount: 1 })` (the only no-show is with Ana, at `:628-631`) | PASS |
| C23 | Bruno opening Maria (Ana-only) -> 404 "Cliente não encontrado." | e2e batch, exit 0, `(C23)` passed | `test/clients.e2e-spec.ts:644` - `getProfile(maria, brunoToken).expect(404, CLIENT_NOT_FOUND)` | PASS |
| C24 | Caio (no barber record) -> `200 { clients: [] }` and profile 404 | e2e batch, exit 0, `(C24)` passed | `test/clients.e2e-spec.ts:650` - `search({}, caioToken).expect(200)`; `:651` - `expect(response.body).toEqual({ clients: [] })`; `:652` - `getProfile(joao, caioToken).expect(404, CLIENT_NOT_FOUND)` | PASS |
| C25 | both routes without a token -> 401 "Sessão inválida ou expirada." | e2e batch, exit 0, `(C25)` passed | `test/clients.e2e-spec.ts:656` - `search({}).expect(401, UNAUTHORIZED)`; `:657` - `getProfile(joao).expect(401, UNAUTHORIZED)` | PASS |
| C26 | OpenAPI: `summary` cites US-12, `x-roles` owner+barber, 200 with schema, `/clients` 400/401, `/clients/{id}` 400/401/404 with the "Cliente não encontrado." example | e2e batch, exit 0, both `(C26)` rows passed | `test/clients.e2e-spec.ts:670` - `expect(operation.summary).toContain('US-12')`; `:671` - `toMatchObject({ 'x-roles': ['owner', 'barber'] })`; `:674` - `expect(operation.responses[status].description).toEqual(expect.any(String))` over the status list at `:663-664`; `:678` - `responses['200'].content toBeDefined()`; `:682` - `expect(JSON.stringify(operation.responses['404'])).toContain(CLIENT_NOT_FOUND.message)` | PASS |
| C27 | the owner finds a client with no appointments and gets a 200 profile | e2e batch, exit 0, `(C27)` passed | `test/clients.e2e-spec.ts:376` - `expect(await foundIds({ q: 'Maria' })).toEqual([maria])`; `:377` + `:225` - `profileOf(maria)` -> `getProfile(id, token).expect(200)` | PASS |

### Level and sampling judgment

- Every check that names a status code, route or response shape (C1-C9, C13-C17, C19-C27) has a proof that goes through the HTTP route with supertest. C18 goes to the database, and C26 reads the assembled OpenAPI document from the `AppModule` app. No level gaps.
- C12's cap of 3 and its name tiebreak are asserted only in the unit test (`get-client-profile.use-case.spec.ts:143`). The HTTP proof (`test/clients.e2e-spec.ts:481`) has 2 items, so it never reaches the cap or a tie. `checks.md` declares this split on purpose (the use case decides the cap and the ordering), and the response shape `{ id, name, count }` is asserted over HTTP. I recorded it as an observation, not a gap.
- C6's length bounds 2/80/81 are asserted only at the schema. Only `q=a` goes over HTTP. The check text says so explicitly, and the pipe and schema are the same object the route uses (`clients.controller.ts`, `ZodValidationPipe(clientSearchQuerySchema)`). Observation only.
- Precision: no check left its value imprecise. Every message, count, ordering and key set is asserted with `toEqual` or `toMatchObject` against literal values visible at the assertion.

### Swept `existing` re-read

- authorization - `existing - SessionGuard com @Roles('owner', 'barber') (AD-007)`: confirmed. `SessionGuard` is registered as `APP_GUARD` (`src/infrastructure/modules/account.module.ts:319`) and reads `ROLES_KEY` (`src/infrastructure/http/session.guard.ts:55-59`). Both handlers in `src/interface-adapters/controllers/clients.controller.ts` carry `@Roles('owner', 'barber')`.
- Observable "duplicates" - `existing - clients_barbershop_phone_unique`: confirmed at `src/infrastructure/database/migrations/1790624650790-AddClients.ts:8` (`CONSTRAINT "clients_barbershop_phone_unique" UNIQUE ("barbershop_id", "phone")`).

### Landing door 1 literal

The plan's literal `ALTER TABLE "clients" ADD "return_reminder_enabled" boolean NOT NULL DEFAULT false` matches `src/infrastructure/database/migrations/1790696551657-AddClientReturnReminder.ts` `up()` character for character. `down()` drops the column.

## Coverage

Under `light` I read the join rather than recompute it. While reading the code and the tests I did not find an unproven member. Every row in the `checks.md` Coverage table resolves to one of the passing assertions cited above. The `ClientsModule` startup row is proven by the e2e booting `AppModule` (`test/clients.e2e-spec.ts:234`), and `ClientsModule` is added to `src/app.module.ts` imports in the diff.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| all rows of `checks.md` Coverage (13 sets) | read, not recomputed (`light`) | as listed in `checks.md`, each resolved to a located assertion above | - |

## Faults injected

None were injected. Fault injection (verify.md step 4) runs only under `standard` and `ui`, and this feature was approved under `light`. So this round cannot tell whether an assertion would pass against a plausible wrong implementation.

| Mutation | Location | Killed |
| --- | --- | --- |
| none - profile `light` | - | - |

## Gate

All ran at HEAD `7f382b6`, and `git status --porcelain` stayed empty afterwards.

- `npm run lint:check` - exit 0, no problems
- `npm run build` - exit 0
- `npm test` - 82 suites, 889 passed, 0 failed
- `npm run test:e2e` - 40 suites, 564 passed, 0 failed
