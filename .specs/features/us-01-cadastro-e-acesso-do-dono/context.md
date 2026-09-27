# US-01 Context

**Gathered:** 2026-09-27
**Spec:** `.specs/features/us-01-cadastro-e-acesso-do-dono/spec.md`
**Status:** Design e tasks aprovados

---

## Feature Boundary

API de cadastro self-service (barbearia + Dono em teste de 14 dias), login, sessão, isolamento por tenant verificável em `GET /me` e recuperação de senha por e-mail. Sem telas.

---

## Implementation Decisions

### Painel web

- A US-01 entrega só a API. "Entrar no painel" significa que a resposta do cadastro já traz a sessão autenticada.
- As telas (cadastro, login, redefinição de senha) ficam para uma decisão de stack de frontend e uma história própria. O item da DoD "telas funcionam em 360 px" fica como pendência explícita da US-01 e deve ser registrado no PRD §19.

### Envio de e-mail

- Port de envio de e-mail em `usecases/`; adaptador SMTP (nodemailer) em `infrastructure/external/`.
- Mailpit no `docker-compose.yml` para ver os e-mails localmente; testes usam fake do port.
- O provedor de produção vira só configuração SMTP (variáveis no `env.schema.ts` e no `.env.example`).

### Agent's Discretion

- Validações de campo, formato de erro, mecanismo e validade da sessão, regras do token de redefinição: adotados como premissas na spec (coluna `Confirmed? = n`), para o usuário revisar junto com a spec.

### Declined / Undiscussed Gray Areas → Assumptions

- Escopo de unicidade do e-mail, regras de senha/telefone/nome, sessão, respostas anti-enumeração, validade do link, falha no envio de e-mail: todas registradas em Assumptions & Open Questions da spec.

---

## Specific References

Nenhuma referência específica. Padrões comuns de mercado.

---

## Deferred Ideas

- Rate limiting de login e de pedido de recuperação (risco de força bruta e de spam de e-mail). Sugerir inclusão no PRD como RNF.
- Revogar sessões ativas após redefinição de senha.
- Verificação do e-mail no cadastro.
- História de frontend do painel (stack a decidir).
- Igualar o tempo de resposta do login entre e-mail inexistente e senha errada (hoje o hash só roda quando o usuário existe; risco baixo de enumeração por tempo).
