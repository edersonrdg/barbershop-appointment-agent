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

### AD-007
- **Decision**: O `SessionGuard` confere a sessão no banco a cada requisição autenticada: busca o usuário por `(barbershopId, sub)` do JWT, responde 401 se ele não existe e usa o `role` gravado no banco, não o do token. A autorização por perfil é negada por padrão: rota autenticada sem `@Roles(...)` aceita só `owner`; o barbeiro só entra onde houver `@Roles('owner', 'barber')`. Perfil fora da lista responde `403 { message: 'Acesso negado.' }`.
- **Reason**: CA-02.3 exige revogar o acesso de um barbeiro removido na hora, o que o JWT sozinho não permite. Negar por padrão faz toda rota das próximas histórias nascer fechada para o Barbeiro (PRD seção 5), no mesmo espírito do AD-003.
- **Trade-off**: Uma leitura por chave primária em toda requisição autenticada. Substitui o trade-off do AD-004 ("não dá para revogar um token antes de expirar"); a regra de tenant do AD-004 continua valendo.
- **Scope**: Todos os controllers HTTP autenticados.
- **Date**: 2026-09-27
- **Status**: active

### AD-008
- **Decision**: As regras de agendamento (US-06) ficam na tabela `barbershop_booking_rules`, uma linha por barbearia, lidas e gravadas pelo port `BookingRulesRepository` (`findByBarbershopId`, `save`). Os padrões vivem só no value object `BookingRules.defaults()`; o `createWithOwner` grava as regras na mesma transação da barbearia, e o banco não tem `DEFAULT` nessas colunas.
- **Reason**: Salvar as regras não pode tocar os dados da barbearia (CA-06.2), e as histórias US-07, US-11, US-17, US-18, US-24 e US-25 leem só as regras, sem carregar o agregado `Barbershop`. Uma tabela à parte também não quebra os testes que inserem barbearias por SQL.
- **Trade-off**: Toda criação de barbearia precisa passar as regras; uma barbearia inserida por fora da aplicação fica sem regras até alguém gravá-las.
- **Scope**: Regras de agendamento, US-06 em diante.
- **Date**: 2026-09-28
- **Status**: active

### AD-009
- **Decision**: Rotinas agendadas que valem para todas as barbearias (a primeira é o reset de faltas da US-11) listam os ids das barbearias com `BarbershopRepository.listIds()`, a única leitura sem tenant fora dos lookups de identidade do AD-004, e aplicam a regra barbearia por barbearia, com métodos de repositório que recebem o `barbershopId`. O erro de uma barbearia é contado e logado, e a rotina segue para a próxima.
- **Reason**: RN-26 e AD-004: nenhuma gravação sem tenant. Uma rotina precisa começar de algum lugar, e limitar a exceção a listar ids mantém toda regra de negócio dentro do tenant.
- **Trade-off**: N consultas por execução (uma por barbearia) em vez de um `UPDATE` global.
- **Scope**: Jobs agendados (`src/infrastructure/jobs/`), US-11 em diante (lembretes da US-19, retorno da US-25).
- **Date**: 2026-09-29
- **Status**: active

### AD-010
- **Decision**: O opt-in do lembrete de retorno fica em `clients.return_reminder_enabled boolean NOT NULL DEFAULT false`, criado na US-12 como mínimo estrutural. O `Client.create` também nasce com `false`, e o insert da US-10 grava o valor do domínio. A US-25 só passa a alterar a coluna e acrescenta o registro de consentimento (CA-25.5).
- **Reason**: O perfil da US-12 precisa mostrar o status do lembrete (CA-12.2), e o padrão do CA-25.1 é desativado. O `DEFAULT` mantém válidos os `INSERT INTO clients` dos e2e e os clientes que a US-14 vai criar.
- **Trade-off**: Diverge do AD-008 (padrões só no domínio, sem `DEFAULT` no banco): aqui o padrão vive nos dois lugares, e os dois precisam continuar `false`.
- **Scope**: Tabela `clients`, US-12 em diante (US-14, US-25).
- **Date**: 2026-09-29
- **Status**: active

### AD-011
- **Decision**: O WhatsApp passa só pelo port `WhatsAppConnector` (`src/usecases/ports/whatsapp-connector.port.ts`), que devolve tipos neutros; o único adaptador é o da Evolution API, em `src/infrastructure/external/whatsapp/evolution/`, junto com o controller do webhook. Cada barbearia tem uma instância na Evolution com `instanceName = barbershopId`, e o webhook (`POST /webhooks/whatsapp/evolution`, `@Public()`, autenticado por `authorization: Bearer <WHATSAPP_WEBHOOK_SECRET>`) resolve o tenant pelo campo `instance` do payload. As histórias seguintes (envio e recebimento de mensagens, US-14 em diante) estendem esse port e esse webhook, sem criar outro.
- **Reason**: RNF-05 (trocar o fornecedor pela API oficial na fase 2 mexendo só no adaptador) e CA-13.5. O webhook chega antes de existir sessão, então precisa achar o tenant a partir do que a Evolution manda; o nome da instância é esse identificador.
- **Trade-off**: Nova exceção ao AD-004: além dos lookups de identidade, o webhook do conector também tira o tenant de fora da sessão, confiando no segredo compartilhado. Um segredo vazado permite forjar mudanças de estado de qualquer barbearia.
- **Scope**: Integração com o WhatsApp, US-13 em diante (US-14 a US-19, US-24, US-25).
- **Date**: 2026-09-29
- **Status**: active

### AD-012
- **Decision**: O estado do bot com cada cliente fica em `whatsapp_conversations` (PK `(barbershop_id, client_id)`), lido e gravado pelo port `ConversationRepository`. Uma pausa para atendimento humano tem `paused_at` e `pause_reason` num conjunto fechado (`HANDOFF_REASONS`, CHECK no banco) e vale enquanto `GREATEST(paused_at, last_activity_at)` for mais novo que `WHATSAPP_HANDOFF_RESUME_HOURS`; nenhum job a desfaz, a próxima mensagem ou a lista calculam na leitura. Pausar é um `UPDATE ... WHERE paused_at IS NULL`, então só uma transferência concorrente envia o aviso.
- **Reason**: US-16 (RN-22, RN-23). A US-17 e a US-18 vão transferir por cliente bloqueado e por cancelamento fora do prazo, e reaproveitam a mesma pausa, o mesmo silêncio do bot e a mesma lista do painel.
- **Trade-off**: Cada novo motivo exige migration para ampliar o CHECK e um valor novo em `HANDOFF_REASONS`. Uma pausa vencida continua gravada até a próxima mensagem do cliente.
- **Scope**: Conversas do WhatsApp, US-16 em diante (US-17, US-18).
- **Date**: 2026-09-29
- **Status**: active

### AD-013
- **Decision**: O pedido de agendamento em andamento no WhatsApp fica em `whatsapp_conversations.booking_draft` (`jsonb`, nulo quando não há), validado com Zod na leitura; um valor inválido conta como sem rascunho. Traz um `id` e as opções oferecidas; consumir a oferta é um `UPDATE ... WHERE booking_draft->>'id' = $id`, então só uma mensagem agenda a partir de uma oferta. O rascunho vence 60 min depois da última alteração e é limpo ao agendar, ao pausar e ao reativar a conversa. O modelo só recebe os textos das opções e devolve o número escolhido; o horário gravado sai do rascunho.
- **Reason**: US-17 (CA-17.2, CA-17.4, RN-07). A US-18 vai guardar o agendamento a remarcar ou cancelar no mesmo lugar, e a US-23 a oferta da lista de espera.
- **Trade-off**: O formato do `jsonb` não é conferido pelo banco; quem muda o formato precisa aceitar que rascunhos antigos sejam descartados na leitura.
- **Scope**: Conversas do WhatsApp, US-17 em diante (US-18, US-23).
- **Date**: 2026-09-30
- **Status**: active

### AD-014
- **Decision**: Cancelar um agendamento é a transição de status `confirmed` → `cancelled` (`Appointment.cancel`), que tira o agendamento de `SLOT_HOLDING_STATUSES` e da constraint de exclusão e assim libera o horário para o motor da US-07. O "evento horário liberado" (CA-18.5) é essa própria transição: nada é despachado; quem precisar dele (US-24) lê o estado na hora, como os jobs do AD-009.
- **Reason**: US-18 (CA-18.1, CA-18.5, RF-04). Uma porta de notificação sem consumidor hoje seria estrutura além do mínimo do CLAUDE.md; o código nunca usou barramento de eventos.
- **Trade-off**: A US-24 precisa descobrir os horários liberados lendo os agendamentos `cancelled`, sem gancho no momento do cancelamento. Um agendamento cancelado continua visível na agenda e no perfil do cliente.
- **Scope**: Agendamentos, US-18 em diante (US-24).
- **Date**: 2026-10-01
- **Status**: active

### AD-015
- **Decision**: Os lembretes de agendamento (US-19) rodam num `@Cron('* * * * *')` em toda instância, e cada envio é reivindicado antes com um `UPDATE ... WHERE <coluna> IS NULL AND status = 'confirmed'` sobre as colunas `reminder_24h_sent_at`/`reminder_1h_sent_at` de `appointments`; a falha no envio mantém a reivindicação (sem reenvio). Nos e2e, todo app montado com o `AppModule` para os crons logo depois do `app.init()` com `stopScheduledJobs(app)` (`test/support/stop-scheduled-jobs.ts`), e a suíte que testa um job chama o `run()` dele.
- **Reason**: Com várias instâncias, a reivindicação no banco é o que garante um envio por lembrete, sem fila nem Redis. Um cron de minuto em minuto dispararia no relógio real no meio de qualquer suíte e agiria sobre os dados dela.
- **Trade-off**: Um lembrete cujo envio falhou não é reenviado. Toda suíte e2e nova que monta o app precisa chamar o helper.
- **Scope**: Jobs agendados e e2e, US-19 em diante (lembrete de retorno da US-25, oferta da lista de espera da US-24).
- **Date**: 2026-10-01
- **Status**: active

### AD-016
- **Decision**: A cobrança passa só pelo port `PaymentGateway` (`src/usecases/ports/payment-gateway.port.ts`), com tipos neutros; o único adaptador é o do Asaas, em `src/infrastructure/external/payments/asaas/`, junto com o webhook (`POST /webhooks/payments/asaas`, `@Public()`, autenticado pelo header `asaas-access-token` igual a `ASAAS_WEBHOOK_TOKEN`). O webhook responde `200` a todo evento autenticado, aplicado ou não, e `500` só quando a aplicação falha no meio, para o Asaas reenviar. Cada evento é gravado em `payment_gateway_events` (PK `(gateway, event_id)`) na mesma transação da mudança, e o tenant sai do id da assinatura no gateway guardado em `barbershop_subscriptions` ou, se ainda não ligado, da consulta ao gateway (`externalReference` = id da barbearia, ou o checkout que criou a assinatura). Toda escrita na assinatura trava a linha de `barbershops` (`FOR UPDATE`). O status fica em `barbershops.subscription_status` (`trialing`, `active`, `past_due`, com `CHECK`); cancelar não é status, a assinatura cancelada continua `active` até `paid_until`.
- **Reason**: US-20 (RF-41, RF-42, CA-20.1 a CA-20.4). O Asaas entrega webhooks pelo menos uma vez e pausa a fila depois de erros repetidos; a assinatura criada pelo checkout de cartão só aparece para nós no primeiro pagamento. A US-21 vai ler `past_due`, `payment_failed_at` e `paid_until` para suspender.
- **Trade-off**: Nova exceção ao AD-004, no molde do AD-011: o webhook acha o tenant fora da sessão, confiando no token compartilhado e na consulta autenticada ao gateway. A US-21 precisa ampliar o `CHECK` do status para o estado suspenso.
- **Scope**: Assinatura e cobrança, US-20 em diante (US-21).
- **Date**: 2026-10-02
- **Status**: active

### AD-017
- **Decision**: A suspensão por assinatura inativa (US-21) é calculada na leitura por `BarbershopSubscription.suspensionReason(now, graceDays)` (`trial_ended`, `payment_overdue` ou `subscription_ended`), sem coluna, status ou job; todos os consumidores perguntam ao `GetSuspensionReasonUseCase`. O painel fica em modo leitura pelo `SubscriptionAccessGuard`, segundo `APP_GUARD` registrado depois do `SessionGuard`: toda rota autenticada `POST`/`PUT`/`PATCH`/`DELETE` responde `402` com `{ message }` enquanto a barbearia está suspensa, salvo as marcadas com `@AllowWhileSuspended()` (hoje só o `SubscriptionController`). O `402` é documentado automaticamente no OpenAPI a partir do mesmo metadado. O repositório de assinatura e as métricas de pagamento vivem no `SubscriptionAccessModule`.
- **Reason**: US-21 (CA-21.1 a CA-21.4, RF-43, RN-25). Calcular na leitura faz um pagamento confirmado reativar tudo na requisição seguinte, sem transição de volta nem atraso de cron. Negar por padrão faz toda rota de escrita nova nascer barrada, no espírito do AD-007.
- **Trade-off**: Uma leitura da assinatura por escrita autenticada e por mensagem do bot. A previsão do AD-016 de ampliar o `CHECK` de `subscription_status` com um estado suspenso deixa de valer. Toda rota de escrita nova que precise funcionar durante a suspensão precisa do decorator.
- **Scope**: Painel, bot e jobs que falam com o cliente, US-21 em diante.
- **Date**: 2026-10-06
- **Status**: active

## Handoff

