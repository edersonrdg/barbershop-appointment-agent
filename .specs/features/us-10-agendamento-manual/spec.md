# US-10: Agendamento manual pelo painel — Specification

**Fonte:** PRD §11 US-10 · RF-25, RF-28 · RN-03, RN-05, RN-07, RN-08, RN-26 · Seção 5
**Escopo:** Large (duas rotas novas com regra de perfil, criação de cliente atômica com o agendamento, integração com o motor da US-07, mapeamento HTTP das recusas do motor)
**Decisões de discussão:** [context.md](context.md)

## Problem Statement

O motor da US-07 valida e grava agendamentos, e a agenda da US-08 os mostra, mas o painel ainda não cria nenhum: o cliente que liga ou chega na hora fica fora do sistema, e o horário dele pode ser vendido de novo pelo bot. Esta história entrega o agendamento manual pelo painel, com as mesmas validações do bot exceto a antecedência mínima, o cadastro do cliente pelo telefone e a consulta de horários livres para o usuário escolher um horário válido.

## Goals

- [ ] Dono e Barbeiro gravam agendamentos com origem `manual` pelo motor da US-07, e toda recusa diz qual regra foi violada.
- [ ] O cliente é identificado pelo telefone e criado na hora quando ainda não existe, sem duplicar cadastro.
- [ ] Dono e Barbeiro consultam os horários livres de um dia para os serviços escolhidos.
- [ ] O Barbeiro só agenda e consulta a própria agenda; nada cruza barbearias (RN-26).

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Tela de agendamento | Só API, como nas US-01 a US-09. |
| Forçar horário fora do expediente, da jornada ou sobre bloqueio (exceção do RN-05) | Decidido na discussão: nenhum CA da US-10 pede; vira questão em aberto no PRD (seção 19). |
| Editar, remarcar ou cancelar agendamento | US-11 (status) e US-18 (remarcar e cancelar). |
| Buscar e escolher cliente já cadastrado por id | US-12 (CA-12.1); nesta história o telefone identifica o cliente. |
| Alterar o nome de um cliente existente | Decidido na discussão: o nome gravado é mantido. |
| Bloqueio de cliente por faltas (RN-12) | O contador de faltas nasce na US-11; hoje nenhum cliente está bloqueado. |
| Mudanças nas regras do motor | O motor já dispensa a antecedência mínima para `manual` (CA-07.3) e barra sobreposição no banco (CA-07.4). |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Telefone já cadastrado com outro nome | O agendamento vai para o cliente existente e o nome gravado não muda | Decidido na discussão (RN-08) | y |
| Forçar horário (exceção do RN-05) | Fora da história; toda violação é recusada, inclusive para o Dono; registrado na seção 19 do PRD | Decidido na discussão | y |
| Consulta de horários livres | Incluída, com origem `manual` e a regra de perfil da US-08 | Decidido na discussão; a US-08 deixou para a US-10 | y |
| Cliente no payload | Sempre `client: { name, phone }`; não há `clientId` | Não há busca de clientes até a US-12; o telefone já identifica o cliente | y |
| Nome do cliente | Sem espaços nas pontas, de 2 a 80 caracteres | A coluna `clients.name` tem 80 caracteres (US-08) | y |
| Telefone do cliente | Telefone brasileiro com DDD, validado e normalizado pelo `PhoneNumber` e gravado em E.164 | Mesma regra do cadastro do Dono (US-01) e da tabela `clients` (US-08) | y |
| Horário no payload | `startsAt` em ISO 8601 com fuso explícito (`Z` ou `±HH:mm`), em minuto cheio | É o formato que a consulta de horários devolve; o instante vai direto ao motor | y |
| Serviços no payload | `serviceIds` com 1 a 10 UUIDs, sem repetir, na ordem escolhida | O motor recusa lista vazia e repetida com `InvalidValueError`, que o filtro responde como `500`; a borda precisa barrar antes (400). O teto 10 fica acima do maior pedido possível (serviço + 5 adicionais) | y |
| Mensagens de validação (`400`) | Ver AGM-16 | Lição L-007: mensagem exata na spec antes de implementar | y |
| Status das recusas do motor | Sobreposição (RN-03/RN-07) → `409`; fora do funcionamento, fora da jornada, bloqueio (RN-05) e horário passado → `422`; barbeiro que não faz o serviço → `400`; barbeiro inexistente ou inativo e serviço inexistente ou inativo → `404` | `409` é conflito com outro registro; `422` é pedido bem formado que a regra recusa; hoje essas recusas caem no `500` do filtro | y |
| Mensagem de cada recusa | A mensagem atual de cada erro do motor, sem alteração | CA-10.4 pede o motivo; os erros já carregam o texto e o RN | y |
| Atomicidade | Cliente novo e agendamento são gravados juntos; se o agendamento é recusado (inclusive pelo banco, RN-07), o cliente novo não fica gravado | Um agendamento recusado não pode deixar cadastro órfão | y |
| Dois agendamentos simultâneos com o mesmo telefone novo | Os dois apontam para um único cliente; nenhum responde `500` | RN-08: telefone é chave única; a corrida não pode virar erro para o usuário | y |
| Resposta da criação | `201` com o agendamento no formato do item da agenda da US-08 (id, barbeiro, cliente, serviços, início, fim, status, origem) | Formato já documentado e reusado pela US-09 | y |
| Barbeiro no payload | `barberId` obrigatório para os dois perfis | CA-10.5 fala em "escolher"; o Barbeiro informa o próprio id | y |
| Usuário Barbeiro sem ficha de barbeiro | Criar e consultar → `403` "Acesso negado." | Não há barbeiro próprio; mesma regra da criação de bloqueio (US-09) | y |
| Consulta: parâmetros | `date` (`AAAA-MM-DD`, data local da barbearia), `serviceIds` (UUIDs separados por vírgula, mesmas regras do payload) e `barberId` opcional | Mesma data da US-08; lista na query sem depender de parâmetro repetido | y |
| Consulta sem `barberId` | Dono: qualquer barbeiro ativo que faça todos os serviços, cada início uma vez, com o primeiro barbeiro livre por nome (AVL-11). Barbeiro: a própria agenda | Comportamento do motor (CA-07.2); seção 5 para o Barbeiro | y |
| Resposta da consulta | `200` com `date`, `timezone` e `slots` (`barber` com id e nome, `startsAt` e `endsAt` em ISO 8601 UTC), por início crescente | Mesmo padrão de data e fuso da agenda (US-08) | y |
| Consulta de data passada ou dia fechado | `200` com `slots` vazio | O motor só oferece horários a partir de agora e dentro do funcionamento | y |
| Idempotência | Reenviar o mesmo pedido responde `409` (o horário já está ocupado pelo primeiro) | A sobreposição (RN-03) já barra a duplicata | y |
| Rate limit | N/A: nenhuma rota do painel tem limite e nenhum RNF pede | — | y |
| Falha de dependência externa | N/A: só Postgres; falha do banco segue o tratamento padrão (`500`) | — | y |
| Observabilidade | Sem métrica nova: o motor já conta agendamentos e conflitos com o label `origin` (`manual`); nome e telefone do cliente não vão para log | CLAUDE.md (LGPD nos logs); métrica da US-07 | y |

**Open questions:** none - all resolved or logged above (required before the spec is confirmed).

---

## User Stories

### P1: Criar agendamento manual ⭐ MVP

**User Story**: Como **Dono ou Barbeiro**, quero registrar o agendamento de um cliente que ligou ou chegou na hora, para manter toda a agenda num só lugar.

**Why P1**: CA-10.1, CA-10.3; RF-25, RF-28.

**Acceptance Criteria** (each line is one EARS pattern):

1. **AGM-01 · CA-10.1 · RF-28** — WHEN o usuário cria um agendamento com cliente, serviços, barbeiro e horário livre THEN o sistema SHALL gravá-lo com status `confirmed` e origem `manual` e responder `201` com o agendamento no formato do item da agenda da US-08.
2. **AGM-02 · CA-10.1 · RN-04** — The sistema SHALL gravar o fim do agendamento como início + soma das durações dos serviços, e os serviços na ordem enviada.
3. **AGM-03 · CA-10.1** — WHEN um agendamento manual foi gravado THEN a agenda da US-08 SHALL mostrá-lo com o cliente e origem `manual`.
4. **AGM-04 · CA-10.3 · RN-02** — WHEN o horário está a menos que a antecedência mínima a partir de agora THEN o sistema SHALL gravar o agendamento manual (`201`).

**Independent Test**: e2e: antecedência mínima de 60 min; o Dono agenda "João" `(11) 98765-4321` com Ana, Corte + Barba, daqui a 30 min → `201`, `origin: 'manual'`, fim = início + 45 min; a agenda do dia mostra o agendamento com o cliente.

---

### P1: Cliente identificado pelo telefone ⭐ MVP

**User Story**: Como **Dono ou Barbeiro**, quero informar só nome e telefone do cliente, para que o cadastro seja criado na hora sem duplicar quem já existe.

**Why P1**: CA-10.2; RN-08.

**Acceptance Criteria**:

1. **AGM-05 · CA-10.2 · RN-08** — WHEN o telefone informado não pertence a nenhum cliente da barbearia THEN o sistema SHALL criar o cliente com o nome sem espaços nas pontas e o telefone em E.164, e ligá-lo ao agendamento.
2. **AGM-06 · CA-10.2 · RN-08** — WHEN o telefone informado, depois de normalizado, já pertence a um cliente da barbearia THEN o sistema SHALL ligar o agendamento a esse cliente, sem criar outro e sem alterar o nome gravado.
3. **AGM-07 · CA-10.2 · RN-26** — WHEN o telefone pertence a um cliente de outra barbearia THEN o sistema SHALL criar um cliente novo na barbearia da sessão.
4. **AGM-08 · CA-10.2** — IF o agendamento é recusado por qualquer motivo THEN o sistema SHALL deixar de gravar o cliente novo daquele pedido.
5. **AGM-09 · CA-10.2 · RN-08** — WHEN dois agendamentos em horários livres com o mesmo telefone novo são criados ao mesmo tempo THEN o sistema SHALL gravar os dois ligados a um único cliente, sem responder `500`.

**Independent Test**: e2e: agendar com `11987654321` e nome "João" cria o cliente `+5511987654321`; agendar de novo com `+55 (11) 98765-4321` e nome "Joao Silva" → mesmo `client.id`, nome "João"; pedido recusado por conflito com telefone novo → nenhuma linha nova em `clients`.

---

### P1: Recusa explicada ⭐ MVP

**User Story**: Como **Dono ou Barbeiro**, quero saber por que um horário foi recusado, para escolher outro.

**Why P1**: CA-10.4; RN-03, RN-05, RN-07.

**Acceptance Criteria**:

1. **AGM-10 · CA-10.4 · RN-03** — IF o horário se sobrepõe a um agendamento `confirmed` do barbeiro THEN o sistema SHALL responder `409` com "O barbeiro já tem um agendamento nesse horário." sem gravar.
2. **AGM-11 · CA-10.4 · RN-07** — IF dois agendamentos manuais sobrepostos do mesmo barbeiro são enviados ao mesmo tempo THEN o sistema SHALL gravar só um e responder `409` com "O barbeiro já tem um agendamento nesse horário." ao outro.
3. **AGM-12 · CA-10.4 · RN-05** — IF o horário está fora do funcionamento da barbearia, fora da jornada do barbeiro ou sobre um bloqueio ou folga THEN o sistema SHALL responder `422` com, respectivamente, "O horário está fora do funcionamento da barbearia.", "O horário está fora da jornada do barbeiro." ou "O barbeiro está indisponível nesse horário." sem gravar.
4. **AGM-13 · CA-10.4** — IF o horário já passou THEN o sistema SHALL responder `422` com "O horário já passou." sem gravar.
5. **AGM-14 · CA-10.4 · RN-04** — IF o barbeiro não realiza todos os serviços escolhidos THEN o sistema SHALL responder `400` com "O barbeiro não realiza todos os serviços escolhidos." sem gravar.
6. **AGM-15 · RN-26** — IF o barbeiro não existe na barbearia ou está inativo, ou algum serviço não existe na barbearia ou está inativo THEN o sistema SHALL responder `404` com "Barbeiro não encontrado." ou "Serviço não encontrado." sem gravar.

**Independent Test**: e2e: Ana com agendamento 10:00–10:45; agendar 10:30 → `409` com a mensagem; agendar às 07:00 com a barbearia abrindo às 09:00 → `422` "O horário está fora do funcionamento da barbearia."; agendar sobre bloqueio → `422` "O barbeiro está indisponível nesse horário.".

---

### P1: Validação da entrada ⭐ MVP

**User Story**: Como **Dono**, quero que o agendamento só aceite dados válidos, para não gravar cliente ou horário errado.

**Why P1**: CLAUDE.md (validação na borda); RN-08.

**Acceptance Criteria**:

1. **AGM-16** — IF a criação tem `barberId` que não é UUID, `serviceIds` vazio, com mais de 10 itens, com item que não é UUID ou repetido, `startsAt` fora de ISO 8601 com fuso ou fora de minuto cheio, nome do cliente com menos de 2 ou mais de 80 caracteres depois de tirar os espaços das pontas, ou telefone que não é brasileiro com DDD THEN o sistema SHALL responder `400` sem gravar, com as mensagens: "Informe um id de barbeiro válido.", "Escolha de 1 a 10 serviços.", "Informe um id de serviço válido.", "Escolha cada serviço uma única vez.", "Informe o início em ISO 8601 com fuso, em minuto cheio.", "Informe o nome do cliente, com 2 a 80 caracteres.", "Informe um telefone brasileiro válido, com DDD.".

**Independent Test**: unitário do schema: cada campo inválido gera exatamente a mensagem listada; e2e: `startsAt: '2026-10-01T10:00:00'` (sem fuso) → `400` e nenhuma linha em `appointments` ou `clients`.

---

### P1: Barbeiro só na própria agenda ⭐ MVP

**User Story**: Como **Dono**, quero que o Barbeiro só agende para si mesmo, para que ele não mexa na agenda dos colegas.

**Why P1**: CA-10.5; seção 5.

**Acceptance Criteria**:

1. **AGM-17 · CA-10.5** — WHEN um Barbeiro cria um agendamento com o `barberId` do barbeiro vinculado a ele THEN o sistema SHALL gravá-lo como em AGM-01.
2. **AGM-18 · CA-10.5** — IF um Barbeiro cria um agendamento com o `barberId` de outro barbeiro, ou não tem barbeiro vinculado THEN o sistema SHALL responder `403` com "Acesso negado." sem gravar agendamento nem cliente.
3. **AGM-19 · CA-10.1** — WHEN o Dono cria um agendamento para qualquer barbeiro ativo da barbearia THEN o sistema SHALL gravá-lo como em AGM-01.

**Independent Test**: e2e: Bruno (Barbeiro) agenda para Bruno → `201`; Bruno agenda para Ana → `403` e nenhuma linha nova em `appointments` ou `clients`.

---

### P1: Consultar horários livres ⭐ MVP

**User Story**: Como **Dono ou Barbeiro**, quero ver os horários livres de um dia para os serviços do cliente, para escolher um horário válido antes de gravar.

**Why P1**: CA-10.1 ("horário válido"); decisão da discussão (context.md); RF-25.

**Acceptance Criteria**:

1. **AGM-20 · CA-10.1** — WHEN o Dono consulta com `date`, `serviceIds` e `barberId` THEN o sistema SHALL responder `200` com `date`, `timezone` e os inícios livres do motor para esse barbeiro, cada um com `barber` (id e nome), `startsAt` e `endsAt` em ISO 8601 UTC, por início crescente.
2. **AGM-21 · CA-10.1 · RN-06** — WHEN o Dono consulta sem `barberId` THEN o sistema SHALL devolver cada início livre uma vez, com o primeiro barbeiro livre por nome entre os ativos que fazem todos os serviços.
3. **AGM-22 · CA-10.3 · RN-02** — The consulta SHALL oferecer os inícios a partir de agora, sem aplicar a antecedência mínima.
4. **AGM-23 · CA-10.5** — WHEN um Barbeiro consulta sem `barberId` ou com o próprio THEN o sistema SHALL devolver só os horários do barbeiro vinculado a ele; com `barberId` de outro barbeiro, ou sem barbeiro vinculado, SHALL responder `403` com "Acesso negado.".
5. **AGM-24 · CA-10.1** — WHEN um início é devolvido pela consulta THEN criar um agendamento manual com esse `startsAt`, o mesmo barbeiro e os mesmos serviços SHALL responder `201`.
6. **AGM-25** — IF a consulta tem `date` fora de `AAAA-MM-DD` ou inexistente, `serviceIds` fora das regras de AGM-16 ou `barberId` que não é UUID THEN o sistema SHALL responder `400` com "Informe uma data válida no formato AAAA-MM-DD." ou a mensagem correspondente de AGM-16.
7. **AGM-26 · RN-26** — IF o `barberId` ou um serviço não existe na barbearia ou está inativo, ou o barbeiro não faz todos os serviços THEN a consulta SHALL responder como em AGM-14 e AGM-15.

**Independent Test**: e2e: antecedência mínima de 60 min, agora 09:00 local, barbearia abre 09:00; o Dono consulta Ana para Corte hoje → o primeiro início é 09:00 (sem antecedência); agendar o 09:00 devolvido → `201`; a nova consulta não traz mais o 09:00.

---

### P1: Isolamento, sessão e documentação ⭐ MVP

**User Story**: Como **Dono**, quero que os agendamentos e clientes fiquem na minha barbearia e que as rotas estejam documentadas.

**Why P1**: RN-26; seção 5; CLAUDE.md (Swagger).

**Acceptance Criteria**:

1. **AGM-27 · RN-26** — The sistema SHALL ler e gravar barbeiros, serviços, clientes e agendamentos só da barbearia da sessão.
2. **AGM-28 · Seção 5** — IF a requisição não tem sessão válida THEN as duas rotas SHALL responder `401`.
3. **AGM-29** — The duas rotas SHALL estar documentadas no Swagger com resumo citando a US-10, payloads, respostas de sucesso, erros `400`, `401`, `403`, `404`, `409` (criação) e `422` (criação) e os perfis Dono e Barbeiro.
4. **AGM-30 · RN-05** — The PRD SHALL registrar na seção 19 a exceção "Dono pode forçar no painel com aviso" do RN-05 como questão em aberto, sem história que a implemente.

**Independent Test**: e2e: sem token → `401` nas duas rotas; `api-docs.e2e-spec.ts` passa com as rotas novas.

---

## Edge Cases

- WHEN o agendamento termina exatamente quando outro começa THEN o sistema SHALL gravá-lo (`201`).
- WHEN o agendamento termina exatamente no fechamento da barbearia ou no fim da jornada THEN o sistema SHALL gravá-lo (`201`).
- WHEN `startsAt` vem com fuso `-03:00` THEN o sistema SHALL gravar o mesmo instante em UTC (`2026-10-01T10:00:00-03:00` → `13:00Z`).
- WHEN o nome vem com espaços nas pontas THEN o sistema SHALL gravar o cliente novo sem eles.
- WHEN o dia está fechado ou todo bloqueado THEN a consulta SHALL responder `200` com `slots` vazio.
- IF o Dono consulta sem `barberId` e nenhum barbeiro ativo faz todos os serviços THEN a consulta SHALL responder `200` com `slots` vazio.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| AGM-01 | P1 Criar — grava manual, 201 | T2, T6, T7, T8, T13 | In Tasks |
| AGM-02 | P1 Criar — fim e ordem dos serviços | T8 | In Tasks |
| AGM-03 | P1 Criar — aparece na agenda | T6, T13 | In Tasks |
| AGM-04 | P1 Criar — sem antecedência mínima | T7, T8, T13 | In Tasks |
| AGM-05 | P1 Cliente — cria pelo telefone | T1, T2, T5, T7, T8 | Implementing |
| AGM-06 | P1 Cliente — reusa e mantém nome | T4, T7, T8, T13 | In Tasks |
| AGM-07 | P1 Cliente — telefone de outra barbearia | T4, T8 | In Tasks |
| AGM-08 | P1 Cliente — recusa não grava cliente | T5, T8, T13 | In Tasks |
| AGM-09 | P1 Cliente — corrida do mesmo telefone | T5, T8, T13 | In Tasks |
| AGM-10 | P1 Recusa — sobreposição 409 | T3, T8, T13 | In Tasks |
| AGM-11 | P1 Recusa — concorrência 409 | T3, T13 | In Tasks |
| AGM-12 | P1 Recusa — RN-05 422 | T3, T8, T13 | In Tasks |
| AGM-13 | P1 Recusa — passado 422 | T3, T8 | In Tasks |
| AGM-14 | P1 Recusa — serviço não realizado 400 | T3, T8 | In Tasks |
| AGM-15 | P1 Recusa — barbeiro ou serviço 404 | T8, T13 | In Tasks |
| AGM-16 | P1 Validação — 400 e mensagens | T1, T10, T13 | Implementing |
| AGM-17 | P1 Perfil — Barbeiro para si | T8 | In Tasks |
| AGM-18 | P1 Perfil — Barbeiro para outro 403 | T8, T13 | In Tasks |
| AGM-19 | P1 Perfil — Dono para qualquer barbeiro | T8 | In Tasks |
| AGM-20 | P1 Horários — por barbeiro | T9, T12, T13 | In Tasks |
| AGM-21 | P1 Horários — qualquer barbeiro | T9 | In Tasks |
| AGM-22 | P1 Horários — sem antecedência mínima | T9, T13 | In Tasks |
| AGM-23 | P1 Horários — Barbeiro só a própria | T9 | In Tasks |
| AGM-24 | P1 Horários — início devolvido é agendável | T13 | In Tasks |
| AGM-25 | P1 Horários — validação 400 | T11, T13 | In Tasks |
| AGM-26 | P1 Horários — barbeiro ou serviço inválido | T9 | In Tasks |
| AGM-27 | P1 Isolamento — RN-26 | T4, T5, T6, T8, T9, T13 | In Tasks |
| AGM-28 | P1 Isolamento — 401 | T13 | In Tasks |
| AGM-29 | P1 Swagger | T12, T13 | In Tasks |
| AGM-30 | P1 PRD — forçar como questão em aberto | T14 | In Tasks |

**ID format:** `AGM-NN` (Agendamento Manual, épico E3). Cada teste cita o `CA-10.x` (ou o `RN`) no nome, conforme o CLAUDE.md.

**Coverage:** 30 total, 30 mapped to tasks, 0 unmapped ✅

---

## Success Criteria

- [ ] Os CA-10.1 a CA-10.5 têm testes automatizados que citam o CA no nome e passam.
- [ ] `npm run lint`, `npm run build`, `npm test` e `npm run test:e2e` passam.
- [ ] As duas rotas aparecem em `/docs` com resumo, payloads, respostas e perfis.
- [ ] A seção 19 do PRD registra a exceção de forçar do RN-05.
