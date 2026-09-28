# US-08 Context

**Gathered:** 2026-09-28
**Spec:** `.specs/features/us-08-visualizacao-da-agenda/spec.md`
**Status:** Ready for design

---

## Feature Boundary

Uma rota de leitura da agenda para o painel: o Dono vê os agendamentos de todos os barbeiros, com filtro opcional por barbeiro; o Barbeiro vê só os próprios. A consulta é por dia ou por semana, numa data local da barbearia, e cada agendamento traz cliente, serviços, horário, status e origem. Sem tela nesta história.

---

## Implementation Decisions

### Cliente no agendamento

- Esta história cria a **estrutura mínima de cliente**: tabela `clients` (nome e telefone, telefone único por barbearia) e a coluna `appointments.client_id`, **nula**.
- A agenda devolve o cliente de cada agendamento. Agendamento sem cliente (os gravados pelo motor da US-07) sai com `client: null`.
- Nenhuma rota nem use case cria cliente nesta história. A US-10 (CA-10.2) passa a criar o cliente e gravar o `client_id`; a US-14 cria pelo WhatsApp (RF-29). Isso revoga a decisão da US-07 de deixar a coluna para a US-10.
- O e2e insere clientes por SQL para provar o CA-08.3.

### Dados do cliente na agenda

- A agenda mostra **nome e telefone** do cliente.
- O telefone sai só na resposta HTTP e nunca em log (LGPD; o `redact` já cobre `*.phone`).

### Tela (CA-08.4)

- **Só API.** Mesma decisão das US-01 a US-06: o repositório não tem front-end. O CA-08.4 (360 px) fica registrado como **pendência** até a história de front-end, e a US-08 não cumpre esse item da Definição de Pronto.

### Visão semana

- A semana vai de **segunda a domingo**, contada no fuso da barbearia, e é a semana que contém a data pedida.

### Agent's Discretion

- Nome e formato da rota e da query; forma da resposta; nome do port de leitura e se ele fica no `AppointmentRepository` ou num port próprio de consulta; índices; ordem dos agendamentos na resposta.

### Declined / Undiscussed Gray Areas → Assumptions

- Barbeiro pedindo agenda de outro barbeiro, usuário Barbeiro sem ficha de barbeiro, barbeiro inexistente no filtro, agendamento que atravessa a meia-noite, status exibidos e ordem: registrados como assumptions na spec.

---

## Deferred Ideas

- Tela da agenda em 360 px (CA-08.4): história de front-end, ainda não criada no PRD.
- Paginação: uma semana de uma barbearia de até 10 cadeiras cabe numa resposta; sem requisito no PRD.
