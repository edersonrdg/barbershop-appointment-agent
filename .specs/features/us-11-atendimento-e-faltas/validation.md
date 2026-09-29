# US-11 Registro de atendimento, falta e bloqueio automático: validação

## Validation: US-11 - PASS

**Data**: 2026-09-29 (iteração 2)
**Spec**: `.specs/features/us-11-atendimento-e-faltas/spec.md`
**Diff range**: `main..HEAD` na branch `feat/us-11-attendance-and-no-shows` (`e453522` = docs de planejamento; `a61a908..047977d` = T1..T12; correções da iteração 1: `d84eab7` (log do erro por barbearia) e `54004da` (lacunas de teste de ATD-04, ATD-11 e do caso de borda de correção após reset))
**Verifier**: sub-agente independente (autor ≠ verificador), reexecução completa sem herdar o contexto do autor
**Veredito**: PASS. Os 27 ATD, os 4 CA, os 5 casos de borda e as Assumptions têm evidência com asserção no valor definido pela spec. As 4 lacunas da iteração 1 estão fechadas. Gate verde (lint, typecheck, build, 864 unitários, 536 e2e). Das 25 mutações, 24 morreram e a única sobrevivente (U5) é equivalente.

**Histórico de iterações**: iteração 1 FAIL (4 lacunas: log do erro por barbearia, e2e de ATD-04 não discriminante, ATD-11 pelo Barbeiro, correção após reset) → iteração 2 PASS.

---

## Conclusão das tasks

| Task | Status | Commit |
| ---- | ------ | ------ |
| T1 Transição de status no Appointment | ✅ Done | a61a908 |
| T2 Bloqueio e prazo de reset no domínio | ✅ Done | 3137bd0 |
| T3 Migration de atendimento | ✅ Done | db03a99 |
| T4 AppointmentRepository lê e grava status | ✅ Done | 80b901f (+ 61f498c) |
| T5 NoShowLedger | ✅ Done | e117748 |
| T6 Listar ids de barbearias | ✅ Done | 9bba124 |
| T7 MarkAttendanceUseCase | ✅ Done | d20139f |
| T8 ResetExpiredNoShowsUseCase | ✅ Done | 9695249 |
| T9 Schemas de entrada | ✅ Done | c65e949 |
| T10 Erros no filtro | ✅ Done | b3b3b11 |
| T11 Rota PATCH /appointments/{id}/status | ✅ Done | 06c8beb |
| T12 Rotina diária de reset | ✅ Done | 047977d |
| F1 Log do erro por barbearia | ✅ Done | d84eab7 |
| F2 e2e de ATD-04 discriminante | ✅ Done | 54004da |
| F3 ATD-11 pelo Barbeiro | ✅ Done | 54004da |
| F4 Correção após reset | ✅ Done | 54004da |

Nenhuma task bloqueada ou parcial.

---

## Lacunas da iteração 1: reverificação

| # | Lacuna | Evidência do fechamento | Resultado |
| - | ------ | ----------------------- | --------- |
| 1 | O erro de uma barbearia no reset não era logado | `src/usecases/reset-expired-no-shows/reset-expired-no-shows.use-case.ts:86-87` `catch (error) { result.failures.push({ barbershopId, error }) }`; `src/infrastructure/jobs/no-show-reset.job.ts:25-29` um `logger.error({ barbershopId, err: errorIdentity(error) }, 'No-show reset failed for a barbershop.')` por falha; `:43-45` só `name` e `code`. Testes: `JB:50` `expect(errorSpy).toHaveBeenCalledTimes(1)` + `JB:51` `toHaveBeenCalledWith({ barbershopId: 'barbershop-a', err: { name: 'QueryFailedError', code: '57014' } }, 'No-show reset failed for a barbershop.')`, `JB:63-64` log sem `'Maria'` nem `'987654321'` (que estavam na mensagem do erro); `JB:67` sem falhas → `errorSpy` `not.toHaveBeenCalled()`; `RE:123` `failures.map(barbershopId)` `toEqual(['barbershop-a'])` e erro `toBeInstanceOf(Error)`, barbearia B zerada. Mutantes F1, J1, J2, J3 e J4 mortos | ✅ Fechada |
| 2 | e2e de ATD-04 na rota não discriminava | `AT:309-329`: agendamento de 60 min do Bruno (13:00-14:00Z) em andamento às 13:05, marcado `no_show`; `AT:328` `expect(starts[0]).toBe(utc('14:00'))`. Com o mutante E3 (`listBusyPeriods` só `confirmed`) rodando **apenas** `test/attendance.e2e-spec.ts`, o teste falha com `Expected: "2026-10-05T14:00:00.000Z" / Received: "2026-10-05T13:30:00.000Z"` | ✅ Fechada |
| 3 | ATD-11 só para o Dono | `AT:394-417`: cliente bloqueada (`AT:399` `selfBookingBlocked` `true`), Bruno faz `POST /appointments` para si `.expect(201)` (`AT:412`), `AT:415` `client.id` `maria`, `AT:416` `barber.id` `bruno` | ✅ Fechada |
| 4 | Correção após reset só testava a marcação | `MA:340-354`: reset em `TWO_MONDAYS_AGO`, falta posterior já gravada; `MA:352` marcar `no_show` → `noShowCount` `2`; `MA:353` corrigir para `attended` → `1` | ✅ Fechada |

---

## Critérios de aceite ancorados na spec

Abreviações: `AT` = `test/attendance.e2e-spec.ts`, `NR` = `test/no-show-reset.e2e-spec.ts`, `LG` = `test/database/typeorm-no-show-ledger.e2e-spec.ts`, `AR` = `test/database/typeorm-appointment.repository.e2e-spec.ts`, `AS` = `test/database/appointments-schema.e2e-spec.ts`, `CS` = `test/database/clients-schema.e2e-spec.ts`, `BR` = `test/database/typeorm-barbershop.repository.e2e-spec.ts`, `MA` = `src/usecases/mark-attendance/mark-attendance.use-case.spec.ts`, `RE` = `src/usecases/reset-expired-no-shows/reset-expired-no-shows.use-case.spec.ts`, `JB` = `src/infrastructure/jobs/no-show-reset.job.spec.ts`, `AP` = `src/domain/entities/appointment.spec.ts`, `BK` = `src/domain/value-objects/booking-rules.spec.ts`, `NS` = `src/domain/value-objects/no-show-reset.spec.ts`, `SC` = `src/interface-adapters/controllers/schemas/mark-attendance.schema.spec.ts`, `DF` = `src/infrastructure/http/domain-error.filter.spec.ts`.

| Critério | Resultado definido na spec | `file:line` + asserção | Resultado |
| -------- | -------------------------- | ---------------------- | --------- |
| ATD-01 (CA-11.1) marca após o início → `200`, item da agenda + resumo | `200`; agendamento no formato da US-08 com o novo status; `client { id, noShowCount, selfBookingBlocked }` | `AT:243` `marked()` `.expect(200)` (`AT:170`), `AT:246` `toEqual({ appointment: { id, barber: {ana,'Ana'}, client: {maria,'Maria',phone}, services: [Corte], startsAt: 13:00Z, endsAt: 13:30Z, status: 'attended', origin: 'manual' }, client: { id: maria, noShowCount: 0, selfBookingBlocked: false } })`, `AT:259` banco `'attended'`; `MA:139`, `MA:157`; `AP:121` 4 transições; `AR:541` `saveStatus` | ✅ PASS |
| ATD-02 (CA-11.1) antes do início → `422` | `422` "O agendamento ainda não começou.", nada muda | `AT:288` `.expect(422, NOT_STARTED)`, `AT:293` `'confirmed'`; `MA:175` (−1 ms: erro + mensagem, status `'confirmed'`, contador inalterado); `AP:162`; `DF:171` `{ statusCode: 422, body: { message: 'O agendamento ainda não começou.' } }` | ✅ PASS |
| ATD-03 (CA-11.1) agenda mostra o status | `attended`/`no_show` no item da agenda | `AT:268` `toEqual([objectContaining({ id: today, status: 'attended' })])`; `AT:282` idem `'no_show'` | ✅ PASS |
| ATD-04 (RN-03) marcados ocupam o horário (motor e constraint) | como `confirmed` | Constraint: `AS:285` `confirmed`×`attended`/`no_show` nos dois sentidos → `23P01` `appointments_no_overlap`. Motor: `AR:436` `listBusyPeriods` para `attended` e `no_show`; rota: `AT:328` `starts[0]` `toBe(utc('14:00'))` (mata E3 sozinho) | ✅ PASS |
| ATD-05 mesmo status → `200`, contador igual | `200`, contador inalterado | `MA:193` `client` `toEqual({ id: 'maria', noShowCount: 1, selfBookingBlocked: false })`; `AP:144`; `AT:453` remarca o status final com `200` | ✅ PASS |
| ATD-06 sem cliente → `client: null` | `200`, `client: null`, status gravado | `AT:302` (200), `AT:304` `toBeNull()`, `AT:306` `'no_show'` no banco; `MA:208` | ✅ PASS |
| ATD-07 (RN-11) falta soma 1 | +1 | `MA:219` `noShowCount` `1`; `LG:110` `countFor` `2` (ignora `attended`, `confirmed`, outro cliente); `AT:341` `2` | ✅ PASS |
| ATD-08 (RN-12) bloqueado se contador ≥ limite | `selfBookingBlocked: true` | `BK:103` limite 2: 1→`false`, 2→`true`, 3→`true`; `MA:228`; `AT:341` | ✅ PASS |
| ATD-09 (CA-11.2) 1 falta, limite 2, nova falta | `noShowCount: 2`, `selfBookingBlocked: true` | `AT:341` `toEqual({ id: maria, noShowCount: 2, selfBookingBlocked: true })`; `MA:228` | ✅ PASS |
| ATD-10 (RN-12) segue o limite vigente | limite 3 → `false` | `AT:354` `PUT /settings/rules` `noShowLimit: 3`, `AT:362` `toEqual({ id: maria, noShowCount: 2, selfBookingBlocked: false })`; `MA:245`; `BK:124` | ✅ PASS |
| ATD-11 (RN-12) manual para bloqueado (Dono ou Barbeiro) | gravado como qualquer manual | Dono: `AT:369` → `.expect(201)` (`AT:387`), `client.id` `maria`. Barbeiro: `AT:394` → `.expect(201)` (`AT:412`), `AT:415`/`AT:416` | ✅ PASS |
| ATD-12 (RN-26) só a barbearia | faltas de outra barbearia não contam | `LG:143` `countFor(A)` `0`, `countFor(B)` `1` (mata E4); `MA:277` | ✅ PASS |
| ATD-13 (CA-11.4) `no_show → attended` | 2 faltas, limite 2 → `1`, `false` | `AT:430` `toEqual({ id: maria, noShowCount: 1, selfBookingBlocked: false })`, `AT:435` `'attended'`; `MA:292`; `AP:121` | ✅ PASS |
| ATD-14 (CA-11.4) `attended → no_show` | +1 | `AT:443` `noShowCount` `1`; `MA:311`; `AP:121` | ✅ PASS |
| ATD-15 (RN-13) anterior ao reset não conta | status gravado, contador igual | `MA:322` marcar e corrigir `old`: `noShowCount` `1` nas duas, status final `'attended'`; `LG:157` (mata E1); `CS:142`/`CS:148` | ✅ PASS |
| ATD-16 concorrência | status final é um dos enviados; contador corresponde | `AT:446` dois `PATCH` paralelos `200`, `AT:454` `toContain(final)`, `AT:455` `final === 'no_show' ? 1 : 0`; `MA:356` | ✅ PASS |
| ATD-17 `400` com mensagens | "Informe um id de agendamento válido." / "Informe o status: attended ou no_show." | `AT:461` `.expect(400, { message: 'Dados inválidos.', errors: [{ field: 'id', message: 'Informe um id de agendamento válido.' }] })`; `AT:469` `confirmed`/`cancelled`/ausente → mensagem do status e `AT:481` `'confirmed'`; `SC:30`, `SC:47` | ✅ PASS |
| ATD-18 (RN-26) `404` | "Agendamento não encontrado." | `AT:522`/`AT:526` `.expect(404, NOT_FOUND)`, `AT:531` `'confirmed'`; `MA:369`; `DF:164`; `AR:517`; `AR:562` (mata E8) | ✅ PASS |
| ATD-19 Barbeiro nos próprios | como ATD-01 | `AT:498` `marked(own, 'no_show', brunoToken)`, `AT:500` `toMatchObject({ id: own, barber: { id: bruno, name: 'Bruno' }, status: 'no_show' })` (mata E6); `MA:387` | ✅ PASS |
| ATD-20 Barbeiro em outro / sem ficha → `403` | "Acesso negado.", nada muda | `AT:509`/`AT:513` `.expect(403, FORBIDDEN)`, `AT:518` `'confirmed'`; `MA:400`, `MA:415` (matam U3) | ✅ PASS |
| ATD-21 sem sessão → `401` | `401` | `AT:488` `.expect(401, UNAUTHORIZED)`, `AT:489` `'confirmed'` | ✅ PASS |
| ATD-22 Swagger | resumo US-11; payload; `200/400/401/403/404/422`; perfis | `AT:541` `summary` `toContain('US-11')`, `AT:542` `requestBody`, `AT:543` `'x-roles': ['owner','barber']`, `AT:544` `'**Acesso:** Dono, Barbeiro.'`, `AT:545` `toEqual(['200','400','401','403','404','422'])`; `test/api-docs.e2e-spec.ts` passa | ✅ PASS |
| ATD-23 (CA-11.3) ≥ 90 dias zera | contador 0, desbloqueado | `RE:79` `toEqual({ noShowCount: 0, selfBookingBlocked: false })`, `resetAtOf` = agora; `LG:180`; `NR:138`/`NR:139` `toEqual(NOW)`; `NS:8` | ✅ PASS |
| ATD-24 (RN-13) < 90 dias mantém | contador mantido | `RE:95` `{ 2, true }`, `resetAtOf` `null`, `result` `toEqual({ clientsReset: 2, failures: [] })`; `LG:180`; `NR:140` `toBeNull()` | ✅ PASS |
| ATD-25 (RN-13) idempotente | segunda execução igual | `RE:108` `second` `toEqual({ clientsReset: 0, failures: [] })` e contadores iguais; `LG:248` (mata E9) | ✅ PASS |
| ATD-26 (RN-13) 03:00 `America/Sao_Paulo` | `0 3 * * *`, fuso SP | `NR:105` `toBe('0 3 * * *')`, `NR:106` `toBe('America/Sao_Paulo')` (mata E7) | ✅ PASS |
| ATD-27 (RN-26) por barbearia; falha isolada e logada | cada tenant à parte; erro de uma é logado e as demais seguem | `RE:123` falha na A → `failures` `['barbershop-a']`, B zerada (mata U6, F1); `JB:37` log de erro por barbearia com id e `name`/`code` (mata J1, J2, J3); `JB:58` resumo `{ clientsReset: 3, failedBarbershops: 1 }` (mata J4); `LG:231` (mata E5); `BR:212`; `NR:139` | ✅ PASS |

### Critérios de aceite do PRD

| CA | Evidência |
| -- | --------- |
| CA-11.1 | `AT:243`, `AT:271`, `AT:285`, `AT:296`; `MA:139..208`; `AP:121..162` |
| CA-11.2 | `AT:333`, `AT:348`; `MA:219..264`; `BK:103..124` |
| CA-11.3 | `NR:109`; `RE:79..108`; `LG:180`; `NS:8` |
| CA-11.4 | `AT:421`, `AT:438`, `AT:446`; `MA:292`, `MA:311`, `MA:356` |

**Status**: ✅ 27/27 ATD e 4/4 CA com asserção no valor definido pela spec. Nenhuma spec-precision gap.

### Regra de payload/conjunção

- **200 da marcação**: `AT:246` compara o objeto inteiro por valor.
- **Resumo do cliente**: `AT:341`, `AT:362`, `AT:430` e os casos de `MA` comparam `{ id, noShowCount, selfBookingBlocked }` inteiro.
- **Log da rotina**: `JB:51` compara o payload do erro por valor (`barbershopId` + `err { name, code }`); `JB:58` e `NR:141` comparam o resumo `{ clientsReset, failedBarbershops }` por valor.

---

## Casos de borda

- [x] `agora == startsAt` aceito: `AP:156`; `MA:166` (matam U1).
- [x] Falta exatamente 90 dias antes zera: `LG:180` (`atCutoff`); `RE:79`; `NR:114` (matam E2, U7).
- [x] A falta mais recente manda no reset: `LG:180` (`recentAfterOld` → `resetAtOf` `toBeNull()`, `countFor` `2`).
- [x] Correção depois de um reset, agendamento posterior ao reset: `MA:340` marca (`2`) e corrige (`1`).
- [x] Limite 1 bloqueia na primeira falta: `BK:114`; `MA:264` `toEqual({ id: 'maria', noShowCount: 1, selfBookingBlocked: true })`.

### Assumptions verificadas

| Assumption | Evidência | Resultado |
| ---------- | --------- | --------- |
| Data da falta = `startsAt` | SQL `a.starts_at` em `typeorm-no-show-ledger.ts:15,31-37`; `LG:180` | ✅ |
| Contador nunca negativo | `COUNT(*)` derivado (`typeorm-no-show-ledger.ts:9`) | ✅ (por construção) |
| Rota, resposta, status das recusas | `AT:246`, `AT:288`, `AT:509`, `AT:522`; `DF:164`, `DF:171` | ✅ |
| Concorrência | `AT:446`; `MA:356` | ✅ |
| Horário da rotina + idempotência | `NR:102`; `RE:108`; `LG:248` | ✅ |
| Rotina e multi-tenant | `RE:123`; `LG:231`; `BR:212` | ✅ |
| Falha da rotina: o erro de uma barbearia é logado e as demais continuam | "Continuam": `RE:123`. "Logado": `no-show-reset.job.ts:25-29`, `JB:37` | ✅ (Gap 1 fechado) |
| Agendamento manual de cliente bloqueado (Dono e Barbeiro) | `AT:369`, `AT:394` | ✅ |
| Observabilidade/LGPD: log com número de clientes zerados, sem telefone ou nome | `NR:141` resumo; `NR:145-154` sem nomes/telefones; `JB:63-64` o erro com nome e telefone na mensagem não vaza (`errorIdentity` só `name`/`code`, `no-show-reset.job.ts:43-45`) | ✅ |
| Ocupação do horário | ATD-04 | ✅ |

---

## Discrimination Sensor

Worktree temporária fora do repositório (`<scratchpad>/wt`, detached em `54004da`), `node_modules` por symlink, `.env` copiado para a worktree. Unitários: suíte completa por mutação. e2e: em série (`--runInBand`), contra o Postgres do compose, só depois do gate e2e da árvore real terminar. Cada mutação foi aplicada por substituição exata de texto, testada e revertida com `git checkout`. No fim: `git worktree remove --force` + `prune`; `git status --porcelain` da árvore real igual à baseline (` M .specs/LESSONS.md`, ` M .specs/lessons.json`, `?? .../validation.md`).

| # | Arquivo | Mutação | Testes que falharam | Morreu? |
| - | ------- | ------- | ------------------- | ------- |
| U1 | `src/domain/entities/appointment.ts:69` | `now < startsAt` → `<=` | `AP:156`, `MA:166` | ✅ |
| U2 | `src/domain/value-objects/booking-rules.ts:77` | `>=` → `>` | 7 (`BK`, `MA`, `RE`) | ✅ |
| U3 | `src/usecases/mark-attendance/mark-attendance.use-case.ts:48` | remove `assertCanManage` | `MA:400`, `MA:415` | ✅ |
| U4 | `mark-attendance.use-case.ts:50` | `!==` → `===` | 16 de `MA` | ✅ |
| U5 | `mark-attendance.use-case.ts:50` | grava sempre (`\|\| true`) | nenhum | ❌ sobreviveu, **equivalente** |
| U6 | `src/usecases/reset-expired-no-shows/reset-expired-no-shows.use-case.ts:87` | `catch` relança | `RE:123` | ✅ |
| U7 | `src/domain/value-objects/no-show-reset.ts:5` | 90 → 89 dias | `NS:4`, `NS:8`, `RE:95`, `RE:108` | ✅ |
| U8 | `mark-attendance.use-case.ts:71-73` | sempre `BookingRules.defaults()` | `MA:245`, `MA:264` | ✅ |
| U9 | `mark-attendance.use-case.ts:49` | "agora" = 2100 (ignora o relógio) | `MA:175` | ✅ |
| U10 | `appointment.ts:75` | devolve o status antigo | 21 | ✅ |
| F1 | `reset-expired-no-shows.use-case.ts:87` | não empurra para `failures` | `RE:123` | ✅ |
| J1 | `src/infrastructure/jobs/no-show-reset.job.ts:26-29` | remove o `logger.error` por barbearia | `JB:37` | ✅ |
| J2 | `no-show-reset.job.ts:44-45` | loga `error.message` no lugar de `name`/`code` | `JB:37` | ✅ |
| J3 | `no-show-reset.job.ts:27` | tira o `barbershopId` do log de erro | `JB:37` | ✅ |
| J4 | `no-show-reset.job.ts:32` | `failedBarbershops: 0` fixo | `JB:37` | ✅ |
| E1 | `src/infrastructure/database/repositories/typeorm-no-show-ledger.ts:15` | `countFor` sem o filtro do último reset | `LG:157`, `LG:180`, `LG:248` | ✅ |
| E2 | `typeorm-no-show-ledger.ts:37` | `<= cutoff` → `<` | `LG:180`, `NR:109` | ✅ |
| E3 | `src/infrastructure/database/repositories/typeorm-appointment.repository.ts:42` | `listBusyPeriods` só `confirmed` | `AT:309` (sozinho: recebido `13:30Z`, esperado `14:00Z`), `AR:436` ×2 | ✅ |
| E4 | `typeorm-no-show-ledger.ts:12` | `countFor` sem filtro de barbearia | `LG:143` | ✅ |
| E5 | `typeorm-no-show-ledger.ts:29` | `resetExpired` sem filtro de barbearia | `LG:231` | ✅ |
| E6 | `src/interface-adapters/controllers/appointments.controller.ts:157` | `@Roles('owner')` só | `AT:492`, `AT:536` | ✅ |
| E7 | `no-show-reset.job.ts:19` | `timeZone: 'UTC'` | `NR:102` | ✅ |
| E8 | `typeorm-appointment.repository.ts:87` | `saveStatus` sem `barbershopId` | `AR:562` | ✅ |
| E9 | `typeorm-no-show-ledger.ts:36` | `resetExpired` sem o filtro do último reset na subconsulta | `LG:248` | ✅ |

(E3 foi executado duas vezes: com `AT`+`AR` e só com `AT`, para provar que o e2e da rota discrimina sozinho.) Nenhuma morte veio de erro de compilação (sem `error TS` nas saídas).

**U5 é equivalente:** gravar um status igual ao já gravado é um `UPDATE` que não altera a linha; o contador é derivado do status (ATD-05). Sob concorrência, o resultado continua sendo "um dos status enviados" (ATD-16). Nenhum comportamento da spec separa as duas versões.

**Sensor depth**: expandido (P0: integridade de dados e caminho central de domínio): 24 mutações distintas (25 execuções).
**Resultado**: 23/24 mortas e 1 equivalente (U5) - PASS ✅

---

## Code Quality

| Princípio | Status |
| --------- | ------ |
| Código mínimo | ✅ A correção só troca o contador de falhas por uma lista e loga no job; sem port de log novo |
| Mudanças cirúrgicas | ✅ `d84eab7` toca use case, job, specs e docs; `54004da` só testes |
| Sem escopo extra | ✅ Nada de US-12/17/22 |
| Segue os padrões | ✅ Padrão de log de erro com `{ err: { name, code } }` igual ao de `smtp-email-sender.ts:50-53` |
| Resultado ancorado na spec | ✅ |
| Cobertura por camada | ✅ Domínio 1:1; rotas com happy, borda e erro; e2e de motor discriminante |
| Todo teste mapeia um requisito | ✅ Os testes novos citam ATD/CA/RN |
| Diretrizes (`CLAUDE.md`) | ✅ RN-26; Swagger; LGPD nos logs (mensagem do erro nunca logada); `synchronize: false` |

---

## Gate Check

- **Gate command**: `npm run lint:check && npm run typecheck && npm run build && npm test && npm run test:e2e`
- **Resultado**: lint 0, typecheck 0, build 0; unitários **864 passed / 864** (79 suites); e2e **536 passed / 536** (39 suites); 0 falhas, 0 skips.
- **Test count before feature (unit, `main`)**: 809
- **Test count after feature (unit)**: 864 (iteração 1: 862; +2 do `no-show-reset.job.spec.ts`)
- **Delta**: +55 unitários; e2e 491 → 536 (+45; +1 na iteração 2, ATD-11 pelo Barbeiro)
- **Skipped tests**: nenhum
- **Failures**: nenhuma
- **Integridade**: nenhuma asserção enfraquecida; `RE:123` trocou `toEqual({ clientsReset: 1, failedBarbershops: 1 })` por asserções equivalentes sobre `failures` (id + instância de erro); `AT:309` trocou uma asserção fraca por `starts[0]` exato.

---

## Fix Plans

Nenhum.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| ATD-01..ATD-27 | Implementing (iteração 1: ATD-04 ⚠️, ATD-11 ⚠️, ATD-27 ❌) | ✅ Verified |

---

## Summary

**Overall**: ✅ Ready (iteração 2)

**Spec-anchored check**: 27/27 ATD e 4/4 CA com asserção no valor da spec; Assumptions atendidas.
**Sensor**: 24 mutações distintas: 23 mortas e 1 equivalente (U5).
**Gate**: lint, typecheck e build ok; 864 unitários; 536 e2e.

**O que funciona**: marcação a partir de `agora ≥ startsAt`; correção nos dois sentidos; contador derivado isolado por barbearia e respeitando o último reset; bloqueio pelo limite vigente; manual para bloqueado (Dono e Barbeiro); rota com 400/401/403/404/422 e Swagger; rotina às 03:00 de São Paulo, idempotente, isolada por barbearia e com log de erro por barbearia sem dados pessoais; constraint e motor tratando os três status como ocupados.

**Próximos passos**: abrir o PR da história.
