# US-10 Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/us-10-agendamento-manual/design.md`
**Status**: Draft

Toda task cita US-10 e os `AGM`/`RN` que implementa. Testes citam o `CA-10.x` (ou a `RN`) no nome. Commits: `feat(US-10): ...` (ou `refactor`/`test`/`docs`), só locais. Branch: `feat/us-10-manual-booking`, a partir da `main` (US-09 mergeada, PR #10).

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `CLAUDE.md` (seção Testes: use cases com fakes em memória; gateways TypeORM e fluxos HTTP em e2e contra o Postgres do compose; nome do teste cita o `CA`; Swagger checado por `test/api-docs.e2e-spec.ts`), `package.json` (Jest, sem threshold), `test/jest-e2e.json`, AD-006.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Entidades de domínio | unit | Todos os ramos; fronteiras do nome (1/2/80/81 caracteres depois do trim); `clientId` nulo e preenchido | `src/domain/**/*.spec.ts` | `npm test` |
| Use cases | unit (fakes dos ports) | 1:1 com os AGM; cada erro com classe e mensagem; nada gravado (agendamento e cliente) nos caminhos de erro; retry único após `ClientPhoneTakenError` | `src/usecases/**/*.spec.ts` | `npm test` |
| Filtro de erros HTTP | unit | Cada erro novo mapeado com status e mensagem | `src/infrastructure/http/*.spec.ts` | `npm test` |
| Schemas Zod de borda | unit | Aceita o válido e recusa cada formato inválido de AGM-16/AGM-25 com a mensagem exata | `src/interface-adapters/controllers/schemas/*.spec.ts` | `npm test` |
| Gateways TypeORM | e2e (Postgres do compose) | Cada método novo: caminho feliz, isolamento com dados de outra barbearia, rollback e erros de constraint | `test/database/typeorm-*.e2e-spec.ts` | `npm run test:e2e` |
| Controller + módulo | e2e | Duas rotas: happy path por perfil, cada erro (400/401/403/404/409/422), efeito na agenda e no motor, corrida, Swagger | `test/*.e2e-spec.ts` | `npm run test:e2e` |
| Ports, presenter, PRD | none | build gate only (presenter coberto pelo e2e das rotas) | - | build gate only |

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

### Phase 1: Domínio e erros

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
T7 -> T8
```

```
T9
```

### Phase 4: HTTP e documentação

```
T10 -> T11 -> T13
T12 -> T13
```

```
T14
```

---

## Task Breakdown

### T1: Entidade Client

**What**: Entidade `Client` (`create`/`restore`) com nome sem espaços nas pontas de 2 a 80 caracteres e telefone vindo do `PhoneNumber` (E.164).
**Where**: `src/domain/entities/client.ts`
**Depends on**: None
**Reuses**: padrão `create`/`restore` de `BarberBlock`; `PhoneNumber`; `InvalidValueError`
**Requirement**: AGM-05, AGM-16

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `create` com nome `'  João  '` e telefone `PhoneNumber.create('11987654321')` → nome `'João'`, telefone `'+5511987654321'`
- [x] Nome com 2 e 80 caracteres aceito; com 1 ou 81 (depois do trim) → `InvalidValueError('Informe o nome do cliente, com 2 a 80 caracteres.')`
- [x] `restore` devolve os mesmos valores
- [x] Gate check passes: `npm test`

**Tests**: unit
**Gate**: quick

**Status**: ✅ Done

**Commit**: `feat(US-10): add client entity`

---

### T2: Appointment carrega o cliente

**What**: `AppointmentProps.clientId: string | null`, parâmetro `clientId` em `Appointment.book` e getter; os chamadores atuais passam `null`.
**Where**: `src/domain/entities/appointment.ts` (e os chamadores `src/usecases/book-appointment/book-appointment.use-case.ts`, `src/usecases/testing/in-memory-appointment.repository.ts`, `test/database/typeorm-appointment.repository.e2e-spec.ts`)
**Depends on**: None
**Reuses**: entidade da US-07
**Requirement**: AGM-01, AGM-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `book` com `clientId: 'c1'` → `clientId === 'c1'`; com `null` → `null`
- [x] `restore` preserva `clientId`
- [x] Motor, fake e e2e do repositório compilam e seguem verdes sem mudança de comportamento (AGD-20)
- [x] Gate check passes: `npm run lint && npm run build && npm test && npm run test:e2e`

**Tests**: unit
**Gate**: build

**Status**: ✅ Done

**Commit**: `feat(US-10): link appointments to clients`

---

### T3: Mapear as recusas do motor no filtro de erros

**What**: `DomainErrorFilter` responde `409` para `AppointmentConflictError`; `422` para `OutsideOpeningHoursError`, `OutsideWorkingHoursError`, `BarberUnavailableError` e `SlotInPastError`; `400` para `ServiceNotPerformedError`.
**Where**: `src/infrastructure/http/domain-error.filter.ts`
**Depends on**: None
**Reuses**: mapa `STATUS_BY_ERROR` existente
**Requirement**: AGM-10, AGM-11, AGM-12, AGM-13, AGM-14

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Cada um dos seis erros responde o status acima com `{ message }` igual à mensagem do erro
- [x] `InvalidValueError` segue respondendo `500` genérico (teste existente intacto)
- [x] Gate check passes: `npm test`

**Tests**: unit
**Gate**: quick

**Status**: ✅ Done

**Commit**: `feat(US-10): map availability engine refusals to http statuses`

---

### T4: ClientRepository — busca por telefone

**What**: Port `ClientRepository` (`findByPhone`, `CLIENT_REPOSITORY`), implementação TypeORM e fake em memória com a unique de telefone por barbearia.
**Where**: `src/infrastructure/database/repositories/typeorm-client.repository.ts` (e o port `src/usecases/ports/client.repository.port.ts`, o fake `src/usecases/testing/in-memory-client.repository.ts`, o teste `test/database/typeorm-client.repository.e2e-spec.ts`)
**Depends on**: None
**Reuses**: `ClientEntity`; padrão de `TypeOrmBarberBlockRepository`
**Requirement**: AGM-06, AGM-07, AGM-27

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `findByPhone` devolve o `Client` restaurado pelo telefone E.164 na barbearia
- [x] Mesmo telefone em outra barbearia → `null`
- [x] Telefone inexistente → `null`
- [x] Gate check passes: `npm test && npm run test:e2e`

**Tests**: e2e
**Gate**: full

**Status**: ✅ Done

**Commit**: `feat(US-10): add client repository`

---

### T5: AppointmentRepository grava o cliente novo na mesma transação

**What**: `create(appointment, newClient?)` insere o cliente novo e o agendamento com `client_id` numa transação; `ClientPhoneTakenError` (novo, RN-08) quando a unique de telefone recusa; fake em memória com a mesma regra e um gancho para simular a corrida.
**Where**: `src/infrastructure/database/repositories/typeorm-appointment.repository.ts` (e o port `src/usecases/ports/appointment.repository.port.ts`, o erro `src/domain/errors/client-phone-taken.error.ts`, o fake `src/usecases/testing/in-memory-appointment.repository.ts`, o teste `test/database/typeorm-appointment.repository.e2e-spec.ts`)
**Depends on**: T4
**Reuses**: `isOverlapViolation`; `InMemoryClientRepository` (T4)
**Requirement**: AGM-05, AGM-08, AGM-09, AGM-27

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Com cliente novo: `clients` e `appointments.client_id` gravados
- [x] Com cliente existente (`newClient` ausente) e `clientId` preenchido: só o agendamento é gravado
- [x] Sobreposição (RN-07) com cliente novo → `AppointmentConflictError('RN-07')` e nenhuma linha em `clients`
- [x] Telefone já gravado na barbearia → `ClientPhoneTakenError` e nenhuma linha em `appointments`
- [x] Sem cliente (motor da US-07) segue gravando `client_id` nulo
- [x] Gate check passes: `npm test && npm run test:e2e`

**Tests**: e2e
**Gate**: full

**Status**: ✅ Done

**Commit**: `feat(US-10): save new clients with their appointment`

---

### T6: ScheduleQuery.findById

**What**: `findById(barbershopId, appointmentId)` devolve o `ScheduleEntry` do agendamento (mesmo SELECT e mapeamento da agenda), no port, no gateway TypeORM e no fake em memória.
**Where**: `src/infrastructure/database/repositories/typeorm-schedule.query.ts` (e o port `src/usecases/ports/schedule.query.port.ts`, o fake `src/usecases/testing/in-memory-schedule.query.ts`, o teste `test/database/typeorm-schedule.query.e2e-spec.ts`)
**Depends on**: None
**Reuses**: SELECT base de `listStartingIn`
**Requirement**: AGM-01, AGM-03, AGM-27

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Devolve barbeiro, cliente, serviços na ordem agendada, início, fim, status e origem
- [x] Agendamento sem cliente → `client: null`
- [x] Id de outra barbearia ou inexistente → `null`
- [x] Gate check passes: `npm test && npm run test:e2e`

**Tests**: e2e
**Gate**: full

**Status**: ✅ Done

**Commit**: `feat(US-10): find a schedule entry by id`

---

### T7: Motor aceita o cliente do agendamento

**What**: `BookAppointmentInput.client?: { client: Client; isNew: boolean }`; o motor grava `clientId` e passa o cliente novo ao `create`.
**Where**: `src/usecases/book-appointment/book-appointment.use-case.ts`
**Depends on**: None
**Reuses**: fakes de T4 e T5
**Requirement**: AGM-01, AGM-04, AGM-05, AGM-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Com cliente novo: agendamento com `clientId` do cliente e cliente gravado no fake
- [x] Com cliente existente (`isNew: false`): nenhum cliente novo gravado
- [x] Sem cliente: `clientId` nulo (AGD-20); testes da US-07 intactos
- [x] CA-10.3: origem `manual` a 30 min, com antecedência mínima de 60 → gravado
- [x] Gate check passes: `npm test`

**Tests**: unit
**Gate**: quick

**Status**: ✅ Done

**Commit**: `feat(US-10): let the engine book an appointment for a client`

---

### T8: CreateManualAppointmentUseCase

**What**: Use case do agendamento manual: perfil (`targetBarber`), cliente pelo telefone (reusa e mantém o nome, ou cria), motor com origem `manual`, uma nova tentativa após `ClientPhoneTakenError`, resposta por `ScheduleQuery.findById`.
**Where**: `src/usecases/create-manual-appointment/create-manual-appointment.use-case.ts`
**Depends on**: T7
**Reuses**: `BarberAccessPolicy`, `BookAppointmentUseCase`, `ScheduleQuery`, fakes
**Requirement**: AGM-01, AGM-02, AGM-04, AGM-05, AGM-06, AGM-07, AGM-08, AGM-09, AGM-10, AGM-12, AGM-13, AGM-14, AGM-15, AGM-17, AGM-18, AGM-19, AGM-27

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] CA-10.1: Dono agenda para Ana → `ScheduleEntry` com origem `manual`, `confirmed`, fim = início + soma das durações, serviços na ordem
- [x] CA-10.2: telefone novo cria o cliente; telefone existente em outro formato liga ao mesmo cliente e mantém o nome; telefone de outra barbearia cria cliente novo
- [x] CA-10.2: recusa do motor (conflito, RN-05, passado) não deixa cliente novo gravado
- [x] CA-10.2: `ClientPhoneTakenError` na primeira tentativa → segunda tentativa liga ao cliente já gravado; nova falha propaga
- [x] CA-10.4: cada recusa do motor chega com a classe e a mensagem da spec
- [x] CA-10.5: Barbeiro para si → gravado; para outro ou sem ficha → `ScheduleAccessDeniedError`, sem agendamento e sem cliente
- [x] Gate check passes: `npm test`

**Tests**: unit
**Gate**: quick

**Status**: ✅ Done

**Commit**: `feat(US-10): add create manual appointment use case`

---

### T9: ListPanelSlotsUseCase

**What**: Consulta de horários do painel: perfil (`readScope`), motor com origem `manual`, nomes dos barbeiros, data e fuso da barbearia.
**Where**: `src/usecases/list-panel-slots/list-panel-slots.use-case.ts`
**Depends on**: None
**Reuses**: `ListAvailableSlotsUseCase`, `BarberAccessPolicy`, fakes de `scheduling-fixtures`
**Requirement**: AGM-20, AGM-21, AGM-22, AGM-23, AGM-26, AGM-27

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] CA-10.1: Dono com `barberId` → inícios do barbeiro, com `barber { id, name }`, `date` e `timezone`
- [x] CA-10.1: Dono sem `barberId` → cada início uma vez, com o primeiro barbeiro livre por nome
- [x] CA-10.3: com antecedência mínima de 60, o primeiro início é o próximo a partir de agora
- [x] CA-10.5: Barbeiro sem `barberId` → só os próprios; com outro → `ScheduleAccessDeniedError`; sem ficha → `ScheduleAccessDeniedError`
- [x] Barbeiro inexistente ou inativo, serviço inexistente, barbeiro que não faz o serviço → erro do motor
- [x] Gate check passes: `npm test`

**Tests**: unit
**Gate**: quick

**Status**: ✅ Done

**Commit**: `feat(US-10): add panel available slots use case`

---

### T10: Schema da criação de agendamento

**What**: Campo compartilhado `serviceIds` (array e versão separada por vírgula) e schema do body da criação, com as mensagens exatas de AGM-16.
**Where**: `src/interface-adapters/controllers/schemas/create-appointment.schema.ts` (e o campo `src/interface-adapters/controllers/schemas/service-ids.field.ts`, os testes `*.spec.ts` ao lado)
**Depends on**: None
**Reuses**: `PhoneNumber.isValid`; mensagens de `barber-block.schema.ts`
**Requirement**: AGM-16

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Body válido vira `{ barberId, serviceIds, startsAt: Date, client: { name aparado, phone } }`; `startsAt` com `-03:00` vira o instante UTC certo
- [x] Cada inválido de AGM-16 gera exatamente a mensagem listada: `barberId` não UUID, `serviceIds` vazio/11 itens/item não UUID/repetido, `startsAt` sem fuso ou com segundos, nome com 1/81 caracteres, telefone inválido
- [x] Gate check passes: `npm test`

**Tests**: unit
**Gate**: quick

**Status**: ✅ Done

**Commit**: `feat(US-10): add create appointment schema`

---

### T11: Schema da consulta de horários

**What**: Schema da query `date`, `serviceIds` (separado por vírgula) e `barberId` opcional.
**Where**: `src/interface-adapters/controllers/schemas/available-slots.query.schema.ts`
**Depends on**: T10
**Reuses**: `DATE_MESSAGE` e regra de data de `schedule.query.schema.ts`; campo de T10
**Requirement**: AGM-25

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `serviceIds=a,b` vira array na ordem; `barberId` ausente fica ausente
- [x] Data inexistente (`2026-02-30`) ou fora de `AAAA-MM-DD` → "Informe uma data válida no formato AAAA-MM-DD."
- [x] `serviceIds` e `barberId` inválidos → mensagens de AGM-16
- [x] Gate check passes: `npm test`

**Tests**: unit
**Gate**: quick

**Status**: ✅ Done

**Commit**: `feat(US-10): add available slots query schema`

---

### T12: Presenter dos horários livres

**What**: `availableSlotsResponseSchema` (com `.meta`) e `AvailableSlotsPresenter.toResponse` (instantes em ISO 8601 UTC).
**Where**: `src/interface-adapters/presenters/available-slots.presenter.ts`
**Depends on**: None
**Reuses**: `localDate` e `instant` de `schedule.presenter.ts`
**Requirement**: AGM-20, AGM-29

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Schema exporta o tipo com `z.infer`, sem DTO paralelo
- [x] Gate check passes: `npm run lint && npm run build && npm test && npm run test:e2e`

**Tests**: none
**Gate**: build

**Status**: ✅ Done

**Commit**: `feat(US-10): add available slots presenter`

---

### T13: AppointmentsController, módulo e e2e das rotas

**What**: `POST /appointments` e `GET /appointments/available-slots` com Swagger completo, `ManualBookingModule` registrado no `AppModule` e o e2e das duas rotas.
**Where**: `src/interface-adapters/controllers/appointments.controller.ts` (e o módulo `src/infrastructure/modules/manual-booking.module.ts`, o registro em `src/app.module.ts`, o teste `test/manual-booking.e2e-spec.ts`)
**Depends on**: T11, T12
**Reuses**: `SchedulePresenter.toAppointment`, `ApiZodResponse`, `ApiErrorResponse`, arranjo de `barber-blocks.module.ts`
**Requirement**: AGM-01, AGM-03, AGM-04, AGM-06, AGM-08, AGM-09, AGM-10, AGM-11, AGM-12, AGM-15, AGM-16, AGM-18, AGM-20, AGM-22, AGM-24, AGM-25, AGM-27, AGM-28, AGM-29

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] CA-10.1: Dono agenda → `201` no formato da agenda; `GET /appointments` do dia mostra o agendamento com cliente e origem `manual`
- [x] CA-10.2: segundo agendamento com o mesmo telefone em outro formato e outro nome → mesmo `client.id`, nome original; recusa por conflito com telefone novo → nenhuma linha nova em `clients`
- [x] CA-10.2: dois `POST` em paralelo, horários livres diferentes, mesmo telefone novo → dois `201`, um cliente
- [x] CA-10.3: horário a menos que a antecedência mínima → `201`; a consulta devolve o início a partir de agora
- [x] CA-10.4: sobreposição → `409`; dois `POST` sobrepostos em paralelo → um `201` e um `409`; fora do funcionamento e sobre bloqueio → `422` com a mensagem; serviço inexistente → `404`
- [x] CA-10.5: Barbeiro para outro → `403`, nada gravado; Barbeiro consulta outro → `403`
- [x] Início devolvido pela consulta → `POST` com ele → `201` (AGM-24)
- [x] `400` com mensagem para body e query inválidos; sem token → `401` nas duas rotas
- [x] Dados de outra barbearia não aparecem nem são usados (RN-26)
- [x] `test/api-docs.e2e-spec.ts` passa com as rotas novas
- [x] Gate check passes: `npm test && npm run test:e2e`

**Tests**: e2e
**Gate**: full

**Status**: ✅ Done

**Commit**: `feat(US-10): expose manual booking routes`

---

### T14: PRD — forçar horário como questão em aberto

**What**: Registrar na seção 19 do PRD a exceção "Dono pode forçar no painel com aviso" do RN-05, sem história que a implemente.
**Where**: `docs/PRD.md`
**Depends on**: None
**Reuses**: formato da lista da seção 19
**Requirement**: AGM-30

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Item novo na seção 19 cita RN-05 e diz que nenhuma história implementa o forçar
- [x] Gate check passes: `npm run lint && npm run build && npm test && npm run test:e2e`

**Tests**: none
**Gate**: build

**Status**: ✅ Done

**Commit**: `docs(US-10): record the rn-05 override as an open question`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4

Phase 1:  T1
          T2
          T3
Phase 2:  T4 ------→ T5
          T6
Phase 3:  T7 ------→ T8
          T9
Phase 4:  T10 -----→ T11 -----→ T13
          T12 -----→ T13
          T14
```

Execução estritamente sequencial, na ordem dos números. 14 tasks → dois lotes: Fases 1 e 2 (6 tasks) e Fases 3 e 4 (8 tasks).

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: Client | 1 entidade | ✅ Granular |
| T2: Appointment.clientId | 1 campo + chamadores que quebrariam o build | ⚠️ OK (coeso) |
| T3: Filtro | 1 mapa | ✅ Granular |
| T4: ClientRepository | 1 port + implementação + fake | ⚠️ OK (coeso, padrão da US-09) |
| T5: create com cliente | 1 método + erro que ele lança + fake | ⚠️ OK (coeso) |
| T6: findById | 1 método | ✅ Granular |
| T7: Motor com cliente | 1 use case | ✅ Granular |
| T8: CreateManualAppointment | 1 use case | ✅ Granular |
| T9: ListPanelSlots | 1 use case | ✅ Granular |
| T10: Schema da criação | 1 schema + campo compartilhado | ⚠️ OK (coeso) |
| T11: Schema da consulta | 1 schema | ✅ Granular |
| T12: Presenter | 1 presenter | ✅ Granular |
| T13: Controller + módulo | 1 controller com a ligação que o torna testável | ⚠️ OK (merge backward para ter e2e) |
| T14: PRD | 1 doc | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | — | ✅ Match |
| T2 | None | — | ✅ Match |
| T3 | None | — | ✅ Match |
| T4 | None | — | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |
| T6 | None | — | ✅ Match |
| T7 | None | — | ✅ Match |
| T8 | T7 | T7 → T8 | ✅ Match |
| T9 | None | — | ✅ Match |
| T10 | None | — | ✅ Match |
| T11 | T10 | T10 → T11 | ✅ Match |
| T12 | None | — | ✅ Match |
| T13 | T11, T12 | T11 → T13, T12 → T13 | ✅ Match |
| T14 | None | — | ✅ Match |

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | Entidade de domínio | unit | unit | ✅ OK |
| T2 | Entidade de domínio (+ chamadores) | unit | unit | ✅ OK |
| T3 | Filtro de erros HTTP | unit | unit | ✅ OK |
| T4 | Gateway TypeORM (+ port, fake) | e2e | e2e | ✅ OK |
| T5 | Gateway TypeORM (+ port, erro, fake) | e2e | e2e | ✅ OK |
| T6 | Gateway TypeORM (+ port, fake) | e2e | e2e | ✅ OK |
| T7 | Use case | unit | unit | ✅ OK |
| T8 | Use case | unit | unit | ✅ OK |
| T9 | Use case | unit | unit | ✅ OK |
| T10 | Schema Zod | unit | unit | ✅ OK |
| T11 | Schema Zod | unit | unit | ✅ OK |
| T12 | Presenter | none | none | ✅ OK |
| T13 | Controller + módulo | e2e | e2e | ✅ OK |
| T14 | PRD | none | none | ✅ OK |
