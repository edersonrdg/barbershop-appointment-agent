import { z } from 'zod';
import { MarkAttendanceResult } from '../../usecases/mark-attendance/mark-attendance.use-case';
import {
  scheduleAppointmentSchema,
  SchedulePresenter,
} from './schedule.presenter';

export const attendanceResponseSchema = z.object({
  appointment: scheduleAppointmentSchema.meta({
    description: 'Agendamento com o novo status, no formato do item da agenda.',
  }),
  client: z
    .object({
      id: z.string().meta({ format: 'uuid' }),
      noShowCount: z.number().int().meta({
        description:
          'Faltas do cliente na barbearia desde o último reset (RN-11, RN-13).',
        example: 2,
      }),
      selfBookingBlocked: z.boolean().meta({
        description:
          'true quando as faltas atingem o limite de faltas da barbearia: o cliente não agenda sozinho pelo bot (RN-12).',
        example: true,
      }),
    })
    .nullable()
    .meta({ description: 'null quando o agendamento não tem cliente.' }),
});

export type AttendanceResponse = z.infer<typeof attendanceResponseSchema>;

export class AttendancePresenter {
  static toResponse(result: MarkAttendanceResult): AttendanceResponse {
    return {
      appointment: SchedulePresenter.toAppointment(result.appointment),
      client: result.client ? { ...result.client } : null,
    };
  }
}
