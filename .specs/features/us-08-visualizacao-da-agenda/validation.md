# US-08 Visualização da agenda: validação

## Validation: US-08 - PASS

**Data**: 2026-09-28
**Spec**: `.specs/features/us-08-visualizacao-da-agenda/spec.md`
**Diff range**: `main..HEAD` na branch `feat/us-08-schedule-view` (f64783e docs; 4e4f397..ff60169 = T1..T6)
**Verifier**: sub-agente independente (autor ≠ verificador)
**Veredito**: PASS. 25/25 AGD com evidência; 13 mutantes não equivalentes mortos, 2 equivalentes; gates verdes.

---

## Conclusão das tasks

| Task | Status | Commit |
| ---- | ------ | ------ |
| T1 SchedulePeriod | ✅ Done | 4e4f397 |
| T2 ListScheduleUseCase | ✅ Done | f1e1919 |
| T3 Migration e entidades de cliente | ✅ Done | d331a4c |
| T4 TypeOrmScheduleQuery | ✅ Done | b7913da |
| T5 Schema da query | ✅ Done | e6c312b |
| T6 Rota GET /appointments | ✅ Done | ff60169 |

As 6 tasks estão marcadas como feitas em `tasks.md`. Nenhuma está bloqueada ou parcial.

---

## Critérios de aceite ancorados na spec

Abreviações: `SP` = `src/domain/value-objects/schedule-period.spec.ts`, `UC` = `src/usecases/list-schedule/list-schedule.use-case.spec.ts`, `QS` = `src/interface-adapters/controllers/schemas/schedule.query.schema.spec.ts`, `QE` = `test/database/typeorm-schedule.query.e2e-spec.ts`, `CS` = `test/database/clients-schema.e2e-spec.ts`, `AR` = `test/database/typeorm-appointment.repository.e2e-spec.ts`, `SE` = `test/schedule.e2e-spec.ts`.

| Critério | Resultado definido na spec | `file:line` + asserção | Resultado |
| -------- | -------------------------- | ---------------------- | --------- |
| AGD-01 visão `day`, todos os barbeiros, `[00:00, 00:00 do dia seguinte)` local | São Paulo 2026-09-30 → `[03:00Z, 03:00Z do dia seguinte)`; Ana e Bruno no dia | `SP:9` `utc.start` `'2026-09-30T03:00:00.000Z'` e `utc.end` `'2026-10-01T03:00:00.000Z'`; `SP:23` Manaus 04:00Z; `UC:74` `calls` com `barberId: null` e o range; `SE:227` `toEqual([anaMonday, brunoMonday])` | ✅ PASS |
| AGD-02 visão `week` de segunda a segunda seguinte | quarta 30/09 → 2026-09-28 a 2026-10-04, exclui 05/10 | `SP:46` (quarta, segunda, domingo) `startDate '2026-09-28'`, `endDate '2026-10-04'`, `utc.end '2026-10-05T03:00:00.000Z'`; `SP:64` virada de ano; `SE:246` `toEqual([anaMonday, brunoMonday, brunoWednesday])` e `not.toContain(anaNextMonday)` | ✅ PASS |
| AGD-03 Dono filtra por barbeiro | só os do barbeiro | `UC:136` `toEqual(['bruno-monday'])` e `calls[0].barberId` `'barber-bruno'`; `QE:180` `toEqual([ofBruno])`; `SE:268` `toEqual([brunoMonday, brunoWednesday])` | ✅ PASS |
| AGD-04 `barberId` inexistente → 404 | `404` "Barbeiro não encontrado." | `UC:163` `rejects.toThrow(new BarberNotFoundError())` e `calls` `[]`; `SE:283` `.expect(404, { message: 'Barbeiro não encontrado.' })` | ✅ PASS |
| AGD-05 visão, datas locais (fim inclusivo) e fuso | `view`, `startDate`, `endDate`, `timezone: 'America/Sao_Paulo'` | `SE:227` `toMatchObject({ view: 'day', startDate: MONDAY, endDate: MONDAY, timezone: 'America/Sao_Paulo' })`; `SE:246` `endDate: '2026-10-04'`; `UC:121` | ✅ PASS |
| AGD-06 ordem início, nome sem caixa, id | `caio 12:00`, depois `ana 13:00` antes de `Bruno 13:00` | `QE:202` `toEqual([caioFirst, anaAtOne, brunoAtOne])` (nome minúsculo `ana` contra `Bruno`). Desempate por id sem teste, como registrado nas Assumptions (não ocorre hoje) | ✅ PASS (id: aceito pela spec) |
| AGD-07 período vazio → 200 `[]` | `200` com lista vazia | `SE:277` `idsOf(...)` (que exige `200`) `toEqual([])` | ✅ PASS |
| AGD-08 Barbeiro sem `barberId` → só os próprios | só os do barbeiro vinculado | `UC:179` `toEqual(['bruno-monday'])` e `barberId 'barber-bruno'`; `SE:292` `toEqual([brunoMonday, brunoWednesday])` | ✅ PASS |
| AGD-09 Barbeiro com o próprio `barberId` | mesmo resultado de AGD-08 | `UC:192`; `SE:299` `toEqual([brunoMonday, brunoWednesday])` | ✅ PASS |
| AGD-10 Barbeiro com outro `barberId` → 403 | `403` "Acesso negado." sem agendamentos | `UC:205` `rejects.toThrow(new ScheduleAccessDeniedError())`, mensagem `'Acesso negado.'`, `calls` `[]`; `UC:236` sem ficha e com `barberId`; `SE:308` `.expect(403, { message: 'Acesso negado.' })` (corpo exato, sem agendamentos) | ✅ PASS |
| AGD-11 Barbeiro sem ficha → 200 `[]` | `200` com lista vazia | `UC:220` `entries` `[]` e `calls` `[]`; `SE:315` `toEqual([])` | ✅ PASS |
| AGD-12 id, barbeiro, início e fim ISO UTC, status, origem | objeto completo | `SE:323` `toEqual([{ id, barber: { id: ana, name: 'Ana' }, ..., startsAt: '2026-09-28T13:00:00.000Z', endsAt: '2026-09-28T13:45:00.000Z', status: 'confirmed', origin: 'manual' }])`; `QE:237` | ✅ PASS |
| AGD-13 serviços na ordem gravada | Corte e depois Barba | `SE:323` e `QE:237` `services: [{ id: haircut, name: 'Corte' }, { id: beard, name: 'Barba' }]` | ✅ PASS |
| AGD-14 cliente com id, nome, E.164 | `{ id, name: 'João', phone: '+5511987654321' }` | `SE:323` e `QE:237` `client: { id: joao, name: 'João', phone: '+5511987654321' }` | ✅ PASS |
| AGD-15 sem cliente → `client: null` | `null` | `SE:346` `objectContaining({ client: null, origin: 'bot' })`; `QE:270` `toBeNull()` | ✅ PASS |
| AGD-16 origem `bot` x `manual` (RF-28) | `origin: 'bot'` e `'manual'` | `SE:346` `origin: 'bot'`; `SE:323` `origin: 'manual'`; `QE:270` `toBe('bot')` | ✅ PASS |
| AGD-17 telefone único por barbearia | recusa na mesma, aceita em outra | `CS:86` `rejects.toMatchObject({ driverError: { code: '23505', constraint: 'clients_barbershop_phone_unique' } })`; `CS:97` `resolves.toEqual(expect.any(String))` | ✅ PASS |
| AGD-18 cliente de outra barbearia recusado | FK violada | `CS:107` `driverError: { code: '23503', constraint: 'appointments_client_fk' }`; `CS:118` aceita cliente da mesma | ✅ PASS |
| AGD-19 agendamento sem cliente aceito | `client_id` nulo | `CS:126` `clientOf(...)` `toBeNull()` | ✅ PASS |
| AGD-20 motor da US-07 segue gravando sem cliente | linha gravada com `client_id: null` | `AR:100` `toEqual([{ id: appointment.id, client_id: null }])` | ✅ PASS |
| AGD-21 só dados da barbearia da sessão | Dono B vê só o seu | `SE:363` `toEqual([foreignMonday])`; `QE:290` `toEqual([own])`; `QE:313` `barberId` forjado → `[]`; `UC:253` | ✅ PASS |
| AGD-22 `barberId` de outra barbearia → 404 | `404` "Barbeiro não encontrado." | `UC:270` `rejects.toThrow(new BarberNotFoundError())`; `SE:369` `.expect(404, BARBER_NOT_FOUND)` | ✅ PASS |
| AGD-23 sem sessão → 401 | `401` | `SE:376` `.expect(401, { message: 'Sessão inválida ou expirada.' })` | ✅ PASS |
| AGD-24 entrada inválida → 400 | `400` com as mensagens registradas | `SE:380` `toEqual({ message: 'Dados inválidos.', errors: [{ field: 'view', message: 'Escolha a visão: day ou week.' }] })`; `QS:38` visões `month`, `DAY`, `''`; `QS:44` datas `2026-02-30`, `2026-13-01`, `28/09/2026`, `2026-9-28`, `''`; `QS:53` `barberId` não UUID; `QS:59` falta de `view` e `date`. O pipe roda antes do handler, então não há consulta | ✅ PASS |
| AGD-25 Swagger | resumo com US-08, query, 200/400/401/403/404, perfis | `SE:392` `summary` `toContain('US-08')`, `'x-roles': ['owner', 'barber']`, `description` `toContain('**Acesso:** Dono, Barbeiro.')`, parâmetros `['view', 'date', 'barberId']`, as cinco respostas com descrição; `test/api-docs.e2e-spec.ts` passa | ✅ PASS |

**Status**: ✅ 25/25 AGD com evidência e asserção no valor definido pela spec. Nenhum gap de precisão. O desempate por id (AGD-06) e o CA-08.4 (tela de 360 px) seguem o que a spec registrou: sem teste por decisão e fora do escopo, respectivamente.

---

## Casos de borda

- [x] Data num domingo → semana da segunda anterior até esse domingo: `SP:46` (caso `'2026-10-04'` → `startDate '2026-09-28'`, `endDate '2026-10-04'`).
- [x] Começa às 23:30 locais e termina depois da meia-noite → só no dia em que começa: `QE:123` (`crossingMidnight` 02:30Z de 06/10 entra no dia 05/10 local); `QE:165` (o que começa às 23:30 do dia anterior e termina dentro fica de fora).
- [x] Começa exatamente às 00:00 locais do dia seguinte → fora: `QE:123` (Bruno às 03:00Z de 06/10 ausente da lista exata).
- [x] 00:30 locais (03:30 UTC) entra no dia local, não no UTC anterior: `QE:123` inclui o de 03:00Z (00:00 local) e exclui o de 02:30Z (23:30 do dia anterior, que um corte por dia UTC incluiria); `SP:9` fixa o início em 03:00Z.
- [x] Barbeiro inativo → agendamento aparece: `QE:270` (barbeiro com `active = false` volta com `barber: { id: ana, name: 'Ana' }`); `UC:150` o filtro aceita barbeiro inativo.

---

## Sensor de discriminação

Executado num `git worktree` temporário no scratchpad (`node_modules` por symlink, `.env` copiado); cada mutante foi revertido com `git checkout -- .` no worktree antes do próximo. Suítes: as 3 unitárias da feature (37 testes) e as 3 e2e novas (29 testes), com `--runInBand`. Os mutantes 14 e 15 rodaram só `test/schedule.e2e-spec.ts`.

| # | File:line | Mutação | Morto? |
| - | --------- | ------- | ------ |
| 1 | `src/usecases/list-schedule/list-schedule.use-case.ts:71` | Barbeiro pode ver outro barbeiro: remove o `throw ScheduleAccessDeniedError` e devolve `input.barberId ?? own?.id` | ✅ (3 unit, 1 e2e) |
| 2 | `src/usecases/list-schedule/list-schedule.use-case.ts:80` | Filtro do Dono não validado no tenant: devolve `input.barberId` sem `findById` | ✅ (2 unit, 2 e2e) |
| 3 | `src/domain/value-objects/schedule-period.ts:34` | Semana começando no domingo: `-(isoWeekday % 7)` | ✅ (6 unit, 1 e2e) |
| 4 | `src/infrastructure/database/repositories/typeorm-schedule.query.ts:49` | Fim inclusivo: `a.starts_at < $3` → `<=` | ✅ (1 e2e) |
| 5 | `typeorm-schedule.query.ts:60` | Serviços em ordem inversa: `s.position DESC` | ✅ (2 e2e) |
| 6 | `typeorm-schedule.query.ts:60` | Serviços sem `ORDER BY s.position` | ✅ (2 e2e) |
| 7 | `typeorm-schedule.query.ts:48` | Sem filtro de tenant: `WHERE a.barbershop_id = $1` → `WHERE $1::uuid IS NOT NULL` | ✅ (5 e2e) |
| 8 | `typeorm-schedule.query.ts:47` | Join de cliente sem `c.barbershop_id = a.barbershop_id` | ⚪ Equivalente |
| 9 | `typeorm-schedule.query.ts:58` | Join de serviços sem `sv.barbershop_id = s.barbershop_id` | ⚪ Equivalente |
| 10 | `typeorm-schedule.query.ts:51` | Ordem sem `lower()`: `lower(b.name)` → `b.name` | ✅ (1 e2e) |
| 11 | `typeorm-schedule.query.ts:42` | Remove o `CASE` do cliente nulo (sai objeto com campos nulos) | ✅ (2 e2e) |
| 12 | `typeorm-schedule.query.ts:49` | Início exclusivo: `a.starts_at >= $2` → `>` | ✅ (1 e2e) |
| 13 | `src/usecases/list-schedule/list-schedule.use-case.ts:52` | Barbeiro sem ficha lê a agenda toda (`barberId` `null`) | ✅ (1 unit, 1 e2e) |
| 14 | `src/infrastructure/http/domain-error.filter.ts:45` | `ScheduleAccessDeniedError` mapeado para 404 | ✅ (1 e2e) |
| 15 | `src/interface-adapters/controllers/schedule.controller.ts:26` | `@Roles('owner')` (Barbeiro barrado) | ✅ (5 e2e) |

**Equivalentes (8 e 9):** `clients.id` e `services.id` são chaves primárias, e as FKs compostas `appointments_client_fk (client_id, barbershop_id)` e `appointment_services_service_fk (service_id, barbershop_id)` obrigam o mesmo `barbershop_id`. O predicado extra do join nunca descarta linha, então nenhum teste consegue matá-los. As próprias FKs têm teste de recusa (`CS:107` e `test/database/appointments-schema.e2e-spec.ts:294`).

**Profundidade**: expandida (≥ 5 mutantes; controle de acesso e isolamento de tenant).
**Sensor**: 13/13 mutantes não equivalentes mortos, 2 equivalentes, 0 sobreviventes.

**Isolamento**: `git status --porcelain` do repositório real vazio antes do sensor e idêntico (vazio) depois de `git worktree remove --force`.

---

## Qualidade de código

| Princípio | Status |
| --------- | ------ |
| Código mínimo, sem escopo extra (sem paginação, bloqueios ou criação de cliente) | ✅ |
| Mudanças cirúrgicas (filtro de erro, `app.module.ts`, entidade de agendamento) | ✅ |
| Segue os padrões (ports em `usecases/`, fakes em memória, presenter com schema Zod, FK composta por tenant) | ✅ |
| Regra de dependência: use case e domínio sem TypeORM/Nest; `lint:check` passa com `boundaries` | ✅ |
| Asserções nos valores definidos pela spec | ✅ |
| Cobertura por camada: VO e use case 1:1 com os AGD; rota com happy path, bordas e 400/401/403/404 | ✅ |
| Todo teste mapeia para AGD, caso de borda ou Done-when (os de `SP:23` e `SP:34` cobrem fuso e virada de mês do T1) | ✅ |
| Diretrizes seguidas: `CLAUDE.md` (Swagger, RN-26, testes citando CA, migrations, UTC, LGPD sem log de telefone) | ✅ |

---

## Gate

- **Comandos** (repositório real, HEAD `ff60169`): `npm run lint:check` (exit 0), `npm run build` (exit 0), `npm test`, `npm run test:e2e`.
- **Unitários**: 62 suítes, 616 testes, 616 passaram.
- **E2E**: 32 suítes, 399 testes, 399 passaram.
- **Antes da feature**: 579 unitários e 369 e2e (derivado: 37 unitários novos em `SP`, `UC` e `QS`; 30 e2e novos em `SE`, `QE`, `CS` e `AR:100`).
- **Delta**: +37 unitários, +30 e2e. Nenhum teste removido nem enfraquecido (o único arquivo de teste existente alterado, `AR`, só ganhou um caso).
- **Pulados**: nenhum.
- **Falhas**: nenhuma.
- `migration:revert` não foi reexecutado pelo Verifier; o `down()` de `1790624650790-AddClients.ts` desfaz o `up()` na ordem inversa.

---

## Rastreabilidade

O Verifier não altera a spec. Status sugerido para `spec.md`: AGD-01 a AGD-25 de "Implementing" para "✅ Verified". CA-08.4 continua pendente (fora do escopo).

---

## Resumo

**Geral**: ✅ Pronto.
**Checagem ancorada na spec**: 25/25 AGD batem com o resultado da spec; 0 gap de precisão.
**Sensor**: 13/13 mortos (2 equivalentes à parte).
**Gate**: 616 unitários e 399 e2e passando; lint e build limpos.
**Lições**: nenhuma registrada (PASS sem sinal).
