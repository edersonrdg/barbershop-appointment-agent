# US-01 Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/us-01-cadastro-e-acesso-do-dono/design.md`
**Status**: Approved

Toda task cita US-01, RF-40 e os RN aplicáveis. Commits: `feat(US-01): ...` (ou `build`/`test`/`chore` quando couber), só locais.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `CLAUDE.md` (seção Testes: use cases com fakes em memória; gateways TypeORM e HTTP em e2e contra o Postgres do compose; nome do teste cita o `CA`), `package.json` (config Jest, sem threshold de cobertura), `test/jest-e2e.json`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Domain value objects / entities | unit | Todos os ramos; regras da spec (normalização, 14 dias, 1 h, perfil owner) | `src/domain/**/*.spec.ts` | `npm test` |
| Domain error classes | none | build gate only | - | build gate only |
| Use cases | unit (fakes dos ports) | 1:1 com os ACs; todo edge case listado | `src/usecases/**/*.spec.ts` | `npm test` |
| Infra adapters sem banco (hasher, token, JWT, SMTP, métricas, guard, filtro, pipe, logger, env) | unit | Comportamento do contrato + caminhos de erro | `src/**/*.spec.ts` | `npm test` |
| Repositórios TypeORM | e2e (Postgres do compose) | Consultas principais, filtro por tenant, transação e violação de unicidade | `test/database/*.e2e-spec.ts` | `npm run test:e2e` |
| Controllers / rotas HTTP | e2e | Cada rota: sucesso + edge cases + erros | `test/*.e2e-spec.ts` | `npm run test:e2e` |
| Entidades ORM, relógio, gerador de UUID | none | build gate only | - | build gate only |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | Tasks só com testes unitários | `npm test` |
| Full | Tasks com e2e | `npm test && npm run test:e2e` |
| Build | Tasks sem testes e fim de fase | `npm run lint && npm run build && npm test && npm run test:e2e` |

---

## Execution Plan

Fases em sequência; tasks em ordem dentro da fase. As setas mostram só dependências reais dentro da fase.

### Phase 1: Domínio

```
T1 -> T2
T1 -> T3
T4
T5
T6
```

### Phase 2: Use cases

```
T7 -> T8
T8 -> T9
T8 -> T10
T10 -> T11
```

### Phase 3: Configuração e banco

```
T12
T13
T14 -> T15
```

### Phase 4: Adaptadores de infraestrutura

```
T16
T17
T18
T19
T20
T21
```

### Phase 5: Repositórios

```
T22 -> T23
T23 -> T24
```

### Phase 6: Infra HTTP

```
T25
T26
T27
```

### Phase 7: Endpoints

```
T28 -> T29
T29 -> T30
T28 -> T31
T31 -> T32
```

---

## Task Breakdown

### Phase 1: Domínio

### T1: Erros de domínio ✅

**What**: `DomainError` abstrato (`code`, `rule?`) e `InvalidValueError`, `EmailAlreadyRegisteredError`, `InvalidCredentialsError`, `InvalidPasswordResetTokenError` com as mensagens pt-BR da spec.
**Where**: `src/domain/errors/` (um arquivo por classe)
**Depends on**: None
**Reuses**: -
**Requirement**: ACC-06, ACC-09, ACC-17

**Done when**:

- [x] Mensagens idênticas à spec: "Este e-mail já está cadastrado.", "E-mail ou senha inválidos.", "Link de redefinição inválido ou expirado."
- [x] Gate build passa

**Tests**: none
**Gate**: build

---

### T2: Value object Email ✅

**What**: `Email.create(raw)` normaliza (trim + minúsculas) e valida formato e tamanho (≤ 254); `Email.isValid(raw)`; valor inválido em `create` lança `InvalidValueError`.
**Where**: `src/domain/value-objects/email.ts`
**Depends on**: T1
**Requirement**: ACC-03, ACC-06 (edge case de maiúsculas/espaços)

**Done when**:

- [x] `'  Dono@Barbearia.COM '` vira `'dono@barbearia.com'`
- [x] Sem `@`, sem domínio, vazio e > 254 caracteres são inválidos
- [x] Gate quick passa

**Tests**: unit
**Gate**: quick

---

### T3: Value object PhoneNumber ✅

**What**: `PhoneNumber.create(raw)` aceita máscara e `+55`, exige DDD 11–99, fixo com 10 dígitos nacionais ou celular com 11 começando em 9, e expõe E.164; `PhoneNumber.isValid(raw)`.
**Where**: `src/domain/value-objects/phone-number.ts`
**Depends on**: T1
**Requirement**: ACC-03 (edge case de telefone)

**Done when**:

- [x] `'(11) 91234-5678'` e `'+55 11 91234-5678'` viram `'+5511912345678'`; `'(11) 3123-4567'` vira `'+551131234567'`
- [x] DDD `00`, celular de 11 dígitos sem 9 inicial, menos de 10 dígitos e letras são inválidos
- [x] Gate quick passa

**Tests**: unit
**Gate**: quick

---

### T4: Entidade Barbershop ✅

**What**: `Barbershop.startTrial({ id, name, now })` com `subscriptionStatus 'trialing'`, `trialEndsAt = now + 14 × 24 h` e fuso `America/Sao_Paulo`; `Barbershop.restore(props)`.
**Where**: `src/domain/entities/barbershop.ts`
**Depends on**: None
**Requirement**: ACC-04 (RN-24)

**Done when**:

- [x] Teste `CA-01.2`: fim do teste exatamente 14 × 86 400 000 ms após `now`, status `trialing`
- [x] Gate quick passa

**Tests**: unit
**Gate**: quick

---

### T5: Entidade User ✅

**What**: `User.createOwner({ id, barbershopId, name, email, phone, passwordHash, now })` sempre com `role 'owner'`; `User.restore(props)`.
**Where**: `src/domain/entities/user.ts`
**Depends on**: None
**Requirement**: ACC-01

**Done when**:

- [x] Teste `CA-01.1`: usuário criado tem `role 'owner'` e o `barbershopId` informado
- [x] Gate quick passa

**Tests**: unit
**Gate**: quick

---

### T6: Entidade PasswordResetToken ✅

**What**: `PasswordResetToken.issue({ id, userId, barbershopId, tokenHash, now })` com `expiresAt = now + 1 h`; `isRedeemable(now)`.
**Where**: `src/domain/entities/password-reset-token.ts`
**Depends on**: None
**Requirement**: ACC-17

**Done when**:

- [x] Testes `CA-01.5`: resgatável em `now + 59 min 59 s`; não resgatável em `now + 1 h` nem depois; não resgatável com `usedAt` preenchido
- [x] Gate quick passa

**Tests**: unit
**Gate**: quick

---

### Phase 2: Use cases

### T7: Use case RegisterBarbershop ✅

**What**: Cria barbearia em teste + Dono, grava atomicamente, conta a métrica e devolve a sessão. Cria os ports `BarbershopRepository`, `PasswordHasher`, `AccessTokenIssuer`, `Clock`, `IdGenerator`, `AccountMetrics` em `src/usecases/ports/`.
**Where**: `src/usecases/register-barbershop/register-barbershop.use-case.ts`
**Depends on**: T1, T2, T3, T4, T5
**Requirement**: ACC-01, ACC-02, ACC-04, ACC-05, ACC-06

**Done when**:

- [x] `CA-01.1`: barbearia e Dono gravados, Dono com `role 'owner'` vinculado à barbearia, token emitido para esse usuário e tenant
- [x] `CA-01.1`: o Dono gravado tem o hash devolvido pelo hasher, nunca a senha em texto
- [x] `CA-01.2`: barbearia gravada com `trialing` e fim em `now + 14 dias`
- [x] `CA-01.3`: e-mail já usado (com outra caixa e espaços) → `EmailAlreadyRegisteredError`, nenhuma barbearia gravada, nenhum token emitido
- [x] E-mail e telefone gravados normalizados
- [x] Contador de cadastro incrementado só no sucesso
- [x] Gate quick passa

**Tests**: unit
**Gate**: quick

---

### T8: Use case AuthenticateUser ✅

**What**: Login por e-mail e senha. Cria o port `UserRepository` (`findById(barbershopId, userId)`, `findByEmail(email)`).
**Where**: `src/usecases/authenticate-user/authenticate-user.use-case.ts`
**Depends on**: T7
**Requirement**: ACC-08, ACC-09

**Done when**:

- [x] Credenciais corretas (e-mail com maiúsculas/espaços) → token com o `userId` e o `barbershopId` do usuário
- [x] E-mail inexistente e senha errada → `InvalidCredentialsError` com a mesma mensagem
- [x] Gate quick passa

**Tests**: unit
**Gate**: quick

---

### T9: Use case GetMyAccount ✅

**What**: Devolve usuário e barbearia do tenant da sessão.
**Where**: `src/usecases/get-my-account/get-my-account.use-case.ts`
**Depends on**: T8
**Requirement**: ACC-11, ACC-12

**Done when**:

- [x] `CA-01.4`: com duas barbearias no fake, devolve só o usuário e a barbearia do `barbershopId` informado
- [x] `CA-01.4`: `userId` de A com `barbershopId` de B → `InvalidCredentialsError` (não vaza dado de A nem de B)
- [x] Gate quick passa

**Tests**: unit
**Gate**: quick

---

### T10: Use case RequestPasswordReset ✅

**What**: Gera token, grava o hash com validade de 1 h substituindo os anteriores e envia o e-mail pt-BR com `${appWebUrl}/redefinir-senha?token=<token>`. Cria os ports `PasswordResetRepository`, `ResetTokenGenerator`, `EmailSender`.
**Where**: `src/usecases/request-password-reset/request-password-reset.use-case.ts`
**Depends on**: T8
**Requirement**: ACC-14, ACC-15, ACC-19, ACC-20

**Done when**:

- [x] `CA-01.5`: usuário existente → um e-mail para o endereço normalizado contendo o link exato com o token gerado
- [x] `CA-01.5`: token gravado só como hash, `expiresAt = now + 1 h`, e o token anterior do usuário deixa de existir
- [x] `CA-01.5`: e-mail inexistente → resolve sem erro e sem e-mail enviado
- [x] `CA-01.5`: `EmailSender` lança → resolve sem erro
- [x] Gate quick passa

**Tests**: unit
**Gate**: quick

---

### T11: Use case ResetPassword ✅

**What**: Resgata o token pelo hash e troca a senha.
**Where**: `src/usecases/reset-password/reset-password.use-case.ts`
**Depends on**: T10
**Requirement**: ACC-16, ACC-17

**Done when**:

- [x] `CA-01.5`: token válido → hash da senha nova gravado e token marcado como usado no instante `now`
- [x] `CA-01.5`: token expirado, usado, substituído ou inexistente → `InvalidPasswordResetTokenError` e senha inalterada
- [x] `CA-01.5`: `redeem` devolve `false` (corrida) → `InvalidPasswordResetTokenError`
- [x] Gate quick passa

**Tests**: unit
**Gate**: quick

---

### Phase 3: Configuração e banco

### T12: Variáveis de ambiente ✅

**What**: Adiciona `JWT_SECRET` (≥ 32), `AUTH_SESSION_TTL_SECONDS` (padrão 604800), `APP_WEB_URL` (URL), `SMTP_HOST`, `SMTP_PORT` (padrão 1025), `SMTP_SECURE` (padrão false), `SMTP_USER`/`SMTP_PASSWORD` (opcionais), `MAIL_FROM` ao schema e ao `.env.example`; Mailpit no `docker-compose.yml`. O `.env` local recebe as mesmas chaves (não versionado).
**Where**: `src/infrastructure/config/env.schema.ts`
**Depends on**: None
**Requirement**: ACC-10, ACC-14 (suporte)

**Done when**:

- [x] `JWT_SECRET` ausente ou curto e `APP_WEB_URL` inválida falham a validação
- [x] Padrões aplicados quando as opcionais faltam
- [x] Gate quick passa

**Tests**: unit
**Gate**: quick

---

### T13: Redact de PII nos logs ✅

**What**: Amplia o `redact` com `*.email`, `*.token`, `*.accessToken`, `*.newPassword`.
**Where**: `src/infrastructure/observability/logger.options.ts`
**Depends on**: None
**Requirement**: ACC-02, Success Criteria (logs sem PII)

**Done when**:

- [x] Um logger pino montado com as opções gera `[REDACTED]` para `password`, `newPassword`, `email`, `phone`, `token` e `accessToken`
- [x] Gate quick passa

**Tests**: unit
**Gate**: quick

---

### T14: Entidades ORM ✅

**What**: `BarbershopEntity`, `UserEntity`, `PasswordResetTokenEntity` conforme o Data Model do design.
**Where**: `src/infrastructure/database/entities/` (um arquivo por entidade)
**Depends on**: None
**Requirement**: ACC-01, ACC-04, ACC-20

**Done when**:

- [x] Colunas, tipos (`timestamptz`) e nomes em snake_case iguais ao design
- [x] Gate build passa

**Tests**: none
**Gate**: build

---

### T15: Migration e harness do e2e

**What**: Migration `CreateAccountTables` (tabelas, índice único de e-mail e de hash do token); `globalSetup` do Jest e2e roda as migrations; e2e em série (`--runInBand`); helper que trunca as tabelas.
**Where**: `src/infrastructure/database/migrations/<timestamp>-CreateAccountTables.ts`
**Depends on**: T14
**Requirement**: ACC-06, ACC-07, ACC-20

**Done when**:

- [ ] `npm run migration:run` e `migration:revert` funcionam no Postgres do compose
- [ ] `npm run migration:generate` depois da migration não gera diferença
- [ ] e2e existente continua passando com o `globalSetup`
- [ ] Gate full passa

**Tests**: e2e
**Gate**: full

---

### Phase 4: Adaptadores de infraestrutura

### T16: ScryptPasswordHasher

**What**: Implementa `PasswordHasher` com `scrypt`, salt de 16 bytes e `timingSafeEqual`.
**Where**: `src/infrastructure/security/scrypt-password-hasher.ts`
**Depends on**: None
**Requirement**: ACC-02 (RNF-06)

**Done when**:

- [ ] `CA-01.1`: hash não contém a senha, começa com `scrypt$`, dois hashes da mesma senha diferem
- [ ] `verify` aceita a senha certa e recusa a errada e um hash malformado
- [ ] Gate quick passa

**Tests**: unit
**Gate**: quick

---

### T17: CryptoResetTokenGenerator

**What**: Implementa `ResetTokenGenerator`: 32 bytes aleatórios em base64url; hash SHA-256 hex.
**Where**: `src/infrastructure/security/crypto-reset-token-generator.ts`
**Depends on**: None
**Requirement**: ACC-20

**Done when**:

- [ ] `CA-01.5`: token decodifica para 32 bytes; `tokenHash` = SHA-256 hex do token e diferente dele; `hashOf(token)` = `tokenHash`
- [ ] Gate quick passa

**Tests**: unit
**Gate**: quick

---

### T18: JwtAccessTokenIssuer

**What**: Implementa `AccessTokenIssuer` com `@nestjs/jwt@11` (HS256, `expiresIn = AUTH_SESSION_TTL_SECONDS`). Instala `@nestjs/jwt@^11.0.2`.
**Where**: `src/infrastructure/security/jwt-access-token-issuer.ts`
**Depends on**: None
**Requirement**: ACC-01, ACC-08

**Done when**:

- [ ] Token verificado com o mesmo segredo traz `sub`, `barbershopId`, `role` e `exp - iat` igual ao TTL; `expiresIn` devolvido igual ao TTL
- [ ] Gate quick passa

**Tests**: unit
**Gate**: quick

---

### T19: Relógio e gerador de UUID

**What**: `SystemClock` (`new Date()`) e `UuidIdGenerator` (`randomUUID`).
**Where**: `src/infrastructure/security/` (um arquivo por classe)
**Depends on**: None
**Requirement**: suporte a ACC-01

**Done when**:

- [ ] Gate build passa

**Tests**: none
**Gate**: build

---

### T20: SmtpEmailSender

**What**: Implementa `EmailSender` com `nodemailer@10`; em erro loga só `name`/`code` e relança. Instala `nodemailer@^10`.
**Where**: `src/infrastructure/external/email/smtp-email-sender.ts`
**Depends on**: None
**Requirement**: ACC-14, ACC-19

**Done when**:

- [ ] Envia `from = MAIL_FROM`, `to`, `subject`, `text` para o transporte
- [ ] `CA-01.5`: transporte falha → relança e o log não contém o destinatário nem o corpo
- [ ] Gate quick passa

**Tests**: unit
**Gate**: quick

---

### T21: PrometheusAccountMetrics

**What**: Implementa `AccountMetrics` com o contador `barbershop_signups_total` (sem labels) no `METRICS_REGISTRY`.
**Where**: `src/infrastructure/observability/prometheus-account-metrics.ts`
**Depends on**: None
**Requirement**: Premissa "Métrica de negócio"

**Done when**:

- [ ] Após duas chamadas, o registry expõe `barbershop_signups_total 2`
- [ ] Gate quick passa

**Tests**: unit
**Gate**: quick

---

### Phase 5: Repositórios

### T22: TypeOrmBarbershopRepository

**What**: `createWithOwner` em transação (violação do índice de e-mail → `EmailAlreadyRegisteredError`) e `findById`.
**Where**: `src/infrastructure/database/repositories/typeorm-barbershop.repository.ts`
**Depends on**: None
**Requirement**: ACC-01, ACC-06, ACC-07, ACC-13

**Done when**:

- [ ] `CA-01.1`: grava e relê barbearia e Dono com todos os campos
- [ ] `CA-01.3`: e-mail repetido → `EmailAlreadyRegisteredError` e a segunda barbearia não existe no banco
- [ ] `CA-01.3`: dois `createWithOwner` simultâneos com o mesmo e-mail → um sucesso, um `EmailAlreadyRegisteredError`, uma barbearia só
- [ ] Gate full passa

**Tests**: e2e
**Gate**: full

---

### T23: TypeOrmUserRepository

**What**: `findById(barbershopId, userId)` filtrando pelo tenant e `findByEmail(email)`.
**Where**: `src/infrastructure/database/repositories/typeorm-user.repository.ts`
**Depends on**: T22
**Requirement**: ACC-08, ACC-13

**Done when**:

- [ ] `CA-01.4`: `findById(B, userDeA)` → `null`; `findById(A, userDeA)` → usuário
- [ ] `findByEmail` acha pelo e-mail normalizado e devolve o `barbershopId`
- [ ] Gate full passa

**Tests**: e2e
**Gate**: full

---

### T24: TypeOrmPasswordResetRepository

**What**: `replaceForUser`, `findByTokenHash` e `redeem` (transação: `UPDATE ... WHERE used_at IS NULL` + troca do hash da senha filtrando pelo tenant).
**Where**: `src/infrastructure/database/repositories/typeorm-password-reset.repository.ts`
**Depends on**: T23
**Requirement**: ACC-16, ACC-17, ACC-20

**Done when**:

- [ ] `CA-01.5`: `replaceForUser` apaga o token não usado anterior do usuário
- [ ] `CA-01.5`: `redeem` troca o hash e marca `used_at`; segundo `redeem` do mesmo token → `false` e senha inalterada
- [ ] `redeem` com `barbershopId` de outro tenant → `false` e senha inalterada
- [ ] Gate full passa

**Tests**: e2e
**Gate**: full

---

### Phase 6: Infra HTTP

### T25: DomainErrorFilter

**What**: Filtro global que mapeia `EmailAlreadyRegisteredError`→409, `InvalidCredentialsError`→401, `InvalidPasswordResetTokenError`→400, corpo `{ message }`.
**Where**: `src/infrastructure/http/domain-error.filter.ts`
**Depends on**: None
**Requirement**: ACC-06, ACC-09, ACC-17

**Done when**:

- [ ] Cada erro gera o status e a mensagem da spec
- [ ] Gate quick passa

**Tests**: unit
**Gate**: quick

---

### T26: ZodValidationPipe

**What**: Pipe que valida com um schema Zod e lança 400 `{ message: 'Dados inválidos.', errors: [{ field, message }] }`; devolve o dado parseado (sem campos extras).
**Where**: `src/interface-adapters/controllers/zod-validation.pipe.ts`
**Depends on**: None
**Requirement**: ACC-03

**Done when**:

- [ ] Payload inválido → 400 listando cada campo inválido
- [ ] Payload válido com campo extra → devolve o objeto sem o extra
- [ ] Gate quick passa

**Tests**: unit
**Gate**: quick

---

### T27: SessionGuard e decorators

**What**: `SessionGuard` global (`infrastructure/http/`) + `@Public()`, `@CurrentSession()` e o tipo `AuthenticatedSession` (`interface-adapters/controllers/`).
**Where**: `src/infrastructure/http/session.guard.ts`
**Depends on**: None
**Requirement**: ACC-10, ACC-12

**Done when**:

- [ ] Rota `@Public()` passa sem token
- [ ] Sem header, esquema diferente de Bearer, assinatura errada, token expirado e payload sem `barbershopId` → `UnauthorizedException`
- [ ] Token válido → `request.session` com `userId`, `barbershopId`, `role` do token
- [ ] Gate quick passa

**Tests**: unit
**Gate**: quick

---

### Phase 7: Endpoints

### T28: AccountModule + POST /auth/signup

**What**: `AccountModule` (JWT, ports, use cases, guard e filtro globais) importado no `AppModule`; `AuthController.signup` com schema Zod e `SessionPresenter`; e2e com `EMAIL_SENDER` fake e tabelas truncadas.
**Where**: `src/interface-adapters/controllers/auth.controller.ts`
**Depends on**: None
**Requirement**: ACC-01, ACC-02, ACC-03, ACC-04, ACC-05, ACC-06, ACC-07

**Done when**:

- [ ] `CA-01.1`: 201 com `accessToken`, `tokenType 'Bearer'`, `expiresIn`; o token decodifica para o Dono e a barbearia criados
- [ ] `CA-01.1`: `password_hash` no banco ≠ senha; corpo da resposta não contém a senha
- [ ] `CA-01.1`: cada campo ausente ou inválido → 400 com o campo listado e nada gravado
- [ ] `CA-01.2`: barbearia com `trialing` e `trial_ends_at - created_at = 14 dias`; payload sem pagamento aceito
- [ ] `CA-01.3`: e-mail repetido (com caixa/espaços diferentes) → 409 "Este e-mail já está cadastrado." e nada novo gravado
- [ ] `CA-01.3`: dois signups simultâneos → um 201, um 409, sem barbearia órfã
- [ ] Campos extras (`role`, `barbershopId`, cartão) ignorados: usuário é `owner` de barbearia nova
- [ ] Telefone mascarado gravado em E.164
- [ ] Gate full passa

**Tests**: e2e
**Gate**: full

---

### T29: POST /auth/login

**What**: `AuthController.login`.
**Where**: `src/interface-adapters/controllers/auth.controller.ts`
**Depends on**: T28
**Requirement**: ACC-08, ACC-09

**Done when**:

- [ ] Credenciais corretas (e-mail com caixa diferente) → 200 com token
- [ ] Senha errada e e-mail inexistente → 401 com corpos idênticos `{ message: 'E-mail ou senha inválidos.' }`
- [ ] Payload inválido → 400
- [ ] Gate full passa

**Tests**: e2e
**Gate**: full

---

### T30: GET /me

**What**: `MeController` + `MyAccountPresenter`.
**Where**: `src/interface-adapters/controllers/me.controller.ts`
**Depends on**: T29
**Requirement**: ACC-10, ACC-11, ACC-12

**Done when**:

- [ ] `CA-01.4`: token de A → 200 só com usuário e barbearia de A (`trialing`, `trialEndsAt` = +14 dias)
- [ ] `CA-01.4`: token de A com `barbershopId` de B na query, em header `x-barbershop-id` e no corpo → sempre dados de A
- [ ] Sem token, token malformado, token assinado com outro segredo e token expirado → 401
- [ ] Gate full passa

**Tests**: e2e
**Gate**: full

---

### T31: POST /auth/password/forgot

**What**: `AuthController.forgotPassword`.
**Where**: `src/interface-adapters/controllers/auth.controller.ts`
**Depends on**: T28
**Requirement**: ACC-14, ACC-15, ACC-19, ACC-20

**Done when**:

- [ ] `CA-01.5`: e-mail existente → 202 e o fake recebe um e-mail com `${APP_WEB_URL}/redefinir-senha?token=...`
- [ ] `CA-01.5`: e-mail inexistente → 202 com corpo idêntico e nenhum e-mail
- [ ] `CA-01.5`: fake de e-mail que lança → 202 com corpo idêntico
- [ ] `CA-01.5`: o banco guarda o SHA-256 do token do link, nunca o token
- [ ] Gate full passa

**Tests**: e2e
**Gate**: full

---

### T32: POST /auth/password/reset

**What**: `AuthController.resetPassword`.
**Where**: `src/interface-adapters/controllers/auth.controller.ts`
**Depends on**: T31
**Requirement**: ACC-16, ACC-17, ACC-18

**Done when**:

- [ ] `CA-01.5`: token do link + senha válida → 204; login com a nova 200, com a antiga 401
- [ ] `CA-01.5`: mesmo token de novo → 400 "Link de redefinição inválido ou expirado."
- [ ] `CA-01.5`: token substituído por pedido mais novo, token inexistente e token expirado (`expires_at` no passado no banco) → 400 com a mesma mensagem e senha inalterada
- [ ] `CA-01.5`: senha nova inválida → 400 e o token continua utilizável depois
- [ ] Gate build passa (última task)

**Tests**: e2e
**Gate**: build

---

## Phase Execution Map

```
Phase 1 (6) => Phase 2 (5) => Phase 3 (4) => Phase 4 (6) => Phase 5 (3) => Phase 6 (3) => Phase 7 (5)
```

32 tasks. Empacotamento em lotes de ~7 fases inteiras: [P1] [P2] [P3] [P4] [P5+P6] [P7] = 6 lotes.

---

## Requirement → Task Map

| Requirement | Tasks |
| ----------- | ----- |
| ACC-01 | T5, T7, T14, T18, T22, T28 |
| ACC-02 | T7, T13, T16, T28 |
| ACC-03 | T2, T3, T26, T28 |
| ACC-04 | T4, T7, T28 |
| ACC-05 | T7, T28 |
| ACC-06 | T1, T2, T7, T15, T22, T25, T28 |
| ACC-07 | T15, T22, T28 |
| ACC-08 | T8, T18, T23, T29 |
| ACC-09 | T1, T8, T25, T29 |
| ACC-10 | T27, T30 |
| ACC-11 | T9, T30 |
| ACC-12 | T9, T27, T30 |
| ACC-13 | T22, T23, T24 |
| ACC-14 | T10, T20, T31 |
| ACC-15 | T10, T31 |
| ACC-16 | T11, T24, T32 |
| ACC-17 | T1, T6, T11, T24, T25, T32 |
| ACC-18 | T32 |
| ACC-19 | T10, T20, T31 |
| ACC-20 | T10, T15, T17, T24, T31 |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1, T4, T5, T6 | None | sem seta de entrada | ✅ |
| T2 | T1 | T1 -> T2 | ✅ |
| T3 | T1 | T1 -> T3 | ✅ |
| T7 | T1–T5 (fase 1) | fase anterior | ✅ |
| T8 | T7 | T7 -> T8 | ✅ |
| T9 | T8 | T8 -> T9 | ✅ |
| T10 | T8 | T8 -> T10 | ✅ |
| T11 | T10 | T10 -> T11 | ✅ |
| T12, T13, T14 | None | sem seta | ✅ |
| T15 | T14 | T14 -> T15 | ✅ |
| T16–T21 | None | sem seta | ✅ |
| T22 | None | sem seta | ✅ |
| T23 | T22 | T22 -> T23 | ✅ |
| T24 | T23 | T23 -> T24 | ✅ |
| T25, T26, T27 | None | sem seta | ✅ |
| T28 | None | sem seta | ✅ |
| T29 | T28 | T28 -> T29 | ✅ |
| T30 | T29 | T29 -> T30 | ✅ |
| T31 | T28 | T28 -> T31 | ✅ |
| T32 | T31 | T31 -> T32 | ✅ |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | Domain error classes | none | none | ✅ |
| T2–T6 | Domain VOs / entities | unit | unit | ✅ |
| T7–T11 | Use cases (+ ports) | unit | unit | ✅ |
| T12, T13 | Infra sem banco (env, logger) | unit | unit | ✅ |
| T14 | Entidades ORM | none | none | ✅ |
| T15 | Migration + harness e2e | e2e | e2e | ✅ |
| T16–T18, T20, T21 | Infra sem banco | unit | unit | ✅ |
| T19 | Relógio / UUID | none | none | ✅ |
| T22–T24 | Repositórios TypeORM | e2e | e2e | ✅ |
| T25, T27 | Infra HTTP sem banco | unit | unit | ✅ |
| T26 | Pipe (interface-adapters, sem banco) | unit | unit | ✅ |
| T28–T32 | Controllers / rotas | e2e | e2e | ✅ |
