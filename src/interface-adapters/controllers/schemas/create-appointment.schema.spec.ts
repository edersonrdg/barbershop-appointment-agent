import { createAppointmentSchema } from './create-appointment.schema';

const BARBER_MESSAGE = 'Informe um id de barbeiro válido.';
const COUNT_MESSAGE = 'Escolha de 1 a 10 serviços.';
const SERVICE_ID_MESSAGE = 'Informe um id de serviço válido.';
const REPEATED_MESSAGE = 'Escolha cada serviço uma única vez.';
const STARTS_AT_MESSAGE =
  'Informe o início em ISO 8601 com fuso, em minuto cheio.';
const NAME_MESSAGE = 'Informe o nome do cliente, com 2 a 80 caracteres.';
const PHONE_MESSAGE = 'Informe um telefone brasileiro válido, com DDD.';

const BARBER_ID = '7d3c2f7e-5b1a-4c8e-9f2d-1a2b3c4d5e6f';
const HAIRCUT_ID = '0b8e7a52-3f1d-4c6a-9e2b-5d4f3a2c1b0e';
const BEARD_ID = '5c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
const serviceId = (index: number) =>
  `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;

const body = {
  barberId: BARBER_ID,
  serviceIds: [HAIRCUT_ID, BEARD_ID],
  startsAt: '2026-10-01T13:00:00.000Z',
  client: { name: 'João', phone: '(11) 98765-4321' },
};

function issuesOf(value: unknown) {
  const result = createAppointmentSchema.safeParse(value);
  if (result.success) throw new Error('expected the schema to reject');
  return result.error.issues.map((issue) => ({
    field: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

describe('createAppointmentSchema', () => {
  it('CA-10.1: turns a valid body into the booking input with a Date start and a trimmed name', () => {
    expect(
      createAppointmentSchema.parse({
        ...body,
        client: { name: '  João  ', phone: '(11) 98765-4321' },
      }),
    ).toEqual({
      barberId: BARBER_ID,
      serviceIds: [HAIRCUT_ID, BEARD_ID],
      startsAt: new Date('2026-10-01T13:00:00.000Z'),
      client: { name: 'João', phone: '(11) 98765-4321' },
    });
  });

  it('CA-10.1: a start with the -03:00 offset becomes the same instant in UTC', () => {
    expect(
      createAppointmentSchema.parse({
        ...body,
        startsAt: '2026-10-01T10:00:00-03:00',
      }).startsAt,
    ).toEqual(new Date('2026-10-01T13:00:00.000Z'));
  });

  it.each([
    ['2 characters', 'Jo'],
    ['80 characters', 'a'.repeat(80)],
  ])('AGM-16: accepts a client name with %s', (_, name) => {
    expect(
      createAppointmentSchema.parse({
        ...body,
        client: { ...body.client, name },
      }).client.name,
    ).toBe(name);
  });

  it('AGM-16: accepts 10 services', () => {
    const serviceIds = Array.from({ length: 10 }, (_, index) =>
      serviceId(index),
    );

    expect(
      createAppointmentSchema.parse({ ...body, serviceIds }).serviceIds,
    ).toEqual(serviceIds);
  });

  it.each<
    [string, Record<string, unknown>, { field: string; message: string }]
  >([
    [
      'a barberId that is not a UUID',
      { barberId: 'ana' },
      { field: 'barberId', message: BARBER_MESSAGE },
    ],
    [
      'a missing barberId',
      { barberId: undefined },
      { field: 'barberId', message: BARBER_MESSAGE },
    ],
    [
      'an empty serviceIds',
      { serviceIds: [] },
      { field: 'serviceIds', message: COUNT_MESSAGE },
    ],
    [
      'a missing serviceIds',
      { serviceIds: undefined },
      { field: 'serviceIds', message: COUNT_MESSAGE },
    ],
    [
      '11 services',
      {
        serviceIds: Array.from({ length: 11 }, (_, index) => serviceId(index)),
      },
      { field: 'serviceIds', message: COUNT_MESSAGE },
    ],
    [
      'a service id that is not a UUID',
      { serviceIds: [HAIRCUT_ID, 'beard'] },
      { field: 'serviceIds.1', message: SERVICE_ID_MESSAGE },
    ],
    [
      'a repeated service',
      { serviceIds: [HAIRCUT_ID, HAIRCUT_ID] },
      { field: 'serviceIds', message: REPEATED_MESSAGE },
    ],
    [
      'a start without offset',
      { startsAt: '2026-10-01T10:00:00' },
      { field: 'startsAt', message: STARTS_AT_MESSAGE },
    ],
    [
      'a start with seconds',
      { startsAt: '2026-10-01T13:00:30Z' },
      { field: 'startsAt', message: STARTS_AT_MESSAGE },
    ],
    [
      'a start with milliseconds',
      { startsAt: '2026-10-01T13:00:00.500Z' },
      { field: 'startsAt', message: STARTS_AT_MESSAGE },
    ],
    [
      'a start that is not a date',
      { startsAt: 'amanhã' },
      { field: 'startsAt', message: STARTS_AT_MESSAGE },
    ],
    [
      'a client name with 1 character after trimming',
      { client: { name: '  J  ', phone: '11987654321' } },
      { field: 'client.name', message: NAME_MESSAGE },
    ],
    [
      'a client name with 81 characters',
      { client: { name: 'a'.repeat(81), phone: '11987654321' } },
      { field: 'client.name', message: NAME_MESSAGE },
    ],
    [
      'a phone without DDD',
      { client: { name: 'João', phone: '98765-4321' } },
      { field: 'client.phone', message: PHONE_MESSAGE },
    ],
    [
      'a phone with letters',
      { client: { name: 'João', phone: '11 9876-ABCD' } },
      { field: 'client.phone', message: PHONE_MESSAGE },
    ],
  ])('AGM-16: rejects %s with its exact message', (_, overrides, issue) => {
    expect(issuesOf({ ...body, ...overrides })).toEqual([issue]);
  });
});
