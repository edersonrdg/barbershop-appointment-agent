# US-11: Registro de atendimento, falta e bloqueio automático — Specification

**Fonte:** PRD §11 US-11 · RF-27 · RN-11, RN-12, RN-13, RN-26 · Fluxo 9.4 · Seção 5
**Escopo:** Complex (transição de estado com correção, contador derivado das marcações, bloqueio que depende da regra configurável da US-06, rotina diária sobre todas as barbearias, novos status no banco e na constraint de sobreposição)
**Decisões de discussão:** [context.md](context.md)

## Problem Statement

A agenda mostra e grava agendamentos, mas não registra o que aconteceu com eles: o painel não sabe quem compareceu nem quem faltou, e a política de faltas do PRD (bloquear o autoagendamento após o limite e perdoar após 90 dias) não tem base para funcionar. Esta história entrega a marcação de atendido ou falta, o contador de faltas do cliente, o bloqueio automático e a rotina diária de reset, que a US-17 (bot) e a US-12 (perfil do cliente) vão consumir.

## Goals

- [ ] Dono e Barbeiro marcam um agendamento que já começou como atendido ou falta, e corrigem a marcação.
- [ ] O contador de faltas do cliente reflete as marcações, e o cliente fica bloqueado para autoagendamento ao atingir o limite configurado.
- [ ] Uma rotina diária zera o contador de quem está há 90 dias ou mais sem nova falta.
- [ ] O Barbeiro só marca os próprios agendamentos; nada cruza barbearias (RN-26).

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Tela de marcação | Só API, como nas US-01 a US-10. |
| Bot recusar o autoagendamento e transferir o cliente bloqueado | US-17 (RN-01, RN-12); esta história só expõe o estado de bloqueio. |
| Desbloqueio manual pelo Dono | US-22 (RF-31, RN-14). |
| Perfil do cliente com faltas e bloqueio | US-12 (CA-12.2). |
| Voltar um agendamento marcado para `confirmed` | Decidido na discussão: só a troca entre `attended` e `no_show`. |
| Cancelamento e status `cancelled` | US-18. |
| Liberar o restante do horário de uma falta para encaixe | Sem RF/RN; o agendamento marcado continua ocupando o horário. |
| Métrica de negócio de faltas | Nenhum RF/RNF pede; relatórios de faltas são da US-26. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| A partir de quando marcar | Quando `agora ≥ startsAt` | Decidido na discussão | y |
| Correções | `attended ↔ no_show` nos dois sentidos; sem volta para `confirmed`; o mesmo status de novo não muda nada | Decidido na discussão | y |
| Bloqueio | Derivado: bloqueado enquanto o contador ≥ `noShowLimit` vigente da barbearia | Decidido na discussão; leitura literal do RN-12 | y |
| Alcance do reset | Todo cliente cuja última falta contada tem 90 dias ou mais, bloqueado ou não | Decidido na discussão; RN-13 | y |
| Nomes dos status | `attended` (atendido) e `no_show` (falta), ao lado de `confirmed` | Código em inglês; o texto em português fica na interface | y |
| Data de uma falta | O início do agendamento (`startsAt`), não o momento da marcação | Os 90 dias do RN-13 contam desde a falta; marcar com atraso não adia o perdão | y |
| Prazo do reset | 90 dias fixos (`startsAt` da última falta contada ≤ agora − 90 dias) | O RN-13 fixa 90 dias; não é "sugestão, a validar" nem regra da US-06 | y |
| Falta anterior ao último reset | Não conta: marcar ou corrigir um agendamento que começou antes do último reset do cliente não altera o contador | O reset perdoou tudo até ali; sem isso, corrigir uma falta antiga tiraria uma falta nova | y |
| Contador nunca negativo | O contador é sempre ≥ 0 | Consequência da regra anterior | y |
| Agendamento sem cliente | O status muda; nenhum contador é alterado | `appointments.client_id` aceita nulo (US-10 manteve a coluna opcional) | y |
| Ocupação do horário | `attended` e `no_show` continuam ocupando o horário do barbeiro (sobreposição, disponibilidade e constraint do banco) como `confirmed` | RN-03 vale para "qualquer agendamento"; liberar o horário de uma falta não está em RF/RN | y |
| Rota | `PATCH /appointments/{id}/status` com `{ "status": "attended" \| "no_show" }` | Mesmo recurso das US-08 e US-10 | y |
| Resposta | `200` com `appointment` (item da agenda da US-08, com o novo status) e `client` (`id`, `noShowCount`, `selfBookingBlocked`) ou `client: null` sem cliente | O painel precisa avisar que o cliente foi bloqueado (CA-11.2) antes da US-12 | y |
| Status HTTP das recusas | Agendamento inexistente na barbearia → `404`; agendamento de outro barbeiro ou Barbeiro sem ficha → `403`; antes do início → `422` | Mesmo mapeamento das US-09 e US-10 (`422` = pedido bem formado que a regra recusa) | y |
| Mensagens | Ver ATD-17 e ATD-18 | Lição L-007: mensagem exata na spec antes de implementar | y |
| Concorrência | Duas marcações simultâneas do mesmo agendamento terminam com um dos status enviados, e o contador corresponde a esse status final | Contador errado bloquearia ou liberaria o cliente indevidamente | y |
| Horário da rotina | Uma vez por dia, às 03:00 de `America/Sao_Paulo`; rodar duas vezes no mesmo dia não muda o resultado | Fora do expediente; idempotente para várias instâncias | y |
| Rotina e multi-tenant | A rotina percorre as barbearias e aplica o reset dentro de cada uma | RN-26: nenhuma gravação sem tenant; registrado como decisão no design | y |
| Falha da rotina | O erro de uma barbearia é logado e as demais continuam; a próxima execução refaz o que faltou | O reset é idempotente | y |
| Agendamento manual de cliente bloqueado | Continua permitido para Dono e Barbeiro | RN-12: "Dono pode agendar manualmente"; a US-10 já não consulta bloqueio | y |
| Observabilidade | Log por execução da rotina com o número de clientes zerados, sem telefone ou nome | CLAUDE.md (LGPD nos logs) | y |
| Rate limit | N/A: nenhuma rota do painel tem limite e nenhum RNF pede | — | y |
| Dependência externa | N/A: só Postgres; falha do banco segue o tratamento padrão (`500`) | — | y |

**Open questions:** none - all resolved or logged above (required before the spec is confirmed).

---

## User Stories

### P1: Marcar atendido ou falta ⭐ MVP

**User Story**: Como **Dono ou Barbeiro**, quero marcar se o cliente compareceu ou faltou, para registrar o que aconteceu no horário.

**Why P1**: CA-11.1; RF-27; RN-11.

**Acceptance Criteria** (each line is one EARS pattern):

1. **ATD-01 · CA-11.1 · RF-27** — WHEN o usuário marca `attended` ou `no_show` num agendamento `confirmed` cujo início já chegou (`agora ≥ startsAt`) THEN o sistema SHALL gravar o novo status e responder `200` com o agendamento no formato do item da agenda da US-08 e o resumo do cliente.
2. **ATD-02 · CA-11.1** — IF o início do agendamento ainda não chegou THEN o sistema SHALL responder `422` com "O agendamento ainda não começou." sem alterar status nem contador.
3. **ATD-03 · CA-11.1** — WHEN a agenda da US-08 lista um agendamento marcado THEN ela SHALL mostrá-lo com o status `attended` ou `no_show`.
4. **ATD-04 · RN-03** — The sistema SHALL tratar agendamentos `attended` e `no_show` como ocupando o horário do barbeiro, na disponibilidade do motor e na constraint de sobreposição do banco, como os `confirmed`.
5. **ATD-05** — WHEN o usuário marca o status que o agendamento já tem THEN o sistema SHALL responder `200` sem alterar o contador.
6. **ATD-06** — IF o agendamento não tem cliente THEN o sistema SHALL gravar o status e responder `200` com `client: null`.

**Independent Test**: e2e: agendamento de Ana às 10:00, agora 10:05 → `PATCH .../status { status: 'attended' }` → `200`, `appointment.status: 'attended'`; a agenda do dia mostra `attended`; um agendamento às 11:00 marcado às 10:05 → `422` "O agendamento ainda não começou.".

---

### P1: Contador de faltas e bloqueio automático ⭐ MVP

**User Story**: Como **Dono**, quero que as faltas sejam contadas e que o cliente seja bloqueado ao atingir o limite, para que o bot não agende de novo quem costuma faltar.

**Why P1**: CA-11.2; RN-11, RN-12.

**Acceptance Criteria**:

1. **ATD-07 · CA-11.2 · RN-11** — WHEN um agendamento com cliente passa para `no_show` THEN o sistema SHALL somar 1 ao contador de faltas do cliente.
2. **ATD-08 · CA-11.2 · RN-12** — WHILE o contador de faltas do cliente é maior ou igual ao `noShowLimit` da barbearia, o sistema SHALL informar o cliente como bloqueado para autoagendamento (`selfBookingBlocked: true`).
3. **ATD-09 · CA-11.2 · RN-12** — WHEN o cliente tem 1 falta, o limite é 2 e uma nova falta é marcada THEN a resposta SHALL trazer `client.noShowCount: 2` e `client.selfBookingBlocked: true`.
4. **ATD-10 · RN-12** — WHEN o Dono altera o `noShowLimit` (US-06) THEN o estado de bloqueio de cada cliente SHALL passar a ser avaliado com o novo limite.
5. **ATD-11 · RN-12** — WHEN o Dono ou o Barbeiro cria um agendamento manual (US-10) para um cliente bloqueado THEN o sistema SHALL gravá-lo como qualquer agendamento manual.
6. **ATD-12 · RN-26** — The contador de faltas SHALL contar só agendamentos do cliente na mesma barbearia.

**Independent Test**: unitário do use case: limite 2, cliente com 1 falta, marca `no_show` num segundo agendamento → `noShowCount: 2`, `selfBookingBlocked: true`; subir o limite para 3 → o mesmo cliente passa a `selfBookingBlocked: false`.

---

### P1: Corrigir uma marcação ⭐ MVP

**User Story**: Como **Dono ou Barbeiro**, quero corrigir uma falta marcada por engano, para não bloquear um cliente que compareceu.

**Why P1**: CA-11.4.

**Acceptance Criteria**:

1. **ATD-13 · CA-11.4** — WHEN um agendamento `no_show` passa para `attended` THEN o sistema SHALL tirar 1 do contador de faltas do cliente e reavaliar o bloqueio.
2. **ATD-14 · CA-11.4 · RN-11** — WHEN um agendamento `attended` passa para `no_show` THEN o sistema SHALL somar 1 ao contador de faltas do cliente.
3. **ATD-15 · RN-13** — IF o agendamento marcado ou corrigido começou antes do último reset do cliente THEN o sistema SHALL gravar o status sem alterar o contador.
4. **ATD-16** — WHEN duas marcações do mesmo agendamento chegam ao mesmo tempo THEN o status final SHALL ser um dos enviados e o contador do cliente SHALL corresponder a esse status final.

**Independent Test**: e2e: limite 2, cliente com 2 faltas (bloqueado); corrigir uma para `attended` → `noShowCount: 1`, `selfBookingBlocked: false`.

---

### P1: Validação e permissões ⭐ MVP

**User Story**: Como **Dono**, quero que só dados válidos sejam aceitos e que o Barbeiro só marque os próprios agendamentos.

**Why P1**: CLAUDE.md (validação na borda); seção 5; RN-26.

**Acceptance Criteria**:

1. **ATD-17** — IF o `id` da rota não é UUID ou o `status` não é `attended` nem `no_show` THEN o sistema SHALL responder `400` com "Informe um id de agendamento válido." ou "Informe o status: attended ou no_show." sem alterar nada.
2. **ATD-18 · RN-26** — IF o agendamento não existe na barbearia da sessão THEN o sistema SHALL responder `404` com "Agendamento não encontrado.".
3. **ATD-19 · Seção 5** — WHEN um Barbeiro marca um agendamento do barbeiro vinculado a ele THEN o sistema SHALL gravá-lo como em ATD-01.
4. **ATD-20 · Seção 5** — IF um Barbeiro marca um agendamento de outro barbeiro, ou não tem barbeiro vinculado THEN o sistema SHALL responder `403` com "Acesso negado." sem alterar nada.
5. **ATD-21 · Seção 5** — IF a requisição não tem sessão válida THEN a rota SHALL responder `401`.
6. **ATD-22** — The rota SHALL estar documentada no Swagger com resumo citando a US-11, payload, resposta `200` e erros `400`, `401`, `403`, `404` e `422`, e os perfis Dono e Barbeiro.

**Independent Test**: unitário do schema: cada entrada inválida gera exatamente a mensagem listada; e2e: Bruno (Barbeiro) marca um agendamento de Ana → `403`; id de outra barbearia → `404`.

---

### P1: Reset diário das faltas ⭐ MVP

**User Story**: Como **Dono**, quero que o cliente que ficou 90 dias sem faltar volte a poder agendar sozinho, sem eu precisar lembrar de desbloqueá-lo.

**Why P1**: CA-11.3; RN-13.

**Acceptance Criteria**:

1. **ATD-23 · CA-11.3 · RN-13** — WHEN a rotina de reset roda e a última falta contada do cliente começou há 90 dias ou mais THEN o sistema SHALL zerar o contador do cliente, o que remove o bloqueio.
2. **ATD-24 · RN-13** — WHEN a rotina de reset roda e a última falta contada do cliente começou há menos de 90 dias THEN o sistema SHALL manter o contador.
3. **ATD-25 · RN-13** — WHEN a rotina roda duas vezes seguidas THEN a segunda execução SHALL deixar os contadores como a primeira deixou.
4. **ATD-26 · RN-13** — The sistema SHALL agendar a rotina de reset uma vez por dia, às 03:00 de `America/Sao_Paulo`.
5. **ATD-27 · RN-26** — The rotina SHALL aplicar o reset barbearia por barbearia, e um erro numa barbearia SHALL deixar de impedir o reset das demais.

**Independent Test**: unitário do use case: agora = 2026-12-30T12:00Z; cliente A com última falta em 2026-10-01T12:00Z (90 dias) e cliente B com última falta em 2026-10-02T12:00Z → após a rotina, A tem `noShowCount: 0` e `selfBookingBlocked: false`; B mantém o contador.

---

## Edge Cases

- WHEN `agora` é exatamente `startsAt` THEN o sistema SHALL aceitar a marcação (`200`).
- WHEN a última falta contada começou exatamente 90 dias antes da execução da rotina THEN o sistema SHALL zerar o contador.
- WHEN uma falta com mais de 90 dias é marcada depois de outra falta recente THEN o reset SHALL usar a mais recente (o maior `startsAt`) como última falta.
- WHEN um agendamento marcado é corrigido depois de um reset e ele começou depois desse reset THEN o contador SHALL mudar normalmente.
- IF o limite configurado é 1 THEN a primeira falta SHALL bloquear o cliente.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| ATD-01 | P1 Marcar — grava status, 200 | T1, T4 | Implementing |
| ATD-02 | P1 Marcar — antes do início 422 | T1 | Implementing |
| ATD-03 | P1 Marcar — agenda mostra status | - | Pending |
| ATD-04 | P1 Marcar — continua ocupando o horário | T3, T4 | Implementing |
| ATD-05 | P1 Marcar — mesmo status não muda contador | T1 | Implementing |
| ATD-06 | P1 Marcar — sem cliente | - | Pending |
| ATD-07 | P1 Contador — falta soma 1 | T5 | Implementing |
| ATD-08 | P1 Contador — bloqueado se ≥ limite | T2 | Implementing |
| ATD-09 | P1 Contador — 1 falta + limite 2 bloqueia | T2 | Implementing |
| ATD-10 | P1 Contador — segue o limite vigente | T2 | Implementing |
| ATD-11 | P1 Contador — manual para bloqueado | - | Pending |
| ATD-12 | P1 Contador — só a barbearia | T5 | Implementing |
| ATD-13 | P1 Correção — falta → atendido tira 1 | T1, T5 | Implementing |
| ATD-14 | P1 Correção — atendido → falta soma 1 | T1, T5 | Implementing |
| ATD-15 | P1 Correção — antes do reset não conta | T3, T5 | Implementing |
| ATD-16 | P1 Correção — concorrência | - | Pending |
| ATD-17 | P1 Validação — 400 e mensagens | - | Pending |
| ATD-18 | P1 Validação — 404 | T4 | Implementing |
| ATD-19 | P1 Perfil — Barbeiro nos próprios | - | Pending |
| ATD-20 | P1 Perfil — Barbeiro em outro 403 | - | Pending |
| ATD-21 | P1 Perfil — 401 | - | Pending |
| ATD-22 | P1 Swagger | - | Pending |
| ATD-23 | P1 Reset — 90 dias zera | T2, T5 | Implementing |
| ATD-24 | P1 Reset — menos de 90 dias mantém | T2, T5 | Implementing |
| ATD-25 | P1 Reset — idempotente | T5 | Implementing |
| ATD-26 | P1 Reset — diária às 03:00 | - | Pending |
| ATD-27 | P1 Reset — por barbearia, isola falhas | T6 | Implementing |

**ID format:** `ATD-NN` (Atendimento, épico E3). Cada teste cita o `CA-11.x` (ou o `RN`) no nome, conforme o CLAUDE.md.

**Coverage:** 27 total, 0 mapped to tasks, 27 unmapped ⚠️

---

## Success Criteria

- [ ] Os CA-11.1 a CA-11.4 têm testes automatizados que citam o CA no nome e passam.
- [ ] `npm run lint`, `npm run build`, `npm test` e `npm run test:e2e` passam.
- [ ] A rota aparece em `/docs` com resumo, payload, respostas e perfis.
