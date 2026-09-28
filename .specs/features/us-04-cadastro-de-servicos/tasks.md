# US-04 Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/us-04-cadastro-de-servicos/design.md`
**Status**: In Progress

Toda task cita US-04, RF-33 e, quando couber, RN-26. Commits: `feat(US-04): ...` (ou `test` quando couber), só locais.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `CLAUDE.md` (seção Testes: use cases com fakes em memória; gateways TypeORM e HTTP em e2e contra o Postgres do compose; nome do teste cita o `CA`), `package.json` (config Jest, sem threshold de cobertura), `test/jest-e2e.json`, AD-006 (e2e em série com truncate). Lições candidatas aplicadas: L-001 (contagem relativa após ação negada), L-002 (linha exatamente no limite em cada `CHECK`), L-003 (entradas simétricas testadas separadamente).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Domain value objects / entities | unit | Todos os ramos; 1:1 com os SVC; limites exatos (0, 1.000.000, 5, 480) e um passo além | `src/domain/**/*.spec.ts` | `npm test` |
| Domain error classes | none | build gate only | - | build gate only |
| Use cases | unit (fakes dos ports) | 1:1 com os ACs; nada gravado quando recusa | `src/usecases/**/*.spec.ts` | `npm test` |
| Schemas Zod da borda | unit | Cada regra de formato do SVC-12, SVC-19, SVC-20, SVC-21 e os edge cases de payload | `src/interface-adapters/**/*.spec.ts` | `npm test` |
| Exception filter | unit | Cada erro novo com status e mensagem | `src/infrastructure/http/*.spec.ts` | `npm test` |
| Repositórios TypeORM, migration | e2e (Postgres do compose) | Leitura/gravação por tenant, transação, `CHECK`, índice único | `test/database/*.e2e-spec.ts` | `npm run test:e2e` |
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
T1 -> T3
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
```

### Phase 4: HTTP

```
T11 -> T12
T12 -> T13
T12 -> T14
```

---

## Task Breakdown

### T1: Value object ServicePrice

**What**: `ServicePrice` com `create`, `isValid` e `cents`, aceitando só inteiros de 0 a 1.000.000.
**Where**: `src/domain/value-objects/service-price.ts`
**Depends on**: None
**Reuses**: padrão `create`/`isValid` de `src/domain/value-objects/time-of-day.ts`
**Requirement**: SVC-19, SVC-21, SVC-22

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] 0 e 1.000.000 aceitos; -1, 1.000.001, 45.5, `NaN` e `Infinity` recusados (`InvalidValueError` / `isValid` falso)
- [x] `cents` de `create(4500)` é 4500
- [x] Gate check passes: `npm test`
- [x] Test count: ~8 tests novos passam (no silent deletions)

**Tests**: unit
**Gate**: quick
**Status**: ✅ Done
**Commit**: `feat(US-04): add ServicePrice value object`

---

### T2: Value object ServiceDuration

**What**: `ServiceDuration` com `create`, `isValid` e `minutes`, aceitando só inteiros de 5 a 480 em múltiplos de 5.
**Where**: `src/domain/value-objects/service-duration.ts`
**Depends on**: None
**Reuses**: padrão `create`/`isValid` de `src/domain/value-objects/time-of-day.ts`
**Requirement**: SVC-20, SVC-21, SVC-22

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] 5 e 480 aceitos; 0, 4, 485, 7, 30.5 e `NaN` recusados (`InvalidValueError` / `isValid` falso)
- [x] `minutes` de `create(30)` é 30
- [x] Gate check passes: `npm test`
- [x] Test count: ~9 tests novos passam (no silent deletions)

**Tests**: unit
**Gate**: quick
**Status**: ✅ Done
**Commit**: `feat(US-04): add ServiceDuration value object`

---

### T3: Entidade BarbershopService e InvalidServiceAddOnError

**What**: Entidade `BarbershopService` com `create` (nasce ativa, sem adicionais), `restore`, `update`, `changeSuggestedAddOns`, `activate` e `deactivate`; erro `InvalidServiceAddOnError` (`rule = 'RF-33'`) com a mensagem no construtor.
**Where**: `src/domain/entities/barbershop-service.ts` (e `src/domain/errors/invalid-service-add-on.error.ts`)
**Depends on**: T1, T2
**Reuses**: formato `create`/`restore` de `src/domain/entities/barbershop.ts`; `InvalidOpeningHoursError` como modelo do erro
**Requirement**: SVC-01, SVC-04, SVC-07, SVC-09, SVC-10, SVC-11, SVC-13, SVC-15, SVC-16, SVC-17, SVC-22

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `create` devolve serviço com `active: true`, `suggestedAddOnIds: []` e os valores dos VOs
- [x] `update` troca nome, preço e duração e mantém `active` e adicionais
- [x] `changeSuggestedAddOns` guarda os ids na ordem; recusa com a mensagem exata: outra barbearia ("Serviço adicional não encontrado."), o próprio serviço ("Um serviço não pode ser adicional de si mesmo."), inativo ("Os serviços adicionais devem estar ativos."); na recusa a lista anterior fica igual
- [x] `deactivate` e `activate` só trocam `active`; repetidos não mudam nada
- [x] Gate check passes: `npm test`
- [x] Test count: ~10 tests novos passam (no silent deletions)

**Tests**: unit
**Gate**: build
**Status**: ✅ Done
**Commit**: `feat(US-04): add BarbershopService entity with add-on rules`

---

### T4: Tabelas services e service_add_ons

**What**: Entidades ORM `ServiceEntity` e `ServiceAddOnEntity` e migration `AddServices` com os `CHECK` de preço, duração e auto-relação, o índice único `services_name_unique` sobre `(barbershop_id, lower(name))` e as FKs.
**Where**: `src/infrastructure/database/migrations/1790562059953-AddServices.ts` (e as entidades em `src/infrastructure/database/entities/service.entity.ts`, `service-add-on.entity.ts`)
**Depends on**: None
**Reuses**: `src/infrastructure/database/entities/barbershop-opening-hours.entity.ts` (`@Check`, `@ForeignKey`); `test/database/opening-hours-schema.e2e-spec.ts`
**Requirement**: SVC-06, SVC-10, SVC-23

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] e2e `test/database/services-schema.e2e-spec.ts`: aceita preço 0 e 1.000.000, duração 5 e 480; recusa com `23514` preço -1 e 1.000.001, duração 0, 4, 485 e 7; nenhuma linha nova depois da recusa (L-001, L-002)
- [x] `Corte` e `corte` na mesma barbearia → `23505` em `services_name_unique`; o mesmo nome em outra barbearia é aceito
- [x] `service_add_ons` com `service_id = add_on_service_id` → `23514`
- [x] `migration:generate` depois do `migration:run` não gera nada (entidades e migration batem)
- [x] Gate check passes: `npm test && npm run test:e2e`

**Tests**: e2e
**Gate**: full
**Status**: ✅ Done
**Commit**: `feat(US-04): add services schema with check constraints`

---

### T5: Port ServiceRepository e implementação TypeORM

**What**: Port `ServiceRepository` (AD-001, AD-004) e `TypeOrmServiceRepository` com `listByBarbershop`, `listActiveByBarbershop`, `findById`, `findByIds`, `create` e `save`; `ServiceNameAlreadyExistsError` lançado na violação do índice.
**Where**: `src/infrastructure/database/repositories/typeorm-service.repository.ts` (e o port em `src/usecases/ports/service.repository.port.ts`, o erro em `src/domain/errors/service-name-already-exists.error.ts`)
**Depends on**: T4
**Reuses**: `typeorm-barbershop.repository.ts` (transação), `email-unique-violation.ts` (detecção do `23505`)
**Requirement**: SVC-02, SVC-03, SVC-05, SVC-06, SVC-07, SVC-08, SVC-14, SVC-15, SVC-26

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] e2e `test/database/typeorm-service.repository.e2e-spec.ts`: `create` + `findById` devolvem todos os campos e os adicionais na ordem
- [x] `listByBarbershop` ordena por nome sem diferenciar maiúsculas e inclui inativos; `listActiveByBarbershop` só ativos; nenhum dos dois devolve serviço de outra barbearia
- [x] `findById` e `findByIds` com id de outra barbearia não devolvem o serviço
- [x] `save` troca campos e substitui a lista de adicionais (inclusive por vazia); desativar mantém nome, preço, duração, os adicionais do serviço e as relações em que ele é adicional
- [x] nome repetido (inclusive só maiúsculas diferentes) em `create` e `save` → `ServiceNameAlreadyExistsError` e nada muda; duas criações simultâneas com o mesmo nome → uma grava, a outra recebe o erro
- [x] `save` de um serviço da barbearia A não altera serviços de B
- [x] Gate check passes: `npm test && npm run test:e2e`

**Tests**: e2e
**Gate**: build
**Status**: ✅ Done
**Commit**: `feat(US-04): persist services and suggested add-ons`

---

### T6: CreateServiceUseCase

**What**: Use case que monta os VOs, cria o serviço, aplica os adicionais e grava; inclui o fake `InMemoryServiceRepository` e a função `applySuggestedAddOns` compartilhada com o T7.
**Where**: `src/usecases/create-service/create-service.use-case.ts` (e `src/usecases/shared/apply-suggested-add-ons.ts`, `src/usecases/testing/in-memory-service.repository.ts`)
**Depends on**: None
**Reuses**: `SequentialIdGenerator`, `FixedClock`; formato dos testes de `update-barbershop-settings.use-case.spec.ts`
**Requirement**: SVC-01, SVC-05, SVC-07, SVC-09, SVC-11, SVC-22, SVC-26

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] cria ativo com os dados enviados, na barbearia da entrada, e devolve o serviço gravado
- [ ] nome repetido → `ServiceNameAlreadyExistsError`, nada gravado
- [ ] adicional de serviço ativo da mesma barbearia é gravado; inexistente ou de outra barbearia → "Serviço adicional não encontrado."; inativo → "Os serviços adicionais devem estar ativos."; nada gravado nesses casos
- [ ] preço ou duração fora da regra → `InvalidValueError`, nada gravado
- [ ] Gate check passes: `npm test`
- [ ] Test count: ~7 tests novos passam (no silent deletions)

**Tests**: unit
**Gate**: quick
**Commit**: `feat(US-04): add create service use case`

---

### T7: UpdateServiceUseCase

**What**: Use case que busca o serviço do tenant, troca nome, preço, duração e adicionais e grava; erro `ServiceNotFoundError` (`rule = 'RN-26'`).
**Where**: `src/usecases/update-service/update-service.use-case.ts` (e `src/domain/errors/service-not-found.error.ts`)
**Depends on**: T6
**Reuses**: `applySuggestedAddOns`, `InMemoryServiceRepository`
**Requirement**: SVC-04, SVC-05, SVC-08, SVC-09, SVC-10, SVC-11, SVC-18, SVC-26

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] troca os dados, mantém `active` (inclusive um inativo continua inativo) e devolve o serviço salvo
- [ ] substitui a lista de adicionais, inclusive por vazia
- [ ] manter o mesmo nome ou mudar só maiúsculas é aceito; nome de outro serviço → `ServiceNameAlreadyExistsError`
- [ ] a própria id na lista → "Um serviço não pode ser adicional de si mesmo."; nada gravado
- [ ] serviço inexistente ou de outra barbearia → `ServiceNotFoundError`; nada gravado
- [ ] Gate check passes: `npm test`
- [ ] Test count: ~7 tests novos passam (no silent deletions)

**Tests**: unit
**Gate**: quick
**Commit**: `feat(US-04): add update service use case`

---

### T8: SetServiceActiveUseCase

**What**: Use case que ativa ou desativa um serviço do tenant, idempotente.
**Where**: `src/usecases/set-service-active/set-service-active.use-case.ts`
**Depends on**: T6
**Reuses**: `InMemoryServiceRepository`, `ServiceNotFoundError`
**Requirement**: SVC-13, SVC-15, SVC-16, SVC-17, SVC-18, SVC-26

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `active: false` marca inativo e devolve o serviço; nome, preço, duração e adicionais iguais
- [ ] `active: true` num inativo reativa
- [ ] repetir a mesma ação devolve o serviço sem mudança
- [ ] serviço inexistente ou de outra barbearia → `ServiceNotFoundError`
- [ ] Gate check passes: `npm test`
- [ ] Test count: ~5 tests novos passam (no silent deletions)

**Tests**: unit
**Gate**: quick
**Commit**: `feat(US-04): add set service active use case`

---

### T9: ListServicesUseCase

**What**: Use case que devolve todos os serviços da barbearia, ativos e inativos, por nome sem diferenciar maiúsculas.
**Where**: `src/usecases/list-services/list-services.use-case.ts`
**Depends on**: T6
**Reuses**: `InMemoryServiceRepository`
**Requirement**: SVC-02, SVC-14, SVC-26

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] devolve ativos e inativos da barbearia, em ordem de nome (`barba` antes de `Corte`), sem os de outra barbearia; lista vazia quando não há serviço
- [ ] Gate check passes: `npm test`
- [ ] Test count: ~2 tests novos passam (no silent deletions)

**Tests**: unit
**Gate**: quick
**Commit**: `feat(US-04): add list services use case`

---

### T10: ListBookableServicesUseCase

**What**: Use case que devolve só os serviços ativos da barbearia, com preço e duração; é a leitura que a agenda e o bot vão usar.
**Where**: `src/usecases/list-bookable-services/list-bookable-services.use-case.ts`
**Depends on**: T6
**Reuses**: `InMemoryServiceRepository`
**Requirement**: SVC-03, SVC-14, SVC-16, SVC-26

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] devolve só os ativos da barbearia, com `priceCents` e `durationMinutes`; um serviço desativado some; reativado volta
- [ ] não devolve serviços de outra barbearia
- [ ] Gate check passes: `npm test`
- [ ] Test count: ~3 tests novos passam (no silent deletions)

**Tests**: unit
**Gate**: build
**Commit**: `feat(US-04): add list bookable services use case`

---

### T11: Schemas Zod do serviço

**What**: Schema do corpo de criar/editar (`name`, `priceCents`, `durationMinutes`, `suggestedAddOnIds`) e schema do parâmetro `serviceId`.
**Where**: `src/interface-adapters/controllers/schemas/service.schema.ts` (e `service-id.params.schema.ts`)
**Depends on**: None
**Reuses**: `barbershop-settings.schema.ts`, `user-id.params.schema.ts`; `ServicePrice.isValid`, `ServiceDuration.isValid`
**Requirement**: SVC-12, SVC-19, SVC-20, SVC-21

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `priceCents` -1 → erro no campo `priceCents`; `durationMinutes` 0 → erro no campo `durationMinutes`
- [ ] preço 45.5 e 1.000.001; duração 4, 485, 7 e 30.5; nome com 1 e 61 caracteres após trim → erro no campo certo, cada um testado separado (L-003)
- [ ] `suggestedAddOnIds` com 6 itens, com repetido ou com item que não é uuid → erro no campo `suggestedAddOnIds`
- [ ] trim do nome; campos extras (`active`, `barbershopId`) descartados; `suggestedAddOnIds` omitido vira `[]`; preço 0 e durações 5 e 480 aceitos
- [ ] `serviceId` que não é uuid → erro no campo `serviceId`
- [ ] Gate check passes: `npm test`
- [ ] Test count: ~16 tests novos passam (no silent deletions)

**Tests**: unit
**Gate**: quick
**Commit**: `feat(US-04): add service request schemas`

---

### T12: GET e POST /settings/services

**What**: `ServicePresenter`, `ServicesController` com `GET` e `POST`, `ServicesModule` no `AppModule` e mapeamento de `ServiceNameAlreadyExistsError` (409) e `InvalidServiceAddOnError` (400) no `DomainErrorFilter`, com Swagger.
**Where**: `src/interface-adapters/controllers/services.controller.ts` (e `presenters/service.presenter.ts`, `infrastructure/modules/services.module.ts`, `app.module.ts`, `infrastructure/http/domain-error.filter.ts`)
**Depends on**: T11
**Reuses**: `barbershop-settings.controller.ts`, `barbershop-settings.module.ts`, `test/barbershop-settings.e2e-spec.ts`
**Requirement**: SVC-01, SVC-02, SVC-05, SVC-07, SVC-09, SVC-11, SVC-12, SVC-19, SVC-20, SVC-21, SVC-24, SVC-25, SVC-26

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] unit `domain-error.filter.spec.ts`: 409 e 400 com as mensagens da spec
- [ ] e2e `test/services.e2e-spec.ts`: `POST` "Corte" 4500/30 → 201 com o corpo exato e `active: true`; `GET` lista; lista vazia sem serviços; ordem por nome
- [ ] `POST` "corte" → 409 com a mensagem; `GET` não mostra serviço novo
- [ ] `POST` com adicional ativo → 201 com `suggestedAddOnIds`; `GET` devolve a relação; adicional inexistente, de outra barbearia e inativo → 400 com cada mensagem, nada gravado
- [ ] `priceCents: -1` e `durationMinutes: 0` → 400 no campo; nada gravado
- [ ] Barbeiro → 403 no `GET` e no `POST`; sem sessão → 401; `GET` de A não lista serviços de B; `barbershopId` no corpo, query e header é ignorado
- [ ] `test/api-docs.e2e-spec.ts` continua passando (summary e resposta de sucesso nas rotas novas)
- [ ] Gate check passes: `npm test && npm run test:e2e`

**Tests**: e2e
**Gate**: full
**Commit**: `feat(US-04): expose GET and POST /settings/services`

---

### T13: PUT /settings/services/:serviceId

**What**: Rota de edição no `ServicesController`, com mapeamento de `ServiceNotFoundError` (404) no `DomainErrorFilter` e Swagger.
**Where**: `src/interface-adapters/controllers/services.controller.ts` (modify; e `domain-error.filter.ts`, `services.module.ts`)
**Depends on**: T12
**Reuses**: `test/services.e2e-spec.ts`
**Requirement**: SVC-04, SVC-05, SVC-08, SVC-10, SVC-18, SVC-24, SVC-26

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] unit `domain-error.filter.spec.ts`: 404 com a mensagem da spec
- [ ] e2e: `PUT` válido → 200 com o serviço salvo e `active` mantido; `GET` confirma; mesmo `PUT` duas vezes → 200 e mesmo estado
- [ ] trocar a lista de adicionais (inclusive por `[]`) substitui a anterior
- [ ] mesmo nome com maiúsculas diferentes → 200; nome de outro serviço → 409; própria id na lista → 400 com a mensagem; nada muda nesses casos
- [ ] `serviceId` inexistente e de outra barbearia → 404 com a mensagem, nada muda; Barbeiro → 403
- [ ] Gate check passes: `npm test && npm run test:e2e`

**Tests**: e2e
**Gate**: full
**Commit**: `feat(US-04): expose PUT /settings/services/:serviceId`

---

### T14: Desativar e reativar

**What**: Rotas `POST /settings/services/:serviceId/deactivate` e `/activate` (200) no `ServicesController`, com Swagger.
**Where**: `src/interface-adapters/controllers/services.controller.ts` (modify; e `services.module.ts`)
**Depends on**: T12
**Reuses**: `test/services.e2e-spec.ts`
**Requirement**: SVC-13, SVC-14, SVC-15, SVC-16, SVC-17, SVC-18, SVC-24

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] e2e: `deactivate` → 200 com `active: false`; `GET` ainda lista com `active: false` e os mesmos nome, preço, duração e adicionais; o serviço desativado continua na lista de adicionais de quem já o tinha
- [ ] `ListBookableServicesUseCase` da app (via `app.get`) não devolve o desativado e volta a devolver depois do `activate`
- [ ] `activate` → 200 com `active: true`; repetir `deactivate`/`activate` → 200 sem mudança
- [ ] `serviceId` inexistente e de outra barbearia → 404; Barbeiro → 403; sem sessão → 401
- [ ] Gate check passes: `npm run lint && npm run build && npm test && npm run test:e2e`

**Tests**: e2e
**Gate**: build
**Commit**: `feat(US-04): expose service activate and deactivate`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4

Phase 1:  T1, T2, T3
Phase 2:  T4, T5
Phase 3:  T6, T7, T8, T9, T10
Phase 4:  T11, T12, T13, T14
```

Dentro da fase, as tasks rodam na ordem listada; as dependências reais estão no Execution Plan.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: ServicePrice | 1 VO | ✅ Granular |
| T2: ServiceDuration | 1 VO | ✅ Granular |
| T3: BarbershopService + erro | 1 entidade + erro que só ela lança | ⚠️ Coeso |
| T4: Schema services | migration + 2 entidades ORM do mesmo schema | ⚠️ Coeso (a migration sai das entidades) |
| T5: Repositório | port + implementação + erro que ela lança | ⚠️ Coeso |
| T6: CreateService | 1 use case + fake + helper que ele estreia | ⚠️ Coeso |
| T7: UpdateService | 1 use case + erro | ✅ Granular |
| T8: SetServiceActive | 1 use case | ✅ Granular |
| T9: ListServices | 1 use case | ✅ Granular |
| T10: ListBookableServices | 1 use case | ✅ Granular |
| T11: Schemas | 2 schemas da mesma rota | ⚠️ Coeso |
| T12: GET/POST | 2 endpoints + wiring que os torna testáveis | ⚠️ Coeso (merge backward: o wiring é o que permite o e2e) |
| T13: PUT | 1 endpoint | ✅ Granular |
| T14: activate/deactivate | 2 endpoints simétricos | ⚠️ Coeso |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | - | ✅ Match |
| T2 | None | - | ✅ Match |
| T3 | T1, T2 | T1 -> T3, T2 -> T3 | ✅ Match |
| T4 | None | - | ✅ Match |
| T5 | T4 | T4 -> T5 | ✅ Match |
| T6 | None | - | ✅ Match |
| T7 | T6 | T6 -> T7 | ✅ Match |
| T8 | T6 | T6 -> T8 | ✅ Match |
| T9 | T6 | T6 -> T9 | ✅ Match |
| T10 | T6 | T6 -> T10 | ✅ Match |
| T11 | None | - | ✅ Match |
| T12 | T11 | T11 -> T12 | ✅ Match |
| T13 | T12 | T12 -> T13 | ✅ Match |
| T14 | T12 | T12 -> T14 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | Domain VO | unit | unit | ✅ OK |
| T2 | Domain VO | unit | unit | ✅ OK |
| T3 | Domain entity + error | unit | unit | ✅ OK |
| T4 | Migration + entidades ORM | e2e | e2e | ✅ OK |
| T5 | Repositório TypeORM + port + erro | e2e | e2e | ✅ OK |
| T6 | Use case + fake | unit | unit | ✅ OK |
| T7 | Use case + erro | unit | unit | ✅ OK |
| T8 | Use case | unit | unit | ✅ OK |
| T9 | Use case | unit | unit | ✅ OK |
| T10 | Use case | unit | unit | ✅ OK |
| T11 | Schemas Zod | unit | unit | ✅ OK |
| T12 | Controller + presenter + módulo + filter | e2e (+ unit do filter) | e2e | ✅ OK |
| T13 | Controller + filter | e2e (+ unit do filter) | e2e | ✅ OK |
| T14 | Controller | e2e | e2e | ✅ OK |
