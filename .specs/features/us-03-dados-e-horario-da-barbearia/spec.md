# US-03: Dados da barbearia e horário de funcionamento — Specification

**Fonte:** PRD §11 US-03 · RF-32 · RNF-04 · PRD §5
**Escopo:** Large (dados persistidos, invariantes de horário, conversão de fuso, permissão por perfil)
**Decisões de discussão:** [context.md](context.md)

## Problem Statement

Hoje a barbearia só tem nome e um fuso fixo em `America/Sao_Paulo`, gravados no cadastro. Não existe endereço nem horário de funcionamento, então o bot não teria o que responder sobre "onde fica" e "que horas abre", e o motor de disponibilidade (US-07) não teria como saber quando a barbearia está aberta. Esta história dá ao Dono a tela de dados da barbearia (via API) e deixa o horário, já convertido para UTC no fuso da barbearia, pronto para a agenda e o bot lerem.

## Goals

- [ ] O Dono lê e salva nome, endereço, fuso e o horário de cada dia da semana (fechado ou aberto, com intervalo opcional) numa única chamada.
- [ ] Nenhum horário incoerente (fechamento antes da abertura, intervalo fora do expediente) chega ao banco.
- [ ] Os períodos abertos de qualquer data saem em UTC, calculados no fuso escolhido pela barbearia.
- [ ] Só o Dono lê e altera essas configurações, sempre do próprio tenant.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Telas do painel (Configurações > Barbearia) | Mesma decisão da US-01: só API até existir a história de frontend. O item de DoD "telas em 360 px" segue como pendência registrada. |
| Motor de disponibilidade, jornada dos barbeiros e cálculo de horários livres | US-05 e US-07. Aqui só entra a leitura dos períodos em que a barbearia está aberta numa data. |
| Bot respondendo endereço e horário | US-15. Aqui os dados ficam disponíveis pelo repositório e pela entidade `Barbershop`. |
| Feriados e datas especiais | Não está em RF/RN/CA. Bloqueios pontuais são a US-09. Registrado em Deferred Ideas. |
| Mais de um intervalo por dia; expediente que atravessa a meia-noite | Decisão da discussão (abertura/fechamento + 1 intervalo). |
| Endereço estruturado (CEP, UF, cidade) | Decisão da discussão (texto livre). |
| Aviso de agendamentos que ficariam fora do novo horário | Não existem agendamentos até a US-07/US-10. Registrado em Deferred Ideas. |
| Telefone/WhatsApp da barbearia | US-13. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Formato do dia | Fechado, ou `opensAt`/`closesAt` com no máximo um `break` (`startsAt`/`endsAt`) opcional | Decidido na discussão | y |
| Endereço | Texto livre, 5 a 200 caracteres após trim, obrigatório ao salvar | Decidido na discussão (texto livre); limites evitam vazio e texto abusivo | y |
| Fusos aceitos | Lista fechada das 16 zonas IANA do Brasil (`America/Noronha`, `Belem`, `Fortaleza`, `Recife`, `Araguaina`, `Maceio`, `Bahia`, `Sao_Paulo`, `Campo_Grande`, `Cuiaba`, `Santarem`, `Porto_Velho`, `Boa_Vista`, `Manaus`, `Eirunepe`, `Rio_Branco`) | Decidido na discussão; operação só no Brasil (§19) | y |
| Rotas | `GET /settings/barbershop` e `PUT /settings/barbershop`, só Dono | "Configurações > Barbearia" no CA-03.1; o prefixo `/settings` acomoda a US-06 | y |
| Semântica do salvamento | `PUT` com o estado completo (nome, endereço, fuso e os 7 dias); substitui tudo numa transação; responde 200 com o estado salvo, no formato do `GET` | Idempotente e sem ambiguidade sobre dias omitidos | y |
| Representação dos dias | Objeto com as chaves `monday` … `sunday`, todas obrigatórias; `null` = fechado | Explícito; nenhum dia fica implícito | y |
| Formato dos horários | `HH:mm` de `00:00` a `23:59`, qualquer minuto; fechamento estritamente depois da abertura (sem virar a meia-noite) | CA-03.2; granularidade de slot é assunto da US-07 | y |
| Regra do intervalo | `opensAt < break.startsAt < break.endsAt < closesAt` (desigualdades estritas) | Intervalo encostado na abertura/fechamento seria só um expediente menor | y |
| Horário nos fusos | Os horários são hora local de parede, interpretada no fuso atual da barbearia; trocar o fuso não reescreve os horários (09:00 continua 09:00, agora no novo fuso) | CA-03.3: "todos os horários passam a usar esse fuso" | y |
| Barbearia que nunca salvou | Endereço `null` e os 7 dias fechados (`null`) | Não inventa horário; o Dono precisa configurar antes de abrir a agenda | y |
| Onde a regra de horário vive | Formato no Zod (borda); coerência do horário (CA-03.2) nas value objects de domínio e também em `CHECK` no banco | CLAUDE.md: invariantes no domínio; defesa em profundidade no banco | y |
| Resposta para horário incoerente | HTTP 400 `{ message }` com o dia em português, ex.: "Segunda-feira: o horário de fechamento deve ser depois do de abertura." | "Mensagem de erro" do CA-03.2; o dia diz ao Dono onde corrigir | y |
| Resposta para payload malformado | HTTP 400 no formato do `ZodValidationPipe` (`message` + `errors[{ field, message }]`) | Padrão da borda já usado | y |
| Gravações simultâneas | A última gravação vence; cada gravação é atômica (nunca mistura dias de duas gravações) | Um único Dono por barbearia; sem RN de concorrência para configurações | y |
| Observabilidade | Só o log de requisição que o `nestjs-pino` já grava (rota, status, `x-request-id`); nenhum log nem métrica nova | Nenhuma métrica de negócio do PRD §13 depende disto, e o corpo (nome, endereço) não precisa ir para o log | y |
| Leitura para agenda e bot | Método de domínio que devolve os períodos abertos de uma data local (`YYYY-MM-DD`) em UTC | Dá forma testável a "disponíveis para a agenda e o bot" (CA-03.1) e ao CA-03.3 sem adiantar a US-07 | y |

**Open questions:** none - all resolved or logged above (required before the spec is confirmed).

---

## User Stories

### P1: Salvar e ler os dados e o horário da barbearia ⭐ MVP

**User Story**: Como **Dono**, quero salvar nome, endereço e horário de funcionamento por dia da semana, para que a agenda e o bot usem esses dados.

**Why P1**: RF-32; sem horário, o motor de disponibilidade (US-07) e o bot (US-15) não têm base.

**Acceptance Criteria** (each line is one EARS pattern):

1. **CFG-01 · CA-03.1** — WHEN o Dono envia `PUT /settings/barbershop` com nome, endereço, fuso e os 7 dias válidos THEN o sistema SHALL gravar os dados da barbearia da sessão e responder 200 com o estado salvo, no mesmo formato do `GET`.
2. **CFG-02 · CA-03.1** — WHEN o Dono chama `GET /settings/barbershop` THEN o sistema SHALL devolver nome, endereço, fuso e os 7 dias da barbearia da sessão.
3. **CFG-03 · CA-03.1** — WHEN um dia é enviado como `null` THEN o sistema SHALL gravá-lo como fechado e devolvê-lo como `null`.
4. **CFG-04 · CA-03.1** — WHEN um dia aberto traz `break` THEN o sistema SHALL gravar e devolver o intervalo; WHEN o dia aberto vem sem `break` THEN o sistema SHALL devolver `break: null`.
5. **CFG-05 · CA-03.1** — WHEN um dia que estava aberto é enviado como `null` numa nova gravação THEN o sistema SHALL passar a devolvê-lo como fechado.
6. **CFG-06 · CA-03.1** — WHILE a barbearia nunca salvou as configurações, the system SHALL devolver no `GET` o endereço `null` e os 7 dias `null`.
7. **CFG-07 · CA-03.1** — WHEN a agenda ou o bot pede os períodos abertos de uma data local THEN o sistema SHALL devolver, em UTC: nenhum período se o dia está fechado, um período `[abertura, fechamento)` se não há intervalo, e dois períodos `[abertura, início do intervalo)` e `[fim do intervalo, fechamento)` se há.

**Independent Test**: e2e: `PUT` com segunda 09:00–19:00 (intervalo 12:00–13:00) e domingo `null` → 200; `GET` devolve o mesmo; unit: os períodos de uma segunda em `America/Sao_Paulo` são `12:00Z–15:00Z` e `16:00Z–22:00Z`.

---

### P1: Recusar horário incoerente ⭐ MVP

**User Story**: Como **Dono**, quero que o sistema recuse um horário impossível, para não deixar o bot oferecer horários errados.

**Why P1**: CA-03.2; um horário inválido corromperia toda a disponibilidade calculada depois.

**Acceptance Criteria**:

1. **CFG-08 · CA-03.2** — IF o fechamento de algum dia é igual ou anterior à abertura THEN o sistema SHALL responder 400 com a mensagem "`<Dia>`: o horário de fechamento deve ser depois do de abertura." e não alterar nada.
2. **CFG-09 · CA-03.2** — IF o intervalo de algum dia não respeita `abertura < início do intervalo < fim do intervalo < fechamento` THEN o sistema SHALL responder 400 com a mensagem "`<Dia>`: o intervalo deve começar e terminar dentro do horário de funcionamento, com o fim depois do início." e não alterar nada.
3. **CFG-10 · CA-03.2** — IF o payload tem dia ausente, horário fora de `HH:mm` entre `00:00` e `23:59`, nome fora de 2 a 100 caracteres, endereço fora de 5 a 200 caracteres ou intervalo sem início ou sem fim THEN o sistema SHALL responder 400 com a lista de campos inválidos e não alterar nada.
4. **CFG-11 · CA-03.2** — The system SHALL recusar no banco (constraint `CHECK`) qualquer linha de horário com fechamento igual ou anterior à abertura ou com intervalo fora do expediente.

**Independent Test**: e2e: `PUT` com segunda 18:00–09:00 → 400 com "Segunda-feira: …"; `GET` em seguida devolve o estado anterior.

---

### P1: Fuso horário da barbearia ⭐ MVP

**User Story**: Como **Dono** de uma barbearia fora do horário de Brasília, quero escolher o fuso, para que os horários sejam oferecidos na hora local certa.

**Why P1**: CA-03.3 e RNF-04.

**Acceptance Criteria**:

1. **CFG-12 · CA-03.3** — WHILE o Dono não escolheu outro fuso, the system SHALL usar `America/Sao_Paulo`.
2. **CFG-13 · CA-03.3** — WHEN o Dono salva outro fuso do Brasil THEN o sistema SHALL devolvê-lo no `GET /settings/barbershop` e no `GET /me`.
3. **CFG-14 · CA-03.3** — WHEN o fuso muda THEN os períodos abertos SHALL ser calculados no novo fuso com os mesmos horários locais (ex.: segunda aberta às 09:00 começa às `12:00Z` em `America/Sao_Paulo` e às `13:00Z` em `America/Manaus`).
4. **CFG-15 · CA-03.3** — IF o fuso enviado não está na lista de fusos do Brasil THEN o sistema SHALL responder 400 com a mensagem "Escolha um fuso horário do Brasil." no campo `timezone` e não alterar nada.

**Independent Test**: unit na entidade: mesma semana, fuso trocado, o início do período muda de `12:00Z` para `13:00Z`; e2e: `PUT` com `America/Manaus` → `GET /me` devolve `America/Manaus`.

---

### P1: Permissão e isolamento ⭐ MVP

**User Story**: Como **Dono**, quero que só eu altere as configurações da minha barbearia.

**Why P1**: PRD §5 (Barbeiro não altera configurações), CA-02.2 e RN-26.

**Acceptance Criteria**:

1. **CFG-16** — IF um usuário com perfil Barbeiro chama `GET` ou `PUT /settings/barbershop` THEN o sistema SHALL responder 403 `{ message: 'Acesso negado.' }` e não alterar nada.
2. **CFG-17** — IF a requisição chega sem sessão válida THEN o sistema SHALL responder 401.
3. **CFG-18 · RN-26** — The system SHALL ler e gravar só a barbearia da sessão, ignorando qualquer `barbershopId` no corpo, na query ou no header.

**Independent Test**: e2e com duas barbearias A e B: o `PUT` de A com o `barbershopId` de B no corpo altera só A; o barbeiro de A recebe 403 nas duas rotas.

---

## Edge Cases

- IF o corpo traz campos extras THEN o sistema SHALL ignorá-los.
- WHEN nome ou endereço vêm com espaços nas pontas THEN o sistema SHALL gravá-los sem esses espaços.
- WHEN todos os 7 dias são enviados como `null` THEN o sistema SHALL aceitar e gravar a barbearia sem nenhum dia aberto.
- WHEN a abertura é `00:00` e o fechamento `23:59` THEN o sistema SHALL aceitar o dia.
- WHEN o mesmo `PUT` é enviado duas vezes THEN o sistema SHALL terminar no mesmo estado e responder 200 nas duas.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| CFG-01 | P1 Salvar — CA-03.1 `PUT` grava e responde | Verify | Verified |
| CFG-02 | P1 Salvar — CA-03.1 `GET` | Verify | Verified |
| CFG-03 | P1 Salvar — CA-03.1 dia fechado | Verify | Verified |
| CFG-04 | P1 Salvar — CA-03.1 intervalo | Verify | Verified |
| CFG-05 | P1 Salvar — CA-03.1 substituição da semana | Verify | Verified |
| CFG-06 | P1 Salvar — CA-03.1 estado inicial | Verify | Verified |
| CFG-07 | P1 Salvar — CA-03.1 períodos abertos em UTC | Verify | Verified |
| CFG-08 | P1 Recusar — CA-03.2 fechamento antes da abertura | Verify | Verified |
| CFG-09 | P1 Recusar — CA-03.2 intervalo inválido | Verify | Verified |
| CFG-10 | P1 Recusar — CA-03.2 payload malformado | Verify | Verified |
| CFG-11 | P1 Recusar — CA-03.2 `CHECK` no banco | Verify | Verified |
| CFG-12 | P1 Fuso — CA-03.3 padrão | Verify | Verified |
| CFG-13 | P1 Fuso — CA-03.3 fuso salvo | Verify | Verified |
| CFG-14 | P1 Fuso — CA-03.3 períodos no novo fuso | Verify | Verified |
| CFG-15 | P1 Fuso — CA-03.3 fuso fora da lista | Verify | Verified |
| CFG-16 | P1 Permissão — Barbeiro 403 | Verify | Verified |
| CFG-17 | P1 Permissão — sem sessão 401 | Verify | Verified |
| CFG-18 | P1 Permissão — RN-26 tenant da sessão | Verify | Verified |

**ID format:** `CFG-NN` (Configuração da barbearia, épico E2). Cada teste cita o `CA-03.x` (ou o `RN`) no nome, conforme o CLAUDE.md.

**Coverage:** 18 total, 18 implemented (ver Requirement → Task Map em tasks.md), 0 unmapped

---

## Success Criteria

- [ ] Os 3 CAs da US-03 têm pelo menos um teste automatizado cada, com o `CA-03.x` no nome.
- [ ] `npm run lint`, `npm run build`, `npm test` e `npm run test:e2e` passam.
- [ ] Nenhum horário incoerente é gravado, nem pela API nem por `INSERT` direto no banco.
