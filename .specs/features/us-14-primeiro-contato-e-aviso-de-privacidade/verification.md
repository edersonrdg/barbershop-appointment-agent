# US-14: Primeiro contato do cliente e aviso de privacidade verification

**Verdict**: PASS
**Profile**: light
**Diff range**: 79eaeb3..1ba3bc8
**Round**: 2 - scoped
**Verifier**: independent sub-agent (author != verifier)

Os 24 checks estão provados em HEAD `1ba3bc8` com evidência localizada. As provas de C22 e C24 rodaram de novo em `1ba3bc8` e passaram. As duas observações de precisão do round 1 (C22 e C24) foram resolvidas pelo fix, que só mexeu em testes.

## Round 1 -> round 2

- **Round 1** (HEAD `acca44b`, este verificador, PASS): 24/24. Ficaram duas observações de precisão, que não eram gaps. No C24, `test/api-docs.e2e-spec.ts:160` conferia `US-14` em `${hook.summary} ${hook.description}` concatenados, então uma descrição sem `US-14` ainda passaria. No C22, o teste só conferia `+2` em `whatsapp_clients_created_total` depois de dois primeiros contatos, sem isolar o `+1` de um contato bem-sucedido.
- **Fix** (`1ba3bc8`, diff `acca44b..1ba3bc8`, só `test/whatsapp-first-contact.e2e-spec.ts` (+11/-3) e `test/api-docs.e2e-spec.ts` (+2/-1), sem código de produção): o C22 passou a conferir `created + 1`, `sent + 1` e `failed` inalterado logo depois do primeiro contato (`:398-406`), e depois `sent + 1` e `failed + 1` depois do envio que falha (`:412-417`). O C24 passou a conferir `hook.summary` com `US-14` (`:160`) e `hook.description` com `(US-14)` (`:161`), cada um separado.
- **Escopo desta rodada**: o diff do fix e os dois checks das observações (C22, C24). Não havia veredito diferente de PASS. As provas rodaram de novo em `1ba3bc8`, e os dois arquivos de teste tocados rodaram inteiros. Em `test/whatsapp-first-contact.e2e-spec.ts` as linhas até `:396` não mudaram, e nenhuma citação de outro check fica depois dela. Só as citações do C22 andaram. Em `test/api-docs.e2e-spec.ts` só as linhas do C24 mudaram. As demais citações são carried from acca44b, e o fix não tocou esses arquivos nem as linhas citadas.

## Proof runs

### Round 2, verified at 1ba3bc8

A árvore estava limpa antes e depois. `git status --porcelain` só mostra este `verification.md`, que não está versionado.

- e2e das provas: `npx jest --config ./test/jest-e2e.json test/whatsapp-first-contact.e2e-spec.ts test/api-docs.e2e-spec.ts -t "\(C[0-9]+\)" --json --outputFile=<scratchpad>/e2e2.json`, exit 0. 20 passed, 0 failed, 8 skipped. Entre os que passaram estão `CA-14.2 (C22): counts created clients and notices by outcome only` e `CA-14.1 (C24): describes the messages.upsert handling of the webhook`, e também todos os outros ids do round 1 nesses arquivos.
- e2e completo dos dois arquivos tocados: `npx jest --config ./test/jest-e2e.json test/whatsapp-first-contact.e2e-spec.ts test/api-docs.e2e-spec.ts`, exit 0. 2 suites, 28 passed, 0 failed.

### Round 1, carried from acca44b

verified at acca44b. Árvore limpa antes e depois (`git status --porcelain` vazio antes; depois, só este `verification.md`).

- e2e: `npx jest --config ./test/jest-e2e.json test/whatsapp-first-contact.e2e-spec.ts test/api-docs.e2e-spec.ts -t "\(C[0-9]+\)" --json --outputFile=<scratchpad>/e2e.json`, exit 0. 20 passed, 0 failed, 8 skipped (testes fora do filtro). Rodaram individualmente: C1, C3, C5, C6, C7, C8, C9, C10, C11 ×2 (`concurrent messages send a single notice`, `a redelivered event sends a single notice`), C12, C14, C16 ×3 (`sent by the barbershop number`, `from a group`, `sent 10 minutes ago`), C17, C21, C22 e C24. O C34 da US-13 também rodou e passou, porque o filtro pega todo id entre parênteses.
- unit: `npx jest src/infrastructure/external/whatsapp/evolution/whatsapp-jid.spec.ts src/usecases/receive-whatsapp-message/receive-whatsapp-message.use-case.spec.ts src/infrastructure/config/env.schema.spec.ts src/infrastructure/external/whatsapp/evolution/evolution-webhook.controller.spec.ts src/infrastructure/external/whatsapp/evolution/evolution-whatsapp-connector.spec.ts -t "\(C(2|4|13|15|18|19|20)\)" --json --outputFile=<scratchpad>/unit.json`, exit 0. 49 passed, 0 failed, 35 skipped. Rodaram individualmente: C2 ×10 (7 conversões e 3 `null`), C4 ×8, C13 ×3, C15 ×14 (13 casos ignorados e o caso de 300 s), C18, C19 ×2, C20 ×5 (envio e 4 falhas). O filtro também pegou testes da US-13 com os mesmos ids no `evolution-whatsapp-connector.spec.ts` (US-13 C2 e C13 ×5), que passaram. Eles não contam como prova da US-14: cada check da US-14 foi resolvido para um teste com `CA-14.x (Cn)` no nome.
- C23: `npx eslint src`, exit 0. `! grep -rl "external/whatsapp" src --include=*.ts | grep -v "^src/infrastructure/"`, exit 0. Sem o filtro, o único arquivo que importa `external/whatsapp` é `src/infrastructure/modules/whatsapp.module.ts`. A regra está ativa: `eslint.config.mjs:70` - `'boundaries/dependencies': ['error', ...]`.

## Binding sources

O passo 1 só roda no perfil `ui`, e esta feature foi aprovada no perfil `light`.

| Source | Opened | Contradiction | Uncovered |
| --- | --- | --- | --- |
| docs/PRD.md US-14 (CA-14.1 a CA-14.3), RF-10, RF-29, RN-08, RN-20 | no - step 1 does not run under `light` | - | - |

## Checks

C22 e C24 foram verified at 1ba3bc8. As demais linhas são carried from acca44b: as provas delas rodaram de novo no e2e em lote de `1ba3bc8` ou estão em arquivos que o fix não tocou, e as linhas citadas não mudaram.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | `messages.upsert` de número novo -> 204, 1 linha com `+5511987654321` e "João Silva"; `GET /clients?q=987654321` devolve o cliente | e2e batch, exit 0, `(C1)` passed | `test/whatsapp-first-contact.e2e-spec.ts:168` - `await messageUpsert().expect(204)`; `:171` - `expect(rows).toHaveLength(1)`; `:172` - `expect(rows[0]).toMatchObject({ phone: PHONE, name: 'João Silva' })` (`:20` `PHONE = '+5511987654321'`); `:175-177` - `.query({ q: '987654321' })` `.expect(200)`; `:178-179` - `expect(JSON.stringify(search.body)).toContain('João Silva')` e `.toContain(PHONE)` | PASS |
| C2 | tabela JID -> telefone: 7 conversões e 3 `null` | unit batch, exit 0, 10 casos `(C2)` passed | `src/infrastructure/external/whatsapp/evolution/whatsapp-jid.spec.ts:13` - `expect(phoneFromJid(jid)).toBe(phone)` sobre as 7 linhas `:5-11` (valores idênticos aos do claim); `:21` - `expect(phoneFromJid(jid)).toBeNull()` sobre `:17-19` (`14155550123`, `5511`, `550187654321`) | PASS |
| C3 | cliente do painel `+5531988887777` "Carlos"; webhook de `553188887777@s.whatsapp.net` "Carlão" -> 204, 1 cliente, nome "Carlos" | e2e batch, exit 0, `(C3)` passed | `test/whatsapp-first-contact.e2e-spec.ts:183` - `insertPanelClient(shopA, 'Carlos', '+5531988887777')`; `:185-188` - `remoteJid: '553188887777@s.whatsapp.net', pushName: 'Carlão'` `.expect(204)`; `:191` - `expect(rows).toHaveLength(1)`; `:192` - `expect(rows[0].name).toBe('Carlos')` | PASS |
| C4 | tabela do nome: 8 casos | unit batch, exit 0, 8 casos `(C4)` passed | `src/usecases/receive-whatsapp-message/receive-whatsapp-message.use-case.spec.ts:78-80` - `expect(clients.list(barbershop.id).map((client) => client.name)).toEqual([expected])` sobre a tabela `:63-70` (`null`, `''`, `'  A  '`, `'5511987654321'` -> "Cliente do WhatsApp"; `'  Ana  '` -> "Ana"; `'Jo'` -> "Jo"; 80 -> 80; 81 -> os 80 primeiros) | PASS |
| C5 | 2 webhooks paralelos do mesmo número novo -> 204, 204 e 1 cliente | e2e batch, exit 0, `(C5)` passed | `test/whatsapp-first-contact.e2e-spec.ts:196` - `Promise.all([messageUpsert(), messageUpsert()])`; `:198` - `expect(responses.map(({ status }) => status)).toEqual([204, 204])`; `:199` - `expect(await clientsOf(shopA)).toHaveLength(1)` | PASS |
| C6 | mesmo número em A e B -> 2 clientes, um por `barbershop_id`; 1 `sendText` por barbearia com o nome de cada uma | e2e batch, exit 0, `(C6)` passed | `test/whatsapp-first-contact.e2e-spec.ts:210-212` - `expect(a.barbershop_id).toBe(shopA)`, `expect(b.barbershop_id).toBe(shopB)`, `expect(a.id).not.toBe(b.id)`; `:213-220` - `expect(connector.sentTexts).toEqual([{ barbershopId: shopA, phone: PHONE, text: noticeFor('Barbearia do Zé') }, { barbershopId: shopB, phone: PHONE, text: noticeFor('Barbearia B') }])` | PASS |
| C7 | exatamente 1 `sendText(barbershopId, "+5511987654321", <aviso exato>)` | e2e batch, exit 0, `(C7)` passed | `test/whatsapp-first-contact.e2e-spec.ts:228-234` - `expect(connector.sentTexts).toEqual([{ barbershopId: shopA, phone: PHONE, text: \`Olá! Aqui é o assistente virtual da Barbearia do Zé. O atendimento é feito por inteligência artificial, e usamos seu nome e telefone para agendar seus horários. Política de privacidade: ${policyUrl}\` }])`, texto literal igual ao do cabeçalho de `checks.md:13` | PASS |
| C8 | `privacy_notice_sent_at` = `2026-09-29T15:00:00Z` | e2e batch, exit 0, `(C8)` passed | `test/whatsapp-first-contact.e2e-spec.ts:241` - `expect(row.privacy_notice_sent_at).toEqual(NOW)` (`:18` `NOW = new Date('2026-09-29T15:00:00.000Z')`) | PASS |
| C9 | segunda mensagem -> 204 e o fake continua com 1 envio | e2e batch, exit 0, `(C9)` passed | `test/whatsapp-first-contact.e2e-spec.ts:246` - `await messageUpsert().expect(204)`; `:248` - `expect(connector.sentTexts).toHaveLength(1)` | PASS |
| C10 | cliente do painel com aviso nulo recebe 1 `sendText` com o aviso | e2e batch, exit 0, `(C10)` passed | `test/whatsapp-first-contact.e2e-spec.ts:252` - `insertPanelClient(shopA, 'Carlos', PHONE)` (INSERT sem a coluna, `:79-80`); `:256-262` - `expect(connector.sentTexts).toEqual([{ barbershopId: shopA, phone: PHONE, text: noticeFor('Barbearia do Zé') }])` | PASS |
| C11 | 2 webhooks paralelos -> 1 `sendText`; o mesmo corpo 2 vezes em sequência -> 1 | e2e batch, exit 0, os 2 `(C11)` passed | `test/whatsapp-first-contact.e2e-spec.ts:268` - `Promise.all([messageUpsert(), messageUpsert()])`; `:270` - `expect(connector.sentTexts).toHaveLength(1)`; `:283-289` - o mesmo `payload` (id `MESSAGE-1`) postado 2 vezes com `.expect(204)`; `:291` - `expect(connector.sentTexts).toHaveLength(1)` | PASS |
| C12 | fake rejeitando -> 204 e aviso nulo; fake de volta -> 1 `sendText` e instante gravado | e2e batch, exit 0, `(C12)` passed | `test/whatsapp-first-contact.e2e-spec.ts:295` - `connector.failing.add('sendText')` (o fake rejeita com `WhatsAppConnectorUnavailableError`, `src/usecases/testing/fake-whatsapp-connector.ts:67-69`); `:297` - `.expect(204)`; `:300` - `expect(failed.privacy_notice_sent_at).toBeNull()`; `:304` - `.expect(204)`; `:307` - `expect(sent.privacy_notice_sent_at).toEqual(NOW)`; `:308` - `expect(connector.sentTexts).toHaveLength(1)` | PASS |
| C13 | env recusa sem `PRIVACY_POLICY_URL` e com `politica`; aceita `https://barberbot.example/privacidade` | unit batch, exit 0, 3 casos `(C13)` passed | `src/infrastructure/config/env.schema.spec.ts:133-135` - `expect(() => validateEnv({ ...validEnv, PRIVACY_POLICY_URL: undefined })).toThrow(/PRIVACY_POLICY_URL/)`; `:139-141` - `PRIVACY_POLICY_URL: 'politica'` `.toThrow(/PRIVACY_POLICY_URL/)`; `:145-147` - `expect(validateEnv(validEnv).PRIVACY_POLICY_URL).toBe('https://barberbot.example/privacidade')` | PASS |
| C14 | coluna `timestamp with time zone`, anulável, sem `DEFAULT`; insert sem ela -> `NULL` | e2e batch, exit 0, `(C14)` passed | `test/whatsapp-first-contact.e2e-spec.ts:323-327` - `expect(column).toEqual({ data_type: 'timestamp with time zone', is_nullable: 'YES', column_default: null })` (lido de `information_schema.columns`, `:319-321`); `:331` - `expect(row.privacy_notice_sent_at).toBeNull()` | PASS |
| C15 | controller: 13 casos não chamam o use case e resolvem; 300 s chama uma vez com só `{ barbershopId, phone, profileName }` | unit batch, exit 0, 14 casos `(C15)` passed | `src/infrastructure/external/whatsapp/evolution/evolution-webhook.controller.spec.ts:212` - `await expect(controller.receive(payload)).resolves.toBeUndefined()`; `:214` - `expect(calls).toEqual([])` sobre os 13 casos `:184-208` (mesmos 13 do claim); `:220` - `messageTimestamp: NOW_SECONDS - 300`; `:222-228` - `expect(calls).toEqual([{ barbershopId: SHOP, phone: '+5511987654321', profileName: 'João Silva' }])` | PASS |
| C16 | e2e: `fromMe`, grupo e 10 min -> 204, sem cliente e sem `sendText` | e2e batch, exit 0, 3 casos `(C16)` passed | `test/whatsapp-first-contact.e2e-spec.ts:341` - `await messageUpsert(overrides).expect(204)` sobre `:337-339`; `:343-348` - `SELECT id FROM clients WHERE barbershop_id = $1` `.toEqual([])`; `:349` - `expect(connector.sentTexts).toEqual([])`; `:350` - `expect(connector.calls).toEqual([])` | PASS |
| C17 | barbearia sem conexão -> 204, sem cliente, sem `sendText` | e2e batch, exit 0, `(C17)` passed | `test/whatsapp-first-contact.e2e-spec.ts:354` - `messageUpsert({ instance: shopB }).expect(204)` (só `shopA` é conectada no `beforeEach`, `:156-157`); `:356` - `expect(await clientsOf(shopB)).toEqual([])`; `:357` - `expect(connector.calls).toEqual([])` | PASS |
| C18 | instância nova com `webhook.events` = `["CONNECTION_UPDATE", "MESSAGES_UPSERT"]` | unit batch, exit 0, `(C18)` passed | `src/infrastructure/external/whatsapp/evolution/evolution-whatsapp-connector.spec.ts:217` - `expect((create.body as { webhook: unknown }).webhook).toEqual(WEBHOOK)`, com `WEBHOOK.events = ['CONNECTION_UPDATE', 'MESSAGES_UPSERT']` em `:65` | PASS |
| C19 | instância existente -> `POST /webhook/set/{id}` com `apikey` e o corpo completo, sem `create`; 5xx -> `WhatsAppConnectorUnavailableError` | unit batch, exit 0, 2 casos `(C19)` passed | `evolution-whatsapp-connector.spec.ts:229` - `expect(set.url).toBe(\`http://evolution.test/webhook/set/${SHOP}\`)`; `:230` - `expect(set.headers.apikey).toBe('evolution-key')`; `:231` - `expect(set.body).toEqual({ webhook: WEBHOOK })` (`:62-68`: `enabled: true`, a URL, `byEvents: false`, os 2 eventos, `authorization: Bearer <segredo>`); `:232` - `requests.some(url.endsWith('/instance/create'))` `.toBe(false)`; `:240` - `status: 500`; `:243-245` - `rejects.toBeInstanceOf(WhatsAppConnectorUnavailableError)` | PASS |
| C20 | `sendText` -> `POST /message/sendText/<id>`, `apikey`, `{ number: "5511987654321", text: "oi" }`; 4 falhas rejeitam e somam 1 no contador | unit batch, exit 0, 5 casos `(C20)` passed | `evolution-whatsapp-connector.spec.ts:256-258` - `expect(requests[0].url).toBe(\`http://evolution.test/message/sendText/${SHOP}\`)`; `:259` - `expect(requests[0].headers.apikey).toBe('evolution-key')`; `:260` - `expect(requests[0].body).toEqual({ number: '5511987654321', text: 'oi' })`; `:279` - `rejects.toBeInstanceOf(WhatsAppConnectorUnavailableError)` e `:281-283` - `expect(await registry.metrics()).toContain('whatsapp_connector_errors_total{operation="sendText"} 1')` sobre `:265-270` (`hang`, `network`, 500, 200 com `{ error: true }`) | PASS |
| C21 | nenhuma chamada a `Logger` (5 métodos) contém `987654321`, `João Silva` ou `inteligência artificial`, com envio ok e com falha | e2e batch, exit 0, `(C21)` passed | `test/whatsapp-first-contact.e2e-spec.ts:363-368` - spies em `log`, `error`, `warn`, `debug`, `verbose`; `:370` e `:373` - um contato ok e um com `sendText` falhando; `:378` - `expect(spies[1]).toHaveBeenCalled()` (o `error` do envio falho foi capturado); `:379-381` - `expect(logged).not.toContain('987654321')`, `not.toContain('João Silva')`, `not.toContain('inteligência artificial')` | PASS |
| C22 | contato ok soma 1 em `clients_created` e 1 em `sent`; falha soma 1 em `failed`; nenhuma linha com label além de `outcome` | re-run at 1ba3bc8: e2e, exit 0, `(C22)` passed | verified at 1ba3bc8: `test/whatsapp-first-contact.e2e-spec.ts:396` - um primeiro contato `.expect(204)`; `:398-400` - `expect(await metricValue('whatsapp_clients_created_total')).toBe(created + 1)`; `:401-403` - `{outcome="sent"}` `.toBe(sent + 1)`; `:404-406` - `{outcome="failed"}` `.toBe(failed)`; `:410` - contato com `sendText` falhando; `:412-414` - `{outcome="sent"}` continua `sent + 1`; `:415-417` - `{outcome="failed"}` `.toBe(failed + 1)`; `:425` - `expect(lines.length).toBeGreaterThan(0)`; `:427-429` - `expect(line).toMatch(...)` com uma regex ancorada que só aceita `whatsapp_clients_created_total <n>` sem label ou `whatsapp_privacy_notices_total{outcome="sent"}` / `{outcome="failed"}` seguido do valor | PASS |
| C23 | `npx eslint src` exit 0 com `boundaries/dependencies` ativa; nada fora de `src/infrastructure/` importa `external/whatsapp` | comandos at acca44b, exit 0 e 0 | `npx eslint src` exit 0; regra em `eslint.config.mjs:70` - `'boundaries/dependencies': ['error', ...]`; o grep negado de `checks.md:93` exit 0, e sem o filtro só lista `src/infrastructure/modules/whatsapp.module.ts` | PASS |
| C24 | a descrição de `POST /webhooks/whatsapp/evolution` contém `messages.upsert` e `US-14` | re-run at 1ba3bc8: e2e, exit 0, `(C24)` passed | verified at 1ba3bc8: `test/api-docs.e2e-spec.ts:159` - `expect(hook.description).toContain('messages.upsert')`; `:161` - `expect(hook.description).toContain('(US-14)')`; `:160` - `expect(hook.summary).toContain('US-14')`. A asserção sobre a descrição agora cobre sozinha a metade `US-14` do claim (texto em `src/infrastructure/external/whatsapp/evolution/evolution-webhook.controller.ts:66`) | PASS |

### Level and sampling judgment

C22 e C24 foram re-judged at 1ba3bc8. O resto é carried from acca44b.

- Todo check que cita status, rota ou formato (C1, C3, C5-C12, C16, C17, C22, C24) tem prova e2e que passa pela rota HTTP com supertest contra o `AppModule` e o Postgres do compose, ou lê o documento OpenAPI montado (C24). C14 vai ao `information_schema`. Não há gaps de nível.
- C2, C4, C15, C18, C19 e C20 provam as tabelas de decisão no nível do componente (função, use case com fakes, controller com use case falso, adaptador com `fetch` falso), como `checks.md:118` declara. Nenhum desses claims cita status HTTP nosso.
- Amostragem: os claims sobre N casos foram provados com N casos, e cada um rodou: C2 ×10, C4 ×8, C13 ×3, C15 ×13 + 1, C16 ×3, C19 ×2, C20 ×1 + 4, C11 ×2. Não há gaps de amostragem.
- **C24 (resolvido no round 2):** `api-docs.e2e-spec.ts:161` confere `(US-14)` só na `description`, então uma descrição sem `US-14` agora falha o teste. `:160` confere o `summary` à parte. Não há gap de precisão.
- **C22 (resolvido no round 2):** o `+1` de `whatsapp_clients_created_total` e de `outcome="sent"` é conferido logo depois de um único contato bem-sucedido (`:398-403`). `failed` é conferido sem mudança nesse ponto (`:404-406`) e com `+1` só depois do envio que falha (`:415-417`). Cada incremento do claim fica isolado. Não há gap de precisão.
- **C11 concorrente:** o teste cria o cliente antes (`:266`), então isola a corrida do aviso (door 3) da corrida do cadastro (door 2, C5). O `UPDATE` condicional que decide está em `src/infrastructure/database/repositories/typeorm-client.repository.ts:107` (`... AND privacy_notice_sent_at IS NULL`) com `:111` `return result.affected === 1`. Sob `light` não houve injeção de falhas, então não está medido se uma implementação "envia e depois grava" perderia a corrida de forma determinística no teste.
- **C21:** os spies cobrem as chamadas ao `Logger` do Nest, que é o que o claim nomeia. O log de requisição do `pino-http` não passa por eles; na execução ele só trouxe método, URL, headers com `authorization` redigido e status, sem corpo.
- Precisão: os demais valores (telefones, nomes, texto do aviso, instante, eventos, URLs, corpos) são literais visíveis na asserção ou em constantes do topo do arquivo (`test/whatsapp-first-contact.e2e-spec.ts:18-21`, `evolution-whatsapp-connector.spec.ts:60-68`).

### Swept `existing` re-read

carried from acca44b. O fix não tocou código de produção.

- authorization (guard do segredo do webhook, US-13): o controller continua `@Public()` (`src/infrastructure/external/whatsapp/evolution/evolution-webhook.controller.ts:49`) com `@UseGuards(EvolutionWebhookGuard)` (`:51`), e o guard compara com `Bearer ${secret}` (`src/infrastructure/external/whatsapp/evolution/evolution-webhook.guard.ts:22`). O tenant vem de `instance` validado como UUID (`evolution-webhook.controller.ts:102-104`), e as queries do repositório filtram por `barbershop_id` (`typeorm-client.repository.ts:107`, `:120`). O e2e C6 prova a separação por barbearia.
- unicidade `(barbershop_id, phone)` da US-10 citada no Relations: existe em `src/infrastructure/database/migrations/1790624650790-AddClients.ts:8` (`CONSTRAINT "clients_barbershop_phone_unique" UNIQUE ("barbershop_id", "phone")`), e o door 2 a usa em `typeorm-client.repository.ts:87` (`ON CONFLICT ON CONSTRAINT clients_barbershop_phone_unique DO NOTHING`).

### Landing rows against the diff (observations)

carried from acca44b. O fix não tocou código de produção.

- door 1: bate. `sendText` no port (`src/usecases/ports/whatsapp-connector.port.ts`), `number` sem `+` e `POST /message/sendText/{id}` (`evolution-whatsapp-connector.ts`), eventos `['CONNECTION_UPDATE', 'MESSAGES_UPSERT']` e `POST /webhook/set/{id}` quando a instância existe.
- door 2: bate, com `RETURNING id` e a coluna `return_reminder_enabled` a mais no `INSERT` (`typeorm-client.repository.ts:82-98`), seguido de `findByPhone` no use case (`src/usecases/receive-whatsapp-message/receive-whatsapp-message.use-case.ts:88-91`).
- door 3: a coluna bate (`src/infrastructure/database/migrations/1790700000000-AddClientPrivacyNotice.ts`, `TIMESTAMP WITH TIME ZONE` nula, sem default). A reivindicação não é o literal `UPDATE ... RETURNING id` do plano: é o query builder com `affected === 1` (`typeorm-client.repository.ts:100-112`). O `WHERE` é o mesmo, e a troca está registrada em `checks.md` Handoff "Abandoned". A liberação bate com o literal (`:114-125`).
- door 4 e door 5: batem (`whatsapp-jid.ts`, regex `^(55\d{2})([6-9]\d{7})$`; `evolution-webhook.controller.ts:101-109`, janela `> 5 min` ignorada, 300 s processado).
- Fora do plano, sem check: `clientName` remove um *high surrogate* solto depois de cortar em 80 (`receive-whatsapp-message.use-case.ts:128-130`), então um nome cujo 80º caractere é metade de um emoji fica com 79. É defensivo e não contradiz o AC 5 para texto comum.

## Coverage

carried from acca44b. Em `light` o join é lido, não recomputado, e o fix não acrescentou membro.

| Set (size) | Recomputed from | Member -> proof | Unproven |
| --- | --- | --- | --- |
| todas as linhas do Coverage de `checks.md` (14 conjuntos) | read, not recomputed (`light`) | como listado em `checks.md:100-115`, cada membro resolvido para uma asserção localizada na tabela acima | - |

## Gate

No round 2 (1ba3bc8), o e2e completo dos dois arquivos tocados rodou com exit 0: 2 suites, 28 passed, 0 failed. O fix só mexeu nesses dois arquivos de teste, então o gate completo abaixo é carried from acca44b.

- `npm run lint:check` - exit 0
- `npm run build` - exit 0
- `npm test` - 89 suites, 979 passed, 0 failed
- `npm run test:e2e` - 42 suites, 618 passed, 0 failed
