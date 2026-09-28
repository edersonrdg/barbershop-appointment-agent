import { bookingRulesSchema } from './booking-rules.schema';

type Field =
  | 'minimumAdvanceMinutes'
  | 'cancellationDeadlineMinutes'
  | 'noShowLimit'
  | 'waitlistOfferMinutes'
  | 'returnReminderDays';

const MESSAGES: Record<Field, string> = {
  minimumAdvanceMinutes:
    'Informe a antecedência mínima em minutos, de 0 a 10080, em múltiplos de 5.',
  cancellationDeadlineMinutes:
    'Informe o prazo de cancelamento em minutos, de 0 a 10080, em múltiplos de 5.',
  noShowLimit: 'Informe o limite de faltas, de 1 a 10.',
  waitlistOfferMinutes:
    'Informe o prazo da oferta da lista de espera em minutos, de 5 a 120.',
  returnReminderDays: 'Informe os dias para o lembrete de retorno, de 7 a 365.',
};

const FIELDS = Object.keys(MESSAGES) as Field[];

function validBody(): Record<string, unknown> {
  return {
    minimumAdvanceMinutes: 30,
    cancellationDeadlineMinutes: 240,
    noShowLimit: 3,
    waitlistOfferMinutes: 20,
    returnReminderDays: 45,
  };
}

function issuesOf(body: unknown) {
  const result = bookingRulesSchema.safeParse(body);
  if (result.success) throw new Error('expected the schema to reject');
  return result.error.issues.map((issue) => ({
    field: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

describe('bookingRulesSchema', () => {
  it('CA-06.2: accepts five valid rules and drops extra fields such as barbershopId', () => {
    const result = bookingRulesSchema.parse({
      ...validBody(),
      barbershopId: '6b1f3c1e-1d2a-4c55-9a1b-2f6f3f0e9c11',
    });

    expect(result).toEqual(validBody());
  });

  it('CA-06.2: accepts 0 for minimum advance and cancellation deadline', () => {
    const body = {
      ...validBody(),
      minimumAdvanceMinutes: 0,
      cancellationDeadlineMinutes: 0,
    };

    expect(bookingRulesSchema.parse(body)).toEqual(body);
  });

  describe('CA-06.3: accepts each exact limit', () => {
    it.each<[Field, number]>([
      ['minimumAdvanceMinutes', 0],
      ['minimumAdvanceMinutes', 10080],
      ['cancellationDeadlineMinutes', 0],
      ['cancellationDeadlineMinutes', 10080],
      ['noShowLimit', 1],
      ['noShowLimit', 10],
      ['waitlistOfferMinutes', 5],
      ['waitlistOfferMinutes', 120],
      ['returnReminderDays', 7],
      ['returnReminderDays', 365],
    ])('%s = %p', (field, value) => {
      expect(
        bookingRulesSchema.parse({ ...validBody(), [field]: value })[field],
      ).toBe(value);
    });
  });

  describe('CA-06.3: rejects a negative value on its field', () => {
    it.each<[Field, number]>([
      ['minimumAdvanceMinutes', -5],
      ['cancellationDeadlineMinutes', -5],
      ['noShowLimit', -1],
      ['waitlistOfferMinutes', -5],
      ['returnReminderDays', -7],
    ])('%s = %p', (field, value) => {
      expect(issuesOf({ ...validBody(), [field]: value })).toEqual([
        { field, message: MESSAGES[field] },
      ]);
    });
  });

  describe('CA-06.3: rejects an empty value on its field', () => {
    it.each(FIELDS)('%s missing', (field) => {
      const body = validBody();
      delete body[field];

      expect(issuesOf(body)).toEqual([{ field, message: MESSAGES[field] }]);
    });

    it.each(FIELDS)('%s null', (field) => {
      expect(issuesOf({ ...validBody(), [field]: null })).toEqual([
        { field, message: MESSAGES[field] },
      ]);
    });

    it.each(FIELDS)('%s empty string', (field) => {
      expect(issuesOf({ ...validBody(), [field]: '' })).toEqual([
        { field, message: MESSAGES[field] },
      ]);
    });
  });

  describe('CA-06.3: rejects out-of-range, off-step, non-integer and numeric-string values on their field', () => {
    it.each<[Field, unknown]>([
      ['minimumAdvanceMinutes', 10085],
      ['minimumAdvanceMinutes', 7],
      ['minimumAdvanceMinutes', 60.5],
      ['minimumAdvanceMinutes', '60'],
      ['cancellationDeadlineMinutes', 10085],
      ['cancellationDeadlineMinutes', 7],
      ['cancellationDeadlineMinutes', 120.5],
      ['cancellationDeadlineMinutes', '120'],
      ['noShowLimit', 0],
      ['noShowLimit', 11],
      ['noShowLimit', 2.5],
      ['noShowLimit', '2'],
      ['waitlistOfferMinutes', 4],
      ['waitlistOfferMinutes', 121],
      ['waitlistOfferMinutes', 15.5],
      ['waitlistOfferMinutes', '15'],
      ['returnReminderDays', 6],
      ['returnReminderDays', 366],
      ['returnReminderDays', 30.5],
      ['returnReminderDays', '30'],
    ])('%s = %p', (field, value) => {
      expect(issuesOf({ ...validBody(), [field]: value })).toEqual([
        { field, message: MESSAGES[field] },
      ]);
    });
  });

  it('CA-06.3: reports one error per invalid field', () => {
    expect(
      issuesOf({
        minimumAdvanceMinutes: -5,
        cancellationDeadlineMinutes: 10085,
        noShowLimit: 0,
        waitlistOfferMinutes: 121,
        returnReminderDays: null,
      }),
    ).toEqual(FIELDS.map((field) => ({ field, message: MESSAGES[field] })));
  });
});
