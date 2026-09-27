# US-03 Context

**Gathered:** 2026-09-27
**Spec:** `.specs/features/us-03-dados-e-horario-da-barbearia/spec.md`
**Status:** Ready for design

---

## Feature Boundary

API para o Dono ler e salvar os dados da barbearia (nome, endereço, fuso horário) e o horário de funcionamento semanal, com validação dos horários e leitura dos períodos abertos de uma data em UTC para a agenda e o bot. Sem telas (mesma decisão da US-01).

---

## Implementation Decisions

### Formato do horário de um dia

- Cada dia da semana é **fechado** ou tem **abertura, fechamento e no máximo um intervalo opcional** (ex.: 09:00–19:00, intervalo 12:00–13:00).
- Não há lista livre de períodos por dia.

### Endereço

- Um campo único de **texto livre** (ex.: "Rua X, 123 - Centro, Campinas/SP"). Sem CEP, UF ou número validados separadamente.

### Fuso horário

- Só **fusos IANA do Brasil** (lista fechada de 16 zonas). O padrão continua `America/Sao_Paulo` (RNF-04).

### Agent's Discretion

- Rotas, formato do payload, mensagens de erro, limites de tamanho, semântica de gravação (substituição da semana inteira) e estado inicial (todos os dias fechados): adotados como premissas na spec, para revisão junto com ela.

### Declined / Undiscussed Gray Areas → Assumptions

- Sem painel web: segue a decisão da US-01 (só API).
- Estado de uma barbearia que nunca salvou horários, dias que atravessam a meia-noite, granularidade dos minutos, gravação concorrente: registrados em Assumptions & Open Questions da spec.

---

## Specific References

Nenhuma. Padrões comuns de mercado.

---

## Deferred Ideas

- Feriados e datas especiais de funcionamento (não estão em RF/RN; bloqueios pontuais são a US-09).
- Mais de um intervalo por dia e expediente que atravessa a meia-noite.
- Aviso ao Dono quando o novo horário deixar agendamentos futuros fora do expediente (não existem agendamentos até a US-07/US-10).
- Endereço estruturado (CEP, cidade, UF) para link de mapa.
