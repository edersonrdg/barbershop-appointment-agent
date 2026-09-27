# US-03 Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/us-03-dados-e-horario-da-barbearia/design.md`
**Status**: Approved

Toda task cita US-03, RF-32 e, quando couber, RNF-04 e RN-26. Commits: `feat(US-03): ...` (ou `test`/`chore` quando couber), só locais.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `CLAUDE.md` (seção Testes: use cases com fakes em memória; gateways TypeORM e HTTP em e2e contra o Postgres do compose; nome do teste cita o `CA`), `package.json` (config Jest, sem threshold de cobertura), `test/jest-e2e.json`, AD-006 (e2e em série com truncate).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Domain value objects / entities | unit | Todos os ramos; 1:1 com os CFG da spec; limites (`00:00`, `23:59`, igualdade estrita) | `src/domain/**/*.spec.ts` | `npm test` |
| Domain error classes, tipos/constantes | none | build gate only | - | build gate only |
| Use cases | unit (fakes dos ports) | 1:1 com os ACs; nada gravado quando o domínio recusa | `src/usecases/**/*.spec.ts` | `npm test` |
| Schemas Zod da borda | unit | Cada regra de formato do CFG-10 e CFG-15 | `src/interface-adapters/**/*.spec.ts` | `npm test` |
| Repositórios TypeORM, migration | e2e (Postgres do compose) | Leitura/gravação por tenant, transação, `CHECK` | `test/database/*.e2e-spec.ts` | `npm run test:e2e` |
| Controllers / rotas HTTP | e2e | Cada rota: sucesso + edge cases + erros + 401/403 | `test/*.e2e-spec.ts` | `npm run test:e2e` |
| Entidades ORM, módulos Nest | none | build gate only | - | build gate only |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | Tasks só com testes unitários | `npm test` |
| Full | Tasks com e2e | `npm test && npm run test:e2e` |
| Build | Fim de fase e antes do Verifier | `npm run lint && npm run build && npm test && npm run test:e2e` |

---

## Execution Plan

Fases em sequência; tasks em ordem dentro da fase. As setas mostram só dependências reais dentro da fase.

### Phase 1: Value objects de domínio

```
T1 -> T3
T2 -> T3
T3 -> T4
```

### Phase 2: Entidade e persistência

```
T5 -> T6
T6 -> T7
```

### Phase 3: Use cases

```
T8
T9
```

### Phase 4: HTTP

```
T10 -> T12
T11 -> T12
```

---

## Task Breakdown

### T1: Value object TimeOfDay

**What**: `TimeOfDay` com `create`, `isValid`, `minutes` e `toString`, aceitando só `HH:mm` de `00:00` a `23:59`.
**Where**: `src/domain/value-objects/time-of-day.ts`
**Depends on**: None
**Reuses**: padrão `create`/`isValid` de `src/domain/value-objects/phone-number.ts`
**Requirement**: CFG-10

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `00:00` e `23:59` aceitos; `24:00`, `9:00`, `09:60`, `09:00:00` e texto recusados (`InvalidValueError` / `isValid` falso)
- [x] `minutes` de `09:30` é 570
- [x] Gate check passes: `npm test`
- [x] Test count: ~8 tests novos passam (no silent deletions)

**Tests**: unit
**Gate**: quick
**Status**: ✅ Done
**Commit**: `feat(US-03): add TimeOfDay value object`

---

### T2: Weekday e value object BarbershopTimezone

**What**: Tipo `Weekday` com rótulos pt-BR e número ISO; `BarbershopTimezone` com a lista dos 16 fusos do Brasil, `create`, `isValid`, `toUtc(localDate, time)` e `weekdayOf(localDate)`.
**Where**: `src/domain/value-objects/barbershop-timezone.ts` (e o tipo em `src/domain/value-objects/weekday.ts`)
**Depends on**: None
**Reuses**: `DEFAULT_TIMEZONE` de `src/domain/entities/barbershop.ts`
**Requirement**: CFG-12, CFG-14, CFG-15

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `isValid` aceita os 16 fusos e recusa `Europe/Lisbon`, `UTC` e texto qualquer
- [x] `toUtc('2026-10-05', 09:00)` = `12:00Z` em `America/Sao_Paulo`, `13:00Z` em `America/Manaus`, `11:00Z` em `America/Noronha`, `14:00Z` em `America/Rio_Branco`
- [x] `weekdayOf('2026-10-05')` = `monday`; `weekdayOf('2026-10-04')` = `sunday`
- [x] Gate check passes: `npm test`
- [x] Test count: ~10 tests novos passam (no silent deletions)

**Tests**: unit
**Gate**: quick
**Status**: ✅ Done
**Commit**: `feat(US-03): add Brazilian timezone value object`

---

### T3: DayOpeningHours e InvalidOpeningHoursError

**What**: VO do expediente de um dia com as regras do CA-03.2 e `openPeriods()`; erro de domínio `InvalidOpeningHoursError` (`rule = 'RF-32'`) com as mensagens do CFG-08 e CFG-09.
**Where**: `src/domain/value-objects/day-opening-hours.ts` (e `src/domain/errors/invalid-opening-hours.error.ts`)
**Depends on**: T1, T2
**Reuses**: `DomainError`
**Requirement**: CFG-04, CFG-07, CFG-08, CFG-09

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `CA-03.2`: fechamento igual e anterior à abertura recusados com "Segunda-feira: o horário de fechamento deve ser depois do de abertura." (dia no rótulo certo)
- [x] `CA-03.2`: intervalo que começa na abertura, termina no fechamento, sai do expediente ou tem fim ≤ início recusado com a mensagem do CFG-09
- [x] `openPeriods()` devolve 1 período sem intervalo e 2 com intervalo
- [x] Gate check passes: `npm test`
- [x] Test count: ~9 tests novos passam (no silent deletions)

**Tests**: unit
**Gate**: quick
**Status**: ✅ Done
**Commit**: `feat(US-03): add daily opening hours with CA-03.2 rules`

---

### T4: WeeklyOpeningHours

**What**: VO da semana com os 7 dias (`null` = fechado), `create`, `allClosed` e `forDay`.
**Where**: `src/domain/value-objects/weekly-opening-hours.ts`
**Depends on**: T3
**Reuses**: `Weekday`, `DayOpeningHours`
**Requirement**: CFG-03, CFG-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `allClosed()` devolve `null` nos 7 dias
- [x] `forDay` devolve o dia aberto ou `null` para o fechado
- [x] Gate check passes: `npm test`
- [x] Test count: ~4 tests novos passam (no silent deletions)

**Tests**: unit
**Gate**: quick
**Status**: ✅ Done
**Commit**: `feat(US-03): add weekly opening hours`

---

### T5: Migration e entidades ORM do horário

**What**: Migration `AddBarbershopSettings` (coluna `barbershops.address` e tabela `barbershop_opening_hours` com PK, FK e os `CHECK` do design), `BarbershopOpeningHoursEntity` e a coluna `address` no `BarbershopEntity`.
**Where**: `src/infrastructure/database/migrations/<timestamp>-AddBarbershopSettings.ts` (e as entidades ORM)
**Depends on**: None
**Reuses**: estilo de `1790543471661-AddUserInvitations.ts`; `test/database/invitation-schema.e2e-spec.ts`
**Requirement**: CFG-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `migration:run` e `migration:revert` funcionam no Postgres do compose
- [x] e2e de schema `CA-03.2`: `INSERT` direto com `closes_at <= opens_at`, com intervalo fora do expediente, com só um lado do intervalo e com `weekday = 0` falham; linha válida entra
- [x] Gate check passes: `npm test && npm run test:e2e`
- [x] Test count: ~5 tests e2e novos passam (no silent deletions)

**Tests**: e2e
**Gate**: full
**Status**: ✅ Done
**Commit**: `feat(US-03): add opening hours schema with check constraints`

---

### T6: Barbershop com endereço, horário e fuso tipado

**What**: Estender `Barbershop` (props, `startTrial` com `address: null` e semana fechada, `updateSettings`, `openIntervalsOn`) e o `findById` do `TypeOrmBarbershopRepository` para ler endereço e horário.
**Where**: `src/domain/entities/barbershop.ts` (e o mapeamento de leitura em `typeorm-barbershop.repository.ts`)
**Depends on**: T5
**Reuses**: `test/database/typeorm-barbershop.repository.e2e-spec.ts`
**Requirement**: CFG-06, CFG-07, CFG-12, CFG-14

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Unit `CA-03.1`: barbearia nova tem endereço `null` e 7 dias fechados; `openIntervalsOn` de segunda (09:00–19:00, intervalo 12:00–13:00, São Paulo) = `12:00Z–15:00Z` e `16:00Z–22:00Z`; dia fechado = `[]`; dia sem intervalo = 1 período
- [x] Unit `CA-03.3`: mesma semana depois de `updateSettings` com `America/Manaus` começa às `13:00Z`; sem troca, o fuso é `America/Sao_Paulo`
- [x] e2e: `findById` devolve endereço e dias gravados por SQL, com `HH:mm`
- [x] Testes existentes de `GET /me` e convite seguem passando
- [x] Gate check passes: `npm test && npm run test:e2e`
- [x] Test count: ~7 tests novos passam (no silent deletions)

**Tests**: e2e
**Gate**: full
**Status**: ✅ Done
**Commit**: `feat(US-03): carry address and opening hours in Barbershop`

---

### T7: BarbershopRepository.saveSettings

**What**: Método `saveSettings` no port, no `TypeOrmBarbershopRepository` (transação: `UPDATE` da barbearia, `DELETE` + `INSERT` dos dias abertos) e no `InMemoryBarbershopRepository`.
**Where**: `src/infrastructure/database/repositories/typeorm-barbershop.repository.ts` (e port + fake em memória)
**Depends on**: T6
**Reuses**: transação de `createWithOwner`
**Requirement**: CFG-05, CFG-18

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] e2e `CA-03.1`: gravar e reler devolve o mesmo estado; dia aberto regravado como fechado some
- [x] e2e `RN-26`: gravar a barbearia A não altera nome, endereço, fuso nem dias da barbearia B
- [x] e2e: falha no meio da gravação (linha que viola `CHECK`) não deixa nada alterado
- [x] Gate check passes: `npm test && npm run test:e2e`
- [x] Test count: ~4 tests e2e novos passam (no silent deletions)

**Tests**: e2e
**Gate**: full
**Status**: ✅ Done
**Commit**: `feat(US-03): persist barbershop settings atomically`

---

### T8: Use case GetBarbershopSettings

**What**: `GetBarbershopSettingsUseCase` que devolve a barbearia da sessão.
**Where**: `src/usecases/get-barbershop-settings/get-barbershop-settings.use-case.ts`
**Depends on**: None (Fase 2 concluída)
**Reuses**: `GetMyAccountUseCase`, `InMemoryBarbershopRepository`
**Requirement**: CFG-02, CFG-18

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `CA-03.1`: devolve a barbearia do `barbershopId` informado, nunca a de outro tenant
- [x] Barbearia inexistente lança `InvalidCredentialsError`
- [x] Gate check passes: `npm test`
- [x] Test count: ~2 tests novos passam (no silent deletions)

**Tests**: unit
**Gate**: quick
**Status**: ✅ Done
**Commit**: `feat(US-03): add get barbershop settings use case`

---

### T9: Use case UpdateBarbershopSettings

**What**: `UpdateBarbershopSettingsUseCase` que monta os VOs, chama `updateSettings` e `saveSettings`, e devolve a barbearia.
**Where**: `src/usecases/update-barbershop-settings/update-barbershop-settings.use-case.ts`
**Depends on**: None (Fase 2 concluída)
**Reuses**: `InMemoryBarbershopRepository`
**Requirement**: CFG-01, CFG-08, CFG-09, CFG-13

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `CA-03.1`: grava nome, endereço, fuso e semana e devolve o estado salvo
- [x] `CA-03.2`: horário incoerente lança `InvalidOpeningHoursError` e o repositório continua com o estado anterior
- [x] `CA-03.3`: fuso novo gravado
- [x] Gate check passes: `npm test`
- [x] Test count: ~4 tests novos passam (no silent deletions)

**Tests**: unit
**Gate**: quick
**Status**: ✅ Done
**Commit**: `feat(US-03): add update barbershop settings use case`

---

### T10: Schema Zod das configurações

**What**: `barbershopSettingsSchema` com as regras de formato do design (nome, endereço, fuso, 7 dias, `HH:mm`, intervalo completo).
**Where**: `src/interface-adapters/controllers/schemas/barbershop-settings.schema.ts`
**Depends on**: None
**Reuses**: `invite-barber.schema.ts`, `TimeOfDay.isValid`, `BarbershopTimezone.isValid`
**Requirement**: CFG-10, CFG-15

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `CA-03.2`: dia ausente, `25:00`, intervalo sem `endsAt`, nome com 1 caractere e endereço com 4 caracteres são recusados, cada um no seu `field`
- [ ] `CA-03.3`: `Europe/Lisbon` recusado com "Escolha um fuso horário do Brasil." no campo `timezone`
- [ ] Nome e endereço saem com trim; campos extras somem
- [ ] Gate check passes: `npm test`
- [ ] Test count: ~8 tests novos passam (no silent deletions)

**Tests**: unit
**Gate**: quick
**Commit**: `feat(US-03): add barbershop settings request schema`

---

### T11: Rota GET /settings/barbershop

**What**: `BarbershopSettingsPresenter`, `BarbershopSettingsController` com o `GET` (sem `@Roles`), `BarbershopSettingsModule` registrado no `AppModule`, e o `AccountModule` exportando `BARBERSHOP_REPOSITORY`.
**Where**: `src/interface-adapters/controllers/barbershop-settings.controller.ts` (e presenter + módulo)
**Depends on**: None
**Reuses**: `MeController`, `MyAccountPresenter`, `test/support/account-flows.ts`
**Requirement**: CFG-02, CFG-06, CFG-16, CFG-17

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] e2e `CA-03.1`: Dono recém-cadastrado recebe 200 com endereço `null`, fuso `America/Sao_Paulo` e 7 dias `null`
- [ ] e2e: Barbeiro recebe 403 `{ message: 'Acesso negado.' }`; sem token, 401
- [ ] Gate check passes: `npm test && npm run test:e2e`
- [ ] Test count: ~3 tests e2e novos passam (no silent deletions)

**Tests**: e2e
**Gate**: full
**Commit**: `feat(US-03): expose GET /settings/barbershop`

---

### T12: Rota PUT /settings/barbershop

**What**: `PUT` no `BarbershopSettingsController` com o `ZodValidationPipe`, e `InvalidOpeningHoursError` → 400 no `DomainErrorFilter`.
**Where**: `src/interface-adapters/controllers/barbershop-settings.controller.ts` (e o mapa do `domain-error.filter.ts`)
**Depends on**: T10, T11
**Reuses**: `UsersController`, `test/users-permissions.e2e-spec.ts`
**Requirement**: CFG-01, CFG-03, CFG-04, CFG-05, CFG-08, CFG-09, CFG-10, CFG-13, CFG-15, CFG-16, CFG-18

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] e2e `CA-03.1`: `PUT` válido → 200 com o estado salvo; `GET` devolve o mesmo (dia fechado `null`, intervalo e `break: null`); repetir o `PUT` → 200 e mesmo estado; reabrir → fechar dia funciona
- [ ] e2e `CA-03.2`: segunda 18:00–09:00 → 400 "Segunda-feira: o horário de fechamento deve ser depois do de abertura."; intervalo fora → 400 com a mensagem do CFG-09; payload malformado → 400 com `errors`; nos três, o `GET` seguinte devolve o estado anterior
- [ ] e2e `CA-03.3`: `America/Manaus` gravado aparece no `GET /settings/barbershop` e no `GET /me`; `Europe/Lisbon` → 400
- [ ] e2e `RN-26`: `PUT` de A com `barbershopId` de B no corpo altera só A; Barbeiro → 403 e nada muda
- [ ] Gate check passes: `npm run lint && npm run build && npm test && npm run test:e2e`
- [ ] Test count: ~10 tests e2e novos passam (no silent deletions)

**Tests**: e2e
**Gate**: build
**Commit**: `feat(US-03): expose PUT /settings/barbershop`

---

## Requirement → Task Map

| Requirement | Tasks |
| ----------- | ----- |
| CFG-01 | T9, T12 |
| CFG-02 | T8, T11 |
| CFG-03 | T4, T12 |
| CFG-04 | T3, T12 |
| CFG-05 | T7, T12 |
| CFG-06 | T4, T6, T11 |
| CFG-07 | T3, T6 |
| CFG-08 | T3, T9, T12 |
| CFG-09 | T3, T9, T12 |
| CFG-10 | T1, T10, T12 |
| CFG-11 | T5 |
| CFG-12 | T2, T6 |
| CFG-13 | T9, T12 |
| CFG-14 | T2, T6 |
| CFG-15 | T2, T10, T12 |
| CFG-16 | T11, T12 |
| CFG-17 | T11 |
| CFG-18 | T7, T8, T12 |

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4

Phase 1:  T1, T2 ----→ T3 ----→ T4
Phase 2:  T5 ----→ T6 ----→ T7
Phase 3:  T8, T9
Phase 4:  T10, T11 ----→ T12
```

Batches para Execute (~7 tasks, fases inteiras): **Batch A** = Fases 1 e 2 (T1–T7); **Batch B** = Fases 3 e 4 (T8–T12).

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1 | 1 VO | ✅ Granular |
| T2 | 1 VO + tipo de dia da semana | ⚠️ Coeso (o VO devolve `Weekday`) |
| T3 | 1 VO + a classe de erro que ele lança | ⚠️ Coeso |
| T4 | 1 VO | ✅ Granular |
| T5 | 1 migration + as entidades ORM que ela descreve | ⚠️ Coeso (mesmo schema) |
| T6 | 1 entidade + o `restore` do único adaptador que a cria | ⚠️ Coeso (sem isso o build quebra) |
| T7 | 1 método no port, no adaptador e no fake | ⚠️ Coeso |
| T8 | 1 use case | ✅ Granular |
| T9 | 1 use case | ✅ Granular |
| T10 | 1 schema | ✅ Granular |
| T11 | 1 endpoint + presenter + registro do módulo | ⚠️ Coeso (merge backward: a rota só é testável registrada) |
| T12 | 1 endpoint + 1 linha no mapa do filtro | ⚠️ Coeso |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | nenhuma entrada | ✅ Match |
| T2 | None | nenhuma entrada | ✅ Match |
| T3 | T1, T2 | T1 → T3, T2 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | None | nenhuma entrada | ✅ Match |
| T6 | T5 | T5 → T6 | ✅ Match |
| T7 | T6 | T6 → T7 | ✅ Match |
| T8 | None (Fase 2) | nenhuma entrada | ✅ Match |
| T9 | None (Fase 2) | nenhuma entrada | ✅ Match |
| T10 | None | nenhuma entrada | ✅ Match |
| T11 | None | nenhuma entrada | ✅ Match |
| T12 | T10, T11 | T10 → T12, T11 → T12 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | Domain VO | unit | unit | ✅ OK |
| T2 | Domain VO | unit | unit | ✅ OK |
| T3 | Domain VO + erro | unit | unit | ✅ OK |
| T4 | Domain VO | unit | unit | ✅ OK |
| T5 | Migration + entidade ORM | e2e | e2e | ✅ OK |
| T6 | Entidade de domínio + repositório TypeORM | unit + e2e | e2e (inclui unit) | ✅ OK |
| T7 | Repositório TypeORM + fake | e2e | e2e | ✅ OK |
| T8 | Use case | unit | unit | ✅ OK |
| T9 | Use case | unit | unit | ✅ OK |
| T10 | Schema Zod | unit | unit | ✅ OK |
| T11 | Controller + presenter + módulo | e2e | e2e | ✅ OK |
| T12 | Controller + filtro | e2e | e2e | ✅ OK |
