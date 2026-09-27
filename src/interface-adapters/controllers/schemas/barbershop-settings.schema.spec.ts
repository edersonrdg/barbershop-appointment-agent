import { barbershopSettingsSchema } from './barbershop-settings.schema';

function validBody(): Record<string, unknown> {
  return {
    name: 'Barbearia do Zé',
    address: 'Rua das Flores, 123 - Centro, Campinas/SP',
    timezone: 'America/Sao_Paulo',
    openingHours: {
      monday: {
        opensAt: '09:00',
        closesAt: '19:00',
        break: { startsAt: '12:00', endsAt: '13:00' },
      },
      tuesday: { opensAt: '09:00', closesAt: '19:00', break: null },
      wednesday: null,
      thursday: null,
      friday: null,
      saturday: null,
      sunday: null,
    },
  };
}

function withOpeningHours(changes: Record<string, unknown>) {
  const body = validBody();
  return {
    ...body,
    openingHours: {
      ...(body.openingHours as Record<string, unknown>),
      ...changes,
    },
  };
}

function issuesOf(body: unknown) {
  const result = barbershopSettingsSchema.safeParse(body);
  if (result.success) throw new Error('expected the schema to reject');
  return result.error.issues.map((issue) => ({
    field: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

describe('barbershopSettingsSchema', () => {
  describe('CA-03.2: malformed payloads', () => {
    it('rejects a missing day', () => {
      const body = validBody();
      delete (body.openingHours as Record<string, unknown>).sunday;

      expect(issuesOf(body)).toEqual([
        {
          field: 'openingHours.sunday',
          message:
            'Informe o horário do dia, ou null se a barbearia fica fechada.',
        },
      ]);
    });

    it.each(['25:00', '9:00', '09:00:00'])(
      'rejects the time "%s"',
      (opensAt) => {
        const body = withOpeningHours({
          monday: { opensAt, closesAt: '19:00', break: null },
        });

        expect(issuesOf(body)).toEqual([
          {
            field: 'openingHours.monday.opensAt',
            message: 'Informe o horário no formato HH:mm, entre 00:00 e 23:59.',
          },
        ]);
      },
    );

    it('rejects a break without its end', () => {
      const body = withOpeningHours({
        monday: {
          opensAt: '09:00',
          closesAt: '19:00',
          break: { startsAt: '12:00' },
        },
      });

      expect(issuesOf(body)).toEqual([
        {
          field: 'openingHours.monday.break.endsAt',
          message: 'Informe o horário no formato HH:mm, entre 00:00 e 23:59.',
        },
      ]);
    });

    it('rejects a break without its start', () => {
      const body = withOpeningHours({
        monday: {
          opensAt: '09:00',
          closesAt: '19:00',
          break: { endsAt: '13:00' },
        },
      });

      expect(issuesOf(body)).toEqual([
        {
          field: 'openingHours.monday.break.startsAt',
          message: 'Informe o horário no formato HH:mm, entre 00:00 e 23:59.',
        },
      ]);
    });

    it('rejects a name with 1 character', () => {
      expect(issuesOf({ ...validBody(), name: ' Z ' })).toEqual([
        {
          field: 'name',
          message: 'Informe o nome da barbearia, com 2 a 100 caracteres.',
        },
      ]);
    });

    it('rejects a name with 101 characters', () => {
      expect(issuesOf({ ...validBody(), name: 'a'.repeat(101) })).toEqual([
        {
          field: 'name',
          message: 'Informe o nome da barbearia, com 2 a 100 caracteres.',
        },
      ]);
    });

    it('rejects an address with 4 characters', () => {
      expect(issuesOf({ ...validBody(), address: 'Rua ' })).toEqual([
        {
          field: 'address',
          message: 'Informe o endereço da barbearia, com 5 a 200 caracteres.',
        },
      ]);
    });

    it('rejects an address with 201 characters', () => {
      expect(issuesOf({ ...validBody(), address: 'a'.repeat(201) })).toEqual([
        {
          field: 'address',
          message: 'Informe o endereço da barbearia, com 5 a 200 caracteres.',
        },
      ]);
    });

    it('rejects a missing address', () => {
      const body = validBody();
      delete body.address;

      expect(issuesOf(body)).toEqual([
        {
          field: 'address',
          message: 'Informe o endereço da barbearia, com 5 a 200 caracteres.',
        },
      ]);
    });
  });

  it('CA-03.3: rejects a timezone outside Brazil with "Escolha um fuso horário do Brasil."', () => {
    expect(issuesOf({ ...validBody(), timezone: 'Europe/Lisbon' })).toEqual([
      { field: 'timezone', message: 'Escolha um fuso horário do Brasil.' },
    ]);
  });

  describe('CA-03.1: accepted payloads', () => {
    it('trims name and address and drops extra fields', () => {
      const result = barbershopSettingsSchema.parse({
        ...validBody(),
        name: '  Barbearia do Zé  ',
        address: '  Rua das Flores, 123  ',
        barbershopId: 'other-tenant',
      });

      expect(result).toEqual({
        ...validBody(),
        name: 'Barbearia do Zé',
        address: 'Rua das Flores, 123',
      });
    });

    it('turns an open day without break into break: null', () => {
      const result = barbershopSettingsSchema.parse(
        withOpeningHours({ monday: { opensAt: '09:00', closesAt: '19:00' } }),
      );

      expect(result.openingHours.monday).toEqual({
        opensAt: '09:00',
        closesAt: '19:00',
        break: null,
      });
    });

    it('accepts all 7 days closed and a day from 00:00 to 23:59', () => {
      const allClosed = barbershopSettingsSchema.safeParse(
        withOpeningHours({ monday: null, tuesday: null }),
      );
      const fullDay = barbershopSettingsSchema.safeParse(
        withOpeningHours({
          monday: { opensAt: '00:00', closesAt: '23:59', break: null },
        }),
      );

      expect(allClosed.success).toBe(true);
      expect(fullDay.success).toBe(true);
    });
  });
});
