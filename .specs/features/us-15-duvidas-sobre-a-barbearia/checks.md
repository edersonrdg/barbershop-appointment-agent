# US-15: Bot responde dúvidas sobre a barbearia checks

Profile: light
Plan: `.specs/features/us-15-duvidas-sobre-a-barbearia/plan.md`

29 checks em 5 fatias · 4 one-way doors · 3 open, 0 block (3 blocks go-live)

Um check concluído termina com ✅. Convenção das provas: todo teste cita o `CA` (ou o AC do plano, quando o CA não cobre) e o id do check entre parênteses no nome, ex.: `it('CA-15.1 (C1): ...')`. O seletor `-t` usa esse id.

- e2e: `npx jest --config ./test/jest-e2e.json <arquivo> -t "<padrão>"` (Postgres do compose rodando; `WHATSAPP_CONNECTOR` e `MESSAGE_INTERPRETER` trocados por fakes, relógio por `FixedClock`)
- unitário: `npx jest <arquivo> -t "<padrão>"`

Valores usados nas provas: relógio em `2026-09-29T15:00:00Z` (`messageTimestamp` `1790694000`); barbearia "Barbearia do Zé"; serviços ativos "Corte" (4500 centavos, 30 min) e "Barba" (3000, 20 min), e "Hidratação" (6000, 40 min) inativo; o texto enviado pelo cliente é `data.message.conversation` ou `data.message.extendedTextMessage.text`, e o id é `data.key.id`. A interpretação do fake é escolhida por teste.

Textos esperados, com `{barbearia}` = "Barbearia do Zé":

- recusa: "Desculpe, só posso ajudar com assuntos da {barbearia}: serviços, preços, endereço e horário de funcionamento."
- sem tópico: "Posso te ajudar com serviços, preços, endereço e horário de funcionamento da {barbearia}. O que você gostaria de saber?"
- indisponível: "Desculpe, não consegui responder agora. Tente de novo em alguns instantes."

## Checks

### S1 - Preços e durações dos serviços · ~8 arquivos · ~45 KB · ~11k

**C1** - Com a interpretação `{ topics: ['services'], services: ['Corte', 'Barba'], unknownServices: [], offTopic: false }`, um webhook `messages.upsert` de um cliente que já recebeu o aviso, com texto "quanto custa corte e barba?", responde `204` e o fake do conector registra exatamente 1 `sendText` para `+5511987654321` com "Na Barbearia do Zé:\n- Barba: R$ 30,00, 20 min\n- Corte: R$ 45,00, 30 min" (ordem do catálogo, não a do modelo) (AC 1, CA-15.1, RF-05)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-questions.e2e-spec.ts -t "\(C1\)"`

**C2** - A formatação, testada por tabela, dá para o preço: 0 → `R$ 0,00`; 5 → `R$ 0,05`; 4500 → `R$ 45,00`; 123450 → `R$ 1.234,50`; 1000000 → `R$ 10.000,00` (espaço comum depois de `R$`); e para a duração: 5 → `5 min`; 30 → `30 min`; 60 → `1h`; 90 → `1h30`; 125 → `2h05`; 480 → `8h` (AC 2)
Proof: `npx jest src/usecases/answer-client-question/answer-client-question.use-case.spec.ts -t "\(C2\)"`

**C3** - Com a interpretação `{ topics: ['services'], services: [], unknownServices: [] }`, a resposta é "Na Barbearia do Zé:\n- Barba: R$ 30,00, 20 min\n- Corte: R$ 45,00, 30 min", sem o serviço inativo (AC 3)
Proof: `npx jest src/usecases/answer-client-question/answer-client-question.use-case.spec.ts -t "\(C3\)"`

**C4** - Com a interpretação `{ topics: ['services'], services: [], unknownServices: ['Pé e mão'] }`, o webhook gera 1 `sendText` com "A Barbearia do Zé não oferece Pé e mão.", sem `R$` no texto; e, no use case, `services: ['Corte']` com `unknownServices: ['Pé e mão']` dá "Na Barbearia do Zé:\n- Corte: R$ 45,00, 30 min\nA Barbearia do Zé não oferece Pé e mão." (AC 4, CA-15.2, RF-09)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-questions.e2e-spec.ts -t "\(C4\)"`
Proof: `npx jest src/usecases/answer-client-question/answer-client-question.use-case.spec.ts -t "\(C4\)"`

**C5** - O casamento de nomes, testado por tabela no use case, dá: `'corte'` → linha de "Corte" com o preço cadastrado; `'Hidratação'` (inativo) → "A Barbearia do Zé não oferece Hidratação."; `'Luzes'` (serviço ativo só da barbearia B) → "A Barbearia do Zé não oferece Luzes." (AC 5, RN-26)
Proof: `npx jest src/usecases/answer-client-question/answer-client-question.use-case.spec.ts -t "\(C5\)"`

**C6** - Numa barbearia sem serviço ativo, a interpretação com o tópico `services` dá "A Barbearia do Zé ainda não tem serviços cadastrados." (AC 6)
Proof: `npx jest src/usecases/answer-client-question/answer-client-question.use-case.spec.ts -t "\(C6\)"`

**C7** - O fake do intérprete recebe, para uma mensagem da barbearia A, `{ barbershopName: 'Barbearia do Zé', serviceNames: ['Barba', 'Corte'], text }`: sem "Hidratação" (inativo) e sem os serviços da barbearia B (AC 7, RN-26, door 1)
Proof: `npx jest src/usecases/answer-client-question/answer-client-question.use-case.spec.ts -t "\(C7\)"`

### S2 - Endereço e horário de funcionamento · ~3 arquivos · ~20 KB · ~5k

**C8** - Com o endereço "Rua das Flores, 123 - Centro" gravado e a interpretação `{ topics: ['address'] }`, o webhook gera 1 `sendText` com "Endereço da Barbearia do Zé: Rua das Flores, 123 - Centro" (AC 8, CA-15.4)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-questions.e2e-spec.ts -t "\(C8\)"`

**C9** - Com o endereço nulo, o tópico `address` dá "A Barbearia do Zé ainda não informou o endereço." (AC 9)
Proof: `npx jest src/usecases/answer-client-question/answer-client-question.use-case.spec.ts -t "\(C9\)"`

**C10** - Com segunda 09:00-18:00 e intervalo 12:00-13:00, terça a sexta 09:00-18:00, sábado 08:00-12:00 e domingo fechado gravados, a interpretação `{ topics: ['opening_hours'] }` gera 1 `sendText` com "Horário de funcionamento:\nSegunda-feira: 09:00 às 18:00 (intervalo 12:00 às 13:00)\nTerça-feira: 09:00 às 18:00\nQuarta-feira: 09:00 às 18:00\nQuinta-feira: 09:00 às 18:00\nSexta-feira: 09:00 às 18:00\nSábado: 08:00 às 12:00\nDomingo: fechado" (AC 10, CA-15.4)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-questions.e2e-spec.ts -t "\(C10\)"`

**C11** - A interpretação `{ topics: ['opening_hours', 'address', 'services'], services: ['Corte'] }` gera exatamente 1 `sendText` cujo texto é o bloco de serviços, `\n\n`, o bloco de endereço, `\n\n`, o bloco de horário, nessa ordem (AC 11)
Proof: `npx jest src/usecases/answer-client-question/answer-client-question.use-case.spec.ts -t "\(C11\)"`

### S3 - Fora de contexto e mensagens sem tópico · ~3 arquivos · ~20 KB · ~5k

**C12** - Com a interpretação `{ topics: ['services'], offTopic: true }`, o webhook de "me ajuda com um trabalho da faculdade" gera 1 `sendText` com exatamente o texto de recusa, sem preço (AC 12, CA-15.3, RF-08)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-questions.e2e-spec.ts -t "\(C12\)"`

**C13** - Com a interpretação `{ topics: [], offTopic: false }`, a resposta é o texto de sem tópico (AC 13)
Proof: `npx jest src/usecases/answer-client-question/answer-client-question.use-case.spec.ts -t "\(C13\)"`

**C14** - Três webhooks de um cliente que já recebeu o aviso, um com `message: { audioMessage: {} }`, um com `conversation: "   "` e um sem `message`, respondem `204` e deixam o fake do intérprete com 0 chamadas e o fake do conector com 0 `sendText`; e o de áudio de um número novo cria o cliente e envia só o aviso (AC 14)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-questions.e2e-spec.ts -t "\(C14\)"`

### S4 - Ordem, unicidade e falhas · ~6 arquivos · ~40 KB · ~10k

**C15** - A primeira mensagem de um número novo, com texto e a interpretação `{ topics: ['address'] }`, deixa no fake do conector exatamente 2 `sendText`, o aviso de privacidade primeiro e a resposta depois; e os dois já estão registrados quando o webhook responde `204` (AC 15, door 4)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-questions.e2e-spec.ts -t "\(C15\)"`

**C16** - O mesmo corpo com o mesmo `data.key.id` enviado 2 vezes em paralelo e depois 1 vez em sequência gera exatamente 1 chamada ao intérprete e 1 resposta; o mesmo `key.id` enviado à barbearia B, também conectada, gera a resposta de B (AC 16, door 3)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-questions.e2e-spec.ts -t "\(C16\)"`

**C17** - Com o fake do intérprete rejeitando com `MessageInterpreterUnavailableError`, o webhook responde `204` e o fake do conector registra 1 `sendText` com exatamente o texto de indisponível (AC 17)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-questions.e2e-spec.ts -t "\(C17\)"`

**C18** - O adaptador do Gemini rejeita com `MessageInterpreterUnavailableError`, testado por tabela com o SDK trocado por fake, quando: o SDK rejeita; o `abortSignal` dispara antes da resposta (timeout); `text` não é JSON; o JSON não tem `offTopic`; `topics` traz `'booking'`; `unknownServices` tem 4 itens; um desconhecido tem 61 caracteres; e resolve quando `unknownServices` tem 3 itens de 60 caracteres (AC 17, AC 20, door 2)
Proof: `npx jest src/infrastructure/external/gemini/gemini-message-interpreter.spec.ts -t "\(C18\)"`

**C19** - Com o fake do conector falhando só no `sendText` da resposta (o cliente já recebeu o aviso), o webhook responde `204`; o controller loga o erro com `barbershopId` e o nome do erro, e o objeto logado não contém o telefone nem o texto da mensagem (AC 18)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-questions.e2e-spec.ts -t "\(C19\)"`
Proof: `npx jest src/infrastructure/external/whatsapp/evolution/evolution-webhook.controller.spec.ts -t "\(C19\)"`

**C20** - Uma mensagem de 1500 caracteres chega ao intérprete com os 1000 primeiros (`text.length === 1000`); uma de 1000 chega inteira (AC 19)
Proof: `npx jest src/usecases/answer-client-question/answer-client-question.use-case.spec.ts -t "\(C20\)"`

### S5 - Gemini isolado e observável · ~9 arquivos · ~55 KB · ~14k

**C21** - Nenhum arquivo de `src/` fora de `src/infrastructure/external/gemini/` importa `@google/genai` (AC 21, door 2)
Proof: `test -z "$(grep -rl '@google/genai' src --include=*.ts | grep -v '^src/infrastructure/external/gemini/')"`

**C22** - O adaptador chama `models.generateContent` uma vez com `model` = o `GEMINI_MODEL` configurado, `contents` = o texto, e `config` com `responseMimeType: 'application/json'`, `responseJsonSchema` igual a `z.toJSONSchema` do schema da interpretação, `temperature: 0`, um `abortSignal` do tipo `AbortSignal` e `systemInstruction` contendo o nome da barbearia e cada nome de serviço; e `ping` chama `models.get({ model })` (AC 22, door 2)
Proof: `npx jest src/infrastructure/external/gemini/gemini-message-interpreter.spec.ts -t "\(C22\)"`

**C23** - O schema de ambiente recusa: sem `GEMINI_API_KEY`; `GEMINI_API_KEY=""`; sem `GEMINI_MODEL`; `NODE_ENV=production` com `GEMINI_MODEL=gemini-flash-latest`; aceita `production` com `gemini-2.5-flash` e `development` com `gemini-flash-latest`; e `GEMINI_TIMEOUT_MS` ausente vira `8000` (AC 23)
Proof: `npx jest src/infrastructure/config/env.schema.spec.ts -t "\(C23\)"`

**C24** - Num registry novo, depois de uma chamada bem-sucedida com `usageMetadata { promptTokenCount: 120, candidatesTokenCount: 15 }`, o registry mostra `gemini_requests_total{outcome="ok"} 1`, `gemini_tokens_total{type="prompt"} 120`, `gemini_tokens_total{type="output"} 15` e `gemini_request_duration_seconds_count 1`; e, por tabela, uma rejeição do SDK conta `outcome="error"`, um timeout `outcome="timeout"` e um JSON inválido `outcome="invalid"`; nenhuma dessas métricas tem outro label além de `outcome` ou `type` (AC 24, RNF-01, CA-15.5)
Proof: `npx jest src/infrastructure/external/gemini/gemini-message-interpreter.spec.ts -t "\(C24\)"`

**C25** - Em cada chamada (ok e erro) o adaptador loga um objeto com `model`, `latencyMs`, `outcome`, e `promptTokens` e `outputTokens` quando houver, e a serialização do que foi logado não contém o texto do cliente nem o `text` devolvido pelo modelo (AC 25)
Proof: `npx jest src/infrastructure/external/gemini/gemini-message-interpreter.spec.ts -t "\(C25\)"`

**C26** - Por tabela no e2e, cada cenário aumenta em 1 exatamente um valor de `whatsapp_replies_total`: interpretação com tópico → `kind="answer"`; `offTopic: true` → `kind="off_topic"`; sem tópico → `kind="fallback"`; intérprete rejeitando → `kind="unavailable"` (AC 26)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-questions.e2e-spec.ts -t "\(C26\)"`

**C27** - `GET /health/ready` responde `200` com `details.gemini.status = 'up'` quando o `ping` do fake do intérprete resolve, e `503` com `details.gemini.status = 'down'` quando rejeita (AC 27)
Proof: `npx jest --config ./test/jest-e2e.json test/app.e2e-spec.ts -t "\(C27\)"`

**C28** - No documento OpenAPI, a descrição de `POST /webhooks/whatsapp/evolution` contém `US-15` (AC 28)
Proof: `npx jest --config ./test/jest-e2e.json test/api-docs.e2e-spec.ts -t "\(C28\)"`

**C29** - A tabela `whatsapp_inbound_messages` tem chave primária exatamente em `(barbershop_id, message_id)`, `received_at` do tipo `timestamp with time zone` e `NOT NULL`, e nenhuma coluna além de `barbershop_id`, `message_id` e `received_at`; depois de uma mensagem com texto, a linha tem o `key.id` e `received_at = 2026-09-29T15:00:00Z` (door 3, Relations)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-questions.e2e-spec.ts -t "\(C29\)"`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| tópicos da interpretação (3) | `services` C1 · `address` C8 · `opening_hours` C10 | - |
| ramos da resposta (7) | serviços citados C1 · todos os serviços C3 · desconhecido C4 · catálogo vazio C6 · recusa C12 · sem tópico C13 · indisponível C17 | - |
| origem de "desconhecido" (4) | citado pelo modelo C4 · caixa diferente casa C5 · inativo C5 · de outra barbearia C5 | - |
| mensagens sem resposta (3) | áudio C14 · texto em branco C14 · sem `message` C14 | - |
| campos de texto da Evolution (2) | `conversation` C1 · `extendedTextMessage.text` C12 | - |
| desfechos do Gemini (4) | `ok` C24 · `error` C24 · `timeout` C24 · `invalid` C24 | - |
| rejeições do schema da interpretação (5) | não é JSON C18 · sem `offTopic` C18 · tópico fora do enum C18 · 4 desconhecidos C18 · desconhecido de 61 C18 | - |
| `kind` de `whatsapp_replies_total` (4) | `answer` C26 · `off_topic` C26 · `fallback` C26 · `unavailable` C26 | - |
| variáveis do Gemini (3) | `GEMINI_API_KEY` C23 · `GEMINI_MODEL` C23 · `GEMINI_TIMEOUT_MS` C23 | - |
| doors do plano (4) | 1 port C7, C22 · 2 SDK e chamada C21, C22 · 3 reivindicação C16, C29 · 4 síncrono C15 | - |
| `GET /health/ready` estados do `gemini` (2) | `up`/200 C27 · `down`/503 C27 | - |
| startup config: intérprete (2 assemblies) | `WhatsAppModule` na aplicação C27 (sobe o `AppModule` e troca só o port) · fake nos e2e C1 | - |

- Claims naming a status code, route or response shape: C1, C14, C15, C17, C19, C27, C28 - each has a proof that crosses the boundary
- C1 e C12 provam também os dois campos de texto da Evolution (`conversation` e `extendedTextMessage.text`, respectivamente)
- No other check claims more than the single case its proof exercises

## Swept

- validation: C14, C18, C20, C23
- failure modes: C17, C19
- idempotency: C16
- authorization: existing - `EvolutionWebhookGuard` (US-13) protege o webhook; nenhuma rota nova
- concurrency: C16 (duas entregas em paralelo)
- data lifecycle: n/a - a tabela guarda só ids sem dado pessoal; a limpeza está fora de escopo até a retenção ser definida (seção 19)
- dependency failure: C17, C18, C27
- state transitions: n/a - não há máquina de estados; a reivindicação é única e não é desfeita (C16)
- observability: C24, C25, C26

## Handoff

- S1 = 11k, S2 entra a 16k, S3 a 21k, S4 a 31k, S5 a 45k (arquivos tocados e vizinhos lidos, ~180 KB / 4), abaixo do budget de 150k - one builder
