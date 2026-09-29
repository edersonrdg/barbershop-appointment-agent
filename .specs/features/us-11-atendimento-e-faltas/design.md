# US-11: Registro de atendimento, falta e bloqueio automático — Design

**Spec**: `.specs/features/us-11-atendimento-e-faltas/spec.md`
**Context**: `.specs/features/us-11-atendimento-e-faltas/context.md`
**Status**: Approved

---

## Architecture Overview

O contador de faltas **não é gravado**: ele é derivado dos agendamentos `no_show` do cliente que começaram depois do último reset dele (`clients.no_show_reset_at`). A marcação só troca o status do agendamento; o contador, o bloqueio e as correções saem da consulta. O reset diário só avança o `no_show_reset_at` dos clientes cuja falta contada mais recente começou há 90 dias ou mais.

```mermaid
graph TD
    C[AppointmentsController<br/>PATCH /appointments/:id/status] --> M[MarkAttendanceUseCase]
    M --> AR[AppointmentRepository<br/>findById / saveStatus]
    M --> P[BarberAccessPolicy.assertCanManage]
    M --> L[NoShowLedger.countFor]
    M --> BR[BookingRulesRepository]
    M --> SQ[ScheduleQuery.findById]
    J[NoShowResetJob<br/>@Cron 03:00 America/Sao_Paulo] --> R[ResetExpiredNoShowsUseCase]
    R --> B[BarbershopRepository.listIds]
    R --> L2[NoShowLedger.resetExpired]
    L --> DB[(appointments + clients)]
    L2 --> DB
```

### Abordagens consideradas

| Abordagem | Como | Por que não / por que sim |
| --------- | ---- | ------------------------- |
| **Contador derivado + marca de reset (escolhida)** | `COUNT(no_show)` com `starts_at > no_show_reset_at`; o reset grava `no_show_reset_at = agora` | Correções, concorrência (ATD-16) e "falta anterior ao reset" (ATD-15) saem de graça: não há contador para ficar fora de sincronia. Custo: uma contagem indexada por consulta. |
| Contador gravado em `clients` | `no_show_count` e `last_no_show_at` ajustados na mesma transação da marcação, com lock da linha | Toda transição precisa de ±1 correto sob concorrência; corrigir exige recalcular `last_no_show_at`; ATD-15 exige guardar o reset do mesmo jeito. Mais código e mais pontos de erro. |
| Reset preguiçoso na leitura (sem rotina) | Ignorar faltas com 90+ dias ao contar | Contraria o CA-11.3, que pede a rotina diária, e mudaria o contador sem registro de reset. |

---

## Code Reuse Analysis

### Existing Components to Leverage

| Component | Location | How to Use |
| --------- | -------- | ---------- |
| `BarberAccessPolicy.assertCanManage` | `src/usecases/shared/barber-access-policy.ts` | Barbeiro só no próprio agendamento; `403` "Acesso negado." (ATD-20) |
| `ScheduleQuery.findById` | `src/usecases/ports/schedule.query.port.ts` | Agendamento da resposta no formato do item da agenda (ATD-01) |
| `scheduleAppointmentSchema` / `SchedulePresenter.toAppointment` | `src/interface-adapters/presenters/schedule.presenter.ts` | Parte `appointment` da resposta; o enum de `status` ganha `attended` e `no_show` (ATD-03) |
| `BookingRulesRepository` / `BookingRules` | `src/usecases/ports/booking-rules.repository.port.ts`, `src/domain/value-objects/booking-rules.ts` | `noShowLimit` vigente para o bloqueio (ATD-08, ATD-10) |
| `ZodValidationPipe`, `ApiZodResponse`, `ApiErrorResponse`, `@Roles` | `src/interface-adapters/controllers/` | Validação, Swagger e perfis (ATD-17, ATD-22) |
| `DomainErrorFilter` | `src/infrastructure/http/domain-error.filter.ts` | Mapear `AppointmentNotFoundError` → 404 e `AppointmentNotStartedError` → 422 |
| `FixedClock`, fakes em memória, `scheduling-fixtures` | `src/usecases/testing/` | Testes dos use cases |
| `manual-booking.e2e-spec.ts` | `test/` | Padrão do e2e (app com `FixedClock`, inserts SQL, tokens) |

### Integration Points

| System | Integration Method |
| ------ | ------------------ |
| Tabela `appointments` | `status` passa a aceitar `attended` e `no_show`; a exclusão de sobreposição passa a valer para os três status (ATD-04) |
| Tabela `clients` | Nova coluna `no_show_reset_at timestamptz NULL` |
| Motor da US-07 | `listBusyPeriods` passa a considerar os três status como ocupados (ATD-04) |
| Agenda da US-08 | Sem mudança de consulta (já lista todos os status); só o schema da resposta |
| `@nestjs/schedule@6` (novo) | `ScheduleModule.forRoot()` e `@Cron` na rotina; linha 6 é CommonJS e aceita Nest 11 (a 12 é ESM, proibida pelo CLAUDE.md) |

---

## Components

### Domain: `Appointment` (modificado)

- **Purpose**: Regras da transição de status.
- **Location**: `src/domain/entities/appointment.ts`
- **Interfaces**:
  - `type AppointmentStatus = 'confirmed' | 'attended' | 'no_show'`
  - `type AttendanceStatus = 'attended' | 'no_show'`
  - `markAttendance(status: AttendanceStatus, now: Date): Appointment` — lança `AppointmentNotStartedError` se `now < startsAt`; devolve um novo `Appointment` com o status (o mesmo status devolve igual).
- **Reuses**: padrão `restore` imutável.

### Domain: erros novos

- `src/domain/errors/appointment-not-found.error.ts` — "Agendamento não encontrado." (`404`)
- `src/domain/errors/appointment-not-started.error.ts` — "O agendamento ainda não começou." (`422`, RF-27)

### Domain: `BookingRules` (modificado) e política de reset

- `BookingRules.blocksSelfBooking(noShowCount: number): boolean` — `noShowCount >= noShowLimit` (RN-12).
- `src/domain/value-objects/no-show-reset.ts` — `NO_SHOW_RESET_DAYS = 90` e `noShowResetCutoff(now: Date): Date` (`now − 90 dias`, RN-13).

### Port: `AppointmentRepository` (modificado)

- `findById(barbershopId, appointmentId): Promise<Appointment | null>`
- `saveStatus(appointment: Appointment): Promise<void>` — `UPDATE ... SET status WHERE id AND barbershop_id`.
- `listBusyPeriods` passa a incluir `attended` e `no_show`.

### Port: `NoShowLedger` (novo)

- **Location**: `src/usecases/ports/no-show-ledger.port.ts`
- **Interfaces**:
  - `countFor(barbershopId, clientId): Promise<number>` — agendamentos `no_show` do cliente na barbearia com `starts_at > no_show_reset_at` (ou todos, sem reset).
  - `resetExpired(barbershopId, cutoff: Date, now: Date): Promise<number>` — grava `no_show_reset_at = now` nos clientes da barbearia com falta contada e cuja falta contada mais recente tem `starts_at <= cutoff`; devolve quantos.
- **Impl**: `src/infrastructure/database/repositories/typeorm-no-show-ledger.ts` (SQL); fake `src/usecases/testing/in-memory-no-show-ledger.ts` sobre o `InMemoryAppointmentRepository`.

### Port: `BarbershopRepository.listIds()` (modificado)

- `listIds(): Promise<string[]>` — única leitura sem tenant, para a rotina (AD-009).

### Use case: `MarkAttendanceUseCase`

- **Location**: `src/usecases/mark-attendance/mark-attendance.use-case.ts`
- **Input**: `BarberAccessRequest & { appointmentId, status: AttendanceStatus }`
- **Output**: `{ appointment: ScheduleEntry; client: { id, noShowCount, selfBookingBlocked } | null }`
- **Fluxo**: `findById` (404) → `assertCanManage` com `barberId` do agendamento (403) → `markAttendance(status, clock.now())` (422) → `saveStatus` só se mudou → `countFor` + regras → `schedule.findById`.

### Use case: `ResetExpiredNoShowsUseCase`

- **Location**: `src/usecases/reset-expired-no-shows/reset-expired-no-shows.use-case.ts`
- **Output**: `{ clientsReset: number; failedBarbershops: number }`
- **Fluxo**: `listIds()`; para cada barbearia, `resetExpired(id, noShowResetCutoff(now), now)`; erro de uma barbearia conta em `failedBarbershops` e segue (ATD-27).

### HTTP

- `src/interface-adapters/controllers/schemas/mark-attendance.schema.ts` — `appointmentIdParamSchema` e `markAttendanceSchema` com as mensagens do ATD-17.
- `src/interface-adapters/presenters/attendance.presenter.ts` — `attendanceResponseSchema` (`appointment` + `client`).
- `AppointmentsController.markAttendance` — `PATCH /appointments/:id/status`, `@Roles('owner', 'barber')`.

### Rotina: `NoShowResetJob`

- **Location**: `src/infrastructure/jobs/no-show-reset.job.ts`
- `@Cron('0 3 * * *', { name: 'no-show-reset', timeZone: 'America/Sao_Paulo' })` chama o use case e loga `clientsReset` e `failedBarbershops` com o `Logger` do Nest.
- Módulo `src/infrastructure/modules/attendance.module.ts` registra use cases, ledger e job; `app.module.ts` importa `ScheduleModule.forRoot()` de `@nestjs/schedule` (com alias, porque já existe o `ScheduleModule` da agenda).

---

## Data Models

### Migration `AddAttendance`

```sql
ALTER TABLE appointments DROP CONSTRAINT appointments_status_check;
ALTER TABLE appointments ADD CONSTRAINT appointments_status_check
  CHECK (status IN ('confirmed', 'attended', 'no_show'));
ALTER TABLE appointments DROP CONSTRAINT appointments_no_overlap;
ALTER TABLE appointments ADD CONSTRAINT appointments_no_overlap
  EXCLUDE USING gist (barber_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
  WHERE (status IN ('confirmed', 'attended', 'no_show'));
ALTER TABLE clients ADD no_show_reset_at timestamptz NULL;
CREATE INDEX appointments_client_no_show_idx
  ON appointments (barbershop_id, client_id, starts_at) WHERE status = 'no_show';
```

A lista explícita de status na exclusão deixa o `cancelled` da US-18 fora da constraint sem nova migration na exclusão.

---

## Error Handling Strategy

| Error Scenario | Handling | User Impact |
| -------------- | -------- | ----------- |
| Agendamento de outra barbearia ou inexistente | `AppointmentNotFoundError` | `404` "Agendamento não encontrado." |
| Barbeiro em agendamento de outro, ou sem ficha | `ScheduleAccessDeniedError` (existente) | `403` "Acesso negado." |
| Antes do início | `AppointmentNotStartedError` | `422` "O agendamento ainda não começou." |
| Id ou status inválido | `ZodValidationPipe` | `400` com a mensagem do ATD-17 |
| Falha no reset de uma barbearia | Capturada no use case, contada | Log de erro na rotina; as demais barbearias seguem |

---

## Risks & Concerns

| Concern | Location (file:line) | Impact | Mitigation |
| ------- | -------------------- | ------ | ---------- |
| Exclusão e busy periods só consideram `confirmed` | `src/infrastructure/database/entities/appointment.entity.ts:44`, `src/infrastructure/database/repositories/typeorm-appointment.repository.ts:33` | Marcar um agendamento em andamento liberaria o resto do horário para outro agendamento | Migration amplia a exclusão; `listBusyPeriods` e o fake passam a incluir os três status (ATD-04) |
| O enum do presenter só aceita `confirmed` | `src/interface-adapters/presenters/schedule.presenter.ts:38` | A agenda quebraria o contrato documentado ao listar um agendamento marcado | Enum ampliado na mesma task do presenter |
| Nome `ScheduleModule` colide com o do `@nestjs/schedule` | `src/app.module.ts:12` | Import errado registra o módulo errado | Import com alias `ScheduleModule as CronScheduleModule` |
| `@nestjs/schedule@latest` é 12 (ESM) | `package.json` | Build e Jest quebram | Instalar `@nestjs/schedule@6` fixo |
| Rotina roda em cada instância da API | `NoShowResetJob` | Execução duplicada | O reset é idempotente (ATD-25); nenhuma trava distribuída |

---

## Tech Decisions

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Contador | Derivado dos agendamentos + `clients.no_show_reset_at` | Ver Abordagens; elimina corrida do contador |
| Data da falta | `appointments.starts_at` | Spec (Assumptions) |
| Leitura sem tenant da rotina | `BarbershopRepository.listIds()` | AD-009 |
| Agendador | `@nestjs/schedule@6` com `@Cron` e fuso explícito | Padrão do Nest 11; o use case continua testável sem o cron |
