# US-09 Bloqueios e folgas: validação

## Validation: US-09 - PASS

**Data**: 2026-09-28
**Spec**: `.specs/features/us-09-bloqueios-e-folgas/spec.md`
**Diff range**: `3bbe450..HEAD` na branch `feat/us-09-blocks-and-days-off` (3bbe450 = docs de planejamento; 51e70cc..474aa06 = T1..T13, 13 commits)
**Verifier**: sub-agente independente (autor ≠ verificador)
**Veredito**: PASS. 28/28 BLQ e 6/6 casos de borda com evidência no valor definido pela spec; 13 mutantes injetados e 13 mortos; gates verdes. Dois pontos de precisão da spec ficam registrados (mensagens fora do BLQ-19), sem bloquear.

---

## Conclusão das tasks

| Task | Status | Commit |
| ---- | ------ | ------ |
| T1 BlockPeriod | ✅ Done | 51e70cc |
| T2 BarberBlock e BarberBlockNotFoundError | ✅ Done | c267182 |
| T3 Migration AddBarberBlockDetails | ✅ Done | c4a24f4 |
| T4 BarberBlockRepository escrita e listagem | ✅ Done | 8780a68 |
| T5 ScheduleQuery.listOverlapping | ✅ Done | d5143c0 |
| T6 BarberAccessPolicy | ✅ Done | 87a8843 |
| T7 CreateBarberBlockUseCase | ✅ Done | 330444a |
| T8 ListBarberBlocksUseCase | ✅ Done | 9621bff |
| T9 RemoveBarberBlockUseCase | ✅ Done | 7f7e459 |
| T10 Schemas Zod | ✅ Done | 9a86807 |
| T11 BarberBlockPresenter | ✅ Done | 2a8913a |
| T12 Controller e módulo | ✅ Done | dda4be2 |
| T13 PRD RF-26 | ✅ Done | 474aa06 |

As 13 tasks estão marcadas como feitas em `tasks.md`. Nenhuma está bloqueada ou parcial.

---

## Critérios de aceite ancorados na spec

Abreviações: `BE` = `test/barber-blocks.e2e-spec.ts`, `BP` = `src/domain/value-objects/block-period.spec.ts`, `EN` = `src/domain/entities/barber-block.spec.ts`, `CU` = `src/usecases/create-barber-block/create-barber-block.use-case.spec.ts`, `LU` = `src/usecases/list-barber-blocks/list-barber-blocks.use-case.spec.ts`, `RU` = `src/usecases/remove-barber-block/remove-barber-block.use-case.spec.ts`, `AP` = `src/usecases/shared/barber-access-policy.spec.ts`, `SS` = `src/interface-adapters/controllers/schemas/barber-block.schema.spec.ts`, `DF` = `src/infrastructure/http/domain-error.filter.spec.ts`, `MS` = `test/database/barber-blocks-schema.e2e-spec.ts`, `RE` = `test/database/typeorm-barber-block.repository.e2e-spec.ts`, `QE` = `test/database/typeorm-schedule.query.e2e-spec.ts`, `AS` = `test/database/appointments-schema.e2e-spec.ts`.

| Critério | Resultado definido na spec | `file:line` + asserção | Resultado |
| -------- | -------------------------- | ---------------------- | --------- |
| BLQ-01 Barbeiro cria `block` na própria agenda | `201` com id, barbeiro (id e nome), tipo, início e fim ISO UTC, motivo | `test/barber-blocks.e2e-spec.ts:302` `.expect(201)` e `toEqual({ block: { id: any(String), barber: { id: bruno, name: 'Bruno' }, kind: 'block', startsAt: '2026-10-01T15:00:00.000Z', endsAt: '2026-10-01T16:00:00.000Z', reason: 'Almoço' }, affectedAppointments: [] })`; linha gravada conferida em `BE:320` (`kind`, `reason`, `barbershop_id`); `CU:81` | ✅ PASS |
| BLQ-02 conversão no fuso da barbearia | `2026-10-01 12:00–13:00` São Paulo → `15:00Z–16:00Z` | `src/domain/value-objects/block-period.spec.ts:8` `toBe('2026-10-01T15:00:00.000Z')` / `toBe('2026-10-01T16:00:00.000Z')`; `BE:302` idem na resposta e no banco | ✅ PASS |
| BLQ-03 motor deixa de oferecer início que invade o bloqueio | nenhum início cujo atendimento sobrepõe `[15:00Z,16:00Z)` | `BE:333` `after` `toEqual(before.filter(fim <= 15:00Z ou início >= 16:00Z))`, `not.toContain('…T15:00…')`, `not.toContain('…T15:30…')`, mantém `14:30Z` e `16:00Z` (encostar) | ✅ PASS |
| BLQ-04 motor recusa agendamento sobreposto (RN-05) | `BarberUnavailableError` RN-05 | `BE:364` `toBeInstanceOf(BarberUnavailableError)`, `toMatchObject({ rule: 'RN-05', message: 'O barbeiro está indisponível nesse horário.' })`, nenhum agendamento gravado | ✅ PASS |
| BLQ-05 Dono cria para qualquer barbeiro | gravado como BLQ-01 | `BE:386` `toMatchObject({ barber: { id: ana, name: 'Ana' }, kind: 'block', startsAt: '…T15:00…', endsAt: '…T16:00…', reason: null })` e linha com `barber_id` `ana`; `CU:127` | ✅ PASS |
| BLQ-06 Barbeiro em outro barbeiro ou sem ficha → 403 | `403` "Acesso negado." sem gravar | `BE:399` `.expect(403, { message: 'Acesso negado.' })` + `blockRows()` `[]`; `BE:405` sem ficha idem; `CU:146`, `CU:155` `rejects.toThrow(new ScheduleAccessDeniedError())`; `AP:131`, `AP:139`. Folga de outro barbeiro usa o mesmo `targetBarber` (`AP:131`) | ✅ PASS |
| BLQ-07 barbeiro inexistente/de outra barbearia → 404 | `404` "Barbeiro não encontrado." sem gravar | `BE:411` `.expect(404, BARBER_NOT_FOUND)` para UUID aleatório e para `foreignBarber`, `blockRows()` `[]`; `CU:170` (e `overlappingCalls` `[]`) | ✅ PASS |
| BLQ-08 folga `[00:00, 00:00 seguinte)` local | `201`, `2026-10-01T03:00Z` a `2026-10-02T03:00Z` | `BE:426` `.expect(201)` e `toEqual({ block: { …, kind: 'day_off', startsAt: '2026-10-01T03:00:00.000Z', endsAt: '2026-10-02T03:00:00.000Z', reason: null }, affectedAppointments: [] })`; `BP:28`; `CU:185` | ✅ PASS |
| BLQ-09 motor sem horários no dia da folga | lista vazia | `BE:449` `expect(await slots(ana, THURSDAY)).toEqual([])` (e `BE:429` prova que antes não era vazia) | ✅ PASS |
| BLQ-10 outros barbeiros e outros dias intactos | seguem ofertados | `BE:450` `slots(bruno, THURSDAY)` `toEqual(brunoThursday)`; `BE:451` `slots(ana, FRIDAY)` `toEqual(anaFriday)`, ambos não vazios (`BE:430-431`) | ✅ PASS |
| BLQ-11 Barbeiro registra a própria folga | gravada como BLQ-08 | `BE:454` `toMatchObject({ barber: { id: bruno }, kind: 'day_off', startsAt: '2026-10-01T03:00:00.000Z', endsAt: '2026-10-02T03:00:00.000Z' })` e `slots(bruno, THURSDAY)` `[]`; `CU:210` | ✅ PASS |
| BLQ-12 conflito sem `confirmConflicts: true` → 409 | `409` com "O bloqueio conflita com agendamentos existentes." e `appointments`, sem gravar | `BE:533` `.expect(409)` e `toEqual({ message: CONFLICT_MESSAGE, appointments: [anaAppointmentBody()] })`, `blockRows()` `[]`; `BE:569` Barbeiro idem; `CU:241` mensagem exata e `savedBlocks()` `[]`; `CU:266` `confirmConflicts: false` na folga | ✅ PASS |
| BLQ-13 conflito com `confirmConflicts: true` → 201 | grava e devolve `affectedAppointments` | `BE:548` `.expect(201)`, `affectedAppointments` `toEqual([anaAppointmentBody()])`, `blockRows()` ids `[body.block.id]`; `CU:281` | ✅ PASS |
| BLQ-14 agendamentos afetados intactos | mesmo status e horário, com e sem confirmação | `BE:541` (sem confirmar) e `BE:562` (confirmado) `appointmentRow` `toEqual({ status: 'confirmed', starts_at: 13:00Z, ends_at: 13:45Z })`; `CU:300-312` | ✅ PASS |
| BLQ-15 formato da agenda US-08, por início | id, barbeiro, cliente, serviços, início, fim, status, origem; ordem crescente | `BE:522` objeto completo `{ id, barber, client: null, services: [{ id, name: 'Corte' }], startsAt, endsAt, status: 'confirmed', origin: 'manual' }` usado em `BE:536` e `BE:560`; ordem em `BE:598` `toEqual([anaAppointment, lateAppointment])`; `QE:336` `toEqual([endsInside, inside, crossesEnd])`; `QE:407` cliente, serviços em ordem, status, origem | ✅ PASS |
| BLQ-16 encostar não conflita | sem conflito | `BE:606` bloqueio 10:45 (= fim do agendamento) `affectedAppointments` `toEqual([])` e 1 linha gravada; `QE:367` os dois lados (fim = início e início = fim) `toEqual([])`; `CU:332` | ✅ PASS |
| BLQ-17 sem conflito → 201 com lista vazia | `affectedAppointments: []` | `BE:302` `affectedAppointments: []` no `toEqual`; `BE:426` idem na folga | ✅ PASS |
| BLQ-18 Dono lista por `view`/`date`/`barberId`, começa no período, ordem início/nome sem caixa/id | semana 2026-09-28 a 2026-10-04 com os bloqueios em ordem | `BE:648` `toEqual({ view: 'week', startDate: '2026-09-28', endDate: '2026-10-04', timezone: 'America/Sao_Paulo', blocks: [brunoMorning, anaLunch, anaDayOff completos] })`; `BE:688` filtro por barbeiro e por dia; `test/database/typeorm-barber-block.repository.e2e-spec.ts:295` ordem início, `bruno` minúsculo antes de `Carla`, desempate `firstId`/`secondId`, e o bloqueio que começa exatamente no fim do intervalo (`18:00Z`) fica de fora; `RE:398` filtro | ✅ PASS |
| BLQ-19 criação inválida → 400 com as mensagens | as seis mensagens exatas, sem gravar | `BE:822` `kind: 'holiday'` → `toEqual({ message: 'Dados inválidos.', errors: [{ field: 'kind', message: 'Escolha o tipo: block ou day_off.' }] })` + `blockRows()` `[]`; `BE:837` `end = start` → "O fim do bloqueio deve ser depois do início." + `[]`; `SS:58` tipo; `SS:67` "Informe um id de barbeiro válido."; `SS:76` "Informe uma data válida no formato AAAA-MM-DD." (inclui `2026-02-30` inexistente); `SS:85`/`SS:94`/`SS:100` "Informe um horário válido no formato HH:mm." (inclui `start = 24:00`); `SS:109` fim ≤ início; `SS:128` "Informe um motivo de até 120 caracteres." (121); `SS:121` 120 aceito | ✅ PASS |
| BLQ-20 Barbeiro lista só os próprios; outro → 403; sem ficha → 200 `[]` | idem | `BE:707` `toEqual([brunoMorning])`; `BE:718` `.expect(403, FORBIDDEN)`; `BE:725` `.expect(200)` e `blocks` `toEqual([])`; `LU:199`, `LU:216`, `LU:230` | ✅ PASS |
| BLQ-21 Dono remove → 204 | apaga e `204` | `BE:768` `.expect(204)`, corpo `{}`, id ausente de `blockRows()`; `RU:62` | ✅ PASS |
| BLQ-22 remoção devolve os horários | horário 12:00 volta | `BE:768` antes `not.toContain('2026-10-01T15:00:00.000Z')`, depois `toContain('2026-10-01T15:00:00.000Z')` | ✅ PASS |
| BLQ-23 Barbeiro remove de outro → 403; o próprio → 204 | `403` "Acesso negado." sem apagar; `204` no próprio | `BE:762` `.expect(403, FORBIDDEN)` e `toContain(anaLunch)`; `BE:782` `.expect(204)` e `not.toContain(brunoMorning)`; `BE:790` sem ficha → 403; `RU:81`, `RU:92` | ✅ PASS |
| BLQ-24 inexistente/de outra barbearia → 404 | `404` "Bloqueio não encontrado." sem apagar | `BE:796` `.expect(404, { message: 'Bloqueio não encontrado.' })` e `toHaveLength(3)`; `BE:802` bloqueio da barbearia B → 404 e segue gravado; `RU:108`, `RU:119`; `DF:156` mapeamento 404 | ✅ PASS |
| BLQ-25 RN-26 em leitura, conflito, gravação e remoção; banco recusa barbeiro de outra barbearia | nada cruza barbearias | leitura: `BE:741`, `RE:421` (inclusive `barberId` forjado → `[]`), `RE:243`; conflito: `QE:471`; remoção: `RE:277` `delete(barbershopB, id)` não apaga, `BE:802`; gravação: `BE:411` (404); banco: `test/database/appointments-schema.e2e-spec.ts:338` `driverError: { code: '23503', constraint: 'barber_blocks_barber_fk' }` e `count` 0 | ✅ PASS |
| BLQ-26 sem sessão → 401 nas três rotas | `401` | `BE:813` POST, GET e DELETE `.expect(401, { message: 'Sessão inválida ou expirada.' })` | ✅ PASS |
| BLQ-27 grava tipo e motivo; linhas antigas viram `block` sem motivo | `kind`/`reason` gravados; backfill `block`/`null` | `test/database/barber-blocks-schema.e2e-spec.ts:229` `down` → insert sem `kind` → `up` → `toEqual([{ kind: 'block', reason: null }])`; `MS:277` CHECK `barber_blocks_kind_check`; `MS:287` sem `DEFAULT` (`23502`); `MS:302` 121 caracteres (`22001`); `MS:249` revert; `BE:320` linha com `kind` e `reason`; `RE:204` | ✅ PASS |
| BLQ-28 Swagger das três rotas | resumo com US-09, payloads, sucesso, `400/401/403/404` e `409` na criação, perfis Dono e Barbeiro | `BE:878` para cada rota `summary` `toContain('US-09')`, `'x-roles': ['owner', 'barber']`, `description` `toContain('**Acesso:** Dono, Barbeiro.')`, chaves de `responses` exatamente `['201','400','401','403','404','409']` (POST), `['200','400','401','403','404']` (GET), `['204','400','401','403','404']` (DELETE), cada uma com descrição; schema do 409 com `['message', 'appointments']`. `test/api-docs.e2e-spec.ts` passa. Payloads saem dos schemas Zod no `ZodValidationPipe` | ✅ PASS |

**Status**: ✅ 28/28 BLQ com evidência e asserção no valor definido pela spec. ⚠️ Dois pontos de precisão fora do texto dos BLQ, abaixo.

### Pontos de precisão da spec (não bloqueiam)

1. ⚠️ **Mensagem de `blockId` inválido.** O BLQ-28 exige `400` documentado no `DELETE`, e a única fonte desse 400 é o `blockId` não UUID, mas o BLQ-19 só lista as mensagens da criação. O autor escolheu "Informe um id de bloqueio válido." (`src/interface-adapters/controllers/schemas/block-id.params.schema.ts:4`), com teste em `BE:867` e `SS:152`. A mensagem segue o padrão de "Informe um id de barbeiro válido.", mas foi decidida pelo autor e não está na spec.
2. ⚠️ **Mensagem de `confirmConflicts` inválido.** "Informe true ou false em confirmConflicts." (`src/interface-adapters/controllers/schemas/barber-block.schema.ts:13`) não aparece na spec e **não tem teste**. Não é um BLQ; fica como ponto de precisão e sugestão de teste (`confirmConflicts: 'yes'` → 400 com a mensagem).

Os dois devem entrar nas Assumptions da spec (decisão do autor registrada) ou, na próxima história, antes da implementação.

---

## Casos de borda

- [x] `end = 24:00` termina às 00:00 locais do dia seguinte: `BE:485` 17:00–24:00 → `startsAt '2026-10-01T20:00:00.000Z'`, `endsAt '2026-10-02T03:00:00.000Z'`; `BP:18`; `SS:45` aceita `24:00` no fim e `SS:85` recusa `24:00` no início.
- [x] Folga em dia fechado é gravada (`201`): `BE:475` domingo `2026-10-04` → `03:00Z` a `2026-10-05T03:00Z`.
- [x] Bloqueio igual já existente: grava o novo sem erro: `BE:495` duas criações `201` e `toHaveLength(2)`.
- [x] Folga cobre agendamento às 23:30 que passa da meia-noite → aparece no `409`: `BE:586` `appointments` ids `toEqual([anaAppointment, lateAppointment])` (late = `2026-10-02T02:30Z`–`03:15Z`); `QE:386`.
- [x] `confirmConflicts: true` sem conflito → `201` com lista vazia: `BE:616` `affectedAppointments` `toEqual([])` e 1 linha; `CU:350`.
- [x] `day_off` com `start`/`end` ignora os campos e grava o dia inteiro: `BE:454` (`start 12:00`, `end 13:00` → `03:00Z`–`03:00Z`); `SS:52` saída sem `start`/`end`, mesmo com `end: '1'` inválido.

---

## Sensor de discriminação

Scratch isolado: `git worktree add --detach <scratchpad>/wt HEAD` com `node_modules` e `.env` ligados; mutações aplicadas por script com substituição única conferida, testes rodados no worktree, arquivo restaurado depois de cada mutação. Worktree removido com `git worktree remove --force` + `git worktree prune`. `git status --porcelain` da árvore real: vazio antes e vazio depois (igual à linha de base). Nenhum `git stash`.

| # | Arquivo:linha | Mutação | Testes que mataram | Morto? |
| - | ------------- | ------- | ------------------ | ------ |
| M1 | `src/usecases/create-barber-block/create-barber-block.use-case.ts:70` | `confirmConflicts` ignorado (sempre 409) | `CU` "with confirmation it saves the block…" | ✅ Morto |
| M2 | `src/infrastructure/database/repositories/typeorm-schedule.query.ts:69` | sobreposição com `<=`/`>=` (encostar conflita) | `QE:367`, `QE:386`, `BE:606` | ✅ Morto |
| M3 | `src/infrastructure/database/repositories/typeorm-barber-block.repository.ts:100` | filtro de tenant removido de `listStartingIn` | `RE:421`, `BE:741` | ✅ Morto |
| M4 | `src/usecases/shared/barber-access-policy.ts:56` | `assertCanManage` libera Barbeiro em qualquer bloqueio | `AP` (2), `RU:81`, `RU:92` | ✅ Morto |
| M5 | `src/domain/value-objects/block-period.ts:27` | dia resolvido em UTC em vez do fuso da barbearia | `CU` (16 testes, inclusive folga) | ✅ Morto |
| M6 | `src/domain/value-objects/block-period.ts:37` | `24:00` vira 23:59 local | `BP:18` | ✅ Morto |
| M7 | `src/usecases/create-barber-block/create-barber-block.use-case.ts:63` | bloqueio gravado antes da checagem de conflito (409 grava) | `CU:241`, `CU:266` | ✅ Morto |
| M8 | `src/infrastructure/database/repositories/typeorm-barber-block.repository.ts:101` | listagem por sobreposição em vez de "começa no período" | `RE:295` | ✅ Morto |
| M9 | `src/usecases/shared/barber-access-policy.ts:46` | `targetBarber` deixa Barbeiro criar para outro | `AP:131`, `CU:146` | ✅ Morto |
| M10 | `src/infrastructure/database/repositories/typeorm-barber-block.repository.ts:85` | `delete` sem tenant | `RE:277` | ✅ Morto |
| M11 | `src/usecases/list-barber-blocks/list-barber-blocks.use-case.ts:55` | listagem ignora o escopo do Barbeiro (`null`) | `LU:164`, `LU:199` | ✅ Morto |
| M12 | `src/interface-adapters/controllers/schemas/barber-block.schema.ts:67` | schema aceita `end == start` | `SS:109` | ✅ Morto |
| M13 | `src/infrastructure/database/repositories/typeorm-barber-block.repository.ts:101` | `starts_at <= fim` (inclui o que começa no fim do período) | `RE:295` | ✅ Morto |

**Sensor depth**: P0 expandido (≥5 mutações; caminhos de permissão, RN-26 e integridade da agenda).
**Result**: 13/13 mortos.

Nota: o filtro `a.status = 'confirmed'` de `listOverlapping` não foi mutado porque hoje `appointments_status_check` só aceita `'confirmed'`; o mutante seria equivalente até a US-11 criar outros status. Quando isso acontecer, o `QE` precisa de um caso com agendamento cancelado.

---

## Qualidade de código

| Princípio | Status |
| --------- | ------ |
| Código mínimo, sem escopo extra | ✅ Sem edição de bloqueio, sem mudança no motor, sem métrica nova (spec Out of Scope respeitado) |
| Mudanças cirúrgicas | ✅ `schedule.query.schema.ts` só passou a exportar `DATE_MESSAGE` e `isCalendarDate` (2 linhas), reuso previsto em T10 ("Reuses: isCalendarDate/mensagem de data") mas o arquivo não estava em "Where" do T10. Mudança mínima e justificada |
| Segue os padrões | ⚠️ `ListScheduleUseCase` cria `new BarberAccessPolicy(barbers)` no construtor (`src/usecases/list-schedule/list-schedule.use-case.ts:36`) em vez de receber a política por DI como os três use cases novos. O design (T6) pede só que a agenda use a política sem mudar comportamento e sem alterar os testes da US-08; manter a assinatura cumpre isso. Inconsistência menor de estilo, sem efeito de comportamento: a política não é um port, e a regra fica numa cópia só |
| Regra de dependência (boundaries) | ✅ `npm run lint:check` sem erros; `domain/` sem imports de framework; `BarberBlockConflictError` fica em `usecases/` por depender de `ScheduleEntry` |
| RN-26 em toda consulta e gravação nova | ✅ `create` grava `barbershopId` da sessão; `findById`, `delete`, `listStartingIn` e `listOverlapping` filtram por `barbershop_id` (e os joins também); FK composta no banco |
| Perfil no backend | ✅ `@Roles('owner', 'barber')` nas três rotas + `BarberAccessPolicy` nos use cases |
| Swagger | ✅ `@ApiTags('Bloqueios')`, `@ApiOperation` com US-09, `@ApiZodResponse` de sucesso e do 409, `@ApiErrorResponse` 403/404 com as mensagens reais |
| Logs / LGPD | ✅ Nenhum `console.log` e nenhum `Logger` novo; o motivo não é logado (o pino não loga corpo de requisição; o `DomainErrorFilter` só loga o `code` de erros não mapeados) |
| Nomes de teste | ✅ Citam `CA-09.x`, `RN-26`, `RF-26` ou "section 5", como o `tasks.md` permite. Alguns citam o ID da spec (`BLQ-19`, `BLQ-24`, `BLQ-28`) em vez de CA/RN; aceitável porque BLQ-19/28 não têm CA no PRD |
| Todo teste mapeia um BLQ, caso de borda ou Done-when | ✅ |
| Guias do projeto | `CLAUDE.md` (Testes, Swagger, Multi-tenant, Erros) seguidos |

---

## Gate

- **Comando**: `npm run lint:check && npm run build && npm test && npm run test:e2e` (`lint:check` no lugar de `lint` para não alterar a árvore)
- **Lint**: exit 0, sem avisos
- **Build**: exit 0
- **Unitários**: exit 0. 69 suítes, **710 passed**, 0 failed, 0 skipped
- **E2E**: exit 0. 34 suítes, **458 passed**, 0 failed, 0 skipped
- **Contagem antes da feature (3bbe450)**: 616 unitários, 399 e2e (contados num worktree em 3bbe450; e2e por `-t` sem rodar)
- **Contagem depois**: 710 unitários, 458 e2e
- **Delta**: +94 unitários, +59 e2e. Nenhum teste removido; os testes da US-08 (`list-schedule.use-case.spec.ts`, `test/schedule.e2e-spec.ts`) não foram alterados no diff
- **Flaky**: o CA-07.4 de `test/scheduling.e2e-spec.ts` (pré-existente, US-07) não falhou nesta execução

---

## Planos de correção

Nenhum gap bloqueante. Sugestões opcionais:

- **Teste de `confirmConflicts` inválido** (Minor): em `SS`, `confirmConflicts: 'yes'` → issue `{ field: 'confirmConflicts', message: 'Informe true ou false em confirmConflicts.' }`.
- **Registrar na spec** (Minor): as mensagens de `blockId` e `confirmConflicts` nas Assumptions.
- **DI da política na agenda** (Cosmetic): `ScheduleModule` injetar `BarberAccessPolicy` em `ListScheduleUseCase`, se o time quiser o mesmo padrão dos use cases novos.

---

## Atualização de rastreabilidade

| Requisito | Antes | Depois |
| --------- | ----- | ------ |
| BLQ-01 a BLQ-28 | Implementing | ✅ Verified |

---

## Resumo

**Overall**: ✅ Pronto

**Spec-anchored check**: 28/28 BLQ e 6/6 casos de borda no valor da spec; 2 pontos de precisão fora dos BLQ (mensagens de `blockId` e `confirmConflicts`)
**Sensor**: 13/13 mutantes mortos
**Gate**: 710 unitários e 458 e2e passando; lint e build limpos

**O que funciona**: criação de bloqueio e folga com conversão de fuso e `24:00`; conflito `409` sem gravar e confirmação `201` sem tocar nos agendamentos; listagem e remoção com a regra de perfil da seção 5; isolamento RN-26 na aplicação e no banco; motor deixa de ofertar e volta a ofertar; Swagger das três rotas.

**Próximo passo**: abrir o PR da história.

---

## Pós-verificação

- Os dois pontos de precisão foram fechados sem mudar código de produção: as mensagens de `blockId` e `confirmConflicts` entraram nas Assumptions da spec, e `a83b4d8` adicionou o teste `CA-09.3: rejects confirmConflicts %p` em `src/interface-adapters/controllers/schemas/barber-block.schema.spec.ts`, que confere a mensagem exata.
