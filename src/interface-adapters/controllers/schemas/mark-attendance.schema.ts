import { z } from 'zod';

const STATUS_MESSAGE = 'Informe o status: attended ou no_show.';

export const appointmentIdParamSchema = z.object({
  id: z.uuid({ error: 'Informe um id de agendamento válido.' }),
});

export type AppointmentIdParam = z.infer<typeof appointmentIdParamSchema>;

export const markAttendanceSchema = z.object({
  status: z.enum(['attended', 'no_show'], { error: STATUS_MESSAGE }).meta({
    description:
      'attended (compareceu) ou no_show (faltou). Só vale depois do início do agendamento; a troca entre os dois corrige a marcação.',
    example: 'no_show',
  }),
});

export type MarkAttendanceBody = z.infer<typeof markAttendanceSchema>;
