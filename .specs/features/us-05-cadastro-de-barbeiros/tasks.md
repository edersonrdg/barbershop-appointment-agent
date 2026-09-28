# US-05 Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/us-05-cadastro-de-barbeiros/design.md`
**Status**: In Progress

Toda task cita US-05, RF-34 e, quando couber, RN-26. Commits: `feat(US-05): ...` (ou `test` quando couber), só locais, na branch `feat/us-05-barbers`.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `CLAUDE.md` (seção Testes: use cases com fakes em memória; gateways TypeORM e HTTP em e2e contra o Postgres do compose; nome do teste cita o `CA`), `package.json` (config Jest, sem threshold de cobertura), `test/jest-e2e.json`, AD-006 (e2e em série com truncate). Lições candidatas aplicadas: L-001 (contagem relativa após ação negada), L-002 (linha exatamente no limite em cada `CHECK`), L-003 (entradas simétricas testadas separadamente), L-004 (isolamento de gravação com entidade forjada de outro tenant, incluindo filhos).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Domain value objects / entities | unit | Todos os ramos; 1:1 com os BRB; limites exatos das desigualdades | `src/domain/**/*.spec.ts` | `npm test` |
| Domain error classes | none | build gate only | - | build gate only |
| Use cases | unit (fakes dos ports) | 1:1 com os ACs; nada gravado quando recusa | `src/usecases/**/*.spec.ts` | `npm test` |
| Schemas Zod da borda | unit | Cada regra de formato do BRB-08, BRB-14 e os edge cases de payload | `src/interface-adapters/**/*.spec.ts` | `npm test` |
| Exception filter | unit | Cada erro novo com status e mensagem | `src/infrastructure/http/*.spec.ts` | `npm test` |
| Repositórios TypeORM, migration | e2e (Postgres do compose) | Leitura/gravação por tenant, transação, `CHECK`, índices únicos, FKs compostas, `SET NULL` | `test/database/*.e2e-spec.ts` | `npm run test:e2e` |
| Controllers / rotas HTTP | e2e | Cada rota: sucesso + edge cases + erros + 401/403 | `test/*.e2e-spec.ts` | `npm run test:e2e` |
| Entidades ORM, módulos Nest, ports | none | build gate only | - | build gate only |

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
T1 -> T2
T2 -> T3
```

### Phase 2: Persistência

```
T4 -> T5
```

### Phase 3: Use cases

```
T6 -> T7
T6 -> T8
T6 -> T9
T6 -> T10
T6 -> T11
```

### Phase 4: HTTP

```
T12 -> T13
T13 -> T14
T13 -> T15
```

---

## Task Breakdown

### T1: Value object DayWorkingHours e InvalidWorkingHoursError

**What**: `DayWorkingHours` com `create`, `workPeriods` e as duas mensagens do BRB-13.
**Where**: `src/domain/value-objects/day-working-hours.ts` (e `src/domain/errors/invalid-working-hours.error.ts`)
**Depends on**: None
**Reuses**: `DayOpeningHours` (formato, `LocalPeriod`), `TimeOfDay`, `WEEKDAY_LABELS`
**Requirement**: BRB-12, BRB-13

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Fim igual ou antes do início → "{Dia}: o fim da jornada deve ser depois do início."
- [x] Intervalo encostado no início, encostado no fim, com fim igual ao início, com fim antes do início, ou fora da jornada → mensagem do intervalo (cada lado testado separadamente, L-003)
- [x] Intervalo um minuto dentro de cada limite é aceito
- [x] `workPeriods` devolve 1 período sem intervalo e 2 com intervalo
- [x] Gate check passes: `npm test`

**Tests**: unit
**Gate**: quick
**Status**: ✅ Done
**Commit**: `feat(US-05): add DayWorkingHours value object`

---

### T2: Value object WeeklyWorkingHours com avisos de funcionamento

**What**: `WeeklyWorkingHours` com `create`, `forDay` e `warningsAgainst(openingHours)`.
**Where**: `src/domain/value-objects/weekly-working-hours.ts`
**Depends on**: T1
**Reuses**: `WeeklyOpeningHours`, `DayOpeningHours.openPeriods()`
**Requirement**: BRB-15, BRB-16, BRB-17

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] CA-05.3: dia de trabalho com a barbearia fechada → aviso de dia fechado
- [x] CA-05.3: começa antes da abertura / termina depois do fechamento / atravessa o intervalo da barbearia (casos separados) → aviso de trecho fora
- [x] CA-05.3: jornada idêntica à abertura/fechamento, jornada com intervalo igual ao da barbearia, dia de folga com a barbearia aberta → sem aviso
- [x] Avisos na ordem de `WEEKDAYS`, um por dia
- [x] Gate check passes: `npm test`

**Tests**: unit
**Gate**: quick
**Status**: ✅ Done
**Commit**: `feat(US-05): add WeeklyWorkingHours with opening-hours warnings`

---

### T3: Entidade Barber e erros de serviço e usuário

**What**: `Barber` com `create`, `restore`, `update`, `changeServices`, `linkUser`, `activate`, `deactivate`.
**Where**: `src/domain/entities/barber.ts` (e `src/domain/errors/invalid-barber-service.error.ts`, `invalid-barber-user.error.ts`)
**Depends on**: T2
**Reuses**: `BarbershopService`, `User`, padrão de `barbershop-service.ts`
**Requirement**: BRB-01, BRB-07, BRB-09, BRB-10, BRB-19, BRB-21, BRB-22, BRB-26, BRB-28, BRB-29, BRB-30

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Nasce ativo, sem serviços e sem usuário
- [x] `changeServices`: ordem preservada; vazio, outro tenant e inativo recusados com as mensagens do design
- [x] `linkUser`: Dono e Barbeiro do tenant aceitos; outro tenant recusado; `null` desvincula
- [x] `update` não muda `active`; `activate`/`deactivate` idempotentes e não mexem em nome, usuário, serviços e jornada
- [x] Gate check passes: `npm run lint && npm run build && npm test && npm run test:e2e`

**Tests**: unit
**Gate**: build
**Status**: ✅ Done
**Commit**: `feat(US-05): add Barber entity with service and user rules`

---

### T4: Tabelas de barbeiros com FKs compostas

**What**: Migration `AddBarbers` e entidades ORM de `barbers`, `barber_services`, `barber_working_hours`, mais `UNIQUE (id, barbershop_id)` em `services` e `users`.
**Where**: `src/infrastructure/database/migrations/<ts>-AddBarbers.ts` (e as entidades em `src/infrastructure/database/entities/barber.entity.ts`, `barber-service.entity.ts`, `barber-working-hours.entity.ts`, `service.entity.ts`, `user.entity.ts`)
**Depends on**: None
**Reuses**: migrations `AddServices` e `AddBarbershopSettings`
**Requirement**: BRB-06, BRB-11, BRB-18, BRB-24, BRB-25

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `test/database/barbers-schema.e2e-spec.ts`: `Corte`/`corte`-style nome repetido barrado (mesmo nome em outra barbearia aceito); dois barbeiros com o mesmo `user_id` barrados; usuário de outra barbearia barrado; serviço de outra barbearia barrado; barbeiro de outra barbearia em `barber_services` barrado
- [x] `CHECK` da jornada: fim igual ao início barrado; intervalo encostado em cada limite barrado; um minuto dentro aceito (L-002)
- [x] Apagar o usuário zera só `user_id` e mantém o barbeiro com `barbershop_id`, serviços e jornada
- [x] `npm run migration:generate` depois da migration não gera diferença
- [x] Gate check passes: `npm test && npm run test:e2e`

**Tests**: e2e
**Gate**: full
**Status**: ✅ Done
**Commit**: `feat(US-05): add barbers schema with tenant-scoped foreign keys`

---

### T5: Port BarberRepository e implementação TypeORM

**What**: `BarberRepository` e `TypeOrmBarberRepository`, com tradução dos índices únicos e troca de filhos só depois de casar o tenant.
**Where**: `src/infrastructure/database/repositories/typeorm-barber.repository.ts` (e o port em `src/usecases/ports/barber.repository.port.ts`, os erros `barber-name-already-exists.error.ts`, `barber-user-already-linked.error.ts`, `barber-not-found.error.ts`)
**Depends on**: T4
**Reuses**: `TypeOrmServiceRepository`
**Requirement**: BRB-02, BRB-03, BRB-05, BRB-06, BRB-12, BRB-20, BRB-23, BRB-27, BRB-34

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `test/database/typeorm-barber.repository.e2e-spec.ts`: create/find/list com serviços na ordem e os 7 dias; listas por `lower(name)`; só ativos; `findByUserId`; nome repetido → `BarberNameAlreadyExistsError`; usuário já vinculado → `BarberUserAlreadyLinkedError`; nada gravado nos dois casos
- [x] `save` com entidade forjada (id de um barbeiro de outra barbearia) → `BarberNotFoundError`, e os serviços e a jornada daquele barbeiro não mudam (L-004)
- [x] Gate check passes: `npm run lint && npm run build && npm test && npm run test:e2e`

**Tests**: e2e
**Gate**: build
**Status**: ✅ Done
**Commit**: `feat(US-05): persist barbers with services and working hours`

---

### T6: CreateBarberUseCase

**What**: Criação com jornada, serviços, usuário e avisos; fake em memória e auxiliares compartilhados.
**Where**: `src/usecases/create-barber/create-barber.use-case.ts` (e `src/usecases/shared/assign-barber-services.ts`, `assign-barber-user.ts`, `working-hours-warnings.ts`, `to-weekly-working-hours.ts`, `src/usecases/testing/in-memory-barber.repository.ts`, `barber-fixtures.ts`)
**Depends on**: None
**Reuses**: `applySuggestedAddOns`, `InMemoryServiceRepository`, `InMemoryUserRepository`, `InMemoryBarbershopRepository`
**Requirement**: BRB-01, BRB-05, BRB-07, BRB-09, BRB-10, BRB-12, BRB-13, BRB-15, BRB-16, BRB-17, BRB-19, BRB-22, BRB-23

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] CA-05.1: grava ativo com serviços e jornada e devolve `{ barber, warnings }`
- [ ] CA-05.3: avisos contra o funcionamento salvo; `[]` quando tudo dentro
- [ ] CA-05.2: vincula Dono ou Barbeiro; `null` sem vínculo
- [ ] Recusas (nome, serviço inexistente/outro tenant/inativo, usuário inexistente/outro tenant, usuário já vinculado, jornada incoerente) sem gravar nada
- [ ] Gate check passes: `npm test`

**Tests**: unit
**Gate**: quick
**Status**: Pending
**Commit**: `feat(US-05): add create barber use case`

---

### T7: UpdateBarberUseCase

**What**: Edição com substituição de nome, usuário, serviços e jornada, mantendo `active`.
**Where**: `src/usecases/update-barber/update-barber.use-case.ts`
**Depends on**: T6
**Reuses**: auxiliares de T6
**Requirement**: BRB-04, BRB-05, BRB-21, BRB-23, BRB-31

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] CA-05.1: substitui tudo, mantém `active` (inclusive inativo), devolve avisos
- [ ] CA-05.2: `userId: null` desvincula; manter o próprio usuário e o próprio nome (outra caixa) é aceito
- [ ] Barbeiro inexistente ou de outro tenant → `BarberNotFoundError`; nada muda
- [ ] Gate check passes: `npm test`

**Tests**: unit
**Gate**: quick
**Status**: Pending
**Commit**: `feat(US-05): add update barber use case`

---

### T8: SetBarberActiveUseCase

**What**: Ativar e desativar, idempotente.
**Where**: `src/usecases/set-barber-active/set-barber-active.use-case.ts`
**Depends on**: T6
**Reuses**: `SetServiceActiveUseCase`
**Requirement**: BRB-26, BRB-28, BRB-29, BRB-30, BRB-31

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Desativa e reativa; repetir não muda nada; nada além do flag muda
- [ ] Barbeiro inexistente ou de outro tenant → `BarberNotFoundError`
- [ ] Gate check passes: `npm test`

**Tests**: unit
**Gate**: quick
**Status**: Pending
**Commit**: `feat(US-05): add set barber active use case`

---

### T9: ListBarbersUseCase

**What**: Todos os barbeiros do tenant, por nome.
**Where**: `src/usecases/list-barbers/list-barbers.use-case.ts`
**Depends on**: T6
**Reuses**: `ListServicesUseCase`
**Requirement**: BRB-02, BRB-27, BRB-34

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Ativos e inativos, ordem sem diferenciar maiúsculas, sem outro tenant; lista vazia
- [ ] Gate check passes: `npm test`

**Tests**: unit
**Gate**: quick
**Status**: Pending
**Commit**: `feat(US-05): add list barbers use case`

---

### T10: ListSchedulableBarbersUseCase

**What**: Só os barbeiros ativos do tenant, com serviços e jornada.
**Where**: `src/usecases/list-schedulable-barbers/list-schedulable-barbers.use-case.ts`
**Depends on**: T6
**Reuses**: `ListBookableServicesUseCase`
**Requirement**: BRB-03, BRB-27, BRB-29

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] CA-05.1: devolve só ativos, com `serviceIds` e jornada; sem outro tenant
- [ ] Gate check passes: `npm test`

**Tests**: unit
**Gate**: quick
**Status**: Pending
**Commit**: `feat(US-05): add list schedulable barbers use case`

---

### T11: FindBarberByUserUseCase

**What**: O barbeiro vinculado a um usuário do tenant, ou `null`.
**Where**: `src/usecases/find-barber-by-user/find-barber-by-user.use-case.ts`
**Depends on**: T6
**Reuses**: port de T5
**Requirement**: BRB-20, BRB-21

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] CA-05.2: usuário vinculado → barbeiro; sem vínculo → `null`; mesmo usuário em outro tenant → `null`
- [ ] Gate check passes: `npm run lint && npm run build && npm test && npm run test:e2e`

**Tests**: unit
**Gate**: build
**Status**: Pending
**Commit**: `feat(US-05): add find barber by user use case`

---

### T12: Schemas Zod do barbeiro

**What**: `barberSchema`, `barberIdParamsSchema` e o `timeOfDayField` extraído.
**Where**: `src/interface-adapters/controllers/schemas/barber.schema.ts` (e `barber-id.params.schema.ts`, `time-of-day.field.ts`, `barbershop-settings.schema.ts`)
**Depends on**: None
**Reuses**: `service.schema.ts`, `barbershop-settings.schema.ts`
**Requirement**: BRB-08, BRB-14

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `serviceIds` vazio, com 51 itens, com repetidos, com não-uuid → erro no campo; 1 e 50 aceitos
- [ ] `workingHours` sem um dia, com horário `24:00`/`9:00`, sem `startsAt`, sem `endsAt` (separados, L-003) → erro no campo; `break` omitido vira `null`
- [ ] `userId` omitido vira `null`; não-uuid recusado; nome 2–60 após trim
- [ ] Testes do schema de funcionamento continuam passando
- [ ] Gate check passes: `npm test`

**Tests**: unit
**Gate**: quick
**Status**: Pending
**Commit**: `feat(US-05): add barber request schemas`

---

### T13: GET e POST /settings/barbers

**What**: Controller, presenter, módulo, mapeamento dos erros no filtro e as duas primeiras rotas, com Swagger.
**Where**: `src/interface-adapters/controllers/barbers.controller.ts` (e `presenters/barber.presenter.ts`, `infrastructure/modules/barbers.module.ts`, `account.module.ts`, `app.module.ts`, `infrastructure/http/domain-error.filter.ts`)
**Depends on**: T12
**Reuses**: `ServicesController`, `ServicesModule`
**Requirement**: BRB-01, BRB-02, BRB-03, BRB-05, BRB-07, BRB-08, BRB-09, BRB-10, BRB-12, BRB-13, BRB-14, BRB-15, BRB-16, BRB-17, BRB-19, BRB-20, BRB-22, BRB-23, BRB-25, BRB-32, BRB-33, BRB-34

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `test/barbers.e2e-spec.ts`: independent tests das histórias Cadastrar, Serviços, Jornada e Vínculo pelo `POST`/`GET`
- [ ] CA-05.2: remover o usuário vinculado (`DELETE /users/:id`) deixa o barbeiro com `userId: null`
- [ ] Barbeiro 403, sem sessão 401, tenant só da sessão (campos extras ignorados)
- [ ] Filtro: cada erro novo com status e mensagem (unit)
- [ ] `api-docs.e2e-spec.ts` passa com as rotas novas
- [ ] Gate check passes: `npm test && npm run test:e2e`

**Tests**: e2e
**Gate**: full
**Status**: Pending
**Commit**: `feat(US-05): expose GET and POST /settings/barbers`

---

### T14: PUT /settings/barbers/:barberId

**What**: Rota de edição, com Swagger.
**Where**: `src/interface-adapters/controllers/barbers.controller.ts` (modify)
**Depends on**: T13
**Reuses**: T13
**Requirement**: BRB-04, BRB-05, BRB-21, BRB-23, BRB-31, BRB-32, BRB-34

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Substitui tudo e devolve avisos; mantém `active`; mesmo `PUT` duas vezes → mesmo estado
- [ ] `userId: null` desvincula; 404 para barbeiro de outra barbearia e sem alterar nada; 409; 403
- [ ] Gate check passes: `npm test && npm run test:e2e`

**Tests**: e2e
**Gate**: full
**Status**: Pending
**Commit**: `feat(US-05): expose PUT /settings/barbers/:barberId`

---

### T15: Desativar e reativar barbeiro

**What**: Rotas `deactivate` e `activate`, com Swagger.
**Where**: `src/interface-adapters/controllers/barbers.controller.ts` (modify)
**Depends on**: T13
**Reuses**: rotas equivalentes de `ServicesController`
**Requirement**: BRB-26, BRB-27, BRB-28, BRB-29, BRB-30, BRB-31, BRB-32, BRB-33

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Desativa (some da leitura de disponíveis, fica no `GET`), reativa, idempotente, nada além do flag muda
- [ ] 404, 403, 401
- [ ] Gate check passes: `npm run lint && npm run build && npm test && npm run test:e2e`

**Tests**: e2e
**Gate**: build
**Status**: Pending
**Commit**: `feat(US-05): expose barber activate and deactivate`

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | none | ✅ Match |
| T2 | T1 | T1 -> T2 | ✅ Match |
| T3 | T2 | T2 -> T3 | ✅ Match |
| T4 | None | none | ✅ Match |
| T5 | T4 | T4 -> T5 | ✅ Match |
| T6 | None | none | ✅ Match |
| T7 | T6 | T6 -> T7 | ✅ Match |
| T8 | T6 | T6 -> T8 | ✅ Match |
| T9 | T6 | T6 -> T9 | ✅ Match |
| T10 | T6 | T6 -> T10 | ✅ Match |
| T11 | T6 | T6 -> T11 | ✅ Match |
| T12 | None | none | ✅ Match |
| T13 | T12 | T12 -> T13 | ✅ Match |
| T14 | T13 | T13 -> T14 | ✅ Match |
| T15 | T13 | T13 -> T15 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | Domain VO + error | unit | unit | ✅ OK |
| T2 | Domain VO | unit | unit | ✅ OK |
| T3 | Domain entity + errors | unit | unit | ✅ OK |
| T4 | Migration + ORM entities | e2e | e2e | ✅ OK |
| T5 | Repository TypeORM + port + errors | e2e | e2e | ✅ OK |
| T6 | Use case + fakes | unit | unit | ✅ OK |
| T7 | Use case | unit | unit | ✅ OK |
| T8 | Use case | unit | unit | ✅ OK |
| T9 | Use case | unit | unit | ✅ OK |
| T10 | Use case | unit | unit | ✅ OK |
| T11 | Use case | unit | unit | ✅ OK |
| T12 | Schemas Zod | unit | unit | ✅ OK |
| T13 | Controller + presenter + module + filter | e2e (+ unit do filtro) | e2e | ✅ OK |
| T14 | Controller | e2e | e2e | ✅ OK |
| T15 | Controller | e2e | e2e | ✅ OK |
