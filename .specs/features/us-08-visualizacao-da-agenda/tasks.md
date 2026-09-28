# US-08 Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/us-08-visualizacao-da-agenda/design.md`
**Status**: In Progress

Toda task cita US-08 e os `AGD`/`RN` que implementa. Testes citam o `CA-08.x` (ou a `RN`) no nome. Commits: `feat(US-08): ...` (ou `test`/`chore`), só locais.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `CLAUDE.md` (seção Testes: use cases com fakes em memória; gateways TypeORM e fluxos HTTP em e2e contra o Postgres do compose; nome do teste cita o `CA`; Swagger checado por `test/api-docs.e2e-spec.ts`), `package.json` (Jest, sem threshold), `test/jest-e2e.json`, AD-006.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Value objects de domínio | unit | Todos os ramos; 1:1 com os AGD do componente; fronteiras (domingo, meia-noite local) | `src/domain/**/*.spec.ts` | `npm test` |
| Use cases | unit (fakes dos ports) | 1:1 com os AGD; cada erro com classe e mensagem; filtro passado ao port | `src/usecases/**/*.spec.ts` | `npm test` |
| Schemas Zod de borda | unit | Aceita o válido e recusa cada formato inválido listado | `src/interface-adapters/controllers/schemas/*.spec.ts` | `npm test` |
| Migration / constraints | e2e (Postgres do compose) | Cada constraint recusa e aceita; FK composta com cliente de outro tenant | `test/database/*-schema.e2e-spec.ts` | `npm run test:e2e` |
| Consulta TypeORM | e2e | Fronteiras do período, ordem, joins, isolamento com dados de outra barbearia | `test/database/typeorm-*.e2e-spec.ts` | `npm run test:e2e` |
| Controller + módulo | e2e | Rota: happy path por perfil, cada erro (400/401/403/404), Swagger | `test/*.e2e-spec.ts` | `npm run test:e2e` |
| Entidades ORM, ports, presenter | none | build gate only (presenter coberto pelo e2e da rota) | - | build gate only |

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

### Phase 1: Domínio e use case

```
T1 -> T2
```

### Phase 2: Persistência

```
T3 -> T4
```

### Phase 3: HTTP

```
T5 -> T6
```

---

## Task Breakdown

### T1: Value object SchedulePeriod

**What**: `SchedulePeriod.create({ view, localDate, timezone })` com `view`, `startDate`, `endDate` (inclusiva) e `utc` no fuso da barbearia.
**Where**: `src/domain/value-objects/schedule-period.ts`
**Depends on**: None
**Reuses**: `BarbershopTimezone.toUtc`, `TimeOfDay`, `UtcPeriod`
**Requirement**: AGD-01, AGD-02, AGD-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `day` 2026-09-29 em São Paulo → `[2026-09-29T03:00Z, 2026-09-30T03:00Z)`, `startDate = endDate = 2026-09-29`
- [x] `week` numa quarta → segunda a domingo; `week` num domingo → segunda anterior até esse domingo; `week` numa segunda → começa nela
- [x] Semana que cruza o mês (e o ano) calcula as datas certas
- [x] Data inexistente → `InvalidValueError('Data inválida.')`
- [x] Gate check passes: `npm test`

**Status**: ✅ Done

**Tests**: unit
**Gate**: quick

---

### T2: ListScheduleUseCase

**What**: Use case que resolve o período, aplica a regra de perfil e chama o port `ScheduleQuery`; erro `ScheduleAccessDeniedError`.
**Where**: `src/usecases/list-schedule/list-schedule.use-case.ts` (e o port `src/usecases/ports/schedule.query.port.ts`, o erro em `src/domain/errors/`, o fake em `src/usecases/testing/`)
**Depends on**: T1
**Reuses**: `InMemoryBarberRepository`, `InMemoryBarbershopRepository`, fixtures de barbeiro
**Requirement**: AGD-03, AGD-04, AGD-08, AGD-09, AGD-10, AGD-11, AGD-21, AGD-22

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Dono sem `barberId` consulta sem filtro; com `barberId` da barbearia filtra por ele (inclusive barbeiro inativo)
- [x] Dono com `barberId` inexistente ou de outra barbearia → `BarberNotFoundError` sem consultar
- [x] Barbeiro sem `barberId` ou com o próprio → filtra pelo próprio
- [x] Barbeiro com `barberId` de outro (ou sem ficha e com `barberId`) → `ScheduleAccessDeniedError('Acesso negado.')` sem consultar
- [x] Barbeiro sem ficha e sem `barberId` → lista vazia, sem consultar
- [x] O port recebe o `barbershopId` da sessão e o intervalo UTC do `SchedulePeriod`
- [x] Gate check passes: `npm test`

**Status**: ✅ Done

**Tests**: unit
**Gate**: build

---

### T3: Migration e entidades ORM de cliente

**What**: Tabela `clients`, coluna `appointments.client_id` com FK composta e índice `(barbershop_id, starts_at)`.
**Where**: `src/infrastructure/database/migrations/<timestamp>-AddClients.ts` (e `client.entity.ts`, `appointment.entity.ts` em `src/infrastructure/database/entities/`, o teste `test/database/clients-schema.e2e-spec.ts`)
**Depends on**: None
**Reuses**: padrão de FK composta de `appointment.entity.ts`
**Requirement**: AGD-17, AGD-18, AGD-19, AGD-20

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Telefone repetido na mesma barbearia é recusado; o mesmo telefone em outra barbearia é aceito
- [ ] Agendamento com cliente de outra barbearia é recusado; com cliente da mesma é aceito
- [ ] Agendamento sem cliente é aceito
- [ ] `TypeOrmAppointmentRepository.create` grava o agendamento com `client_id` nulo
- [ ] `migration:revert` desfaz sem erro
- [ ] Gate check passes: `npm test && npm run test:e2e`

**Tests**: e2e
**Gate**: full

---

### T4: TypeOrmScheduleQuery

**What**: Implementação do port `ScheduleQuery` com joins em barbeiro, cliente e serviços.
**Where**: `src/infrastructure/database/repositories/typeorm-schedule.query.ts`
**Depends on**: T3
**Reuses**: entidades ORM existentes, `DataSource`
**Requirement**: AGD-06, AGD-12, AGD-13, AGD-14, AGD-15, AGD-16, AGD-21

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Inclui início exatamente em `range.start`; exclui início exatamente em `range.end`; agendamento que começa antes e termina dentro fica de fora
- [ ] Filtra por barbeiro quando informado
- [ ] Ordena por início, nome do barbeiro sem diferenciar maiúsculas, id
- [ ] Traz barbeiro, cliente (ou `null`), serviços na ordem de `position`, status e origem
- [ ] Não devolve dados de outra barbearia, nem com `barberId` forjado
- [ ] Gate check passes: `npm test && npm run test:e2e`

**Tests**: e2e
**Gate**: build

---

### T5: Schema da query da agenda

**What**: Schema Zod de `view`, `date` e `barberId` da rota da agenda.
**Where**: `src/interface-adapters/controllers/schemas/schedule.query.schema.ts`
**Depends on**: None
**Reuses**: padrão de `barber-id.params.schema.ts`
**Requirement**: AGD-24

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Aceita `day` e `week`, data válida e `barberId` UUID opcional
- [ ] Recusa visão fora de `day`/`week`, data fora de `AAAA-MM-DD`, data inexistente (`2026-02-30`), `barberId` não UUID, e falta de `view` ou `date`
- [ ] Gate check passes: `npm test`

**Tests**: unit
**Gate**: quick

---

### T6: Rota GET /appointments

**What**: Controller, presenter, módulo e mapeamento 403, com e2e da rota por perfil.
**Where**: `src/interface-adapters/controllers/schedule.controller.ts` (e `schedule.presenter.ts`, `schedule.module.ts`, `app.module.ts`, `domain-error.filter.ts`, `test/schedule.e2e-spec.ts`)
**Depends on**: T5
**Reuses**: `createAccountTestApp`, `signupOwner`, `createBarber`, `ApiZodResponse`, `ApiErrorResponse`
**Requirement**: AGD-01 a AGD-25 (ponta a ponta)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Dono: visão dia, visão semana, filtro por barbeiro, período e fuso na resposta, lista vazia
- [ ] Barbeiro: só os próprios; próprio `barberId`; outro `barberId` → `403 { message: 'Acesso negado.' }`; sem ficha → lista vazia
- [ ] Cada agendamento traz barbeiro, cliente (ou `null`), serviços em ordem, início e fim ISO UTC, status e origem
- [ ] Outra barbearia não aparece; `barberId` de outra barbearia → `404`; sem token → `401`; `view=month` → `400`
- [ ] Rota no Swagger com resumo citando US-08, resposta 200, erros 403 e 404; `test/api-docs.e2e-spec.ts` passa
- [ ] Gate check passes: `npm run lint && npm run build && npm test && npm run test:e2e`

**Tests**: e2e
**Gate**: build

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3

Phase 1:  T1 ------→ T2
Phase 2:  T3 ------→ T4
Phase 3:  T5 ------→ T6
```

6 tasks, um lote só: execução inline, sem sub-agentes de implementação. O Verifier roda como sub-agente ao fim.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: SchedulePeriod | 1 value object | ✅ Granular |
| T2: ListScheduleUseCase | 1 use case + seu port, erro e fake | ⚠️ Coeso (o use case não testa sem o port e o fake) |
| T3: Migration de clientes | 1 migration + entidades que ela espelha | ⚠️ Coeso (migration e entidade precisam bater) |
| T4: TypeOrmScheduleQuery | 1 gateway | ✅ Granular |
| T5: Schema da query | 1 schema | ✅ Granular |
| T6: Rota GET /appointments | 1 endpoint + wiring | ⚠️ Coeso (o e2e da rota só roda com módulo e presenter) |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | início da Phase 1 | ✅ Match |
| T2 | T1 | T1 -> T2 | ✅ Match |
| T3 | None | início da Phase 2 | ✅ Match |
| T4 | T3 | T3 -> T4 | ✅ Match |
| T5 | None | início da Phase 3 | ✅ Match |
| T6 | T5 | T5 -> T6 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | Value object | unit | unit | ✅ OK |
| T2 | Use case (+ port, erro) | unit | unit | ✅ OK |
| T3 | Migration / constraints | e2e | e2e | ✅ OK |
| T4 | Consulta TypeORM | e2e | e2e | ✅ OK |
| T5 | Schema Zod | unit | unit | ✅ OK |
| T6 | Controller + módulo (+ presenter) | e2e | e2e | ✅ OK |
