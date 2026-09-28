# US-06 Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: inline (sem `design.md`); decisão de armazenamento em AD-008 (`.specs/STATE.md`)
**Status**: In Progress

Toda task cita US-06, RF-35 e, quando couber, RN-26. Commits: `feat(US-06): ...` (ou `test`/`chore` quando couber), só locais.

### Design inline

- **Domínio:** value object `BookingRules` (`src/domain/value-objects/booking-rules.ts`) com os cinco campos, `create` (lança `InvalidValueError`), `isValid`, `defaults()` (60, 120, 2, 15, 30) e as constantes de limite. Os padrões ficam só aqui.
- **Persistência (AD-008):** tabela `barbershop_booking_rules` (PK e FK `barbershop_id`, cinco colunas `integer NOT NULL` com `CHECK` dos limites). A migration cria a tabela e grava os padrões em toda barbearia existente (`INSERT ... SELECT`). Sem `DEFAULT` no banco: quem grava é a aplicação.
- **Criação (RUL-01):** `BarbershopRepository.createWithOwner(barbershop, owner, bookingRules)` grava as regras na mesma transação; o `RegisterBarbershopUseCase` passa `BookingRules.defaults()`.
- **Leitura e gravação (RUL-06, RUL-16):** port `BookingRulesRepository` em `src/usecases/ports/` com `findByBarbershopId(barbershopId)` e `save(barbershopId, rules)`. O `save` só faz `UPDATE` na linha do tenant; não toca `barbershops` nem outra tabela (RUL-07).
- **Use cases:** `GetBookingRulesUseCase` e `UpdateBookingRulesUseCase` (barbearia sem regras → `InvalidCredentialsError`, mesmo padrão da US-03).
- **HTTP:** `BookingRulesController` em `settings/rules` (só Dono, AD-007), schema Zod `bookingRulesSchema` (inteiros estritos, sem coerção), presenter `BookingRulesPresenter` com `bookingRulesResponseSchema`, módulo `BookingRulesModule`.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `CLAUDE.md` (seção Testes: use cases com fakes em memória; gateways TypeORM e HTTP em e2e contra o Postgres do compose; nome do teste cita o `CA`), `package.json` (config Jest, sem threshold), `test/jest-e2e.json`, AD-006; lição candidata L-002 (fronteira exata no `CHECK`), L-004 (isolamento de tenant por id forjado).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Domain value objects | unit | Todos os ramos; cada limite aceito e cada passo além recusado | `src/domain/**/*.spec.ts` | `npm test` |
| Use cases | unit (fakes dos ports) | 1:1 com os ACs; nada gravado quando o domínio recusa | `src/usecases/**/*.spec.ts` | `npm test` |
| Schemas Zod da borda | unit | Cada regra de formato e limite do RUL-09 a RUL-11 e os edge cases | `src/interface-adapters/**/*.spec.ts` | `npm test` |
| Repositórios TypeORM, migration | e2e (Postgres do compose) | Leitura/gravação por tenant, `CHECK` na fronteira, backfill | `test/database/*.e2e-spec.ts` | `npm run test:e2e` |
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

### Phase 1: Domínio

```
T1
```

### Phase 2: Persistência

```
T2 -> T3
T3 -> T4
```

### Phase 3: Use cases

```
T5
T6
```

### Phase 4: HTTP

```
T7 -> T8
```

---

## Task Breakdown

### T1: Value object BookingRules

**What**: `BookingRules` com `create`, `isValid`, `defaults()` e getters dos cinco campos, recusando valores fora dos limites com `InvalidValueError`.
**Where**: `src/domain/value-objects/booking-rules.ts`
**Depends on**: None
**Reuses**: padrão `create`/`isValid` de `src/domain/value-objects/service-duration.ts`
**Requirement**: RUL-01, RUL-08, RUL-12

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `defaults()` devolve 60, 120, 2, 15, 30
- [x] Cada limite aceito (0 e 10.080; 1 e 10; 5 e 120; 7 e 365) e cada passo além recusado (-5, 10.085, 7 fora do múltiplo de 5, 0 e 11, 4 e 121, 6 e 366, não inteiro)
- [x] Gate check passes: `npm test`
- [x] Test count: ~25 tests novos passam (no silent deletions)

**Tests**: unit
**Gate**: quick
**Status**: ✅ Done
**Commit**: `feat(US-06): add booking rules value object`

---

### T2: Migration e entidade ORM das regras

**What**: Migration `AddBookingRules` (tabela `barbershop_booking_rules` com PK/FK, `CHECK` dos limites e backfill dos padrões) e `BarbershopBookingRulesEntity`.
**Where**: `src/infrastructure/database/migrations/<timestamp>-AddBookingRules.ts` (e a entidade ORM)
**Depends on**: None
**Reuses**: estilo de `1790546186111-AddBarbershopSettings.ts`; `test/database/opening-hours-schema.e2e-spec.ts`
**Requirement**: RUL-03, RUL-13

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `CA-06.3`: o banco aceita cada limite exato e recusa com `CHECK` cada passo além e cada negativo
- [x] `CA-06.1`: rodar o `up` sobre uma barbearia sem regras grava os cinco padrões (teste em transação revertida)
- [x] Gate check passes: `npm test && npm run test:e2e`

**Tests**: e2e
**Gate**: full
**Status**: ✅ Done
**Commit**: `feat(US-06): add booking rules table with checks and backfill`

---

### T3: Port e repositório TypeORM das regras

**What**: Port `BookingRulesRepository` (`findByBarbershopId`, `save`), implementação TypeORM e fake em memória.
**Where**: `src/infrastructure/database/repositories/typeorm-booking-rules.repository.ts` (e o port em `src/usecases/ports/`, o fake em `src/usecases/testing/`)
**Depends on**: T2
**Reuses**: `typeorm-barbershop.repository.ts`, `in-memory-barbershop.repository.ts`
**Requirement**: RUL-06, RUL-07, RUL-16

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `CA-06.2`: depois de `save`, `findByBarbershopId` devolve os novos valores
- [ ] `CA-06.2`: `save` não altera a linha da barbearia em `barbershops`
- [ ] `RN-26`: `save` de A não altera as regras de B; `findByBarbershopId` de barbearia sem regras devolve `null`
- [ ] Gate check passes: `npm test && npm run test:e2e`

**Tests**: e2e
**Gate**: full
**Status**: Pending
**Commit**: `feat(US-06): add booking rules repository`

---

### T4: Barbearia nova nasce com as regras padrão

**What**: `createWithOwner(barbershop, owner, bookingRules)` grava as regras na mesma transação; `RegisterBarbershopUseCase` passa `BookingRules.defaults()`.
**Where**: `src/usecases/register-barbershop/register-barbershop.use-case.ts` (e port, TypeORM, fake em memória e chamadas existentes)
**Depends on**: T3
**Reuses**: `InMemoryBookingRulesRepository` de T3
**Requirement**: RUL-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `CA-06.1`: depois do cadastro, as regras da barbearia são os cinco padrões (unit, com fake)
- [ ] `CA-06.1`: `createWithOwner` grava as regras no banco; com e-mail duplicado não grava nada (e2e)
- [ ] Gate check passes: `npm test && npm run test:e2e`

**Tests**: e2e
**Gate**: build
**Status**: Pending
**Commit**: `feat(US-06): create default booking rules on signup`

---

### T5: GetBookingRulesUseCase

**What**: Use case que devolve as regras vigentes da barbearia da sessão.
**Where**: `src/usecases/get-booking-rules/get-booking-rules.use-case.ts`
**Depends on**: None
**Reuses**: `get-barbershop-settings.use-case.ts`
**Requirement**: RUL-02, RUL-16

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `CA-06.1`: devolve as regras do tenant pedido, nunca as de outro
- [ ] Barbearia sem regras lança `InvalidCredentialsError`
- [ ] Gate check passes: `npm test`

**Tests**: unit
**Gate**: quick
**Status**: Pending
**Commit**: `feat(US-06): add get booking rules use case`

---

### T6: UpdateBookingRulesUseCase

**What**: Use case que valida as cinco regras no domínio e substitui as da barbearia da sessão.
**Where**: `src/usecases/update-booking-rules/update-booking-rules.use-case.ts`
**Depends on**: None
**Reuses**: `update-barbershop-settings.use-case.ts`
**Requirement**: RUL-04, RUL-06, RUL-12, RUL-16

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `CA-06.2`: salva e devolve as regras; a leitura seguinte do repositório devolve os novos valores; outra barbearia não muda
- [ ] `CA-06.3`: valor fora do limite lança `InvalidValueError` e nada é gravado
- [ ] Barbearia sem regras lança `InvalidCredentialsError`
- [ ] Gate check passes: `npm test`

**Tests**: unit
**Gate**: build
**Status**: Pending
**Commit**: `feat(US-06): add update booking rules use case`

---

### T7: Schema Zod do corpo das regras

**What**: `bookingRulesSchema` com os cinco inteiros obrigatórios, limites e mensagens em pt-BR, sem coerção.
**Where**: `src/interface-adapters/controllers/schemas/booking-rules.schema.ts`
**Depends on**: None
**Reuses**: `barbershop-settings.schema.ts` e o seu spec
**Requirement**: RUL-09, RUL-10, RUL-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `CA-06.3`: negativo, ausente, `null`, `""`, `"60"`, não inteiro, fora do limite e fora do múltiplo de 5 geram um erro no campo certo
- [ ] Limites exatos aceitos; campos extras descartados
- [ ] Gate check passes: `npm test`

**Tests**: unit
**Gate**: quick
**Status**: Pending
**Commit**: `feat(US-06): add booking rules payload schema`

---

### T8: Rotas GET e PUT /settings/rules

**What**: Presenter, controller (Swagger incluso), módulo Nest e registro no `AppModule`.
**Where**: `src/interface-adapters/controllers/booking-rules.controller.ts` (e presenter, módulo, `app.module.ts`, e2e)
**Depends on**: T7
**Reuses**: `barbershop-settings.controller.ts`, `test/barbershop-settings.e2e-spec.ts`
**Requirement**: RUL-02, RUL-04, RUL-05, RUL-07, RUL-08, RUL-09, RUL-10, RUL-11, RUL-14, RUL-15, RUL-16

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `CA-06.1`: `GET` de barbearia nova devolve os padrões
- [ ] `CA-06.2`: `PUT` válido responde 200 com o salvo; `GET` devolve o salvo; `GET /settings/barbershop` não muda; zeros aceitos; `PUT` repetido é idempotente
- [ ] `CA-06.3`: negativo, ausente e string numérica → 400 no campo, regras inalteradas
- [ ] Barbeiro 403 e sem sessão 401 nas duas rotas; `PUT` de A não muda B; `barbershopId` no corpo ignorado
- [ ] `test/api-docs.e2e-spec.ts` passa com as rotas novas
- [ ] Gate check passes: `npm run lint && npm run build && npm test && npm run test:e2e`

**Tests**: e2e
**Gate**: build
**Status**: Pending
**Commit**: `feat(US-06): expose GET and PUT /settings/rules`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4

Phase 1:  T1
Phase 2:  T2 ------→ T3 ------→ T4
Phase 3:  T5, T6
Phase 4:  T7 ------→ T8
```
