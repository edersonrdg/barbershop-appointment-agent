# US-10: Agendamento manual pelo painel — Context

**Gathered:** 2026-09-28
**Spec:** `.specs/features/us-10-agendamento-manual/spec.md`
**Status:** Ready for design

---

## Feature Boundary

API do painel para o Dono e o Barbeiro registrarem agendamentos de clientes que ligam ou chegam na hora, com origem `manual`, e consultarem os horários livres para escolher um horário válido. A gravação e a consulta passam pelo motor da US-07, que já dispensa a antecedência mínima quando a origem é `manual` (CA-10.3). O cliente é identificado pelo telefone (RN-08) e criado na hora, se ainda não existe. Só API, como nas US-01 a US-09.

---

## Implementation Decisions

### Cliente com telefone já cadastrado (CA-10.2)

- O telefone, normalizado para E.164, identifica o cliente na barbearia (RN-08).
- Se o telefone já pertence a um cliente da barbearia, o agendamento vai para esse cliente e o nome gravado **não muda**, mesmo que o nome digitado seja outro. Um erro de digitação não sobrescreve o cadastro.
- Se o telefone não existe, o cliente é criado com o nome e o telefone informados.

### Exceção "Dono pode forçar no painel com aviso" (RN-05)

- **Fora desta história.** Nenhum CA da US-10 descreve o forçar. Toda violação de regra é recusada com o motivo (CA-10.4), inclusive para o Dono.
- A exceção fica registrada como questão em aberto na seção 19 do PRD, no mesmo PR.

### Consulta de horários livres

- **Entra nesta história.** A US-08 deixou para a US-10 expor a consulta do motor.
- Rota de leitura com data, serviços e barbeiro opcional, que devolve os inícios livres calculados pelo motor com origem `manual` (sem antecedência mínima).
- O Dono consulta qualquer barbeiro ou "qualquer barbeiro apto"; o Barbeiro, só a própria agenda.

### Agent's Discretion

- Formato do payload, status HTTP dos erros de regra, mensagens de validação e formato das respostas: decididos na spec (Assumptions), seguindo o padrão das US-08 e US-09.

### Declined / Undiscussed Gray Areas → Assumptions

- Formato do horário no payload, status das recusas do motor, limites de nome e serviços, atomicidade entre cliente e agendamento e corrida de dois cadastros com o mesmo telefone novo: registrados como suposições na spec.

---

## Specific References

- Formato de cada agendamento na resposta: o item da agenda da US-08 (o mesmo que a US-09 usa nos agendamentos afetados).
- Regra de perfil: a mesma das US-08 e US-09 (Barbeiro só no barbeiro vinculado a ele; `403` "Acesso negado.").

---

## Deferred Ideas

- Forçar horário fora do expediente, da jornada ou sobre bloqueio pelo Dono (exceção do RN-05): questão em aberto no PRD, sem história.
- Busca de clientes cadastrados para escolher no agendamento: US-12 (CA-12.1).
