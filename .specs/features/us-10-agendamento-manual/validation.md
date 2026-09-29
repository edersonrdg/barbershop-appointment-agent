# US-10 Agendamento manual pelo painel: validação

## Validation: US-10 - PASS

**Data**: 2026-09-29 (iteração 2; iteração 1 em 2026-09-28)
**Spec**: `.specs/features/us-10-agendamento-manual/spec.md`
**Diff range**: `74ad24a..825fa35` na branch `feat/us-10-manual-booking` (b8a0e94 = docs de planejamento; 4262d1a..d1fec67 = T1..T14; 825fa35 = fix da iteração 1, só testes e Assumptions da spec)
**Verifier**: sub-agente independente (autor ≠ verificador)
**Veredito**: PASS (iteração 2). Os 30 AGM e os 6 casos de borda têm evidência com asserção no valor definido pela spec; a mensagem de `client` ausente está nas Assumptions e tem teste. Gate verde (809 unitários, 491 e2e). Sensor: os dois sobreviventes da iteração 1 (M8, M13) agora morrem, e a amostra dos mutantes já mortos segue morta. Histórico da iteração 1 (FAIL) na seção "Iterações".

---

## Conclusão das tasks

| Task | Status | Commit |
| ---- | ------ | ------ |
| T1 Entidade Client | ✅ Done | 4262d1a |
| T2 Appointment.clientId | ✅ Done | 40957a2 |
| T3 Filtro: recusas do motor | ✅ Done | dbff7c0 |
| T4 ClientRepository | ✅ Done | 32a22d8 |
| T5 Cliente novo gravado com o agendamento | ✅ Done | 636470c |
| T6 ScheduleQuery.findById | ✅ Done | 57d5608 |
| T7 Motor grava com cliente | ✅ Done | 54e99b6 |
| T8 CreateManualAppointmentUseCase | ✅ Done | 11e77e7 |
| T9 ListPanelSlotsUseCase | ✅ Done | 182f0a5 |
| T10 Schema de criação | ✅ Done | 5b7b450 |
| T11 Schema da consulta | ✅ Done | fbc8749 |
| T12 Presenter de horários | ✅ Done | 07c008f |
| T13 Controller, módulo e e2e | ✅ Done | 499ea0a |
| T14 PRD seção 19 | ✅ Done | d1fec67 |
| Fix iteração 1 (fixes 1 a 3) | ✅ Done | 825fa35 |

Todas as tasks estão marcadas como feitas em `tasks.md`. Nenhuma está bloqueada ou parcial.

---

## Critérios de aceite ancorados na spec

Abreviações: `MB` = `test/manual-booking.e2e-spec.ts`, `CM` = `src/usecases/create-manual-appointment/create-manual-appointment.use-case.spec.ts`, `PS` = `src/usecases/list-panel-slots/list-panel-slots.use-case.spec.ts`, `BA` = `src/usecases/book-appointment/book-appointment.use-case.spec.ts`, `CS` = `src/interface-adapters/controllers/schemas/create-appointment.schema.spec.ts`, `QS` = `src/interface-adapters/controllers/schemas/available-slots.query.schema.spec.ts`, `DF` = `src/infrastructure/http/domain-error.filter.spec.ts`, `CL` = `src/domain/entities/client.spec.ts`, `AR` = `test/database/typeorm-appointment.repository.e2e-spec.ts`, `CR` = `test/database/typeorm-client.repository.e2e-spec.ts`, `SQ` = `test/database/typeorm-schedule.query.e2e-spec.ts`.

| Critério | Resultado definido na spec | `file:line` + asserção | Resultado |
| -------- | -------------------------- | ---------------------- | --------- |
| AGM-01 grava `confirmed`/`manual`, `201` no formato da agenda | `201`; id, barbeiro, cliente, serviços, início, fim, status `confirmed`, origem `manual` | `MB:259` `.expect(201)` e `MB:262` `toEqual({ id: any(String), barber: { id: ana, name: 'Ana' }, client: { id: any(String), name: 'João', phone: '+5511987654321' }, services: [Corte, Barba], startsAt: utc('13:00'), endsAt: utc('13:45'), status: 'confirmed', origin: 'manual' })`; `CM:212` objeto completo, `CM:227` `saved.origin` `'manual'` | ✅ PASS |
| AGM-02 fim = início + soma; serviços na ordem enviada | 30 + 15 → fim 13:45; ordem `[Corte, Barba]` | `MB:274-275` `startsAt: utc('13:00')`, `endsAt: utc('13:45')`, `MB:270` `services` na ordem enviada; `CM:220-221` `at('10:45')`; `BA:160` ordem `['beard','haircut']` (diferente do cadastro); `SQ:491` serviços na ordem gravada | ✅ PASS |
| AGM-03 agenda da US-08 mostra com cliente e `manual` | o mesmo item em `GET /appointments` | `MB:285` `appointments` `toEqual([body])` (o corpo do 201, com `client` e `origin: 'manual'`) | ✅ PASS |
| AGM-04 dentro da antecedência mínima → `201` | `201` | `MB:363` agora = 12:00Z, antecedência padrão 60, `booked()` exige `.expect(201)` em `utc('12:00')` (`MB:191`) e `MB:367` `toBe(utc('12:00'))`; `BA:639` 30 min com 60 exigidos, `startsAt` `at('10:30')` | ✅ PASS |
| AGM-05 telefone novo cria cliente (nome sem espaços, E.164) | nome `'João'`, telefone `'+5511987654321'`, ligado ao agendamento | `CM:238` `clientsOfA()` `toEqual([{ id: 'id-1', name: 'João', phone: '+5511987654321' }])` com entrada `'  João  '`, `CM:242` `saved.clientId` `'id-1'`; `MB:306` linha em `clients` `{ name: 'João', phone: '+5511987654321' }` a partir de `'  João  '`; `CL:30`; `AR:145` | ✅ PASS |
| AGM-06 telefone existente (outro formato) liga ao mesmo cliente e mantém o nome | mesmo `client.id`, nome gravado `'João'`, sem cliente novo | `MB:301` `second.client` `toEqual(first.client)`, `MB:302` `name: 'João'` com nome digitado `'Joao Silva'` e telefone `'+55 (11) 98765-4321'`, `MB:306` uma linha só; `CM:255` `{ id: 'client-joao', name: 'João' }` e `CM:260` uma linha | ✅ PASS |
| AGM-07 telefone de outra barbearia cria cliente novo | cliente novo na barbearia da sessão | `MB:610` `not.toBe(foreignClient)` e `MB:611` linhas `[[shopB, phone], [shopA, phone]]`; `CM:272-276`; `CR:81` `findByPhone` da outra barbearia `toBeNull()` | ✅ PASS |
| AGM-08 recusa não grava cliente novo | nenhuma linha nova em `clients` | `MB:327` conflito `409` → telefones `['+5511987654321']` (o `21…` não gravado); `MB:450` 422 → `count('clients')` 0; `MB:491`/`MB:501` 403 → 0; `CM:281` conflito, RN-05 e passado → `clientsOfA()` `[]`; `AR:204` RN-07 do banco → `count('clients')` 0 | ✅ PASS |
| AGM-09 corrida com o mesmo telefone novo → um cliente, sem `500` | dois `201`, uma linha em `clients` | `MB:339` `[201, 201]`, `MB:341` `toHaveLength(1)`, `MB:342-343` os dois `client.id` iguais ao da linha, `MB:344` 2 agendamentos; `CM:299` retry liga `client-racer`; `CM:322` segundo `ClientPhoneTakenError` propaga (retry único); `AR:233` `ClientPhoneTakenError` sem agendamento | ✅ PASS |
| AGM-10 sobreposição → `409` com a mensagem | `409` "O barbeiro já tem um agendamento nesse horário." sem gravar | `MB:412` `.expect(409, { message: 'O barbeiro já tem um agendamento nesse horário.' })` e `MB:416` `count('appointments')` 1; `CM:347`; `DF` `AppointmentConflictError (RN-03)` → 409 | ✅ PASS |
| AGM-11 dois sobrepostos em paralelo → um `201` e um `409` | um gravado, `409` com a mensagem | `MB:434` status `[201, 409]`, `MB:438` corpo `toEqual(CONFLICT)`, `MB:439` 1 agendamento, `MB:440` 1 cliente; `DF` RN-07 → 409; `AR:204` | ✅ PASS |
| AGM-12 RN-05 → `422` com as três mensagens | `422`; "…fora do funcionamento da barbearia.", "…fora da jornada do barbeiro.", "O barbeiro está indisponível nesse horário." | `MB:445` `.expect(422, { message: 'O horário está fora do funcionamento da barbearia.' })`, `MB:460` `.expect(422, { message: 'O barbeiro está indisponível nesse horário.' })`, ambos com `count('appointments')` 0; jornada: `CM:361` `OutsideWorkingHoursError` com a mensagem exata + `DF` `OutsideWorkingHoursError` → `{ statusCode: 422, body: { message: 'O horário está fora da jornada do barbeiro.' } }` | ✅ PASS |
| AGM-13 horário passado → `422` "O horário já passou." | `422` | `CM:375` `SlotInPastError` "O horário já passou." sem gravar; `DF` `SlotInPastError` → `{ statusCode: 422, body: { message: 'O horário já passou.' } }` | ✅ PASS |
| AGM-14 barbeiro sem todos os serviços → `400` | `400` "O barbeiro não realiza todos os serviços escolhidos." | `CM:382` `ServiceNotPerformedError` com a mensagem, nada gravado; `DF` → `{ statusCode: 400, body: { message } }` | ✅ PASS |
| AGM-15 barbeiro/serviço inexistente ou inativo → `404` | `404` "Barbeiro não encontrado." / "Serviço não encontrado." | `MB:468` serviço inexistente `.expect(404, SERVICE_NOT_FOUND)`; `MB:584`, `MB:588`, `MB:592` `.expect(404, …)`; `CM:389` Bia inativa, `CM:403` serviço inexistente, com mensagem exata e nada gravado | ✅ PASS |
| AGM-16 validação `400` com as sete mensagens | as sete mensagens exatas, sem gravar | `CS:160` `issuesOf(...)` `toEqual([issue])` para: barberId não UUID/ausente (`CS:84`, `CS:89`), serviceIds vazio/ausente/11 (`CS:94-109`), item não UUID (`CS:111`), repetido (`CS:116`), sem fuso/segundos/milissegundos/não data (`CS:121-139`), nome 1 e 81 (`CS:141`, `CS:146`), telefone sem DDD e com letras (`CS:151`, `CS:156`); limites aceitos 2/80 e 10 (`CS:58`, `CS:70`); e2e `MB:524` `.expect(400, { message: 'Dados inválidos.', errors: [{ field: 'startsAt', message: 'Informe o início em ISO 8601 com fuso, em minuto cheio.' }] })` + 0 agendamentos e 0 clientes ; `client` ausente, `null` ou string → `CS:164` `toEqual([{ field: 'client', message: 'Informe o nome e o telefone do cliente.' }])` (mensagem registrada em `spec.md:45`) | ✅ PASS |
| AGM-17 Barbeiro agenda para si | gravado como AGM-01 | `MB:478` `booked({ barberId: bruno }, brunoToken)` (201), `MB:480` `barber` `{ id: bruno, name: 'Bruno' }`, `MB:481` `origin` `'manual'`; `CM:431` | ✅ PASS |
| AGM-18 Barbeiro para outro ou sem ficha → `403` sem gravar nada | `403` "Acesso negado.", 0 agendamentos e 0 clientes | `MB:485` e `MB:495` `.expect(403, { message: 'Acesso negado.' })` + `count('appointments')` 0 e `count('clients')` 0; `CM:451` `ScheduleAccessDeniedError` "Acesso negado.", `newAppointments()` `[]`, `clientsOfA()` `[]` | ✅ PASS |
| AGM-19 Dono agenda para qualquer barbeiro ativo | gravado como AGM-01 | `MB:258` (Ana, sem vínculo de usuário); `CM:207` | ✅ PASS |
| AGM-20 consulta com `barberId` | `200`, `date`, `timezone`, inícios com `barber` (id e nome), `startsAt`/`endsAt` UTC, crescente | `MB:353` `.expect(200)`, `MB:355` `date` `MONDAY`, `MB:356` `timezone` `'America/Sao_Paulo'`, `MB:357` `slots[0]` `toEqual({ barber: { id: ana, name: 'Ana' }, startsAt: utc('12:00'), endsAt: utc('12:30') })`; `PS:128` resposta inteira `toEqual({ date, timezone, slots: [9 inícios em ordem] })` | ✅ PASS |
| AGM-21 sem `barberId`: cada início uma vez, primeiro barbeiro livre por nome | lista com barbeiro por início | `PS:152` lista completa `toEqual([...])` alternando Bruno/Ana (Caio sem barba e Bia inativa fora); `MB:391` `[{ Bruno 12:00 }, { Ana 12:30 }]` e `MB:404` inícios únicos | ✅ PASS |
| AGM-22 consulta sem antecedência mínima | primeiro início = próximo a partir de agora | `PS:202` agora 10:05, antecedência 60 → `slots[0]` `toEqual(slot(ana, '10:30', 30))`; `MB:357` agora 09:00 local → primeiro 09:00 local (`utc('12:00')`) | ✅ PASS |
| AGM-23 Barbeiro só a própria; outro/sem ficha → `403` | só Bruno; `403` "Acesso negado." | `PS:211` sem e com o próprio `barberId` → inícios exatos e `Set(['bruno'])`; `PS:247` outro e sem ficha → `ScheduleAccessDeniedError` "Acesso negado."; `MB:505` `.expect(403, FORBIDDEN)`, `MB:516` `Set([bruno])` | ✅ PASS |
| AGM-24 início devolvido → `201` | `201` | `MB:363` `booked({ startsAt: offered.slots[0].startsAt })` (`.expect(201)` em `MB:191`) e `MB:373` a nova consulta não traz o 12:00; `BA:235` (US-07, AVL-27) todo início devolvido a `manual` é aceito | ✅ PASS |
| AGM-25 consulta inválida → `400` | "Informe uma data válida no formato AAAA-MM-DD." ou a mensagem de AGM-16 | `QS:262` `toEqual([issue])` para data inexistente/fora do formato/ausente, serviceIds vazio/ausente/11/não UUID/repetido, barberId não UUID; `MB:541` e `MB:556` `.expect(400, { message: 'Dados inválidos.', errors: [{ field, message }] })` | ✅ PASS |
| AGM-26 consulta com barbeiro/serviço inválido | como AGM-14 e AGM-15 | `PS:311` inexistente, inativo, de outra barbearia → "Barbeiro não encontrado."; serviço inexistente e de outra barbearia → "Serviço não encontrado."; Caio → "O barbeiro não realiza todos os serviços escolhidos."; `MB:596` `.expect(404, BARBER_NOT_FOUND)` | ✅ PASS |
| AGM-27 RN-26 em barbeiros, serviços, clientes e agendamentos | nada cruza barbearias | `MB:583` 404 e 0 linhas; `MB:605`; `CM:396`, `CM:410`, `CM:267`; `CR:81`; `SQ:547` `findById(barbershopA, id)` `toBeNull()` para agendamento da B | ✅ PASS |
| AGM-28 sem sessão → `401` nas duas rotas | `401` | `MB:573` e `MB:574` `.expect(401, { message: 'Sessão inválida ou expirada.' })` | ✅ PASS |
| AGM-29 Swagger das duas rotas | resumo com US-10; `201/400/401/403/404/409/422` na criação; `200/400/401/403/404` na consulta; perfis Dono e Barbeiro | `MB:621` `summary` `toContain('US-10')`, `'x-roles': ['owner', 'barber']`, `**Acesso:** Dono, Barbeiro.`, chaves de `responses` exatamente as listadas, cada uma com descrição; `test/api-docs.e2e-spec.ts` passa. Payloads saem dos schemas Zod no `ZodValidationPipe` | ✅ PASS |
| AGM-30 PRD seção 19 registra o forçar do RN-05 | item em aberto, sem história | `docs/PRD.md:1003` (dentro de "## 19. Questões em aberto e suposições", linha 987): "**Forçar horário no painel (exceção do RN-05).** … A US-10 recusa toda violação, inclusive para o Dono. Falta decidir se o forçar entra e em qual história." | ✅ PASS |

**Status**: ✅ 30/30 AGM e 6/6 casos de borda com evidência e asserção no valor definido pela spec. O ponto de precisão da iteração 1 foi fechado.

### Regra de payload/conjunção

- **201 da criação**: `MB:262` compara o objeto inteiro por valor (8 campos: `id` como `any(String)`, `barber`, `client` com id/nome/telefone E.164, `services` em ordem, `startsAt`, `endsAt`, `status`, `origin`). `CM:212` idem, com `id` exato.
- **200 da consulta**: `PS:128` compara `date`, `timezone` e cada slot (`barber.id`, `barber.name`, `startsAt`, `endsAt`) por valor; `MB:355-361` confere `date`, `timezone` e o primeiro slot inteiro no HTTP (formato ISO UTC da resposta).

### Ponto de precisão da spec

1. ✅ **Mensagem de `client` ausente** (aberto na iteração 1, fechado em 825fa35). "Informe o nome e o telefone do cliente." (`src/interface-adapters/controllers/schemas/create-appointment.schema.ts:11`) agora está nas Assumptions (`spec.md:45`) e tem teste com a mensagem exata para `client` ausente, `null` e string (`CS:164`). O mutante M15 (mensagem trocada) morre nos três casos.

---

## Casos de borda

- [x] **Termina exatamente quando outro começa → gravado**: `CM:443` Ana 13:15 Corte + Barba (o agendamento semeado começa 14:00) → `CM:452` `expect(entry.endsAt).toEqual(at('14:00'))` e `CM:454` `expect(saved.endsAt).toEqual(at('14:00'))`. O lado oposto segue em `BA:225`. M13 morto. (Iteração 1: sem evidência, M13 sobreviveu.)
- [x] **Termina exatamente no fechamento ou no fim da jornada → gravado**: `CM:433` Ana 16:30 Corte → fim `at('17:00')` = fim da jornada; `CM:438` Bruno 17:15 Corte + Barba → fim `at('18:00')` = fechamento; ambos com `CM:452` (entrada devolvida) e `CM:454` (agendamento gravado). M8 morto. (Iteração 1: sem evidência, M8 sobreviveu.)
- [x] `startsAt` com `-03:00` grava o mesmo instante em UTC: `CS:49` `'2026-10-01T10:00:00-03:00'` → `toEqual(new Date('2026-10-01T13:00:00.000Z'))`.
- [x] Nome com espaços nas pontas grava sem eles: `MB:294` `'  João  '` → linha `name: 'João'` (`MB:306`); `CM:238`; `CS:35`; `CL:30`.
- [x] Dia fechado ou todo bloqueado → `200` com `slots` vazio: `PS:175` domingo → `toEqual({ date: SUNDAY, timezone: 'America/Sao_Paulo', slots: [] })`.
- [x] Dono sem `barberId` e ninguém faz todos os serviços → `slots` vazio: `PS:187` `serviceIds: ['shave']` → `toEqual([])`.

Os casos de borda são verificados no use case (unitário, com o motor real e fakes). O status `201` vem do mesmo caminho HTTP já coberto por AGM-01 (`MB:259`), então a ausência de um e2e específico para esses limites não é gap.

---

## Sensor de discriminação

Scratch isolado: `git worktree add --detach <scratchpad>/wt HEAD` com `node_modules` e `.env` ligados por symlink; cada mutação aplicada por script com substituição única conferida, testes rodados só no worktree, arquivo restaurado com `git checkout --` depois de cada uma (porcelain do worktree vazio entre mutações). Worktree removido com `git worktree remove --force` + `git worktree prune`. `git status --porcelain` da árvore real: vazio antes e vazio depois; `HEAD` `d1fec67` antes e depois. Nenhum `git stash`.

| # | Arquivo:linha | Mutação | Testes que mataram | Morto? |
| - | ------------- | ------- | ------------------ | ------ |
| M1 | `src/usecases/create-manual-appointment/create-manual-appointment.use-case.ts:77` | busca do cliente pelo telefone digitado em vez do E.164 (cliente existente em outro formato não é achado) | `CM:245` (AGM-06), `CM:299` (AGM-09) | ✅ Morto |
| M2 | `…/create-manual-appointment.use-case.ts:39-40` | retry único do `ClientPhoneTakenError` removido | `CM:299`, `CM:322`; e2e `MB:333` (rodado à parte, M2e) | ✅ Morto |
| M3 | `src/usecases/shared/booking-context.ts:80` + `src/usecases/book-appointment/book-appointment.use-case.ts:84` | antecedência mínima aplicada a `manual` na gravação e na consulta | `BA:182`, `BA:639`, `PS:197`, 2 testes de `list-available-slots` | ✅ Morto |
| M4 | `src/usecases/list-panel-slots/list-panel-slots.use-case.ts:56` | consulta do painel com origem `bot` | `PS:197` (AGM-22) | ✅ Morto |
| M5 | `…/create-manual-appointment.use-case.ts:64` | gravação com origem `bot` | `CM:207`, `CM:431` | ✅ Morto |
| M6 | `…/create-manual-appointment.use-case.ts:33` | checagem de perfil (`targetBarber`) movida para depois da gravação do cliente e do agendamento | `CM:451` (os dois casos de AGM-18) e mais 6 | ✅ Morto |
| M7 | `src/infrastructure/http/domain-error.filter.ts:57` | `BarberUnavailableError` → 409 em vez de 422 | `DF` "maps BarberUnavailableError…" | ✅ Morto |
| M8 | `src/domain/value-objects/barber-day-schedule.ts:90` | `contains`: `inner.end <= outer.end` → `<` (gravação que termina no fechamento/fim da jornada é recusada) | iteração 2: `CM:433` e `CM:438` (2 falhas em 809) | ✅ Morto (sobreviveu na iteração 1) |
| M9 | `src/interface-adapters/controllers/schemas/create-appointment.schema.ts:22` | schema aceita `startsAt` com segundos/milissegundos | `CS` "a start with seconds", "a start with milliseconds" | ✅ Morto |
| M10 | `src/infrastructure/database/repositories/typeorm-appointment.repository.ts:53` | cliente novo inserido fora da transação | `AR:204`, `MB:419` | ✅ Morto |
| M11 | `…/typeorm-appointment.repository.ts:85-87` | violação de exclusão (RN-07) não traduzida (vira 500) | `MB:419`, `AR:204`, `AR:313`, `test/scheduling.e2e-spec.ts:154` | ✅ Morto |
| M12 | `…/typeorm-appointment.repository.ts:89-92` | violação de unicidade do telefone (RN-08) não traduzida (corrida vira 500) | `MB:333`, `AR:233` | ✅ Morto |
| M13 | `src/domain/value-objects/barber-day-schedule.ts:72` | `violationOf`: sobreposição passa a incluir `fim == início do outro` | iteração 2: `CM:443` (1 falha em 809) | ✅ Morto (sobreviveu na iteração 1) |
| M14 | `src/usecases/list-panel-slots/list-panel-slots.use-case.ts:64` | nome do barbeiro vazio nos slots | `PS:123`, `PS:145`, `PS:197` | ✅ Morto |
| M15 | `src/interface-adapters/controllers/schemas/create-appointment.schema.ts:11` | mensagem de `client` ausente trocada | `CS:164` (3 casos) | ✅ Morto (novo na iteração 2) |

Notas:
- Uma primeira versão do M3 só no guarda de `book-appointment.use-case.ts:84` (`input.origin === 'bot' &&` removido) sobreviveu, mas é **equivalente**: `booking-context.ts:79-82` já faz `earliest = now` para `manual`, então o guarda é redundante. O M3 da tabela ataca as duas linhas juntas.
- Uma variante de "usar o nome digitado para cliente existente" que não passa pelo banco é equivalente (o nome devolvido vem de `ScheduleQuery.findById`, que lê o que está gravado). O M1 cobre o mesmo comportamento (AGM-06) de forma observável.
- M13 também foi rodado na forma simétrica (`<=` nos dois lados): morreu em `BA:225`, `BA:235` e `barber-day-schedule.spec.ts:60`, `:194`. Só o lado "termina quando o outro começa" fica sem teste.

**Sensor depth**: expandido (≥5 mutações; caminhos de permissão, RN-26, RN-07/RN-08 e integridade da agenda).
**Iteração 2 (HEAD 825fa35)**: worktree novo e isolado em 825fa35, mesma mecânica (script de substituição única, `git checkout --` depois de cada mutação, sem `git stash`), removido no fim com `git worktree remove --force` + `prune`. Na árvore real, `git status --porcelain` ficou igual antes e depois (só `validation.md` e os arquivos de lições) e `HEAD` segue 825fa35. Mutantes rodados de novo contra a suíte unitária inteira (809): M8, M13, M1, M2, M6, M7, M9 e o novo M15, todos mortos. Contra os e2e `MB` e `AR`: M10 e M12, mortos.

**Result**: iteração 2 com 15/15 mortos (M8 e M13 viraram mortos; M15 novo). PASS. Iteração 1: 12/14.

---

## Qualidade de código

| Princípio | Status |
| --------- | ------ |
| Código mínimo, sem escopo extra | ✅ Sem forçar RN-05, sem edição/cancelamento, sem busca por `clientId`, sem métrica nova (Out of Scope respeitado) |
| Mudanças cirúrgicas | ✅ Motor só ganhou o `client` opcional e o `clientId`; o fake de agendamentos ganhou o repositório de clientes com default, e os testes da US-07 seguem sem mudança de comportamento |
| Segue os padrões | ✅ Política de acesso da US-09 reusada; schemas com `.meta()`; presenter com schema Zod exportado |
| Regra de dependência (boundaries) | ✅ `npm run lint:check` sem erros; `Client` e `ClientPhoneTakenError` em `domain/`; ports em `usecases/ports` |
| RN-26 | ✅ `findByPhone`, `findById` e o insert do cliente usam a barbearia da sessão; testes de outra barbearia em `CR:81`, `SQ:547`, `MB:583`, `MB:605` |
| Perfil no backend | ✅ `@Roles('owner', 'barber')` + `BarberAccessPolicy.targetBarber`/`readScope` antes de qualquer gravação (M6 morto) |
| Erros de domínio | ⚠️ `create-manual-appointment.use-case.ts:48` lança `new Error('The booked appointment was not found.')`. É o único `throw new Error` em `src/usecases`. Ver avaliação (ii) |
| Swagger | ✅ `@ApiTags`, `@ApiOperation` com US-10, `@ApiZodResponse`, `@ApiErrorResponse` com as mensagens reais; 400 de validação mesclado em `oneOf` pelo `api-document.ts:159-181` |
| Logs / LGPD | ✅ Nenhum `Logger`/`console` novo; `*.phone` e `*.message` já estão no `redact`; nome e telefone do cliente não são logados |
| Nomes de teste | ✅ Citam `CA-10.x`, `RN-26`, `RN-07` ou o AGM (AGM-16/25/28/29, que não têm CA) |
| Todo teste mapeia um AGM, caso de borda ou Done-when | ✅ |
| Guias do projeto | `CLAUDE.md` (Testes, Swagger, Multi-tenant, Erros, LGPD) |

### Avaliação dos pontos levantados pelo autor

1. **"Informe o nome e o telefone do cliente." fora do AGM-16** → **gap de precisão (fix task Minor 3 na iteração 1; fechado em 825fa35 com `spec.md:45` e `CS:164`)**. A mensagem é voltada ao usuário, decidida pelo autor e sem teste. Pela L-007 ela deveria estar nas Assumptions antes da implementação; pela L-008, precisa de um teste com a mensagem exata.
2. **`throw new Error` quando `findById` devolve `null` depois de gravar** → **aceitável, sem fix task obrigatória**. A regra do `CLAUDE.md` ("use cases lançam erros de domínio próprios, que carregam o RN violado") trata de recusas de negócio. Esse caminho é uma violação de invariante interna: o agendamento acabou de ser gravado na mesma barbearia, não existe RN a citar e a resposta correta é o `500` genérico. Um `DomainError` sem mapeamento no filtro daria o mesmo `500`. Sugestão cosmética: se o time quiser zero `Error` em `usecases/`, pode trocar por um erro próprio, sem mudar o comportamento.
3. **Swagger com uma resposta por status e as mensagens extras de 404/422 na descrição** → **aceitável**. O OpenAPI só permite um objeto de resposta por status. As descrições listam todas as mensagens reais (404: barbeiro e serviço; 422: as quatro), o exemplo é uma mensagem real, e o 400 de domínio foi mesclado em `oneOf` com o 400 de validação. O AGM-29 pede os status e os perfis, e `MB:621` confere isso.

---

## Gate

- **Comando**: `npm run lint:check && npm run build && npm test && npm run test:e2e` (`lint:check` no lugar de `lint` para não alterar a árvore)
- **Lint**: exit 0
- **Build**: exit 0
- **Unitários**: exit 0. 74 suítes, **809 passed**, 0 failed, 0 skipped (iteração 1: 803)
- **E2E**: exit 0. 36 suítes, **491 passed**, 0 failed, 0 skipped (gate rodado de novo em 825fa35)
- **Contagem antes da feature (74ad24a)**: 714 unitários, 458 e2e (rodados num worktree em 74ad24a)
- **Delta**: +95 unitários, +33 e2e. Nenhum teste removido; 825fa35 só adiciona testes

---

## Iterações

| Iteração | HEAD | Veredito | Gaps |
| -------- | ---- | -------- | ---- |
| 1 | d1fec67 | FAIL | Fix 1: gravação que termina no fechamento/fim da jornada sem teste (M8 sobreviveu). Fix 2: gravação que termina quando outro começa sem teste (M13 sobreviveu). Fix 3 (Minor): mensagem de `client` ausente fora da spec e sem teste |
| 2 | 825fa35 | PASS | Fixes 1 a 3 fechados: `CM:430-455`, `CS:164`, `spec.md:45`. Nenhum código de produção mudou (`git diff d1fec67..825fa35 -- src` só toca `*.spec.ts`) |

Avaliação dos pontos levantados pelo autor (inalterada): (ii) o `throw new Error` depois do `findById` e (iii) o Swagger com uma resposta por status seguem aceitáveis, sem fix task.

---

## Atualização de rastreabilidade

| Requisito | Antes | Depois |
| --------- | ----- | ------ |
| AGM-01 a AGM-30 | Implementing | ✅ Verified |
| Casos de borda "termina quando outro começa" e "termina no fechamento/fim da jornada" | ❌ Needs Fix (iteração 1) | ✅ Verified (iteração 2) |

---

## Resumo

**Overall**: ✅ Pronto

**Spec-anchored check**: 30/30 AGM e 6/6 casos de borda no valor da spec; nenhum ponto de precisão aberto
**Sensor**: iteração 2 com 15/15 mortos (M8 e M13 sobreviveram na iteração 1 e agora morrem)
**Gate**: 809 unitários e 491 e2e passando; lint e build limpos

**O que funciona**: criação manual com origem `manual` pelo motor, sem antecedência mínima; cliente identificado pelo telefone E.164, reuso sem trocar o nome, criação atômica com o agendamento e corrida resolvida por retry único; recusas com status e mensagem da spec (409/422/400/404); regra de perfil antes de qualquer gravação; consulta de horários com e sem barbeiro; RN-26; 401; Swagger; PRD seção 19.

**Próximo passo**: abrir o PR da história.
