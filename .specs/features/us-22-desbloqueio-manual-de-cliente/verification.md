# US-22: Desbloqueio manual de cliente verification

**Verdict**: PASS
**Profile**: light
**Diff range**: 21ace82..8e42dec
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

Rodada única e completa sobre `21ace82..8e42dec`, cobrindo os 11 checks de `checks.md` (perfil `light`). Todas as provas foram rodadas por mim no `HEAD` 8e42dec, com uma invocação por runner. Cada teste nomeado foi confirmado individualmente como `passed` no `assertionResults` do `--json`. Cada check tem uma asserção localizada que fixa o valor que o check declara. O `Swept` com `existing` foi relido no código. O perfil `light` não exige fault injection; mesmo assim injetei uma falha numa worktree isolada, porque o teste do C3 não afirma a pré-condição de bloqueio dentro dele mesmo (ver Faults injected).

## Binding sources

O perfil `light` não exige o passo 1. Para registro, abri `docs/PRD.md` US-22 (linhas 762-775: CA-22.1, CA-22.2), RF-31 (linha 196) e RN-14 (linha 290). Nenhum check os contradiz. CA-22.1 corresponde a C1-C4. A parte de CA-22.2 que cabe ao backend (o Barbeiro não pode desbloquear) corresponde a C8. A parte de tela ("a opção não aparece") está no Out of scope do plano, porque vive em `../barbershop-panel`.

## Checks

Execuções das provas (no HEAD 8e42dec):

- unit: `npx jest src/usecases/unblock-client/unblock-client.use-case.spec.ts -t "\((C1|C5|C7)\)" --json` exit 0: 3 passed, 0 failed
- e2e: `npx jest --config ./test/jest-e2e.json test/clients.e2e-spec.ts test/whatsapp-booking.e2e-spec.ts -t "US-22.*\((C1|C2|C3|C4|C5|C6|C7|C8|C9|C10|C11)\)" --json` exit 0: 12 passed, 32 skipped, 0 failed. Os 12 testes do US-22 (11 em `clients.e2e-spec.ts`, 1 em `whatsapp-booking.e2e-spec.ts`) aparecem um a um como `passed`

Todos os testes citados são novos no diff `21ace82..HEAD`.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | Dono: `204` sem corpo, `no_show_reset_at = NOW`; use case grava o reset no instante do relógio | unit + e2e, passed | `test/clients.e2e-spec.ts:700` - `unblock(joao, ownerToken).expect(204)`; `:702-703` - `response.body).toEqual({})`, `response.text).toBe('')`; `:704` - `expect(await resetAtOf(joao)).toEqual(NOW)`; `src/usecases/unblock-client/unblock-client.use-case.spec.ts:67` - `ledger.resetAtOf(SHOP, 'joao')).toEqual(NOW)` | PASS |
| C2 | depois do desbloqueio o perfil devolve `noShowCount: 0`, `selfBookingBlocked: false` | e2e, passed | `test/clients.e2e-spec.ts:712-715` - `expect(await profileOf(joao)).toMatchObject({ noShowCount: 0, selfBookingBlocked: false })`; a pré-condição bloqueada está afirmada em `:691-694` (`noShowCount: 2, selfBookingBlocked: true`) | PASS |
| C3 | desbloqueado, o cliente recebe a oferta, escolhe a 1 e fica com agendamento `confirmed`/`bot`, sem `waiting-human` | e2e, passed | `test/whatsapp-booking.e2e-spec.ts:345` - `expect(texts()).toEqual([OFFER])`; `:349-354` - `rows).toHaveLength(1)`, `rows[0]).toMatchObject({ client_id: client, origin: 'bot', status: 'confirmed' })`; `:359` - `waiting.body).toEqual({ conversations: [] })` | PASS |
| C4 | falta num agendamento que começou antes de `NOW` não conta (0); falta num que começa depois conta (1) | e2e, passed | `test/clients.e2e-spec.ts:726` - `(await profileOf(joao)).noShowCount).toBe(0)` após falta com `startsAt` 13:00Z (antes de `NOW` 15:00Z); `:732` - `.noShowCount).toBe(1)` após falta com `startsAt` 16:00Z | PASS |
| C5 | não bloqueado: `204`, `noShowCount` 1, reset `NULL`; duas vezes: `204` e reset continua `NOW`; use case não grava reset | unit + e2e, passed (3 testes) | `test/clients.e2e-spec.ts:742` - `unblock(maria, ...).expect(204)`; `:744-747` - `{ noShowCount: 1, selfBookingBlocked: false }`; `:748` - `resetAtOf(maria)).toBeNull()`; `:754-755` - duas vezes `.expect(204)`; `:757` - `resetAtOf(joao)).toEqual(NOW)`; `unblock-client.use-case.spec.ts:76-77` - `resetAtOf(SHOP, 'pedro')).toBeNull()`, `countFor(...)).toBe(1)` | PASS |
| C6 | `POST /clients/abc/unblock` -> `400` com "Informe um id de cliente válido." | e2e, passed | `test/clients.e2e-spec.ts:762` - `unblock('abc', ownerToken).expect(400)`; `:764-767` - `response.body).toEqual({ message: 'Dados inválidos.', errors: [{ field: 'id', message: CLIENT_ID_MESSAGE }] })` (literal em `:22`) | PASS |
| C7 | UUID inexistente e cliente bloqueado de B -> `404` "Cliente não encontrado."; reset de B continua `NULL`; use case lança `ClientNotFoundError` | unit + e2e, passed | `test/clients.e2e-spec.ts:795-796` - `.expect(404, CLIENT_NOT_FOUND)` para `randomUUID()` e para `foreign`; `:798` - `resetAtOf(foreign)).toBeNull()`; pré-condição de B com 2 faltas em `:793`; `unblock-client.use-case.spec.ts:83-87` - `rejects.toThrow(ClientNotFoundError)` e os dois `resetAtOf(...)).toBeNull()` | PASS |
| C8 | Barbeiro -> `403` "Acesso negado."; perfil continua `noShowCount: 2`, bloqueado | e2e, passed | `test/clients.e2e-spec.ts:804` - `unblock(joao, brunoToken).expect(403, FORBIDDEN)` (`{ message: 'Acesso negado.' }` em `:23`); `:806-809` - `{ noShowCount: 2, selfBookingBlocked: true }` | PASS |
| C9 | sem `Authorization` -> `401` "Sessão inválida ou expirada." | e2e, passed | `test/clients.e2e-spec.ts:813` - `unblock(joao).expect(401, UNAUTHORIZED)` (literal em `:19`) | PASS |
| C10 | teste gratuito vencido -> `402` com a mensagem do AD-017; João continua bloqueado | e2e, passed | `test/clients.e2e-spec.ts:823-825` - `.expect(402, { message: SUSPENDED_WRITE })` (literal em `:24-25`); `:827-830` - `{ noShowCount: 2, selfBookingBlocked: true }` | PASS |
| C11 | OpenAPI: `summary` com "US-22", path `id`, `204`, `404` com "Cliente não encontrado.", `x-roles: ['owner']` | e2e, passed | `test/clients.e2e-spec.ts:837` - `operation.summary).toContain('US-22')`; `:838` - `toMatchObject({ 'x-roles': ['owner'] })`; `:839-843` - `parameters` contém `{ name: 'id', in: 'path' }`; `:844-846` - `responses['204'].description` é string; `:847-849` - `JSON.stringify(responses['404'])).toContain('Cliente não encontrado.')` | PASS |

Nível e amostragem:

- Todos os checks que citam status, rota ou formato de resposta (C1, C2, C5-C11) têm prova e2e que cruza a rota HTTP real. Não há gap de nível.
- Os 6 status da rota no `Surface` (`204`, `400`, `401`, `402`, `403`, `404`) têm, cada um, um teste que os afirma (C1, C6, C9, C10, C8, C7). Os 3 estados do cliente (bloqueado, abaixo do limite, já desbloqueado) estão em C1 e C5. Os dois lados da regra do início do agendamento estão em C4. Os dois tenants estão em C1 e C7. Não há membro sem prova.
- A montagem é a do `AppModule` (`src/app.module.ts:45` importa `ClientsModule`; o provider do use case está em `src/infrastructure/modules/clients.module.ts:94-108`), a mesma que os e2e sobem.

## Swept existing

- authorization, `SessionGuard` só-Dono por padrão (AD-007): confirmado. `src/interface-adapters/controllers/roles.decorator.ts:8` define `DEFAULT_ROLES = ['owner']`; `src/infrastructure/http/session.guard.ts:54-60` aplica o padrão quando não há `@Roles` e responde `403 'Acesso negado.'`. O handler `unblock` (`clients.controller.ts:102-126`) não tem `@Roles`, e a classe também não (só as rotas de leitura, em `:45` e `:72`, têm `@Roles('owner', 'barber')`).
- authorization, `SubscriptionAccessGuard` (AD-017): confirmado. `src/infrastructure/http/subscription-access.guard.ts:20-21` inclui `POST` em `READ_ONLY_WRITE_METHODS`, e `:43-60` só libera quando a rota é `@Public()` ou `@AllowWhileSuspended()`, o que não é o caso do `unblock`. Os dois guards estão registrados como globais em `src/infrastructure/modules/account.module.ts:330-332`.

## Faults injected

O perfil `light` não exige este passo. Rodei uma falha para medir a discriminação do C3, porque esse teste não afirma dentro dele mesmo que o cliente estava bloqueado antes do desbloqueio. Fiz isso numa worktree isolada (`git worktree add --detach <scratchpad>/wt HEAD`, com `node_modules` em symlink, `.env` copiado e sem `git stash`). A worktree foi removida depois. O `git status --porcelain` da árvore real estava vazio antes e depois.

| Mutation | Location | Killed |
| --- | --- | --- |
| use case nunca grava o reset (`if (!selfBookingBlocked) return;` -> retorno incondicional) | `src/usecases/unblock-client/unblock-client.use-case.ts:36` | yes - C3 (`whatsapp-booking.e2e-spec.ts`) falhou: 1 failed |

## Gate

- Provas: unit 3 passed, 0 failed; e2e 12 passed, 0 failed (HEAD 8e42dec).
- `python3 .claude/skills/tlc-spec-lean/scripts/validate_verification.py us-22-desbloqueio-manual-de-cliente`: o código de saída fica registrado na devolução.

Observações (não são gaps e não mudam o veredito):

1. C3 não afirma no próprio teste a pré-condição de bloqueio. O teste vizinho CA-17.6 (C32), em `test/whatsapp-booking.e2e-spec.ts:319-334`, monta as mesmas duas faltas e prova que o cliente é transferido para humano com `blocked_client`. Além disso, a falha injetada acima foi morta pelo C3. A pré-condição está, portanto, provada indiretamente.
2. O `WHERE barbershop_id = $1` de `TypeOrmNoShowLedger.resetClient` (`src/infrastructure/database/repositories/typeorm-no-show-ledger.ts:49-50`) não é discriminado por nenhum teste, porque o use case já devolve `404` antes de chegar a ele (C7). É defesa em profundidade do RN-26, não um membro de check.
3. Duas assumptions do plano seguem com `Confirmed? n`: o reset vale pelo início do agendamento (C4) e a RN-14 continua "sugestão, a validar". Implementação e checks seguem o plano; a confirmação cabe ao usuário.
