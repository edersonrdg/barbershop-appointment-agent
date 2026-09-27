# US-01: Cadastro da barbearia e acesso do Dono — Specification

**Fonte:** PRD §11 US-01 · RF-40 · RN-24, RN-26 · PRD §5 · RNF-06
**Escopo:** Large (tenant, usuário, autenticação, recuperação de senha por e-mail, isolamento multi-tenant)
**Decisões de discussão:** [context.md](context.md)

## Problem Statement

O Dono precisa criar a conta da barbearia sozinho e começar a usar o produto sem falar com ninguém e sem informar pagamento. Sem essa história não existe tenant, usuário nem sessão, e nenhuma outra história tem onde se apoiar. Ela é a fundação do isolamento entre barbearias (RN-26), que toda história seguinte herda.

## Goals

- [ ] Um visitante cria barbearia + usuário Dono em uma única chamada e sai dela autenticado.
- [ ] Toda barbearia nova nasce em teste gratuito de 14 dias, sem nenhum dado de pagamento.
- [ ] O Dono entra com e-mail e senha e recupera o acesso por e-mail quando esquece a senha.
- [ ] O tenant da requisição vem sempre da sessão autenticada, nunca do payload ou da URL.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Telas do painel (cadastro, login, recuperação) | Decisão da discussão: US-01 entrega só a API. O frontend fica para uma decisão/história própria; o item de DoD "telas em 360 px" fica registrado como pendência. |
| Convite de barbeiros, perfil Barbeiro em uso | US-02. Aqui entra só a coluna `role` com o valor `owner`. |
| Dados da barbearia além do nome (endereço, horário, fuso editável) | US-03. Aqui entra só a coluna de fuso com padrão `America/Sao_Paulo` (mínimo estrutural, RNF-04). |
| Cobrança, aviso de fim de teste, suspensão | US-20 e US-21. Aqui entram só as colunas de status/fim do teste. |
| Verificação de e-mail no cadastro | Não está em RF/RN/CA. |
| Rate limiting / bloqueio por tentativas de login | Não está em RF/RN/CA. Registrado como risco em Deferred Ideas do context.md. |
| Revogar sessões ativas após troca de senha | Não está em RF/RN/CA. Registrado em Deferred Ideas. |
| Logout no servidor, refresh token, "lembrar de mim" | Não está em RF/RN/CA; a sessão expira sozinha (ver premissas). |
| Troca de senha estando logado, edição de perfil | Não está em RF/RN/CA. |
| Provedor de e-mail de produção | Decisão da discussão: adaptador SMTP genérico; o provedor vira configuração depois. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Onde fica o painel | Só API nesta história; "entra no painel" = a resposta do cadastro já traz a sessão autenticada | Decidido na discussão | y |
| Envio de e-mail | Port `EmailSender` em `usecases/`, adaptador SMTP (nodemailer) em `infrastructure/external/`, Mailpit no docker compose; nos testes, fake | Decidido na discussão | y |
| Escopo de unicidade do e-mail | Único em toda a plataforma (não por barbearia), comparado sem diferenciar maiúsculas/minúsculas e sem espaços nas pontas | O CA-01.3 fala de "e-mail já cadastrado" sem citar barbearia, e o login por e-mail precisa resolver um único usuário | y |
| Senha válida | 8 a 72 caracteres, sem outras regras de composição | Mínimo comum; 72 é o limite de bytes do bcrypt e mantém a opção de algoritmo em aberto no design | y |
| Telefone válido | Celular ou fixo brasileiro com DDD; aceita máscara e `+55`; guardado normalizado em E.164 (`+55DDNNNNNNNNN`) | Operação só no Brasil (§19); o mesmo formato serve para o WhatsApp depois | y |
| Nomes válidos | Nome da barbearia e nome do Dono: 2 a 100 caracteres após trim | Evita vazio e texto abusivo; limite folgado | y |
| Mecanismo de sessão | Token de acesso assinado, enviado como `Authorization: Bearer`; validade padrão de 7 dias, configurável por env; sem refresh | Painel usado no celular entre atendimentos, e login frequente atrapalha. Detalhe técnico fechado no design | y |
| Resposta de e-mail duplicado | HTTP 409, mensagem "Este e-mail já está cadastrado." | "Mensagem clara" do CA-01.3; o 409 distingue de erro de validação | y |
| Erro de validação | HTTP 400 com a lista de campos inválidos e mensagens em pt-BR | Padrão da borda com Zod | y |
| Login com credencial errada | HTTP 401, mensagem única "E-mail ou senha inválidos." para e-mail inexistente e senha errada | Não revelar quais e-mails existem | y |
| Pedido de recuperação | Sempre HTTP 202 com a mesma mensagem, exista o e-mail ou não; o e-mail só sai se o usuário existir | Não revelar quais e-mails existem | y |
| Link de recuperação | `${APP_WEB_URL}/redefinir-senha?token=<token>`; token aleatório de 32 bytes, guardado só como hash, validade de 1 h, uso único; um pedido novo invalida os tokens anteriores do usuário | Padrão seguro; `APP_WEB_URL` aponta para o futuro frontend | y |
| Falha no envio do e-mail de recuperação | Mesma resposta 202; o erro é logado (sem e-mail nem token) e não há retentativa | Não há fila no projeto ainda; a resposta não pode vazar a falha | y |
| Duração do teste | `trial_ends_at` = instante do cadastro + 14 × 24 h (UTC); status da assinatura `trialing` | RN-24 / D-16 decidem 14 dias (não é "sugestão, a validar"), então vira constante de domínio | y |
| "Todas as funcionalidades liberadas" | Nenhuma rota é bloqueada por status de assinatura nesta história; o cadastro não tem nenhum campo de pagamento | O bloqueio só nasce na US-21 | y |
| Cadastro atômico | Barbearia e Dono gravados na mesma transação; se um falhar, nada é gravado | Evita barbearia órfã | y |
| Endpoint de verificação do isolamento (CA-01.4) | `GET /me` devolve o usuário logado e a barbearia dele, com o tenant tirado só do token | Único dado de tenant que existe nesta história; os repositórios exigem tenant desde já | y |
| Métrica de negócio | Contador `barbershop_signups_total` sem labels | Padrão de observabilidade do projeto; sem cardinalidade | y |

**Open questions:** none - all resolved or logged above (required before the spec is confirmed).

---

## User Stories

### P1: Cadastro self-service da barbearia ⭐ MVP

**User Story**: Como **Dono**, quero criar a conta da minha barbearia e já sair autenticado, para começar o teste gratuito sem informar pagamento.

**Why P1**: Sem tenant e usuário, nenhuma outra história existe (RF-40).

**Acceptance Criteria** (each line is one EARS pattern):

1. **CA-01.1** — WHEN um visitante envia `POST /auth/signup` com nome da barbearia, nome, e-mail, telefone e senha válidos THEN o sistema SHALL criar a barbearia e um usuário com perfil `owner` vinculado a ela, e responder 201 com um token de sessão válido para `GET /me`.
2. **CA-01.1** — WHEN o cadastro é concluído THEN o sistema SHALL guardar a senha apenas como hash, e nenhuma resposta ou log SHALL conter a senha (RNF-06).
3. **CA-01.1** — IF algum campo do cadastro está ausente ou inválido (regras nas premissas) THEN o sistema SHALL responder 400 com os campos inválidos e não gravar nada.
4. **CA-01.2** — WHEN a barbearia é criada THEN o sistema SHALL registrar o status de assinatura `trialing` com fim do teste em exatamente 14 dias após o instante do cadastro (RN-24).
5. **CA-01.2** — The system SHALL aceitar o cadastro sem nenhum dado de pagamento no payload.
6. **CA-01.3** — IF o e-mail informado já pertence a um usuário, comparado sem diferenciar maiúsculas/minúsculas e sem espaços nas pontas, THEN o sistema SHALL responder 409 com a mensagem "Este e-mail já está cadastrado." e não criar barbearia nem usuário.
7. **CA-01.3** — IF dois cadastros com o mesmo e-mail chegam ao mesmo tempo THEN o sistema SHALL gravar só um e responder 409 ao outro, sem deixar barbearia órfã.

**Independent Test**: e2e: `POST /auth/signup` → 201 + token → `GET /me` com o token devolve o Dono e a barbearia em `trialing` com fim do teste em +14 dias.

---

### P1: Login do Dono ⭐ MVP

**User Story**: Como **Dono**, quero entrar no painel com e-mail e senha, para voltar a acessar minha barbearia.

**Why P1**: "Acesso do Dono" é parte do título da história e pré-requisito do CA-01.4 ("Dono logado") e do CA-01.5 (usar a nova senha).

**Acceptance Criteria**:

1. WHEN um usuário envia `POST /auth/login` com e-mail e senha corretos THEN o sistema SHALL responder 200 com um token de sessão.
2. IF o e-mail não existe ou a senha está errada THEN o sistema SHALL responder 401 com a mesma mensagem "E-mail ou senha inválidos." nos dois casos.
3. IF uma requisição a rota protegida chega sem token, com token inválido ou com token expirado THEN o sistema SHALL responder 401.

**Independent Test**: e2e: cadastro → `POST /auth/login` → 200 + token aceito em `GET /me`; senha errada e e-mail inexistente → 401 com corpo idêntico.

---

### P1: Isolamento entre barbearias ⭐ MVP

**User Story**: Como **Dono**, quero ver só os dados da minha barbearia, para que nenhuma outra barbearia acesse meus dados (RN-26).

**Why P1**: Regra que atravessa todo o sistema; precisa existir antes do primeiro dado de tenant.

**Acceptance Criteria**:

1. **CA-01.4** — WHEN um Dono autenticado chama `GET /me` THEN o sistema SHALL devolver apenas o próprio usuário e a própria barbearia, com o tenant tirado exclusivamente do token de sessão.
2. **CA-01.4** — WHILE existem duas ou mais barbearias cadastradas, the system SHALL devolver a cada Dono somente os dados do tenant do seu token, mesmo que a requisição traga o identificador de outra barbearia em header, query ou corpo.
3. **CA-01.4** — The system SHALL exigir o identificador do tenant em todo método de repositório que lê ou grava dados de barbearia (RN-26).

**Independent Test**: e2e com duas barbearias A e B: o token de A em `GET /me` (inclusive com `barbershopId` de B na query/header) nunca devolve dados de B.

---

### P1: Recuperação de senha por e-mail ⭐ MVP

**User Story**: Como **usuário que esqueceu a senha**, quero receber um link por e-mail para criar uma nova senha, para recuperar o acesso sem suporte.

**Why P1**: CA-01.5; sem isso, perder a senha trava o Dono fora da própria barbearia.

**Acceptance Criteria**:

1. **CA-01.5** — WHEN `POST /auth/password/forgot` recebe o e-mail de um usuário existente THEN o sistema SHALL enviar a esse e-mail uma mensagem em pt-BR com o link `${APP_WEB_URL}/redefinir-senha?token=<token>` e responder 202.
2. **CA-01.5** — WHEN `POST /auth/password/forgot` recebe um e-mail que não existe THEN o sistema SHALL responder 202 com o mesmo corpo do caso existente e não enviar e-mail.
3. **CA-01.5** — WHEN `POST /auth/password/reset` recebe um token válido e uma nova senha válida THEN o sistema SHALL trocar a senha, marcar o token como usado e responder 204, e o login SHALL passar a aceitar só a nova senha.
4. **CA-01.5** — IF o token de redefinição está expirado (mais de 1 h), já foi usado, foi substituído por um pedido mais novo ou não existe THEN o sistema SHALL responder 400 com a mensagem "Link de redefinição inválido ou expirado." e não alterar a senha.
5. **CA-01.5** — IF a nova senha não atende às regras de senha THEN o sistema SHALL responder 400 e não consumir o token.
6. **CA-01.5** — IF o envio do e-mail de recuperação falha THEN o sistema SHALL responder 202 igual ao caso de sucesso e registrar o erro no log sem e-mail nem token.
7. **CA-01.5** — The system SHALL guardar o token de redefinição apenas como hash.

**Independent Test**: unit com `EmailSender` fake capturando o link; e2e: forgot → token do fake → reset → login com a nova senha 200 e com a antiga 401.

---

## Edge Cases

- IF o e-mail do cadastro ou do login vem com letras maiúsculas ou espaços nas pontas THEN o sistema SHALL tratá-lo como o mesmo e-mail normalizado.
- IF o telefone vem com máscara (`(11) 91234-5678`) ou com `+55` THEN o sistema SHALL aceitá-lo e guardá-lo em E.164.
- IF o corpo tem campos extras (ex.: `role`, `barbershopId`, dados de cartão) THEN o sistema SHALL ignorá-los; o perfil do cadastro é sempre `owner`.
- WHEN o mesmo token de redefinição é enviado duas vezes THEN a segunda chamada SHALL receber 400.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| ACC-01 | P1 Cadastro — CA-01.1 criação + sessão | Tasks | In Tasks |
| ACC-02 | P1 Cadastro — CA-01.1 senha em hash (RNF-06) | Tasks | In Tasks |
| ACC-03 | P1 Cadastro — CA-01.1 validação 400 | Tasks | In Tasks |
| ACC-04 | P1 Cadastro — CA-01.2 teste de 14 dias (RN-24) | Tasks | In Tasks |
| ACC-05 | P1 Cadastro — CA-01.2 sem pagamento | Tasks | In Tasks |
| ACC-06 | P1 Cadastro — CA-01.3 e-mail duplicado 409 | Tasks | In Tasks |
| ACC-07 | P1 Cadastro — CA-01.3 cadastro concorrente | Tasks | In Tasks |
| ACC-08 | P1 Login — sucesso | Tasks | In Tasks |
| ACC-09 | P1 Login — credencial inválida 401 | Tasks | In Tasks |
| ACC-10 | P1 Login — rota protegida sem token 401 | Tasks | In Tasks |
| ACC-11 | P1 Isolamento — CA-01.4 `GET /me` | Tasks | In Tasks |
| ACC-12 | P1 Isolamento — CA-01.4 tenant só do token | Tasks | In Tasks |
| ACC-13 | P1 Isolamento — CA-01.4 repositórios exigem tenant (RN-26) | Tasks | In Tasks |
| ACC-14 | P1 Recuperação — CA-01.5 envio do link | Tasks | In Tasks |
| ACC-15 | P1 Recuperação — CA-01.5 e-mail inexistente 202 | Tasks | In Tasks |
| ACC-16 | P1 Recuperação — CA-01.5 redefinição | Tasks | In Tasks |
| ACC-17 | P1 Recuperação — CA-01.5 token inválido/expirado | Tasks | In Tasks |
| ACC-18 | P1 Recuperação — CA-01.5 senha nova inválida | Tasks | In Tasks |
| ACC-19 | P1 Recuperação — CA-01.5 falha no envio | Tasks | In Tasks |
| ACC-20 | P1 Recuperação — CA-01.5 token em hash | Tasks | In Tasks |

**ID format:** `ACC-NN` (Conta e acesso, épico E1). Cada teste cita o `CA-01.x` no nome, conforme o CLAUDE.md.

**Coverage:** 20 total, 20 mapped to tasks (ver Requirement → Task Map em tasks.md), 0 unmapped

---

## Success Criteria

- [ ] Os 5 CAs da US-01 têm pelo menos um teste automatizado cada, com o `CA-01.x` no nome.
- [ ] `npm run lint`, `npm run build`, `npm test` e `npm run test:e2e` passam.
- [ ] Nenhum log de cadastro, login ou recuperação contém senha, token, e-mail ou telefone em texto puro.
