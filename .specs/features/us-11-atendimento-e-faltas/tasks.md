# US-11 Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/us-11-atendimento-e-faltas/design.md`
**Status**: In Progress

Toda task cita US-11 e os `ATD`/`RN` que implementa. Testes citam o `CA-11.x` (ou a `RN`) no nome. Commits: `feat(US-11): ...` (ou `refactor`/`test`/`docs`), só locais. Branch: `feat/us-11-attendance-and-no-shows`, a partir da `main` (US-10 mergeada, PR #11).

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `CLAUDE.md` (seção Testes: use cases com fakes em memória; gateways TypeORM e fluxos HTTP em e2e contra o Postgres do compose; nome do teste cita o `CA`; Swagger checado por `test/api-docs.e2e-spec.ts`), `package.json` (Jest, sem threshold), `test/jest-e2e.json`, AD-006, lições L-007 e L-008.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Entidades e value objects de domínio | unit | Todos os ramos; fronteira `now == startsAt`; fronteira de 90 dias; limite 1 | `src/domain/**/*.spec.ts` | `npm test` |
| Use cases | unit (fakes dos ports) | 1:1 com os ATD; cada erro com classe e mensagem; nada gravado nos caminhos de erro | `src/usecases/**/*.spec.ts` | `npm test` |
| Filtro de erros HTTP | unit | Cada erro novo mapeado com status e mensagem | `src/infrastructure/http/*.spec.ts` | `npm test` |
| Schemas Zod de borda | unit | Aceita o válido e recusa cada entrada inválida do ATD-17 com a mensagem exata (L-008) | `src/interface-adapters/controllers/schemas/*.spec.ts` | `npm test` |
| Migration e constraints | e2e (Postgres do compose) | Novos status aceitos, status desconhecido recusado, exclusão vale para `attended`/`no_show`, coluna nova | `test/database/*-schema.e2e-spec.ts` | `npm run test:e2e` |
| Gateways TypeORM | e2e (Postgres do compose) | Cada método novo: caminho feliz, isolamento com outra barbearia, fronteiras de reset | `test/database/typeorm-*.e2e-spec.ts` | `npm run test:e2e` |
| Controller, módulo e rotina | e2e | Rota: happy path por perfil, cada erro (400/401/403/404/422), efeito na agenda e no motor, Swagger; rotina registrada com cron e fuso | `test/*.e2e-spec.ts` | `npm run test:e2e` |
| Ports, presenter | none | build gate only (presenter coberto pelo e2e da rota) | - | build gate only |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | Tasks só com testes unitários | `npm test` |
| Full | Tasks com e2e | `npm test && npm run test:e2e` |
| Build | Fim de fase, tasks sem teste e antes do Verifier | `npm run lint && npm run build && npm test && npm run test:e2e` |

---

## Execution Plan

Fases em sequência; tasks em ordem dentro da fase. As setas mostram só dependências reais dentro da fase.

### Phase 1: Domínio e schema

```
T1
```

```
T2
```

```
T3
```

### Phase 2: Persistência

```
T4 -> T5
```

```
T6
```

### Phase 3: Use cases

```
T7
```

```
T8
```

### Phase 4: Borda HTTP

```
T9
```

```
T10 -> T11
```

### Phase 5: Rotina diária

```
T12
```

---

## Task Breakdown

### T1: Transição de status no Appointment

**What**: `AppointmentStatus` ganha `attended` e `no_show`; `AttendanceStatus`; `Appointment.markAttendance(status, now)` devolve o agendamento com o novo status e lança `AppointmentNotStartedError` ("O agendamento ainda não começou.") quando `now < startsAt`.
**Where**: `src/domain/entities/appointment.ts` (e o erro novo `src/domain/errors/appointment-not-started.error.ts`)
**Depends on**: None
**Reuses**: padrão `restore` da entidade
**Requirement**: ATD-01, ATD-02, ATD-05, ATD-13, ATD-14

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `confirmed → attended`, `confirmed → no_show`, `no_show → attended`, `attended → no_show` com `now >= startsAt`; o mesmo status devolve o mesmo status
- [ ] `now == startsAt` aceita; `now = startsAt − 1 ms` lança `AppointmentNotStartedError` com a mensagem exata
- [ ] Gate check passes: `npm test`

**Tests**: unit
**Gate**: quick

**Status**: ⏳ Pending

**Commit**: `feat(US-11): add attendance transition to appointments`

---

### T2: Bloqueio e prazo de reset no domínio

**What**: `BookingRules.blocksSelfBooking(noShowCount)` (`>= noShowLimit`) e `noShowResetCutoff(now)` com `NO_SHOW_RESET_DAYS = 90`.
**Where**: `src/domain/value-objects/booking-rules.ts` (e o novo `src/domain/value-objects/no-show-reset.ts`)
**Depends on**: None
**Reuses**: `BookingRules`
**Requirement**: ATD-08, ATD-09, ATD-10, ATD-23, ATD-24

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Limite 2: 1 → `false`, 2 → `true`, 3 → `true`; limite 1: 1 → `true`, 0 → `false`
- [ ] `noShowResetCutoff(2026-12-30T12:00Z)` = `2026-10-01T12:00Z`
- [ ] Gate check passes: `npm test`

**Tests**: unit
**Gate**: quick

**Status**: ⏳ Pending

**Commit**: `feat(US-11): add no-show block and reset rules`

---

### T3: Migration de atendimento

**What**: Migration `AddAttendance` (status check com três status, exclusão para os três status, `clients.no_show_reset_at`, índice parcial de `no_show`) e entidades ORM (`AppointmentEntity`, `ClientEntity`) alinhadas.
**Where**: `src/infrastructure/database/migrations/<ts>-AddAttendance.ts` (e as entidades `appointment.entity.ts`, `client.entity.ts`)
**Depends on**: None
**Reuses**: migrations das US-07 e US-10
**Requirement**: ATD-04, ATD-15

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `npm run migration:generate` depois da migration não gera diferença (entidades e banco alinhados)
- [ ] e2e de schema: `attended` e `no_show` aceitos; `cancelled` recusado pelo check; `attended` sobreposto a `confirmed` do mesmo barbeiro recusado (`23P01`); `no_show_reset_at` aceita nulo
- [ ] `migration:revert` volta ao schema anterior sem erro
- [ ] Gate check passes: `npm run lint && npm run build && npm test && npm run test:e2e`

**Tests**: e2e
**Gate**: build

**Status**: ⏳ Pending

**Commit**: `feat(US-11): add attendance statuses and no-show reset column`

---

### T4: AppointmentRepository lê e grava status

**What**: `findById` e `saveStatus` no port, no TypeORM e no fake; `listBusyPeriods` (TypeORM e fake) considera `confirmed`, `attended` e `no_show`.
**Where**: `src/infrastructure/database/repositories/typeorm-appointment.repository.ts` (e `src/usecases/ports/appointment.repository.port.ts`, `src/usecases/testing/in-memory-appointment.repository.ts`)
**Depends on**: None
**Reuses**: repositório da US-07
**Requirement**: ATD-01, ATD-04, ATD-18

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] e2e do repositório: `findById` devolve o agendamento com serviços; id de outra barbearia → `null`; `saveStatus` grava o status e não toca outra barbearia
- [ ] `listBusyPeriods` devolve agendamentos `attended` e `no_show`
- [ ] Gate check passes: `npm test && npm run test:e2e`

**Tests**: e2e
**Gate**: full

**Status**: ⏳ Pending

**Commit**: `feat(US-11): read and save appointment status`

---

### T5: NoShowLedger

**What**: Port `NoShowLedger` (`countFor`, `resetExpired`), implementação TypeORM e fake em memória sobre o `InMemoryAppointmentRepository`.
**Where**: `src/infrastructure/database/repositories/typeorm-no-show-ledger.ts` (e `src/usecases/ports/no-show-ledger.port.ts`, `src/usecases/testing/in-memory-no-show-ledger.ts`)
**Depends on**: T4
**Reuses**: fake de agendamentos
**Requirement**: ATD-07, ATD-12, ATD-13, ATD-14, ATD-15, ATD-23, ATD-24, ATD-25

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] e2e: `countFor` conta só `no_show` do cliente na barbearia, ignora `attended`/`confirmed`, outro cliente e outra barbearia, e ignora faltas com `starts_at <= no_show_reset_at`
- [ ] e2e: `resetExpired` zera (grava `no_show_reset_at`) quem tem a falta contada mais recente em `cutoff` exato e antes dele; mantém quem tem uma falta depois do `cutoff`; não toca outra barbearia; segunda execução devolve 0 e não muda nada
- [ ] Gate check passes: `npm test && npm run test:e2e`

**Tests**: e2e
**Gate**: full

**Status**: ⏳ Pending

**Commit**: `feat(US-11): count and reset no-shows per client`

---

### T6: Listar ids de barbearias

**What**: `BarbershopRepository.listIds()` no port, TypeORM e fake (AD-009).
**Where**: `src/infrastructure/database/repositories/typeorm-barbershop.repository.ts` (e o port e `src/usecases/testing/in-memory-barbershop.repository.ts`)
**Depends on**: None
**Reuses**: repositório da US-01
**Requirement**: ATD-27

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] e2e: com duas barbearias, devolve os dois ids
- [ ] Gate check passes: `npm test && npm run test:e2e`

**Tests**: e2e
**Gate**: full

**Status**: ⏳ Pending

**Commit**: `feat(US-11): list barbershop ids for scheduled jobs`

---

### T7: MarkAttendanceUseCase

**What**: Use case que busca o agendamento (404), confere o perfil (403), aplica a transição (422), grava se mudou e devolve o item da agenda e o resumo do cliente (`noShowCount`, `selfBookingBlocked`).
**Where**: `src/usecases/mark-attendance/mark-attendance.use-case.ts` (e o erro novo `src/domain/errors/appointment-not-found.error.ts`)
**Depends on**: None
**Reuses**: `BarberAccessPolicy`, `ScheduleQuery.findById`, fakes em memória
**Requirement**: ATD-01, ATD-02, ATD-05 a ATD-10, ATD-12 a ATD-16, ATD-18 a ATD-20

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Um teste por ATD listado, citando o `CA-11.x`/RN no nome (CA-11.1, CA-11.2, CA-11.4)
- [ ] CA-11.2: limite 2, 1 falta + nova falta → `noShowCount: 2`, `selfBookingBlocked: true`; limite trocado para 3 → `false`
- [ ] CA-11.4: `no_show → attended` com 2 faltas e limite 2 → `noShowCount: 1`, `selfBookingBlocked: false`
- [ ] Caminhos de erro (404, 403, 422) não alteram status nem contador
- [ ] Gate check passes: `npm test`

**Tests**: unit
**Gate**: quick

**Status**: ⏳ Pending

**Commit**: `feat(US-11): mark appointments as attended or no-show`

---

### T8: ResetExpiredNoShowsUseCase

**What**: Use case que percorre `listIds()`, chama `resetExpired` com `noShowResetCutoff(now)` e devolve `{ clientsReset, failedBarbershops }`, seguindo após erro de uma barbearia.
**Where**: `src/usecases/reset-expired-no-shows/reset-expired-no-shows.use-case.ts`
**Depends on**: None
**Reuses**: `NoShowLedger`, `FixedClock`
**Requirement**: ATD-23, ATD-24, ATD-25, ATD-27

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] CA-11.3: agora `2026-12-30T12:00Z`; cliente A com última falta em `2026-10-01T12:00Z` bloqueado → zerado e desbloqueado; cliente B com `2026-10-02T12:00Z` mantém
- [ ] Segunda execução: `clientsReset: 0`, contadores iguais
- [ ] Falha na primeira barbearia não impede a segunda; `failedBarbershops: 1`
- [ ] Gate check passes: `npm test`

**Tests**: unit
**Gate**: quick

**Status**: ⏳ Pending

**Commit**: `feat(US-11): reset no-show counters after 90 days`

---

### T9: Schemas de entrada da marcação

**What**: `appointmentIdParamSchema` e `markAttendanceSchema` com as mensagens do ATD-17.
**Where**: `src/interface-adapters/controllers/schemas/mark-attendance.schema.ts`
**Depends on**: None
**Reuses**: schemas da US-10
**Requirement**: ATD-17

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Aceita `attended` e `no_show`; recusa `confirmed`, `cancelled`, ausente e não string com "Informe o status: attended ou no_show."
- [ ] Recusa id que não é UUID com "Informe um id de agendamento válido."
- [ ] Gate check passes: `npm test`

**Tests**: unit
**Gate**: quick

**Status**: ⏳ Pending

**Commit**: `feat(US-11): validate attendance payload`

---

### T10: Mapear os erros novos no filtro

**What**: `AppointmentNotFoundError` → `404` e `AppointmentNotStartedError` → `422` no `DomainErrorFilter`.
**Where**: `src/infrastructure/http/domain-error.filter.ts`
**Depends on**: None
**Reuses**: mapa de status existente
**Requirement**: ATD-02, ATD-18

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Teste do filtro: cada erro novo com o status e a mensagem exata
- [ ] Gate check passes: `npm test`

**Tests**: unit
**Gate**: quick

**Status**: ⏳ Pending

**Commit**: `feat(US-11): map attendance errors to http status`

---

### T11: Rota PATCH /appointments/{id}/status

**What**: Rota no `AppointmentsController`, presenter `attendance.presenter.ts`, enum de status do `schedule.presenter.ts` ampliado, módulo `attendance.module.ts` registrando o use case e o ledger, Swagger completo e e2e.
**Where**: `src/interface-adapters/controllers/appointments.controller.ts` (e `src/interface-adapters/presenters/attendance.presenter.ts`, `src/interface-adapters/presenters/schedule.presenter.ts`, `src/infrastructure/modules/attendance.module.ts`, `test/attendance.e2e-spec.ts`)
**Depends on**: T10
**Reuses**: `SchedulePresenter`, padrão do `manual-booking.e2e-spec.ts`
**Requirement**: ATD-01 a ATD-12, ATD-17 a ATD-22

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] e2e CA-11.1: marcar após o início → `200` com `appointment.status` novo; antes do início → `422` com a mensagem; a agenda do dia mostra `attended`/`no_show`
- [ ] e2e CA-11.2: 1 falta + limite 2 + nova falta → `client.noShowCount: 2`, `selfBookingBlocked: true`
- [ ] e2e CA-11.4: correção `no_show → attended` → contador −1
- [ ] e2e: motor não oferece o horário de um agendamento `no_show`; agendamento manual para cliente bloqueado → `201`; sem cliente → `client: null`
- [ ] e2e: `400` com cada mensagem, `401`, `403` (Barbeiro em outro), `404` (outra barbearia)
- [ ] `test/api-docs.e2e-spec.ts` passa com a rota nova
- [ ] Gate check passes: `npm test && npm run test:e2e`

**Tests**: e2e
**Gate**: full

**Status**: ⏳ Pending

**Commit**: `feat(US-11): expose attendance route`

---

### T12: Rotina diária de reset

**What**: `@nestjs/schedule@6`, `ScheduleModule.forRoot()` no `app.module.ts` (com alias), `NoShowResetJob` com `@Cron('0 3 * * *', { name: 'no-show-reset', timeZone: 'America/Sao_Paulo' })` chamando o use case e logando o resultado, registrado no `attendance.module.ts`.
**Where**: `src/infrastructure/jobs/no-show-reset.job.ts` (e `src/app.module.ts`, `src/infrastructure/modules/attendance.module.ts`, `package.json`, `test/no-show-reset.e2e-spec.ts`)
**Depends on**: None
**Reuses**: `ResetExpiredNoShowsUseCase`
**Requirement**: ATD-23, ATD-26, ATD-27

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] e2e: o `SchedulerRegistry` tem o job `no-show-reset` com `0 3 * * *` e fuso `America/Sao_Paulo`
- [ ] e2e CA-11.3: com `FixedClock`, rodar o job zera no banco o cliente com falta de 90 dias e mantém o de 89
- [ ] Log da execução sem telefone nem nome
- [ ] Gate check passes: `npm run lint && npm run build && npm test && npm run test:e2e`

**Tests**: e2e
**Gate**: build

**Status**: ⏳ Pending

**Commit**: `feat(US-11): schedule the daily no-show reset`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5

Phase 1:  T1
          T2
          T3
Phase 2:  T4 ------→ T5
          T6
Phase 3:  T7
          T8
Phase 4:  T9
          T10 -----→ T11
Phase 5:  T12
```

Execução estritamente sequencial, na ordem dos números. 12 tasks → dois lotes: Fases 1 e 2 (6 tasks) e Fases 3 a 5 (6 tasks).

---

## Validação pré-aprovação

### Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | — | ✅ |
| T2 | None | — | ✅ |
| T3 | None | — | ✅ |
| T4 | None | — | ✅ |
| T5 | T4 | T4 → T5 | ✅ |
| T6 | None | — | ✅ |
| T7 | None (fases 1–2 antes) | — | ✅ |
| T8 | None (fases 1–2 antes) | — | ✅ |
| T9 | None | — | ✅ |
| T10 | None | — | ✅ |
| T11 | T10 | T10 → T11 | ✅ |
| T12 | None (fases 1–4 antes) | — | ✅ |

### Test Co-location Validation

| Task | Code Layer | Matrix Requires | Task Says | Status |
| ---- | ---------- | --------------- | --------- | ------ |
| T1 | Entidade de domínio | unit | unit | ✅ |
| T2 | Value object | unit | unit | ✅ |
| T3 | Migration e constraints | e2e | e2e | ✅ |
| T4 | Gateway TypeORM + fake | e2e | e2e | ✅ |
| T5 | Gateway TypeORM + fake | e2e | e2e | ✅ |
| T6 | Gateway TypeORM + fake | e2e | e2e | ✅ |
| T7 | Use case | unit | unit | ✅ |
| T8 | Use case | unit | unit | ✅ |
| T9 | Schema Zod | unit | unit | ✅ |
| T10 | Filtro de erros | unit | unit | ✅ |
| T11 | Controller + módulo + presenter | e2e | e2e | ✅ |
| T12 | Rotina + módulo | e2e | e2e | ✅ |
