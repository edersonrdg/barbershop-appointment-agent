# US-19: Lembretes de 24h e 1h verification

**Verdict**: PASS
**Profile**: standard
**Diff range**: 060a438..2bc11ba
**Round**: 2 - scoped
**Verifier**: independent sub-agent (author != verifier)

Sou o Verifier independente da rodada 2; não escrevi este código nem o relatório da rodada 1 (feito por outro Verifier em `cab6af9`, veredito FAIL). Li `references/verify.md` (seção "Re-verifying after a fix"), `plan.md`, `checks.md`, o relatório da rodada 1, a US-19 do `docs/PRD.md` (CA-19.1 a CA-19.6), o `CLAUDE.md` e o diff da correção `cab6af9..2bc11ba` inteiro (8 arquivos: `appointment-reminders.job.ts` e spec, `send-appointment-reminders.use-case.ts` e spec, `answer-client-question.use-case.spec.ts`, `appointment-reminder.spec.ts`, `test/api-docs.e2e-spec.ts`, `test/database/typeorm-schedule.query.e2e-spec.ts`).

Escopo desta rodada, pela regra de re-verificação: (a) todas as provas rodaram de novo em `2bc11ba`; (b) faltas reinjetadas em toda superfície que a correção tocou ou criou, inclusive a F4 que sobreviveu na rodada 1; (c) citações refeitas nos arquivos tocados; (d) recalculadas as linhas do Coverage cuja autoridade a correção tocou; (e) rejulgada a linha da Test policy que não foi atendida. O resto vem da rodada 1 e está marcado `carried from cab6af9`.

Resultado: os 36 checks têm teste nomeado que existe, rodou e passou em `2bc11ba`, com asserção localizada. A F4 agora morre (pelo novo caso do C18). As 6 faltas novas nas superfícies da correção morreram. **O veredito é PASS.**

## Binding sources

`carried from cab6af9`. Perfil `standard`: o passo 1 (enumeração de UI) não roda. A correção não tocou a interface (nenhum controller, presenter nem schema mudou; só testes, o job e o resultado interno do use case), então a comparação com as fontes binding não precisa ser refeita.

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| `docs/PRD.md` US-19 (CA-19.1 a CA-19.6), RF-16, RF-17, RF-18, RN-18 | yes - reaberto nesta rodada, linhas 703-720 | - | - |

## Checks

`verified at 2bc11ba`. Todas as provas rodaram de novo em `2bc11ba`, em lote por alvo.

Lote unitário: `npx jest src/domain/value-objects/appointment-reminder.spec.ts src/usecases/send-appointment-reminders/send-appointment-reminders.use-case.spec.ts src/infrastructure/jobs/appointment-reminders.job.spec.ts src/infrastructure/external/gemini/gemini-message-interpreter.spec.ts src/usecases/answer-client-question/answer-client-question.use-case.spec.ts src/usecases/list-schedule/list-schedule.use-case.spec.ts -t "US-19.*\((C1|C2|C3|C4|C5|C6|C7|C8|C9|C10|C11|C12|C13|C15|C16|C17|C18|C19|C20|C21|C22|C23|C28|C29)\)" --json`. Saiu com exit 0: 57 passed, 0 failed, 109 skipped. Contagem por check tirada da saída JSON, teste a teste: C1 x12, C2, C3 x2, C4, C5 x2, C6, C7 x2, C8, C9, C10 x3, C11, C12, C13 x3, C15, C16 x3, C17, C18 x2 (um a mais que na rodada 1: o caso novo do agendamento já iniciado), C19, C20 x2, C21 x3, C22, C23, C28 x9, C29 x2.

Lote e2e: `npx jest --config ./test/jest-e2e.json test/appointment-reminders.e2e-spec.ts test/api-docs.e2e-spec.ts test/database/appointments-schema.e2e-spec.ts test/database/typeorm-appointment.repository.e2e-spec.ts test/database/typeorm-schedule.query.e2e-spec.ts -t "US-19.*\((C14|C24|C25|C26|C27|C30|C31|C32|C33|C34|C35)\)" --runInBand --json`. Saiu com exit 0: 14 passed, 0 failed, 75 skipped, cada teste listado como passed: C35, C14, C24, C25, C26, C27, C30, C31, C34 x4 (2 na query, 2 no repositório), C33, C32.

As citações dos arquivos tocados pela correção foram refeitas (`send-appointment-reminders.use-case.spec.ts`, `appointment-reminders.job.spec.ts`, `answer-client-question.use-case.spec.ts`, `appointment-reminder.spec.ts`, `test/api-docs.e2e-spec.ts`, `test/database/typeorm-schedule.query.e2e-spec.ts`). As demais continuam como na rodada 1 (`carried from cab6af9`), porque esses arquivos não mudaram.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | janela 24h/1h e criado depois do momento, 12 linhas | lote unitário, 12x `(C1)` passed | `src/domain/value-objects/appointment-reminder.spec.ts:18-47`: tabela com as 12 linhas; `:51`: `expect(isReminderDue(kind, { startsAt: T, createdAt }, now)).toBe(due)`. Título corrigido em `:49` (`..., due: %s`) | PASS |
| C2 | 1 `sendText` com o texto 24h de X, `reminder24hSentAt = NOW`, sem reenvio | lote unitário, `(C2)` passed | `src/usecases/send-appointment-reminders/send-appointment-reminders.use-case.spec.ts:211`: `sentTexts toEqual([{ barbershopId: 'barbershop-a', phone: PHONE, text: X_TEXT }])`; `:214`: `reminder24hSentAt toEqual(NOW)`; `:218`: `toHaveLength(1)` | PASS |
| C3 | `Serviços: Corte, Barba`; Manaus `Horário: 10:00`, `Data: quarta-feira, 30/09` | lote unitário, 2x `(C3)` passed | `send-appointment-reminders.use-case.spec.ts:231`: `split('\n')[1] toBe('Serviços: Corte, Barba')`; `:245-246`: `lines[3] toBe('Data: quarta-feira, 30/09')`, `lines[4] toBe('Horário: 10:00')` | PASS |
| C4 | 1º envio falha: `failed: 1, sent: 1`, as duas marcas, métricas, sem reenvio | lote unitário, `(C4)` passed | `send-appointment-reminders.use-case.spec.ts:268-280`: `result toEqual({ sent: 1, failed: 1, failures: [], sendFailures: [{ barbershopId: 'barbershop-a', appointmentId: 'x', kind: '24h', error: new Error('vendor down') }] })`; `:281-282`: as duas marcas `toEqual(NOW)`; `:283`: `metrics.reminders toEqual([...24h failed, 24h sent])`; `:292`: `sentTexts toEqual([])` | PASS |
| C5 | erro por barbearia e por envio com só `name`/`code`, resumo, sem telefone nem texto; sem falhas, sem erro | lote unitário, 2x `(C5)` passed | `src/infrastructure/jobs/appointment-reminders.job.spec.ts:63`: `toHaveBeenCalledTimes(2)`; `:64-72`: `toHaveBeenCalledWith({ barbershopId: 'barbershop-b', appointmentId: 'appointment-1', kind: '24h', err: { name: 'QueryFailedError', code: '57014' } }, 'Appointment reminder could not be sent.')`; `:73-79`: o erro da barbearia; `:80-83`: resumo `{ sent: 2, failed: 1, failedBarbershops: 1 }`; `:85-87`: `not.toContain('Carlos' / '987654321' / 'Lembrete')`; `:98`: `errorSpy not.toHaveBeenCalled()` | PASS |
| C6 | 1 `sendText` com o texto 1h de Z, `reminder1hSentAt = NOW`, sem reenvio | lote unitário, `(C6)` passed | `send-appointment-reminders.use-case.spec.ts:303`: `toEqual([{ ..., text: Z_TEXT }])`; `:306`: `reminder1hSentAt toEqual(NOW)`; `:310`: `toHaveLength(1)` | PASS |
| C7 | Z já confirmado ou sem 24h recebe exatamente 1 lembrete de 1h | lote unitário, 2x `(C7)` passed | `send-appointment-reminders.use-case.spec.ts:318` (tabela); `:325`: `sentTexts toEqual([{ ..., text: Z_TEXT }])` | PASS |
| C8 | falha no 1h: `failed: 1`, marca mantida, `1h/failed`, sem reenvio | lote unitário, `(C8)` passed | `send-appointment-reminders.use-case.spec.ts:337-344`: `toMatchObject({ sent: 0, failed: 1, failures: [], sendFailures: [{ barbershopId: 'barbershop-a', appointmentId: 'z', kind: '1h' }] })`; `:345`: `reminder1hSentAt toEqual(NOW)`; `:346`: `toEqual([{ kind: '1h', outcome: 'failed' }])`; `:351`: `toEqual([])` | PASS |
| C9 | criado em T-3h: nada em T-3h, só o de 1h em T-59min | lote unitário, `(C9)` passed | `send-appointment-reminders.use-case.spec.ts:363`: `toEqual([])`; `:368`: `toEqual([{ ..., text: 'Seu horário na Barbearia do Zé é hoje às 15:00, com João. Até já!' }])` | PASS |
| C10 | `cancelled`/`attended`/`no_show`: nada, marcas nulas | lote unitário, 3x `(C10)` passed | `send-appointment-reminders.use-case.spec.ts:386`: `toEqual([])`; `:388-389`: `reminder24hSentAt` e `reminder1hSentAt` `toBeNull()` | PASS |
| C11 | cancelado entre listar e reivindicar: nada, marca nula | lote unitário, `(C11)` passed | `send-appointment-reminders.use-case.spec.ts:406-407`: `toEqual([])`, `toBeNull()` | PASS |
| C12 | sem cliente: nada, marca nula | lote unitário, `(C12)` passed | `send-appointment-reminders.use-case.spec.ts:416-417`: `toEqual([])`, `toBeNull()` | PASS |
| C13 | sem conexão, `disconnected`, `connecting`: nada; depois de `connected`, 1 envio | lote unitário, 3x `(C13)` passed | `send-appointment-reminders.use-case.spec.ts:434-435`: `toEqual([])`, `toBeNull()`; `:440`: `toHaveLength(1)` | PASS |
| C14 | duas execuções em `Promise.all` no Postgres: 1 envio, coluna preenchida | lote e2e, `(C14)` passed | `test/appointment-reminders.e2e-spec.ts:286`: `Promise.all([useCase.execute(), useCase.execute()])`; `:288-289`: `texts() toEqual([X_REMINDER])`, `reminder_24h_sent_at toEqual(NOW)` (`carried from cab6af9`, arquivo inalterado) | PASS |
| C15 | cada barbearia envia ao próprio cliente; com a **leitura** da primeira falhando, ela vai em `failures` e a segunda segue | lote unitário, `(C15)` passed | `send-appointment-reminders.use-case.spec.ts:468-476`: `toEqual([{ barbershopId: 'barbershop-a', phone: PHONE }, { barbershopId: 'barbershop-b', phone: '+5511911112222' }])`; `:482-490`: agora é o `schedule.listPendingReminders` (leitura) que rejeita para `barbershop-a`; `:495-497`: `failures toEqual([{ barbershopId: 'barbershop-a', error: failure }])`; `:498-500`: `toEqual(['barbershop-b'])` | PASS |
| C16 | Gemini repassa `confirmRequested`, rejeita sem ele, `required`, linha da instrução | lote unitário, 3x `(C16)` passed | `src/infrastructure/external/gemini/gemini-message-interpreter.spec.ts:420`: `resolves.toEqual(CONFIRM)`; `:429`: `rejects.toBeInstanceOf(MessageInterpreterUnavailableError)`; `:442`: `required toContain('confirmRequested')`; `:444-446`: `instruction toContain(...)` (`carried from cab6af9`) | PASS |
| C17 | confirma X com o texto exato e `clientConfirmedAt = NOW`; 2ª mensagem mantém o instante | lote unitário, `(C17)` passed | `src/usecases/answer-client-question/answer-client-question.use-case.spec.ts:1023-1024`: `toEqual([X_CONFIRMED])`, `confirmedAt toEqual(BOOKING_NOW)` (`BOOKING_NOW = 2026-09-29T15:00:00.000Z`, `src/usecases/testing/whatsapp-booking-fixtures.ts:37`); `:1028-1029`: mesmo texto, `toEqual(BOOKING_NOW)` | PASS |
| C18 | texto exato com X e W; grava só em X e W; um lembrado `confirmed` já iniciado não entra | lote unitário, 2x `(C18)` passed | `answer-client-question.use-case.spec.ts:1070`: `toEqual(['Presença confirmada!\nCorte, ... 30/09 ...\nBarba, ... 01/10 ...'])`; `:1073-1083`: X e W `toEqual(BOOKING_NOW)`, os demais `toBeNull()`; caso novo `:1086-1097`: agendamento `started` em 29/09 11:30 local (14:30Z, antes do relógio 15:00Z), lembrado e `confirmed`; `:1094`: `lastText(CONFIRM) toEqual([X_CONFIRMED])` (não listado); `:1095`: `confirmedAt(setup, 'started') toBeNull()`; `:1096`: `statusOf('started') toBe('confirmed')` (o filtro de status não o exclui, então só a regra de tempo o barra) | PASS |
| C19 | nada a confirmar: texto exato, nulo | lote unitário, `(C19)` passed | `answer-client-question.use-case.spec.ts:1102`: `toEqual(['Você não tem nenhum agendamento aguardando confirmação.'])`; `:1105`: `toBeNull()` | PASS |
| C20 | confirmar com cancelar segue a US-18 (X `cancelled`); com remarcar, oferta; nulo | lote unitário, 2x `(C20)` passed | `answer-client-question.use-case.spec.ts:1122-1123`: `toHaveLength(1)`, `toMatch(expected)` (`/^Agendamento cancelado\./`, `/^Horários para Corte/`); `:1124`: `statusOf('X') toBe(...)`; `:1127`: `toBeNull()` | PASS |
| C21 | atendente (com `requested`), fora de contexto e agendar vencem confirmar; nulo | lote unitário, 3x `(C21)` passed | `answer-client-question.use-case.spec.ts:1143`: `toBe(HANDOFF_REPLY)`; `:1144`: `conversation()?.pauseReason toBe('requested')`; `:1150`: `toBe(REFUSAL)`; `:1155`: `toMatch(/^Qual serviço você quer agendar\?/)`; `:1164`: `toHaveLength(1)`; `:1166`: `confirmedAt(setup, 'X') toBeNull()` | PASS |
| C22 | conversa pausada: nada enviado, nada confirmado | lote unitário, `(C22)` passed | `answer-client-question.use-case.spec.ts:1173`: `pauseReason toBe('requested')`; `:1175-1176`: `toEqual([])`, `toBeNull()` | PASS |
| C23 | métricas: 1, depois 0 novas, `presence_confirmed` x2, `nothing_to_confirm` | lote unitário, `(C23)` passed | `answer-client-question.use-case.spec.ts:1183-1184`: `presenceConfirmations toBe(1)`, `replies toEqual(['presence_confirmed'])`; `:1187-1188`: `toBe(1)`, duas `presence_confirmed`; `:1195-1196`: `toBe(0)`, `toEqual(['nothing_to_confirm'])` | PASS |
| C24 | e2e: job envia, webhook 204 confirma, linha gravada, `GET /appointments` com `clientConfirmedAt` e `unconfirmed: false` | lote e2e, `(C24)` passed | `test/appointment-reminders.e2e-spec.ts:296-298`, `:159` `.expect(204)`, `:302-303`, `:304-310` `objectContaining({ id: x, clientConfirmedAt: NOW.toISOString(), unconfirmed: false })` (`carried from cab6af9`, arquivo inalterado) | PASS |
| C25 | e2e: cancelar depois do lembrete segue a US-18; T-59min não envia | lote e2e, `(C25)` passed | `appointment-reminders.e2e-spec.ts:319-322` `status toBe('cancelled')`; `:327-328` `toHaveLength(2)`, `reminder_1h_sent_at toBeNull()` (`carried from cab6af9`) | PASS |
| C26 | `/metrics`: +1 confirmação, +1 `presence_confirmed`, sem label | lote e2e, `(C26)` passed | `appointment-reminders.e2e-spec.ts:339-352` deltas `toBe(1)`; `:353-361` `stringMatching(/^whatsapp_presence_confirmations_total \d+$/)` (`carried from cab6af9`) | PASS |
| C27 | `/metrics`: 24h/sent +1, 1h/failed +1, só `kind`/`outcome` | lote e2e, `(C27)` passed | `appointment-reminders.e2e-spec.ts:380-385` deltas `toBe(1)`; `:389-391` regex só com `kind` e `outcome` (`carried from cab6af9`) | PASS |
| C28 | `isUnconfirmed`, 9 linhas | lote unitário, 9x `(C28)` passed | `appointment-reminder.spec.ts:65-93` tabela; `:97-98`: `isUnconfirmed(...)).toBe(expected)`. Título corrigido em `:95` (`..., unconfirmed: %s`) | PASS |
| C29 | `ListScheduleUseCase` T-90min: prazo 60 `false`, 120 `true` | lote unitário, 2x `(C29)` passed | `src/usecases/list-schedule/list-schedule.use-case.spec.ts:310-313` tabela; `:342-344` `unconfirmed toBe(expected)` (`carried from cab6af9`) | PASS |
| C30 | e2e: T-1h59 `unconfirmed: true`, `clientConfirmedAt: null`; T-2h01 `false` | lote e2e, `(C30)` passed | `appointment-reminders.e2e-spec.ts:402-409`, `:411-414` (`carried from cab6af9`) | PASS |
| C31 | e2e: perfil 200, bloqueio 409, `PATCH` 200 com `clientConfirmedAt` | lote e2e, `(C31)` passed | `appointment-reminders.e2e-spec.ts:430-439`, `:451-459`, `:465-469` (`carried from cab6af9`) | PASS |
| C32 | OpenAPI: `unconfirmed` boolean com description e example; `clientConfirmedAt` date-time, nullable, description e example; perfil sem `unconfirmed` | lote e2e, `(C32)` passed | `test/api-docs.e2e-spec.ts:305-309`: `item.unconfirmed toMatchObject({ type: 'boolean', example: false, description: stringContaining('CA-19.5') })`; `:314-320`: `toMatchObject({ type: 'string', format: 'date-time', nullable: true, example: '2026-09-29T15:00:00.000Z', description: stringContaining('CA-19.2') })` nos dois itens; `:322`: `profileItem.unconfirmed toBeUndefined()` | PASS |
| C33 | 3 colunas `timestamptz`, nulas, sem default; INSERT grava nulo | lote e2e, `(C33)` passed | `test/database/appointments-schema.e2e-spec.ts:471-484`, `:493-497` (`carried from cab6af9`) | PASS |
| C34 | `claimReminder`, `confirmByClient`, `listPendingReminders`, `listForClient` contra o Postgres | lote e2e, 4x `(C34)` passed | `test/database/typeorm-appointment.repository.e2e-spec.ts:650-707` (`carried from cab6af9`); `test/database/typeorm-schedule.query.e2e-spec.ts:645`: `pending24h ids toEqual([due, atUntil])`; `:646`: `toMatchObject({ createdAt: ... })`; `:659`: 1h `toEqual([due, reminded, atUntil])`; `:676`: `listForClient` entry `toMatchObject` com os instantes (linhas +3 pela anotação de tipo em `:585-588`; a correção só tipou o helper, sem mudar asserção) | PASS |
| C35 | cron `appointment-reminders`, `* * * * *`, `America/Sao_Paulo` | lote e2e, `(C35)` passed | `appointment-reminders.e2e-spec.ts:278-279` (`carried from cab6af9`) | PASS |
| C36 | suítes anteriores passam, erros das rotas alteradas mantidos, nenhuma asserção enfraquecida | `npm test` exit 0 (95 suítes, 1223 passed); `npm run test:e2e` exit 0 (49 suítes, 720 passed), em `2bc11ba` | citações de 401/403/404/409/400 `carried from cab6af9` (arquivos inalterados pela correção). Nos testes, o diff `cab6af9..2bc11ba` só amplia asserções: C4 passa a afirmar `sendFailures`, C5 passa de 1 para 2 erros com o novo `toHaveBeenCalledWith`, C21 ganha `pauseReason`, C32 ganha `example`, C18 ganha um caso; C15 troca a falha de escrita pela de leitura (o claim fala em leitura); C8 usa `toMatchObject` porque o `error` do envio é o do conector, e as chaves que o claim nomeia continuam afirmadas | PASS |

**Nível e amostragem** (`verified at 2bc11ba`). Todo claim que cita status, rota ou formato de resposta (C24, C25, C30, C31, C32) tem asserção e2e nessa fronteira. Cada claim em tabela roda todos os casos que cita: C1 (12), C3 (2), C7 (2), C10 (3), C13 (3), C20 (2), C21 (3), C28 (9), C29 (2).

**Notes (sem peso no veredito):**
- Pendências da rodada 1, situação em `2bc11ba`: F4 resolvida (caso novo do C18, falta morta); C21 agora afirma `requested` (`:1144`); C32 agora afirma `example` (`:307`, `:318`); AC 3 agora loga cada envio que falhou com `barbershopId`, `appointmentId`, `kind` e só `name`/`code` do erro (`src/infrastructure/jobs/appointment-reminders.job.ts:27-32`), atendendo à linha "log por falha" do `Observable` do plano (`plan.md:190,192`); C15 agora faz falhar a leitura; títulos cosméticos do C1 e do C28 corrigidos.
- Lacuna de precisão na regra de tempo da confirmação (não bloqueia): rodei, além das faltas pedidas, a sonda `entry.startsAt > now` -> `>= now` em `src/usecases/confirm-presence-via-whatsapp/confirm-presence-via-whatsapp.use-case.ts:39`, e ela sobreviveu (11 testes US-19 do `answer-client-question` passaram). Ela só muda o resultado quando o agendamento começa exatamente no milissegundo de agora. O AC 13 diz "começam depois de agora" e o código implementa isso literalmente com `>`, mas nem o claim do C18 nem o conjunto "filtro da confirmação" do `checks.md` nomeiam esse instante como membro, ao contrário das janelas dos lembretes (C1), que nomeiam cada fronteira. Fica registrado como lacuna de precisão dos checks, fora da tabela de faltas, porque nenhum check ou membro de Coverage define esse valor. Se o orquestrador quiser fechar, basta um caso com `startsAt = now` afirmando que não é confirmado.
- C29 continua usando `2026-10-07` em vez das datas do cenário, com a mesma relação de T-90min (`carried from cab6af9`).
- `npm run typecheck` e `npm run lint:check` também saíram com exit 0 em `2bc11ba`.

## Coverage

Linhas tocadas pela correção: `verified at 2bc11ba` (recalculadas do código em `2bc11ba`). As demais: `carried from cab6af9`.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| CA-19.x (6) | PRD 713-718 (`carried from cab6af9`) | 19.1 C2, C24 · 19.2 C17, C20, C24 · 19.3 C6 · 19.4 C1, C9 · 19.5 C28, C30 · 19.6 C10, C11, C25 | - |
| fronteiras da janela (8) | `isReminderDue` (`carried from cab6af9`) | as 8 linhas em C1 (F1 morta na rodada 1) | - |
| criado depois do momento (4) | `isReminderDue` (`carried from cab6af9`) | C1 · caminho C9 | - |
| tipo de lembrete (2) | `REMINDER_KINDS` (`carried from cab6af9`) | `24h` C2, C14, C24 · `1h` C6, C9 | - |
| formato do texto (3) | `reminder-text.ts` (`carried from cab6af9`) | um serviço C2 · vários C3 · outro fuso C3 | - |
| falha de envio por tipo (2) | `catch (error)` em `send-appointment-reminders.use-case.ts:105-115` (`verified at 2bc11ba`) | `24h` C4 (`sendFailures` exato) · `1h` C8 (`sendFailures` com `appointmentId` e `kind`); falta F7 morta | - |
| log da falha (2: por envio, por barbearia) | `appointment-reminders.job.ts:27-38` (`verified at 2bc11ba`, membro novo criado pela correção) | por envio C5 `:64-72` (faltas F6 e F8 mortas) · por barbearia C5 `:73-79` | - |
| status sem lembrete (3) | SQL `status = 'confirmed'` (`carried from cab6af9`) | `cancelled` C10, C25, C34 · `attended` C10 · `no_show` C10 | - |
| corrida com cancelamento (1) | `claimReminder` (`carried from cab6af9`) | C11, C34 (F5 morta) | - |
| sem cliente (1) | `!entry.client` + SQL (`carried from cab6af9`) | C12, C34 | - |
| estado da conexão (4) | `connection?.status !== 'connected'` (`carried from cab6af9`) | ausente, `disconnected`, `connecting` C13 (F3 morta) · `connected` C2, C13 | - |
| concorrência (1) | claim condicional (`carried from cab6af9`) | C14 | - |
| barbearias da rotina (2) | `execute` `send-appointment-reminders.use-case.ts:59-65` (`verified at 2bc11ba`) | isolamento C15 · falha de leitura de uma e a outra segue C15 `:482-500` (falta F10 morta), log C5 | - |
| 1h independente do 24h (2) | sem guarda (`carried from cab6af9`) | já confirmado C7 · sem 24h C7 | - |
| desfecho de "confirmar" (4) | `confirm-presence-via-whatsapp.use-case.ts:42-65` (`carried from cab6af9`) | um C17 · vários C18 · nenhum C19 · repetido C17 | - |
| filtro da confirmação (6) | `confirm-presence-via-whatsapp.use-case.ts:36-41` (`status === 'confirmed'`, `startsAt > now`, `reminder24hSentAt !== null`) + `listForClient(barbershop, client)` (`verified at 2bc11ba`) | sem lembrete C18, C19 · **passado C18 `:1086-1097`** (agora um `confirmed` lembrado já iniciado, barrado só pela regra de tempo; F4 morta) · `cancelled` C18 · outro cliente C18 · outra barbearia C18 · ordem C18 | - |
| confirmar com outra intenção (5) | `answer-client-question.use-case.ts:135-180` (`verified at 2bc11ba` para atendente) | cancelar C20 · remarcar C20 · atendente C21 com `pauseReason 'requested'` (falta F9 morta) · fora de contexto C21 · agendar C21 | - |
| conversa pausada (1) | `entry === 'paused'` (`carried from cab6af9`) | C22 | - |
| métricas novas (4) | `prometheus-whatsapp-metrics.ts` (`carried from cab6af9`) | reminders C27, C4, C8 · confirmations C26, C23 · `presence_confirmed` C26, C23 · `nothing_to_confirm` C23 | - |
| condições do `unconfirmed` (4 + prazo) | `isUnconfirmed` (`carried from cab6af9`) | C28, C29, C30, C24 (F2 morta) | - |
| doc OpenAPI dos campos novos (4 atributos por campo: tipo, formato/nulo, description, example) | AC 24 + `schedule.presenter.ts:47-60` (`verified at 2bc11ba`) | `unconfirmed` type/description/example C32 `:305-309` · `clientConfirmedAt` type/format/nullable/description/example C32 `:314-320` (falta F11 morta) · ausência no perfil C32 `:322` | - |
| doors (4) | Landing do plano (`carried from cab6af9`) | 1 C33, C34, C14 · 2 C16 · 3 C35, C5 · 4 C32, C24, C30, C31 | - |
| `GET /appointments` statuses (4) | Surface (`carried from cab6af9`) | 200 C24, C30 · 400 `test/schedule.e2e-spec.ts:386` · 401 `:379` · 403 `:312` | - |
| `GET /clients/:id` statuses (3) | Surface (`carried from cab6af9`) | 200 C31 · 401 `test/clients.e2e-spec.ts:660` · 404 `:578` | - |
| `PATCH /appointments/:id/status` statuses (6) | Surface (`carried from cab6af9`) | 200 C31 · 400 `test/attendance.e2e-spec.ts:464` · 401 `:491` · 403 `:513` · 404 `:526` · 409 `:564` | - |
| `POST /blocks` statuses (6) | Surface (`carried from cab6af9`) | 201 `test/barber-blocks.e2e-spec.ts:563` · 400 `:829` · 401 `:817` · 403 `:402` · 404 `:741` · 409 C31, `:537` | - |
| `POST /appointments` shape (1) | Surface (`carried from cab6af9`) | `test/manual-booking.e2e-spec.ts:280`, `:290` | - |
| montagem: envio e job (2) | `whatsapp.module.ts` (`carried from cab6af9`; a correção não tocou módulos) | app C14, C24, C35 · unitário C2 | - |
| montagem: `ConfirmPresenceViaWhatsAppUseCase` (2) | `whatsapp.module.ts` (`carried from cab6af9`) | app C24 · unitário C17 | - |
| montagem: regras e relógio no `ListScheduleUseCase` (2) | `schedule.module.ts` (`carried from cab6af9`) | app C30 · unitário C29 | - |

## Test policy rows

Linha 1 rejulgada e linha 4 rejulgada porque a correção tocou o job: `verified at 2bc11ba`. Linhas 2 e 3: `carried from cab6af9` (os arquivos que classificam não mudaram de comportamento; a anotação de tipo no e2e da query não muda asserção).

| Row | Files it classifies | Required proof | Expectation met |
| --- | --- | --- | --- |
| Decide, alcançado por uma fronteira | `send-appointment-reminders.use-case.ts`, `confirm-presence-via-whatsapp.use-case.ts` (via `answer-client-question.use-case.ts`), `list-schedule.use-case.ts` | use case: C2-C4, C6-C13, C15, C17-C23, C29 · e2e: C14, C24-C27, C30, C31 | yes - a linha "começa depois de agora" da tabela de decisão da confirmação agora tem caso afirmado (C18 `:1086-1097`, F4 morta); `sendFailures` afirmado em C4 e C8 |
| Decide, sem fronteira própria | `appointment-reminder.ts` | C1 (12), C28 (9) | yes |
| Gateways | schema do Gemini, repositório e query TypeORM, migration | C16, C34, C33 | yes |
| Repasse | `appointment-reminders.job.ts`, módulos, presenter | log do job C5 (agora com o log por envio, F6 e F8 mortas); o resto pelos e2e C24, C30, C31, C32, C35 | yes |

## Swept existing

`carried from cab6af9`. A correção não tocou controller, guard nem o webhook; a autorização (AD-007) e o claim de idempotência da mensagem continuam como verificados na rodada 1. Rechecado nesta rodada só o ponto que a correção poderia afetar: o log novo por envio passa o erro por `errorIdentity` (`appointment-reminders.job.ts:29`), sem telefone nem texto, e o `redact` do logger não precisou crescer porque nenhum campo sensível novo é logado (`barbershopId`, `appointmentId` e `kind` são identificadores internos).

## Faults injected

`verified at 2bc11ba`. Worktree isolada: `git worktree add --detach <scratchpad>/wt HEAD`, com `node_modules` em symlink e `.env` copiado. Antes, o `git status --porcelain` da árvore real tinha só `?? .specs/features/us-19-lembretes-de-24h-e-1h/verification.md`. Cada falta foi revertida com `git checkout -- <arquivo>` e o `git status --short` da worktree conferido vazio entre elas. No fim, `git worktree remove --force`; `git worktree list` mostra só a árvore principal e o porcelain da árvore real ficou idêntico ao de antes (comparado com `diff`). As faltas F1, F2, F3 e F5 da rodada 1 atingem arquivos que a correção não tocou: `carried from cab6af9` (todas mortas lá).

| Mutation | Location | Killed |
| --- | --- | --- |
| F4 (reinjetada) filtro da confirmação `entry.startsAt > now &&` -> `true &&` | `src/usecases/confirm-presence-via-whatsapp/confirm-presence-via-whatsapp.use-case.ts:39` | yes - `AC 13 (C18): a reminded confirmed appointment that already started is neither confirmed nor listed` falhou; os outros 10 de C17-C23 passaram |
| F6 log por envio pula o primeiro item (`of sendFailures` -> `of sendFailures.slice(1)`) | `src/infrastructure/jobs/appointment-reminders.job.ts:27` | yes - C5 falhou em `:63` (`Expected number of calls: 2, Received: 1`) |
| F7 envio que falha não entra em `sendFailures` (`result.sendFailures.push({` -> `void ({`) | `src/usecases/send-appointment-reminders/send-appointment-reminders.use-case.ts:108` | yes - C4 e C8 falharam |
| F8 log por envio com o erro cru (`err: errorIdentity(error)` -> `err: error, detail: String(error)`) | `src/infrastructure/jobs/appointment-reminders.job.ts:29` | yes - C5 falhou em `:64` (`toHaveBeenCalledWith` do log por envio) |
| F9 transferência com confirmar usa outro motivo (`'requested'` -> `interpretation.confirmRequested ? 'not_understood' : 'requested'`) | `src/usecases/answer-client-question/answer-client-question.use-case.ts:136` | yes - C21 `a request for a person` falhou em `:1144` (`Expected: "requested", Received: "not_understood"`); só a asserção nova da correção mata esta falta, já que o texto da transferência é o mesmo |
| F10 a barbearia que falha interrompe as seguintes (`break` depois de `result.failures.push`) | `src/usecases/send-appointment-reminders/send-appointment-reminders.use-case.ts:63` | yes - C15 falhou em `:500` (`toEqual(['barbershop-b'])`), com a falha agora na leitura |
| F11 sem `example` no `clientConfirmedAt` (linha `example: '2026-09-29T15:00:00.000Z'` removida) | `src/interface-adapters/presenters/schedule.presenter.ts:51` | yes - C32 falhou em `:314` (`- "example": "2026-09-29T15:00:00.000Z"`) |

A sonda de fronteira `> now` -> `>= now` (mesmo arquivo da F4, `:39`) sobreviveu. Ela não está na tabela porque nenhum check nem membro de Coverage define esse instante; ver Notes (lacuna de precisão dos checks).

## Gate

`npm test`: 95 suítes, 1223 passed, 0 failed. `npm run test:e2e`: 49 suítes, 720 passed, 0 failed. Os dois em `2bc11ba`, em série.

## Verification: us-19-lembretes-de-24h-e-1h - PASS

**Checks**: 36/36 com evidência localizada em `2bc11ba`
**Coverage**: 30 conjuntos (6 recalculados nesta rodada, 24 carregados de `cab6af9`), 0 membros sem prova
**Faults**: 7 injetadas nesta rodada, 7 mortas (F4 reinjetada e morta); F1, F2, F3, F5 mortas em `cab6af9`
**Gate**: 1223 + 720 passed, 0 failed
**Report**: `.specs/features/us-19-lembretes-de-24h-e-1h/verification.md`

**Gaps sem bloquear**:
1. Lacuna de precisão: a fronteira `startsAt === now` da confirmação não é nomeada pelos checks, e a sonda `>=` sobrevive - `src/usecases/confirm-presence-via-whatsapp/confirm-presence-via-whatsapp.use-case.ts:39`.

**Lessons**: não rodei `scripts/lessons.py` (o pedido limita as mudanças a este relatório). Lição proposta: "Num filtro com várias condições, o checks.md nomeia o membro de fronteira de cada condição de tempo (igual a agora), como já faz nas janelas dos lembretes; sem isso, um `>` trocado por `>=` passa."
