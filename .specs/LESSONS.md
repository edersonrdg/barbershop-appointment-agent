# LESSONS - auto-maintained by scripts/lessons.py

> Machine-owned. Do NOT hand-edit. Changes are overwritten on the next `lessons.py` write.
> Canonical state lives in `.specs/lessons.json`. Edit lessons only via the script.
> promote_threshold=2 distinct features · window_days=45 · quarantine_threshold=2

## Confirmed (load these at Plan/Checks)

Corroborated across multiple features. Safe to apply as guidance.

_none_

## Candidates (under observation - do NOT load as guidance yet)

Seen once or not yet corroborated. Tracked, not trusted.

### L-001 - Um check que afirma contagem absoluta de linhas depois de uma ação negada precisa considerar as linhas que o próprio fixture grava; afirme 'nada novo para o alvo e contagem inalterada' em vez de 'N linhas'.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `test/e2e` · harmful: 0
- features: us-02-convite-de-barbeiros
- evidence: checks.md C16 / test/users-permissions.e2e-spec.ts:128 (test/e2e)
- last seen: 2026-09-27T21:27:11Z

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
