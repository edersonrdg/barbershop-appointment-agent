# US-23: Sugestão de serviços adicionais verification

**Verdict**: PASS
**Profile**: light
**Diff range**: 6294a51..6e738de
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

Rodada única e completa sobre `6294a51..6e738de`, cobrindo os 21 checks de `checks.md` (perfil `light`). Rodei todas as provas no `HEAD` 6e738de, com uma invocação por runner. Cada teste nomeado aparece individualmente como `passed` no `assertionResults` do `--json`. Cada check tem uma asserção localizada que fixa o valor declarado. Os membros enumerados (C2 (a)-(g), C4 com as duas configurações, C5 (a)-(c), C15 (a)-(c)) têm um teste cada. Reli no código as linhas do `Swept` marcadas `existing`. Todos os testes citados são novos no diff `6294a51..HEAD`.

## Binding sources

O passo 1 não é exigido no perfil `light`. Fiz só a comparação estreita pedida: abri `docs/PRD.md` US-23 (linhas 779-792) e `.specs/STATE.md` AD-013 (linhas 101-107). Cada CA da história é coberto por pelo menos um check: CA-23.1 -> C1, C20 (e C5 para "uma única vez"); CA-23.2 -> C9, C12, C13, C20; CA-23.3 -> C16 (e C5 (b)); CA-23.4 -> C4. Nenhum check contradiz o PRD nem o AD-013. A door 2 só acrescenta um campo ao `jsonb` `booking_draft` e lê rascunhos antigos com valor padrão, o que é compatível com o trade-off do AD-013. Observação que não bloqueia: o "Independent test" do S2 no plano cita `R$ 65,00, 1h`. O fixture e os checks usam `R$ 75,00, 50 min`. O check C9 é o que vale, e ele está consistente com o fixture.

## Checks

Execuções das provas (no HEAD 6e738de):

- unit: `npx jest src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts src/usecases/answer-client-question/answer-client-question.use-case.spec.ts src/infrastructure/external/gemini/gemini-message-interpreter.spec.ts -t "US-23.*\((C1|C2|C3|C4|C5|C6|C7|C8|C9|C10|C11|C12|C13|C14|C15|C16|C18|C21)\)" --json` exit 0: 31 passed, 0 failed, 172 skipped. Os 31 testes do US-23 aparecem um a um como `passed`.
- e2e: `npx jest --config ./test/jest-e2e.json test/api-docs.e2e-spec.ts test/database/typeorm-conversation.repository.e2e-spec.ts test/whatsapp-booking.e2e-spec.ts -t "US-23.*\((C17|C19|C20)\)" --json` exit 0: 4 passed, 0 failed, 32 skipped. Os 4 testes do US-23 aparecem um a um como `passed`.

Sobre os seletores: os nomes de check no `-t` vêm envoltos em parênteses `\(Cn\)`, então `C1` não captura `C10`-`C16`. Contei 35 testes que rodaram, o que bate com os 35 testes do US-23 encontrados no tree com `grep -rn "US-23" src test`.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | `JOAO_AFTERNOON` com Barba adicional recebe exatamente `SUGESTAO`, 0 chamadas ao `ListAvailableSlotsUseCase` | unit, passed | `src/usecases/book-via-whatsapp/book-via-whatsapp.use-case.spec.ts:969` - `expect(await text(JOAO_AFTERNOON)).toBe(SUGESTAO)`; `:970` - `expect(search).toHaveBeenCalledTimes(0)` | PASS |
| C2 | primeiro adicional sugerível, linhas (a)-(g) com o texto completo | unit, passed (7 testes, um por linha) | (a) `book-via-whatsapp.use-case.spec.ts:977` - `toBe(SUGESTAO)` com `['hidratacao','barba']`; (b) `:983-985` - `text({...services:['Corte','Barba']})).toBe(offer([wed('12:00'),wed('12:30'),wed('13:00')], CORTE_BARBA))`; (c) `:991` - `toBe(SUGESTAO)` com `['pigmentacao','barba']`; (d) `:997-1003` - `text({...barber:'Pedro'})).toBe(offer([wed('12:00','Pedro'),...]))`; (e) `:1009-1011` - `text({...barber:null, anyBarber:true})).toBe(SUGESTAO)`; (f) `:1018-1020` - `toBe('Quer incluir Lavagem por +R$ 20,00? ...só com Corte.')`; (g) `:1028-1032` - `toBe('Quer incluir Sobrancelha por +R$ 15,00? ...só com Barba + Corte.')` | PASS |
| C3 | rascunho após `SUGESTAO`: `addOnSuggestion {barba, pending:true}`, `serviceIds ['corte']`, `joao`, `2026-09-30`, `afternoon`, `offer []` | unit, passed | `book-via-whatsapp.use-case.spec.ts:1041-1048` - `expect(draft()).toMatchObject({ addOnSuggestion: { serviceId: 'barba', pending: true }, serviceIds: ['corte'], barberId: 'joao', date: '2026-09-30', period: 'afternoon', offer: [] })` | PASS |
| C4 | sem adicional sugerível (`[]` e `['hidratacao']`): oferta exata da US-17 e `addOnSuggestion: null` | unit, passed (2 casos do `it.each`) | `book-via-whatsapp.use-case.spec.ts:1056-1058` - `toBe(offer([wed('12:00'), wed('12:30'), wed('13:00')]))` (cabeçalho padrão `CORTE`, `:44`); `:1059` - `expect(draft()?.addOnSuggestion).toBeNull()`; os dois casos `[]` e `["hidratacao"]` aparecem como `passed` | PASS |
| C5 | com `addOnSuggestion != null` não volta a sugerir: (a) aceito, (b) recusado + nova data, (c) recusado + horário ocupado | unit, passed (3 testes) | (a) `book-via-whatsapp.use-case.spec.ts:1070-1072` - `text({bookingRequested:false, addOnAccepted:true})).toBe(offer([...wed], CORTE_BARBA))` com Barba `['sobrancelha']`; (b) `:1080-1082` - `text({ date: '2026-10-01' })).toBe(offer([thu('12:00'), thu('12:30'), thu('13:00')]))`; (c) `:1091-1093` - `` toBe(`Esse horário acabou de ser ocupado.\n\n${offer([wed('12:30'), wed('13:00'), wed('13:30')])}`) `` | PASS |
| C6 | remarcação com Corte `[barba]` recebe a oferta de Corte, sem `SUGESTAO` | unit, passed | `book-via-whatsapp.use-case.spec.ts:1101-1103` - `text({ bookingRequested: false, rescheduleRequested: true })).toBe(offer([tue('13:00'), tue('13:30'), tue('14:00')]))` | PASS |
| C7 | cliente com 2 faltas: `{ type: 'handoff', reason: 'blocked_client' }`, sem rascunho | unit, passed | `book-via-whatsapp.use-case.spec.ts:1110-1113` - `expect(await send(JOAO_AFTERNOON)).toEqual({ type: 'handoff', reason: 'blocked_client' })`; `:1114` - `expect(draft()).toBeNull()` | PASS |
| C8 | `suggestedAddOn`: `null` sem rascunho, `'Barba'` pendente, `null` após recusa | unit, passed | `book-via-whatsapp.use-case.spec.ts:1130` - `expect(await suggested()).toBeNull()`; `:1132` - `toBe('Barba')`; `:1134` - `toBeNull()` (depois de `text({})`) | PASS |
| C9 | aceite: oferta exata Corte + Barba (R$ 75,00, 50 min); rascunho `['corte','barba']`, `pending:false` | unit, passed | `book-via-whatsapp.use-case.spec.ts:1141-1143` - `text({ bookingRequested: false, addOnAccepted: true })).toBe(offer([wed('12:00'), wed('12:30'), wed('13:00')], CORTE_BARBA))` com `CORTE_BARBA = 'Horários para Corte + Barba (R$ 75,00, 50 min):'` (`:917`); `:1144-1147` - `toMatchObject({ serviceIds: ['corte', 'barba'], addOnSuggestion: { serviceId: 'barba', pending: false } })` | PASS |
| C10 | sem barbeiro: `SUGESTAO`, depois o aceite recebe a pergunta de barbeiro exata | unit, passed | `book-via-whatsapp.use-case.spec.ts:1153-1155` - `text({ services: ['Corte'], date: TOMORROW })).toBe(SUGESTAO)` (`TOMORROW = '2026-09-30'`, `src/usecases/testing/whatsapp-booking-fixtures.ts:38`); `:1156-1158` - `toBe('Tem preferência de barbeiro? Fazem Corte + Barba: João. Se não tiver, responda "tanto faz".')` | PASS |
| C11 | `services: ['Barba']` sem `addOnAccepted` vira aceite: oferta do C9, rascunho `['corte','barba']` | unit, passed | `book-via-whatsapp.use-case.spec.ts:1165-1167` - `text({ services: ['Barba'] })).toBe(offer([...wed], CORTE_BARBA))`; `:1168` - `expect(draft()?.serviceIds).toEqual(['corte', 'barba'])` | PASS |
| C12 | após o aceite, toda chamada ao motor recebe `serviceIds ['corte','barba']` | unit, passed | `book-via-whatsapp.use-case.spec.ts:1178` - `expect(search.mock.calls.length).toBeGreaterThan(0)`; `:1180` - `expect(query.serviceIds).toEqual(['corte', 'barba'])` em cada chamada | PASS |
| C13 | `choice: 1` agenda Corte + Barba, 12:00-12:50, resumo exato com R$ 75,00 | unit, passed | `book-via-whatsapp.use-case.spec.ts:1189-1191` - `toBe('Agendamento confirmado!\nServiços: Corte, Barba\nBarbeiro: João\nData: quarta-feira, 30/09\nHorário: 12:00\nValor: R$ 75,00\nEndereço: Rua das Flores, 123')`; `:1193` - `serviceIds).toEqual(['corte', 'barba'])`; `:1194` - `startsAt).toEqual(local(TOMORROW, '12:00'))`; `:1195` - `endsAt).toEqual(local(TOMORROW, '12:50'))` | PASS |
| C14 | aceite com `date: '2026-10-01'`: oferta Corte + Barba de quinta com João | unit, passed | `book-via-whatsapp.use-case.spec.ts:1202-1204` - `text({ addOnAccepted: true, date: '2026-10-01' })).toBe(offer([thu('12:00'), thu('12:30'), thu('13:00')], CORTE_BARBA))` | PASS |
| C15 | roteamento: (a) aceite sem `bookingRequested` vai ao agendamento; (b) `humanRequested` transfere com `requested`; (c) `offTopic` recusa | unit, passed (3 testes) | (a) `src/usecases/answer-client-question/answer-client-question.use-case.spec.ts:836` - `expect(await lastText({ addOnAccepted: true })).toEqual([OFFER_BOTH])`; `:837` - `expect(handle).toHaveBeenCalledTimes(1)`; (b) `:845-851` - `toEqual([HANDOFF_REPLY])`; `:852` - `expect(handle).not.toHaveBeenCalled()`; `:853` - `pauseReason).toBe('requested')`; (c) `:861-867` - `toEqual([REFUSAL])`; `:868` - `expect(handle).not.toHaveBeenCalled()` | PASS |
| C16 | recusa: oferta exata de Corte, rascunho `['corte']`, `pending:false` | unit, passed | `book-via-whatsapp.use-case.spec.ts:1211-1213` - `expect(await text({})).toBe(offer([wed('12:00'), wed('12:30'), wed('13:00')]))`; `:1214-1217` - `toMatchObject({ serviceIds: ['corte'], addOnSuggestion: { serviceId: 'barba', pending: false } })` | PASS |
| C17 | descrição OpenAPI do webhook contém `US-23` | e2e, passed | `test/api-docs.e2e-spec.ts:214` - `expect(hook.description).toContain('US-23')`; o texto está em `src/infrastructure/external/whatsapp/evolution/evolution-webhook.controller.ts:77` ("Quando um serviço pedido tem serviço adicional sugerido (US-23), ...") | PASS |
| C18 | door 1: repassa `addOnAccepted`; sem o campo rejeita com `MessageInterpreterUnavailableError`; schema exige; instrução com `Barba` / `(nenhum serviço adicional sugerido)` | unit, passed (3 testes) | `src/infrastructure/external/gemini/gemini-message-interpreter.spec.ts:459` - `resolves.toEqual(ACCEPTED)` (`addOnAccepted: true`); `:468-470` - `rejects.toBeInstanceOf(MessageInterpreterUnavailableError)`; `:482` - `expect(schema.required).toContain('addOnAccepted')`; `:484-486` - `toContain('Serviço adicional sugerido ao cliente na mensagem anterior:\nBarba\n')`; `:488-490` - `toContain('...anterior:\n(nenhum serviço adicional sugerido)\n')` | PASS |
| C19 | door 2: `saveDraft`/`findDraft` devolve a sugestão pendente; rascunho antigo é lido com `addOnSuggestion: null` | e2e, passed (2 testes) | `test/database/typeorm-conversation.repository.e2e-spec.ts:98-100` - `findDraft(...)).resolves.toEqual(saved)` com `addOnSuggestion: { serviceId, pending: true }`; `:112` - `expect(await storedDraft()).not.toHaveProperty('addOnSuggestion')`; `:113-115` - `resolves.toEqual({ ...legacy, addOnSuggestion: null })` | PASS |
| C20 | pelo webhook: `SUGESTAO`, depois a oferta Corte + Barba, depois uma linha em `appointments` com `bot`/`confirmed`, Corte e Barba, 50 min | e2e, passed | `test/whatsapp-booking.e2e-spec.ts:339-341` - `expect(texts()).toEqual(['Quer incluir Barba por +R$ 30,00? ...só com Corte.'])`; `:344-346` - `texts()[1]).toBe('Horários para Corte + Barba (R$ 75,00, 50 min):\n1. ...')`; `:358-364` - `rows).toEqual([expect.objectContaining({ origin: 'bot', status: 'confirmed', minutes: 50 })])`; `:370` - `service_id)).toEqual([corte, barba])` | PASS |
| C21 | a sugestão sai com `kind: 'booking'`, conta `replies{kind="booking"}` e zera as falhas (1 -> 0) | unit, passed | `answer-client-question.use-case.spec.ts:874` - `consecutiveFailures).toBe(1)` (pré-condição); `:876-879` - `resolves.toEqual({ outcome: 'sent', kind: 'booking' })`; `:881` - `expect(metrics.replies.at(-1)).toBe('booking')`; `:882` - `consecutiveFailures).toBe(0)` | PASS |

### Precision and level notes (não bloqueiam)

- C17 (precision gap no check): o check fixa só a substring `US-23`, que passaria com qualquer menção à história. Conferi à mão que a descrição de fato descreve a sugestão (`evolution-webhook.controller.ts:77`). Um check mais preciso afirmaria um trecho como `serviço adicional sugerido`.
- C21 (level): o contador `whatsapp_replies_total{kind="booking"}` é afirmado no fake de métricas (`metrics.replies`), não no registry Prometheus. O adaptador da métrica já existia e não muda no diff, então o nível unitário basta para afirmar que o rótulo é `booking`.
- C6 (precision): a claim diz "oferta de Corte para o novo horário" sem fixar os horários. O teste é mais preciso que a claim e afirma o texto exato (terça 13:00, 13:30, 14:00).
- Cosmético: em `book-via-whatsapp.use-case.spec.ts` o `describe('US-23 add-on suggestion')` está aninhado dentro do `describe` da US-18 (o nome completo é "BookViaWhatsAppUseCase US-18 US-23 ..."). Isso não afeta nenhuma prova.

## Swept existing re-read

- failure modes / dependency failure (US-17 AC 38): `src/usecases/answer-client-question/answer-client-question.use-case.ts:199-213`. `MessageInterpreterUnavailableError` vira `kind: 'unavailable'`, que não chama `recordFailure` nem `resetFailures`, então a contagem de falhas fica como estava. O `interpret` lança antes do `booking.handle`, então o rascunho também não muda. A restrição está lá.
- idempotency (US-15 door 3): `answer-client-question.use-case.ts:108` - `const claimed = await this.inboundMessages.claim(...)` reivindica a mensagem antes de responder. A restrição está lá.
- authorization (AD-011): `src/infrastructure/external/whatsapp/evolution/evolution-webhook.controller.ts:59` - `@UseGuards(EvolutionWebhookGuard)`. O guard compara `WHATSAPP_WEBHOOK_SECRET` com `timingSafeEqual` e lança `UnauthorizedException` (`evolution-webhook.guard.ts:21-32`). O diff não adiciona rota. A restrição está lá.
- concurrency: `n/a`, política aprovada. Não há nada a conferir no código.

## Coverage

O recálculo da Coverage não roda no perfil `light`. Os conjuntos que aparecem dentro das claims (C2 (a)-(g), C4 com 2 configurações, C5 (a)-(c), C15 (a)-(c)) foram conferidos membro a membro na tabela de checks acima.

## Test policy rows

Não roda no perfil `light`. Além disso, `checks.md` não tem seção `Test policy`.

## Faults injected

Não roda no perfil `light`. Nenhuma falha foi injetada.

## Gate

- `npx jest <3 arquivos unitários> -t "US-23.*\((C1|...|C21)\)" --json` - 31 passed, 0 failed
- `npx jest --config ./test/jest-e2e.json <3 arquivos e2e> -t "US-23.*\((C17|C19|C20)\)" --json` - 4 passed, 0 failed
- Total: 35 passed, 0 failed. Checks provados: 21/21.
