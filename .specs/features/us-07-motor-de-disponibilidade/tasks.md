# US-07 Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/us-07-motor-de-disponibilidade/design.md`
**Status**: Approved

Toda task cita US-07 e os `AVL`/`RN` que implementa. Testes citam o `CA-07.x` (ou a `RN`) no nome. Commits: `feat(US-07): ...` (ou `test`/`chore`), só locais.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `CLAUDE.md` (seção Testes: use cases com fakes em memória; gateways TypeORM em e2e contra o Postgres do compose; nome do teste cita o `CA`), `package.json` (Jest, sem threshold), `test/jest-e2e.json`, AD-006; lições candidatas L-002 (fronteira exata em constraint), L-004 (isolamento de tenant por id forjado).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Domain entities / value objects | unit | Todos os ramos; 1:1 com os AVL do componente; fronteiras exatas (encostado, `início == earliest`) | `src/domain/**/*.spec.ts` | `npm test` |
| Use cases | unit (fakes dos ports) | 1:1 com os AVL; cada erro com classe, mensagem e RN; nada gravado quando recusa; todo edge case da spec | `src/usecases/**/*.spec.ts` | `npm test` |
| Migration / constraints | e2e (Postgres do compose) | Cada constraint recusa e aceita na fronteira exata (L-002); FKs compostas com barbeiro e serviço de outro tenant | `test/database/*-schema.e2e-spec.ts` | `npm run test:e2e` |
| Repositórios TypeORM | e2e | Leitura por tenant com dados de outra barbearia (L-004); tradução do `23P01`; rollback | `test/database/typeorm-*.repository.e2e-spec.ts` | `npm run test:e2e` |
| Métricas Prometheus | unit (registry real) | Cada contador com o label certo | `src/infrastructure/observability/*.spec.ts` | `npm test` |
| Módulo Nest + fluxo com banco | e2e | Concorrência CA-07.4 sem timing; consulta → gravação no banco real | `test/scheduling*.e2e-spec.ts` | `npm run test:e2e` |
| Entidades ORM, ports | none | build gate only | - | build gate only |

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
T2
T3
T4
```

### Phase 2: Use cases

```
T5 -> T6
```

### Phase 3: Persistência

```
T7 -> T8
T7 -> T9
```

### Phase 4: Integração

```
T10 -> T11
```

---

## Task Breakdown

### T1: Datas locais no fuso da barbearia

**What**: `BarbershopTimezone.localDateOf(instant)` devolve a data local `AAAA-MM-DD` de um instante, e a leitura de data local passa a recusar datas que não existem no calendário.
**Where**: `src/domain/value-objects/barbershop-timezone.ts`
**Depends on**: None
**Reuses**: `offsetAt` e `parseLocalDate` do próprio arquivo
**Requirement**: AVL-09, edge case "data inválida"

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `localDateOf` devolve a data local de São Paulo e de Manaus para instantes perto da meia-noite UTC
- [x] `toUtc`/`weekdayOf` recusam `2026-02-30`, `2026-13-01` e `2026-9-1` com `InvalidValueError('Data inválida.')`
- [x] Gate check passes: `npm test`

**Tests**: unit
**Gate**: quick
**Status**: ✅ Done
**Commit**: `feat(US-07): add local date of an instant and reject impossible dates`

---

### T2: Jornada do barbeiro em UTC

**What**: `Barber.workIntervalsOn(localDate, timezone)` devolve os períodos da jornada do dia em UTC, espelho de `Barbershop.openIntervalsOn`.
**Where**: `src/domain/entities/barber.ts`
**Depends on**: None
**Reuses**: `DayWorkingHours.workPeriods()`, `BarbershopTimezone.toUtc/weekdayOf`
**Requirement**: AVL-01, AVL-07, AVL-09

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Dia com intervalo devolve dois períodos UTC; dia sem jornada devolve `[]`
- [x] Mesma jornada em fusos diferentes gera instantes UTC diferentes
- [x] Gate check passes: `npm test`

**Tests**: unit
**Gate**: quick
**Status**: ✅ Done
**Commit**: `feat(US-07): add barber working periods in utc`

---

### T3: Entidade Appointment

**What**: Entidade `Appointment` com `book` (status `confirmed`, `endsAt = startsAt + duração`, origem `bot`/`manual`) e `restore`.
**Where**: `src/domain/entities/appointment.ts`
**Depends on**: None
**Reuses**: padrão `create`/`restore` de `src/domain/entities/barber.ts`
**Requirement**: AVL-18, AVL-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `book` grava status `confirmed`, origem, barbeiro, serviços na ordem, início e fim somado
- [x] Gate check passes: `npm test`

**Tests**: unit
**Gate**: quick
**Status**: ✅ Done
**Commit**: `feat(US-07): add appointment entity`

---

### T4: Value object BarberDaySchedule

**What**: Regras de agenda de um barbeiro num dia: `offer(duração, earliest)` devolve a grade de 30 min por período livre, e `violationOf(período)` devolve a primeira violação (funcionamento → jornada → bloqueio → sobreposição) ou `null`.
**Where**: `src/domain/value-objects/barber-day-schedule.ts`
**Depends on**: None
**Reuses**: `UtcPeriod` de `src/domain/entities/barbershop.ts`
**Requirement**: AVL-01, AVL-03, AVL-04, AVL-05, AVL-06, AVL-07, AVL-08, AVL-21, AVL-22, AVL-23, AVL-24, AVL-25, AVL-27

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Cenário do Independent Test da spec devolve exatamente 10:00, 10:30, 11:00, 13:00, 14:45, 16:00
- [x] Jornada antes da abertura: grade começa na abertura; período livre menor que a duração não oferece nada
- [x] Bloqueio/agendamento encostado (fim == início) não tira o horário; sobreposto de 1 min tira
- [x] `earliest` exato é oferecido; 1 min depois do início da grade tira aquele início
- [x] `violationOf` devolve cada violação isolada e, com várias, a primeira na ordem
- [x] Todo início oferecido tem `violationOf` nulo (AVL-27)
- [x] Gate check passes: `npm test`

**Tests**: unit
**Gate**: build
**Status**: ✅ Done
**Commit**: `feat(US-07): add barber day schedule with slot offer and rule violations`

---

### T5: ListAvailableSlotsUseCase

**What**: Use case da consulta de horários para um barbeiro ou qualquer barbeiro apto, com o contexto compartilhado (serviços, duração, regras vigentes, `earliest` por origem, dia do barbeiro), os ports `AppointmentRepository`/`BarberBlockRepository` e seus fakes em memória.
**Where**: `src/usecases/list-available-slots/list-available-slots.use-case.ts` (e `src/usecases/shared/booking-context.ts`, os ports em `src/usecases/ports/`, os fakes em `src/usecases/testing/`)
**Depends on**: None
**Reuses**: `BarberRepository.listActiveByBarbershop`, `ServiceRepository.findByIds`, `BookingRules.defaults()`, fixtures `seedBarbershop`/`seedBarber`/`seedService`, `FixedClock`
**Requirement**: AVL-01 a AVL-17, AVL-32 a AVL-36, edge cases de data e regras ausentes

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `CA-07.1`: Independent Test da spec (um barbeiro) devolve só os inícios esperados, com `barberId`, início e fim UTC em ordem
- [x] `CA-07.2`: Independent Test "qualquer barbeiro" (Ana/Bruno/Caio/Davi); ninguém apto → `[]`
- [x] `CA-07.3`: relógio 10:05 e antecedência 60: bot a partir de 11:30, `manual` a partir de 10:30; fronteira exata; regra alterada vale na consulta seguinte; barbearia sem regras usa 60 min
- [x] Erros: barbeiro inexistente/inativo/de outra barbearia → `BarberNotFoundError`; serviço inexistente/inativo → `ServiceNotFoundError`; barbeiro que não realiza → `ServiceNotPerformedError`; lista vazia/repetida e data inválida → `InvalidValueError`
- [x] RN-26: bloqueio e agendamento de outra barbearia com o mesmo `barberId` não tiram horários
- [x] Data passada → `[]`; barbearia fechada ou barbeiro sem jornada no dia → `[]`
- [x] Gate check passes: `npm test`

**Tests**: unit
**Gate**: quick
**Status**: ✅ Done
**Commit**: `feat(US-07): add available slots query for one or any barber`

---

### T6: BookAppointmentUseCase

**What**: Use case que valida na ordem do AVL-25 e grava o agendamento, com os erros de domínio de agenda e o port `AppointmentMetrics` com fake.
**Where**: `src/usecases/book-appointment/book-appointment.use-case.ts` (e os erros em `src/domain/errors/`, o port em `src/usecases/ports/`, o fake em `src/usecases/testing/`)
**Depends on**: T5
**Reuses**: `booking-context.ts` e fakes de T5, `BarberDaySchedule`, `Appointment.book`
**Requirement**: AVL-18 a AVL-27, AVL-32 a AVL-35, AVL-38, AVL-39, edge cases de segundos e gravação repetida

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `CA-07.5`: gravação válida persiste status, origem, barbeiro, serviços em ordem, início e fim; devolve o agendamento
- [ ] `CA-07.5`: um teste por regra (antecedência RN-02, passado, funcionamento RN-05, jornada RN-05, bloqueio RN-05, sobreposição RN-03), cada um com classe, mensagem, `rule` e zero agendamentos gravados
- [ ] `CA-07.5`: violação dupla informa a primeira na ordem
- [ ] `CA-07.1`/`CA-07.5`: cada horário devolvido pela consulta é aceito pela gravação com o mesmo `agora`
- [ ] Painel (`manual`) aceita início antes da antecedência; início com segundos → `InvalidValueError`; mesma gravação duas vezes → conflito e um agendamento
- [ ] Conflito vindo do repositório (RN-07) propaga e conta na métrica de conflito
- [ ] Métricas: gravação aceita incrementa `booked` com a origem; conflito incrementa `conflict` com a origem
- [ ] Gate check passes: `npm test`

**Tests**: unit
**Gate**: build

---

### T7: Migration e entidades ORM de agenda

**What**: Migration `AddAppointments` (`btree_gist`, `appointments` com `EXCLUDE USING gist`, `appointment_services`, `barber_blocks`, FKs compostas) e as entidades ORM.
**Where**: `src/infrastructure/database/migrations/<timestamp>-AddAppointments.ts` (e as entidades em `src/infrastructure/database/entities/`)
**Depends on**: None
**Reuses**: FKs compostas de `1790565285998-AddBarbers.ts`; estilo de `test/database/barbers-schema.e2e-spec.ts`
**Requirement**: AVL-29, AVL-30, AVL-31, AVL-37

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `CA-07.4`: `INSERT` direto de dois confirmados sobrepostos do mesmo barbeiro falha com `23P01`; sobreposição de 1 min também
- [ ] `CA-07.4`: encostados (fim == início) do mesmo barbeiro são aceitos; sobrepostos de barbeiros diferentes são aceitos
- [ ] `CHECK`: `ends_at == starts_at` recusado; status e origem fora da lista recusados
- [ ] RN-26: agendamento, serviço de agendamento e bloqueio com barbeiro ou serviço de outra barbearia falham por FK
- [ ] `migration:show` sem pendências e `migration:generate` não gera diff
- [ ] Gate check passes: `npm test && npm run test:e2e`

**Tests**: e2e
**Gate**: full

---

### T8: TypeOrmBarberBlockRepository

**What**: Implementação TypeORM de `BarberBlockRepository.listBusyPeriods`.
**Where**: `src/infrastructure/database/repositories/typeorm-barber-block.repository.ts`
**Depends on**: T7
**Reuses**: `typeorm-barber.repository.ts`
**Requirement**: AVL-04, AVL-36

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Devolve só bloqueios dos barbeiros pedidos que tocam o intervalo; encostados de fora não voltam
- [ ] RN-26: bloqueio de outra barbearia, consultado com o `barberId` dele e o tenant errado, não volta
- [ ] Gate check passes: `npm test && npm run test:e2e`

**Tests**: e2e
**Gate**: full

---

### T9: TypeOrmAppointmentRepository

**What**: Implementação TypeORM de `AppointmentRepository` (`create` transacional com tradução do `23P01` para `AppointmentConflictError` RN-07; `listBusyPeriods` de confirmados).
**Where**: `src/infrastructure/database/repositories/typeorm-appointment.repository.ts`
**Depends on**: T7
**Reuses**: `writeWithUniqueGuard`/`uniqueViolationConstraint` de `typeorm-barber.repository.ts`
**Requirement**: AVL-18, AVL-26, AVL-28, AVL-36

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `create` grava agendamento e serviços na ordem; leitura por SQL confere as colunas
- [ ] `CA-07.4`: `create` sobreposto lança `AppointmentConflictError` com `rule` RN-07 e não deixa linha em `appointment_services`
- [ ] `listBusyPeriods` devolve só confirmados dos barbeiros pedidos que tocam o intervalo; RN-26 com tenant errado não devolve nada
- [ ] Gate check passes: `npm test && npm run test:e2e`

**Tests**: e2e
**Gate**: build

---

### T10: PrometheusAppointmentMetrics

**What**: Contadores `appointments_booked_total{origin}` e `appointment_conflicts_total{origin}` implementando `AppointmentMetrics`.
**Where**: `src/infrastructure/observability/prometheus-appointment-metrics.ts`
**Depends on**: None
**Reuses**: `prometheus-account-metrics.ts`
**Requirement**: AVL-38, AVL-39

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `booked('bot')` e `conflict('manual')` aparecem no registry com o label certo e valor 1
- [ ] Gate check passes: `npm test`

**Tests**: unit
**Gate**: quick

---

### T11: SchedulingModule e fluxo contra o banco

**What**: `SchedulingModule` liga ports, repositórios, métricas e os dois use cases, exporta os use cases e entra no `AppModule`; `BookingRulesModule` exporta `BOOKING_RULES_REPOSITORY`. E2e de concorrência e do fluxo consulta → gravação no Postgres.
**Where**: `src/infrastructure/modules/scheduling.module.ts` (e `app.module.ts`, `booking-rules.module.ts`, `test/scheduling.e2e-spec.ts`)
**Depends on**: T10
**Reuses**: `barbers.module.ts`, `test/support/create-account-test-app.ts`
**Requirement**: AVL-28, AVL-27, AVL-17, AVL-38

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `CA-07.4`: duas gravações do mesmo horário com `Promise.all`, com as leituras seguradas numa barreira até ambas lerem: uma resolve, a outra rejeita com `AppointmentConflictError` RN-07; a tabela tem uma linha
- [ ] `CA-07.1`/`CA-07.5`: horário devolvido pela consulta no banco real é gravado, e a consulta seguinte não o devolve mais
- [ ] O `AppModule` sobe e `/metrics` expõe os dois contadores
- [ ] Gate check passes: `npm run lint && npm run build && npm test && npm run test:e2e`

**Tests**: e2e
**Gate**: build

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4

Phase 1:  T1   T2   T3   T4
Phase 2:  T5 ------→ T6
Phase 3:  T7 ------→ T8
          T7 ------→ T9
Phase 4:  T10 -----→ T11
```

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1 | 1 value object, 2 métodos | ✅ Granular |
| T2 | 1 método de entidade | ✅ Granular |
| T3 | 1 entidade | ✅ Granular |
| T4 | 1 value object | ✅ Granular |
| T5 | 1 use case + contexto compartilhado + 2 ports e fakes | ⚠️ Coeso: os ports só existem para este use case ser testável |
| T6 | 1 use case + erros que ele lança + port de métrica | ⚠️ Coeso: erros e métrica sem uso fora dele |
| T7 | 1 migration + entidades que ela cria | ✅ Coeso |
| T8 | 1 repositório | ✅ Granular |
| T9 | 1 repositório | ✅ Granular |
| T10 | 1 classe de métrica | ✅ Granular |
| T11 | 1 módulo + e2e que ele habilita | ⚠️ Coeso (merge forward do teste) |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | none | ✅ Match |
| T2 | None | none | ✅ Match |
| T3 | None | none | ✅ Match |
| T4 | None | none | ✅ Match |
| T5 | None | none | ✅ Match |
| T6 | T5 | T5 → T6 | ✅ Match |
| T7 | None | none | ✅ Match |
| T8 | T7 | T7 → T8 | ✅ Match |
| T9 | T7 | T7 → T9 | ✅ Match |
| T10 | None | none | ✅ Match |
| T11 | T10 | T10 → T11 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | Domain value object | unit | unit | ✅ OK |
| T2 | Domain entity | unit | unit | ✅ OK |
| T3 | Domain entity | unit | unit | ✅ OK |
| T4 | Domain value object | unit | unit | ✅ OK |
| T5 | Use case + ports | unit | unit | ✅ OK |
| T6 | Use case + errors + port | unit | unit | ✅ OK |
| T7 | Migration + entidades ORM | e2e | e2e | ✅ OK |
| T8 | Repositório TypeORM | e2e | e2e | ✅ OK |
| T9 | Repositório TypeORM | e2e | e2e | ✅ OK |
| T10 | Métricas Prometheus | unit | unit | ✅ OK |
| T11 | Módulo Nest + fluxo com banco | e2e | e2e | ✅ OK |
