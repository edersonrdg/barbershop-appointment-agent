# US-22: Desbloqueio manual de cliente checks

Profile: light
Plan: `.specs/features/us-22-desbloqueio-manual-de-cliente/plan.md`

11 checks em 2 fatias · 2 one-way doors · 0 open, 0 block

Um check concluído termina com ✅. Convenção das provas: todo teste cita o `CA` (ou o AC) e o id do check entre parênteses no nome, ex.: `it('CA-22.1 (C1): ...')`. O seletor `-t` usa esse id.

- e2e: `npx jest --config ./test/jest-e2e.json <arquivo> -t "<padrão>"` (Postgres do compose rodando)
- unitário: `npx jest <arquivo> -t "<padrão>"`

Cenário-base dos e2e de `test/clients.e2e-spec.ts`: relógio fixo em `NOW`, limite de faltas 2, João (barbearia A) com 2 faltas em agendamentos que começaram antes de `NOW`, portanto `selfBookingBlocked: true`.

## Checks

### S1 - O Dono desbloqueia e o bot volta a agendar · ~8 arquivos · ~45 KB · ~11k

**C1** - `POST /clients/{joão}/unblock` como Dono responde `204` com corpo vazio, e `clients.no_show_reset_at` de João passa a ser `NOW`; no use case, um cliente bloqueado recebe o reset com o instante do relógio (AC 1, CA-22.1, doors 1 e 2)
Proof: `npx jest src/usecases/unblock-client/unblock-client.use-case.spec.ts -t "\(C1\)"`
Proof: `npx jest --config ./test/jest-e2e.json test/clients.e2e-spec.ts -t "\(C1\)"`

**C2** - Depois do desbloqueio, `GET /clients/{joão}` devolve `noShowCount: 0` e `selfBookingBlocked: false` (AC 2, CA-22.1)
Proof: `npx jest --config ./test/jest-e2e.json test/clients.e2e-spec.ts -t "\(C2\)"`

**C3** - Um cliente com 2 faltas e limite 2, desbloqueado pelo Dono, pede um corte pelo WhatsApp, recebe a oferta de horários e, ao escolher a opção 1, fica com um agendamento `confirmed` de origem `bot`, sem conversa em `waiting-human` (AC 3, CA-22.1)
Proof: `npx jest --config ./test/jest-e2e.json test/whatsapp-booking.e2e-spec.ts -t "\(C3\)"`

**C4** - Depois do desbloqueio, uma falta num agendamento que começa depois de `NOW` faz o perfil devolver `noShowCount: 1`; uma falta gravada depois do desbloqueio num agendamento que começou antes de `NOW` não muda o `noShowCount: 0` (AC 4, assumption do reset por início)
Proof: `npx jest --config ./test/jest-e2e.json test/clients.e2e-spec.ts -t "\(C4\)"`

**C5** - Com 1 falta e limite 2, o desbloqueio responde `204`, o perfil continua com `noShowCount: 1` e `no_show_reset_at` continua `NULL`; desbloquear João duas vezes responde `204` nas duas e mantém `no_show_reset_at = NOW`; no use case, o cliente não bloqueado não recebe reset (AC 5, door 1)
Proof: `npx jest src/usecases/unblock-client/unblock-client.use-case.spec.ts -t "\(C5\)"`
Proof: `npx jest --config ./test/jest-e2e.json test/clients.e2e-spec.ts -t "\(C5\)"`

**C6** - `POST /clients/abc/unblock` responde `400` com exatamente "Informe um id de cliente válido." (AC 6, L-008)
Proof: `npx jest --config ./test/jest-e2e.json test/clients.e2e-spec.ts -t "\(C6\)"`

**C7** - Com um UUID inexistente e com o id de um cliente bloqueado da barbearia B, o Dono da barbearia A recebe `404` com exatamente "Cliente não encontrado.", e o `no_show_reset_at` do cliente de B continua `NULL`; no use case, o cliente inexistente lança `ClientNotFoundError` sem reset (AC 7, RN-26)
Proof: `npx jest src/usecases/unblock-client/unblock-client.use-case.spec.ts -t "\(C7\)"`
Proof: `npx jest --config ./test/jest-e2e.json test/clients.e2e-spec.ts -t "\(C7\)"`

### S2 - Só o Dono desbloqueia · ~3 arquivos · ~35 KB · ~9k

**C8** - Um Barbeiro chama o desbloqueio de João e recebe `403` com exatamente "Acesso negado."; o perfil de João continua com `noShowCount: 2` e `selfBookingBlocked: true` (AC 8, CA-22.2)
Proof: `npx jest --config ./test/jest-e2e.json test/clients.e2e-spec.ts -t "\(C8\)"`

**C9** - O desbloqueio sem `Authorization` responde `401` com "Sessão inválida ou expirada." (AC 9)
Proof: `npx jest --config ./test/jest-e2e.json test/clients.e2e-spec.ts -t "\(C9\)"`

**C10** - Com o teste gratuito da barbearia A vencido (`trial_ends_at` antes de `NOW`), o desbloqueio responde `402` com a mensagem de modo leitura do AD-017, e o perfil de João continua com `selfBookingBlocked: true` (AC 10)
Proof: `npx jest --config ./test/jest-e2e.json test/clients.e2e-spec.ts -t "\(C10\)"`

**C11** - O OpenAPI de `POST /clients/{id}/unblock` tem `summary` citando "US-22", o parâmetro de path `id`, a resposta `204`, a resposta `404` com o exemplo "Cliente não encontrado." e `x-roles: ['owner']` (AC 11)
Proof: `npx jest --config ./test/jest-e2e.json test/clients.e2e-spec.ts -t "\(C11\)"`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| `POST /clients/{id}/unblock` statuses (6) | `204` C1 · `400` C6 · `401` C9 · `402` C10 · `403` C8 · `404` C7 | - |
| estado do cliente ao desbloquear (3) | bloqueado C1 · com faltas abaixo do limite C5 · já desbloqueado C5 | - |
| quem chama (3) | Dono C1 · Barbeiro C8 · sem sessão C9 | - |
| consumidores do contador depois do reset (2) | perfil do painel C2 · bot do WhatsApp C3 | - |
| falta depois do desbloqueio, pelo início do agendamento (2) | começa depois C4 · começou antes C4 | - |
| tenant (2) | barbearia da sessão C1 · outra barbearia C7 | - |
| doors do Landing (2) | door 1 C1, C5 · door 2 C1 | - |
| startup config: use case registrado (1 assembly) | `ClientsModule` no `AppModule`, que o e2e importa, C1 | - |

- Checks que citam status, rota ou formato de resposta: C1, C2, C5-C11. Cada um tem uma prova e2e que cruza a rota HTTP
- C1, C5 e C7 somam a prova unitária do use case, porque a decisão de gravar ou não o reset é tomada ali

## Swept

- validation: C6
- failure modes: n/a - a escrita é um único `UPDATE`; não há gravação parcial para desfazer
- idempotency: C5
- authorization: C8, C9, C10; existing - `SessionGuard` só-Dono por padrão (AD-007) e `SubscriptionAccessGuard` (AD-017)
- concurrency: n/a - dois desbloqueios simultâneos gravam o mesmo `NOW`; uma falta marcada ao mesmo tempo segue a regra do início do agendamento (C4), sem disputa de linha
- data lifecycle: n/a - nenhuma coluna nova; `no_show_reset_at` existe desde a US-11
- dependency failure: n/a - só o Postgres
- state transitions: C1 (bloqueado → desbloqueado), C4 (desbloqueado → falta nova conta), C5 (não bloqueado não muda)
- observability: n/a - nenhum RF/RNF pede métrica do desbloqueio; nenhum log novo, e a rota só carrega ids, já registrados pelo logger HTTP

## Handoff

- Arquivos existentes tocados somam 48.171 bytes (`wc -c`: controller e módulo de clientes, port, implementação e fake do `NoShowLedger`, `clientNoShowStatus`, use case de retomada como referência, 2 e2e) ≈ 12k tokens; arquivos novos estimados em ~10 KB (use case e spec) ≈ 3k tokens
- S1 ≈ 11k, S2 fecha em ≈ 20k, abaixo do orçamento de 150k - um builder
- Mechanism: one builder (dentro do orçamento, sem pergunta)
