# US-04 Context

**Gathered:** 2026-09-27
**Spec:** `.specs/features/us-04-cadastro-de-servicos/spec.md`
**Status:** Done

---

## Feature Boundary

API para o Dono cadastrar, editar, desativar e reativar os serviços da barbearia (nome, preço em BRL, duração em minutos e serviços adicionais sugeridos), e leitura dos serviços ativos para a agenda e o bot. Sem telas (mesma decisão da US-01) e sem vínculo com barbeiros.

---

## Implementation Decisions

### Barbeiros aptos

- O vínculo barbeiro ↔ serviço fica **só na US-05**, gravado pelo lado do barbeiro ("serviços realizados", CA-05.1). A US-04 cadastra o serviço sem barbeiros.
- A lista de barbeiros aptos a um serviço será lida dessa mesma relação. Uma fonte única.

### Ciclo de vida

- O serviço **nunca é excluído**. O Dono pode **desativar e reativar** quantas vezes quiser.
- O serviço inativo continua na lista do painel, marcado como inativo, e deixa de ser oferecido em novos agendamentos.

### Limites de preço e duração

- Preço **maior ou igual a zero** (serviço gratuito é permitido), até R$ 10.000,00.
- Duração de **5 a 480 minutos, em múltiplos de 5**.
- Nome **único na barbearia sem diferenciar maiúsculas**, contando também os serviços inativos (o Dono reativa em vez de duplicar).

### Adicionais sugeridos

- **Lista** de até 5 adicionais por serviço, da mesma barbearia, nunca o próprio serviço.
- Cada adicional precisa estar **ativo no momento em que a relação é salva**. Se ele for desativado depois, a relação continua gravada, e quem oferece o adicional (US-23) ignora os inativos.
- Os adicionais vão **no mesmo payload** de criar e editar o serviço (`suggestedAddOnIds`), substituindo a lista inteira.

### Agent's Discretion

- Rotas, formato do payload (preço em centavos), mensagens de erro, limites de tamanho do nome, ordem da lista, idempotência de desativar/reativar e status HTTP: adotados como premissas na spec, para revisão junto com ela.

### Declined / Undiscussed Gray Areas → Assumptions

- Sem painel web: segue a decisão da US-01 (só API).
- Acesso do Barbeiro à lista de serviços, efeito de editar preço/duração sobre agendamentos existentes, gravações simultâneas e observabilidade: registrados em Assumptions & Open Questions da spec.

---

## Specific References

Nenhuma. Padrões comuns de mercado.

---

## Deferred Ideas

- Descrição, foto ou categoria do serviço (não estão no RF-33).
- Exclusão definitiva de serviço sem histórico.
- Barbeiro lendo a lista de serviços (entra com a US-10, que precisa dela para o agendamento manual).
