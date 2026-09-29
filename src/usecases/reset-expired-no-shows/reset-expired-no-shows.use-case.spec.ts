import { Appointment } from '../../domain/entities/appointment';
import { BookingRules } from '../../domain/value-objects/booking-rules';
import { FixedClock } from '../testing/fixed-clock';
import { InMemoryAppointmentRepository } from '../testing/in-memory-appointment.repository';
import { InMemoryNoShowLedger } from '../testing/in-memory-no-show-ledger';
import { setupScheduling } from '../testing/scheduling-fixtures';
import { ResetExpiredNoShowsUseCase } from './reset-expired-no-shows.use-case';

const NOW = new Date('2026-12-30T12:00:00.000Z');

class FailingLedger extends InMemoryNoShowLedger {
  constructor(
    appointments: InMemoryAppointmentRepository,
    private readonly failingBarbershopId: string,
  ) {
    super(appointments);
  }

  override resetExpired(
    barbershopId: string,
    cutoff: Date,
    now: Date,
  ): Promise<number> {
    if (barbershopId === this.failingBarbershopId) {
      return Promise.reject(new Error('database unavailable'));
    }
    return super.resetExpired(barbershopId, cutoff, now);
  }
}

// Barbearias A e B (nessa ordem), limite de faltas 2. Na A, o cliente "a" tem
// faltas em 2026-09-01 e 2026-10-01 12:00Z (90 dias antes de agora) e o "b"
// em 2026-09-01 e 2026-10-02 12:00Z (89 dias). Na B, o cliente "c" tem uma
// falta em 2026-09-01.
async function setup(failingBarbershopId?: string) {
  const env = await setupScheduling(NOW);
  const appointments = new InMemoryAppointmentRepository();
  const ledger = failingBarbershopId
    ? new FailingLedger(appointments, failingBarbershopId)
    : new InMemoryNoShowLedger(appointments);
  let sequence = 0;
  const noShow = (barbershopId: string, clientId: string, startsAt: string) =>
    appointments.create(
      Appointment.restore({
        id: `appointment-${++sequence}`,
        barbershopId,
        barberId: `barber-${sequence}`,
        clientId,
        serviceIds: ['haircut'],
        startsAt: new Date(startsAt),
        endsAt: new Date(new Date(startsAt).getTime() + 30 * 60 * 1000),
        status: 'no_show',
        origin: 'manual',
        createdAt: new Date('2026-08-01T12:00:00.000Z'),
      }),
    );
  await noShow('barbershop-a', 'a', '2026-09-01T12:00:00.000Z');
  await noShow('barbershop-a', 'a', '2026-10-01T12:00:00.000Z');
  await noShow('barbershop-a', 'b', '2026-09-01T12:00:00.000Z');
  await noShow('barbershop-a', 'b', '2026-10-02T12:00:00.000Z');
  await noShow('barbershop-b', 'c', '2026-09-01T12:00:00.000Z');
  const useCase = new ResetExpiredNoShowsUseCase(
    env.barbershops,
    ledger,
    new FixedClock(NOW),
  );
  const rules = BookingRules.defaults();
  const clientState = async (barbershopId: string, clientId: string) => {
    const noShowCount = await ledger.countFor(barbershopId, clientId);
    return {
      noShowCount,
      selfBookingBlocked: rules.blocksSelfBooking(noShowCount),
    };
  };
  return { useCase, ledger, clientState };
}

describe('ResetExpiredNoShowsUseCase', () => {
  it('CA-11.3: resets the client whose latest no-show started 90 days ago, which unblocks them (ATD-23)', async () => {
    const { useCase, ledger, clientState } = await setup();
    expect(await clientState('barbershop-a', 'a')).toEqual({
      noShowCount: 2,
      selfBookingBlocked: true,
    });

    await useCase.execute();

    expect(await clientState('barbershop-a', 'a')).toEqual({
      noShowCount: 0,
      selfBookingBlocked: false,
    });
    expect(ledger.resetAtOf('barbershop-a', 'a')).toEqual(NOW);
  });

  it('CA-11.3: keeps the counter of the client whose latest no-show started less than 90 days ago (ATD-24)', async () => {
    const { useCase, ledger, clientState } = await setup();

    const result = await useCase.execute();

    expect(await clientState('barbershop-a', 'b')).toEqual({
      noShowCount: 2,
      selfBookingBlocked: true,
    });
    expect(ledger.resetAtOf('barbershop-a', 'b')).toBeNull();
    expect(result).toEqual({ clientsReset: 2, failedBarbershops: 0 });
  });

  it('CA-11.3: a second run resets nobody and leaves the counters as the first left them (ATD-25)', async () => {
    const { useCase, clientState } = await setup();
    await useCase.execute();

    const second = await useCase.execute();

    expect(second).toEqual({ clientsReset: 0, failedBarbershops: 0 });
    expect(await clientState('barbershop-a', 'a')).toEqual({
      noShowCount: 0,
      selfBookingBlocked: false,
    });
    expect((await clientState('barbershop-a', 'b')).noShowCount).toBe(2);
    expect((await clientState('barbershop-b', 'c')).noShowCount).toBe(0);
  });

  it('RN-26: applies the reset to each barbershop, and a failure in the first does not stop the second (ATD-27)', async () => {
    const { useCase, clientState } = await setup('barbershop-a');

    const result = await useCase.execute();

    expect(result).toEqual({ clientsReset: 1, failedBarbershops: 1 });
    expect((await clientState('barbershop-b', 'c')).noShowCount).toBe(0);
    expect((await clientState('barbershop-a', 'a')).noShowCount).toBe(2);
  });
});
