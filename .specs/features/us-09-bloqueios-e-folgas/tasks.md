# US-09 Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/us-09-bloqueios-e-folgas/design.md`
**Status**: Approved

Toda task cita US-09 e os `BLQ`/`RN` que implementa. Testes citam o `CA-09.x` (ou a `RN`) no nome. Commits: `feat(US-09): ...` (ou `refactor`/`test`/`docs`), só locais. Branch: `feat/us-09-blocks-and-days-off`, a partir de `feat/us-08-schedule-view` (PR #9 aberto).

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `CLAUDE.md` (seção Testes: use cases com fakes em memória; gateways TypeORM e fluxos HTTP em e2e contra o Postgres do compose; nome do teste cita o `CA`; Swagger checado por `test/api-docs.e2e-spec.ts`), `package.json` (Jest, sem threshold), `test/jest-e2e.json`, AD-006.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Entidades e value objects de domínio | unit | Todos os ramos; 1:1 com os BLQ do componente; fronteiras (`24:00`, meia-noite local, motivo com 120/121 caracteres) | `src/domain/**/*.spec.ts` | `npm test` |
| Use cases e política compartilhada | unit (fakes dos ports) | 1:1 com os BLQ; cada erro com classe e mensagem; nada gravado/apagado nos caminhos de erro | `src/usecases/**/*.spec.ts` | `npm test` |
| Schemas Zod de borda | unit | Aceita o válido e recusa cada formato inválido de BLQ-19 com a mensagem exata | `src/interface-adapters/controllers/schemas/*.spec.ts` | `npm test` |
| Migration / constraints | e2e (Postgres do compose) | Linhas antigas viram `block`; `CHECK` do `kind`; motivo nulo aceito | `test/database/*-schema.e2e-spec.ts` | `npm run test:e2e` |
| Gateways TypeORM | e2e | Cada método novo: ordem, fronteiras (encostar), isolamento com dados de outra barbearia | `test/database/typeorm-*.e2e-spec.ts` | `npm run test:e2e` |
| Controller + módulo | e2e | Três rotas: happy path por perfil, cada erro (400/401/403/404/409), efeito no motor, Swagger | `test/*.e2e-spec.ts` | `npm run test:e2e` |
| Entidades ORM, ports, presenter, PRD | none | build gate only (presenter coberto pelo e2e das rotas) | - | build gate only |

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

```
T2
```

### Phase 2: Persistência

```
T3 -> T4
```

```
T5
```

### Phase 3: Use cases

```
T6 -> T7
T6 -> T8
T6 -> T9
```

### Phase 4: HTTP e documentação

```
T10 -> T12
T11 -> T12
```

```
T13
```

---

## Task Breakdown

### T1: Value object BlockPeriod

**What**: `BlockPeriod.resolve(input, timezone)` converte `day_off` (data) e `block` (data, início, fim `HH:mm`, fim aceita `24:00`) em `UtcPeriod` no fuso da barbearia.
**Where**: `src/domain/value-objects/block-period.ts`
**Depends on**: None
**Reuses**: `SchedulePeriod` (dia inteiro), `BarbershopTimezone.toUtc`, `TimeOfDay`
**Requirement**: BLQ-02, BLQ-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `block` `2026-10-01` `12:00`–`13:00` em São Paulo → `[2026-10-01T15:00Z, 2026-10-01T16:00Z)`
- [x] `block` com fim `24:00` → termina em `2026-10-02T03:00Z`
- [x] `day_off` `2026-10-01` → `[2026-10-01T03:00Z, 2026-10-02T03:00Z)`
- [x] Fim igual ou antes do início → `InvalidValueError`
- [x] Gate check passes: `npm test`

**Status**: ✅ Done

**Tests**: unit
**Gate**: quick

**Commit**: `feat(US-09): add block period value object`

---

### T2: Entidade BarberBlock e erro de bloqueio não encontrado

**What**: Entidade `BarberBlock` (`create`/`restore`, tipo `block`/`day_off`, motivo normalizado) e `BarberBlockNotFoundError` mapeado para `404` no `DomainErrorFilter`.
**Where**: `src/domain/entities/barber-block.ts` (e `src/domain/errors/barber-block-not-found.error.ts`, o mapeamento em `src/infrastructure/http/domain-error.filter.ts`)
**Depends on**: None
**Reuses**: padrão de `Appointment.book`/`restore`; `InvalidValueError`
**Requirement**: BLQ-24, BLQ-27

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Motivo com espaços nas pontas é aparado; vazio ou só espaços vira `null`; ausente vira `null`
- [x] Motivo com 120 caracteres aceito; com 121 → `InvalidValueError`
- [x] Período com fim não depois do início → `InvalidValueError`
- [x] `DomainErrorFilter` responde `404 { message: 'Bloqueio não encontrado.' }` para `BarberBlockNotFoundError`
- [x] Gate check passes: `npm test`

**Status**: ✅ Done

**Tests**: unit
**Gate**: quick

**Commit**: `feat(US-09): add barber block entity`

---

### T3: Migration AddBarberBlockDetails e entidade ORM

**What**: Colunas `kind` (com `CHECK`, `DEFAULT` só para as linhas antigas) e `reason varchar(120)`, índice `(barbershop_id, starts_at)`, entidade ORM atualizada e os `INSERT` dos e2e existentes passando `kind`.
**Where**: `src/infrastructure/database/migrations/<timestamp>-AddBarberBlockDetails.ts` (e `src/infrastructure/database/entities/barber-block.entity.ts`, o teste `test/database/barber-blocks-schema.e2e-spec.ts`, os `INSERT` em `test/database/appointments-schema.e2e-spec.ts` e `test/database/typeorm-barber-block.repository.e2e-spec.ts`)
**Depends on**: None
**Reuses**: padrão das migrations geradas (`npm run migration:generate`)
**Requirement**: BLQ-27, BLQ-25

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Linha inserida antes da migration fica `kind = 'block'`, `reason = NULL` (teste roda `migration:revert` até antes e reaplica, ou insere pela `up` isolada)
- [x] `kind = 'holiday'` recusado por `barber_blocks_kind_check`; `INSERT` sem `kind` recusado (sem `DEFAULT`)
- [x] `reason` com 121 caracteres recusado pelo banco
- [x] `migration:revert` desfaz sem erro
- [x] e2e existentes seguem verdes
- [x] Gate check passes: `npm test && npm run test:e2e`

**Status**: ✅ Done

**Tests**: e2e
**Gate**: full

**Commit**: `feat(US-09): add kind and reason to barber blocks`

---

### T4: BarberBlockRepository — escrita e listagem

**What**: Port ampliado (`create`, `findById`, `delete`, `listStartingIn` com `BarberBlockView`), implementação TypeORM e fake em memória.
**Where**: `src/infrastructure/database/repositories/typeorm-barber-block.repository.ts` (e o port `src/usecases/ports/barber-block.repository.port.ts`, o fake `src/usecases/testing/in-memory-barber-block.repository.ts`, o teste `test/database/typeorm-barber-block.repository.e2e-spec.ts`)
**Depends on**: T3
**Reuses**: `listBusyPeriods` existente; ordem por `lower(name)` do `TypeOrmScheduleQuery`
**Requirement**: BLQ-18, BLQ-21, BLQ-24, BLQ-25, BLQ-27

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `create` grava tipo e motivo; `findById` devolve o `BarberBlock` restaurado; de outra barbearia → `null`
- [x] `delete` apaga só na barbearia informada; id de outra barbearia não apaga
- [x] `listStartingIn` inclui o que começa em `start`, exclui o que começa em `end`, filtra por barbeiro quando informado, ordena por início, nome sem diferenciar maiúsculas e id, e não traz linhas de outra barbearia
- [x] Bloqueio gravado por `create` aparece em `listBusyPeriods` (motor)
- [x] Gate check passes: `npm test && npm run test:e2e`

**Status**: ✅ Done

**Tests**: e2e
**Gate**: full

**Commit**: `feat(US-09): add barber block write and list queries`

---

### T5: ScheduleQuery.listOverlapping

**What**: Método que devolve os agendamentos `confirmed` de um barbeiro sobrepostos a um período, no formato `ScheduleEntry`, com implementação TypeORM e fake.
**Where**: `src/infrastructure/database/repositories/typeorm-schedule.query.ts` (e o port `src/usecases/ports/schedule.query.port.ts`, o fake `src/usecases/testing/in-memory-schedule.query.ts`, o teste `test/database/typeorm-schedule.query.e2e-spec.ts`)
**Depends on**: None
**Reuses**: montagem de barbeiro, cliente e serviços de `listStartingIn` (extraída para método privado)
**Requirement**: BLQ-12, BLQ-15, BLQ-16, BLQ-25

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Agendamento que começa antes e termina dentro do período entra; o que atravessa a meia-noite entra na folga do dia em que começa
- [x] Agendamento que só encosta (fim = início do período, ou início = fim) fica de fora (BLQ-16)
- [x] Agendamentos de outro barbeiro e de outra barbearia ficam de fora
- [x] Ordem por início; serviços na ordem gravada; cliente ou `null`
- [x] Testes de `listStartingIn` seguem verdes
- [x] Gate check passes: `npm test && npm run test:e2e`

**Status**: ✅ Done

**Tests**: e2e
**Gate**: full

**Commit**: `feat(US-09): add overlapping appointments query`

---

### T6: BarberAccessPolicy e refatoração da agenda

**What**: Política compartilhada (`readScope`, `targetBarber`, `assertCanManage`) com a regra de perfil da seção 5; `ListScheduleUseCase` passa a usá-la sem mudar comportamento.
**Where**: `src/usecases/shared/barber-access-policy.ts` (e `src/usecases/list-schedule/list-schedule.use-case.ts`, `src/infrastructure/modules/schedule.module.ts`)
**Depends on**: None
**Reuses**: `ownBarberId`/`filteredBarberId` de `list-schedule.use-case.ts`
**Requirement**: BLQ-06, BLQ-07, BLQ-20, BLQ-23

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `readScope`: Dono sem filtro → `null`; Dono com barbeiro da barbearia → id; inexistente → `BarberNotFoundError`; Barbeiro → o próprio; outro → `ScheduleAccessDeniedError`; sem ficha → `undefined`
- [x] `targetBarber`: Dono → barbeiro da barbearia (inclusive inativo) ou `BarberNotFoundError`; Barbeiro → só o próprio; outro ou sem ficha → `ScheduleAccessDeniedError`
- [x] `assertCanManage`: Dono sempre passa; Barbeiro só no próprio barbeiro; outro ou sem ficha → `ScheduleAccessDeniedError`
- [x] Testes da US-08 (`list-schedule.use-case.spec.ts`, `test/schedule.e2e-spec.ts`) passam sem alteração
- [x] Gate check passes: `npm test`

**Status**: ✅ Done

**Tests**: unit
**Gate**: build

**Commit**: `refactor(US-09): extract barber access policy from schedule`

---

### T7: CreateBarberBlockUseCase

**What**: Use case de criação com resolução de barbeiro, conversão de período, checagem de conflito e confirmação; erro `BarberBlockConflictError` com a lista.
**Where**: `src/usecases/create-barber-block/create-barber-block.use-case.ts` (e `src/usecases/create-barber-block/barber-block-conflict.error.ts`)
**Depends on**: T6
**Reuses**: `BarberAccessPolicy`, `BlockPeriod`, `BarberBlock`, fakes `InMemoryBarberBlockRepository`, `InMemoryScheduleQuery`, `FixedClock`, `SequentialIdGenerator`
**Requirement**: BLQ-01, BLQ-02, BLQ-05, BLQ-06, BLQ-07, BLQ-08, BLQ-11, BLQ-12, BLQ-13, BLQ-14, BLQ-15, BLQ-17

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Barbeiro cria `block` no próprio barbeiro → gravado com tipo, período UTC e motivo; retorno traz barbeiro (id e nome) e `affectedAppointments: []` (CA-09.1)
- [x] Dono cria para qualquer barbeiro; Barbeiro em outro ou sem ficha → `ScheduleAccessDeniedError` sem gravar; barbeiro inexistente → `BarberNotFoundError` sem gravar
- [x] Dono e Barbeiro criam `day_off` → período do dia inteiro (CA-09.2)
- [x] Com agendamentos sobrepostos e sem confirmação → `BarberBlockConflictError('O bloqueio conflita com agendamentos existentes.')` com a lista e nada gravado (CA-09.3)
- [x] Com confirmação → gravado, `affectedAppointments` com a lista, fake de agendamentos intacto (CA-09.3)
- [x] O port de conflito recebe o barbeiro e o período UTC do bloqueio
- [x] Gate check passes: `npm test`

**Status**: ✅ Done

**Tests**: unit
**Gate**: quick

**Commit**: `feat(US-09): add create barber block use case`

---

### T8: ListBarberBlocksUseCase

**What**: Use case de listagem por `view`/`date` com a regra de perfil da agenda.
**Where**: `src/usecases/list-barber-blocks/list-barber-blocks.use-case.ts`
**Depends on**: T6
**Reuses**: `SchedulePeriod`, `BarberAccessPolicy.readScope`, `InMemoryBarberBlockRepository`
**Requirement**: BLQ-18, BLQ-20, BLQ-25

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Dono sem filtro → todos; com `barberId` → só dele; devolve período, datas locais e fuso
- [x] Barbeiro → só os próprios; com `barberId` de outro → `ScheduleAccessDeniedError`; sem ficha → lista vazia sem consultar
- [x] O port recebe o `barbershopId` da sessão e o intervalo UTC do `SchedulePeriod`
- [x] Gate check passes: `npm test`

**Status**: ✅ Done

**Tests**: unit
**Gate**: quick

**Commit**: `feat(US-09): add list barber blocks use case`

---

### T9: RemoveBarberBlockUseCase

**What**: Use case de remoção com a regra de perfil e `BarberBlockNotFoundError`.
**Where**: `src/usecases/remove-barber-block/remove-barber-block.use-case.ts`
**Depends on**: T6
**Reuses**: `BarberAccessPolicy.assertCanManage`, `InMemoryBarberBlockRepository`
**Requirement**: BLQ-21, BLQ-23, BLQ-24

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Dono remove bloqueio de qualquer barbeiro da barbearia
- [x] Barbeiro remove o próprio; o de outro → `ScheduleAccessDeniedError` e nada apagado
- [x] Bloqueio inexistente ou de outra barbearia → `BarberBlockNotFoundError` e nada apagado
- [x] Gate check passes: `npm test`

**Status**: ✅ Done

**Tests**: unit
**Gate**: quick

**Commit**: `feat(US-09): add remove barber block use case`

---

### T10: Schemas Zod de bloqueio

**What**: `createBarberBlockSchema` (discriminado por `kind`, `blockTimeField` com `24:00` só no fim, fim > início, motivo `trim().max(120)`, `confirmConflicts` opcional) e `blockIdParamsSchema`.
**Where**: `src/interface-adapters/controllers/schemas/barber-block.schema.ts` (e `src/interface-adapters/controllers/schemas/block-id.params.schema.ts`)
**Depends on**: None
**Reuses**: `isCalendarDate`/mensagem de data de `schedule.query.schema.ts`, mensagem de `barberId` da US-05
**Requirement**: BLQ-19

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Cada entrada inválida de BLQ-19 recusada com a mensagem exata da spec
- [x] `start = 24:00` recusado; `end = 24:00` aceito; `end = start` recusado
- [x] `day_off` com `start`/`end` aceito e sem esses campos na saída
- [x] Motivo com 120 caracteres aceito; 121 recusado
- [x] Gate check passes: `npm test`

**Status**: ✅ Done

**Tests**: unit
**Gate**: quick

**Commit**: `feat(US-09): add barber block request schemas`

---

### T11: BarberBlockPresenter

**What**: Schemas Zod de resposta (bloqueio, criação com `affectedAppointments`, conflito `409` com `appointments`, listagem) e mapeadores; `schedule.presenter.ts` passa a exportar o item de agendamento e `toAppointment`.
**Where**: `src/interface-adapters/presenters/barber-block.presenter.ts` (e `src/interface-adapters/presenters/schedule.presenter.ts`)
**Depends on**: None
**Reuses**: `scheduleResponseSchema`, helpers `instant`/`localDate` do presenter da agenda
**Requirement**: BLQ-01, BLQ-12, BLQ-13, BLQ-15, BLQ-18, BLQ-28

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Schemas com `.meta()` (descrição e exemplo) para o Swagger; tipos via `z.infer`
- [x] `SchedulePresenter.toResponse` usa `toAppointment`, e o e2e da agenda (US-08) segue verde
- [x] Gate check passes: `npm run lint && npm run build && npm test && npm run test:e2e`

**Status**: ✅ Done

**Tests**: none
**Gate**: build

**Commit**: `feat(US-09): add barber block presenter`

---

### T12: BarberBlocksController e módulo

**What**: Rotas `POST /blocks`, `GET /blocks`, `DELETE /blocks/:blockId` com Swagger e `BarberBlocksModule` registrado no `AppModule`.
**Where**: `src/interface-adapters/controllers/barber-blocks.controller.ts` (e `src/infrastructure/modules/barber-blocks.module.ts`, exports em `scheduling.module.ts` e `schedule.module.ts`, `src/app.module.ts`, o teste `test/barber-blocks.e2e-spec.ts`)
**Depends on**: T10, T11
**Reuses**: `ScheduleController` (padrão de rota e Swagger), `ApiZodResponse`, `ApiErrorResponse`, setup de `test/schedule.e2e-spec.ts` e `test/scheduling.e2e-spec.ts`
**Requirement**: BLQ-01, BLQ-03, BLQ-04, BLQ-05, BLQ-06, BLQ-07, BLQ-08, BLQ-09, BLQ-10, BLQ-11, BLQ-12, BLQ-13, BLQ-14, BLQ-15, BLQ-16, BLQ-17, BLQ-18, BLQ-19, BLQ-20, BLQ-21, BLQ-22, BLQ-23, BLQ-24, BLQ-25, BLQ-26, BLQ-28

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Independent Tests das cinco histórias da spec passam em e2e, com os nomes citando `CA-09.1`, `CA-09.2`, `CA-09.3`, `RN-26` ou a seção 5
- [x] Efeito no motor (BLQ-03, 04, 09, 10, 22) conferido com `ListAvailableSlotsUseCase`/`BookAppointmentUseCase` via `app.get()`
- [x] `409` traz `message` e `appointments` no formato da agenda; nenhuma linha em `barber_blocks`; agendamento segue `confirmed` no mesmo horário
- [x] `401` sem token nas três rotas; `400` com uma entrada inválida por rota
- [x] `test/api-docs.e2e-spec.ts` passa; as três rotas têm resumo com US-09, sucesso e erros (`400`, `401`, `403`, `404`, `409` na criação) e perfis Dono e Barbeiro
- [x] Gate check passes: `npm run lint && npm run build && npm test && npm run test:e2e`

**Status**: ✅ Done

**Tests**: e2e
**Gate**: build

**Commit**: `feat(US-09): expose blocks and days off routes`

---

### T13: PRD — RF-26 com listar e remover

**What**: RF-26 e referências da US-09 no PRD passam a citar listar e remover bloqueios e folgas (decisão da discussão).
**Where**: `docs/PRD.md`
**Depends on**: None
**Reuses**: NONE
**Requirement**: BLQ-18, BLQ-21

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] RF-26 cita criar, listar e remover bloqueios e folgas
- [ ] Nenhuma outra regra do PRD muda
- [ ] Gate check passes: `npm run lint && npm run build && npm test && npm run test:e2e`

**Tests**: none
**Gate**: build

**Commit**: `docs(US-09): cover listing and removing blocks in RF-26`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4

Phase 1:  T1
          T2
Phase 2:  T3 ------→ T4
          T5
Phase 3:  T6 ------→ T7
          T6 ------→ T8
          T6 ------→ T9
Phase 4:  T10 -----→ T12
          T11 -----→ T12
          T13
```

Execução estritamente sequencial, uma task por vez, na ordem numérica.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: BlockPeriod | 1 value object | ✅ Granular |
| T2: BarberBlock + erro 404 | 1 entidade + erro + 1 linha no filtro | ⚠️ Coeso |
| T3: Migration + entidade ORM | 1 migration + entidade que ela reflete + ajuste de `INSERT` | ⚠️ Coeso |
| T4: Repositório de bloqueios | 1 port + implementação + fake | ⚠️ Coeso |
| T5: listOverlapping | 1 método (port + implementação + fake) | ✅ Granular |
| T6: BarberAccessPolicy | 1 classe + troca no consumidor | ⚠️ Coeso |
| T7: CreateBarberBlock | 1 use case + seu erro | ✅ Granular |
| T8: ListBarberBlocks | 1 use case | ✅ Granular |
| T9: RemoveBarberBlock | 1 use case | ✅ Granular |
| T10: Schemas | 2 schemas de borda | ⚠️ Coeso |
| T11: Presenter | 1 presenter + export do item da agenda | ⚠️ Coeso |
| T12: Controller + módulo | 1 controller com a ligação que o torna testável (merge backward) | ⚠️ Coeso |
| T13: PRD | 1 arquivo | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | nenhuma seta | ✅ Match |
| T2 | None | nenhuma seta | ✅ Match |
| T3 | None | nenhuma seta | ✅ Match |
| T4 | T3 | T3 -> T4 | ✅ Match |
| T5 | None | nenhuma seta | ✅ Match |
| T6 | None | nenhuma seta | ✅ Match |
| T7 | T6 | T6 -> T7 | ✅ Match |
| T8 | T6 | T6 -> T8 | ✅ Match |
| T9 | T6 | T6 -> T9 | ✅ Match |
| T10 | None | nenhuma seta | ✅ Match |
| T11 | None | T11 -> T12 (sem entrada) | ✅ Match |
| T12 | T10, T11 | T10 -> T12, T11 -> T12 | ✅ Match |
| T13 | None | nenhuma seta | ✅ Match |

Dependências entre fases (T4 usa T2; T7 usa T1, T2, T4, T5; T12 usa T7–T9) são garantidas pela ordem das fases.

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | Value object de domínio | unit | unit | ✅ OK |
| T2 | Entidade de domínio + filtro | unit | unit | ✅ OK |
| T3 | Migration / constraints | e2e | e2e | ✅ OK |
| T4 | Gateway TypeORM | e2e | e2e | ✅ OK |
| T5 | Gateway TypeORM | e2e | e2e | ✅ OK |
| T6 | Política compartilhada (use case) | unit | unit | ✅ OK |
| T7 | Use case | unit | unit | ✅ OK |
| T8 | Use case | unit | unit | ✅ OK |
| T9 | Use case | unit | unit | ✅ OK |
| T10 | Schemas Zod de borda | unit | unit | ✅ OK |
| T11 | Presenter | none | none | ✅ OK |
| T12 | Controller + módulo | e2e | e2e | ✅ OK |
| T13 | PRD | none | none | ✅ OK |
