# US-07: Motor de disponibilidade e validação de agendamentos — Specification

**Fonte:** PRD §11 US-07 · RN-02, RN-03, RN-04, RN-05, RN-07 · RN-26
**Escopo:** Complex (domínio novo de agenda, fuso horário, concorrência com constraint de exclusão no banco, contrato compartilhado por bot e painel)
**Decisões de discussão:** [context.md](context.md)

## Problem Statement

O painel (US-10) e o bot (US-17) vão oferecer e gravar horários, mas ainda não existe nada que diga quais horários estão livres nem que impeça dois agendamentos no mesmo horário. Se cada canal calculasse a agenda por conta própria, as regras iam divergir. Esta história entrega um motor único que calcula os horários disponíveis e valida e grava agendamentos, com a sobreposição barrada também no banco.

## Goals

- [ ] Uma consulta devolve só horários em que o serviço cabe inteiro, dentro do funcionamento e da jornada, fora de bloqueios e agendamentos.
- [ ] "Qualquer barbeiro" devolve horários de todos os barbeiros aptos, cada um com o barbeiro que atende.
- [ ] A antecedência mínima vale para o bot e não vale para o painel.
- [ ] Duas gravações simultâneas no mesmo horário do mesmo barbeiro resultam em exatamente um agendamento.
- [ ] Toda gravação recusada informa a regra violada e não grava nada.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Rotas HTTP do motor | Decidido na discussão: história técnica; a US-10 expõe as rotas do painel e a US-17 usa pelo bot. |
| Cliente no agendamento | Decidido na discussão: a US-10 cria o cadastro de clientes (CA-10.2) e a coluna no agendamento. |
| Criar, editar e remover bloqueios e folgas | US-09. Esta história cria só a tabela e a leitura de que o motor precisa (CA-07.1). |
| Cancelar e remarcar | US-18. |
| Marcar atendido ou falta | US-11. |
| Cliente bloqueado por faltas (RN-12) | US-17 (CA-17.6). |
| Forçar horário fora das regras no painel (exceção do RN-05) | Nenhum CA descreve o aviso nem quem confirma. Registrado em Deferred Ideas do context.md. |
| Telas | História técnica, sem interface. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Grade da oferta | Inícios a cada 30 min, contados a partir do início de cada período livre | Decidido na discussão | y |
| Período livre | Interseção dos períodos de funcionamento da barbearia e da jornada do barbeiro no dia da semana da data, menos bloqueios e agendamentos confirmados do barbeiro | CA-07.1; CA-05.3 já avisa que só a interseção fica disponível | y |
| Grade na gravação | A gravação não exige alinhamento à grade; aceita qualquer início em minuto cheio que respeite as regras | Decidido na discussão: a grade é só da oferta | y |
| Horário no passado | Painel: `início >= agora`. Bot: `início >= agora + antecedência mínima` | Decidido na discussão (CA-07.3) | y |
| Cliente | O agendamento não tem cliente nesta história | Decidido na discussão | y |
| Exposição | Sem rota HTTP; só use cases | Decidido na discussão | y |
| Data da consulta | Data local da barbearia (`AAAA-MM-DD`); horários convertidos com o fuso da barbearia; resultado em instantes UTC | CLAUDE.md (datas em UTC, fuso só nas bordas); CA-03.3 | y |
| Duração total | Soma das durações dos serviços pedidos, lida na hora da consulta ou gravação | RN-04 | y |
| Barbeiro apto | Barbeiro ativo que realiza **todos** os serviços pedidos | RN-04 junta os serviços num único atendimento com um só barbeiro || y |
| "Qualquer barbeiro" | Cada início aparece uma vez, com o primeiro barbeiro livre na ordem da listagem de barbeiros (nome, sem diferenciar maiúsculas) | CA-07.2 pede "qual barbeiro atende cada horário"; ordem determinística e testável. Balanceamento não está no PRD || y |
| Ordem das regras | Quando várias regras são violadas, o motor informa a primeira nesta ordem: barbeiro e serviços → passado → antecedência (RN-02) → funcionamento (RN-05) → jornada (RN-05) → bloqueio (RN-05) → sobreposição (RN-03) | Resultado determinístico para o CA-07.5 || y |
| Horário no passado no painel | Erro próprio ("O horário já passou."), sem RN, porque nenhuma RN trata disso | A decisão veio da discussão, não do PRD || y |
| Conflito detectado pelo banco | A violação da constraint de exclusão vira o mesmo erro de conflito da checagem na aplicação, citando RN-07 | CA-07.4 pede "erro de conflito" || y |
| Status que ocupa o horário | Só agendamentos confirmados ocupam horário; é o único status criado nesta história | RN-01; cancelado (US-18) e atendido/falta (US-11) vêm depois || y |
| Origem gravada | `bot` ou `manual`; a origem "painel" do CA-07.3 é gravada como `manual` | CA-10.1 e RF-28 chamam de "manual" || y |
| Bloqueios | Tabela mínima de bloqueios por barbeiro (início e fim em UTC); folga de dia inteiro é um bloqueio que cobre o dia. Sem motivo nem API nesta história | CA-07.1 exige considerar bloqueios e folgas; CLAUDE.md permite o mínimo estrutural. Motivo e CRUD são da US-09 || y |
| Idempotência | Não há chave de idempotência. Reenviar a mesma gravação recebe erro de conflito, porque o primeiro agendamento ocupa o horário | Sem RN de reenvio; o resultado já é seguro || y |
| Observabilidade | Contador de agendamentos gravados e contador de conflitos, ambos com label `origin` (`bot`/`manual`); log sem dados pessoais (não há cliente) | CLAUDE.md (métricas de negócio, labels de baixa cardinalidade) || y |
| Auth e rate limit | N/A: sem rota; o tenant chega como argumento do use case e vem da sessão na US-10 ou da barbearia do WhatsApp na US-17 | Sem borda HTTP nesta história || y |
| Falha de dependência externa | N/A: o motor só usa o Postgres | — | y |
| Ciclo de vida | N/A: agendamentos não expiram nem são apagados nesta história | — | y |

**Open questions:** none - all resolved or logged above (required before the spec is confirmed).

---

## User Stories

### P1: Horários de um barbeiro ⭐ MVP

**User Story**: Como **sistema**, preciso listar os horários livres de um barbeiro para os serviços pedidos, para que o painel e o bot ofereçam só horários reais.

**Why P1**: CA-07.1; base da US-10 e da US-17.

**Acceptance Criteria** (each line is one EARS pattern):

1. **AVL-01 · CA-07.1** — WHEN o motor é consultado com barbearia, barbeiro, serviços e data THEN o motor SHALL devolver só inícios cujo intervalo `[início, início + duração total)` fica inteiro dentro de um período de funcionamento da barbearia e de um período da jornada do barbeiro naquela data.
2. **AVL-02 · CA-07.1 · RN-04** — The motor SHALL usar como duração total a soma das durações dos serviços pedidos.
3. **AVL-03 · CA-07.1** — The motor SHALL gerar os inícios de cada período livre a partir do início do período, de 30 em 30 minutos, enquanto o intervalo couber inteiro no período.
4. **AVL-04 · CA-07.1 · RN-05** — The motor SHALL deixar de fora todo início cujo intervalo se sobrepõe a um bloqueio ou folga do barbeiro.
5. **AVL-05 · CA-07.1 · RN-03** — The motor SHALL deixar de fora todo início cujo intervalo se sobrepõe a um agendamento confirmado do barbeiro.
6. **AVL-06 · CA-07.1** — WHEN um agendamento ou bloqueio termina no instante em que o intervalo começa, ou começa no instante em que ele termina, THEN o motor SHALL considerar o início disponível.
7. **AVL-07 · CA-07.1** — WHEN a barbearia está fechada ou o barbeiro não trabalha no dia da semana da data THEN o motor SHALL devolver lista vazia.
8. **AVL-08 · CA-07.1** — The motor SHALL devolver cada horário com início, fim (instantes UTC) e o id do barbeiro, em ordem crescente de início.
9. **AVL-09 · CA-07.1** — The motor SHALL interpretar a data e os horários de funcionamento e jornada no fuso da barbearia.

**Independent Test**: unidade: barbearia 09:00–18:00 com intervalo 12:00–13:00, barbeiro 10:00–17:00, serviços de 30 + 15 min, um agendamento 14:00–14:45 e um bloqueio 15:30–16:00 → inícios 10:00, 10:30, 11:00, 13:00, 14:45, 16:00, e nenhum outro (13:30 terminaria às 14:15, dentro do agendamento).

---

### P1: Qualquer barbeiro ⭐ MVP

**User Story**: Como **sistema**, preciso listar horários de todos os barbeiros aptos quando o cliente não tem preferência, para oferecer o primeiro horário disponível (RN-06).

**Why P1**: CA-07.2; RF-03 e CA-17.3.

**Acceptance Criteria**:

1. **AVL-10 · CA-07.2** — WHEN o motor é consultado sem barbeiro THEN o motor SHALL calcular os horários de cada barbeiro ativo que realiza todos os serviços pedidos, com as regras de AVL-01 a AVL-09.
2. **AVL-11 · CA-07.2** — WHEN mais de um barbeiro está livre no mesmo início THEN o motor SHALL devolver esse início uma única vez, com o primeiro desses barbeiros na ordem de nome.
3. **AVL-12 · CA-07.2** — The motor SHALL deixar de fora barbeiros inativos e barbeiros que não realizam algum dos serviços pedidos.
4. **AVL-13 · CA-07.2** — WHEN nenhum barbeiro ativo realiza todos os serviços pedidos THEN o motor SHALL devolver lista vazia.

**Independent Test**: unidade: Ana e Bruno fazem corte, Caio (inativo) também, Davi não faz; Ana ocupada das 10:00 às 10:30 → o início 10:00 sai com Bruno, 10:30 sai com Ana, nenhum horário sai com Caio ou Davi.

---

### P1: Antecedência mínima por origem ⭐ MVP

**User Story**: Como **sistema**, preciso aplicar a antecedência mínima só ao bot, para que o painel possa encaixar quem liga ou chega na hora.

**Why P1**: CA-07.3; RN-02.

**Acceptance Criteria**:

1. **AVL-14 · CA-07.3 · RN-02** — WHILE a origem é `bot` the motor SHALL deixar de fora todo início anterior a `agora + antecedência mínima` vigente da barbearia.
2. **AVL-15 · CA-07.3** — WHILE a origem é `painel` the motor SHALL deixar de fora só os inícios anteriores a `agora`, sem aplicar a antecedência mínima.
3. **AVL-16 · CA-07.3** — WHEN um início é exatamente `agora + antecedência mínima` (bot) ou exatamente `agora` (painel) THEN o motor SHALL considerá-lo disponível.
4. **AVL-17 · CA-07.3** — WHEN a antecedência mínima da barbearia muda THEN a consulta e a gravação seguintes SHALL usar o valor novo.

**Independent Test**: unidade com relógio fixo às 10:05 e antecedência de 60 min: bot recebe inícios a partir de 11:30 (grade), painel recebe a partir de 10:30 (primeiro início da grade `>= 10:05`), com a barbearia abrindo às 09:00.

---

### P1: Gravar agendamento com validação ⭐ MVP

**User Story**: Como **sistema**, preciso gravar um agendamento só quando ele respeita todas as regras, e dizer qual regra foi violada quando não respeita.

**Why P1**: CA-07.5; RN-03, RN-05.

**Acceptance Criteria**:

1. **AVL-18 · CA-07.5** — WHEN uma gravação respeita todas as regras THEN o motor SHALL persistir o agendamento com status confirmado, a origem (`bot` ou `manual`), o barbeiro, os serviços na ordem pedida, o início e o fim `início + duração total`, e devolvê-lo.
2. **AVL-19 · CA-07.5 · RN-02** — IF a origem é `bot` e o início é anterior a `agora + antecedência mínima` THEN o motor SHALL recusar com erro de antecedência mínima que cita RN-02.
3. **AVL-20 · CA-07.5** — IF o início é anterior a `agora` THEN o motor SHALL recusar com o erro "O horário já passou.".
4. **AVL-21 · CA-07.5 · RN-05** — IF o intervalo não fica inteiro dentro de um período de funcionamento da barbearia THEN o motor SHALL recusar com erro de fora do funcionamento que cita RN-05.
5. **AVL-22 · CA-07.5 · RN-05** — IF o intervalo não fica inteiro dentro de um período da jornada do barbeiro THEN o motor SHALL recusar com erro de fora da jornada que cita RN-05.
6. **AVL-23 · CA-07.5 · RN-05** — IF o intervalo se sobrepõe a um bloqueio ou folga do barbeiro THEN o motor SHALL recusar com erro de horário bloqueado que cita RN-05.
7. **AVL-24 · CA-07.5 · RN-03** — IF o intervalo se sobrepõe a um agendamento confirmado do barbeiro THEN o motor SHALL recusar com erro de conflito que cita RN-03.
8. **AVL-25 · CA-07.5** — IF mais de uma regra é violada THEN o motor SHALL informar a primeira na ordem da tabela de Assumptions.
9. **AVL-26 · CA-07.5** — IF a gravação é recusada THEN o motor SHALL não persistir nenhum agendamento nem serviço de agendamento.
10. **AVL-27 · CA-07.1 · CA-07.5** — WHEN um horário foi devolvido pela consulta THEN a gravação desse mesmo horário, com os mesmos dados e o mesmo `agora`, SHALL ser aceita.

**Independent Test**: unidade com fakes: um caso por regra (antecedência, passado, funcionamento, jornada, bloqueio, sobreposição), cada um verificando o erro, a RN citada e que nada foi gravado.

---

### P1: Concorrência ⭐ MVP

**User Story**: Como **sistema**, preciso garantir que dois clientes nunca fiquem com o mesmo horário do mesmo barbeiro, mesmo quando confirmam ao mesmo tempo.

**Why P1**: CA-07.4; RN-07.

**Acceptance Criteria**:

1. **AVL-28 · CA-07.4 · RN-07** — WHEN duas gravações sobrepostas para o mesmo barbeiro são processadas ao mesmo tempo THEN o sistema SHALL persistir exatamente uma e recusar a outra com erro de conflito que cita RN-07.
2. **AVL-29 · CA-07.4 · RN-07** — The banco SHALL recusar, por constraint de exclusão sobre barbeiro e intervalo, dois agendamentos confirmados do mesmo barbeiro com intervalos sobrepostos, inclusive por `INSERT` direto.
3. **AVL-30 · CA-07.4** — The banco SHALL aceitar agendamentos confirmados do mesmo barbeiro em que um termina no instante em que o outro começa.
4. **AVL-31 · CA-07.4** — The banco SHALL aceitar agendamentos sobrepostos de barbeiros diferentes.

**Independent Test**: e2e contra o Postgres: duas gravações disparadas com `Promise.all` para o mesmo barbeiro e horário → uma resolve, a outra rejeita com o erro de conflito; a tabela tem uma linha.

---

### P1: Barbeiro, serviços e isolamento ⭐ MVP

**User Story**: Como **sistema**, preciso recusar barbeiros e serviços inválidos e nunca misturar dados de barbearias.

**Why P1**: RN-26; CA-07.5.

**Acceptance Criteria**:

1. **AVL-32 · RN-26** — IF o barbeiro não existe na barbearia ou está inativo THEN o motor SHALL recusar a consulta ou a gravação com "Barbeiro não encontrado.".
2. **AVL-33 · RN-26** — IF algum serviço não existe na barbearia ou está inativo THEN o motor SHALL recusar a consulta ou a gravação com "Serviço não encontrado.".
3. **AVL-34 · CA-07.5** — IF o barbeiro informado não realiza algum dos serviços pedidos THEN o motor SHALL recusar a consulta ou a gravação com erro de barbeiro que não realiza o serviço.
4. **AVL-35 · CA-07.5** — IF a lista de serviços está vazia ou repete um serviço THEN o motor SHALL recusar a consulta ou a gravação com erro de valor inválido.
5. **AVL-36 · RN-26** — The motor SHALL ler barbearia, regras, barbeiros, serviços, bloqueios e agendamentos só da barbearia informada; bloqueios e agendamentos de outra barbearia SHALL não afetar o resultado.
6. **AVL-37 · RN-26** — The banco SHALL recusar agendamento, serviço de agendamento ou bloqueio cujo barbeiro ou serviço pertence a outra barbearia.

**Independent Test**: unidade: barbeiro de outra barbearia → "Barbeiro não encontrado."; e2e de banco: `INSERT` de agendamento com barbeiro de outra barbearia falha por FK composta.

---

### P2: Métricas de agendamento

**User Story**: Como **operador**, quero contar agendamentos gravados e conflitos por origem, para acompanhar o uso e a disputa de horários.

**Why P2**: CLAUDE.md (métricas de negócio); o produto funciona sem elas.

**Acceptance Criteria**:

1. **AVL-38** — WHEN um agendamento é gravado THEN o sistema SHALL incrementar o contador de agendamentos com o label `origin` igual à origem gravada.
2. **AVL-39** — WHEN uma gravação é recusada por sobreposição (AVL-24 ou AVL-28) THEN o sistema SHALL incrementar o contador de conflitos com o label `origin`.

**Independent Test**: unidade com métricas fake: uma gravação aceita e uma em conflito → um incremento em cada contador, com `origin` certo.

---

## Edge Cases

- WHEN a data da consulta já passou THEN o motor SHALL devolver lista vazia.
- IF a data não está no formato `AAAA-MM-DD` ou não existe no calendário THEN o motor SHALL recusar com erro de valor inválido.
- IF o início da gravação tem segundos ou milissegundos diferentes de zero THEN o motor SHALL recusar com erro de valor inválido.
- WHEN o período livre é menor que a duração total THEN o motor SHALL não oferecer nenhum início nesse período.
- WHEN a jornada do barbeiro começa antes da abertura da barbearia THEN a grade SHALL começar na abertura.
- WHEN um período livre começa fora da grade da jornada (ex.: depois de um agendamento que termina às 14:45) THEN a grade desse período SHALL começar no fim do agendamento.
- WHEN a mesma gravação é enviada duas vezes THEN a segunda SHALL receber erro de conflito e só um agendamento SHALL existir.
- WHEN a barbearia não tem regras gravadas THEN o motor SHALL usar `BookingRules.defaults()` (AD-008 prevê barbearia inserida por fora).

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| AVL-01 | P1 Barbeiro — CA-07.1 cabe inteiro no funcionamento e na jornada | T2 | Implementing |
| AVL-02 | P1 Barbeiro — RN-04 duração somada | - | Pending |
| AVL-03 | P1 Barbeiro — grade de 30 min por período livre | - | Pending |
| AVL-04 | P1 Barbeiro — fora de bloqueios e folgas | - | Pending |
| AVL-05 | P1 Barbeiro — fora de agendamentos | - | Pending |
| AVL-06 | P1 Barbeiro — intervalos encostados são livres | - | Pending |
| AVL-07 | P1 Barbeiro — dia fechado ou sem jornada | T2 | Implementing |
| AVL-08 | P1 Barbeiro — formato e ordem do resultado | - | Pending |
| AVL-09 | P1 Barbeiro — fuso da barbearia | T1, T2 | Implementing |
| AVL-10 | P1 Qualquer — todos os aptos | - | Pending |
| AVL-11 | P1 Qualquer — um barbeiro por início, ordem de nome | - | Pending |
| AVL-12 | P1 Qualquer — sem inativos e sem inaptos | - | Pending |
| AVL-13 | P1 Qualquer — ninguém apto | - | Pending |
| AVL-14 | P1 Antecedência — bot aplica RN-02 | - | Pending |
| AVL-15 | P1 Antecedência — painel só a partir de agora | - | Pending |
| AVL-16 | P1 Antecedência — fronteira exata | - | Pending |
| AVL-17 | P1 Antecedência — regra vigente | - | Pending |
| AVL-18 | P1 Gravar — grava confirmado | - | Pending |
| AVL-19 | P1 Gravar — recusa RN-02 | - | Pending |
| AVL-20 | P1 Gravar — recusa passado | - | Pending |
| AVL-21 | P1 Gravar — recusa fora do funcionamento | - | Pending |
| AVL-22 | P1 Gravar — recusa fora da jornada | - | Pending |
| AVL-23 | P1 Gravar — recusa bloqueio | - | Pending |
| AVL-24 | P1 Gravar — recusa sobreposição | - | Pending |
| AVL-25 | P1 Gravar — ordem das regras | - | Pending |
| AVL-26 | P1 Gravar — recusa não grava nada | - | Pending |
| AVL-27 | P1 Gravar — consulta e gravação concordam | - | Pending |
| AVL-28 | P1 Concorrência — CA-07.4 simultâneas | - | Pending |
| AVL-29 | P1 Concorrência — constraint de exclusão | - | Pending |
| AVL-30 | P1 Concorrência — encostados aceitos no banco | - | Pending |
| AVL-31 | P1 Concorrência — barbeiros diferentes | - | Pending |
| AVL-32 | P1 Isolamento — barbeiro inválido | - | Pending |
| AVL-33 | P1 Isolamento — serviço inválido | - | Pending |
| AVL-34 | P1 Isolamento — barbeiro não realiza serviço | - | Pending |
| AVL-35 | P1 Isolamento — lista de serviços inválida | - | Pending |
| AVL-36 | P1 Isolamento — RN-26 leituras por tenant | - | Pending |
| AVL-37 | P1 Isolamento — RN-26 FKs compostas | - | Pending |
| AVL-38 | P2 Métricas — agendamentos gravados | - | Pending |
| AVL-39 | P2 Métricas — conflitos | - | Pending |

**ID format:** `AVL-NN` (Availability, épico E3). Cada teste cita o `CA-07.x` (ou o `RN`) no nome, conforme o CLAUDE.md.

**Coverage:** 39 total, 0 mapped to tasks, 39 unmapped ⚠️ (mapeados na fase Tasks)

---

## Success Criteria

- [ ] Os 5 CAs da US-07 têm pelo menos um teste automatizado cada, com o `CA-07.x` no nome.
- [ ] O teste de concorrência roda contra o Postgres real e passa de forma estável (sem depender de ordem ou de `sleep`).
- [ ] Nenhum `INSERT` direto consegue gravar dois agendamentos confirmados sobrepostos do mesmo barbeiro.
- [ ] `npm run lint`, `npm run build`, `npm test` e `npm run test:e2e` passam.
