# US-09: Bloqueios e folgas — Specification

**Fonte:** PRD §11 US-09 · RF-26 · RN-05, RN-26 · Seção 5
**Escopo:** Large (três rotas novas com regra de perfil, migration, integração com o motor da US-07, fluxo de confirmação de conflito)
**Decisões de discussão:** [context.md](context.md)

## Problem Statement

O motor da US-07 já respeita bloqueios e folgas (RN-05), mas não há como criá-los: o barbeiro que vai almoçar, tem um compromisso ou tira o dia de folga continua recebendo agendamentos. Esta história entrega o cadastro de bloqueios e folgas pelo painel, com a regra de perfil da seção 5, e avisa quando o bloqueio atinge agendamentos já marcados, sem cancelar nenhum.

## Goals

- [ ] Dono e Barbeiro criam bloqueios de horário e folgas de dia inteiro, e o motor deixa de oferecer esses períodos.
- [ ] Um bloqueio que atinge agendamentos confirmados só é gravado depois de o usuário ver a lista e confirmar, e nenhum agendamento é cancelado.
- [ ] Dono e Barbeiro listam e removem bloqueios; o Barbeiro só mexe nos próprios.
- [ ] Nenhuma leitura ou gravação cruza barbearias (RN-26).

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Tela de bloqueios | Só API, como nas US-01 a US-08. |
| Folga por intervalo de datas | Decidido na discussão: um dia por vez (context.md). |
| Editar bloqueio | Nenhum CA pede; remover e criar de novo cobre o caso. |
| Mostrar bloqueios na resposta da agenda (US-08) | Nenhum CA pede; a listagem desta história cobre a consulta. |
| Cancelar ou remarcar os agendamentos afetados | CA-09.3 proíbe cancelar automaticamente; cancelar e remarcar são das US-11 e US-18. |
| Bloqueio para a barbearia inteira (feriado) | Nenhum CA pede; o horário de funcionamento (US-03) já cobre o dia fechado. |
| Mudanças no motor de disponibilidade | O motor já respeita bloqueios (AVL-04, AVL-23); esta história só grava. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Conflito com agendamentos (CA-09.3) | Sem `confirmConflicts: true`: `409` com a lista e nada gravado. Com `confirmConflicts: true`: grava e devolve `201` com a lista. Nenhum agendamento muda | Decidido na discussão | y |
| Listar e remover | Incluídos, com a regra de perfil da US-08; o RF-26 do PRD é atualizado no mesmo PR | Decidido na discussão; o PRD proíbe regra fora do documento | y |
| Folga | Uma data por vez, gravada como `[00:00 da data, 00:00 do dia seguinte)` no fuso da barbearia | Decidido na discussão; mesma conversão de dia da US-08 | y |
| Barbeiro registrando a própria folga | Permitido | Seção 5: o Barbeiro pode "bloquear seus horários"; folga é um bloqueio de dia inteiro | y |
| Tipos | `kind` = `block` (bloqueio de horário) ou `day_off` (folga), gravado na tabela `barber_blocks` que a US-07 criou | O motor já lê essa tabela; o tipo só serve para exibir | y |
| Horário do bloqueio | Data local + início e fim `HH:mm` locais no mesmo dia; `end` aceita `24:00` | Converter só na borda (CLAUDE.md); `24:00` permite bloquear até o fim do dia sem virar folga | y |
| Motivo | Opcional, sem espaços nas pontas, até 120 caracteres; vazio vira `null`; vale para `block` e `day_off` | CA-09.1 pede motivo opcional; limite evita texto livre sem teto | y |
| Bloqueio no passado | Aceito | Nenhum RN proíbe; não afeta o motor, que já descarta horários passados | y |
| Bloqueios sobrepostos do mesmo barbeiro | Aceitos | Nenhum RN proíbe; o motor une os períodos | y |
| Barbeiro inativo | Aceita bloqueio | Mesma leitura da US-08: inativar não apaga registros | y |
| O que é conflito | Agendamento `confirmed` do mesmo barbeiro cujo `[início, fim)` se sobrepõe ao bloqueio; encostar não conflita | Mesma regra de sobreposição do motor (AVL-06) e do `listBusyPeriods` | y |
| Formato de cada agendamento afetado | O mesmo item da agenda da US-08 (id, barbeiro, cliente, serviços, início, fim, status, origem), ordenado por início | O usuário precisa reconhecer o agendamento; reusa o formato já documentado | y |
| Perfis | Dono: qualquer barbeiro da barbearia. Barbeiro: só o barbeiro vinculado ao usuário; outro barbeiro → `403` "Acesso negado." | Seção 5; AD-007; mesma regra da US-08 | y |
| Usuário Barbeiro sem ficha de barbeiro | Criar e remover → `403` "Acesso negado."; listar → `200` com lista vazia | Não há barbeiro próprio para bloquear; listar segue AGD-11 | y |
| Barbeiro inexistente ou de outra barbearia (Dono) | `404` "Barbeiro não encontrado." | Erro existente (RN-26) | y |
| Remover bloqueio inexistente ou de outra barbearia | `404` "Bloqueio não encontrado." | RN-26: não revelar registro de outro tenant | y |
| Listagem | `GET` com `view` (`day`/`week`) e `date`, período igual ao da US-08; entram os bloqueios que **começam** no período; ordem por início, nome do barbeiro sem diferenciar maiúsculas e id | Reusa o `SchedulePeriod` e a ordem da agenda | y |
| Entrada inválida | `400` do `ZodValidationPipe`; mensagens em BLQ-19 | Validação na borda (CLAUDE.md) | y |
| Idempotência | Reenviar o mesmo pedido cria outro bloqueio igual | Duplicata é inofensiva para o motor e pode ser removida; nenhum RF pede deduplicação | y |
| Corrida entre bloqueio e agendamento | Sem lock: um agendamento gravado entre a checagem e a gravação do bloqueio não entra na lista | O resultado é o mesmo estado que CA-09.3 permite (agendamento mantido sob bloqueio); o `EXCLUDE` do RN-07 cobre só agendamentos | y |
| Falha de dependência externa | N/A: só Postgres; falha do banco segue o tratamento padrão (500) | — | y |
| Rate limit | N/A: nenhuma rota do painel tem limite e nenhum RNF pede | — | y |
| Observabilidade | Sem métrica nova; o motivo não vai para log | Motivo é texto livre e pode ter dado pessoal (LGPD nos logs) | y |

**Open questions:** none - all resolved or logged above (required before the spec is confirmed).

---

## User Stories

### P1: Barbeiro bloqueia um horário ⭐ MVP

**User Story**: Como **Dono ou Barbeiro**, quero bloquear um período na agenda de um barbeiro, para que ninguém agende quando ele não estiver disponível.

**Why P1**: CA-09.1; RF-26; RN-05.

**Acceptance Criteria** (each line is one EARS pattern):

1. **BLQ-01 · CA-09.1** — WHEN um Barbeiro cria um bloqueio `block` na própria agenda com data, início, fim e motivo opcional THEN o sistema SHALL gravá-lo e responder `201` com id, barbeiro (id e nome), tipo, início e fim em ISO 8601 UTC e motivo.
2. **BLQ-02 · CA-09.1 · RNF-04** — The sistema SHALL converter data, início e fim locais para UTC no fuso da barbearia (ex.: `2026-10-01` `12:00`–`13:00` em `America/Sao_Paulo` → `15:00Z`–`16:00Z`).
3. **BLQ-03 · CA-09.1 · RN-05** — WHEN um bloqueio foi gravado THEN a consulta de horários do motor SHALL deixar de oferecer ao barbeiro todo início cujo atendimento se sobreponha ao bloqueio.
4. **BLQ-04 · CA-09.1 · RN-05** — WHEN um bloqueio foi gravado THEN o motor SHALL recusar um agendamento sobreposto a ele com `BarberUnavailableError` (RN-05).
5. **BLQ-05 · CA-09.1** — WHEN o Dono cria um bloqueio para qualquer barbeiro da barbearia THEN o sistema SHALL gravá-lo como em BLQ-01.
6. **BLQ-06 · Seção 5** — IF um Barbeiro cria bloqueio ou folga para outro barbeiro, ou não tem barbeiro vinculado THEN o sistema SHALL responder `403` com "Acesso negado." sem gravar.
7. **BLQ-07 · RN-26** — IF o Dono informa `barberId` que não existe na barbearia THEN o sistema SHALL responder `404` com "Barbeiro não encontrado." sem gravar.

**Independent Test**: e2e: Bruno (Barbeiro) bloqueia `2026-10-01` `12:00`–`13:00` → `201` com `15:00Z`–`16:00Z`; os horários livres do dia deixam de ter início que invada o intervalo; tentar agendar às 12:00 → erro RN-05.

---

### P1: Dono registra folga ⭐ MVP

**User Story**: Como **Dono**, quero registrar a folga de um barbeiro num dia, para que nenhum horário dele seja oferecido nesse dia.

**Why P1**: CA-09.2; RF-26.

**Acceptance Criteria**:

1. **BLQ-08 · CA-09.2** — WHEN o Dono registra uma folga `day_off` para um barbeiro numa data THEN o sistema SHALL gravar um bloqueio de `[00:00 da data, 00:00 do dia seguinte)` no fuso da barbearia e responder `201`.
2. **BLQ-09 · CA-09.2** — WHEN uma folga foi gravada THEN a consulta de horários do motor SHALL devolver lista vazia para esse barbeiro nessa data.
3. **BLQ-10 · CA-09.2** — WHEN uma folga foi gravada THEN os horários dos outros barbeiros e do mesmo barbeiro nos outros dias SHALL continuar sendo oferecidos.
4. **BLQ-11 · Seção 5** — WHEN um Barbeiro registra uma folga na própria agenda THEN o sistema SHALL gravá-la como em BLQ-08.

**Independent Test**: e2e: o Dono registra folga da Ana em `2026-10-01` → `201` com `03:00Z` de 01/10 a `03:00Z` de 02/10; horários da Ana em 01/10 → `[]`; os do Bruno em 01/10 e os da Ana em 02/10 seguem ofertados.

---

### P1: Conflito com agendamentos existentes ⭐ MVP

**User Story**: Como **Dono ou Barbeiro**, quero saber quais agendamentos um bloqueio atinge antes de salvá-lo, para decidir o que fazer com eles sem que o sistema os cancele.

**Why P1**: CA-09.3.

**Acceptance Criteria**:

1. **BLQ-12 · CA-09.3** — IF o bloqueio ou a folga se sobrepõe a agendamentos `confirmed` do barbeiro e `confirmConflicts` não é `true` THEN o sistema SHALL responder `409` com "O bloqueio conflita com agendamentos existentes." e a lista `appointments` desses agendamentos, sem gravar o bloqueio.
2. **BLQ-13 · CA-09.3** — WHEN o bloqueio conflita e `confirmConflicts` é `true` THEN o sistema SHALL gravá-lo e responder `201` com o bloqueio e a lista `affectedAppointments`.
3. **BLQ-14 · CA-09.3** — The sistema SHALL manter todo agendamento afetado com o status e o horário que tinha, com ou sem confirmação.
4. **BLQ-15 · CA-09.3** — The sistema SHALL devolver cada agendamento afetado no formato da agenda da US-08 (id, barbeiro, cliente, serviços, início, fim, status, origem), por início crescente.
5. **BLQ-16 · CA-09.3** — WHEN o bloqueio só encosta num agendamento (fim de um = início do outro) THEN o sistema SHALL tratá-lo como sem conflito.
6. **BLQ-17 · CA-09.3** — WHEN o bloqueio não conflita THEN o sistema SHALL responder `201` com `affectedAppointments` vazio.

**Independent Test**: e2e: Ana tem agendamento 10:00–10:45; bloqueio 10:30–11:30 sem confirmar → `409` com o agendamento na lista e nenhuma linha em `barber_blocks`; com `confirmConflicts: true` → `201`, `affectedAppointments` com o agendamento, que segue `confirmed` às 10:00.

---

### P1: Listar e remover bloqueios ⭐ MVP

**User Story**: Como **Dono ou Barbeiro**, quero ver os bloqueios e folgas de um período e remover os que não valem mais, para corrigir um bloqueio feito por engano.

**Why P1**: decisão da discussão (context.md); complementa o RF-26.

**Acceptance Criteria**:

1. **BLQ-18 · RF-26** — WHEN o Dono lista bloqueios com `view` (`day`/`week`), `date` e `barberId` opcional THEN o sistema SHALL devolver os bloqueios e folgas da barbearia (ou só do barbeiro) que começam no período da US-08, ordenados por início, nome do barbeiro sem diferenciar maiúsculas e id.
2. **BLQ-20 · Seção 5** — WHEN um Barbeiro lista bloqueios THEN o sistema SHALL devolver só os do barbeiro vinculado a ele; com `barberId` de outro barbeiro SHALL responder `403` com "Acesso negado."; sem barbeiro vinculado SHALL responder `200` com lista vazia.
3. **BLQ-21 · RF-26** — WHEN o Dono remove um bloqueio da barbearia THEN o sistema SHALL apagá-lo e responder `204`.
4. **BLQ-22 · RN-05** — WHEN um bloqueio foi removido THEN a consulta de horários do motor SHALL voltar a oferecer os horários que só ele impedia.
5. **BLQ-23 · Seção 5** — IF um Barbeiro remove bloqueio de outro barbeiro THEN o sistema SHALL responder `403` com "Acesso negado." sem apagar; o próprio bloqueio SHALL ser removido com `204`.
6. **BLQ-24 · RN-26** — IF o bloqueio não existe ou é de outra barbearia THEN o sistema SHALL responder `404` com "Bloqueio não encontrado." sem apagar nada.

**Independent Test**: e2e: Ana com bloqueio 12:00–13:00 e folga no dia seguinte; o Dono lista a semana → os dois, em ordem; Bruno tenta remover o bloqueio da Ana → `403`; o Dono remove → `204`, e o horário 12:00 volta a ser ofertado.

---

### P1: Validação, isolamento e documentação ⭐ MVP

**User Story**: Como **Dono**, quero que os bloqueios só aceitem dados válidos, fiquem na minha barbearia e estejam documentados.

**Why P1**: RN-26; seção 5; CLAUDE.md (Swagger).

**Acceptance Criteria**:

1. **BLQ-19** — IF a criação tem `kind` fora de `block`/`day_off`, `barberId` que não é UUID, `date` fora de `AAAA-MM-DD` ou inexistente, `start`/`end` fora de `HH:mm` em `block`, `end` não depois de `start`, ou motivo com mais de 120 caracteres THEN o sistema SHALL responder `400` sem gravar, com as mensagens: "Escolha o tipo: block ou day_off.", "Informe um id de barbeiro válido.", "Informe uma data válida no formato AAAA-MM-DD.", "Informe um horário válido no formato HH:mm.", "O fim do bloqueio deve ser depois do início.", "Informe um motivo de até 120 caracteres.".
2. **BLQ-25 · RN-26** — The sistema SHALL ler, conferir conflito, gravar e apagar bloqueios só da barbearia da sessão, e o banco SHALL recusar bloqueio cujo barbeiro é de outra barbearia.
3. **BLQ-26 · Seção 5** — IF a requisição não tem sessão válida THEN as três rotas SHALL responder `401`.
4. **BLQ-27** — The sistema SHALL gravar o tipo (`block`/`day_off`) e o motivo de cada bloqueio, e os bloqueios gravados antes desta história SHALL ficar como `block` sem motivo.
5. **BLQ-28** — The três rotas SHALL estar documentadas no Swagger com resumo citando a US-09, payloads, respostas de sucesso, erros `400`, `401`, `403`, `404` e `409` (criação) e os perfis Dono e Barbeiro.

**Independent Test**: e2e: `kind: 'holiday'` → `400` com a mensagem; `end` `12:00` e `start` `12:00` → `400`; bloqueio de outra barbearia na listagem não aparece; sem token → `401`.

---

## Edge Cases

- WHEN `end` é `24:00` THEN o bloqueio SHALL terminar às 00:00 locais do dia seguinte.
- WHEN a folga é num dia em que a barbearia está fechada THEN o sistema SHALL gravá-la normalmente (`201`).
- WHEN já existe um bloqueio igual THEN o sistema SHALL gravar o novo sem erro.
- WHEN a folga cobre um agendamento às 23:30 que termina depois da meia-noite THEN ele SHALL aparecer em `appointments` do `409`.
- IF `confirmConflicts: true` é enviado sem conflito THEN o sistema SHALL gravar e responder `201` com `affectedAppointments` vazio.
- WHEN o `day_off` traz `start` ou `end` THEN o sistema SHALL ignorá-los e gravar o dia inteiro.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| BLQ-01 | P1 Bloqueio — criar pelo Barbeiro | - | Pending |
| BLQ-02 | P1 Bloqueio — conversão de fuso | T1 | Implementing |
| BLQ-03 | P1 Bloqueio — motor não oferece | - | Pending |
| BLQ-04 | P1 Bloqueio — motor recusa (RN-05) | - | Pending |
| BLQ-05 | P1 Bloqueio — Dono para qualquer barbeiro | - | Pending |
| BLQ-06 | P1 Bloqueio — Barbeiro em outro barbeiro 403 | - | Pending |
| BLQ-07 | P1 Bloqueio — barbeiro inexistente 404 | - | Pending |
| BLQ-08 | P1 Folga — dia inteiro no fuso | T1 | Implementing |
| BLQ-09 | P1 Folga — motor sem horários no dia | - | Pending |
| BLQ-10 | P1 Folga — outros dias e barbeiros intactos | - | Pending |
| BLQ-11 | P1 Folga — Barbeiro na própria agenda | - | Pending |
| BLQ-12 | P1 Conflito — 409 com lista, sem gravar | T5 | Implementing |
| BLQ-13 | P1 Conflito — confirmação grava | - | Pending |
| BLQ-14 | P1 Conflito — agendamentos intactos | - | Pending |
| BLQ-15 | P1 Conflito — formato da lista | T5 | Implementing |
| BLQ-16 | P1 Conflito — encostar não conflita | T5 | Implementing |
| BLQ-17 | P1 Conflito — sem conflito, lista vazia | - | Pending |
| BLQ-18 | P1 Listar — Dono por período | T4 | Implementing |
| BLQ-19 | P1 Validação — 400 e mensagens | - | Pending |
| BLQ-20 | P1 Listar — Barbeiro só os próprios | - | Pending |
| BLQ-21 | P1 Remover — Dono 204 | T4 | Implementing |
| BLQ-22 | P1 Remover — motor volta a oferecer | - | Pending |
| BLQ-23 | P1 Remover — Barbeiro só os próprios | - | Pending |
| BLQ-24 | P1 Remover — inexistente 404 | T2, T4 | Implementing |
| BLQ-25 | P1 Isolamento — RN-26 | T3, T4, T5 | Implementing |
| BLQ-26 | P1 Isolamento — 401 | - | Pending |
| BLQ-27 | P1 Dados — tipo e motivo, migration | T2, T3, T4 | Implementing |
| BLQ-28 | P1 Swagger | - | Pending |

**ID format:** `BLQ-NN` (Bloqueios, épico E3). Cada teste cita o `CA-09.x` (ou o `RN`) no nome, conforme o CLAUDE.md.

**Coverage:** 28 total, 0 mapped to tasks, 28 unmapped ⚠️ (tasks ainda não criadas)

---

## Success Criteria

- [ ] Os CA-09.1, CA-09.2 e CA-09.3 têm testes automatizados que citam o CA no nome e passam.
- [ ] `npm run lint`, `npm run build`, `npm test` e `npm run test:e2e` passam.
- [ ] As três rotas aparecem em `/docs` com resumo, payloads, respostas e perfis.
- [ ] O RF-26 do PRD cita listar e remover.
