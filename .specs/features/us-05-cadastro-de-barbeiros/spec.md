# US-05: Cadastro de barbeiros e jornada — Specification

**Fonte:** PRD §11 US-05 · RF-34 (e "barbeiros aptos" do RF-33) · RN-05 · RN-26 · PRD §5
**Escopo:** Large (dados persistidos, transição ativo/inativo, relações com serviços e usuários, unicidade no banco, aviso derivado de outra configuração, permissão por perfil)
**Decisões de discussão:** [context.md](context.md)

## Problem Statement

A barbearia já tem horário de funcionamento (US-03) e serviços (US-04), mas ainda não sabe quem atende, o que cada profissional faz nem quando trabalha. Sem isso, o motor de disponibilidade (US-07) não tem jornada para cruzar com o funcionamento e o bot não sabe quais barbeiros estão aptos a cada serviço (RF-33, RN-06). Esta história dá ao Dono a API para cadastrar os barbeiros com serviços e jornada, vincular cada um a um usuário do painel e ser avisado quando a jornada sai do horário da barbearia.

## Goals

- [ ] O Dono cria, edita, lista, desativa e reativa barbeiros com nome, serviços realizados e jornada semanal.
- [ ] Os barbeiros ativos, com serviços e jornada, ficam disponíveis para a agenda por uma leitura única.
- [ ] Cada barbeiro pode ser vinculado a no máximo um usuário do painel, e a agenda consegue achar o barbeiro de um usuário.
- [ ] O Dono é avisado, sem bloqueio, quando a jornada sai do horário de funcionamento.
- [ ] Só o Dono lê e altera os barbeiros, sempre do próprio tenant.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Telas do painel (Configurações > Barbeiros) | Mesma decisão da US-01: só API até existir a história de frontend. O item de DoD "telas em 360 px" segue como pendência registrada. |
| Exibir a agenda do barbeiro ao usuário vinculado | US-08 (RF-24). Aqui só se grava o vínculo e se oferece a leitura "barbeiro deste usuário". |
| Recortar a jornada pelo funcionamento e calcular horários livres | US-07 (RN-05). Aqui só se avisa o Dono. |
| Folgas, férias e bloqueios pontuais | US-09. |
| Exclusão definitiva de barbeiro | Decisão da discussão: só desativar e reativar. |
| Barbeiro lendo ou editando o próprio cadastro | PRD §5 não dá ao Barbeiro acesso a configurações. Registrado em Deferred Ideas. |
| Foto, telefone ou descrição do barbeiro | Não estão no RF-34. |
| Agendamentos existentes de um barbeiro desativado | Ainda não existem agendamentos (US-07/US-10). Ver premissa "Agendamentos existentes". |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Barbeiro × usuário | Cadastro próprio (`barbers`), separado de `users`; vínculo opcional e 1:1 com qualquer usuário da barbearia (Dono ou Barbeiro) | Decidido na discussão | y |
| Formato da jornada | Objeto `workingHours` com as chaves `monday` … `sunday`, todas obrigatórias; cada dia é `null` (folga) ou `{ startsAt, endsAt, break }`, com `break` opcional `{ startsAt, endsAt }` | Decidido na discussão (igual ao funcionamento da US-03) | y |
| Regra da jornada | `HH:mm` de `00:00` a `23:59`; `startsAt < break.startsAt < break.endsAt < endsAt` (desigualdades estritas); sem virar a meia-noite | Mesma regra do funcionamento (US-03), com o mesmo value object de domínio | y |
| Jornada toda de folga | Aceita; o barbeiro fica cadastrado, mas sem nenhum período de trabalho | Nenhum RF/CA exige dia mínimo; afastamento pode ser folga na jornada ou desativação | y |
| Ciclo de vida | Nunca exclui; desativar e reativar livremente; criar nasce ativo | Decidido na discussão | y |
| Serviços realizados | Campo `serviceIds`, de 1 a 50 itens sem repetir, todos ativos e da mesma barbearia no momento em que o cadastro é salvo; editar substitui a lista inteira; desativar um serviço depois não remove o vínculo | Decidido na discussão (pelo menos 1, todos ativos); 50 é um teto de payload acima do cadastro de qualquer barbearia | y |
| "Barbeiros aptos" (RF-33) | Lidos desta mesma relação barbeiro → serviços; não há campo de barbeiros no serviço | Decisão da US-04 (fonte única) | y |
| Nome | 2 a 60 caracteres após trim, gravado sem espaços nas pontas; único na barbearia sem diferenciar maiúsculas, contando os inativos; garantido também por índice único sobre `(barbershop_id, lower(name))` | O bot identifica o barbeiro pelo nome ("com o João", RF-01); o Dono reativa em vez de duplicar | y |
| Vínculo com usuário | Campo `userId` (UUID ou `null`) no payload de criar e editar; editar substitui (`null` desvincula); o usuário precisa existir na mesma barbearia; um usuário só pode estar em um barbeiro, garantido também por índice único sobre `user_id` | Decidido na discussão (1:1 opcional) | y |
| Vínculo com barbeiro inativo | Desativar não desfaz o vínculo; o usuário segue vinculado a esse barbeiro e não pode ser vinculado a outro até ser desvinculado | Desativar só troca o flag (mesma regra dos serviços) | y |
| Usuário removido (US-02) | Remover o usuário Barbeiro desfaz o vínculo (`user_id` vira `null`, FK `ON DELETE SET NULL`) e mantém o cadastro do barbeiro com serviços e jornada | O profissional e seu histórico continuam; só o acesso ao painel sai | y |
| Aviso do CA-05.3 | `POST` e `PUT` gravam mesmo com a jornada fora do funcionamento e devolvem `warnings: [{ weekday, message }]`, um item por dia em que algum trecho da jornada cai fora dos períodos abertos da barbearia (antes da abertura, depois do fechamento, no intervalo da barbearia ou em dia fechado); `warnings: []` quando tudo está dentro | CA-05.3 pede aviso, não recusa | y |
| Texto do aviso | Dia fechado: "{Dia}: a barbearia não abre neste dia, então a jornada não estará disponível." Demais casos: "{Dia}: só o trecho da jornada dentro do horário de funcionamento estará disponível." | Diz ao Dono onde está a diferença e qual o efeito | y |
| Quando o aviso é calculado | Só na resposta de `POST` e `PUT`, contra o funcionamento salvo naquele momento; o `GET` não traz `warnings`; mudar o funcionamento depois não gera aviso retroativo | CA-05.3 fala do momento em que o Dono salva a jornada | y |
| Barbearia que nunca salvou o funcionamento | Todos os dias estão fechados (padrão da US-03), então cada dia de trabalho gera o aviso de dia fechado | Consequência direta da regra do aviso | y |
| Rotas | `GET /settings/barbers`, `POST /settings/barbers`, `PUT /settings/barbers/:barberId`, `POST /settings/barbers/:barberId/deactivate`, `POST /settings/barbers/:barberId/activate`; só Dono | "Configurações > Barbeiros" no CA-05.1; mesmo padrão da US-04 | y |
| Formato do barbeiro na resposta | `{ id, name, active, userId, serviceIds, workingHours }`, com `serviceIds` na ordem enviada; `POST` e `PUT` acrescentam `warnings` | Espelha o payload; o painel resolve nomes de serviço e usuário com as listas que já existem | y |
| Semântica da edição | `PUT` com o estado completo editável (nome, `userId`, `serviceIds`, `workingHours`); não muda `active`; responde 200 | Idempotente; ativar/desativar tem rota própria | y |
| Ordem da lista | Todos os barbeiros da barbearia (ativos e inativos), ordenados por nome sem diferenciar maiúsculas | Mesmo padrão dos serviços | y |
| "Disponível na agenda" (CA-05.1) | Método de leitura que devolve só os barbeiros ativos da barbearia, com serviços e jornada; é o que a agenda e o motor usarão | Dá forma testável ao CA-05.1 sem adiantar a US-07/US-08 | y |
| "Passa a ver a agenda" (CA-05.2) | Método de leitura que devolve o barbeiro vinculado a um usuário da barbearia (ou nenhum); a US-08 o usa para filtrar a agenda do Barbeiro | A agenda é a US-08; o que dá para provar agora é que o vínculo é achado pelo usuário | y |
| Agendamentos existentes | Desativar só troca `active`; não apaga serviços, jornada nem vínculo. A garantia de que agendamentos já gravados não mudam fica com a US-07/US-10 | Não há agendamentos antes da US-07/US-10 | y |
| Desativar/reativar repetido | Idempotente: responde 200 com o barbeiro sem mudança | Evita erro em duplo clique | y |
| Barbeiro inexistente ou de outra barbearia | 404 `{ message: 'Barbeiro não encontrado.' }`, sem revelar se existe em outro tenant | RN-26 | y |
| Nome repetido | 409 `{ message: 'Já existe um barbeiro com esse nome.' }` | Mesmo padrão do serviço repetido | y |
| Usuário já vinculado | 409 `{ message: 'Esse usuário já está vinculado a outro barbeiro.' }` | Conflito com um estado existente | y |
| Usuário inválido | 400 `{ message: 'Usuário não encontrado.' }` quando o `userId` não existe ou é de outra barbearia | Mesmo padrão do adicional inválido da US-04; não revela outro tenant | y |
| Serviço inválido | 400 com uma mensagem por caso: "Serviço não encontrado." (inexistente ou de outra barbearia) e "Os serviços realizados devem estar ativos." | "Recusa com motivo claro" para o Dono | y |
| Jornada incoerente | 400 `{ message }` com o dia em português, ex.: "Segunda-feira: o fim da jornada deve ser depois do início." | Mesmo padrão do funcionamento (US-03) | y |
| Payload malformado | HTTP 400 no formato do `ZodValidationPipe` (`message` + `errors[{ field, message }]`), sem alterar nada | Padrão da borda já usado | y |
| Gravações simultâneas | A última edição vence; cada gravação (barbeiro + serviços + jornada) é atômica. Nome repetido e usuário já vinculado em gravações simultâneas são barrados pelos índices únicos | Um único Dono por barbearia; sem RN de concorrência para cadastros | y |
| Permissão | Só Dono em todas as rotas (sem `@Roles`, AD-007); Barbeiro recebe 403 | PRD §5: Barbeiro não altera configurações | y |
| Observabilidade | Só o log de requisição que o `nestjs-pino` já grava; nenhum log nem métrica nova | Nenhuma métrica do PRD §13 depende disto | y |

**Open questions:** none - all resolved or logged above (required before the spec is confirmed).

---

## User Stories

### P1: Cadastrar e listar barbeiros ⭐ MVP

**User Story**: Como **Dono**, quero cadastrar cada barbeiro com os serviços que realiza e sua jornada semanal, para que só sejam oferecidos horários reais de cada profissional.

**Why P1**: RF-34; sem barbeiros não há agenda nem motor de disponibilidade (US-07).

**Acceptance Criteria** (each line is one EARS pattern):

1. **BRB-01 · CA-05.1** — WHEN o Dono envia `POST /settings/barbers` com nome, `serviceIds`, `workingHours` e `userId` válidos THEN o sistema SHALL gravar o barbeiro ativo na barbearia da sessão e responder 201 com `{ id, name, active: true, userId, serviceIds, workingHours, warnings }`.
2. **BRB-02 · CA-05.1** — WHEN o Dono chama `GET /settings/barbers` THEN o sistema SHALL devolver todos os barbeiros da barbearia da sessão, ativos e inativos, com serviços e jornada, ordenados por nome sem diferenciar maiúsculas.
3. **BRB-03 · CA-05.1** — WHEN a agenda pede os barbeiros disponíveis THEN o sistema SHALL devolver só os barbeiros ativos da barbearia, cada um com `serviceIds` e jornada.
4. **BRB-04 · CA-05.1** — WHEN o Dono envia `PUT /settings/barbers/:barberId` com nome, `userId`, `serviceIds` e `workingHours` válidos THEN o sistema SHALL substituir esses dados (a lista de serviços e os 7 dias da jornada inteiros), manter o `active` atual e responder 200 com o barbeiro salvo e `warnings`.
5. **BRB-05 · CA-05.1** — IF já existe na barbearia um barbeiro, ativo ou inativo, com o mesmo nome sem diferenciar maiúsculas THEN o sistema SHALL responder 409 com a mensagem "Já existe um barbeiro com esse nome." e não gravar nada.
6. **BRB-06 · CA-05.1** — The system SHALL recusar no banco (índice único sobre barbearia e nome em minúsculas) dois barbeiros da mesma barbearia com o mesmo nome.

**Independent Test**: e2e: criar o serviço "Corte"; `POST` "João" com `serviceIds: [corte]` e jornada de segunda a sexta 09:00–18:00 com intervalo 12:00–13:00 → 201 ativo; `GET` lista o barbeiro com a jornada; `POST` "joão" → 409; unit: a leitura de disponíveis devolve o barbeiro.

---

### P1: Serviços realizados ⭐ MVP

**User Story**: Como **Dono**, quero indicar os serviços que cada barbeiro realiza, para que o bot só ofereça um serviço com quem sabe fazê-lo.

**Why P1**: CA-05.1 e "barbeiros aptos" do RF-33 (RN-06 depende disto).

**Acceptance Criteria**:

1. **BRB-07 · CA-05.1** — WHEN o Dono cria ou edita um barbeiro com `serviceIds` de serviços ativos da mesma barbearia THEN o sistema SHALL gravar a relação e devolvê-la em `serviceIds` no barbeiro e no `GET /settings/barbers`.
2. **BRB-08 · CA-05.1** — IF `serviceIds` está vazio, tem mais de 50 itens ou itens repetidos THEN o sistema SHALL responder 400 com o erro no campo `serviceIds` e não gravar nada.
3. **BRB-09 · CA-05.1** — IF algum `serviceIds` não existe ou é de outra barbearia THEN o sistema SHALL responder 400 com a mensagem "Serviço não encontrado." e não gravar nada.
4. **BRB-10 · CA-05.1** — IF algum `serviceIds` aponta para um serviço inativo THEN o sistema SHALL responder 400 com a mensagem "Os serviços realizados devem estar ativos." e não gravar nada.
5. **BRB-11 · RN-26** — The system SHALL recusar no banco o vínculo de um barbeiro com um serviço de outra barbearia.

**Independent Test**: e2e: criar "Corte" e "Barba", desativar "Barba"; `POST` com `serviceIds: [barba]` → 400 "Os serviços realizados devem estar ativos."; `POST` com `serviceIds: []` → 400 no campo `serviceIds`; `POST` com o serviço de outra barbearia → 400 "Serviço não encontrado.".

---

### P1: Jornada semanal e aviso de funcionamento ⭐ MVP

**User Story**: Como **Dono**, quero registrar a jornada de cada barbeiro por dia da semana e ser avisado quando ela sai do horário da barbearia, para saber quais horários serão de fato oferecidos.

**Why P1**: CA-05.1 (jornada) e CA-05.3 (aviso); RN-05 usa a jornada.

**Acceptance Criteria**:

1. **BRB-12 · CA-05.1** — WHEN o Dono salva a jornada THEN o sistema SHALL gravar os 7 dias, com `null` nos dias de folga e `{ startsAt, endsAt, break }` nos dias de trabalho, e devolvê-los no mesmo formato.
2. **BRB-13 · CA-05.1** — IF o fim de um dia da jornada não é depois do início, ou o intervalo não está estritamente dentro da jornada com o fim depois do início THEN o sistema SHALL responder 400 com a mensagem do dia em português e não gravar nada.
3. **BRB-14 · CA-05.1** — IF `workingHours` não tem os 7 dias, ou algum horário não está no formato `HH:mm` entre 00:00 e 23:59 THEN o sistema SHALL responder 400 com o erro no campo correspondente e não gravar nada.
4. **BRB-15 · CA-05.3** — WHEN o Dono salva uma jornada em que algum trecho de um dia cai antes da abertura, depois do fechamento ou no intervalo da barbearia THEN o sistema SHALL gravar a jornada e devolver em `warnings` um item `{ weekday, message }` com "{Dia}: só o trecho da jornada dentro do horário de funcionamento estará disponível.".
5. **BRB-16 · CA-05.3** — WHEN o Dono salva uma jornada com trabalho num dia em que a barbearia está fechada THEN o sistema SHALL gravar a jornada e devolver em `warnings` um item `{ weekday, message }` com "{Dia}: a barbearia não abre neste dia, então a jornada não estará disponível.".
6. **BRB-17 · CA-05.3** — WHEN toda a jornada está dentro dos períodos abertos da barbearia THEN o sistema SHALL responder com `warnings: []`.
7. **BRB-18 · CA-05.1** — The system SHALL recusar no banco (constraint `CHECK`) qualquer dia de jornada com o fim antes do início ou intervalo fora da jornada.

**Independent Test**: e2e: barbearia aberta de segunda a sábado 09:00–19:00 com intervalo 12:00–13:00 e fechada no domingo; `POST` barbeiro com segunda 08:00–18:00 e domingo 09:00–13:00 → 201 com dois avisos (segunda: só o trecho dentro; domingo: não abre); jornada toda dentro → `warnings: []`; `POST` com segunda 18:00–09:00 → 400 "Segunda-feira: o fim da jornada deve ser depois do início.".

---

### P1: Vínculo com usuário do painel ⭐ MVP

**User Story**: Como **Dono**, quero vincular um barbeiro a um usuário do painel, para que esse usuário passe a ver a agenda desse barbeiro.

**Why P1**: CA-05.2; a US-08 filtra a agenda do Barbeiro por este vínculo.

**Acceptance Criteria**:

1. **BRB-19 · CA-05.2** — WHEN o Dono cria ou edita um barbeiro com o `userId` de um usuário da mesma barbearia (Dono ou Barbeiro) THEN o sistema SHALL gravar o vínculo e devolvê-lo em `userId`.
2. **BRB-20 · CA-05.2** — WHEN a agenda pede o barbeiro vinculado a um usuário da barbearia THEN o sistema SHALL devolver esse barbeiro, ou nenhum se o usuário não estiver vinculado.
3. **BRB-21 · CA-05.2** — WHEN o Dono edita um barbeiro com `userId: null` THEN o sistema SHALL desfazer o vínculo, e a leitura do barbeiro daquele usuário SHALL não devolver nenhum.
4. **BRB-22 · CA-05.2** — IF o `userId` não existe ou é de outra barbearia THEN o sistema SHALL responder 400 com a mensagem "Usuário não encontrado." e não gravar nada.
5. **BRB-23 · CA-05.2** — IF o usuário já está vinculado a outro barbeiro, ativo ou inativo THEN o sistema SHALL responder 409 com a mensagem "Esse usuário já está vinculado a outro barbeiro." e não gravar nada.
6. **BRB-24 · CA-05.2** — The system SHALL recusar no banco (índice único sobre `user_id`) dois barbeiros vinculados ao mesmo usuário, e (FK composta com a barbearia) um vínculo com usuário de outra barbearia.
7. **BRB-25 · CA-05.2** — WHEN o Dono remove o usuário Barbeiro vinculado (US-02) THEN o sistema SHALL manter o barbeiro com nome, serviços e jornada e deixar `userId` como `null`.

**Independent Test**: e2e: convidar e aceitar o barbeiro "joao@x.com"; `POST` barbeiro "João" com o `userId` dele → 201; unit: a leitura por usuário devolve "João"; `POST` "Pedro" com o mesmo `userId` → 409; `DELETE` do usuário → `GET /settings/barbers` mostra "João" com `userId: null`.

---

### P1: Desativar e reativar ⭐ MVP

**User Story**: Como **Dono**, quero desativar um barbeiro que saiu da barbearia sem perder o histórico, e reativá-lo se ele voltar.

**Why P1**: Decisão da discussão (ciclo de vida); sem isso, um barbeiro que saiu continuaria recebendo agendamentos.

**Acceptance Criteria**:

1. **BRB-26** — WHEN o Dono chama `POST /settings/barbers/:barberId/deactivate` THEN o sistema SHALL marcar o barbeiro como inativo e responder 200 com o barbeiro e `active: false`.
2. **BRB-27** — WHILE um barbeiro está inativo, the system SHALL deixar de devolvê-lo na leitura de barbeiros disponíveis e continuar devolvendo-o no `GET /settings/barbers` com `active: false`.
3. **BRB-28** — WHEN um barbeiro é desativado THEN o sistema SHALL manter nome, vínculo com usuário, serviços e jornada sem alteração.
4. **BRB-29** — WHEN o Dono chama `POST /settings/barbers/:barberId/activate` num barbeiro inativo THEN o sistema SHALL marcá-lo como ativo, voltar a devolvê-lo na leitura de disponíveis e responder 200 com `active: true`.
5. **BRB-30** — WHEN o Dono desativa um barbeiro já inativo, ou ativa um já ativo THEN o sistema SHALL responder 200 com o barbeiro sem mudança.
6. **BRB-31** — IF o `barberId` de `PUT`, `deactivate` ou `activate` não existe ou é de outra barbearia THEN o sistema SHALL responder 404 com a mensagem "Barbeiro não encontrado." e não alterar nada.

**Independent Test**: e2e: criar "João", desativar → 200 `active: false`; `GET` ainda lista com `active: false`; unit: a leitura de disponíveis não inclui o barbeiro; ativar → volta.

---

### P1: Permissão e isolamento ⭐ MVP

**User Story**: Como **Dono**, quero que só eu altere os barbeiros da minha barbearia.

**Why P1**: PRD §5 (Barbeiro não altera configurações) e RN-26.

**Acceptance Criteria**:

1. **BRB-32** — IF um usuário com perfil Barbeiro chama qualquer rota de `/settings/barbers` THEN o sistema SHALL responder 403 `{ message: 'Acesso negado.' }` e não alterar nada.
2. **BRB-33** — IF a requisição chega sem sessão válida THEN o sistema SHALL responder 401.
3. **BRB-34 · RN-26** — The system SHALL ler e gravar só barbeiros, serviços, usuários e horário de funcionamento da barbearia da sessão, ignorando qualquer `barbershopId` no corpo, na query ou no header.

**Independent Test**: e2e com duas barbearias A e B: o `GET` de A não lista barbeiros de B; o `PUT` de A no barbeiro de B → 404; o barbeiro de A recebe 403 em todas as rotas.

---

## Edge Cases

- IF o corpo traz campos extras (inclusive `active` ou `barbershopId`) THEN o sistema SHALL ignorá-los.
- WHEN o nome vem com espaços nas pontas THEN o sistema SHALL gravá-lo sem esses espaços e comparar a unicidade já sem eles.
- WHEN o Dono edita um barbeiro mantendo o mesmo nome (ou mudando só maiúsculas) e o mesmo `userId` THEN o sistema SHALL aceitar, sem acusar conflito com ele mesmo.
- WHEN `userId` é omitido na criação THEN o sistema SHALL gravar o barbeiro sem vínculo (`userId: null`).
- WHEN o `userId` é o do próprio Dono THEN o sistema SHALL aceitar o vínculo.
- WHEN os 7 dias da jornada são `null` THEN o sistema SHALL gravar o barbeiro e responder com `warnings: []`.
- WHEN a jornada coincide exatamente com a abertura e o fechamento da barbearia THEN o sistema SHALL responder com `warnings: []`.
- WHEN a barbearia tem intervalo e a jornada do barbeiro não tem THEN o sistema SHALL avisar naquele dia (o trecho no intervalo da barbearia fica de fora).
- WHEN a barbearia não tem nenhum barbeiro THEN `GET /settings/barbers` SHALL devolver lista vazia.
- WHEN o mesmo `PUT` é enviado duas vezes THEN o sistema SHALL terminar no mesmo estado e responder 200 nas duas.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| BRB-01 | P1 Cadastrar — CA-05.1 `POST` cria ativo | Design | Pending |
| BRB-02 | P1 Cadastrar — CA-05.1 `GET` lista | Design | Pending |
| BRB-03 | P1 Cadastrar — CA-05.1 leitura de disponíveis | Design | Pending |
| BRB-04 | P1 Cadastrar — CA-05.1 `PUT` edita | Design | Pending |
| BRB-05 | P1 Cadastrar — CA-05.1 nome repetido 409 | Design | Pending |
| BRB-06 | P1 Cadastrar — CA-05.1 índice único do nome | Design | Pending |
| BRB-07 | P1 Serviços — CA-05.1 grava a relação | Design | Pending |
| BRB-08 | P1 Serviços — CA-05.1 vazio, mais de 50 ou repetidos | Design | Pending |
| BRB-09 | P1 Serviços — CA-05.1 serviço inexistente/outro tenant | Design | Pending |
| BRB-10 | P1 Serviços — CA-05.1 serviço inativo | Design | Pending |
| BRB-11 | P1 Serviços — RN-26 tenant da relação no banco | Design | Pending |
| BRB-12 | P1 Jornada — CA-05.1 grava os 7 dias | Design | Pending |
| BRB-13 | P1 Jornada — CA-05.1 jornada incoerente | Design | Pending |
| BRB-14 | P1 Jornada — CA-05.1 payload malformado | Design | Pending |
| BRB-15 | P1 Jornada — CA-05.3 aviso de trecho fora | Design | Pending |
| BRB-16 | P1 Jornada — CA-05.3 aviso de dia fechado | Design | Pending |
| BRB-17 | P1 Jornada — CA-05.3 sem aviso | Design | Pending |
| BRB-18 | P1 Jornada — CA-05.1 `CHECK` no banco | Design | Pending |
| BRB-19 | P1 Vínculo — CA-05.2 grava o vínculo | Design | Pending |
| BRB-20 | P1 Vínculo — CA-05.2 barbeiro do usuário | Design | Pending |
| BRB-21 | P1 Vínculo — CA-05.2 desvincular | Design | Pending |
| BRB-22 | P1 Vínculo — CA-05.2 usuário inexistente/outro tenant | Design | Pending |
| BRB-23 | P1 Vínculo — CA-05.2 usuário já vinculado 409 | Design | Pending |
| BRB-24 | P1 Vínculo — CA-05.2 índice único e FK composta | Design | Pending |
| BRB-25 | P1 Vínculo — CA-05.2 remoção do usuário desvincula | Design | Pending |
| BRB-26 | P1 Desativar — desativa | Design | Pending |
| BRB-27 | P1 Desativar — some dos disponíveis, fica na lista | Design | Pending |
| BRB-28 | P1 Desativar — nada além do flag muda | Design | Pending |
| BRB-29 | P1 Desativar — reativa | Design | Pending |
| BRB-30 | P1 Desativar — idempotente | Design | Pending |
| BRB-31 | P1 Desativar — barbeiro inexistente 404 | Design | Pending |
| BRB-32 | P1 Permissão — Barbeiro 403 | Design | Pending |
| BRB-33 | P1 Permissão — sem sessão 401 | Design | Pending |
| BRB-34 | P1 Permissão — RN-26 tenant da sessão | Design | Pending |

**ID format:** `BRB-NN` (Barbeiros, épico E2). Cada teste cita o `CA-05.x` (ou o `RN`) no nome, conforme o CLAUDE.md.

**Coverage:** 34 total, 0 mapped to tasks, 34 unmapped ⚠️ (mapeados na fase Tasks)

---

## Success Criteria

- [ ] Os 3 CAs da US-05 têm pelo menos um teste automatizado cada, com o `CA-05.x` no nome.
- [ ] As 5 rotas novas estão no Swagger com resumo citando a US-05, resposta de sucesso e erros de domínio.
- [ ] `npm run lint`, `npm run build`, `npm test` e `npm run test:e2e` passam.
- [ ] Nenhum nome repetido, vínculo duplicado, serviço de outra barbearia ou jornada incoerente é gravado, nem pela API nem por `INSERT` direto no banco.
