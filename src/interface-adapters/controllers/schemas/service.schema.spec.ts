import { serviceIdParamsSchema } from './service-id.params.schema';
import { serviceSchema } from './service.schema';

const BEARD_ID = '4f7a1c52-9d0e-4c8b-a3f1-2b6d8e9c0a11';
const BROWS_ID = '8c2e5b31-7a4d-4f9e-b0c6-1d3f5a7e9b22';

const NAME_MESSAGE = 'Informe o nome do serviço, com 2 a 60 caracteres.';
const PRICE_MESSAGE = 'Informe o preço em centavos, de 0 a 1000000.';
const DURATION_MESSAGE =
  'Informe a duração em minutos, de 5 a 480, em múltiplos de 5.';
const ADD_ONS_MESSAGE = 'Escolha até 5 serviços adicionais, sem repetir.';

function validBody(): Record<string, unknown> {
  return {
    name: 'Corte',
    priceCents: 4500,
    durationMinutes: 30,
    suggestedAddOnIds: [BEARD_ID],
  };
}

function issuesOf(body: unknown) {
  const result = serviceSchema.safeParse(body);
  if (result.success) throw new Error('expected the schema to reject');
  return result.error.issues.map((issue) => ({
    field: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

function uuids(count: number): string[] {
  return Array.from(
    { length: count },
    (_, index) => `00000000-0000-4000-8000-00000000000${index}`,
  );
}

describe('serviceSchema', () => {
  it('CA-04.4: rejects a negative price on the priceCents field', () => {
    expect(issuesOf({ ...validBody(), priceCents: -1 })).toEqual([
      { field: 'priceCents', message: PRICE_MESSAGE },
    ]);
  });

  it('CA-04.4: rejects a zero duration on the durationMinutes field', () => {
    expect(issuesOf({ ...validBody(), durationMinutes: 0 })).toEqual([
      { field: 'durationMinutes', message: DURATION_MESSAGE },
    ]);
  });

  describe('CA-04.4: limits and format', () => {
    it.each([45.5, 1_000_001, '4500'])(
      'rejects the price %p on the priceCents field',
      (priceCents) => {
        expect(issuesOf({ ...validBody(), priceCents })).toEqual([
          { field: 'priceCents', message: PRICE_MESSAGE },
        ]);
      },
    );

    it.each([4, 485, 7, 30.5])(
      'rejects the duration %p on the durationMinutes field',
      (durationMinutes) => {
        expect(issuesOf({ ...validBody(), durationMinutes })).toEqual([
          { field: 'durationMinutes', message: DURATION_MESSAGE },
        ]);
      },
    );

    it('rejects a name with 1 character after trim', () => {
      expect(issuesOf({ ...validBody(), name: ' C ' })).toEqual([
        { field: 'name', message: NAME_MESSAGE },
      ]);
    });

    it('rejects a name with 61 characters', () => {
      expect(issuesOf({ ...validBody(), name: 'a'.repeat(61) })).toEqual([
        { field: 'name', message: NAME_MESSAGE },
      ]);
    });

    it('rejects a missing price and a missing duration, each on its field', () => {
      const body = validBody();
      delete body.priceCents;
      delete body.durationMinutes;

      expect(issuesOf(body)).toEqual([
        { field: 'priceCents', message: PRICE_MESSAGE },
        { field: 'durationMinutes', message: DURATION_MESSAGE },
      ]);
    });
  });

  describe('CA-04.2: suggested add-on list', () => {
    it('rejects more than 5 add-ons', () => {
      expect(issuesOf({ ...validBody(), suggestedAddOnIds: uuids(6) })).toEqual(
        [{ field: 'suggestedAddOnIds', message: ADD_ONS_MESSAGE }],
      );
    });

    it('rejects a repeated add-on', () => {
      expect(
        issuesOf({ ...validBody(), suggestedAddOnIds: [BEARD_ID, BEARD_ID] }),
      ).toEqual([{ field: 'suggestedAddOnIds', message: ADD_ONS_MESSAGE }]);
    });

    it('rejects an add-on id that is not a uuid', () => {
      expect(
        issuesOf({ ...validBody(), suggestedAddOnIds: [BEARD_ID, 'barba'] }),
      ).toEqual([
        {
          field: 'suggestedAddOnIds.1',
          message: 'Informe um id de serviço adicional válido.',
        },
      ]);
    });

    it('accepts exactly 5 add-ons', () => {
      expect(
        serviceSchema.parse({ ...validBody(), suggestedAddOnIds: uuids(5) })
          .suggestedAddOnIds,
      ).toEqual(uuids(5));
    });
  });

  describe('accepted payloads', () => {
    it('CA-04.1: trims the name and drops extra fields such as active and barbershopId', () => {
      expect(
        serviceSchema.parse({
          ...validBody(),
          name: '  Corte  ',
          active: false,
          barbershopId: 'other-tenant',
          suggestedAddOnIds: [BROWS_ID, BEARD_ID],
        }),
      ).toEqual({
        name: 'Corte',
        priceCents: 4500,
        durationMinutes: 30,
        suggestedAddOnIds: [BROWS_ID, BEARD_ID],
      });
    });

    it('CA-04.2: an omitted add-on list becomes []', () => {
      const body = validBody();
      delete body.suggestedAddOnIds;

      expect(serviceSchema.parse(body).suggestedAddOnIds).toEqual([]);
    });

    it.each([
      ['price 0', { priceCents: 0 }],
      ['duration 5', { durationMinutes: 5 }],
      ['duration 480', { durationMinutes: 480 }],
    ])('CA-04.4: accepts %s', (_case, overrides) => {
      expect(
        serviceSchema.safeParse({ ...validBody(), ...overrides }).success,
      ).toBe(true);
    });
  });
});

describe('serviceIdParamsSchema', () => {
  it('rejects a serviceId that is not a uuid', () => {
    const result = serviceIdParamsSchema.safeParse({ serviceId: 'corte' });

    expect(result.success).toBe(false);
    expect(
      result.error?.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    ).toEqual([
      { field: 'serviceId', message: 'Informe um id de serviço válido.' },
    ]);
  });
});
