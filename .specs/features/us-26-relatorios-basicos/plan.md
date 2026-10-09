# US-26: Relatórios básicos

## Problem

O Dono não tem como saber, sem contar na mão pela agenda, quantos horários a barbearia vendeu num período, quantos foram cancelados ou viraram falta, quanto da jornada dos barbeiros ficou ocupada e quanto os atendimentos renderam. Também não enxerga quanto do agendamento o bot faz sozinho, que é a métrica de sucesso da seção 3 do PRD (≥ 70% sem intervenção humana, sugestão a validar) e o argumento de valor do produto. O PRD não traz número de volume, só a história, o RF-38 e o RF-39.

Com a entrega, o Dono escolhe um período (e, se quiser, um barbeiro) e recebe total de agendamentos, cancelamentos, faltas, taxa de ocupação, receita estimada e a % de agendamentos feitos pelo bot. O Barbeiro não acessa.

## Flow

Reaproveita o que o motor de disponibilidade (US-07) já usa para montar a jornada: `Barbershop.openIntervalsOn`, `Barber.workIntervalsOn` e os `listBusyPeriods` de bloqueios e de agendamentos, então a capacidade do relatório é a mesma jornada que o bot e o painel oferecem, sem uma segunda regra de agenda.

1. `GET /reports?from&to&barberId` -> `ReportsController` (door 1) - valida a query com Zod; o `SessionGuard` (exists) barra o Barbeiro com `403` (AD-007, sem `@Roles`); o `SubscriptionAccessGuard` (exists) deixa o `GET` passar durante a suspensão (AD-017)
2. `BarberRepository` (exists) - com `barberId`, acha o barbeiro na barbearia da sessão, senão `404`; sem `barberId`, lista os barbeiros da barbearia
3. `ReportQuery` (new port, no door - placement per AD-001/AD-002) - conta os agendamentos que começam no período por status e por origem e soma o preço atual dos serviços dos `attended`, filtrando por tenant e barbeiro
4. `Barbershop.openIntervalsOn` + `Barber.workIntervalsOn` (exist), menos `BarberBlockRepository.listBusyPeriods` (exists) - minutos de jornada de cada barbeiro ativo, dia a dia do período, com a configuração atual
5. `AppointmentRepository.listBusyPeriods` (exists) - minutos dos agendamentos `confirmed`, `attended` e `no_show` dos barbeiros ativos, recortados pela jornada
6. out: `200` com o resumo do período

## Impact

| Front | What changes |
| --- | --- |
| domain | termo novo: `taxa de ocupação` - minutos agendados recortados pela jornada ÷ minutos de jornada (trabalho ∩ abertura − bloqueios), só barbeiros ativos, com a configuração atual de horários |
| domain | termo novo: `% pelo bot` - agendamentos com `origin = 'bot'` ÷ total de agendamentos do período, todos os status |
| domain | termo existente: `cancelled` inclui o agendamento antigo de uma remarcação (AD-014, US-18); no relatório ele conta como cancelamento |
| stored data | nada a migrar: status, origem, serviços e `price_cents` já existem; nenhuma tabela nova |
| código existente | nenhuma rota muda; o motor da US-07 só é lido |

## Relations

`None - no stored-data shape change`

## Surface

| Route | In | Out | Status |
| --- | --- | --- | --- |
| `GET /reports` | `from`, `to` (query, AAAA-MM-DD), `barberId` (query, opcional) | `from` · `to` · `barberId` · `totalAppointments` · `cancellations` · `noShows` · `occupancyPercent` · `estimatedRevenueCents` · `botBookedPercent` | `200`, `400`, `401`, `403`, `404` |

## Landing

| One-way door | Literal shape | Alternative rejected |
| --- | --- | --- |
| 1. contrato do relatório (consumido pelo painel) | `GET /reports?from=2026-10-01&to=2026-10-31&barberId=<uuid>` → `200 { from, to, barberId: string \| null, totalAppointments, cancellations, noShows, occupancyPercent: number \| null, estimatedRevenueCents, botBookedPercent: number \| null }`; percentuais de 0 a 100 com uma casa decimal, `null` quando o denominador é zero; dinheiro em centavos | uma rota por indicador (`/reports/occupancy`, ...): o painel faria seis chamadas para uma tela e cada uma recalcularia o período; frações de 0 a 1: o painel teria de converter e arredondar, e o arredondamento divergiria entre telas |

- Nothing else in this change is hard to reverse

## Criteria

### S1: o Dono vê os números da barbearia no período (P1)

O Dono escolhe um período e vê total, cancelamentos, faltas, ocupação e receita estimada, de todos os barbeiros ou de um (CA-26.1, RF-38).

**Acceptance Criteria**

1. WHEN o Dono chama `GET /reports?from&to` THEN o sistema SHALL responder `200` com `totalAppointments` igual ao número de agendamentos da barbearia com início entre `from` 00:00 e `to` 23:59:59 no fuso da barbearia, de todos os status
2. WHEN o relatório é gerado THEN `cancellations` SHALL ser o número desses agendamentos com status `cancelled`, incluindo o agendamento antigo de uma remarcação
3. WHEN o relatório é gerado THEN `noShows` SHALL ser o número desses agendamentos com status `no_show`
4. WHEN o relatório é gerado THEN `estimatedRevenueCents` SHALL ser a soma do preço atual (`price_cents`) de cada serviço dos agendamentos com status `attended`, e nenhum valor de agendamento `confirmed`, `no_show` ou `cancelled`
5. WHEN o relatório é gerado THEN `occupancyPercent` SHALL ser 100 × minutos agendados ÷ minutos de jornada, arredondado a uma casa decimal, em que minutos de jornada é a soma, por barbeiro ativo e por dia do período, de (jornada do barbeiro ∩ horário de abertura − bloqueios e folgas) e minutos agendados é a parte dessa jornada coberta por agendamentos `confirmed`, `attended` ou `no_show`
6. IF o período não tem nenhum minuto de jornada THEN o sistema SHALL devolver `occupancyPercent: null`
7. WHEN o Dono informa `barberId` de um barbeiro da barbearia THEN todos os números SHALL considerar só os agendamentos, a jornada e os bloqueios desse barbeiro, e a resposta SHALL trazer `barberId` igual ao informado
8. The sistema SHALL contar só agendamentos, jornadas e bloqueios da barbearia da sessão (RN-26)
9. IF `from` ou `to` falta ou não é uma data válida THEN o sistema SHALL responder `400` com "Informe uma data válida no formato AAAA-MM-DD."
10. IF `to` é anterior a `from` THEN o sistema SHALL responder `400` com "A data final deve ser igual ou posterior à data inicial."
11. IF o período tem mais de 92 dias, contando `from` e `to` THEN o sistema SHALL responder `400` com "O período pode ter no máximo 92 dias."
12. IF `barberId` não é UUID THEN o sistema SHALL responder `400` com "Informe um id de barbeiro válido."
13. IF `barberId` não é de um barbeiro da barbearia da sessão THEN o sistema SHALL responder `404` com "Barbeiro não encontrado."

**Independent test:** e2e: num dia de jornada 09:00–12:00 (180 min) do barbeiro Ana, com um corte atendido (R$ 40,00, 30 min), uma falta (30 min), um confirmado (30 min) e um cancelado → `totalAppointments: 4`, `cancellations: 1`, `noShows: 1`, `estimatedRevenueCents: 4000`, `occupancyPercent: 50`.

### S2: o Dono vê quanto o bot agenda sozinho (P1)

O relatório mostra a % de agendamentos do período feitos pelo bot (CA-26.2, RF-39).

**Acceptance Criteria**

14. WHEN o relatório é gerado THEN `botBookedPercent` SHALL ser 100 × agendamentos do período com `origin = 'bot'` ÷ `totalAppointments`, arredondado a uma casa decimal
15. IF o período não tem agendamentos THEN o sistema SHALL devolver `totalAppointments: 0`, `cancellations: 0`, `noShows: 0`, `estimatedRevenueCents: 0` e `botBookedPercent: null`

**Independent test:** e2e: 3 agendamentos do bot e 1 manual no período → `botBookedPercent: 75`.

### S3: só o Dono vê relatórios (P1)

O Barbeiro não acessa Relatórios, e a rota segue as regras de acesso do painel (CA-26.3, seção 5).

**Acceptance Criteria**

16. IF um Barbeiro chama `GET /reports` THEN o sistema SHALL responder `403` com "Acesso negado."
17. IF a requisição não tem sessão válida THEN o sistema SHALL responder `401`
18. WHILE a barbearia está suspensa (AD-017) the sistema SHALL responder `200` ao Dono em `GET /reports`
19. The sistema SHALL documentar a rota no Swagger com resumo citando a US-26, os parâmetros `from`, `to` e `barberId`, a resposta `200` com o schema do presenter, o erro `404` e o perfil só Dono

**Independent test:** e2e: Ana (Barbeiro) chama `GET /reports?from=2026-10-01&to=2026-10-31` → `403`.

## Out of scope

| Excluded | Why |
| --- | --- |
| Tela de Relatórios no painel | O painel vive em `../barbershop-panel`; consome esta rota |
| Gráficos, séries por dia e comparação entre períodos | RF-38 pede totais por período |
| Exportar (CSV, PDF) | Nenhum RF pede |
| Separar remarcação de cancelamento | Decidido pelo usuário: exigiria migration e mudança no fluxo da US-18 |
| Preço do serviço na época do atendimento | Decidido pelo usuário: exigiria migration em `appointment_services`; a receita é "estimada" |
| Marcar agendamentos do bot que tiveram transferência antes | Decidido pelo usuário: o bot pausado não agenda, então a origem basta |
| Histórico da jornada (ocupação com os horários vigentes na época) | Nenhum histórico de jornada é gravado; exigiria versionar horários |

## Assumptions

| Assumption | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Fórmula da % do bot | `origin = 'bot'` ÷ total do período, todos os status | Decidido pelo usuário; com a conversa pausada o bot não agenda (AD-012) | y |
| Preço na receita | Preço atual de cada serviço | Decidido pelo usuário; o PRD chama de "estimada" | y |
| Remarcação | Conta como cancelamento | Decidido pelo usuário; é o estado gravado (AD-014) | y |
| Fórmula da ocupação (pendência do PRD) | A sugestão do PRD, com jornada = trabalho ∩ abertura − bloqueios, configuração atual | Decidido pelo usuário | y |
| Período máximo | 92 dias, `from` e `to` inclusivos | Cobre um trimestre; limita o cálculo dia a dia da jornada | y |
| Barbeiro inativo | Fica fora da ocupação (numerador e denominador), mas seus agendamentos contam em total, cancelamentos, faltas, receita e % do bot | Inativo não tem jornada oferecida pelo motor; os agendamentos dele aconteceram | n |
| Agendamento fora da jornada atual (horário mudou depois) | Só a parte dentro da jornada conta como minutos agendados, então a ocupação nunca passa de 100 | Mesma base nos dois lados da divisão | n |
| Ocupação de dias futuros do período | Conta: agendamentos `confirmed` futuros ocupam jornada | A fórmula não distingue passado de futuro; o Dono escolhe o período | n |
| Arredondamento | Meio para cima, uma casa decimal | Valor exibido direto pelo painel | n |
| `barberId` de barbeiro inativo | `200` com os números dele e `occupancyPercent: null` | Ele existe na barbearia; não tem jornada oferecida | n |

**Open questions:** none - all resolved or logged above.

## Observable

| Surface | Decision | Landing |
| --- | --- | --- |
| API `GET /reports` | response shape | AC 1 a AC 7, AC 14, door 1 |
| API `GET /reports` | error shape and codes | AC 9 a AC 13, AC 16, AC 17 (formato do `DomainErrorFilter` e do `ZodValidationPipe` existentes) |
| API `GET /reports` | who may call it | AC 16, AC 18 |
| API `GET /reports` | empty result | AC 6, AC 15 |
| API `GET /reports` | versioning | n/a - nenhuma rota do painel é versionada e o único consumidor é o painel |
| API `GET /reports` | rate limits | n/a - nenhuma rota do painel tem limite e nenhum RNF pede; o período máximo (AC 11) limita o custo |
| API `GET /reports` | documentation | AC 19 |
| screen Relatórios | empty, loading, error, unauthorised | n/a - só API; a tela fica no repositório do painel (Out of scope) |

## Sources

- [docs/PRD.md](../../../docs/PRD.md) US-26 (CA-26.1 a CA-26.3), RF-38, RF-39 e seção 3 - os números e quem os vê
- [docs/PRD.md](../../../docs/PRD.md) US-07 e RN-26 - a jornada vem do motor único, e tudo é por barbearia
