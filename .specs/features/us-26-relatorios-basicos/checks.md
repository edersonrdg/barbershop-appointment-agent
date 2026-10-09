# US-26: Relatórios básicos checks

Profile: light
Plan: `.specs/features/us-26-relatorios-basicos/plan.md`

19 checks em 3 fatias · 1 one-way door · 0 open, 0 block

Um check concluído termina com ✅. Convenção das provas: todo teste cita o `CA` (ou o AC) e o id do check entre parênteses no nome, ex.: `it('CA-26.1 (C1): ...')`. O seletor `-t` usa esse id.

- e2e: `npx jest --config ./test/jest-e2e.json test/reports.e2e-spec.ts -t "<padrão>"` (Postgres do compose rodando)
- unitário: `npx jest <arquivo> -t "<padrão>"`

Cenário-base dos e2e de `test/reports.e2e-spec.ts`: barbearia A (`America/Sao_Paulo`, UTC-3) aberta segunda das 09:00 às 18:00; Ana trabalha segunda das 09:00 às 12:00 (180 min); Corte R$ 40,00 / 30 min e Barba R$ 25,00 / 30 min; período padrão `from = to = 2026-10-05` (segunda). Barbearia B com seus próprios barbeiro e agendamentos no mesmo dia.

## Checks

### S1 - O Dono vê os números da barbearia no período · ~12 arquivos · ~70 KB · ~18k

**C1** - `totalAppointments` conta os agendamentos que começam entre `from` 00:00 e `to` 23:59:59 locais, de todos os status: com agendamentos `confirmed`, `attended`, `no_show` e `cancelled` em 2026-10-05, um às 00:00 locais de 2026-10-05 (03:00Z) entra, e um às 23:59 locais de 2026-10-04 e um às 00:00 locais de 2026-10-06 ficam de fora; `GET /reports?from=2026-10-05&to=2026-10-05` responde `200` com `totalAppointments` igual ao número dos de dentro (AC 1, CA-26.1) ✅
Proof: `npx jest src/usecases/get-barbershop-report/get-barbershop-report.use-case.spec.ts -t "\(C1\)"`
Proof: `npx jest --config ./test/jest-e2e.json test/reports.e2e-spec.ts -t "\(C1\)"`

**C2** - `cancellations` é o número de agendamentos `cancelled` do período; o agendamento antigo de uma remarcação (gravado `cancelled`, AD-014) conta como um cancelamento (AC 2, CA-26.1) ✅
Proof: `npx jest src/usecases/get-barbershop-report/get-barbershop-report.use-case.spec.ts -t "\(C2\)"`
Proof: `npx jest --config ./test/jest-e2e.json test/reports.e2e-spec.ts -t "\(C2\)"`

**C3** - `noShows` é o número de agendamentos `no_show` do período (AC 3, CA-26.1) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/reports.e2e-spec.ts -t "\(C3\)"`

**C4** - `estimatedRevenueCents` soma o preço atual de cada serviço dos agendamentos `attended`: um atendido com Corte + Barba e um atendido com Corte dão `10500`; agendamentos `confirmed`, `no_show` e `cancelled` com serviços não somam nada; depois de mudar o preço do Corte para R$ 50,00, o mesmo período devolve `12500` (AC 4, CA-26.1) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/reports.e2e-spec.ts -t "\(C4\)"`

**C5** - `occupancyPercent` segue a fórmula do AC 5: (a) cenário-base com um atendido, uma falta e um confirmado de 30 min e um cancelado de 30 min dá `50`; (b) um bloqueio de Ana das 09:00 às 10:00 reduz a jornada para 120 min e, com os mesmos 90 min agendados fora dele, dá `75`; (c) um agendamento das 11:30 às 12:30 conta só 30 min; (d) um barbeiro inativo com jornada e agendamentos não entra no numerador nem no denominador; (e) 60 de 180 min dá `33.3` e 120 de 180 min dá `66.7`; (f) a jornada é o trabalho do barbeiro ∩ o horário de abertura: Ana das 08:00 às 12:00 com a barbearia abrindo às 09:00 dá 180 min (AC 5, CA-26.1) ✅
Proof: `npx jest src/usecases/get-barbershop-report/get-barbershop-report.use-case.spec.ts -t "\(C5\)"`
Proof: `npx jest --config ./test/jest-e2e.json test/reports.e2e-spec.ts -t "\(C5\)"`

**C6** - Num período sem jornada (domingo 2026-10-04, barbearia fechada) a resposta traz `occupancyPercent: null`; um `barberId` de barbeiro inativo responde `200` com `occupancyPercent: null` (AC 6, assumptions de barbeiro inativo) ✅
Proof: `npx jest src/usecases/get-barbershop-report/get-barbershop-report.use-case.spec.ts -t "\(C6\)"`
Proof: `npx jest --config ./test/jest-e2e.json test/reports.e2e-spec.ts -t "\(C6\)"`

**C7** - Com Ana e Bruno com agendamentos, jornadas e bloqueios diferentes no período, `GET /reports?...&barberId={ana}` devolve `barberId` igual ao de Ana e total, cancelamentos, faltas, receita, ocupação e % do bot só de Ana; sem `barberId`, `barberId: null` e os números somam os dois (AC 7, CA-26.1) ✅
Proof: `npx jest src/usecases/get-barbershop-report/get-barbershop-report.use-case.spec.ts -t "\(C7\)"`
Proof: `npx jest --config ./test/jest-e2e.json test/reports.e2e-spec.ts -t "\(C7\)"`

**C8** - Os agendamentos, a jornada e os bloqueios da barbearia B no mesmo dia não mudam nenhum número do relatório do Dono de A (AC 8, RN-26) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/reports.e2e-spec.ts -t "\(C8\)"`

**C9** - Sem `from`, sem `to`, com `from=05/10/2026` e com `to=2026-02-30` a rota responde `400` com exatamente "Informe uma data válida no formato AAAA-MM-DD." (AC 9, L-008) ✅
Proof: `npx jest src/interface-adapters/controllers/schemas/report.query.schema.spec.ts -t "\(C9\)"`
Proof: `npx jest --config ./test/jest-e2e.json test/reports.e2e-spec.ts -t "\(C9\)"`

**C10** - `from=2026-10-05&to=2026-10-04` responde `400` com exatamente "A data final deve ser igual ou posterior à data inicial."; `from = to` é aceito (AC 10, L-008) ✅
Proof: `npx jest src/interface-adapters/controllers/schemas/report.query.schema.spec.ts -t "\(C10\)"`
Proof: `npx jest --config ./test/jest-e2e.json test/reports.e2e-spec.ts -t "\(C10\)"`

**C11** - `from=2026-01-01&to=2026-04-02` (92 dias) é aceito e `from=2026-01-01&to=2026-04-03` (93 dias) responde `400` com exatamente "O período pode ter no máximo 92 dias." (AC 11, L-008) ✅
Proof: `npx jest src/interface-adapters/controllers/schemas/report.query.schema.spec.ts -t "\(C11\)"`
Proof: `npx jest --config ./test/jest-e2e.json test/reports.e2e-spec.ts -t "\(C11\)"`

**C12** - `barberId=abc` responde `400` com exatamente "Informe um id de barbeiro válido." (AC 12, L-008) ✅
Proof: `npx jest src/interface-adapters/controllers/schemas/report.query.schema.spec.ts -t "\(C12\)"`
Proof: `npx jest --config ./test/jest-e2e.json test/reports.e2e-spec.ts -t "\(C12\)"`

**C13** - Com um UUID inexistente e com o id do barbeiro da barbearia B, o Dono de A recebe `404` com exatamente "Barbeiro não encontrado."; no use case, o barbeiro inexistente lança `BarberNotFoundError` (AC 13, RN-26) ✅
Proof: `npx jest src/usecases/get-barbershop-report/get-barbershop-report.use-case.spec.ts -t "\(C13\)"`
Proof: `npx jest --config ./test/jest-e2e.json test/reports.e2e-spec.ts -t "\(C13\)"`

### S2 - O Dono vê quanto o bot agenda sozinho · ~2 arquivos · ~25 KB · ~6k

**C14** - Com 3 agendamentos de origem `bot` (um deles `cancelled`) e 1 `manual` no período, `botBookedPercent` é `75`; com 1 de 3, é `33.3` (AC 14, CA-26.2) ✅
Proof: `npx jest src/usecases/get-barbershop-report/get-barbershop-report.use-case.spec.ts -t "\(C14\)"`
Proof: `npx jest --config ./test/jest-e2e.json test/reports.e2e-spec.ts -t "\(C14\)"`

**C15** - Num período sem agendamentos a resposta traz `totalAppointments: 0`, `cancellations: 0`, `noShows: 0`, `estimatedRevenueCents: 0` e `botBookedPercent: null` (AC 15, CA-26.2) ✅
Proof: `npx jest src/usecases/get-barbershop-report/get-barbershop-report.use-case.spec.ts -t "\(C15\)"`
Proof: `npx jest --config ./test/jest-e2e.json test/reports.e2e-spec.ts -t "\(C15\)"`

### S3 - Só o Dono vê relatórios · ~3 arquivos · ~35 KB · ~9k

**C16** - Um Barbeiro chama `GET /reports?from=2026-10-05&to=2026-10-05` e recebe `403` com exatamente "Acesso negado." (AC 16, CA-26.3) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/reports.e2e-spec.ts -t "\(C16\)"`

**C17** - A rota sem `Authorization` responde `401` com "Sessão inválida ou expirada." (AC 17) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/reports.e2e-spec.ts -t "\(C17\)"`

**C18** - Com o teste gratuito da barbearia A vencido (`trial_ends_at` no passado), o Dono recebe `200` com os números do período (AC 18, AD-017) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/reports.e2e-spec.ts -t "\(C18\)"`

**C19** - O OpenAPI de `GET /reports` tem `summary` citando "US-26", os parâmetros de query `from`, `to` e `barberId`, a resposta `200` com as propriedades `totalAppointments`, `cancellations`, `noShows`, `occupancyPercent`, `estimatedRevenueCents` e `botBookedPercent`, a resposta `404` com o exemplo "Barbeiro não encontrado." e `x-roles: ['owner']` (AC 19) ✅
Proof: `npx jest --config ./test/jest-e2e.json test/reports.e2e-spec.ts -t "\(C19\)"`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| `GET /reports` statuses (5) | `200` C1 · `400` C9, C10, C11, C12 · `401` C17 · `403` C16 · `404` C13 | - |
| campos da resposta (9) | `from` C1 · `to` C1 · `barberId` C7 · `totalAppointments` C1 · `cancellations` C2 · `noShows` C3 · `occupancyPercent` C5 · `estimatedRevenueCents` C4 · `botBookedPercent` C14 | - |
| status de agendamento no total (4) | `confirmed` C1 · `attended` C1 · `no_show` C1 · `cancelled` C1 | - |
| status de agendamento na receita (4) | `attended` soma C4 · `confirmed` C4 · `no_show` C4 · `cancelled` C4 | - |
| status de agendamento na ocupação (4) | `confirmed` C5 · `attended` C5 · `no_show` C5 · `cancelled` fica de fora C5 | - |
| bordas do período (3) | início de `from` entra C1 · antes de `from` fica de fora C1 · depois de `to` fica de fora C1 | - |
| termos da jornada (3) | trabalho do barbeiro C5 · ∩ abertura C5 · − bloqueios C5 | - |
| denominador zero (2) | ocupação C6 · % do bot C15 | - |
| origem (2) | `bot` C14 · `manual` C14 | - |
| barbeiro (4) | todos C7 · um da barbearia C7 · inativo C5, C6 · de outra barbearia C13 | - |
| bound do período (3 edges) | `to < from` C10 · 92 dias C11 · 93 dias C11 | - |
| mensagens de validação (4) | data C9 · ordem C10 · máximo C11 · barbeiro C12 | - |
| quem chama (4) | Dono C1 · Barbeiro C16 · sem sessão C17 · Dono com barbearia suspensa C18 | - |
| tenant (2) | barbearia da sessão C1 · outra barbearia C8, C13 | - |
| doors do Landing (1) | door 1 C1, C5, C6, C14, C15, C19 | - |
| startup config: rota registrada (1 assembly) | módulo de relatórios no `AppModule`, que o e2e importa, C1 | - |

- Todos os checks (C1-C19) citam status, rota ou formato de resposta, e cada um tem uma prova e2e que cruza a rota HTTP
- C1, C2, C5-C7, C13-C15 somam a prova unitária do use case, porque a decisão de recorte, filtro e denominador é tomada ali; C9-C12 somam a prova do schema, onde as mensagens são definidas

## Swept

- validation: C9, C10, C11, C12
- failure modes: n/a - só leituras; não há gravação parcial para desfazer
- idempotency: n/a - `GET` sem efeito colateral
- authorization: C16, C17, C18; existing - `SessionGuard` só-Dono por padrão (AD-007) e `SubscriptionAccessGuard` libera `GET` (AD-017)
- concurrency: n/a - só leitura; um agendamento gravado durante a consulta entra ou não conforme o instante da leitura, sem estado inconsistente gravado
- data lifecycle: n/a - nada é gravado; o relatório é calculado na leitura
- dependency failure: n/a - só o Postgres
- state transitions: n/a - nenhuma transição; os status só são lidos (C1-C5)
- observability: n/a - nenhum RF/RNF pede métrica do relatório; a rota não carrega dado pessoal, e o logger HTTP já registra a requisição

## Handoff

- Arquivos existentes tocados ou usados de molde somam ~60 KB (`wc -c`: `schedule.controller.ts`, `schedule.module.ts`, `schedule.query.schema.ts`, `schedule.presenter.ts`, `booking-context.ts`, `barbershop.ts`, `barber.ts`, `app.module.ts`, `test/schedule.e2e-spec.ts`) ≈ 15k tokens; arquivos novos estimados em ~45 KB (use case e spec, port e query TypeORM, schema e spec, presenter, controller, módulo, e2e) ≈ 11k tokens
- S1 ≈ 18k, S2 fecha em ≈ 24k, S3 em ≈ 33k, abaixo do orçamento de 150k - um builder
- Mechanism: one builder (dentro do orçamento, sem pergunta)
