# US-12: Perfil e histórico do cliente checks

Profile: light
Plan: `.specs/features/us-12-perfil-e-historico-do-cliente/plan.md`

27 checks em 3 fatias · 3 one-way doors · 0 open, 0 block

Um check concluído termina com ✅. Convenção das provas: todo teste cita o `CA` e o id do check entre parênteses no nome, ex.: `it('CA-12.1 (C1): ...')`. O seletor `-t` usa esse id.

- e2e: `npx jest --config ./test/jest-e2e.json <arquivo> -t "<padrão>"` (Postgres do compose rodando)
- unitário: `npx jest <arquivo> -t "<padrão>"`

## Checks

### S1 - Buscar clientes · ~9 arquivos · ~60 KB · ~15k

**C1** - `GET /clients?q=joão` como Dono responde `200` com João Silva e sem Maria; `q=JOÃO` devolve o mesmo resultado (AC 1, CA-12.1)
Proof: `npx jest --config ./test/jest-e2e.json test/clients.e2e-spec.ts -t "\(C1\)"`

**C2** - `q=98765` e `q=(11) 98765` acham o cliente de telefone `+5511987654321`; `q=987` (3 dígitos) não acha pelo telefone (AC 2)
Proof: `npx jest --config ./test/jest-e2e.json test/clients.e2e-spec.ts -t "\(C2\)"`

**C3** - `GET /clients` sem `q` responde `200` com todos os clientes da barbearia (AC 3)
Proof: `npx jest --config ./test/jest-e2e.json test/clients.e2e-spec.ts -t "\(C3\)"`

**C4** - Com 51 clientes, a busca devolve exatamente 50, ordenados por nome sem diferenciar maiúsculas (`ana` antes de `Bruno`) e depois por id, cada item com exatamente `id`, `name` e `phone` (AC 4)
Proof: `npx jest --config ./test/jest-e2e.json test/clients.e2e-spec.ts -t "\(C4\)"`

**C5** - Um termo sem correspondência responde `200` com `{ clients: [] }` (AC 5)
Proof: `npx jest --config ./test/jest-e2e.json test/clients.e2e-spec.ts -t "\(C5\)"`

**C6** - `q` com 1 caractere, com 81 caracteres ou com `"  a  "` é recusado com exatamente "Informe de 2 a 80 caracteres para buscar."; 2 e 80 caracteres são aceitos; na rota, `q=a` responde `400` com essa mensagem (AC 6, L-008)
Proof: `npx jest src/interface-adapters/controllers/schemas/client-search.query.schema.spec.ts -t "\(C6\)"`
Proof: `npx jest --config ./test/jest-e2e.json test/clients.e2e-spec.ts -t "\(C6\)"`

**C7** - `q=%%` e `q=__` respondem `clients: []` quando nenhum nome contém esses caracteres; `q=50%` acha só o cliente chamado `Promo 50%` (AC 7)
Proof: `npx jest --config ./test/jest-e2e.json test/clients.e2e-spec.ts -t "\(C7\)"`

**C8** - O Dono da barbearia B, com um cliente de mesmo nome e telefone, nunca recebe os clientes da barbearia A, com ou sem `q` (AC 8, RN-26)
Proof: `npx jest --config ./test/jest-e2e.json test/clients.e2e-spec.ts -t "\(C8\)"`

### S2 - Ver o perfil do cliente · ~12 arquivos · ~70 KB · ~18k

**C9** - `GET /clients/{id}` como Dono responde `200` com exatamente as chaves `id`, `name`, `phone`, `noShowCount`, `selfBookingBlocked`, `returnReminderEnabled`, `timezone` (`America/Sao_Paulo`), `pastAppointments`, `upcomingAppointments` e `topServices`, e cada agendamento no formato do item da agenda da US-08 (`id`, `barber`, `client`, `services`, `startsAt`, `endsAt`, `status`, `origin`) (AC 9, CA-12.2, door 2)
Proof: `npx jest --config ./test/jest-e2e.json test/clients.e2e-spec.ts -t "\(C9\)"`

**C10** - `pastAppointments` traz os agendamentos com início ≤ agora nos status `confirmed`, `attended` e `no_show`, do início mais recente ao mais antigo, e inclui o que começa exatamente agora (AC 10)
Proof: `npx jest src/usecases/get-client-profile/get-client-profile.use-case.spec.ts -t "\(C10\)"`
Proof: `npx jest --config ./test/jest-e2e.json test/clients.e2e-spec.ts -t "\(C10\)"`

**C11** - `upcomingAppointments` traz só os agendamentos com início > agora, do mais próximo ao mais distante (AC 11)
Proof: `npx jest src/usecases/get-client-profile/get-client-profile.use-case.spec.ts -t "\(C11\)"`
Proof: `npx jest --config ./test/jest-e2e.json test/clients.e2e-spec.ts -t "\(C11\)"`

**C12** - `topServices` conta só agendamentos `attended`, com no máximo 3 itens `{ id, name, count }`, ordenados por `count` decrescente e, no empate, por nome: com Corte ×3, Barba ×2, Sobrancelha ×2, Hidratação ×1 `attended` e Pigmentação ×5 em `no_show`/futuros, o resultado é Corte 3, Barba 2, Sobrancelha 2 (AC 12)
Proof: `npx jest src/usecases/get-client-profile/get-client-profile.use-case.spec.ts -t "\(C12\)"`
Proof: `npx jest --config ./test/jest-e2e.json test/clients.e2e-spec.ts -t "\(C12\)"`

**C13** - Com limite 2, um cliente com 2 faltas depois do último reset e 1 antes dele responde `noShowCount: 2` e `selfBookingBlocked: true`; subir o limite para 3 faz o mesmo perfil responder `selfBookingBlocked: false` (AC 13)
Proof: `npx jest --config ./test/jest-e2e.json test/clients.e2e-spec.ts -t "\(C13\)"`

**C14** - `returnReminderEnabled` é `false` para um cliente inserido sem a coluna e para o cliente criado por `POST /appointments` (US-10), e é `true` depois de gravar `return_reminder_enabled = true` no banco (AC 14)
Proof: `npx jest --config ./test/jest-e2e.json test/clients.e2e-spec.ts -t "\(C14\)"`

**C15** - O perfil de um cliente sem agendamentos responde `200` com `pastAppointments: []`, `upcomingAppointments: []`, `topServices: []`, `noShowCount: 0` e `selfBookingBlocked: false` (AC 15)
Proof: `npx jest --config ./test/jest-e2e.json test/clients.e2e-spec.ts -t "\(C15\)"`

**C16** - `GET /clients/abc` responde `400` com exatamente "Informe um id de cliente válido." (AC 16, L-008)
Proof: `npx jest --config ./test/jest-e2e.json test/clients.e2e-spec.ts -t "\(C16\)"`

**C17** - `GET /clients/{id}` com um UUID inexistente e com o id de um cliente da barbearia B responde `404` com exatamente "Cliente não encontrado." (AC 17, RN-26)
Proof: `npx jest --config ./test/jest-e2e.json test/clients.e2e-spec.ts -t "\(C17\)"`

**C18** - `clients.return_reminder_enabled` é `NOT NULL DEFAULT false`: um `INSERT` sem a coluna grava `false` e um `INSERT` com `NULL` é recusado com violação de not-null (`23502`) (door 1, Relations `Client`)
Proof: `npx jest --config ./test/jest-e2e.json test/database/clients-schema.e2e-spec.ts -t "\(C18\)"`

**C19** - A resposta de `PATCH /appointments/{id}/status` (US-11) continua igual: `client` com exatamente `id`, `noShowCount` e `selfBookingBlocked` (Impact)
Proof: `npx jest --config ./test/jest-e2e.json test/attendance.e2e-spec.ts -t "CA-11.1: marks a started appointment as attended"`

### S3 - Barbeiro só vê os próprios clientes · ~3 arquivos · ~45 KB · ~11k

**C20** - Bruno (Barbeiro) em `GET /clients` recebe só os clientes com agendamento dele, em qualquer status (um `no_show` conta), e não recebe quem só tem agendamento com Ana (AC 18, CA-12.3)
Proof: `npx jest src/usecases/search-clients/search-clients.use-case.spec.ts -t "\(C20\)"`
Proof: `npx jest --config ./test/jest-e2e.json test/clients.e2e-spec.ts -t "\(C20\)"`

**C21** - Bruno abre o perfil de João, que tem agendamentos com Bruno e com Ana, e recebe em `pastAppointments`, `upcomingAppointments` e `topServices` só os agendamentos de Bruno (AC 19, CA-12.3)
Proof: `npx jest --config ./test/jest-e2e.json test/clients.e2e-spec.ts -t "\(C21\)"`

**C22** - No mesmo perfil, Bruno recebe `noShowCount` contando também a falta de João com Ana (AC 20)
Proof: `npx jest --config ./test/jest-e2e.json test/clients.e2e-spec.ts -t "\(C22\)"`

**C23** - Bruno abre o perfil de Maria, que só tem agendamento com Ana, e recebe `404` com exatamente "Cliente não encontrado." (AC 21, door 3)
Proof: `npx jest --config ./test/jest-e2e.json test/clients.e2e-spec.ts -t "\(C23\)"`

**C24** - Caio (Barbeiro sem ficha) recebe `200 { clients: [] }` na busca e `404` "Cliente não encontrado." no perfil de João (AC 22)
Proof: `npx jest --config ./test/jest-e2e.json test/clients.e2e-spec.ts -t "\(C24\)"`

**C25** - `GET /clients` e `GET /clients/{id}` sem token respondem `401` com "Sessão inválida ou expirada." (AC 23)
Proof: `npx jest --config ./test/jest-e2e.json test/clients.e2e-spec.ts -t "\(C25\)"`

**C26** - No documento OpenAPI, `GET /clients` e `GET /clients/{id}` têm `summary` citando `US-12`, `x-roles` com `owner` e `barber`, resposta `200` com schema, `GET /clients` documenta `400` e `401`, e `GET /clients/{id}` documenta `400`, `401` e `404` com o exemplo "Cliente não encontrado." (AC 24)
Proof: `npx jest --config ./test/jest-e2e.json test/clients.e2e-spec.ts -t "\(C26\)"`

**C27** - O Dono também alcança um cliente sem nenhum agendamento: ele aparece na busca e o perfil responde `200` (escopo `null` do Dono, AC 3, AC 9)
Proof: `npx jest --config ./test/jest-e2e.json test/clients.e2e-spec.ts -t "\(C27\)"`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| `GET /clients` statuses (3) | `200` C1 · `400` C6 · `401` C25 | - |
| `GET /clients/{id}` statuses (4) | `200` C9 · `400` C16 · `401` C25 · `404` C17 | - |
| tamanho de `q` (4 bordas) | 1 C6 · 2 C6 · 80 C6 · 81 C6 | - |
| dígitos para buscar por telefone (2 bordas) | 3 C2 · 4 C2 | - |
| curingas do `ILIKE` (2) | `%` C7 · `_` C7 | - |
| status em `pastAppointments` (3) | `confirmed` C10 · `attended` C10 · `no_show` C10 | - |
| fronteira passado / próximo (2) | início = agora C10 · início > agora C11 | - |
| regras de `topServices` (3) | só `attended` C12 · teto 3 C12 · empate por nome C12 | - |
| quem lê (4) | Dono C9 · Dono com cliente sem agendamento C27 · Barbeiro com ficha C21 · Barbeiro sem ficha C24 | - |
| fontes do perfil que o Barbeiro filtra (3) | `pastAppointments` C21 · `upcomingAppointments` C21 · `topServices` C21 | - |
| doors do Landing (3) | door 1 C18 · door 2 C9 · door 3 C23 | - |
| entidades do Relations com constraint nova (1) | `Client` C18 | - |
| startup config: módulo de clientes registrado (1 assembly) | `AppModule`, que o e2e importa, C1 | - |

- Checks que citam status, rota ou formato de resposta: C1-C9, C13-C17, C19-C27. Cada um tem uma prova e2e que cruza a rota HTTP (ou o banco, em C18)
- C10, C11, C12 e C20 somam a prova unitária do use case, porque a ordenação, o teto e o filtro por barbeiro são decididos ali

## Swept

- validation: C6, C16
- failure modes: n/a - rotas só de leitura; uma falha do banco segue o tratamento padrão (`500`)
- idempotency: n/a - só `GET`, nada é gravado
- authorization: C20, C21, C23, C24, C25; existing - `SessionGuard` com `@Roles('owner', 'barber')` (AD-007)
- concurrency: n/a - nenhuma escrita; a marcação concorrente de faltas já é da US-11 (ATD-16)
- data lifecycle: C18 - clientes existentes recebem `false` pelo `DEFAULT`; exclusão de cliente está fora do escopo
- dependency failure: n/a - só o Postgres
- state transitions: n/a - nenhuma transição de estado nesta história
- observability: n/a - leitura sem métrica pedida por RF/RNF; nenhum log novo, e o telefone e o termo de busca não são logados (o `q` só vai na URL, que o logger já registra como nas outras rotas)

## Handoff

- Arquivos existentes tocados somam 57.727 bytes (`wc -c`: entidade, port, repositório e fake de cliente; port, implementação e fake da agenda; `BarberAccessPolicy`; `MarkAttendanceUseCase`; `schedule.presenter`; `DomainErrorFilter`; `AppModule`; `AttendanceModule`; 3 e2e de referência) ≈ 14k tokens; arquivos novos estimados em ~60 KB (controller, 2 use cases, presenter, 2 schemas, erro, módulo, migration, 4 testes) ≈ 15k tokens
- S1 ≈ 15k, S2 entra em ≈ 33k, S3 fecha em ≈ 44k, abaixo do orçamento de 150k - um builder
- Mechanism: one builder (dentro do orçamento, sem pergunta)
