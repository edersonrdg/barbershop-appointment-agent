# US-07 Context

**Gathered:** 2026-09-28
**Spec:** `.specs/features/us-07-motor-de-disponibilidade/spec.md`
**Status:** Design approved

---

## Feature Boundary

Um motor único, em use cases, que (1) calcula os horários disponíveis de um barbeiro, ou de qualquer barbeiro apto, para um ou mais serviços numa data local da barbearia e (2) valida e grava um agendamento, recusando com o erro da regra violada. O painel (US-10) e o bot (US-17) passam a usar este motor. Sem rota HTTP, sem cliente e sem cadastro de bloqueios nesta história.

---

## Implementation Decisions

### Grade de horários

- O motor oferece inícios **a cada 30 minutos**.
- A grade começa no início de cada período livre (interseção de funcionamento e jornada, menos bloqueios e agendamentos) e avança de 30 em 30 min enquanto o serviço couber inteiro no período.
- A grade vale só para a **oferta** de horários. A gravação aceita qualquer início em minuto cheio que respeite as regras, porque o painel pode encaixar um horário fora da grade.

### Horários no passado

- Origem **painel**: o motor oferece e grava só inícios a partir do instante atual (`início >= agora`), sem antecedência mínima (CA-07.3). Nada no passado.
- Origem **bot**: inícios a partir de `agora + antecedência mínima` (RN-02).

### Cliente

- O agendamento desta história **não referencia cliente**. A US-10 cria o cadastro de clientes (CA-10.2) e adiciona a coluna ao agendamento.

### Exposição

- **Sem rota HTTP.** O motor é entregue como use cases, testados em unidade (fakes em memória) e em e2e contra o Postgres (gateway TypeORM, constraint de exclusão e concorrência). A US-10 expõe as rotas do painel, e a US-17 usa o motor pelo bot.

### Agent's Discretion

- Nomes de use cases, ports, tabelas e erros; modelagem da tabela de bloqueios mínima; ordem de verificação das regras; como o conflito do banco vira erro de domínio.

### Declined / Undiscussed Gray Areas → Assumptions

- Barbeiro escolhido para cada horário no "qualquer barbeiro" → primeiro barbeiro livre na ordem da listagem (nome). Ver spec.
- Exceção do RN-05 ("Dono pode forçar no painel com aviso") → fora desta história. Ver spec.
- Barbeiro "apto" com vários serviços → realiza todos os serviços pedidos. Ver spec.
- Métricas de negócio → contadores de agendamentos gravados e de conflitos, por origem. Ver spec.

---

## Specific References

- CLAUDE.md: `EXCLUDE USING gist` sobre barbeiro + `tstzrange` (RN-07); motor único para bot e painel.
- CA-05.3 já avisa que só o trecho da jornada dentro do funcionamento fica disponível; o motor aplica essa interseção.
- US-06 decidiu que cada ação lê a regra vigente quando acontece; o motor lê a antecedência mínima a cada consulta e gravação.

---

## Deferred Ideas

- Forçar horário fora das regras no painel (exceção do RN-05): nenhuma história tem CA para isso. Fica como questão para a US-10.
- Distribuir "qualquer barbeiro" por carga de trabalho em vez de ordem de nome: não está no PRD.
