# US-04 Cadastro de serviços: validação

## Validation verdict: PASS ✅ (rodada 2, depois da correção da rodada 1)

**Data**: 2026-09-27
**Rodada**: 2 (a rodada 1 terminou em FAIL com o mutante M19 vivo; a correção é o commit `4aaff5f`, task T15)
**Spec**: `.specs/features/us-04-cadastro-de-servicos/spec.md`
**Diff range**: `f3b70da..4aaff5f` (branch `feat/us-04-barbershop-services`; 16 commits: `360da46` docs, `bec3778..55fbe8e` feature e `4aaff5f` correção). O diff da correção, `55fbe8e..4aaff5f`, toca `typeorm-service.repository.ts` (+8/-1), os dois arquivos e2e (+61) e tasks.md (T15). Os ACs da spec não mudaram no range.
**Verifier**: sub-agente independente (autor ≠ verifier)

Rodada 2: os 26 ACs e os 8 edge cases têm evidência ancorada na spec, e todos os gates passam. O M19 agora morre. O `save` do repositório confere `affected !== 1` depois do `UPDATE` com tenant e lança `ServiceNotFoundError` antes de mexer nos adicionais. O novo teste de entidade forjada detecta tanto o `WHERE` sem tenant quanto a remoção da checagem. As duas lacunas não bloqueantes da rodada 1 (PUT sem sessão e ativar serviço de outro tenant) ganharam e2e próprio.

Histórico da rodada 1: FAIL. De 24 mutantes, só o M19 sobreviveu (`UPDATE` do `save` sem `barbershopId`). Uma sonda sem mutação mostrou que o `save` apagava e regravava os adicionais do serviço de outra barbearia quando recebia uma entidade forjada (id de B, `barbershopId` de A), porque o `delete`/`insert` em `service_add_ons` filtrava só por `service_id`. Isso gerou o Fix 1 e a lição L-004.

---

## Conclusão das tasks

| Task | Status | Commit |
| ---- | ------ | ------ |
| T1 ServicePrice | ✅ Feita | `bec3778` |
| T2 ServiceDuration | ✅ Feita | `df99977` |
| T3 BarbershopService + InvalidServiceAddOnError | ✅ Feita | `9444efe` |
| T4 Tabelas `services` e `service_add_ons` | ✅ Feita | `c72959b` |
| T5 Port + TypeOrmServiceRepository | ✅ Feita (gap de tenant do `save` fechado na T15) | `328e7c0` |
| T6 CreateServiceUseCase | ✅ Feita | `684cec0` |
| T7 UpdateServiceUseCase | ✅ Feita | `c4272be` |
| T8 SetServiceActiveUseCase | ✅ Feita | `cd76d6d` |
| T9 ListServicesUseCase | ✅ Feita | `c4f0a3b` |
| T10 ListBookableServicesUseCase | ✅ Feita | `b320227` |
| T11 Schemas Zod | ✅ Feita | `3c370c7` |
| T12 GET e POST | ✅ Feita | `5703f84` |
| T13 PUT | ✅ Feita | `78b552e` |
| T14 Desativar e reativar | ✅ Feita | `55fbe8e` |
| T15 Tenant na troca de adicionais do `save` (Fix 1) | ✅ Feita | `4aaff5f` |

Nenhum checkbox aberto em tasks.md; nenhum marcador `SPEC_DEVIATION` em `src/` ou `test/`.

---

## Critérios de aceite ancorados na spec

| AC | Resultado definido na spec | `file:line` + asserção | Resultado |
| -- | -------------------------- | ---------------------- | --------- |
| SVC-01 POST válido grava ativo, 201 com o formato | 201 `{ id, name, priceCents, durationMinutes, active: true, suggestedAddOnIds }` | `test/services.e2e-spec.ts:127-139` - `expect(response.status).toBe(201)`; `toEqual({ id: uuid, name: 'Corte', priceCents: 4500, durationMinutes: 30, active: true, suggestedAddOnIds: [] })`; `currentServices()).toEqual([body])`; `src/usecases/create-service/create-service.use-case.spec.ts:64-66` | ✅ PASS |
| SVC-02 GET devolve ativos e inativos, por nome sem maiúsculas | lista completa ordenada por `lower(name)` | `test/services.e2e-spec.ts:154-158` - `toEqual(['barba', 'Corte', 'Sobrancelha'])`; inativo listado em `:600-604`; `test/database/typeorm-service.repository.e2e-spec.ts:128-137`; `src/usecases/list-services/list-services.use-case.spec.ts:25` | ✅ PASS |
| SVC-03 leitura de disponíveis só com ativos, com preço e duração | só ativos do tenant, `priceCents` e `durationMinutes` | `src/usecases/list-bookable-services/list-bookable-services.use-case.spec.ts:46` - `toEqual([{ id: 'beard', priceCents: 2000, durationMinutes: 20 }, { id: 'haircut', priceCents: 4500, durationMinutes: 30 }])`; `test/database/typeorm-service.repository.e2e-spec.ts:150-159`; e2e `test/services.e2e-spec.ts:594` | ✅ PASS |
| SVC-04 PUT substitui dados, mantém `active`, 200 | 200 com o serviço salvo; `active` inalterado | `test/services.e2e-spec.ts:395-397` - `toBe(200)`, `toEqual(expected)`, GET confirma; inativo segue inativo `:413-414` - `toMatchObject({ active: false, priceCents: 2500 })`; `src/usecases/update-service/update-service.use-case.spec.ts:70-72`, `:87-88` | ✅ PASS |
| SVC-05 nome repetido (sem maiúsculas) → 409, nada gravado | 409 `{ message: 'Já existe um serviço com esse nome.' }` | `test/services.e2e-spec.ts:195-199` (POST, `currentServices()).toEqual([existing])`); `:480-484` (PUT, estado igual a `before`); `src/infrastructure/http/domain-error.filter.spec.ts:79` | ✅ PASS |
| SVC-06 índice único no banco sobre barbearia + `lower(name)` | `23505` na constraint `services_name_unique` | `test/database/services-schema.e2e-spec.ts:107-113` - `rejects.toMatchObject({ driverError: { code: '23505', constraint: 'services_name_unique' } })`, `countServices()).toBe(1)`; outra barbearia aceita `:121`; criações simultâneas `test/database/typeorm-service.repository.e2e-spec.ts:366-369` | ✅ PASS |
| SVC-07 grava adicionais e devolve no serviço e no GET | `suggestedAddOnIds` igual ao enviado, na ordem | `test/services.e2e-spec.ts:212-218` - `suggestedAddOnIds).toEqual([beard.id])`, item do GET `toEqual(haircut)`; ordem `src/usecases/create-service/create-service.use-case.spec.ts:90-93`; `test/database/typeorm-service.repository.e2e-spec.ts:103-114` | ✅ PASS |
| SVC-08 editar substitui a lista, inclusive por vazia | lista nova; `[]` | `test/services.e2e-spec.ts:442-455`; `src/usecases/update-service/update-service.use-case.spec.ts:98-103`; `test/database/typeorm-service.repository.e2e-spec.ts:218-226` | ✅ PASS |
| SVC-09 adicional inexistente ou de outro tenant → 400 | 400 `{ message: 'Serviço adicional não encontrado.' }`, nada gravado | `test/services.e2e-spec.ts:227-231` (inexistente), `:247-251` (outro tenant) - body exato, `currentServices()).toEqual([])`; PUT `src/usecases/update-service/update-service.use-case.spec.ts:147-149` | ✅ PASS |
| SVC-10 próprio serviço como adicional → 400 | 400 `{ message: 'Um serviço não pode ser adicional de si mesmo.' }`, nada muda | `test/services.e2e-spec.ts:498-502`; `src/domain/entities/barbershop-service.spec.ts:139-141`; banco `test/database/services-schema.e2e-spec.ts:132-138` | ✅ PASS |
| SVC-11 adicional inativo → 400 | 400 `{ message: 'Os serviços adicionais devem estar ativos.' }`, nada gravado | `test/services.e2e-spec.ts:267-271`; `src/usecases/update-service/update-service.use-case.spec.ts:164-167` | ✅ PASS |
| SVC-12 mais de 5 ou repetidos → 400 no campo | 400 `errors: [{ field: 'suggestedAddOnIds', ... }]`, nada gravado | `test/services.e2e-spec.ts:297-301` - `tooMany.body` e `repeated.body` `toEqual({ message: 'Dados inválidos.', errors: [{ field: 'suggestedAddOnIds', message: 'Escolha até 5 serviços adicionais, sem repetir.' }] })`; 5 aceitos `src/interface-adapters/controllers/schemas/service.schema.spec.ts:118-123` | ✅ PASS |
| SVC-13 desativar → 200 com `active: false` | 200, corpo com `active: false` | `test/services.e2e-spec.ts:598-599` - `toBe(200)`, `toEqual({ ...brows, active: false })`; `src/usecases/set-service-active/set-service-active.use-case.spec.ts:52-53` | ✅ PASS |
| SVC-14 inativo sai dos disponíveis e fica no GET | disponíveis sem ele; GET com `active: false` | `test/services.e2e-spec.ts:600-605` - GET `toEqual([beard, haircut, { ...brows, active: false }])`, `bookableNames()).toEqual(['Barba', 'Corte'])`; `src/usecases/list-bookable-services/list-bookable-services.use-case.spec.ts:65` | ✅ PASS |
| SVC-15 desativar mantém nome, preço, duração e relações (como dono e como adicional) | só `active` muda | `test/services.e2e-spec.ts:600-604` (`brows` com o próprio adicional e `haircut` apontando para `brows`, ambos por igualdade exata); `test/database/typeorm-service.repository.e2e-spec.ts:244-249`; `src/domain/entities/barbershop-service.spec.ts:154` | ✅ PASS |
| SVC-16 ativar inativo → 200, `active: true`, volta aos disponíveis | 200, `active: true`, disponível | `test/services.e2e-spec.ts:614-617`; `src/usecases/list-bookable-services/list-bookable-services.use-case.spec.ts:69` | ✅ PASS |
| SVC-17 repetir desativar/ativar → 200 sem mudança | 200, mesmo corpo e estado | `test/services.e2e-spec.ts:629-631` (it.each nas duas ações); `src/usecases/set-service-active/set-service-active.use-case.spec.ts:87-88`; `src/domain/entities/barbershop-service.spec.ts:172,177` | ✅ PASS |
| SVC-18 `serviceId` inexistente ou de outro tenant em PUT/deactivate/activate → 404 | 404 `{ message: 'Serviço não encontrado.' }`, nada muda | PUT `test/services.e2e-spec.ts:513-515` (inexistente) e `:531-533` (outro tenant); deactivate/activate inexistente `:642-644`; deactivate de outro tenant `:658-660`; activate de outro tenant (novo na rodada 2) `:687-691` - `toBe(404)`, body exato, B `toEqual([{ ...foreign, active: false }])`; `src/usecases/set-service-active/set-service-active.use-case.spec.ts:100-111` | ✅ PASS |
| SVC-19 `priceCents` negativo → 400 no campo | 400 `errors: [{ field: 'priceCents' }]`, nada gravado | `test/services.e2e-spec.ts:312-322` - body exato, `currentServices()).toEqual([])`; `src/interface-adapters/controllers/schemas/service.schema.spec.ts:40-42` | ✅ PASS |
| SVC-20 `durationMinutes` zero → 400 no campo | 400 `errors: [{ field: 'durationMinutes' }]`, nada gravado | `test/services.e2e-spec.ts:331-342`; `src/interface-adapters/controllers/schemas/service.schema.spec.ts:46-48` | ✅ PASS |
| SVC-21 limites e formato → 400 no campo | um erro por campo | e2e `test/services.e2e-spec.ts:352-371` (preço 45.5, duração 7, nome de 1 caractere, três erros exatos); schema `src/interface-adapters/controllers/schemas/service.schema.spec.ts:52-80` (preço 45.5, 1.000.001, `'4500'`; duração 4, 485, 7, 30.5; nome `' C '` e 61 caracteres), cada um com `toEqual([{ field, message }])` | ✅ PASS |
| SVC-22 domínio recusa fora dos limites com `InvalidValueError` | `InvalidValueError` | `src/domain/value-objects/service-price.spec.ts:14-15` (-1, 1.000.001, 45.5, NaN, Infinity); `src/domain/value-objects/service-duration.spec.ts:14-15` (0, 4, 485, 7, 30.5, NaN); limites aceitos `:7-8` nos dois; use case `src/usecases/create-service/create-service.use-case.spec.ts:143-147` | ✅ PASS |
| SVC-23 `CHECK` no banco | `23514` para preço fora de 0..1.000.000 e duração fora de 5..480 ou fora do passo de 5 | `test/database/services-schema.e2e-spec.ts:94-98` - `rejects.toMatchObject({ driverError: { code: '23514' } })`, contagem igual, para -1, 1.000.001, 0, 4, 485, 7; limites exatos aceitos em `:77` (0, 1.000.000, 5, 480) | ✅ PASS |
| SVC-24 Barbeiro → 403 `{ message: 'Acesso negado.' }` em todas as rotas, nada muda | 403 corpo exato | GET e POST `test/services.e2e-spec.ts:758-762`; PUT `:576-578`; deactivate e activate `:698-702` | ✅ PASS |
| SVC-25 sem sessão → 401 | 401 | GET e POST `test/services.e2e-spec.ts:769-773`; PUT (novo na rodada 2) `:556-558` - `toBe(401)`, `toEqual(UNAUTHORIZED)`, `currentServices()).toEqual([haircut])`; deactivate e activate `:715-719` | ✅ PASS |
| SVC-26 só o tenant da sessão; ignora `barbershopId` no corpo, na query e no header | cria só em A; B intacto | `test/services.e2e-spec.ts:735-743` (`?barbershopId=`, `x-barbershop-id` e corpo com o id de B; `currentServices()).toEqual([response.body])`, B `toEqual([foreign])`); repositório: `test/database/typeorm-service.repository.e2e-spec.ts:174-181` (`findById`/`findByIds`), `:293-300` (novo na rodada 2) - `save(forged)).rejects.toBeInstanceOf(ServiceNotFoundError)`, `describeService(findById(B))).toEqual(before)`, `before?.suggestedAddOnIds).toEqual([beardB.id])` | ✅ PASS |

**Status**: ✅ 26/26 ACs cobertos. Na rodada 1, o SVC-26 tinha a lacuna de discriminação no `save`, fechada em `4aaff5f`. Nenhum spec-precision gap: cada AC define status, mensagem ou campo exatos, e as asserções miram esses valores.

Regra de payload/conjunção: os corpos HTTP são comparados inteiros com `toEqual`. O estado gravado é conferido campo a campo (`describeService` nos testes de use case e de repositório; `currentServices()` nos e2e). "Nada gravado" é sempre uma comparação com o estado anterior (`toEqual(before)`) ou uma contagem relativa (L-001). O novo teste do repositório afirma que o estado anterior de B tinha mesmo o adicional (`before?.suggestedAddOnIds).toEqual([beardB.id])`). Sem isso, um teste com a lista vazia passaria mesmo com o bug.

Nomes dos testes (CLAUDE.md): todo teste novo cita `CA-04.x` ou `RN-26` no próprio nome ou no `describe` que o envolve. Ficam sem CA os testes de 403/401 (SVC-24/25, sem CA no PRD), incluindo o novo de PUT sem sessão, e o de `serviceId` malformado; nenhum deles é crítico.

---

## Sensor de discriminação

Scratch isolado nas duas rodadas: `git worktree add --detach <scratchpad>/verify-wt HEAD`, com `node_modules` em symlink e `.env` copiado. Cada mutante foi revertido com `git checkout` no worktree. `git stash` não foi usado.

| # | File:line | Descrição | Testes | Morto? |
| - | --------- | --------- | ------ | ------ |
| M1 | `src/domain/value-objects/service-price.ts:19` | `>= MIN_PRICE_CENTS` → `>` (recusa 0) | domain + schema | ✅ Morto (2 falhas) |
| M2 | `src/domain/value-objects/service-price.ts:20` | `<= MAX_PRICE_CENTS` → `<` (recusa 1.000.000) | domain + schema | ✅ Morto |
| M3 | `src/domain/value-objects/service-duration.ts:20` | `>= 5` → `>` | domain + schema | ✅ Morto (2 falhas) |
| M4 | `src/domain/value-objects/service-duration.ts:21` | `<= 480` → `<` | domain + schema | ✅ Morto (2 falhas) |
| M5 | `src/domain/value-objects/service-duration.ts:22` | remove a regra do múltiplo de 5 | domain + schema | ✅ Morto (2 falhas) |
| M6 | `src/domain/entities/barbershop-service.ts:104` | remove a checagem de outro tenant | domain + usecases | ✅ Morto |
| M7 | `src/domain/entities/barbershop-service.ts:107` | remove a checagem de adicional de si mesmo | domain + usecases | ✅ Morto (2 falhas) |
| M8 | `src/domain/entities/barbershop-service.ts:110` | remove a checagem de adicional inativo | domain + usecases | ✅ Morto (3 falhas) |
| M9 | `src/usecases/shared/apply-suggested-add-ons.ts:18` | id desconhecido é ignorado (`continue`) em vez de lançar | usecases | ✅ Morto (4 falhas) |
| M10 | `src/usecases/update-service/update-service.use-case.ts:34` | PUT não aplica a nova lista de adicionais | usecases | ✅ Morto (6 falhas) |
| M11 | `src/usecases/set-service-active/set-service-active.use-case.ts:23` | ativar/desativar vira toggle (quebra a idempotência) | usecases | ✅ Morto |
| M12 | `src/usecases/list-bookable-services/list-bookable-services.use-case.ts:14` | disponíveis lê `listByBarbershop` (inclui inativos) | usecases | ✅ Morto (2 falhas) |
| M13 | `src/interface-adapters/controllers/schemas/service.schema.ts:50` | remove o refine de adicionais repetidos | schema | ✅ Morto |
| M14 | `src/interface-adapters/controllers/schemas/service.schema.ts:49` | máximo de adicionais 5 → 6 | schema | ✅ Morto |
| M15 | `src/infrastructure/http/domain-error.filter.ts:28` | `InvalidServiceAddOnError` → 422 | filter | ✅ Morto |
| M16 | `src/infrastructure/http/domain-error.filter.ts:29` | `ServiceNotFoundError` → 403 | filter | ✅ Morto |
| M17 | `src/infrastructure/database/repositories/typeorm-service.repository.ts:40` | `findByIds` sem `barbershopId` | repo e2e + services e2e | ✅ Morto (3 falhas) |
| M18 | `typeorm-service.repository.ts` (`list`) | listas sem filtro de tenant (`1 = 1`) | repo e2e + services e2e | ✅ Morto (5 falhas) |
| M19 | `typeorm-service.repository.ts:63` | `UPDATE` do `save` sem `barbershopId` no `WHERE` | repo e2e + services e2e | Rodada 1: ❌ Sobreviveu (49/49). Rodada 2: ✅ Morto (1 de 52 falha) |
| M20 | `typeorm-service.repository.ts` (`list`) | `ORDER BY LOWER(name)` → `ORDER BY name` | repo e2e + services e2e | ✅ Morto (3 falhas) |
| M21 | `typeorm-service.repository.ts` (`isServiceNameUniqueViolation`) | tradução do `23505` pela constraint invertida | repo e2e + services e2e | ✅ Morto (rodada 2: 5 falhas) |
| M22 | `typeorm-service.repository.ts` (`save`) | `save` não apaga os adicionais antigos | repo e2e + services e2e | ✅ Morto (rodada 2: 4 falhas) |
| M23 | `typeorm-service.repository.ts` (`save`) | `save` não grava `active` | repo e2e + services e2e | ✅ Morto (rodada 2: 6 falhas) |
| M24 | `src/infrastructure/database/migrations/1790562059953-AddServices.ts:11` | índice único sem `lower()` | schema e2e + repo e2e + services e2e | ✅ Morto (6 falhas) |
| M25 | `typeorm-service.repository.ts:73-75` | remove a checagem `affected !== 1` (nova) | repo e2e + services e2e | ✅ Morto (1 de 52 falha) |
| M26 | `typeorm-service.repository.ts:73` | `affected !== 1` → `affected === 0` | repo e2e + services e2e | ➖ Equivalente (52/52 passam) |
| M27 | `typeorm-service.repository.ts:73` | checagem neutralizada (`&& false`) | repo e2e + services e2e | ✅ Morto (1 de 52 falha) |

**Profundidade do sensor**: expandida (27 mutantes manuais). Na rodada 2 rodaram de novo M19, M21, M22 e M23, que tocam o `save` e o guard de nome em volta dele, mais os novos M25 a M27 sobre a checagem de `affected`. M1 a M18, M20 e M24 miram código que a correção não mudou, e nenhuma asserção foi removida, então as mortes da rodada 1 continuam valendo. O M24 foi um mutante de banco: na rodada 1, depois de aplicá-lo, o banco foi restaurado a partir da árvore real, e `pg_indexes` confirmou `(barbershop_id, lower(name))`. Na rodada 2 nenhum mutante tocou o banco.

**M26 é equivalente**: o `UPDATE` filtra pela chave primária `id`, então `affected` só pode ser 0 ou 1. Para esses dois valores, `=== 0` e `!== 1` dão o mesmo resultado. Nenhum teste consegue separar os dois, e isso não é lacuna.

**Resultado**: 26/26 mutantes não equivalentes mortos (1 equivalente). PASS ✅

Isolamento: na rodada 2, o porcelain da árvore real antes e depois é o mesmo: ` M .specs/LESSONS.md`, ` M .specs/lessons.json`, `?? .specs/features/us-04-cadastro-de-servicos/validation.md` (reescrito só depois do sensor). Na rodada 1, antes e depois foi vazio. O worktree foi removido e podado nas duas rodadas.

---

## Qualidade do código

| Princípio | Status |
| --------- | ------ |
| Código mínimo | ✅ (a correção tem 8 linhas de produção) |
| Mudanças cirúrgicas | ✅ (fora de arquivos novos, só `app.module.ts` e `domain-error.filter.ts` com o teste dele) |
| Sem scope creep | ✅ (sem barbeiros aptos, sem exclusão, sem métrica ou log novos, conforme Out of Scope) |
| Segue os padrões | ✅ (um arquivo por classe, ports em `usecases/`, Zod na borda, erros de domínio no filter, migration com `synchronize: false`, centavos inteiros) |
| Checagem ancorada na spec (valores afirmados batem com a spec) | ✅ |
| Cobertura por camada (domínio 1:1 com ACs; rotas com caminho feliz, borda e erro) | ✅ (as 5 rotas agora têm 401, 403 e 404 de outro tenant onde se aplica) |
| Todo teste mapeia para um requisito, sem testes órfãos | ✅ |
| Diretrizes seguidas: `CLAUDE.md` | ✅ (RN-26 no `save` resolvido) |

Swagger: as 5 rotas têm `@ApiOperation` com resumo citando US-04, `@ApiZodResponse` com o schema do presenter e `@ApiErrorResponse` para 404/409/400 com as mensagens reais. `test/api-docs.e2e-spec.ts` passa. A correção não muda nenhuma rota. Clean Architecture: `boundaries/dependencies` passa no `lint:check`.

Observações não bloqueantes da rodada 2:

- O JSDoc de `ServiceRepository.save` (`src/usecases/ports/service.repository.port.ts:26-30`) ainda cita só `ServiceNameAlreadyExistsError`. Ele não documenta o novo `ServiceNotFoundError` quando o serviço não é daquele tenant.
- O fake `InMemoryServiceRepository.save` (`src/usecases/testing/in-memory-service.repository.ts:58`) ignora silenciosamente um serviço de outro tenant, em vez de lançar. O comportamento não é alcançável pelos use cases (todos carregam com `findById` antes), então não afeta nenhum teste. Alinhar o fake ao contrato evitaria divergência futura.

---

## Edge cases

- [x] Campos extras (`active`, `barbershopId`) ignorados: `src/interface-adapters/controllers/schemas/service.schema.spec.ts:128-141` (os dois somem do parse); e2e `test/services.e2e-spec.ts:166,178` (`active: false` no corpo → `active: true`) e `:739-743` (`barbershopId` de B no corpo)
- [x] Nome com espaços nas pontas gravado sem eles: `test/services.e2e-spec.ts:174-175` (`'  Avaliação  '` → `'Avaliação'`); `service.schema.spec.ts:137`. A unicidade compara o valor já sem espaços por construção: o `.trim()` do schema roda antes do use case, então o valor com espaços nunca chega à comparação. Não há teste direto de `' corte '` contra `'Corte'`; aceitável
- [x] Editar mantendo o próprio nome (ou só mudando maiúsculas) é aceito: `test/services.e2e-spec.ts:466-467`; `src/usecases/update-service/update-service.use-case.spec.ts:113`; `test/database/typeorm-service.repository.e2e-spec.ts:352`
- [x] `priceCents` 0 aceito: `test/services.e2e-spec.ts:174-179`; `service-price.spec.ts:7-8`; banco `services-schema.e2e-spec.ts:77`
- [x] `durationMinutes` 5 e 480 aceitos: `test/services.e2e-spec.ts:174-183`; `service-duration.spec.ts:7-8`; banco `services-schema.e2e-spec.ts:77`
- [x] `suggestedAddOnIds` omitido vira `[]`: `test/services.e2e-spec.ts:137` (POST sem o campo → `suggestedAddOnIds: []`); `service.schema.spec.ts:148`
- [x] Barbearia sem serviços → lista vazia: `test/services.e2e-spec.ts:145-146` - `toEqual({ services: [] })`
- [x] Mesmo PUT duas vezes → 200 nas duas, mesmo estado: `test/services.e2e-spec.ts:424-427`. Com a checagem `affected !== 1`, um PUT sem mudança de dados continua respondendo 200, porque o Postgres conta a linha casada mesmo sem alteração. O teste confirma isso, e também o ativar/desativar repetido em `:629-631`

---

## Gate check

- **Comando**: `npm run lint:check && npm run build && npm test && npm run test:e2e` (gate Build de tasks.md, com `lint:check` para não alterar a árvore real)
- **Rodada 2** (`4aaff5f`): lint:check exit 0; build exit 0; unit 40 suítes, 263 passaram, 0 falharam, 0 pulados; e2e 19 suítes, 213 passaram, 0 falharam, 0 pulados
- **Rodada 1** (`55fbe8e`): lint:check exit 0; build exit 0; unit 263 passaram; e2e 210 passaram
- **Contagem antes da feature** (`f3b70da`): 180 unit (medido num worktree de scratch) / 148 e2e
- **Contagem depois da feature**: 263 unit / 213 e2e
- **Delta**: +83 unit, +65 e2e; nenhum teste apagado ou enfraquecido (a correção só adiciona 3 testes e2e)

---

## Plano de correção (rodada 1, aplicado em `4aaff5f`)

### Fix 1: `save` do repositório não respeitava o tenant nos adicionais (M19)

- **Causa raiz**: `TypeOrmServiceRepository.save` filtrava o `UPDATE` por `id` + `barbershopId`, mas fazia `delete`/`insert` em `service_add_ons` só pelo `service_id`.
- **Correção aplicada**: `save` lê `affected` do `UPDATE` e lança `ServiceNotFoundError` quando o valor é diferente de 1, antes de tocar os adicionais (`src/infrastructure/database/repositories/typeorm-service.repository.ts:61-75`). A transação é abortada e nada muda. Teste de entidade forjada em `test/database/typeorm-service.repository.e2e-spec.ts:274-301`.
- **Verificado**: M19, M25 e M27 morrem; o teste passa no código corrigido.
- **Prioridade**: Major (fechado)

As observações não bloqueantes da rodada 1 também foram fechadas no mesmo commit: PUT sem sessão (`test/services.e2e-spec.ts:548-559`) e ativar serviço de outro tenant (`:663-692`).

---

## Atualização da rastreabilidade

| Requisito | Status anterior | Status novo |
| --------- | --------------- | ----------- |
| SVC-01..SVC-25 | In Progress | ✅ Verified |
| SVC-26 | In Progress (rodada 1: Needs Fix) | ✅ Verified (rodada 2, depois do Fix 1) |

(O Verifier não editou spec.md; o orquestrador atualiza a coluna de status.)

---

## Resumo

**Geral**: ✅ Ready (rodada 2)

**Checagem ancorada na spec**: 26/26 ACs batem com o resultado da spec; 0 spec-precision gaps
**Sensor**: 26/26 mutantes não equivalentes mortos (1 equivalente, M26); o M19 foi reverificado na rodada 2
**Gate**: lint, build, 263 unit e 213 e2e, tudo verde

**O que funciona**: limites de preço e duração no domínio, no schema e no `CHECK` do banco; regras de adicionais com as mensagens exatas; unicidade sem diferenciar maiúsculas, com índice e tradução do `23505`; ordenação por `lower(name)`; ativar/desativar idempotente; leitura única de disponíveis; 401/403/404 com corpos exatos em todas as rotas; isolamento de tenant em listas, buscas e gravações; Swagger das 5 rotas.

**Problemas encontrados**: nenhum pendente. O Fix 1 da rodada 1 foi fechado em `4aaff5f`. Duas observações não bloqueantes (JSDoc do port e fake em memória) estão listadas em Qualidade do código.

**Próximos passos**: o orquestrador atualiza a rastreabilidade em spec.md para Verified. A lição L-004 (da rodada 1) continua registrada.
