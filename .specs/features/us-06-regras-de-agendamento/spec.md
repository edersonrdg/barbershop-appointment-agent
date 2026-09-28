# US-06: Configuração das regras de agendamento — Specification

**Fonte:** PRD §11 US-06 · RF-35 · RN-02, RN-09, RN-12, RN-16, RN-19 · PRD §5
**Escopo:** Medium-Large (dados persistidos com padrão por barbearia, validação em três camadas, permissão por perfil, migração de barbearias existentes)
**Decisões de discussão:** [context.md](context.md)

## Problem Statement

As regras que o bot e a agenda vão aplicar (antecedência mínima, prazo de cancelamento, limite de faltas, prazo da oferta da lista de espera e dias do lembrete de retorno) não existem no sistema. Sem elas, a US-07 não sabe a partir de quando oferecer horários, e as histórias de cancelamento, faltas, lista de espera e retorno não têm de onde ler seus limites. Esta história grava as regras por barbearia, com os padrões do PRD, e deixa o Dono alterá-las.

## Goals

- [ ] Toda barbearia, nova ou já existente, tem as cinco regras com os padrões do CA-06.1 sem nenhuma ação do Dono.
- [ ] O Dono lê e altera as cinco regras por `GET` e `PUT /settings/rules`.
- [ ] As histórias seguintes leem as regras vigentes da barbearia por um método de repositório com tenant.
- [ ] Nenhum valor negativo, vazio ou fora dos limites chega ao banco.
- [ ] Só o Dono lê e altera as regras, sempre do próprio tenant.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Telas do painel (Configurações > Regras) | Mesma decisão da US-01: só API até existir a história de frontend. O item de DoD "telas em 360 px" segue como pendência registrada. |
| Aplicar a antecedência mínima ao oferecer horários | US-07 (CA-07.3) e US-17 (CA-17.5). |
| Aplicar o prazo de cancelamento | US-18 (CA-18.1, CA-18.4). |
| Contar faltas e bloquear cliente | US-11. |
| Ofertar vaga da lista de espera | US-24. |
| Enviar o lembrete de retorno | US-25. |
| Histórico de alterações das regras | Não está no RF-35. Registrado em Deferred Ideas. |
| Barbeiro lendo as regras | PRD §5 não dá ao Barbeiro acesso a configurações (CA-02.2). |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Unidades | Antecedência e cancelamento em minutos; faltas em quantidade; oferta em minutos; retorno em dias | Decidido na discussão; minutos permitem 30 min, que horas não permitem | y |
| Limites | Antecedência e cancelamento: inteiro de 0 a 10.080, múltiplo de 5. Faltas: 1 a 10. Oferta: 5 a 120. Retorno: 7 a 365 | Decidido na discussão | y |
| Zero | Antecedência 0 e cancelamento 0 aceitos ("sem restrição"); as outras três nunca aceitam 0 | Decidido na discussão | y |
| Efeito de uma regra alterada (CA-06.2) | Cada ação lê a regra vigente quando acontece; o agendamento não guarda cópia da regra | Decidido na discussão. "Sem alterar agendamentos já criados" = salvar as regras não escreve em nenhuma outra tabela | y |
| Padrões | 60 min, 120 min, 2 faltas, 15 min, 30 dias, gravados na barbearia quando ela é criada e editáveis por ela | CA-06.1. Os valores 15 min e 30 dias são "sugestão, a validar" (PRD §19); ficam como padrão configurável por barbearia, não como constante aplicada | y |
| Barbearias criadas antes desta história | A migration grava os cinco padrões em todas as barbearias existentes | Sem isso, uma barbearia de US-01 a US-05 ficaria sem regras e a US-07 falharia | y |
| Rotas | `GET /settings/rules` e `PUT /settings/rules`; só Dono | "Configurações > Regras" no CA-06.1; mesmo padrão de `/settings/barbershop` | y |
| Formato | `{ minimumAdvanceMinutes, cancellationDeadlineMinutes, noShowLimit, waitlistOfferMinutes, returnReminderDays }`, todos inteiros | Mesmo formato no `GET`, no corpo do `PUT` e na resposta do `PUT` | y |
| Semântica do `PUT` | Estado completo: os cinco campos são obrigatórios; responde 200 com as regras salvas | CA-06.3 trata vazio como inválido; `PUT` completo é idempotente e não deixa campo "meio salvo" | y |
| Valor inválido | 400 no formato do `ZodValidationPipe` (`message` + `errors[{ field, message }]`), com um erro por campo inválido, sem alterar nada | Padrão da borda já usado | y |
| Onde a regra é garantida | Formato e limites no Zod; os mesmos limites como invariante no domínio (`InvalidValueError`) e como `CHECK` no banco | CLAUDE.md: invariantes no domínio; lição L-002 (testar a fronteira exata no `CHECK`) | y |
| Permissão | Só Dono nas duas rotas (sem `@Roles`, AD-007); Barbeiro recebe 403 | PRD §5 e CA-02.2 | y |
| Leitura para as próximas histórias | Método do repositório que recebe o `barbershopId` e devolve as regras vigentes | AD-004; US-07 e seguintes leem por aqui, sem passar pela rota HTTP | y |
| Gravações simultâneas | A última gravação vence; cada gravação das cinco regras é atômica | Um único Dono por barbearia; sem RN de concorrência para configuração | y |
| Observabilidade | Só o log de requisição que o `nestjs-pino` já grava; nenhum log nem métrica nova | Nenhuma métrica do PRD §13 depende disto | y |
| Falha de dependência externa | N/A: a história não chama serviço externo | — | y |
| Ciclo de vida / expiração | N/A: as regras existem enquanto a barbearia existe; não há exclusão | — | y |

**Open questions:** none - all resolved or logged above (required before the spec is confirmed).

---

## User Stories

### P1: Padrões em toda barbearia ⭐ MVP

**User Story**: Como **Dono**, quero encontrar as regras já preenchidas com valores razoáveis, para que o bot funcione sem eu configurar nada.

**Why P1**: CA-06.1; a US-07 precisa das regras em toda barbearia.

**Acceptance Criteria** (each line is one EARS pattern):

1. **RUL-01 · CA-06.1** — WHEN uma barbearia é criada pelo cadastro (US-01) THEN o sistema SHALL gravar nela antecedência mínima 60 min, prazo de cancelamento 120 min, limite de faltas 2, prazo da oferta 15 min e lembrete de retorno 30 dias.
2. **RUL-02 · CA-06.1** — WHEN o Dono de uma barbearia nova chama `GET /settings/rules` THEN o sistema SHALL responder 200 com `{ minimumAdvanceMinutes: 60, cancellationDeadlineMinutes: 120, noShowLimit: 2, waitlistOfferMinutes: 15, returnReminderDays: 30 }`.
3. **RUL-03 · CA-06.1** — WHEN a migration desta história roda sobre barbearias já existentes THEN o sistema SHALL gravar nelas os mesmos cinco padrões.

**Independent Test**: e2e: cadastrar uma barbearia e chamar `GET /settings/rules` → 200 com os cinco padrões; e2e de banco: uma barbearia inserida antes da migration fica com os padrões depois dela.

---

### P1: Alterar as regras ⭐ MVP

**User Story**: Como **Dono**, quero ajustar as regras de agendamento da minha barbearia, para adaptar o bot ao meu jeito de trabalhar.

**Why P1**: CA-06.2; RF-35.

**Acceptance Criteria**:

1. **RUL-04 · CA-06.2** — WHEN o Dono envia `PUT /settings/rules` com os cinco campos válidos THEN o sistema SHALL substituir as cinco regras da barbearia da sessão e responder 200 com as regras salvas.
2. **RUL-05 · CA-06.2** — WHEN o Dono chama `GET /settings/rules` depois de um `PUT` bem-sucedido THEN o sistema SHALL devolver os valores enviados no `PUT`.
3. **RUL-06 · CA-06.2** — WHEN as regras são salvas THEN a leitura de regras vigentes do repositório SHALL devolver os novos valores na chamada seguinte, para a mesma barbearia.
4. **RUL-07 · CA-06.2** — WHEN as regras são salvas THEN o sistema SHALL manter sem alteração o nome, o endereço, o fuso, o horário de funcionamento da barbearia e todas as linhas de outras tabelas.
5. **RUL-08 · CA-06.2** — WHEN o Dono envia `PUT /settings/rules` com `minimumAdvanceMinutes: 0` e `cancellationDeadlineMinutes: 0` THEN o sistema SHALL aceitar e gravar os dois zeros.

**Independent Test**: e2e: `PUT` com `{ 30, 240, 3, 20, 45 }` → 200 com os mesmos valores; `GET` devolve os mesmos valores; `GET /settings/barbershop` devolve os dados de antes.

---

### P1: Recusar valores inválidos ⭐ MVP

**User Story**: Como **Dono**, quero que o sistema recuse regras inválidas, para não deixar o bot com uma regra impossível.

**Why P1**: CA-06.3.

**Acceptance Criteria**:

1. **RUL-09 · CA-06.3** — IF algum dos cinco campos é negativo THEN o sistema SHALL responder 400 com o erro no campo correspondente e não alterar nenhuma regra.
2. **RUL-10 · CA-06.3** — IF algum dos cinco campos está ausente, `null` ou é string vazia THEN o sistema SHALL responder 400 com o erro no campo correspondente e não alterar nenhuma regra.
3. **RUL-11 · CA-06.3** — IF algum campo não é inteiro, ou `minimumAdvanceMinutes` ou `cancellationDeadlineMinutes` passa de 10.080 ou não é múltiplo de 5, ou `noShowLimit` está fora de 1 a 10, ou `waitlistOfferMinutes` está fora de 5 a 120, ou `returnReminderDays` está fora de 7 a 365 THEN o sistema SHALL responder 400 com o erro no campo correspondente e não alterar nenhuma regra.
4. **RUL-12 · CA-06.3** — The system SHALL recusar no domínio, com `InvalidValueError`, regras fora dos limites do RUL-11 ou negativas.
5. **RUL-13 · CA-06.3** — The system SHALL recusar no banco (constraint `CHECK`) qualquer linha com regra fora dos limites do RUL-11 ou negativa.

**Independent Test**: e2e: `PUT` com `noShowLimit: -1` → 400 no campo `noShowLimit`; `PUT` sem `returnReminderDays` → 400 no campo `returnReminderDays`; `GET` devolve as regras de antes.

---

### P1: Permissão e isolamento ⭐ MVP

**User Story**: Como **Dono**, quero que só eu altere as regras da minha barbearia.

**Why P1**: PRD §5 (Barbeiro não altera configurações), CA-02.2 e RN-26.

**Acceptance Criteria**:

1. **RUL-14** — IF um usuário com perfil Barbeiro chama `GET` ou `PUT /settings/rules` THEN o sistema SHALL responder 403 `{ message: 'Acesso negado.' }` e não alterar nada.
2. **RUL-15** — IF a requisição chega sem sessão válida THEN o sistema SHALL responder 401.
3. **RUL-16 · RN-26** — The system SHALL ler e gravar só as regras da barbearia da sessão, ignorando qualquer `barbershopId` no corpo, na query ou no header.

**Independent Test**: e2e com duas barbearias A e B: o `PUT` de A não muda as regras de B; o Barbeiro de A recebe 403 nas duas rotas; sem token → 401.

---

## Edge Cases

- IF o corpo traz campos extras (inclusive `barbershopId`) THEN o sistema SHALL ignorá-los.
- WHEN um campo está exatamente num limite (0 e 10.080 para antecedência e cancelamento; 1 e 10 para faltas; 5 e 120 para oferta; 7 e 365 para retorno) THEN o sistema SHALL aceitar o valor, na API, no domínio e no banco.
- WHEN um campo está um passo além do limite (10.085, 0 e 11 para faltas, 4 e 121 para oferta, 6 e 366 para retorno) THEN o sistema SHALL recusar o valor, na API, no domínio e no banco.
- IF um campo vem como string numérica (`"60"`) THEN o sistema SHALL responder 400 no campo, sem converter.
- WHEN o mesmo `PUT` é enviado duas vezes THEN o sistema SHALL terminar no mesmo estado e responder 200 nas duas.
- WHEN o Dono altera as regras THEN as regras de outra barbearia SHALL continuar iguais.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| RUL-01 | P1 Padrões — CA-06.1 barbearia nova nasce com padrões | T4 | Done |
| RUL-02 | P1 Padrões — CA-06.1 `GET` devolve os padrões | - | Pending |
| RUL-03 | P1 Padrões — CA-06.1 migration preenche barbearias existentes | T2 | Done |
| RUL-04 | P1 Alterar — CA-06.2 `PUT` substitui as regras | - | Pending |
| RUL-05 | P1 Alterar — CA-06.2 `GET` devolve o que foi salvo | - | Pending |
| RUL-06 | P1 Alterar — CA-06.2 leitura vigente pelo repositório | T6 | Done |
| RUL-07 | P1 Alterar — CA-06.2 nada além das regras muda | - | Pending |
| RUL-08 | P1 Alterar — CA-06.2 zero aceito em antecedência e cancelamento | - | Pending |
| RUL-09 | P1 Recusar — CA-06.3 negativo | - | Pending |
| RUL-10 | P1 Recusar — CA-06.3 vazio | - | Pending |
| RUL-11 | P1 Recusar — CA-06.3 limites e formato | - | Pending |
| RUL-12 | P1 Recusar — CA-06.3 invariante no domínio | T1 | Done |
| RUL-13 | P1 Recusar — CA-06.3 `CHECK` no banco | T2 | Done |
| RUL-14 | P1 Permissão — Barbeiro 403 | - | Pending |
| RUL-15 | P1 Permissão — sem sessão 401 | - | Pending |
| RUL-16 | P1 Permissão — RN-26 tenant da sessão | - | Pending |

**ID format:** `RUL-NN` (Regras, épico E2). Cada teste cita o `CA-06.x` (ou o `RN`) no nome, conforme o CLAUDE.md.

**Coverage:** 16 total, 0 mapped to tasks, 16 unmapped ⚠️ (o mapeamento sai no `tasks.md`)

---

## Success Criteria

- [ ] Os 3 CAs da US-06 têm pelo menos um teste automatizado cada, com o `CA-06.x` no nome.
- [ ] As 2 rotas novas estão no Swagger com resumo citando a US-06, resposta de sucesso e erros.
- [ ] `npm run lint`, `npm run build`, `npm test` e `npm run test:e2e` passam.
- [ ] Nenhuma regra negativa, vazia ou fora dos limites é gravada, nem pela API nem por `INSERT`/`UPDATE` direto no banco.
