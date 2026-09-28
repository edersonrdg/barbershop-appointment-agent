# US-06 Configuração das regras de agendamento: validação

## Validation verdict: PASS ✅

**Data**: 2026-09-28
**Rodada**: 1
**Spec**: `.specs/features/us-06-regras-de-agendamento/spec.md`
**Diff range**: `main..feat/us-06-booking-rules` (9 commits: `f95c08e`..`59dd743`)
**Verifier**: sub-agente independente (autor ≠ verifier)

Os 16 requisitos (RUL-01 a RUL-16) e os 6 edge cases da spec têm evidência `file:line` com asserção no valor definido pela spec. Os quatro gates passam na árvore real. O sensor injetou 6 mutantes (2 de domínio, 1 de `CHECK` na migration, 1 de backfill, 1 de isolamento de tenant no repositório, 1 de coerção no Zod); todos morreram. Nenhum spec-precision gap, nenhum `SPEC_DEVIATION`.

---

## Conclusão das tasks

| Task | Status | Commit |
| ---- | ------ | ------ |
| T1 Value object `BookingRules` | ✅ Feita | `f95c08e` |
| T2 Migration + entidade ORM | ✅ Feita | `75fe52c` (retificado em `2c60a29`) |
| T3 Port + repositório TypeORM das regras | ✅ Feita | `63107ae` |
| T4 Barbearia nova nasce com regras padrão | ✅ Feita | `b887c5f` |
| T5 `GetBookingRulesUseCase` | ✅ Feita | `fad1482` |
| T6 `UpdateBookingRulesUseCase` | ✅ Feita | `1ef4ed2` |
| T7 Schema Zod do corpo | ✅ Feita | `a95df71` |
| T8 Rotas `GET`/`PUT /settings/rules` | ✅ Feita | `59dd743` |

`tasks.md` não tem nenhum checkbox aberto. Não há marcador `SPEC_DEVIATION` em `src/` nem em `test/`.

---

## Critérios de aceite ancorados na spec

Abreviações: `DOM` = `src/domain/value-objects/booking-rules.spec.ts`, `SCH-U` = `src/interface-adapters/controllers/schemas/booking-rules.schema.spec.ts`, `UC-G` = `src/usecases/get-booking-rules/get-booking-rules.use-case.spec.ts`, `UC-U` = `src/usecases/update-booking-rules/update-booking-rules.use-case.spec.ts`, `REG` = `src/usecases/register-barbershop/register-barbershop.use-case.spec.ts`, `E2E` = `test/booking-rules.e2e-spec.ts`, `SCH-E` = `test/database/booking-rules-schema.e2e-spec.ts`, `REPO` = `test/database/typeorm-booking-rules.repository.e2e-spec.ts`, `BARB-E` = `test/database/typeorm-barbershop.repository.e2e-spec.ts`.

| Requirement | Resultado definido na spec | `file:line` + asserção | Resultado |
| ----------- | --------------------------- | ----------------------- | --------- |
| RUL-01 · CA-06.1 barbearia nova nasce com os padrões | 60/120/2/15/30 gravados na criação | `REG:45-68` (`RegisterBarbershopUseCase`, fake): `toEqual({ minimumAdvanceMinutes: 60, cancellationDeadlineMinutes: 120, noShowLimit: 2, waitlistOfferMinutes: 15, returnReminderDays: 30 })`; gravação real: `BARB-E:181-211` `CA-06.1: createWithOwner writes the booking rules it receives` (`SELECT * FROM barbershop_booking_rules` `toEqual([{...60,120,2,15,30}])`) | ✅ PASS |
| RUL-02 · CA-06.1 `GET` de barbearia nova | 200 com `{60,120,2,15,30}` exato | `E2E:108-113`: `response.status).toBe(200)`, `response.body).toEqual(DEFAULT_RULES)` | ✅ PASS |
| RUL-03 · CA-06.1 migration preenche barbearias existentes | os cinco padrões gravados em toda barbearia já existente | `SCH-E:136-167` `CA-06.1: the migration writes the five defaults on barbershops that already exist`: `rows).toEqual([...].map(id => ({ id, minimum_advance_minutes: 60, cancellation_deadline_minutes: 120, no_show_limit: 2, waitlist_offer_minutes: 15, return_reminder_days: 30 })))` | ✅ PASS |
| RUL-04 · CA-06.2 `PUT` substitui e responde 200 com o salvo | 200 com as cinco regras enviadas | `E2E:131-137` `CA-06.2: saves the five rules, answers 200 with them...`: `response.status).toBe(200)`, `response.body).toEqual(NEW_RULES)` | ✅ PASS |
| RUL-05 · CA-06.2 `GET` depois do `PUT` devolve o enviado | mesmos valores do `PUT` | `E2E:136` (`currentRules()).toEqual(NEW_RULES)` na mesma asserção de RUL-04); unit: `UC-U:59-67` (`CA-06.2: the next repository read returns the new rules for the same barbershop`) | ✅ PASS |
| RUL-06 · CA-06.2 leitura vigente do repositório | a chamada seguinte ao repositório devolve os novos valores, mesma barbearia | `REPO:128-134` `CA-06.2: after save, the next read returns the new rules`: `toPlain(await repository.findByBarbershopId(barbershopA))).toEqual(NEW_RULES)`; unit `UC-U:59-67` | ✅ PASS |
| RUL-07 · CA-06.2 nada além das regras muda | nome, endereço, fuso e horário de funcionamento inalterados | `E2E:191-205` `CA-06.2: leaves name, address, timezone and opening hours...`: `settings.body).toEqual(SETTINGS)` (feito antes do `PUT` de regras); `REPO:150-156` `CA-06.2: save leaves the barbershop row and its opening hours untouched`: snapshot de `barbershops` + `barbershop_opening_hours` igual antes/depois | ✅ PASS (nota abaixo) |
| RUL-08 · CA-06.2 zero aceito em antecedência/cancelamento | grava e devolve 0 nos dois campos | `E2E:139-151` `CA-06.2: accepts and saves 0...`: `response.body).toEqual(zeros)`, `currentRules()).toEqual(zeros)`; domínio `DOM:37-46`; unit `UC-U:79-92` | ✅ PASS |
| RUL-09 · CA-06.3 negativo → 400 no campo, nada muda | 400, `errors:[{field,message}]`, estado anterior mantido | `E2E:212-229` `rejects a negative noShowLimit...`: body exato `{ message: 'Dados inválidos.', errors: [{ field: 'noShowLimit', message: 'Informe o limite de faltas, de 1 a 10.' }] }`, `currentRules()).toEqual(NEW_RULES)` | ✅ PASS |
| RUL-10 · CA-06.3 ausente/`null`/`""` → 400 no campo | 400 com o campo, nada muda | `E2E:231-269` (ausente, `""`); `SCH-U:96-113` (`%s missing`, `%s null`, `%s empty string`, it.each nos 5 campos): `issuesOf(...)).toEqual([{ field, message: MESSAGES[field] }])` | ✅ PASS |
| RUL-11 · CA-06.3 formato/limite/múltiplo de 5 → 400 no campo | 400 com o campo, para não-inteiro, fora do limite e fora do múltiplo de 5 | `SCH-U:116-143` (it.each 20 casos: `10085`, `7` fora do múltiplo, `60.5`, `'60'`, etc.); `E2E:271-309` (string numérica e um passo além, via HTTP) | ✅ PASS |
| RUL-12 · CA-06.3 invariante no domínio | `InvalidValueError` para fora dos limites | `DOM:68-97` `CA-06.3: rejects negative, out-of-range and non-integer values...`: `toThrow(InvalidValueError)`; `UC-U:94-115` (`rejects.toBeInstanceOf(InvalidValueError)`, nada salvo) | ✅ PASS |
| RUL-13 · CA-06.3 `CHECK` no banco | `23514` para fora dos limites/negativo, inclusive `UPDATE` | `SCH-E:91-118` (it.each 15 casos): `rejects.toMatchObject({ driverError: { code: '23514' } })`, `countRules()).toBe(0)`; `SCH-E:120-134` (`UPDATE` que quebra a regra, linha mantida) | ✅ PASS |
| RUL-14 Barbeiro → 403 | 403 `{ message: 'Acesso negado.' }`, nada muda | `E2E:115-120` (`GET`), `E2E:312-318` (`PUT`, `currentRules()).toEqual(DEFAULT_RULES)`) | ✅ PASS |
| RUL-15 sem sessão → 401 | 401 | `E2E:122-127` (`GET`), `E2E:320-326` (`PUT`, regras inalteradas) | ✅ PASS |
| RUL-16 · RN-26 só a barbearia da sessão | ignora `barbershopId` no corpo/query/header; lê/grava só o tenant da sessão | `E2E:328-346` `RN-26: the PUT of A changes only A, even with the id of B in body, query and header`: `barbershopId` de B na query, no header `x-barbershop-id` e no corpo, resposta e `currentRules()` continuam de A; `currentRules(otherToken)).toEqual(DEFAULT_RULES)`; repositório `REPO:158-175` (`RN-26` save de A não muda B e vice-versa) | ✅ PASS |

**Status**: ✅ 16/16 requisitos cobertos. Nenhum spec-precision gap: cada requisito define status, corpo, campo ou constraint exatos, e as asserções miram esses valores.

Nota sobre RUL-07: a spec pede que "todas as linhas de outras tabelas" fiquem intactas. O teste e2e confere só `barbershops` (via `GET /settings/barbershop`) e o teste de repositório faz snapshot de `barbershops` + `barbershop_opening_hours`. Não há um teste que faça snapshot de `users` ou de outras tabelas quaisquer. Isso não chega a spec-precision gap porque a implementação torna o resultado estruturalmente garantido: `TypeOrmBookingRulesRepository.save` (`src/infrastructure/database/repositories/typeorm-booking-rules.repository.ts:23-27`) faz um único `UPDATE` na tabela `barbershop_booking_rules`, sem tocar em nenhuma outra tabela — mas registro como observação de cobertura, não como falha.

Nomes dos testes (CLAUDE.md): todos os testes citam `CA-06.x` ou `RN-26` no nome ou no `describe`, exceto os dois testes "a barbershop without rules throws..." (`UC-G`/`UC-U`), que cobrem uma condição estrutural (barbearia sem linha de regras) sem `CA` correspondente na spec — mesmo padrão observado na US-05 para requisitos sem `CA`.

---

## Edge Cases

- [x] Campos extras (inclusive `barbershopId`) ignorados: `SCH-U:43-50` `CA-06.2: accepts five valid rules and drops extra fields such as barbershopId` (`result).toEqual(validBody())` sem `barbershopId`)
- [x] Limite exato aceito nas três camadas: domínio `DOM:48-66`; Zod `SCH-U:62-79`; banco `SCH-E:74-89`; API `E2E:153-179` (`accepts every exact upper/lower limit`)
- [x] Um passo além do limite recusado nas três camadas: domínio `DOM:68-97`; Zod `SCH-U:116-143`; banco `SCH-E:91-118`; API `E2E:291-309`
- [x] String numérica (`"60"`) recusada sem converter: `SCH-U:121,125,129,133,137` (`'60'`,`'120'`,`'2'`,`'15'`,`'30'` em cada campo); `E2E:271-289` `rejects a numeric string without converting it`
- [x] Mesmo `PUT` duas vezes → mesmo estado, 200 nas duas: `E2E:181-189` `CA-06.2: repeating the same PUT answers 200 and ends in the same state`
- [x] Outra barbearia continua igual: `E2E:328-346` (RN-26); `UC-U:69-77` `RN-26: changes only the barbershop of the session`; `REPO:158-175`

---

## Sensor de discriminação

Scratch isolado: `git worktree add <scratchpad>/verifier-wt HEAD`, com `node_modules` em symlink e `.env` copiado. Baseline do porcelain da árvore real: vazio, antes e depois do sensor (confirmado com `git status --porcelain`). `git stash` não foi usado; cada mutação foi revertida com `git checkout -- <arquivo>` no worktree antes da próxima.

Para o mutante de `CHECK` da migration, a `global-setup` de e2e só roda migrations pendentes (AD-006) — a migration desta história já está aplicada no Postgres compartilhado do compose, então editar o arquivo da migration não muda a constraint já existente. Para tornar esse mutante observável sem tocar o ambiente real, criei um banco descartável (`CREATE DATABASE barbershop_verifier_mutant`, mesmo usuário do compose) só para essa checagem, rodei a suíte de e2e apontada para ele (migrations completas, incluindo a mutada, do zero) e depois `DROP DATABASE`. Rodei o mesmo teste antes disso contra o banco real (já migrado) para documentar que ali o mutante sobrevive por motivo de ambiente, não por fraqueza da asserção.

| # | File:line | Descrição | Morto? |
| - | --------- | --------- | ------ |
| M1 | `src/domain/value-objects/booking-rules.ts:104` (`isIntegerBetween`) | `value <= max` → `value < max` (rejeita o limite superior exato) | ✅ Morto (5 em `DOM`: `minimumAdvanceMinutes=10080`, `cancellationDeadlineMinutes=10080`, `noShowLimit=10`, `waitlistOfferMinutes=120`, `returnReminderDays=365`) |
| M2 | `src/domain/value-objects/booking-rules.ts:76-81` (`isValidDeadlineMinutes`) | remove `minutes % DEADLINE_STEP_MINUTES === 0` (aceita qualquer valor não múltiplo de 5) | ✅ Morto (4: `DOM` `minimumAdvanceMinutes=7`, `cancellationDeadlineMinutes=7`; `SCH-U` `minimumAdvanceMinutes=7`, `cancellationDeadlineMinutes=7`) |
| M3 | `src/infrastructure/database/migrations/1790601890528-AddBookingRules.ts:8` (`CHECK` de `no_show_limit`) | `BETWEEN 1 AND 10` → `BETWEEN 1 AND 11` | ⚠️ Sobrevive contra o banco já migrado (esperado, AD-006) — ✅ Morto (1, `no_show_limit = 11`) contra banco descartável com migrations do zero |
| M4 | `src/infrastructure/database/migrations/1790601890528-AddBookingRules.ts:16` (backfill) | `no_show_limit` literal `2` → `3` no `INSERT ... SELECT` | ✅ Morto (1, `SCH-E:136-167`, teste chama `migration.up`/`.down` diretamente em transação própria — não depende de rodar a migration de novo) |
| M5 | `src/infrastructure/database/repositories/typeorm-booking-rules.repository.ts:23-27` (`save`) | `update({ barbershopId }, ...)` → `update({}, ...)` (ignora o tenant) | ✅ Morto (5 em `REPO`; o próprio TypeORM recusa critério vazio com `TypeORMError: Empty criteria(s) are not allowed`, e os testes RN-26 falhariam de qualquer forma) |
| M6 | `src/interface-adapters/controllers/schemas/booking-rules.schema.ts:32` (`ruleField`) | `z.number(...)` → `z.coerce.number(...)` (converte string numérica) | ✅ Morto (9 em `SCH-U`, ex.: `noShowLimit = "2"`, `waitlistOfferMinutes = "15"`, `returnReminderDays = "30"`) |

**Profundidade do sensor**: expandida (6 mutantes manuais cobrindo domínio, `CHECK` de banco, backfill de migration, isolamento de tenant e a borda Zod, conforme pedido para esta história).
**Resultado**: 6/6 mortos (M3 morto no ambiente correto para observá-lo; nenhum mutante sobrevive de forma real).

Isolamento: o porcelain da árvore real estava vazio antes do sensor e continuou vazio depois. O worktree foi removido (`git worktree remove --force`) e o banco descartável foi apagado (`DROP DATABASE barbershop_verifier_mutant`). `git worktree list` mostra só a árvore principal.

---

## Code Quality

| Princípio | Status |
| --------- | ------ |
| Código mínimo | ✅ |
| Mudanças cirúrgicas: só `BarbershopRepository.createWithOwner` ganhou o terceiro parâmetro (`bookingRules`) e os testes/gateways que o chamavam foram atualizados | ✅ |
| Sem escopo extra: nenhuma tela, nenhuma aplicação de regra (US-07/11/18/24/25 fora do escopo), nenhum histórico de alterações | ✅ |
| Segue os padrões (port + fake + TypeORM da US-05, `ZodValidationPipe`, `ApiZodResponse`, `AD-007` só-Dono sem `@Roles`) | ✅ |
| Spec-anchored outcome check | ✅ |
| Cobertura por camada: domínio 1:1 com limites exatos nas 4 camadas (domínio, Zod, banco, API); rotas com sucesso, edge cases, erro, 401 e 403 | ✅ |
| Todo teste mapeia um RUL, edge case ou Done-when | ✅ |
| Diretrizes documentadas seguidas: `CLAUDE.md` (Testes, Swagger, RN-26, dinheiro/datas não se aplicam aqui), lição L-002 (fronteira exata no `CHECK`) | ✅ |

Observações não bloqueantes:

1. Ver nota de RUL-07 acima: cobertura de "todas as linhas de outras tabelas" é garantida por construção (`save` só toca `barbershop_booking_rules`), não por um teste que faça snapshot de todas as tabelas.
2. `test/database/typeorm-password-reset.repository.e2e-spec.ts` e `typeorm-user.repository.e2e-spec.ts` só precisaram do novo parâmetro `BookingRules.defaults()` em `createWithOwner` — mudança mecânica, sem relação direta com US-06 além de manter a assinatura do port.

---

## Gate Check

- **Comando de gate**: `npm run lint:check && npm run build && npm test && npm run test:e2e` (tasks.md, nível Build; usei `lint:check` para não alterar arquivos)
- **Resultado**: lint 0 erros; build ok; unitários 481 passaram, 0 falharam (54 suites); e2e 346 passaram, 0 falharam (25 suites)
- **Contagem antes da feature** (medida em `main`, worktree descartável): 383 unitários (50 suites); 294 e2e (22 suites)
- **Contagem depois da feature**: 481 unitários (54 suites); 346 e2e (25 suites)
- **Delta**: +98 unitários, +52 e2e
- **Testes pulados**: nenhum
- **Falhas**: nenhuma

---

## Requirement Traceability Update

| Requirement | Status anterior | Status novo |
| ----------- | --------------- | ----------- |
| RUL-01 a RUL-16 | Implementing | ✅ Verified |

---

## Summary

**Overall**: ✅ Pronto

**Spec-anchored check**: 16/16 requisitos e 6/6 edge cases com asserção no valor da spec; 0 spec-precision gaps (1 observação de cobertura não bloqueante em RUL-07)
**Sensor**: 6/6 mutantes mortos (domínio, `CHECK`, backfill, tenant, Zod)
**Gate**: 481 unitários + 346 e2e passaram; lint e build ok

**O que funciona**: as cinco regras nascem com os padrões do CA-06.1 em toda barbearia nova (cadastro) e já existente (migration); `GET`/`PUT /settings/rules` só para o Dono, com o mesmo formato nas duas rotas; limites e múltiplo de 5 aplicados em três camadas (domínio, Zod, `CHECK` no banco); isolamento de tenant garantido mesmo com `barbershopId` forjado no corpo, na query e no header; Swagger das 2 rotas (o `api-docs.e2e-spec.ts` passa).

**Problemas encontrados**: nenhum bloqueante. Uma observação de cobertura (RUL-07, snapshot parcial de "outras tabelas") e uma nota sobre a limitação de observar mutação de migration num Postgres compartilhado (AD-006), já contornada no sensor.

**Próximos passos**: nenhuma fix task. A feature pode seguir para o merge.
