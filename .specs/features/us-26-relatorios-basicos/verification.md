# US-26: Relatórios básicos verification

**Verdict**: PASS
**Profile**: light
**Diff range**: 170e54c..b5726a95b37ad0a08321a991eae3003fd2a468be
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

## Binding sources

Not run at profile light (step 1 runs only under `ui`). Para registro, a seção "US-26: Relatórios básicos" de `docs/PRD.md` (CA-26.1 a CA-26.3, RF-38, RF-39) foi lida; o CA-26.2 fala em "% de agendamentos feitos pelo bot sem transferência para humano", e o plano resolve isso como `origin = 'bot'` por decisão do usuário (Out of scope e Assumptions do `plan.md`, "o bot pausado não agenda, então a origem basta"). Não é um achado deste perfil.

## Checks

As provas rodaram uma vez por alvo no HEAD `b5726a9`, com o resultado de cada teste lido do `--json` (todo teste nomeado aparece individualmente como `passed`; nenhum ficou de fora do filtro):

- unitário: `npx jest src/usecases/get-barbershop-report/get-barbershop-report.use-case.spec.ts src/interface-adapters/controllers/schemas/report.query.schema.spec.ts -t "\((C1|C2|C5|C6|C7|C9|C10|C11|C12|C13|C14|C15)\)"` exit 0, 23 passed, 0 failed (1 pulado pelo filtro: `CA-26.1: accepts a period and a barber filter`, que não carrega check)
- e2e: `npx jest --config ./test/jest-e2e.json test/reports.e2e-spec.ts -t "\((C[0-9]+)\)" --runInBand` exit 0, 30 passed, 0 failed, 0 pulados

Os três arquivos de prova estão no diff `170e54c..HEAD` (todos novos). Caminhos abreviados: `uc.spec` = `src/usecases/get-barbershop-report/get-barbershop-report.use-case.spec.ts`, `schema.spec` = `src/interface-adapters/controllers/schemas/report.query.schema.spec.ts`, `e2e` = `test/reports.e2e-spec.ts`. No e2e, todo `reportOf(...)` passa por `.expect(200)` (`test/reports.e2e-spec.ts:178`) e todo `errorsOf(...)` por `.expect(400)` (`:185`), então os status `200` e `400` das claims são afirmados na borda HTTP. As constantes de mensagem (`e2e:13-20`, `schema.spec:3-7`) foram comparadas caractere a caractere com os literais do `checks.md` e batem.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | total de todos os status com bordas locais; `200` | unit e e2e, `(C1)` passed | `test/reports.e2e-spec.ts:238` - `expect(body.totalAppointments).toBe(4)` com 00:00 de 05/10 dentro (`:214`) e 23:59 de 04/10 e 00:00 de 06/10 fora (`:230-234`); `200` em `:178`; `uc.spec:125` `toBe(4)` | PASS |
| C2 | `cancellations` conta os `cancelled`, inclusive o antigo de remarcação | unit e e2e, `(C2)` passed | `test/reports.e2e-spec.ts:258` - `expect((await reportOf()).cancellations).toBe(2)`; `uc.spec:143` `toBe(2)` | PASS |
| C3 | `noShows` conta os `no_show` | e2e `(C3)` passed | `test/reports.e2e-spec.ts:278` - `expect((await reportOf()).noShows).toBe(2)` (com um `attended` fora da conta, `:272-276`) | PASS |
| C4 | receita dos `attended` a preço atual: `10500`, depois `12500` | e2e `(C4)` passed | `test/reports.e2e-spec.ts:306` - `estimatedRevenueCents` `toBe(10500)` com `confirmed`, `no_show` e `cancelled` com Corte + Barba (`:293-304`); `:313` `toBe(12500)` após `price_cents = 5000` (`:308-311`) | PASS |
| C5 | ocupação (a)-(f) | unit e e2e, 6 testes `(C5)` passed em cada | `test/reports.e2e-spec.ts:335` (a) `occupancyPercent` `toBe(50)`; `:344` (b) `toBe(75)` com bloqueio 09-10 (`:339`); `:350` (c) `toBe(16.7)` para 11:30-12:30 (= 30/180); `:369-370` (d) `toBe(50)` e `totalAppointments` `toBe(2)` com Bruno inativo; `:375`/`:378` (e) `toBe(33.3)` e `toBe(66.7)`; `:388` (f) `toBe(50)` com Ana 08:00-12:00 (`:382-385`); unit `uc.spec:157`, `:171`, `:177`, `:192-193`, `:198`/`:201`, `:215` | PASS |
| C6 | `occupancyPercent: null` sem jornada e para `barberId` inativo, `200` | unit e e2e, 2 testes `(C6)` passed | `test/reports.e2e-spec.ts:394` - `expect(body.occupancyPercent).toBeNull()` no domingo; `:412-413` `toBeNull()` e `totalAppointments` `toBe(1)` com `barberId` inativo (200 em `:178`); `uc.spec:221`, `:235-236` | PASS |
| C7 | com `barberId` só Ana; sem, `barberId: null` e soma | unit e e2e, `(C7)` passed | `test/reports.e2e-spec.ts:438-448` - `toEqual({ ..., barberId: ana, totalAppointments: 2, cancellations: 1, noShows: 0, occupancyPercent: 50, estimatedRevenueCents: 4000, botBookedPercent: 0 })`; `:449-460` `toEqual({ ..., barberId: null, totalAppointments: 3, cancellations: 1, noShows: 1, occupancyPercent: 28.6, estimatedRevenueCents: 4000, botBookedPercent: 33.3 })`; unit `uc.spec:265-287` | PASS |
| C8 | barbearia B não muda nada (RN-26) | e2e `(C8)` passed | `test/reports.e2e-spec.ts:488` - `expect(await reportOf()).toEqual(before)` após agendamentos, bloqueio e serviço de B; `:489-493` `toMatchObject({ totalAppointments: 1, occupancyPercent: 50, estimatedRevenueCents: 4000 })` (50 = 90/180 prova que a jornada de Carla, de B, não entra no denominador) | PASS |
| C9 | 4 entradas -> `400` com a mensagem de data | unit e e2e, 4 e2e e 5 unit `(C9)` passed | `test/reports.e2e-spec.ts:496-507` - it.each sem `from`, sem `to`, `from=05/10/2026`, `to=2026-02-30`, cada um `expect(await errorsOf(query)).toEqual([{ field, message: DATE_MESSAGE }])` (`:504-506`) com `400` em `:185`; `schema.spec:31-36`, `:42-47` | PASS |
| C10 | `to < from` -> `400` com a mensagem de ordem; `from = to` aceito | unit e e2e, `(C10)` passed | `test/reports.e2e-spec.ts:511-513` - `toEqual([{ field: 'to', message: ORDER_MESSAGE }])`; `:514` `.expect(200)` com `from = to`; `schema.spec:52-57` | PASS |
| C11 | 92 dias aceito, 93 -> `400` com a mensagem de máximo | unit e e2e, `(C11)` passed | `test/reports.e2e-spec.ts:518-521` - `2026-01-01..2026-04-02` `.expect(200)`; `:522-524` `2026-04-03` `toEqual([{ field: 'to', message: MAX_DAYS_MESSAGE }])`; `schema.spec:61-66` | PASS |
| C12 | `barberId=abc` -> `400` com a mensagem de barbeiro | unit e e2e, `(C12)` passed | `test/reports.e2e-spec.ts:528-530` - `toEqual([{ field: 'barberId', message: BARBER_MESSAGE }])`; `schema.spec:70-72` | PASS |
| C13 | UUID inexistente e barbeiro de B -> `404` "Barbeiro não encontrado."; `BarberNotFoundError` | unit e e2e, 1 unit e 2 e2e `(C13)` passed | `test/reports.e2e-spec.ts:533-543` - it.each `randomUUID()` e `foreignBarber`, `.expect(404)` (`:540`) e `expect(response.body).toEqual(BARBER_NOT_FOUND)` (`:542`); `uc.spec:291-296` `rejects.toThrow(BarberNotFoundError)` para `missing` e `foreign` | PASS |
| C14 | `botBookedPercent` 75 (3 bot, um cancelado, 1 manual) e 33.3 | unit e e2e, 2 testes `(C14)` passed em cada | `test/reports.e2e-spec.ts:566` - `toBe(75)` com o bot cancelado em `:558-563`; `:578` `toBe(33.3)`; `uc.spec:309`, `:317` | PASS |
| C15 | período vazio: zeros e `botBookedPercent: null` | unit e e2e, `(C15)` passed | `test/reports.e2e-spec.ts:582-592` - `toEqual({ ..., totalAppointments: 0, cancellations: 0, noShows: 0, occupancyPercent: null, estimatedRevenueCents: 0, botBookedPercent: null })`; `uc.spec:321-331` | PASS |
| C16 | Barbeiro -> `403` "Acesso negado." | e2e `(C16)` passed | `test/reports.e2e-spec.ts:610` - `.expect(403)`; `:612` `expect(response.body).toEqual(FORBIDDEN)` (`{ message: 'Acesso negado.' }`, `:13`) | PASS |
| C17 | sem `Authorization` -> `401` "Sessão inválida ou expirada." | e2e `(C17)` passed | `test/reports.e2e-spec.ts:616` - `.expect(401)`; `:618` `toEqual(UNAUTHORIZED)` (`:14`) | PASS |
| C18 | teste gratuito vencido, Dono recebe `200` com números | e2e `(C18)` passed | `test/reports.e2e-spec.ts:623` `trial_ends_at = now() - interval '1 day'`; `:630` precondição de suspensão `POST /settings/services` `.expect(402)`; `:637-641` `reportOf()` (200) `toMatchObject({ totalAppointments: 1, occupancyPercent: 50, estimatedRevenueCents: 4000 })` | PASS |
| C19 | OpenAPI: summary US-26, query, 200 com 6 propriedades, 404 com exemplo, `x-roles: ['owner']` | e2e `(C19)` passed | `test/reports.e2e-spec.ts:647` - `expect(operation.summary).toContain('US-26')`; `:648` `toMatchObject({ 'x-roles': ['owner'] })`; `:649-655` `from`, `to`, `barberId` `in: 'query'`; `:656-666` cada propriedade `toContain` no JSON da resposta `200`; `:667-669` 404 `toContain('Barbeiro não encontrado.')` | PASS |

Level and sampling: todo check cita status, rota ou formato de resposta, e cada um tem uma prova e2e que atravessa `GET /reports` com supertest sobre o `AppModule` (`test/support/create-account-test-app.ts:24` importa o `AppModule`, que registra o `ReportsModule` em `src/app.module.ts:49`); C19 lê o documento gerado por `buildApiDocument(app)`. Toda enumeração de claim é provada em cada membro: C1 4 status e 3 bordas; C5 (a)-(f); C6 2 casos; C7 filtrado e sem filtro; C9 as 4 entradas; C11 92 e 93; C13 os 2 barbeiros; C14 75 e 33.3. Nenhum gap de nível ou de amostragem.

Swept rows resolving to `existing`, re-read against the code:

- authorization, `SessionGuard` só-Dono por padrão (AD-007): presente. `src/interface-adapters/controllers/roles.decorator.ts:8` `DEFAULT_ROLES = ['owner']`; `src/infrastructure/http/session.guard.ts:54-60` usa `?? DEFAULT_ROLES` e lança `ForbiddenException({ message: 'Acesso negado.' })`; registrado como `APP_GUARD` em `src/infrastructure/modules/account.module.ts:330`. O controller não tem `@Roles` nem `@Public` (`src/interface-adapters/controllers/reports.controller.ts:17-24`).
- authorization, `SubscriptionAccessGuard` libera `GET` (AD-017): presente. `src/infrastructure/http/subscription-access.guard.ts:20-25` `READ_ONLY_WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE']` e `:56-58` devolve `true` para qualquer outro método; registrado depois do `SessionGuard` em `src/infrastructure/modules/account.module.ts:332`.

Findings (nenhum bloqueia o veredito; são notas de precisão sobre os checks e a força dos testes):

1. C7, precisão: a claim fala em Ana e Bruno com "bloqueios diferentes", mas só Bruno tem bloqueio (13:00-18:00, `test/reports.e2e-spec.ts:419`), fora da jornada de Ana (09:00-12:00). Por isso a visão filtrada de Ana não discriminaria um filtro de bloqueio por barbeiro quebrado. A soma (`28.6` = 120/420, `:457`) prova que o bloqueio de Bruno é aplicado a Bruno, e o código filtra por barbeiro em `src/usecases/get-barbershop-report/get-barbershop-report.use-case.ts:136` e `:147-150` (`periodsOf`), mas nenhum teste mostra que o bloqueio de um barbeiro não reduz a jornada de outro.
2. C2, precisão: "o agendamento antigo de uma remarcação" é representado por uma linha `cancelled` inserida direto (`test/reports.e2e-spec.ts:250-255`); o fluxo de remarcação (US-18) não é exercitado. É equivalente pelo AD-014 (a remarcação grava o antigo como `cancelled`), então o CA vale.
3. C19, precisão: as seis propriedades da resposta `200` são afirmadas por substring no JSON serializado (`test/reports.e2e-spec.ts:656-666`), não como chaves de `properties` do schema; um nome que aparecesse só numa descrição também passaria.

## Coverage

Not run at profile light (the Coverage recompute runs under `standard` and `ui`).

## Test policy rows

Not run at profile light, and `checks.md` carries no `Test policy` section.

## Faults injected

Not run at profile light (fault injection runs under `standard` and `ui`).

## Gate

- `npx jest <2 unit files> -t "\((C1|C2|C5|C6|C7|C9|C10|C11|C12|C13|C14|C15)\)"` - 23 passed, 0 failed (1 skipped by the filter, no check)
- `npx jest --config ./test/jest-e2e.json test/reports.e2e-spec.ts -t "\((C[0-9]+)\)" --runInBand` - 30 passed, 0 failed
- `npm run lint:check` - exit 0
- `npm run build` - exit 0
- `npm test` - 114 suites, 1538 passed, 0 failed
- `npm run test:e2e` - 60 suites, 847 passed, 0 failed
- Todos os 19 checks C1-C19 aparecem individualmente como passed
