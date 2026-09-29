# US-11: Registro de atendimento, falta e bloqueio automático — Context

**Gathered:** 2026-09-29
**Spec:** `.specs/features/us-11-atendimento-e-faltas/spec.md`
**Status:** Ready for design

---

## Feature Boundary

API do painel para o Dono e o Barbeiro marcarem um agendamento como atendido (`attended`) ou falta (`no_show`), o contador de faltas do cliente que decorre dessas marcações, o bloqueio para autoagendamento quando o contador atinge o limite da barbearia (RN-12) e a rotina diária que zera o contador após 90 dias sem novas faltas (RN-13). Só API, como nas US-01 a US-10. O efeito do bloqueio no bot fica para a US-17; o desbloqueio manual, para a US-22.

---

## Implementation Decisions

### Quando a marcação é permitida (CA-11.1)

- A partir do **início** do agendamento (`agora ≥ startsAt`). O barbeiro registra a falta assim que percebe que o cliente não veio, sem esperar o fim do serviço.
- Antes do início, a marcação é recusada.

### Correções de status (CA-11.4)

- Troca permitida nos **dois sentidos**: `no_show → attended` tira 1 do contador; `attended → no_show` soma 1.
- Não há volta para `confirmed` (desfazer a marcação).
- Marcar o mesmo status de novo não faz nada: responde com sucesso e o contador não muda.

### Bloqueio por faltas (RN-12, CA-11.2)

- **Derivado do limite vigente:** o cliente está bloqueado para autoagendamento enquanto o contador for maior ou igual ao `noShowLimit` atual da barbearia (US-06). Mudar o limite reavalia todos os clientes na hora.

### Reset de 90 dias (RN-13, CA-11.3)

- A rotina diária zera o contador de **todo** cliente cuja última falta tem 90 dias ou mais, bloqueado ou não.

### Agent's Discretion

- Rota, payload, formato da resposta, status HTTP e mensagens: decididos na spec (Assumptions), no padrão das US-08 a US-10.
- Modelo de armazenamento do contador e agendamento da rotina diária: decididos no design.

### Declined / Undiscussed Gray Areas → Assumptions

- Agendamento sem cliente, data da falta usada no reset, correção de falta anterior ao último reset, ocupação do horário por agendamentos marcados, concorrência entre marcações e horário da rotina: registrados como suposições na spec.

---

## Specific References

- Formato do agendamento na resposta: o item da agenda da US-08 (o mesmo das US-09 e US-10).
- Regra de perfil: a mesma das US-08 a US-10 (Barbeiro só nos agendamentos do barbeiro vinculado a ele; `403` "Acesso negado.").

---

## Deferred Ideas

- Bot transferir o cliente bloqueado para humano: US-17 (RN-01, RN-12).
- Desbloqueio manual e zerar o contador pelo painel: US-22 (RF-31, RN-14).
- Ver contador e status de bloqueio no perfil do cliente: US-12 (CA-12.2).
- Liberar o restante do horário de um agendamento marcado como falta para um encaixe: sem RF/RN; não entra.
