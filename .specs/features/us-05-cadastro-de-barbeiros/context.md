# US-05 Context

**Gathered:** 2026-09-28
**Spec:** `.specs/features/us-05-cadastro-de-barbeiros/spec.md`
**Status:** Ready for design

---

## Feature Boundary

API para o Dono cadastrar, editar, desativar e reativar os barbeiros da barbearia (nome, serviços realizados, jornada semanal e vínculo opcional com um usuário do painel), com aviso quando a jornada sai do horário de funcionamento, e leituras para a agenda (barbeiros ativos, barbeiro de um usuário). Sem telas (mesma decisão da US-01) e sem cálculo de horários livres (US-07).

---

## Implementation Decisions

### Barbeiro × usuário do painel

- O barbeiro é um **cadastro próprio** (o profissional que aparece na agenda), separado do usuário do painel da US-02.
- O vínculo com um usuário é **opcional e 1:1**: um barbeiro tem no máximo um usuário, e um usuário está em no máximo um barbeiro.
- Pode ser vinculado **qualquer usuário da barbearia, Dono ou Barbeiro**. Cobre o Dono que também atende.

### Jornada

- Mesmo formato do horário de funcionamento (US-03): por dia da semana, **folga (`null`) ou entrada/saída com no máximo 1 intervalo**.

### Ciclo de vida

- O barbeiro **nunca é excluído**: o Dono **desativa e reativa**, como nos serviços (US-04). O inativo sai da agenda e dos novos agendamentos e mantém o histórico.

### Serviços realizados

- Ao salvar, **pelo menos 1 serviço**, todos **ativos** e da **mesma barbearia**.
- Se um serviço for desativado depois, o vínculo continua gravado; quem oferece horários (US-07) ignora os inativos.

### Agent's Discretion

- Rotas, formato do payload e da resposta, formato do aviso do CA-05.3, unicidade do nome, mensagens de erro, efeito da remoção do usuário (US-02) sobre o vínculo e status HTTP: adotados como premissas na spec, para revisão junto com ela.

### Declined / Undiscussed Gray Areas → Assumptions

- Sem painel web: segue a decisão da US-01 (só API).
- Acesso do Barbeiro ao próprio cadastro, gravações simultâneas e observabilidade: registrados em Assumptions & Open Questions da spec.

---

## Specific References

Nenhuma. Padrões comuns de mercado.

---

## Deferred Ideas

- Barbeiro lendo ou editando o próprio cadastro e jornada (a US-08 abre a leitura da própria agenda).
- Foto, telefone ou descrição do barbeiro (não estão no RF-34).
- Jornada com mais de um intervalo ou que vira a meia-noite.
- Jornadas diferentes por semana ou por data (folgas pontuais são a US-09).
