# US-06 Context

**Gathered:** 2026-09-28
**Spec:** `.specs/features/us-06-regras-de-agendamento/spec.md`
**Status:** Ready for design

---

## Feature Boundary

API para o Dono ler e alterar as cinco regras de agendamento da barbearia (antecedência mínima, prazo de cancelamento, limite de faltas, prazo da oferta da lista de espera e dias do lembrete de retorno), com os padrões do CA-06.1 em toda barbearia nova, e uma leitura dessas regras para as histórias que vão aplicá-las (US-07, US-11, US-17, US-18, US-24, US-25). Sem telas (mesma decisão da US-01) e sem aplicar nenhuma regra.

---

## Implementation Decisions

### Unidades e limites

- Antecedência mínima e prazo de cancelamento em **minutos**, de 0 a 10.080 (7 dias), em múltiplos de 5.
- Limite de faltas: inteiro de 1 a 10.
- Prazo da oferta da lista de espera: inteiro de 5 a 120 minutos.
- Lembrete de retorno: inteiro de 7 a 365 dias.
- O teto existe para que um erro de digitação não vire regra absurda.

### Valor zero

- Antecedência mínima **0** e prazo de cancelamento **0** são permitidos e significam "sem restrição": o bot oferece horário a partir de agora e aceita cancelar até o horário do agendamento.
- As outras três regras nunca aceitam 0 (mínimos de 1, 5 e 7).

### Efeito de uma regra alterada

- Cada ação (oferecer horário, cancelar, remarcar, contar falta, ofertar vaga, lembrar retorno) **lê a regra vigente no momento em que acontece**.
- O agendamento não guarda cópia da regra. Mudar uma regra não altera nenhum agendamento gravado.

### Agent's Discretion

- Rotas, formato do payload, semântica de `PUT` completo, mensagens de erro, permissão só-Dono, onde gravar as regras e o preenchimento das barbearias já existentes: adotados como premissas na spec, para revisão junto com ela.

### Declined / Undiscussed Gray Areas → Assumptions

- Sem painel web: segue a decisão da US-01 (só API).
- Barbeiro lendo as regras, gravações simultâneas e observabilidade: registrados em Assumptions & Open Questions da spec.

---

## Specific References

Nenhuma. Padrões comuns de mercado.

---

## Deferred Ideas

- Aplicar cada regra: antecedência (US-07/US-17), cancelamento (US-18), faltas (US-11), oferta da lista de espera (US-24), retorno (US-25).
- Histórico de alterações das regras (quem mudou e quando).
