# US-22: Desbloqueio manual de cliente

## Problem

Um cliente que atinge o limite de faltas (RN-12) fica impedido de agendar pelo bot até passarem 90 dias sem nova falta (RN-13). O Dono não tem como dar uma nova chance a quem justificou a ausência: o perfil da US-12 mostra `selfBookingBlocked: true`, mas nenhuma rota muda isso. Para esse cliente, o Dono precisa agendar manualmente toda vez, e o cliente que escreve no WhatsApp é transferido para humano (CA-17.6). O PRD não traz número de volume, só a história, o RF-31 e o RN-14.

Com a entrega, o Dono desbloqueia o cliente pelo perfil, o contador de faltas volta a zero e o bot volta a agendar para ele na mensagem seguinte. O Barbeiro não pode desbloquear.

## Flow

Reaproveita o reset da RN-13: o contador já é derivado das faltas posteriores a `clients.no_show_reset_at` (`NoShowLedger.countFor`), então desbloquear é gravar esse mesmo instante para um cliente, e o bot (`BookViaWhatsAppUseCase` via `clientNoShowStatus`) e o perfil passam a ver zero sem nenhuma mudança neles.

1. `POST /clients/{id}/unblock` -> `ClientsController` (exists) - valida `id` com Zod; o `SessionGuard` (exists) barra o Barbeiro com `403` (AD-007) e o `SubscriptionAccessGuard` (exists) barra a barbearia suspensa com `402` (AD-017)
2. `ClientRepository.findById` (exists) - acha o cliente na barbearia da sessão, senão `404`
3. `clientNoShowStatus` (exists) - faltas e bloqueio com o limite vigente; cliente não bloqueado termina aqui, sem gravar nada
4. `NoShowLedger` (exists; ganha o reset de um cliente) - grava `no_show_reset_at = agora` no cliente
5. out: `204`; na próxima mensagem do cliente, `BookViaWhatsAppUseCase` (exists) lê `selfBookingBlocked: false` e agenda

## Impact

| Front | What changes |
| --- | --- |
| domain | termo existente: `no_show_reset_at` significava "último reset automático de 90 dias" (RN-13), passa a significar "último reset, automático ou pelo Dono" (RN-13, RN-14). Quem lê: `TypeOrmNoShowLedger.countFor` e `resetExpired`; nenhum dos dois muda |
| domain | `resetExpired` (job diário) continua igual: depois de um desbloqueio, só faltas novas contam para o próximo reset de 90 dias |
| stored data | nada a migrar: a coluna existe desde a US-11 |
| código existente | conversa pausada com motivo `blocked_client` (US-16/US-17) não muda; volta ao bot pelo `POST` de retomada da US-16 ou quando a pausa vence |

## Relations

`None - no stored-data shape change`

## Surface

| Route | In | Out | Status |
| --- | --- | --- | --- |
| `POST /clients/{id}/unblock` | `id` (path) | nada | `204`, `400`, `401`, `402`, `403`, `404` |

## Landing

| One-way door | Literal shape | Alternative rejected |
| --- | --- | --- |
| 1. contrato do desbloqueio | `POST /clients/{id}/unblock` → `204` sem corpo, também para cliente não bloqueado (idempotente) | `409` para cliente não bloqueado (recusado pelo usuário): um toque duplo no celular devolveria erro; `PATCH /clients/{id}` com `noShowCount: 0`: expõe um contador que é derivado, não gravado |
| 2. desbloquear = reset por instante | `UPDATE clients SET no_show_reset_at = $now WHERE barbershop_id = $1 AND id = $2` | contador gravado com decremento: contradiz o contador derivado da US-11 e exigiria reconciliar com as correções de falta (CA-11.4) |

- Nothing else in this change is hard to reverse

## Criteria

### S1: o Dono desbloqueia e o bot volta a agendar (P1)

O Dono zera as faltas de um cliente bloqueado e o bot volta a agendar para ele (CA-22.1, RF-31, RN-14).

**Acceptance Criteria**

1. WHEN o Dono chama `POST /clients/{id}/unblock` para um cliente bloqueado da barbearia THEN o sistema SHALL responder `204` sem corpo
2. WHEN um cliente bloqueado é desbloqueado THEN `GET /clients/{id}` SHALL devolver `noShowCount: 0` e `selfBookingBlocked: false`
3. WHEN um cliente desbloqueado pede para agendar pelo WhatsApp um horário livre THEN o bot SHALL criar o agendamento `confirmed`, sem transferir para humano
4. WHEN o cliente desbloqueado tem uma nova falta marcada num agendamento que começa depois do desbloqueio THEN o sistema SHALL contar `noShowCount: 1`
5. IF o cliente não está bloqueado THEN o sistema SHALL responder `204` sem alterar o `noShowCount` dele
6. IF o `id` da rota não é UUID THEN o sistema SHALL responder `400` com "Informe um id de cliente válido."
7. IF o cliente não existe na barbearia da sessão THEN o sistema SHALL responder `404` com "Cliente não encontrado." sem alterar cliente de outra barbearia (RN-26)

**Independent test:** e2e: limite 2, João com 2 faltas → perfil `selfBookingBlocked: true`; `POST /clients/{joão}/unblock` → `204`; perfil → `noShowCount: 0`, `selfBookingBlocked: false`.

### S2: só o Dono desbloqueia (P1)

O Barbeiro não desbloqueia, e a rota segue as regras de acesso do painel (CA-22.2, seção 5).

**Acceptance Criteria**

8. IF um Barbeiro chama `POST /clients/{id}/unblock` THEN o sistema SHALL responder `403` com "Acesso negado." sem alterar o `noShowCount` do cliente
9. IF a requisição não tem sessão válida THEN o sistema SHALL responder `401`
10. WHILE a barbearia está suspensa (AD-017) the sistema SHALL responder `402` à rota sem alterar o `noShowCount` do cliente
11. The sistema SHALL documentar a rota no Swagger com resumo citando a US-22, o parâmetro `id`, a resposta `204`, os erros `404` e o perfil só Dono

**Independent test:** e2e: Ana (Barbeiro) chama o desbloqueio de João bloqueado → `403`, e o perfil de João continua `selfBookingBlocked: true`.

## Out of scope

| Excluded | Why |
| --- | --- |
| Tela e botão de desbloqueio no painel | O painel vive em `../barbershop-panel`; a opção só aparece para o Dono lá (CA-22.2), a partir desta rota |
| Retomar a conversa pausada junto com o desbloqueio | Decidido pelo usuário: a retomada continua sendo a ação da US-16 |
| Avisar o cliente pelo WhatsApp que foi desbloqueado | Nenhum RF pede |
| Histórico de quem desbloqueou e quando | Nenhum RF pede auditoria |

## Assumptions

| Assumption | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Cliente não bloqueado | `204` sem mudar nada | Decidido pelo usuário; idempotente como a retomada da US-16 | y |
| Conversa pausada por `blocked_client` | Não é retomada pelo desbloqueio | Decidido pelo usuário | y |
| Falta marcada depois do desbloqueio num agendamento que começou antes dele | Não conta: o reset vale pelo início do agendamento, como na RN-13 | Mesmo critério do reset de 90 dias; o Dono perdoou o histórico até aquele instante | n |
| RN-14 "sugestão, a validar" | Implementada como descrita; não há valor a configurar | A pendência é sobre a regra existir, não sobre um número | n |

**Open questions:** none - all resolved or logged above.

## Observable

| Surface | Decision | Landing |
| --- | --- | --- |
| API `POST /clients/{id}/unblock` | response shape | AC 1 |
| API `POST /clients/{id}/unblock` | error shape and codes | AC 6, AC 7, AC 8, AC 9, AC 10 |
| API `POST /clients/{id}/unblock` | who may call it | AC 8 |
| API `POST /clients/{id}/unblock` | versioning | n/a - nenhuma rota do painel é versionada e o único consumidor é o painel |
| API `POST /clients/{id}/unblock` | rate limits | n/a - nenhuma rota do painel tem limite e nenhum RNF pede |
| API `POST /clients/{id}/unblock` | documentation | AC 11 |
| screen perfil do cliente | destructive action confirms | n/a - só API; a tela fica no repositório do painel (Out of scope) |

## Sources

- [docs/PRD.md](../../../docs/PRD.md) US-22 (CA-22.1, CA-22.2), RF-31 e RN-14 - o desbloqueio e quem pode fazê-lo
- [docs/PRD.md](../../../docs/PRD.md) RN-13 e US-11 - o contador zera por reset
