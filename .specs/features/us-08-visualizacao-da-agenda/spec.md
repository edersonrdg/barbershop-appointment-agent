# US-08: Visualização da agenda — Specification

**Fonte:** PRD §11 US-08 · RF-24, RF-28 · Seção 5 · RN-26
**Escopo:** Large (rota nova com regra de perfil, leitura por período no fuso da barbearia, estrutura mínima de cliente com migration)
**Decisões de discussão:** [context.md](context.md)

## Problem Statement

O motor da US-07 grava agendamentos, mas ninguém consegue vê-los: o Dono não sabe quem vem hoje nem como está a semana, e o Barbeiro depende do Dono para saber a própria agenda. Esta história entrega a leitura da agenda por dia e por semana, com a regra de perfil da seção 5 aplicada no backend, e prepara o cliente no agendamento para que a agenda mostre quem será atendido.

## Goals

- [ ] O Dono lê a agenda de todos os barbeiros, ou de um só, por dia ou semana.
- [ ] O Barbeiro lê só os próprios agendamentos, e o backend recusa o pedido da agenda de outro barbeiro.
- [ ] Cada agendamento traz cliente (nome e telefone), serviços, início e fim, status e origem.
- [ ] Nenhuma leitura cruza barbearias (RN-26).

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Tela da agenda em 360 px (CA-08.4) | Decidido na discussão: só API, como nas US-01 a US-06. O CA-08.4 fica como pendência registrada até a história de front-end. |
| Criar cliente e gravar o cliente no agendamento | US-10 (CA-10.2) pelo painel e US-14 (RF-29) pelo WhatsApp. Esta história cria só a tabela e a coluna nula. |
| Criar agendamento pelo painel | US-10. |
| Exibir bloqueios e folgas na agenda | Nenhum CA da US-08 pede; o cadastro de bloqueios é da US-09. |
| Horários livres na agenda | A consulta de horários livres é do motor (US-07) e é exposta pela US-10. |
| Marcar atendido ou falta, cancelar | US-11 e US-18. |
| Paginação | Uma semana de uma barbearia de até 10 cadeiras cabe numa resposta; nenhum requisito pede. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Cliente no agendamento | Tabela `clients` (nome, telefone E.164 único por barbearia) e `appointments.client_id` nulo; sem use case de criação nesta história | Decidido na discussão; CLAUDE.md permite o mínimo estrutural; revoga a decisão "cliente fica para a US-10" da US-07 | y |
| Dados do cliente exibidos | Id, nome e telefone | Decidido na discussão | y |
| Agendamento sem cliente | Sai com `client: null` | Agendamentos gravados pelo motor da US-07 não têm cliente | y |
| Tela | Só API; CA-08.4 pendente | Decidido na discussão | y |
| Semana | Segunda a domingo, no fuso da barbearia, que contém a data pedida | Decidido na discussão | y |
| Período do dia | `[00:00 da data, 00:00 do dia seguinte)` no fuso da barbearia, convertido para UTC | CLAUDE.md (datas em UTC, fuso só nas bordas); RNF-04 | y |
| Qual agendamento entra no período | O que **começa** dentro do período; um agendamento que atravessa a meia-noite aparece só no dia em que começa | Cada agendamento aparece uma vez por visão; horário de funcionamento torna o caso raro | y |
| Status exibidos | Todos os status do período (hoje só `confirmed`) | CA-08.3 pede exibir o status; ocultar cancelados seria regra nova sem RF | y |
| Barbeiro pedindo outro barbeiro | `403` com "Acesso negado." | Seção 5: Barbeiro não pode ver agenda de outros; mesma mensagem do AD-007 | y |
| Usuário Barbeiro sem ficha de barbeiro | `200` com lista vazia | CA-05.2: sem barbeiro vinculado, o usuário não tem agenda própria; não é erro | y |
| Dono filtrando barbeiro inexistente ou de outra barbearia | `404` com "Barbeiro não encontrado." (`BarberNotFoundError`, RN-26) | Erro já existente e mapeado | y |
| Barbeiros inativos | Os agendamentos deles aparecem, e o filtro aceita barbeiro inativo | A agenda mostra o que está gravado; inativar não apaga agendamentos | y |
| Ordem | Início crescente; empate por nome do barbeiro (sem diferenciar maiúsculas) e depois id do agendamento | Resultado determinístico e testável; mesma ordem de nome da US-07 | y |
| Serviços | Id e nome, na ordem gravada no agendamento | CA-08.3 pede os serviços; a ordem da US-07 é a do pedido | y |
| Instantes na resposta | Início e fim em ISO 8601 UTC, com o fuso da barbearia e as datas locais do período na resposta | O cliente converte na borda; CA-03.3 já expõe o fuso | y |
| Entrada inválida | `400` do `ZodValidationPipe` para visão fora de `day`/`week`, data fora de `AAAA-MM-DD` ou inexistente, `barberId` que não é UUID | Validação na borda (CLAUDE.md) | y |
| Mensagens de validação | `view`: "Escolha a visão: day ou week."; `date`: "Informe uma data válida no formato AAAA-MM-DD."; `barberId`: "Informe um id de barbeiro válido." (mesma da US-05) | Registrado na T5: a spec só fixava o `400` | y |
| Desempate por id (AGD-06) | Fica no `ORDER BY` como garantia de ordem estável, sem teste | Hoje não há como dois agendamentos empatarem em início e nome: a constraint de exclusão barra o mesmo barbeiro, e o nome do barbeiro é único na barbearia (US-05) | y |
| Idempotência, concorrência, ciclo de vida | N/A: leitura sem efeito colateral | — | y |
| Falha de dependência externa | N/A: só Postgres; falha do banco segue o tratamento padrão (500) | — | y |
| Rate limit | N/A: nenhuma rota do painel tem limite hoje e nenhum RNF pede | — | y |
| Observabilidade | Sem métrica nova; sem telefone ou nome de cliente em log | CLAUDE.md (LGPD nos logs); nenhum RF pede métrica de leitura | y |

**Open questions:** none - all resolved or logged above (required before the spec is confirmed).

---

## User Stories

### P1: Dono vê a agenda da barbearia ⭐ MVP

**User Story**: Como **Dono**, quero ver a agenda de todos os barbeiros por dia ou semana, e filtrar por barbeiro, para saber quem vem e quando.

**Why P1**: CA-08.1; RF-24.

**Acceptance Criteria** (each line is one EARS pattern):

1. **AGD-01 · CA-08.1** — WHEN o Dono pede a agenda com visão `day` e uma data THEN o sistema SHALL devolver os agendamentos de todos os barbeiros da barbearia que começam em `[00:00 da data, 00:00 do dia seguinte)` no fuso da barbearia.
2. **AGD-02 · CA-08.1** — WHEN o Dono pede a agenda com visão `week` e uma data THEN o sistema SHALL devolver os agendamentos de todos os barbeiros que começam entre 00:00 da segunda-feira da semana da data e 00:00 da segunda-feira seguinte, no fuso da barbearia.
3. **AGD-03 · CA-08.1** — WHEN o Dono informa `barberId` de um barbeiro da barbearia THEN o sistema SHALL devolver só os agendamentos desse barbeiro no período.
4. **AGD-04 · CA-08.1** — IF o Dono informa `barberId` que não existe na barbearia THEN o sistema SHALL responder `404` com "Barbeiro não encontrado.".
5. **AGD-05 · CA-08.1** — The sistema SHALL devolver na resposta a visão, a data inicial e a data final (inclusiva) do período em `AAAA-MM-DD` local e o fuso da barbearia.
6. **AGD-06 · CA-08.1** — The sistema SHALL ordenar os agendamentos por início crescente, depois por nome do barbeiro sem diferenciar maiúsculas, depois por id.
7. **AGD-07 · CA-08.1** — WHEN nenhum agendamento começa no período THEN o sistema SHALL responder `200` com lista vazia.

**Independent Test**: e2e: barbearia em `America/Sao_Paulo`, Ana e Bruno com agendamentos na segunda 28/09 às 10:00 (Ana), na quarta 30/09 às 09:00 (Bruno) e na segunda seguinte 05/10 (Ana); o Dono pede `week` com data 30/09 → recebe os dois primeiros, período `2026-09-28` a `2026-10-04`; pede `day` 28/09 → só o da Ana; pede `week` com `barberId` do Bruno → só o de quarta.

---

### P1: Barbeiro vê só a própria agenda ⭐ MVP

**User Story**: Como **Barbeiro**, quero ver só os meus agendamentos, para saber quem vou atender sem ver a agenda dos colegas.

**Why P1**: CA-08.2; seção 5.

**Acceptance Criteria**:

1. **AGD-08 · CA-08.2** — WHEN um Barbeiro pede a agenda sem `barberId` THEN o sistema SHALL devolver só os agendamentos do barbeiro vinculado ao usuário dele.
2. **AGD-09 · CA-08.2** — WHEN um Barbeiro informa o `barberId` do próprio barbeiro THEN o sistema SHALL devolver os mesmos agendamentos de AGD-08.
3. **AGD-10 · CA-08.2** — IF um Barbeiro informa `barberId` de outro barbeiro THEN o sistema SHALL responder `403` com "Acesso negado." sem devolver agendamento.
4. **AGD-11 · CA-08.2** — WHEN um usuário Barbeiro sem barbeiro vinculado pede a agenda THEN o sistema SHALL responder `200` com lista vazia.

**Independent Test**: e2e: Bruno (usuário Barbeiro vinculado) pede a agenda do dia em que Ana e ele têm agendamentos → recebe só o dele; com `barberId` da Ana → `403 { message: 'Acesso negado.' }`.

---

### P1: Detalhe de cada agendamento ⭐ MVP

**User Story**: Como **Dono ou Barbeiro**, quero ver cliente, serviços, horário, status e origem de cada agendamento, para me preparar para o atendimento.

**Why P1**: CA-08.3; RF-28.

**Acceptance Criteria**:

1. **AGD-12 · CA-08.3** — The sistema SHALL devolver em cada agendamento o id, o barbeiro (id e nome), o início e o fim em ISO 8601 UTC, o status e a origem (`bot` ou `manual`).
2. **AGD-13 · CA-08.3** — The sistema SHALL devolver em cada agendamento os serviços (id e nome) na ordem gravada no agendamento.
3. **AGD-14 · CA-08.3** — WHEN o agendamento tem cliente THEN o sistema SHALL devolver o cliente com id, nome e telefone em E.164.
4. **AGD-15 · CA-08.3** — WHEN o agendamento não tem cliente THEN o sistema SHALL devolver `client: null`.
5. **AGD-16 · CA-08.3 · RF-28** — The sistema SHALL devolver a origem gravada, distinguindo agendamentos `bot` de `manual`.

**Independent Test**: e2e: agendamento manual com cliente "João" `+5511987654321`, serviços Corte e Barba nessa ordem, e agendamento de origem bot sem cliente → o primeiro sai com cliente, os dois serviços em ordem e `origin: 'manual'`; o segundo sai com `client: null` e `origin: 'bot'`.

---

### P1: Estrutura mínima de cliente ⭐ MVP

**User Story**: Como **sistema**, preciso guardar o cliente do agendamento, para que a agenda mostre quem será atendido e a US-10 só passe a preenchê-lo.

**Why P1**: pré-requisito estrutural do CA-08.3; RN-08, RN-26.

**Acceptance Criteria**:

1. **AGD-17 · CA-08.3 · RN-08** — The banco SHALL recusar dois clientes com o mesmo telefone na mesma barbearia e aceitar o mesmo telefone em barbearias diferentes.
2. **AGD-18 · CA-08.3 · RN-26** — The banco SHALL recusar um agendamento cujo cliente pertence a outra barbearia.
3. **AGD-19 · CA-08.3** — The banco SHALL aceitar agendamento sem cliente.
4. **AGD-20 · CA-08.3** — WHEN o motor da US-07 grava um agendamento THEN o agendamento SHALL continuar sendo gravado, sem cliente.

**Independent Test**: e2e do gateway: inserir cliente com telefone repetido na mesma barbearia falha; agendamento apontando para cliente de outra barbearia falha; `book-appointment` segue gravando.

---

### P1: Isolamento e acesso ⭐ MVP

**User Story**: Como **Dono**, quero ter certeza de que a agenda só mostra dados da minha barbearia e só para quem está logado.

**Why P1**: RN-26; seção 5; AD-003, AD-007.

**Acceptance Criteria**:

1. **AGD-21 · RN-26** — The sistema SHALL devolver só agendamentos, barbeiros, serviços e clientes da barbearia da sessão.
2. **AGD-22 · RN-26** — IF o Dono informa `barberId` de um barbeiro de outra barbearia THEN o sistema SHALL responder `404` com "Barbeiro não encontrado.".
3. **AGD-23 · Seção 5** — IF a requisição não tem sessão válida THEN o sistema SHALL responder `401`.
4. **AGD-24** — IF a visão não é `day` nem `week`, a data não está em `AAAA-MM-DD` ou não existe no calendário, ou o `barberId` não é UUID THEN o sistema SHALL responder `400` sem consultar a agenda.
5. **AGD-25** — The rota SHALL estar documentada no Swagger com resumo citando a US-08, a query, a resposta `200`, os erros `400`, `401`, `403` e `404` e os perfis Dono e Barbeiro.

**Independent Test**: e2e: duas barbearias com agendamentos no mesmo dia; o Dono da primeira só recebe os seus; sem token → `401`; `view=month` → `400`.

---

## Edge Cases

- WHEN a data pedida é um domingo THEN a visão `week` SHALL cobrir a segunda anterior até esse domingo.
- WHEN um agendamento começa às 23:30 locais e termina depois da meia-noite THEN ele SHALL aparecer só no dia em que começa.
- WHEN um agendamento começa exatamente às 00:00 locais do dia seguinte ao período THEN ele SHALL ficar de fora.
- WHEN um agendamento começa às 00:30 locais (03:30 UTC) THEN a visão `day` SHALL incluí-lo no dia local, não no dia UTC anterior.
- WHEN o barbeiro do agendamento está inativo THEN o agendamento SHALL aparecer normalmente.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| AGD-01 | P1 Dono — visão dia | T1 | Implementing |
| AGD-02 | P1 Dono — visão semana segunda a domingo | T1 | Implementing |
| AGD-03 | P1 Dono — filtro por barbeiro | T2 | Implementing |
| AGD-04 | P1 Dono — barbeiro inexistente | T2 | Implementing |
| AGD-05 | P1 Dono — período e fuso na resposta | T1 | Implementing |
| AGD-06 | P1 Dono — ordem | T4 | Implementing |
| AGD-07 | P1 Dono — período vazio | Design | Pending |
| AGD-08 | P1 Barbeiro — só os próprios | T2 | Implementing |
| AGD-09 | P1 Barbeiro — filtro do próprio | T2 | Implementing |
| AGD-10 | P1 Barbeiro — outro barbeiro 403 | T2 | Implementing |
| AGD-11 | P1 Barbeiro — sem ficha, lista vazia | T2 | Implementing |
| AGD-12 | P1 Detalhe — barbeiro, horário, status, origem | T4 | Implementing |
| AGD-13 | P1 Detalhe — serviços em ordem | T4 | Implementing |
| AGD-14 | P1 Detalhe — cliente | T4 | Implementing |
| AGD-15 | P1 Detalhe — sem cliente | T4 | Implementing |
| AGD-16 | P1 Detalhe — RF-28 origem | T4 | Implementing |
| AGD-17 | P1 Cliente — telefone único por barbearia | T3 | Implementing |
| AGD-18 | P1 Cliente — FK composta por barbearia | T3 | Implementing |
| AGD-19 | P1 Cliente — cliente opcional | T3 | Implementing |
| AGD-20 | P1 Cliente — motor segue gravando | T3 | Implementing |
| AGD-21 | P1 Isolamento — RN-26 leitura | T2 | Implementing |
| AGD-22 | P1 Isolamento — barbeiro de outra barbearia | T2 | Implementing |
| AGD-23 | P1 Isolamento — 401 | Design | Pending |
| AGD-24 | P1 Isolamento — 400 | T5 | Implementing |
| AGD-25 | P1 Isolamento — Swagger | Design | Pending |

**ID format:** `AGD-NN` (Agenda, épico E3). Cada teste cita o `CA-08.x` (ou o `RN`) no nome, conforme o CLAUDE.md.

**Coverage:** 25 total, 0 mapped to tasks, 25 unmapped ⚠️ (tasks ainda não criadas)

**CA-08.4:** fora do escopo (pendência registrada; ver Out of Scope).

---

## Success Criteria

- [ ] Os CA-08.1, CA-08.2 e CA-08.3 têm testes automatizados que citam o CA no nome e passam.
- [ ] `npm run lint`, `npm run build`, `npm test` e `npm run test:e2e` passam.
- [ ] A rota aparece em `/docs` com resumo, query, respostas e perfis.
