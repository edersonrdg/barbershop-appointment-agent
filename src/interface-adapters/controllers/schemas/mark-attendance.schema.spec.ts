import {
  appointmentIdParamSchema,
  markAttendanceSchema,
} from './mark-attendance.schema';

const STATUS_MESSAGE = 'Informe o status: attended ou no_show.';
const ID_MESSAGE = 'Informe um id de agendamento válido.';
const APPOINTMENT_ID = '7d3c2f7e-5b1a-4c8e-9f2d-1a2b3c4d5e6f';

function issuesOf(
  schema: typeof markAttendanceSchema | typeof appointmentIdParamSchema,
  input: unknown,
) {
  const result = schema.safeParse(input);
  if (result.success) throw new Error('expected the schema to reject');
  return result.error.issues.map((issue) => ({
    field: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

describe('markAttendanceSchema', () => {
  it.each(['attended', 'no_show'])(
    'CA-11.1: accepts the status %p',
    (status) => {
      expect(markAttendanceSchema.parse({ status })).toEqual({ status });
    },
  );

  it.each(['confirmed', 'cancelled', undefined, 1, null])(
    'ATD-17: rejects the status %p with "Informe o status: attended ou no_show."',
    (status) => {
      expect(issuesOf(markAttendanceSchema, { status })).toEqual([
        { field: 'status', message: STATUS_MESSAGE },
      ]);
    },
  );
});

describe('appointmentIdParamSchema', () => {
  it('CA-11.1: accepts a UUID', () => {
    expect(appointmentIdParamSchema.parse({ id: APPOINTMENT_ID })).toEqual({
      id: APPOINTMENT_ID,
    });
  });

  it.each(['not-a-uuid', '123', ''])(
    'ATD-17: rejects the id %p with "Informe um id de agendamento válido."',
    (id) => {
      expect(issuesOf(appointmentIdParamSchema, { id })).toEqual([
        { field: 'id', message: ID_MESSAGE },
      ]);
    },
  );
});
