# US-02: Convite de barbeiros e permissões checks

Profile: light
Plan: `.specs/features/us-02-convite-de-barbeiros/plan.md`

31 checks em 3 slices · 6 one-way doors · 0 open, 0 block

Um check concluído ganha ` [done]` no fim da linha do claim, no commit que o satisfaz.

Convenção dos proofs: cada teste cita o `CA` no nome (CLAUDE.md) e termina com o id do check
entre parênteses, e o proof seleciona por esse sufixo com `-t "\(Cn\)"`. Os e2e exigem o
Postgres do compose rodando.

## Checks

### S1 - O barbeiro entra pelo convite · 22 files · 80 KB · ~20k

**C1** - `POST /users/invitations` com sessão de Dono e `{ email: '  Joao@Exemplo.com ', name: 'João Pereira' }` responde `201` com corpo exatamente `{ id, email: 'joao@exemplo.com', name: 'João Pereira', expiresAt }`, sem chave `token`, e `expiresAt` é `created_at` da linha gravada + 7 × 24 h (AC 1, CA-02.1) [done]
Proof: `npm run test:e2e -- test/users-invitations.e2e-spec.ts -t "\(C1\)"`

**C2** - `UserInvitation.issue(now)` tem `expiresAt = now + 604 800 000 ms`; `isAcceptable` é `true` 1 ms antes de `expiresAt`, `false` exatamente em `expiresAt` e `false` depois de aceito (AC 1, AC 7) [done]
Proof: `npx jest src/domain/entities/user-invitation.spec.ts -t "\(C2\)"`

**C3** - Criado o convite, o fake de e-mail recebe exatamente uma mensagem com `to = 'joao@exemplo.com'`, cujo texto contém `${APP_WEB_URL}/aceitar-convite?token=<token>`, e o `token_hash` gravado é o SHA-256 hex desse token (AC 2, door "contrato do link") [done]
Proof: `npm run test:e2e -- test/users-invitations.e2e-spec.ts -t "\(C3\)"`

**C4** - `POST /auth/invitations/accept` com o token do e-mail e `password: 'senha-do-joao'` responde `201` com `{ accessToken, tokenType: 'Bearer', expiresIn: AUTH_SESSION_TTL_SECONDS }` e grava `accepted_at` no convite (AC 3) [done]
Proof: `npm run test:e2e -- test/users-invitations.e2e-spec.ts -t "\(C4\)"`

**C5** - `GET /me` com o `accessToken` do aceite responde `200` com `user = { id, name: 'João Pereira', email: 'joao@exemplo.com', phone: null, role: 'barber' }` e `barbershop.id` igual ao da barbearia do Dono que convidou (AC 4, AC 15, door 4 role/phone) [done]
Proof: `npm run test:e2e -- test/users-invitations.e2e-spec.ts -t "\(C5\)"`

**C6** - Depois do aceite, `POST /auth/login` com `joao@exemplo.com` e `senha-do-joao` responde `200` com uma sessão (AC 5) [done]
Proof: `npm run test:e2e -- test/users-invitations.e2e-spec.ts -t "\(C6\)"`

**C7** - Convidar o e-mail do próprio Dono e o e-mail do Dono de outra barbearia responde `409` com `{ message: 'Este e-mail já está cadastrado.' }`, `user_invitations` fica com 0 linhas e nenhum e-mail é enviado (AC 6) [done]
Proof: `npm run test:e2e -- test/users-invitations.e2e-spec.ts -t "\(C7\)"`

**C8** - O aceite com token inexistente, já aceito, expirado (`expires_at` no passado) ou substituído por um convite novo responde `400` com `{ message: 'Convite inválido ou expirado.' }` e o número de linhas em `users` não muda; tabela sobre os 4 casos (AC 7) [done]
Proof: `npm run test:e2e -- test/users-invitations.e2e-spec.ts -t "\(C8\)"`

**C9** - Se, entre o convite e o aceite, o e-mail é usado num cadastro de barbearia, o aceite responde `409` com `{ message: 'Este e-mail já está cadastrado.' }`, nenhum usuário `barber` é criado e o convite continua com `accepted_at` nulo (AC 8) [done]
Proof: `npm run test:e2e -- test/users-invitations.e2e-spec.ts -t "\(C9\)"`

**C10** - Convidar de novo o mesmo e-mail na mesma barbearia deixa exatamente 1 linha pendente para esse e-mail e barbearia, e o token novo aceita com `201` (AC 9) [done]
Proof: `npm run test:e2e -- test/users-invitations.e2e-spec.ts -t "\(C10\)"`

**C11** - Duas requisições simultâneas (`Promise.all`) aceitando o mesmo token resultam em exatamente um `201`, a outra em `400` ou `409`, e exatamente 1 linha em `users` com o e-mail convidado (AC 10, door 1) [done]
Proof: `npm run test:e2e -- test/users-invitations.e2e-spec.ts -t "\(C11\)"`

**C12** - Com o envio de e-mail falhando, `POST /users/invitations` responde `502` com `{ message: 'Não foi possível enviar o convite. Tente novamente.' }` e a linha do convite continua gravada (AC 11) [done]
Proof: `npm run test:e2e -- test/users-invitations.e2e-spec.ts -t "\(C12\)"`

**C13** - Payload inválido responde `400` com `message: 'Dados inválidos.'` e `errors` contendo o `field` culpado, sem gravar nada; tabela: convite com `email: 'nao-e-email'` (`email`), `name` de 1 caractere (`name`), `name` de 101 caracteres (`name`), `name: '   a  '` (`name`); aceite sem `token` (`token`), `password` de 7 (`password`) e de 73 caracteres (`password`) (AC 12) [done]
Proof: `npm run test:e2e -- test/users-invitations.e2e-spec.ts -t "\(C13\)"`

**C14** - Depois das migrations, existe o índice único `user_invitations_token_hash_unique` e um segundo `INSERT` com o mesmo `token_hash` falha com código `23505`; `users.phone` aceita `NULL` (door 1, door 4 role/phone) [done]
Proof: `npm run test:e2e -- test/database/invitation-schema.e2e-spec.ts -t "\(C14\)"`

**C15** - `AcceptInvitationUseCase` com o e-mail já em uso lança `EmailAlreadyRegisteredError` e deixa o convite pendente; com o convite válido cria um `User` com `role: 'barber'`, `phone: null`, `barbershopId` do convite e o hash da senha (AC 3, AC 8) [done]
Proof: `npx jest src/usecases/accept-invitation/accept-invitation.use-case.spec.ts -t "\(C15\)"`

### S2 - O Barbeiro só alcança o que é dele · 4 files · 25 KB · ~6k

**C16** - Com a sessão de um `barber`, `POST /users/invitations`, `GET /users` e `DELETE /users/<id do Dono>` respondem `403` com `{ message: 'Acesso negado.' }`; depois disso nenhum convite para `novo@exemplo.com` é gravado, o número de linhas em `user_invitations` não muda e o Dono continua em `users` (AC 13) [done]
Proof: `npm run test:e2e -- test/users-permissions.e2e-spec.ts -t "\(C16\)"`

**C17** - Uma rota de sonda autenticada sem `@Roles`, montada no mesmo `AppModule`, responde `403` com `{ message: 'Acesso negado.' }` ao `barber` e `200` ao `owner` (AC 14, door 2) [done]
Proof: `npm run test:e2e -- test/users-permissions.e2e-spec.ts -t "\(C17\)"`

**C18** - No `SessionGuard`, handler sem `@Roles` nega `barber` com `ForbiddenException`; handler com `@Roles('owner', 'barber')` aceita `barber`; `@Roles` na classe vale para o handler (AC 14, door 2) [done]
Proof: `npx jest src/infrastructure/http/session.guard.spec.ts -t "\(C18\)"`

**C19** - Um JWT válido com `sub` do barbeiro e `role: 'owner'` recebe `403` em `GET /users`; um JWT com `sub` do Dono e `role: 'barber'` recebe `200` em `GET /users` (AC 16, door 3) [done]
Proof: `npm run test:e2e -- test/users-permissions.e2e-spec.ts -t "\(C19\)"`

**C20** - Um JWT válido com `role: 'admin'` recebe `401` com `{ message: 'Sessão inválida ou expirada.' }` em `GET /me` (AC 17) [done]
Proof: `npm run test:e2e -- test/users-permissions.e2e-spec.ts -t "\(C20\)"`

**C21** - Sem header `Authorization`, `POST /users/invitations`, `GET /users` e `DELETE /users/<uuid>` respondem `401` com `{ message: 'Sessão inválida ou expirada.' }` (Surface 401) [done]
Proof: `npm run test:e2e -- test/users-permissions.e2e-spec.ts -t "\(C21\)"`

### S3 - O Dono remove o acesso na hora · 8 files · 30 KB · ~8k

**C22** - `GET /users` do Dono A responde `200` com `{ users: [...] }` contendo exatamente o Dono A e o barbeiro de A, cada um só com `id`, `name`, `email` e `role`, e nenhum usuário da barbearia B (AC 18) [done]
Proof: `npm run test:e2e -- test/users-removal.e2e-spec.ts -t "\(C22\)"`

**C23** - `DELETE /users/<id do barbeiro de A>` do Dono A responde `204` com corpo vazio, a linha do barbeiro some de `users`, e a barbearia A, o Dono A e o segundo barbeiro de A continuam gravados (AC 19, AC 24, door 4 delete) [done]
Proof: `npm run test:e2e -- test/users-removal.e2e-spec.ts -t "\(C23\)"`

**C24** - Depois da remoção, `GET /me` com o `accessToken` que o barbeiro tinha antes responde `401` com `{ message: 'Sessão inválida ou expirada.' }` (AC 20, door 3) [done]
Proof: `npm run test:e2e -- test/users-removal.e2e-spec.ts -t "\(C24\)"`

**C25** - Depois da remoção, `POST /auth/login` com o e-mail e a senha do barbeiro removido responde `401` com `{ message: 'E-mail ou senha inválidos.' }` (AC 21) [done]
Proof: `npm run test:e2e -- test/users-removal.e2e-spec.ts -t "\(C25\)"`

**C26** - `DELETE /users/:id` do Dono A com o id do barbeiro de B, com o id do próprio Dono A e com um uuid inexistente responde `404` com `{ message: 'Usuário não encontrado.' }` e o número de linhas em `users` não muda; tabela sobre os 3 casos (AC 22) [done]
Proof: `npm run test:e2e -- test/users-removal.e2e-spec.ts -t "\(C26\)"`

**C27** - `DELETE /users/nao-e-uuid` responde `400` com `message: 'Dados inválidos.'` e `errors[0].field = 'id'` (AC 23) [done]
Proof: `npm run test:e2e -- test/users-removal.e2e-spec.ts -t "\(C27\)"`

**C28** - Removido um barbeiro que tinha um token de redefinição pendente, `password_reset_tokens` fica sem linhas dele, e um novo convite para o mesmo e-mail responde `201` (door 4 delete) [done]
Proof: `npm run test:e2e -- test/users-removal.e2e-spec.ts -t "\(C28\)"`

**C29** - `RemoveBarberUseCase` lança `UserNotFoundError` para um `owner` da barbearia, para um usuário de outra barbearia e para um id inexistente, e remove só o `barber` pedido (AC 19, AC 22) [done]
Proof: `npx jest src/usecases/remove-barber/remove-barber.use-case.spec.ts -t "\(C29\)"`

**C30** - `TypeOrmUserRepository.listByBarbershop(A)` devolve só usuários de A, em ordem de `created_at` crescente; `removeBarber(A, id)` devolve `false` e não apaga um `owner` nem um usuário de B (AC 18, AC 22, RN-26) [done]
Proof: `npm run test:e2e -- test/database/typeorm-user.repository.e2e-spec.ts -t "\(C30\)"`

**C31** - `SessionGuard` responde `401` quando o usuário do `sub` não existe na barbearia do token, e grava em `request.session` o `role` do banco, não o do token (AC 16, AC 20, door 3) [done]
Proof: `npx jest src/infrastructure/http/session.guard.spec.ts -t "\(C31\)"`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| `POST /users/invitations` statuses (6) | 201 C1 · 400 C13 · 401 C21 · 403 C16 · 409 C7 · 502 C12 | - |
| `POST /auth/invitations/accept` statuses (3) | 201 C4 · 400 C8 · 409 C9 | - |
| `GET /users` statuses (3) | 200 C22 · 401 C21 · 403 C16 | - |
| `DELETE /users/:id` statuses (5) | 204 C23 · 400 C27 · 401 C21 · 403 C16 · 404 C26 | - |
| `GET /me` statuses after the change (2) | 200 for `barber` C5 · 401 for a removed user C24 | - |
| invalid invitation token (4) | C8, table-driven over all 4: unknown · accepted · expired · replaced | - |
| `DELETE` 404 reasons (3) | C26, table-driven over all 3: other tenant · owner · nonexistent | - |
| routes denied to `barber` (3) | `POST /users/invitations` C16 · `GET /users` C16 · `DELETE /users/:id` C16 | - |
| payload fields rejected (7) | C13, table-driven over all 7: email · name 1 · name 101 · name blank · token missing · password 7 · password 73 | - |
| `UserInvitation` states (3) | pending -> accepted C4 · pending -> replaced C10 · pending -> expired C2 | - |
| role source (2) | token `owner` / db `barber` C19 · token `barber` / db `owner` C19 | - |
| Landing doors (6) | 1 invitation + unique hash C14, C11 · 2 deny by default C17, C18 · 3 session checked in db C24, C31 · 4 delete row C23, C28 · 4 role/phone C5, C14 · invite link C3 | - |
| Relations entities (2) | `UserInvitation` C14 · `User` with `barber` C5 | - |
| startup config: global guard with roles (1 assembly) | `AppModule`, used by `main.ts` and by the e2e harness, C17 | - |

- Claims naming a status code, route or response shape: C1, C4-C13, C16, C17, C19-C28 - each has an e2e proof that crosses the HTTP boundary
- C2, C15, C18, C29, C31 are unit proofs of the decision at its own layer; C14 and C30 assert against the real Postgres
- Password edges 8 and 72 are not re-proven: `passwordField` is reused unchanged from US-01, whose checks cover it

## Swept

- validation: C13, C27
- failure modes: C9 (aceite com e-mail tomado não consome o convite), C12 (convite gravado mesmo com o envio falhando)
- idempotency: C10 (convidar de novo substitui), C8 (token aceito não serve de novo)
- authorization: C16, C17, C18, C19, C20, C21
- concurrency: C11
- data lifecycle: C23, C28 (remoção apaga a linha e os tokens de redefinição; o e-mail fica livre); convites aceitos e expirados não são podados - n/a nesta história, sem regra de retenção no PRD
- dependency failure: C12
- state transitions: C2, C4, C8, C10
- observability: n/a - sem métrica nova (plan, Assumptions); `token`, `password` e `email` já estão no `redact` do logger, e a falha de SMTP já é logada sem PII pelo adaptador existente

## Handoff

- S1 = ~20k (domínio, use cases, migration, repositório, controller e o e2e maior); S2 entra no `SessionGuard` a ~26k; S3 fecha a ~34k. Base: `wc -c` dos 16 arquivos existentes tocados = 37 KB, mais ~90 KB estimados para ~25 arquivos novos, dividido por 4. Abaixo do budget de 150k - one builder
- **Boundary:** C1-C31 closed at `1dabc87`
- **Settled mid-build:** o usuário aprovou (2026-09-27) reescrever o C16 depois da rodada 1 do Verifier: "0 linhas em `user_invitations`" era inalcançável, porque o convite aceito do próprio barbeiro continua gravado; o claim passou a ser "nenhum convite para `novo@exemplo.com` e o número de linhas não muda"
- **Abandoned:** nada
