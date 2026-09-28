# US-09: Bloqueios e folgas — Context

**Gathered:** 2026-09-28
**Spec:** `.specs/features/us-09-bloqueios-e-folgas/spec.md`
**Status:** Ready for design

---

## Feature Boundary

API do painel para o Dono e o Barbeiro criarem bloqueios de horário e folgas de dia inteiro, listarem e removerem esses registros. O motor da US-07 já tira bloqueios dos horários oferecidos e recusa agendamentos sobre eles (RN-05); esta história passa a gravá-los. Só API, como nas US-01 a US-08.

---

## Implementation Decisions

### Conflito com agendamentos existentes (CA-09.3)

- Na primeira tentativa, um bloqueio que se sobrepõe a agendamentos confirmados do barbeiro é recusado com `409`, a mensagem do erro e a lista dos agendamentos afetados. Nada é gravado.
- O usuário reenvia com `confirmConflicts: true`; então o bloqueio é gravado e a resposta `201` traz a mesma lista de agendamentos afetados.
- Nenhum agendamento é cancelado ou alterado, com ou sem confirmação.

### Escopo: criar, listar e remover

- O RF-26 fala só em criar. O usuário decidiu incluir listar e remover, porque sem remover um bloqueio feito por engano o horário fica perdido. O PRD é atualizado (RF-26) no mesmo PR.
- Listar e remover seguem a mesma regra de perfil da agenda (US-08): o Dono vê e remove de todos os barbeiros; o Barbeiro, só os próprios.

### Folga

- Folga é um dia por vez: uma data, gravada como bloqueio de 00:00 a 00:00 do dia seguinte no fuso da barbearia. Férias viram várias folgas.

### Agent's Discretion

- Formato da rota, nome dos campos e mensagens de validação (fixados na spec).
- Reuso do formato de agendamento da agenda (US-08) na lista de afetados.

### Declined / Undiscussed Gray Areas → Assumptions

Registradas na tabela **Assumptions & Open Questions** da spec: Barbeiro registrando a própria folga, bloqueio no passado, bloqueios sobrepostos, fim `24:00`, tamanho do motivo, corrida entre bloqueio e agendamento.

---

## Specific References

No specific requirements - open to standard approaches.

---

## Deferred Ideas

- Folga por intervalo de datas (férias num único registro).
- Exibir bloqueios e folgas dentro da resposta da agenda da US-08.
- Editar um bloqueio (hoje: remover e criar de novo).
