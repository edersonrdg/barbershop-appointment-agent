# US-04: Cadastro de serviços — Specification

**Fonte:** PRD §11 US-04 · RF-33 · RN-04 · PRD §5
**Escopo:** Large (dados persistidos, transição ativo/inativo, auto-relação entre serviços, unicidade no banco, permissão por perfil)
**Decisões de discussão:** [context.md](context.md)

## Problem Statement

A barbearia ainda não tem serviços cadastrados, então o motor de disponibilidade (US-07) não sabe quanto tempo reservar e o bot (US-15, US-17) não sabe o que oferecer nem quanto custa. Esta história dá ao Dono a API para cadastrar os serviços com preço e duração, indicar os adicionais sugeridos de cada um (usados pela US-23) e tirar um serviço de oferta sem apagar o histórico.

## Goals

- [ ] O Dono cria, edita, lista, desativa e reativa serviços com nome, preço em BRL e duração em minutos.
- [ ] Os serviços ativos ficam disponíveis para a agenda e o bot por uma leitura única; os inativos saem dessa leitura.
- [ ] Os adicionais sugeridos de cada serviço ficam gravados, sempre entre serviços da mesma barbearia.
- [ ] Nenhum preço negativo, duração fora da regra ou nome repetido chega ao banco.
- [ ] Só o Dono lê e altera os serviços, sempre do próprio tenant.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Telas do painel (Configurações > Serviços) | Mesma decisão da US-01: só API até existir a história de frontend. O item de DoD "telas em 360 px" segue como pendência registrada. |
| Barbeiros aptos a cada serviço | Decisão da discussão: o vínculo fica só na US-05 (CA-05.1). |
| Exclusão definitiva de serviço | Decisão da discussão: só desativar e reativar. |
| Oferecer o adicional ao cliente e somar as durações | US-23 e US-07 (RN-04). Aqui só se grava a relação. |
| Barbeiro lendo a lista de serviços | PRD §5 não dá ao Barbeiro acesso a serviços; a US-10 abre a leitura quando precisar. Registrado em Deferred Ideas. |
| Descrição, foto ou categoria do serviço | Não estão no RF-33. |
| Agendamentos existentes de um serviço desativado | Ainda não existem agendamentos (US-07/US-10). Ver premissa "Agendamentos existentes". |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Barbeiros aptos | Fora desta história; vínculo gravado na US-05 | Decidido na discussão | y |
| Ciclo de vida | Serviço nunca é excluído; desativar e reativar livremente | Decidido na discussão | y |
| Limites de preço | Inteiro em centavos, de 0 a 1.000.000 (R$ 0,00 a R$ 10.000,00) | Decidido na discussão; CLAUDE.md: dinheiro em centavos inteiros | y |
| Limites de duração | Inteiro de 5 a 480, múltiplo de 5 | Decidido na discussão | y |
| Unicidade do nome | Único na barbearia, sem diferenciar maiúsculas, contando os inativos; garantido também por índice único no banco sobre `(barbershop_id, lower(name))` | Decidido na discussão; o índice cobre duas criações simultâneas | y |
| Regras dos adicionais | Até 5, sem repetir, da mesma barbearia, nunca o próprio serviço, todos ativos quando a relação é salva; desativar um serviço não remove a relação | Decidido na discussão | y |
| Onde vão os adicionais | Campo `suggestedAddOnIds` no payload de criar e editar; editar substitui a lista inteira | Decidido na discussão | y |
| Rotas | `GET /settings/services`, `POST /settings/services`, `PUT /settings/services/:serviceId`, `POST /settings/services/:serviceId/deactivate`, `POST /settings/services/:serviceId/activate`; só Dono | "Configurações > Serviços" no CA-04.1; ações explícitas para a transição de estado | y |
| Formato do serviço na resposta | `{ id, name, priceCents, durationMinutes, active, suggestedAddOnIds }` | Centavos inteiros de ponta a ponta; o painel formata para exibição | y |
| Semântica da edição | `PUT` com o estado completo editável (nome, preço, duração, adicionais); não muda `active`; responde 200 com o serviço salvo | Idempotente; ativar/desativar tem rota própria | y |
| Estado inicial | Serviço criado nasce ativo; `POST` responde 201 com o serviço | CA-04.1: "fica disponível para agendamento" | y |
| Nome | 2 a 60 caracteres após trim; gravado sem espaços nas pontas | Evita vazio e nomes que não cabem numa mensagem do bot | y |
| Ordem da lista | Todos os serviços da barbearia (ativos e inativos), ordenados por nome sem diferenciar maiúsculas | Decidido na discussão (inativo continua na lista) | y |
| "Disponível para agendamento" | Método de leitura que devolve só os serviços ativos da barbearia; é o que a agenda e o bot usarão | Dá forma testável ao CA-04.1 e ao CA-04.3 sem adiantar a US-07 | y |
| Agendamentos existentes | Desativar só troca `active`; não apaga o serviço, a relação de adicionais nem dados de outras tabelas. A garantia de que agendamentos já gravados não mudam fica com a US-07/US-10, que não devem filtrar por `active` ao ler agendamentos existentes | Não há agendamentos antes da US-07/US-10; o que dá para provar agora é que a desativação não apaga nem altera nada além do flag | y |
| Editar preço ou duração | Vale só para novos agendamentos; a US-10/US-17 devem gravar no agendamento o preço e a duração do momento | Não há agendamentos ainda; registrado para as próximas histórias | y |
| Desativar/reativar repetido | Idempotente: desativar um inativo, ou ativar um ativo, responde 200 com o serviço sem mudança | Evita erro em duplo clique | y |
| Serviço inexistente ou de outra barbearia | 404 `{ message: 'Serviço não encontrado.' }`, sem revelar se existe em outro tenant | RN-26 | y |
| Nome repetido | 409 `{ message: 'Já existe um serviço com esse nome.' }` | Mesmo padrão do e-mail repetido (409) | y |
| Adicional inválido | 400 com uma mensagem por caso: "Serviço adicional não encontrado.", "Um serviço não pode ser adicional de si mesmo.", "Os serviços adicionais devem estar ativos." | "O sistema recusa" com motivo claro para o Dono | y |
| Payload malformado | HTTP 400 no formato do `ZodValidationPipe` (`message` + `errors[{ field, message }]`), sem alterar nada | Padrão da borda já usado | y |
| Gravações simultâneas | A última edição vence; cada gravação (serviço + lista de adicionais) é atômica. Nome repetido em criações simultâneas é barrado pelo índice único | Um único Dono por barbearia; sem RN de concorrência para cadastros | y |
| Permissão | Só Dono em todas as rotas (sem `@Roles`, AD-007); Barbeiro recebe 403 | PRD §5: Barbeiro não altera serviços nem preços | y |
| Observabilidade | Só o log de requisição que o `nestjs-pino` já grava; nenhum log nem métrica nova | Nenhuma métrica do PRD §13 depende disto | y |

**Open questions:** none - all resolved or logged above (required before the spec is confirmed).

---

## User Stories

### P1: Criar e listar serviços ⭐ MVP

**User Story**: Como **Dono**, quero cadastrar os serviços com preço e duração, para que o bot e a agenda calculem os horários e informem valores corretos.

**Why P1**: RF-33; sem serviços, não há o que agendar nem duração para reservar (RN-04).

**Acceptance Criteria** (each line is one EARS pattern):

1. **SVC-01 · CA-04.1** — WHEN o Dono envia `POST /settings/services` com nome, `priceCents` e `durationMinutes` válidos THEN o sistema SHALL gravar o serviço ativo na barbearia da sessão e responder 201 com `{ id, name, priceCents, durationMinutes, active: true, suggestedAddOnIds }`.
2. **SVC-02 · CA-04.1** — WHEN o Dono chama `GET /settings/services` THEN o sistema SHALL devolver todos os serviços da barbearia da sessão, ativos e inativos, ordenados por nome sem diferenciar maiúsculas.
3. **SVC-03 · CA-04.1** — WHEN a agenda ou o bot pede os serviços disponíveis para agendamento THEN o sistema SHALL devolver só os serviços ativos da barbearia, com preço e duração.
4. **SVC-04 · CA-04.1** — WHEN o Dono envia `PUT /settings/services/:serviceId` com nome, preço, duração e adicionais válidos THEN o sistema SHALL substituir esses dados, manter o `active` atual e responder 200 com o serviço salvo.
5. **SVC-05 · CA-04.1** — IF já existe na barbearia um serviço, ativo ou inativo, com o mesmo nome sem diferenciar maiúsculas THEN o sistema SHALL responder 409 com a mensagem "Já existe um serviço com esse nome." e não gravar nada.
6. **SVC-06 · CA-04.1** — The system SHALL recusar no banco (índice único sobre barbearia e nome em minúsculas) dois serviços da mesma barbearia com o mesmo nome.

**Independent Test**: e2e: `POST` "Corte" R$ 45,00 30 min → 201 ativo; `GET` lista o serviço; `POST` "corte" → 409; unit: a leitura de disponíveis devolve o serviço.

---

### P1: Adicionais sugeridos ⭐ MVP

**User Story**: Como **Dono**, quero indicar outros serviços como adicionais sugeridos de um serviço, para que o bot possa oferecê-los depois (US-23).

**Why P1**: CA-04.2; a US-23 depende dessa relação gravada.

**Acceptance Criteria**:

1. **SVC-07 · CA-04.2** — WHEN o Dono cria ou edita um serviço com `suggestedAddOnIds` de serviços ativos da mesma barbearia THEN o sistema SHALL gravar a relação e devolvê-la em `suggestedAddOnIds` no serviço e no `GET /settings/services`.
2. **SVC-08 · CA-04.2** — WHEN o Dono edita um serviço com outra lista de `suggestedAddOnIds` (inclusive vazia) THEN o sistema SHALL substituir a lista anterior pela nova.
3. **SVC-09 · CA-04.2** — IF algum `suggestedAddOnIds` não existe ou é de outra barbearia THEN o sistema SHALL responder 400 com a mensagem "Serviço adicional não encontrado." e não gravar nada.
4. **SVC-10 · CA-04.2** — IF a lista de adicionais de um serviço contém o próprio serviço THEN o sistema SHALL responder 400 com a mensagem "Um serviço não pode ser adicional de si mesmo." e não gravar nada.
5. **SVC-11 · CA-04.2** — IF algum `suggestedAddOnIds` aponta para um serviço inativo THEN o sistema SHALL responder 400 com a mensagem "Os serviços adicionais devem estar ativos." e não gravar nada.
6. **SVC-12 · CA-04.2** — IF a lista de adicionais tem mais de 5 itens ou itens repetidos THEN o sistema SHALL responder 400 com o erro no campo `suggestedAddOnIds` e não gravar nada.

**Independent Test**: e2e: criar "Barba", criar "Corte" com `suggestedAddOnIds: [barba]` → 201 com a relação; `GET` devolve a relação; editar "Corte" com a própria id na lista → 400.

---

### P1: Desativar e reativar ⭐ MVP

**User Story**: Como **Dono**, quero desativar um serviço que não ofereço mais sem perder o histórico, e reativá-lo se voltar a oferecer.

**Why P1**: CA-04.3.

**Acceptance Criteria**:

1. **SVC-13 · CA-04.3** — WHEN o Dono chama `POST /settings/services/:serviceId/deactivate` THEN o sistema SHALL marcar o serviço como inativo e responder 200 com o serviço e `active: false`.
2. **SVC-14 · CA-04.3** — WHILE um serviço está inativo, the system SHALL deixar de devolvê-lo na leitura de serviços disponíveis para agendamento e continuar devolvendo-o no `GET /settings/services` com `active: false`.
3. **SVC-15 · CA-04.3** — WHEN um serviço é desativado THEN o sistema SHALL manter o nome, o preço, a duração e as relações de adicionais em que ele aparece (como dono ou como adicional) sem alteração.
4. **SVC-16 · CA-04.3** — WHEN o Dono chama `POST /settings/services/:serviceId/activate` num serviço inativo THEN o sistema SHALL marcá-lo como ativo, voltar a devolvê-lo na leitura de disponíveis e responder 200 com `active: true`.
5. **SVC-17 · CA-04.3** — WHEN o Dono desativa um serviço já inativo, ou ativa um já ativo THEN o sistema SHALL responder 200 com o serviço sem mudança.
6. **SVC-18 · CA-04.3** — IF o `serviceId` de `PUT`, `deactivate` ou `activate` não existe ou é de outra barbearia THEN o sistema SHALL responder 404 com a mensagem "Serviço não encontrado." e não alterar nada.

**Independent Test**: e2e: criar "Sobrancelha", desativar → 200 `active: false`; `GET` ainda lista com `active: false`; unit: a leitura de disponíveis não inclui o serviço; ativar → volta.

---

### P1: Recusar preço e duração inválidos ⭐ MVP

**User Story**: Como **Dono**, quero que o sistema recuse preço negativo ou duração impossível, para não gerar horários e valores errados.

**Why P1**: CA-04.4.

**Acceptance Criteria**:

1. **SVC-19 · CA-04.4** — IF `priceCents` é negativo THEN o sistema SHALL responder 400 com o erro no campo `priceCents` e não gravar nada.
2. **SVC-20 · CA-04.4** — IF `durationMinutes` é zero THEN o sistema SHALL responder 400 com o erro no campo `durationMinutes` e não gravar nada.
3. **SVC-21 · CA-04.4** — IF `priceCents` não é inteiro ou passa de 1.000.000, ou `durationMinutes` não é inteiro, é menor que 5, maior que 480 ou não é múltiplo de 5, ou o nome tem menos de 2 ou mais de 60 caracteres após trim THEN o sistema SHALL responder 400 com o erro no campo correspondente e não gravar nada.
4. **SVC-22 · CA-04.4** — The system SHALL recusar no domínio a criação de um serviço com preço fora de 0 a 1.000.000 centavos ou duração fora de 5 a 480 minutos em múltiplos de 5, com `InvalidValueError`.
5. **SVC-23 · CA-04.4** — The system SHALL recusar no banco (constraint `CHECK`) qualquer linha de serviço com preço fora de 0 a 1.000.000 ou duração fora de 5 a 480 em múltiplos de 5.

**Independent Test**: e2e: `POST` com `priceCents: -1` → 400 no campo `priceCents`; `POST` com `durationMinutes: 0` → 400 no campo `durationMinutes`; `GET` não mostra nenhum serviço novo.

---

### P1: Permissão e isolamento ⭐ MVP

**User Story**: Como **Dono**, quero que só eu altere os serviços e preços da minha barbearia.

**Why P1**: PRD §5 (Barbeiro não altera serviços nem preços) e RN-26.

**Acceptance Criteria**:

1. **SVC-24** — IF um usuário com perfil Barbeiro chama qualquer rota de `/settings/services` THEN o sistema SHALL responder 403 `{ message: 'Acesso negado.' }` e não alterar nada.
2. **SVC-25** — IF a requisição chega sem sessão válida THEN o sistema SHALL responder 401.
3. **SVC-26 · RN-26** — The system SHALL ler e gravar só serviços da barbearia da sessão, ignorando qualquer `barbershopId` no corpo, na query ou no header.

**Independent Test**: e2e com duas barbearias A e B: o `GET` de A não lista serviços de B; o `PUT` de A no serviço de B → 404; o barbeiro de A recebe 403 em todas as rotas.

---

## Edge Cases

- IF o corpo traz campos extras (inclusive `active` ou `barbershopId`) THEN o sistema SHALL ignorá-los.
- WHEN o nome vem com espaços nas pontas THEN o sistema SHALL gravá-lo sem esses espaços e comparar a unicidade já sem eles.
- WHEN o Dono edita um serviço mantendo o mesmo nome (ou mudando só maiúsculas) THEN o sistema SHALL aceitar, sem acusar conflito com ele mesmo.
- WHEN `priceCents` é 0 THEN o sistema SHALL aceitar o serviço.
- WHEN `durationMinutes` é 5 ou 480 THEN o sistema SHALL aceitar o serviço.
- WHEN `suggestedAddOnIds` é omitido na criação THEN o sistema SHALL gravar o serviço sem adicionais (`[]`).
- WHEN a barbearia não tem nenhum serviço THEN `GET /settings/services` SHALL devolver lista vazia.
- WHEN o mesmo `PUT` é enviado duas vezes THEN o sistema SHALL terminar no mesmo estado e responder 200 nas duas.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| SVC-01 | P1 Criar — CA-04.1 `POST` cria ativo | T3, T5, T6, T12 | In Progress |
| SVC-02 | P1 Criar — CA-04.1 `GET` lista | T5, T9, T12 | In Progress |
| SVC-03 | P1 Criar — CA-04.1 leitura de disponíveis | T5, T10 | In Progress |
| SVC-04 | P1 Criar — CA-04.1 `PUT` edita | T3, T7, T13 | In Progress |
| SVC-05 | P1 Criar — CA-04.1 nome repetido 409 | T5, T6, T7, T12, T13 | In Progress |
| SVC-06 | P1 Criar — CA-04.1 índice único no banco | T4, T5 | In Progress |
| SVC-07 | P1 Adicionais — CA-04.2 grava a relação | T3, T5, T6, T12 | In Progress |
| SVC-08 | P1 Adicionais — CA-04.2 substitui a lista | T5, T7, T13 | In Progress |
| SVC-09 | P1 Adicionais — CA-04.2 adicional inexistente/outro tenant | T3, T6, T7, T12 | In Progress |
| SVC-10 | P1 Adicionais — CA-04.2 adicional de si mesmo | T3, T4, T7, T13 | In Progress |
| SVC-11 | P1 Adicionais — CA-04.2 adicional inativo | T3, T6, T7, T12 | In Progress |
| SVC-12 | P1 Adicionais — CA-04.2 mais de 5 ou repetidos | T11, T12 | In Progress |
| SVC-13 | P1 Desativar — CA-04.3 desativa | T3, T8, T14 | In Progress |
| SVC-14 | P1 Desativar — CA-04.3 some dos disponíveis, fica na lista | T5, T9, T10, T14 | In Progress |
| SVC-15 | P1 Desativar — CA-04.3 nada além do flag muda | T3, T5, T8, T14 | In Progress |
| SVC-16 | P1 Desativar — CA-04.3 reativa | T3, T8, T10, T14 | In Progress |
| SVC-17 | P1 Desativar — CA-04.3 idempotente | T3, T8, T14 | In Progress |
| SVC-18 | P1 Desativar — CA-04.3 serviço inexistente 404 | T7, T8, T13, T14 | In Progress |
| SVC-19 | P1 Recusar — CA-04.4 preço negativo | T1, T11, T12 | In Progress |
| SVC-20 | P1 Recusar — CA-04.4 duração zero | T2, T11, T12 | In Progress |
| SVC-21 | P1 Recusar — CA-04.4 limites e formato | T1, T2, T11, T12 | In Progress |
| SVC-22 | P1 Recusar — CA-04.4 invariante no domínio | T1, T2, T3, T6 | In Progress |
| SVC-23 | P1 Recusar — CA-04.4 `CHECK` no banco | T4 | In Progress |
| SVC-24 | P1 Permissão — Barbeiro 403 | T12, T13, T14 | In Progress |
| SVC-25 | P1 Permissão — sem sessão 401 | T12, T14 | In Progress |
| SVC-26 | P1 Permissão — RN-26 tenant da sessão | T5, T6, T7, T8, T9, T10, T12, T13 | In Progress |

**ID format:** `SVC-NN` (Serviços, épico E2). Cada teste cita o `CA-04.x` (ou o `RN`) no nome, conforme o CLAUDE.md.

**Coverage:** 26 total, 26 mapped to tasks, 0 unmapped

---

## Success Criteria

- [ ] Os 4 CAs da US-04 têm pelo menos um teste automatizado cada, com o `CA-04.x` no nome.
- [ ] As 5 rotas novas estão no Swagger com resumo citando a US-04, resposta de sucesso e erros de domínio.
- [ ] `npm run lint`, `npm run build`, `npm test` e `npm run test:e2e` passam.
- [ ] Nenhum preço negativo, duração inválida ou nome repetido é gravado, nem pela API nem por `INSERT` direto no banco.
