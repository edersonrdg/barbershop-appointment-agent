import { AppointmentNotStartedError } from '../errors/appointment-not-started.error';
import {
  Appointment,
  AppointmentStatus,
  AttendanceStatus,
} from './appointment';

const NOW = new Date('2026-10-05T12:00:00.000Z');

function describeAppointment(appointment: Appointment) {
  return {
    id: appointment.id,
    barbershopId: appointment.barbershopId,
    barberId: appointment.barberId,
    clientId: appointment.clientId,
    serviceIds: [...appointment.serviceIds],
    startsAt: appointment.startsAt.toISOString(),
    endsAt: appointment.endsAt.toISOString(),
    status: appointment.status,
    origin: appointment.origin,
    createdAt: appointment.createdAt,
  };
}

describe('Appointment', () => {
  it.each(['bot', 'manual'] as const)(
    'CA-07.5: a %s booking is confirmed, keeps the services in order and ends after the total duration (AVL-18, AVL-02)',
    (origin) => {
      const appointment = Appointment.book({
        id: 'appointment-1',
        barbershopId: 'barbershop-a',
        barberId: 'barber-1',
        clientId: null,
        serviceIds: ['haircut', 'beard'],
        startsAt: new Date('2026-10-05T14:00:00.000Z'),
        durationMinutes: 45,
        origin,
        now: NOW,
      });

      expect(describeAppointment(appointment)).toEqual({
        id: 'appointment-1',
        barbershopId: 'barbershop-a',
        barberId: 'barber-1',
        clientId: null,
        serviceIds: ['haircut', 'beard'],
        startsAt: '2026-10-05T14:00:00.000Z',
        endsAt: '2026-10-05T14:45:00.000Z',
        status: 'confirmed',
        origin,
        createdAt: NOW,
      });
    },
  );

  it.each([
    ['the client id', 'c1'],
    ['no client', null],
  ])('CA-10.2: a booking keeps %s (AGM-05)', (_label, clientId) => {
    const appointment = Appointment.book({
      id: 'appointment-1',
      barbershopId: 'barbershop-a',
      barberId: 'barber-1',
      clientId,
      serviceIds: ['haircut'],
      startsAt: new Date('2026-10-05T14:00:00.000Z'),
      durationMinutes: 30,
      origin: 'manual',
      now: NOW,
    });

    expect(appointment.clientId).toBe(clientId);
  });

  it('CA-07.5: restore keeps every stored value', () => {
    const appointment = Appointment.restore({
      id: 'appointment-1',
      barbershopId: 'barbershop-a',
      barberId: 'barber-1',
      clientId: 'client-1',
      serviceIds: ['beard', 'haircut'],
      startsAt: new Date('2026-10-05T14:00:00.000Z'),
      endsAt: new Date('2026-10-05T14:45:00.000Z'),
      status: 'confirmed',
      origin: 'manual',
      createdAt: NOW,
    });

    expect(describeAppointment(appointment)).toEqual({
      id: 'appointment-1',
      barbershopId: 'barbershop-a',
      barberId: 'barber-1',
      clientId: 'client-1',
      serviceIds: ['beard', 'haircut'],
      startsAt: '2026-10-05T14:00:00.000Z',
      endsAt: '2026-10-05T14:45:00.000Z',
      status: 'confirmed',
      origin: 'manual',
      createdAt: NOW,
    });
  });

  describe('markAttendance', () => {
    const STARTS_AT = new Date('2026-10-05T14:00:00.000Z');

    function stored(status: AppointmentStatus): Appointment {
      return Appointment.restore({
        id: 'appointment-1',
        barbershopId: 'barbershop-a',
        barberId: 'barber-1',
        clientId: 'client-1',
        serviceIds: ['haircut', 'beard'],
        startsAt: STARTS_AT,
        endsAt: new Date('2026-10-05T14:45:00.000Z'),
        status,
        origin: 'manual',
        createdAt: NOW,
      });
    }

    it.each<[AppointmentStatus, AttendanceStatus]>([
      ['confirmed', 'attended'],
      ['confirmed', 'no_show'],
      ['no_show', 'attended'],
      ['attended', 'no_show'],
    ])(
      'CA-11.1/CA-11.4: %s becomes %s once the appointment has started (ATD-01, ATD-13, ATD-14)',
      (from, to) => {
        const original = stored(from);

        const marked = original.markAttendance(
          to,
          new Date('2026-10-05T14:05:00.000Z'),
        );

        expect(describeAppointment(marked)).toEqual({
          ...describeAppointment(original),
          status: to,
        });
        expect(original.status).toBe(from);
      },
    );

    it.each<AttendanceStatus>(['attended', 'no_show'])(
      'CA-11.1: marking %s again keeps the same status (ATD-05)',
      (status) => {
        const marked = stored(status).markAttendance(
          status,
          new Date('2026-10-05T15:00:00.000Z'),
        );

        expect(marked.status).toBe(status);
      },
    );

    it('CA-11.1: accepts marking exactly at the start (ATD-01)', () => {
      const marked = stored('confirmed').markAttendance('attended', STARTS_AT);

      expect(marked.status).toBe('attended');
    });

    it('CA-11.1: rejects marking before the start (ATD-02)', () => {
      const original = stored('confirmed');
      const act = () =>
        original.markAttendance('no_show', new Date(STARTS_AT.getTime() - 1));

      expect(act).toThrow(AppointmentNotStartedError);
      expect(act).toThrow('O agendamento ainda não começou.');
      expect(original.status).toBe('confirmed');
    });
  });
});
