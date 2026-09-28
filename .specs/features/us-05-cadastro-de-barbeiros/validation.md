# US-05 Cadastro de barbeiros e jornada: validação

## Validation verdict: PASS ✅

**Data**: 2026-09-28
**Rodada**: 1
**Spec**: `.specs/features/us-05-cadastro-de-barbeiros/spec.md`
**Diff range**: `f9fe6bb..47460ae` (branch `feat/us-05-barbers`; 16 commits: `1382fe1` docs e `8664e6d..47460ae` feature)
**Verifier**: sub-agente independente (autor ≠ verifier)

Os 34 requisitos (BRB-01 a BRB-34) e os 10 edge cases têm evidência `file:line` com asserção no valor definido pela spec. Os quatro gates passam na árvore real. O sensor injetou 34 mutantes, incluindo 7 de tenant (RN-26), e todos morreram. Nenhum spec-precision gap, nenhum `SPEC_DEVIATION`.

---

## Conclusão das tasks

| Task | Status | Commit |
| ---- | ------ | ------ |
| T1 DayWorkingHours + InvalidWorkingHoursError | ✅ Feita | `8664e6d` |
| T2 WeeklyWorkingHours com avisos | ✅ Feita | `de782ef` |
| T3 Entidade Barber e erros | ✅ Feita | `c1c9281` |
| T4 Tabelas com FKs compostas | ✅ Feita | `8d64213` |
| T5 Port + TypeOrmBarberRepository | ✅ Feita | `d9df491` |
| T6 CreateBarberUseCase | ✅ Feita | `ee9f8c6` |
| T7 UpdateBarberUseCase | ✅ Feita | `76b4fd5` |
| T8 SetBarberActiveUseCase | ✅ Feita | `83cc74a` |
| T9 ListBarbersUseCase | ✅ Feita | `0eb8b1a` |
| T10 ListSchedulableBarbersUseCase | ✅ Feita | `d9c0d80` |
| T11 FindBarberByUserUseCase | ✅ Feita | `aacbb16` |
| T12 Schemas Zod | ✅ Feita | `645343d` |
| T13 GET e POST | ✅ Feita | `bdb2a09` |
| T14 PUT | ✅ Feita | `4103043` |
| T15 Desativar e reativar | ✅ Feita | `47460ae` |

tasks.md não tem nenhum checkbox aberto. Não há marcador `SPEC_DEVIATION` em `src/` nem em `test/`.

---

## Critérios de aceite ancorados na spec

Abreviações: `E2E` = `test/barbers.e2e-spec.ts`, `REPO` = `test/database/typeorm-barber.repository.e2e-spec.ts`, `SCH` = `test/database/barbers-schema.e2e-spec.ts`, `UC-C` = `src/usecases/create-barber/create-barber.use-case.spec.ts`, `UC-U` = `src/usecases/update-barber/update-barber.use-case.spec.ts`.

| AC | Resultado definido na spec | `file:line` + asserção | Resultado |
| -- | -------------------------- | ---------------------- | --------- |
| BRB-01 · CA-05.1 POST válido grava ativo | 201 `{ id, name, active: true, userId, serviceIds, workingHours, warnings }` na barbearia da sessão | `E2E:306-317`: `toBe(201)`, `body).toEqual({ id: uuid, name: 'João', active: true, userId: null, serviceIds: [beardId, haircutId], workingHours: WEEKDAYS_JOURNEY, warnings: [] })`, `currentBarbers()).toEqual([withoutWarnings(body)])`. Com `userId`: `E2E:611-614`. Estado gravado: `UC-C:103-106` (`describeBarber(stored)).toEqual(expected)`, `createdAt` igual a `NOW`) e `REPO:220-231` | ✅ PASS |
| BRB-02 · CA-05.1 GET lista ativos e inativos por nome sem maiúsculas | lista completa da sessão, ordenada por `lower(name)` | `E2E:352-356` `toEqual(['ana', 'João', 'Pedro'])`; inativo listado em `E2E:936` `toEqual([{ ...before, active: false }])`; `REPO:266-272` (inativo, sem B, ordem); `src/usecases/list-barbers/list-barbers.use-case.spec.ts:135-139` | ✅ PASS |
| BRB-03 · CA-05.1 leitura de disponíveis | só ativos da barbearia, com `serviceIds` e jornada | `E2E:327-337` `toEqual([{ id, serviceIds: [haircutId], mondayStartsAt: '09:00' }])`; `REPO:287-293` (sem inativo, sem B, jornada completa); `src/usecases/list-schedulable-barbers/list-schedulable-barbers.use-case.spec.ts:206-212` | ✅ PASS |
| BRB-04 · CA-05.1 PUT substitui e mantém `active` | 200 com o barbeiro salvo e `warnings`; serviços e 7 dias substituídos; `active` inalterado | `E2E:721-731` `toBe(200)`, `body).toEqual({ ...expected, warnings: [] })`, `currentBarbers()).toEqual([expected])`; inativo segue inativo `E2E:768-770`; `UC-U:403-406`, `:417-418`; troca completa no banco `REPO:413-428` (contagens de filhos 1 e 1) | ✅ PASS |
| BRB-05 · CA-05.1 nome repetido → 409 | 409 `{ message: 'Já existe um barbeiro com esse nome.' }`, nada gravado; vale para inativo | POST `E2E:394-400` (body exato; só o `existing.id`); PUT `E2E:828-832` (`toEqual(before)`); inativo `UC-C:221-229`; `REPO:343-349` (contagens 1/1/7) | ✅ PASS |
| BRB-06 · CA-05.1 índice único no banco | `23505` em `barbers_name_unique` sobre `(barbershop_id, lower(name))` | `SCH:125-131` `rejects.toMatchObject({ driverError: { code: '23505', constraint: 'barbers_name_unique' } })`, `count('barbers')).toBe(1)`; outra barbearia aceita `SCH:137-139` | ✅ PASS |
| BRB-07 · CA-05.1 grava a relação de serviços | `serviceIds` na ordem enviada, no barbeiro e no GET | `E2E:313` + `:317` (`[beardId, haircutId]`); PUT `E2E:727-731`; `REPO:228` (ordem por `position`); `src/domain/entities/barber.spec.ts:108` | ✅ PASS |
| BRB-08 · CA-05.1 vazio, mais de 50 ou repetidos → 400 no campo | 400 `errors: [{ field: 'serviceIds' }]`, nada gravado | `E2E:444-467` (it.each: vazio, repetido, 51) `toEqual({ message: 'Dados inválidos.', errors: [{ field: 'serviceIds', message: 'Escolha de 1 a 50 serviços realizados, sem repetir.' }] })`, `currentBarbers()).toEqual([])`; limites 1 e 50 aceitos em `src/interface-adapters/controllers/schemas/barber.schema.spec.ts:92-101` | ✅ PASS |
| BRB-09 · CA-05.1 serviço inexistente ou de outra barbearia → 400 | 400 `{ message: 'Serviço não encontrado.' }`, nada gravado | `E2E:426-428` (inexistente), `E2E:439-441` (outra barbearia), com body exato e `toEqual([])`; PUT `UC-U:505-525` (`toEqual(before)`) | ✅ PASS |
| BRB-10 · CA-05.1 serviço inativo → 400 | 400 `{ message: 'Os serviços realizados devem estar ativos.' }`, nada gravado | `E2E:413-417`; PUT `UC-U:511-515`; domínio `src/domain/entities/barber.spec.ts:131-146` | ✅ PASS |
| BRB-11 · RN-26 FK da relação com serviço no banco | recusa serviço de outra barbearia | `SCH:233-239` `driverError: { code: '23503', constraint: 'barber_services_service_fk' }`, contagem 0; barbeiro de outra barbearia `SCH:252-258` (`barber_services_barber_fk`) | ✅ PASS |
| BRB-12 · CA-05.1 grava os 7 dias | `null` na folga, `{ startsAt, endsAt, break }` no trabalho, mesmo formato na volta | `E2E:314` e `:317` (`WEEKDAYS_JOURNEY` exato, com folgas `null`); todos `null` `E2E:367-372`; intervalo omitido vira `null` `E2E:383`; `REPO:241-249` | ✅ PASS |
| BRB-13 · CA-05.1 jornada incoerente → 400 | 400 com a mensagem do dia em português, nada gravado | `E2E:535-539` `toEqual({ message: 'Segunda-feira: o fim da jornada deve ser depois do início.' })`; intervalo `E2E:553-558` (`'Sexta-feira: o intervalo deve começar e terminar dentro da jornada, com o fim depois do início.'`); limites exatos em `src/domain/value-objects/day-working-hours.spec.ts:42-46`, `:76-98` | ✅ PASS |
| BRB-14 · CA-05.1 sem os 7 dias ou fora de `HH:mm` → 400 no campo | 400 com o campo, nada gravado | `E2E:576-596` (`field: 'workingHours.sunday'` e `field: 'workingHours.monday.endsAt'`, mensagens exatas, `toEqual([])`); schema `barber.schema.spec.ts:105-154` | ✅ PASS |
| BRB-15 · CA-05.3 trecho fora → aviso | grava e devolve `{ weekday, message: '{Dia}: só o trecho da jornada dentro do horário de funcionamento estará disponível.' }` | `E2E:484-499` (201, aviso de segunda exato, jornada gravada); intervalo da barbearia `E2E:507-513`; antes da abertura, depois do fechamento, no intervalo `src/domain/value-objects/weekly-working-hours.spec.ts:233-247` | ✅ PASS |
| BRB-16 · CA-05.3 dia fechado → aviso | `{ weekday, message: '{Dia}: a barbearia não abre neste dia, então a jornada não estará disponível.' }` | `E2E:490-495` (domingo) e `:498` (domingo gravado); PUT `E2E:745-752`; `weekly-working-hours.spec.ts:228-230` | ✅ PASS |
| BRB-17 · CA-05.3 tudo dentro → `warnings: []` | `warnings: []` | `E2E:315`, `E2E:524`, `E2E:730`; `weekly-working-hours.spec.ts:263-284` (inclusive limites exatos) | ✅ PASS |
| BRB-18 · CA-05.1 `CHECK` no banco | `23514` para fim ≤ início e intervalo fora | `SCH:316-319` `driverError: { code: '23514' }`, contagem 0, nos 7 casos de `:263-310` (igual, invertido, intervalo no limite, intervalo vazio, só início, só fim); limites a 1 minuto aceitos em `SCH:322-342` | ✅ PASS |
| BRB-19 · CA-05.2 grava o vínculo | `userId` gravado e devolvido (Dono ou Barbeiro) | `E2E:613-614` (barbeiro convidado, GET confirma); Dono `E2E:627`; PUT `E2E:726-731`; `REPO:227` | ✅ PASS |
| BRB-20 · CA-05.2 barbeiro do usuário | devolve o barbeiro, ou nenhum | `E2E:615-619` `found?.id).toBe(barber.id)`; nenhum: `REPO:322-325` (`toBeNull()` sem vínculo e em outra barbearia); `src/usecases/find-barber-by-user/find-barber-by-user.use-case.spec.ts:256-276` | ✅ PASS |
| BRB-21 · CA-05.2 `userId: null` desvincula | vínculo desfeito; leitura por usuário devolve nenhum | `E2E:794-800` `userId).toBeNull()` e `FindBarberByUserUseCase(...)).toBeNull()`; `UC-U:452-453`; `REPO:419` | ✅ PASS |
| BRB-22 · CA-05.2 usuário inexistente ou de outra barbearia → 400 | 400 `{ message: 'Usuário não encontrado.' }`, nada gravado | `E2E:644-646` (inexistente), `E2E:658-660` (outra barbearia), com `toEqual([])`; PUT `UC-U:497-503` | ✅ PASS |
| BRB-23 · CA-05.2 usuário já vinculado → 409 | 409 `{ message: 'Esse usuário já está vinculado a outro barbeiro.' }`, nada gravado, também com barbeiro inativo | POST `E2E:672-678`; PUT `E2E:847-851` (`toEqual(before)`); inativo `UC-C:265-278`; `REPO:356-362`, `:375-381` | ✅ PASS |
| BRB-24 · CA-05.2 índice único e FK composta | `23505` em `barbers_user_id_unique`; `23503` em `barbers_user_fk` | `SCH:150-156`, `SCH:171-178` (contagem 0); vários sem usuário aceitos `SCH:159-164` | ✅ PASS |
| BRB-25 · CA-05.2 remover o usuário desvincula | barbeiro mantido com nome, serviços e jornada; `userId: null` | `E2E:697-699` `toEqual([{ ...withoutWarnings(barber), userId: null }])`; banco `SCH:199-205` | ✅ PASS |
| BRB-26 desativar → 200 `active: false` | 200 com o barbeiro e `active: false` | `E2E:934-935` `toBe(200)`, `body).toEqual({ ...before, active: false })`; `src/usecases/set-barber-active/set-barber-active.use-case.spec.ts:49-50` | ✅ PASS |
| BRB-27 inativo sai dos disponíveis e fica no GET | disponíveis sem ele; GET com `active: false` | `E2E:936-937` (`currentBarbers()).toEqual([{ ...before, active: false }])`, `schedulableIds()).toEqual([])`); `REPO:287-293` | ✅ PASS |
| BRB-28 desativar mantém nome, vínculo, serviços e jornada | só `active` muda | `E2E:929-936` (barbeiro com `userId` do Dono; comparação exata com `before`); `set-barber-active.use-case.spec.ts:49-50`; `src/domain/entities/barber.spec.ts:212-219` | ✅ PASS |
| BRB-29 ativar inativo → 200, volta aos disponíveis | 200, `active: true`, disponível | `E2E:946-948` `toBe(200)`, `active).toBe(true)`, `schedulableIds()).toEqual([barber.id])`; `list-schedulable-barbers.use-case.spec.ts:223-230` | ✅ PASS |
| BRB-30 repetir desativar/ativar → 200 sem mudança | 200, mesmo estado | `E2E:951-964` (it.each nas duas ações: `toBe(200)`, `currentBarbers()).toEqual(once)`); `set-barber-active.use-case.spec.ts:72-89` | ✅ PASS |
| BRB-31 id inexistente ou de outra barbearia → 404 | 404 `{ message: 'Barbeiro não encontrado.' }`, nada muda | PUT: `E2E:860-862` (inexistente), `E2E:879-881` (outra barbearia, B `toEqual(before)`); deactivate/activate de outra barbearia `E2E:966-985`; deactivate inexistente `E2E:994-995`; `UC-U:539-548`; `set-barber-active.use-case.spec.ts:91-113` | ✅ PASS |
| BRB-32 Barbeiro → 403 em todas as rotas | 403 `{ message: 'Acesso negado.' }`, nada muda | GET e POST `E2E:1060-1064`; PUT `E2E:918-922`; deactivate e activate `E2E:1009-1018` | ✅ PASS |
| BRB-33 sem sessão → 401 | 401 | GET e POST `E2E:1071-1075`; PUT `E2E:920-921`; deactivate e activate `E2E:1015-1016` (corpo exato `UNAUTHORIZED`) | ✅ PASS |
| BRB-34 · RN-26 só o tenant da sessão | ignora `barbershopId` no corpo, na query e no header; lê só dados da sessão (inclusive o funcionamento) | `E2E:1031-1045` (`?barbershopId=`, `x-barbershop-id` e corpo com o id de B → cria só em A, B continua `['Bruno']`); funcionamento da barbearia do barbeiro `UC-C:148-160` (`toEqual(['tuesday'])`); repositório: `REPO:335-336` (`findById`), `REPO:325` (`findByUserId`), `REPO:450-457` (`save(forged)).rejects.toBeInstanceOf(BarberNotFoundError)`, B `toEqual(before)`, 7 dias de jornada mantidos) | ✅ PASS |

**Status**: ✅ 34/34 requisitos cobertos. Nenhum spec-precision gap: cada requisito define status, mensagem, campo ou constraint exatos, e as asserções miram esses valores.

Regra de payload/conjunção: os corpos HTTP de sucesso e de erro são comparados inteiros com `toEqual`. O estado gravado é conferido pelo GET completo (`currentBarbers()`), por `describeBarber` campo a campo (use cases e repositório) ou por contagens das três tabelas. "Nada gravado" é sempre uma comparação com o estado anterior (`toEqual(before)`, `toEqual([])`) ou uma contagem relativa (L-001). O teste do `save` forjado (L-004) confere também os filhos de B (`countRows('barber_working_hours')).toBe(7)`).

Nomes dos testes (CLAUDE.md): os testes de BRB-01 a BRB-25 e BRB-34 citam `CA-05.x` ou `RN-26` no nome ou no `describe`. BRB-26 a BRB-33 não têm CA na spec, e os testes deles não citam CA, como na US-04.

---

## Edge cases

- [x] Campos extras (`active`, `barbershopId`) ignorados: `E2E:359-373` (`active: true` apesar de `active: false` no corpo); `barber.schema.spec.ts:222-231`; header e query em `E2E:1031-1045`
- [x] Nome com espaços nas pontas gravado sem eles: `E2E:367-368` (`name: 'Carlos'`); a unicidade compara o nome já aparado porque o trim acontece na borda, antes do use case (`barber.schema.spec.ts:198-202`)
- [x] Editar mantendo o próprio nome (em outra caixa) e o próprio `userId`: `E2E:803-815`; `UC-U:456-463`; `REPO:384-394`
- [x] `userId` omitido na criação → `null`: `E2E:630-636`; `barber.schema.spec.ts:177-182`
- [x] `userId` do próprio Dono aceito: `E2E:622-628`; `UC-C:174-183`
- [x] 7 dias `null` → grava e `warnings: []`: `E2E:359-373`; `UC-C:162-170`
- [x] Jornada igual ao funcionamento → `warnings: []`: `E2E:516-525`; `weekly-working-hours.spec.ts:264-271`
- [x] Barbearia com intervalo e barbeiro sem intervalo → aviso: `E2E:502-514`; `weekly-working-hours.spec.ts:236`
- [x] Nenhum barbeiro → lista vazia: `E2E:340-345`
- [x] Mesmo PUT duas vezes → 200 e mesmo estado: `E2E:773-782`

---

## Sensor de discriminação

Scratch isolado: `git worktree add --detach <scratchpad>/verify-wt HEAD`, com `node_modules` em symlink e `.env` copiado. Cada mutante foi aplicado por script, que exige exatamente uma ocorrência do trecho, e revertido com `git checkout -- <arquivo>` no worktree. `git stash` não foi usado. Nenhum mutante tocou o banco: as migrations já estavam aplicadas e a `global-setup` não as roda de novo.

Comandos: unitários com `npx jest src/domain src/usecases src/interface-adapters src/infrastructure/http`. Repositório com `npx jest --config ./test/jest-e2e.json test/database/typeorm-barber.repository.e2e-spec.ts test/barbers.e2e-spec.ts`. Controller e presenter com `test/barbers.e2e-spec.ts`.

| # | File:line | Descrição | Morto? |
| - | --------- | --------- | ------ |
| M1 | `src/domain/value-objects/day-working-hours.ts:35` | `endsAt <= startsAt` → `<` (aceita fim igual ao início) | ✅ Morto (1) |
| M2 | `src/domain/value-objects/day-working-hours.ts:65` | `startsAt < break.startsAt` → `<=` | ✅ Morto (2) |
| M3 | `src/domain/value-objects/day-working-hours.ts:67` | `break.endsAt < endsAt` → `<=` | ✅ Morto (1) |
| M4 | `src/domain/value-objects/weekly-working-hours.ts:59` | `outer.start <= inner.start` → `<` (limite da abertura) | ✅ Morto (6) |
| M5 | `src/domain/value-objects/weekly-working-hours.ts:60` | `inner.end <= outer.end` → `<` (limite do fechamento) | ✅ Morto (6) |
| M6 | `src/domain/value-objects/weekly-working-hours.ts:44` | nunca avisa trecho parcial | ✅ Morto (8) |
| M7 | `src/domain/value-objects/weekly-working-hours.ts:29` | não devolve nenhum aviso | ✅ Morto (10) |
| M8 | `src/domain/entities/barber.ts:108` | pula a checagem de serviço inativo | ✅ Morto (3) |
| M9 | `src/domain/entities/barber.ts:105` | pula a checagem de serviço de outro tenant (domínio) | ✅ Morto (1) |
| M10 | `src/usecases/shared/assign-barber-user.ts:12` | `userId: null` não desvincula | ✅ Morto (1) |
| M11 | `src/usecases/shared/assign-barber-services.ts:19` | serviço não encontrado é ignorado (`continue`) | ✅ Morto (3) |
| M12 | `src/usecases/set-barber-active/set-barber-active.use-case.ts:23` | ativar/desativar vira toggle | ✅ Morto (2) |
| M13 | `src/usecases/list-schedulable-barbers/list-schedulable-barbers.use-case.ts:14` | disponíveis lê `listByBarbershop` (inclui inativos) | ✅ Morto (2) |
| M14 | `src/usecases/shared/working-hours-warnings.ts:18` | compara sempre com "tudo fechado" (ignora o funcionamento salvo) | ✅ Morto (4) |
| M15 | `src/usecases/update-barber/update-barber.use-case.ts:46` | PUT não aplica nome e jornada | ✅ Morto (4) |
| M16 | `src/interface-adapters/controllers/schemas/barber.schema.ts:51` | remove o refine de serviços repetidos | ✅ Morto (1) |
| M17 | `src/interface-adapters/controllers/schemas/barber.schema.ts:50` | máximo de serviços 50 → 51 | ✅ Morto (1) |
| M18 | `src/infrastructure/http/domain-error.filter.ts:42` | `BarberNotFoundError` → 400 | ✅ Morto (1) |
| M19 | `src/infrastructure/http/domain-error.filter.ts:41` | `BarberUserAlreadyLinkedError` → 400 | ✅ Morto (1) |
| M20 | `src/infrastructure/database/repositories/typeorm-barber.repository.ts:84-86` | **tenant**: remove a checagem `affected !== 1` do `save` | ✅ Morto (1 de 63) |
| M21 | `typeorm-barber.repository.ts:43` | **tenant**: `findById` sem `barbershopId` | ✅ Morto (4) |
| M22 | `typeorm-barber.repository.ts:100` | **tenant**: listas sem filtro de barbearia (`1 = 1`) | ✅ Morto (4) |
| M23 | `typeorm-barber.repository.ts:55` | **tenant**: `findByUserId` sem `barbershopId` | ✅ Morto (1) |
| M24 | `typeorm-barber.repository.ts:79` | **tenant**: `UPDATE` do `save` sem `barbershopId` no `WHERE` | ✅ Morto (1) |
| M25 | `typeorm-barber.repository.ts:145` | não traduz o `23505` de `barbers_name_unique` | ✅ Morto (3) |
| M26 | `typeorm-barber.repository.ts:148` | não traduz o `23505` de `barbers_user_id_unique` | ✅ Morto (4) |
| M27 | `typeorm-barber.repository.ts:87` | `save` não apaga os serviços antigos | ✅ Morto (15) |
| M28 | `typeorm-barber.repository.ts:80` | `save` não grava `active` | ✅ Morto (4) |
| M29 | `typeorm-barber.repository.ts:104` | `ORDER BY LOWER(name)` → `ORDER BY name` | ✅ Morto (2) |
| M30 | `typeorm-barber.repository.ts:115` | serviços lidos em ordem inversa de `position` | ✅ Morto (4) |
| M31 | `typeorm-barber.repository.ts:187` | intervalo gravado sem início | ✅ Morto (43) |
| M32 | `src/interface-adapters/presenters/barber.presenter.ts:107` | resposta sempre com `warnings: []` | ✅ Morto (3) |
| M33 | `src/interface-adapters/controllers/barbers.controller.ts:95` | **tenant/borda**: POST ignora o `userId` do corpo | ✅ Morto (6) |
| M34 | `src/usecases/create-barber/create-barber.use-case.ts:46` | criação não passa pelo vínculo de usuário | ✅ Morto (6) |

**Profundidade do sensor**: expandida (34 mutantes manuais; a feature toca isolamento de tenant, concorrência de unicidade e FKs compostas).
**Resultado**: 34/34 mortos, nenhum equivalente. PASS ✅

Sobre o M20: sem a checagem, o `save` forjado apaga os filhos de B e tenta inserir `barber_services` com `(barber_id de B, barbershop_id de A)`. A FK composta `barber_services_barber_fk` recusa esse insert e a transação desfaz tudo. O banco protege o dado, mas o erro vira um `QueryFailedError` (500) em vez de `BarberNotFoundError`, e `REPO:450` detecta isso.

Isolamento: o porcelain da árvore real estava vazio antes do sensor e continuou vazio depois dele. Este relatório foi escrito só depois. O worktree foi removido (`git worktree remove --force`) e podado (`git worktree prune`), e `git worktree list` mostra só a árvore principal.

---

## Code Quality

| Princípio | Status |
| --------- | ------ |
| Código mínimo | ✅ |
| Mudanças cirúrgicas: fora da feature, só a extração de `time-of-day.field.ts` (reuso no schema da US-03), `@Unique` em `users`/`services` para as FKs compostas e o export de `USER_REPOSITORY` | ✅ |
| Sem escopo extra: nada de exclusão, foto, telas ou agenda | ✅ |
| Segue os padrões (US-04: port + fake com snapshot, `writeWithUniqueGuard`, `affected !== 1`, filtro de erros) | ✅ |
| Spec-anchored outcome check | ✅ |
| Cobertura por camada: domínio 1:1 com limites exatos; rotas com sucesso, edge cases, erro, 401 e 403 nas 5 rotas | ✅ |
| Todo teste mapeia um BRB, edge case ou Done-when | ✅ |
| Diretrizes documentadas seguidas: `CLAUDE.md` (Testes, Swagger, RN-26), lições L-001 a L-004 | ✅ |

Observações não bloqueantes:

1. O título do it.each em `src/infrastructure/http/domain-error.filter.spec.ts` (`'US-05: maps %s to %i with the spec message'`) sai como "maps BarberNotFoundError to NaN". O `%i` consome o segundo argumento, que é o objeto de erro, e não o status. As asserções estão certas, só o nome exibido sai errado.
2. `activate` com um id inexistente não tem e2e próprio. `deactivate` com id inexistente tem (`E2E:987-996`), e `activate` de outra barbearia também tem (`E2E:966-985`), pelo mesmo caminho de código. Os testes do use case (`set-barber-active.use-case.spec.ts:91-113`) usam só `active: false`.
3. No PUT, os erros de serviço, usuário e jornada (BRB-09, BRB-10, BRB-13, BRB-22) são provados nos testes do use case (`UC-U:497-537`), com o mesmo pipe e o mesmo filtro que o e2e do POST já cobre.

---

## Gate Check

- **Comando de gate**: `npm run lint:check && npm run build && npm test && npm run test:e2e` (tasks.md, nível Build; usei `lint:check` para não alterar arquivos)
- **Resultado**: lint 0 erros; build ok; unitários 383 passaram, 0 falharam (50 suites); e2e 294 passaram, 0 falharam (22 suites)
- **Contagem antes da feature**: 263 unitários (medido em `f9fe6bb` no worktree); 213 e2e (294 menos os 81 das três suites novas, que são as únicas e2e alteradas no range)
- **Contagem depois da feature**: 383 unitários; 294 e2e
- **Delta**: +120 unitários, +81 e2e
- **Testes pulados**: nenhum
- **Falhas**: nenhuma

---

## Requirement Traceability Update

| Requirement | Status anterior | Status novo |
| ----------- | --------------- | ----------- |
| BRB-01 a BRB-34 | Implementing | ✅ Verified |

---

## Summary

**Overall**: ✅ Pronto

**Spec-anchored check**: 34/34 requisitos e 10/10 edge cases com asserção no valor da spec; 0 spec-precision gaps
**Sensor**: 34/34 mutantes mortos (7 de tenant)
**Gate**: 383 unitários + 294 e2e passaram; lint e build ok

**O que funciona**: CRUD de barbeiros sem exclusão; relação com serviços validada na aplicação e no banco (FK composta); jornada com `CHECK` e limites exatos; avisos do CA-05.3 contra o funcionamento salvo; vínculo 1:1 com usuário (índice único, FK composta, `SET NULL`); leituras de disponíveis e de barbeiro por usuário; isolamento por tenant em leitura e gravação, inclusive contra entidade forjada; Swagger das 5 rotas (o `api-docs.e2e-spec.ts` passa).

**Problemas encontrados**: nenhum bloqueante. Há três observações cosméticas ou de cobertura redundante, listadas em Code Quality.

**Próximos passos**: nenhuma fix task. A feature pode seguir para o merge.
