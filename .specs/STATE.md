# STATE

## Decisions

### AD-001
- **Decision**: Ports usados por mais de um caso de uso ficam em `src/usecases/ports/`, um arquivo por port, cada um exportando a interface e o `Symbol` de injeção. Ports exclusivos de um caso de uso ficam no diretório dele.
- **Reason**: Repositórios e serviços (usuário, hash de senha, token) são compartilhados por vários use cases; duplicar a interface em cada diretório espalharia o contrato.
- **Trade-off**: Diverge da leitura literal do CLAUDE.md ("cada diretório de caso de uso contém seus ports").
- **Scope**: `src/usecases/`, todas as histórias.
- **Date**: 2026-09-27
- **Status**: active

### AD-002
- **Decision**: Implementações TypeORM dos ports de dados ficam em `src/infrastructure/database/repositories/`, não em `src/interface-adapters/gateways/`.
- **Reason**: O `eslint-plugin-boundaries` proíbe `interface-adapters → infrastructure`, e as entidades ORM moram em `infrastructure/database/entities/` por regra do CLAUDE.md. Um gateway em `interface-adapters/` não conseguiria importar a entidade ORM.
- **Trade-off**: `interface-adapters/gateways/` fica reservado para adaptadores que não dependem de infraestrutura.
- **Scope**: Todo acesso a banco.
- **Date**: 2026-09-27
- **Status**: active

### AD-003
- **Decision**: A autenticação é um guard global (`APP_GUARD`) que exige sessão em toda rota. Rotas abertas usam `@Public()`, definido em `interface-adapters/controllers/`. O guard grava `{ userId, barbershopId, role }` em `request.session`, lido pelo decorator `@CurrentSession()`.
- **Reason**: Seguro por padrão (endpoint novo nasce protegido) e respeita o boundaries: controllers não importam nada de `infrastructure/`.
- **Trade-off**: Toda rota pública precisa lembrar do `@Public()`.
- **Scope**: Todos os controllers HTTP.
- **Date**: 2026-09-27
- **Status**: active

### AD-004
- **Decision**: O tenant (`barbershopId`) vem só da sessão (JWT HS256 com `sub`, `barbershopId`, `role`). Todo método de leitura de repositório recebe o `barbershopId` como primeiro argumento; métodos de escrita recebem a entidade de domínio, que carrega o `barbershopId`. As únicas exceções são lookups de identidade (usuário por e-mail, token de redefinição por hash), que devolvem o `barbershopId` do registro encontrado.
- **Reason**: RN-26. Login e redefinição de senha acontecem antes de existir sessão, então precisam achar o tenant a partir da credencial.
- **Trade-off**: Sessão stateless: não dá para revogar um token antes de expirar.
- **Scope**: Todos os repositórios e controllers.
- **Date**: 2026-09-27
- **Status**: active

### AD-005
- **Decision**: Senhas usam `scrypt` do `node:crypto`, com salt aleatório de 16 bytes, no formato `scrypt$N$r$p$salt$hash`.
- **Reason**: Sem dependência nativa (build simples no Docker e WSL); os parâmetros ficam no próprio hash, o que permite endurecer depois sem migração.
- **Trade-off**: argon2id é o preferido da OWASP; trocar depois exige rehash no login.
- **Scope**: Autenticação.
- **Date**: 2026-09-27
- **Status**: active

### AD-006
- **Decision**: O e2e roda as migrations num `globalSetup` do Jest e executa as suites em série (`--runInBand`); cada suite trunca as tabelas que usa.
- **Reason**: As suites compartilham o mesmo Postgres do compose; em paralelo, uma limparia os dados da outra.
- **Trade-off**: e2e mais lento.
- **Scope**: `test/`.
- **Date**: 2026-09-27
- **Status**: active

## Handoff

