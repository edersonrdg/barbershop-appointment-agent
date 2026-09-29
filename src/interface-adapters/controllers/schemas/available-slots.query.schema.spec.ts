import { availableSlotsQuerySchema } from './available-slots.query.schema';

const DATE_MESSAGE = 'Informe uma data válida no formato AAAA-MM-DD.';
const BARBER_MESSAGE = 'Informe um id de barbeiro válido.';
const COUNT_MESSAGE = 'Escolha de 1 a 10 serviços.';
const SERVICE_ID_MESSAGE = 'Informe um id de serviço válido.';
const REPEATED_MESSAGE = 'Escolha cada serviço uma única vez.';

const BARBER_ID = '7d3c2f7e-5b1a-4c8e-9f2d-1a2b3c4d5e6f';
const HAIRCUT_ID = '0b8e7a52-3f1d-4c6a-9e2b-5d4f3a2c1b0e';
const BEARD_ID = '5c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
const serviceId = (index: number) =>
  `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;

const query = { date: '2026-10-01', serviceIds: `${BEARD_ID},${HAIRCUT_ID}` };

function issuesOf(value: unknown) {
  const result = availableSlotsQuerySchema.safeParse(value);
  if (result.success) throw new Error('expected the schema to reject');
  return result.error.issues.map((issue) => ({
    field: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

describe('availableSlotsQuerySchema', () => {
  it('AGM-20: splits the comma-separated services in order and leaves barberId absent', () => {
    const parsed = availableSlotsQuerySchema.parse(query);

    expect(parsed).toEqual({
      date: '2026-10-01',
      serviceIds: [BEARD_ID, HAIRCUT_ID],
    });
    expect('barberId' in parsed).toBe(false);
  });

  it('AGM-20: keeps a valid barberId', () => {
    expect(
      availableSlotsQuerySchema.parse({ ...query, barberId: BARBER_ID }),
    ).toEqual({
      date: '2026-10-01',
      serviceIds: [BEARD_ID, HAIRCUT_ID],
      barberId: BARBER_ID,
    });
  });

  it.each<
    [string, Record<string, unknown>, { field: string; message: string }]
  >([
    [
      'a date that does not exist',
      { date: '2026-02-30' },
      { field: 'date', message: DATE_MESSAGE },
    ],
    [
      'a date outside AAAA-MM-DD',
      { date: '01/10/2026' },
      { field: 'date', message: DATE_MESSAGE },
    ],
    [
      'a missing date',
      { date: undefined },
      { field: 'date', message: DATE_MESSAGE },
    ],
    [
      'an empty serviceIds',
      { serviceIds: '' },
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
        serviceIds: Array.from({ length: 11 }, (_, index) =>
          serviceId(index),
        ).join(','),
      },
      { field: 'serviceIds', message: COUNT_MESSAGE },
    ],
    [
      'a service id that is not a UUID',
      { serviceIds: `${HAIRCUT_ID},beard` },
      { field: 'serviceIds.1', message: SERVICE_ID_MESSAGE },
    ],
    [
      'a repeated service',
      { serviceIds: `${HAIRCUT_ID},${HAIRCUT_ID}` },
      { field: 'serviceIds', message: REPEATED_MESSAGE },
    ],
    [
      'a barberId that is not a UUID',
      { barberId: 'ana' },
      { field: 'barberId', message: BARBER_MESSAGE },
    ],
  ])('AGM-25: rejects %s with its exact message', (_, overrides, issue) => {
    expect(issuesOf({ ...query, ...overrides })).toEqual([issue]);
  });
});
