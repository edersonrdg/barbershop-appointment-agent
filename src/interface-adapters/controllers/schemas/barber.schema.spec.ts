import { barberIdParamsSchema } from './barber-id.params.schema';
import { barberSchema } from './barber.schema';

const HAIRCUT_ID = '4f7a1c52-9d0e-4c8b-a3f1-2b6d8e9c0a11';
const BEARD_ID = '8c2e5b31-7a4d-4f9e-b0c6-1d3f5a7e9b22';
const USER_ID = '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed';

const NAME_MESSAGE = 'Informe o nome do barbeiro, com 2 a 60 caracteres.';
const USER_ID_MESSAGE = 'Informe um id de usuário válido, ou null.';
const SERVICES_MESSAGE = 'Escolha de 1 a 50 serviços realizados, sem repetir.';
const SERVICE_ID_MESSAGE = 'Informe um id de serviço válido.';
const TIME_MESSAGE = 'Informe o horário no formato HH:mm, entre 00:00 e 23:59.';
const DAY_MESSAGE = 'Informe a jornada do dia, ou null se for folga.';

const OFF_WEEK = {
  monday: null,
  tuesday: null,
  wednesday: null,
  thursday: null,
  friday: null,
  saturday: null,
  sunday: null,
};

function validBody(): Record<string, unknown> {
  return {
    name: 'João',
    userId: USER_ID,
    serviceIds: [HAIRCUT_ID, BEARD_ID],
    workingHours: {
      ...OFF_WEEK,
      monday: {
        startsAt: '09:00',
        endsAt: '18:00',
        break: { startsAt: '12:00', endsAt: '13:00' },
      },
    },
  };
}

function withMonday(monday: unknown): Record<string, unknown> {
  return { ...validBody(), workingHours: { ...OFF_WEEK, monday } };
}

function issuesOf(body: unknown) {
  const result = barberSchema.safeParse(body);
  if (result.success) throw new Error('expected the schema to reject');
  return result.error.issues.map((issue) => ({
    field: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

function uuids(count: number): string[] {
  return Array.from(
    { length: count },
    (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  );
}

describe('barberSchema', () => {
  it('CA-05.1: accepts a valid body and keeps every field', () => {
    expect(barberSchema.parse(validBody())).toEqual(validBody());
  });

  describe('CA-05.1: serviceIds', () => {
    it.each([
      ['an empty list', []],
      ['51 services', uuids(51)],
      ['a repeated service', [HAIRCUT_ID, HAIRCUT_ID]],
    ])('rejects %s on the serviceIds field', (_case, serviceIds) => {
      expect(issuesOf({ ...validBody(), serviceIds })).toEqual([
        { field: 'serviceIds', message: SERVICES_MESSAGE },
      ]);
    });

    it('rejects a missing list on the serviceIds field', () => {
      const body = validBody();
      delete body.serviceIds;

      expect(issuesOf(body)).toEqual([
        { field: 'serviceIds', message: SERVICES_MESSAGE },
      ]);
    });

    it('rejects an id that is not a uuid on its item', () => {
      expect(issuesOf({ ...validBody(), serviceIds: ['corte'] })).toEqual([
        { field: 'serviceIds.0', message: SERVICE_ID_MESSAGE },
      ]);
    });

    it.each([
      ['1 service', 1],
      ['50 services', 50],
    ])('accepts %s', (_case, count) => {
      const serviceIds = uuids(count);

      expect(
        barberSchema.parse({ ...validBody(), serviceIds }).serviceIds,
      ).toEqual(serviceIds);
    });
  });

  describe('CA-05.1: workingHours', () => {
    it('rejects working hours without a day on that day', () => {
      const sixDays: Record<string, null> = { ...OFF_WEEK };
      delete sixDays.sunday;

      expect(
        issuesOf({
          ...validBody(),
          workingHours: sixDays,
        }),
      ).toEqual([{ field: 'workingHours.sunday', message: DAY_MESSAGE }]);
    });

    it.each([
      ['24:00', '24:00'],
      ['9:00', '9:00'],
      ['a number', 900],
    ])(
      'rejects a start of %s on workingHours.monday.startsAt',
      (_case, startsAt) => {
        expect(issuesOf(withMonday({ startsAt, endsAt: '18:00' }))).toEqual([
          { field: 'workingHours.monday.startsAt', message: TIME_MESSAGE },
        ]);
      },
    );

    it('rejects a day without startsAt', () => {
      expect(issuesOf(withMonday({ endsAt: '18:00' }))).toEqual([
        { field: 'workingHours.monday.startsAt', message: TIME_MESSAGE },
      ]);
    });

    it('rejects a day without endsAt', () => {
      expect(issuesOf(withMonday({ startsAt: '09:00' }))).toEqual([
        { field: 'workingHours.monday.endsAt', message: TIME_MESSAGE },
      ]);
    });

    it('rejects a break without its end', () => {
      expect(
        issuesOf(
          withMonday({
            startsAt: '09:00',
            endsAt: '18:00',
            break: { startsAt: '12:00' },
          }),
        ),
      ).toEqual([
        { field: 'workingHours.monday.break.endsAt', message: TIME_MESSAGE },
      ]);
    });

    it('turns an omitted break into null', () => {
      const parsed = barberSchema.parse(
        withMonday({ startsAt: '09:00', endsAt: '18:00' }),
      );

      expect(parsed.workingHours.monday).toEqual({
        startsAt: '09:00',
        endsAt: '18:00',
        break: null,
      });
    });

    it('accepts every day off', () => {
      expect(
        barberSchema.parse({ ...validBody(), workingHours: OFF_WEEK })
          .workingHours,
      ).toEqual(OFF_WEEK);
    });
  });

  describe('CA-05.2: userId', () => {
    it('turns an omitted userId into null', () => {
      const body = validBody();
      delete body.userId;

      expect(barberSchema.parse(body).userId).toBeNull();
    });

    it('keeps an explicit null', () => {
      expect(
        barberSchema.parse({ ...validBody(), userId: null }).userId,
      ).toBeNull();
    });

    it('rejects a userId that is not a uuid', () => {
      expect(issuesOf({ ...validBody(), userId: 'joao' })).toEqual([
        { field: 'userId', message: USER_ID_MESSAGE },
      ]);
    });
  });

  describe('name', () => {
    it('trims the name', () => {
      expect(
        barberSchema.parse({ ...validBody(), name: '  João  ' }).name,
      ).toBe('João');
    });

    it.each([
      ['a single character after trim', ' J '],
      ['61 characters', 'J'.repeat(61)],
      ['a missing name', undefined],
    ])('rejects %s', (_case, name) => {
      expect(issuesOf({ ...validBody(), name })).toEqual([
        { field: 'name', message: NAME_MESSAGE },
      ]);
    });

    it.each([
      ['2 characters', 'Jo'],
      ['60 characters', 'J'.repeat(60)],
    ])('accepts %s', (_case, name) => {
      expect(barberSchema.parse({ ...validBody(), name }).name).toBe(name);
    });
  });

  it('RN-26: drops active and barbershopId sent in the body', () => {
    const parsed = barberSchema.parse({
      ...validBody(),
      active: false,
      barbershopId: '9f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f',
    });

    expect(parsed).not.toHaveProperty('active');
    expect(parsed).not.toHaveProperty('barbershopId');
  });
});

describe('barberIdParamsSchema', () => {
  it('rejects a barberId that is not a uuid', () => {
    const result = barberIdParamsSchema.safeParse({ barberId: 'joao' });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe(
      'Informe um id de barbeiro válido.',
    );
  });
});
