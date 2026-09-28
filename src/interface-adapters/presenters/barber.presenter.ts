import { z } from 'zod';
import { Barber } from '../../domain/entities/barber';
import { Weekday, WEEKDAYS } from '../../domain/value-objects/weekday';
import { WorkingHoursWarning } from '../../domain/value-objects/weekly-working-hours';

const timeField = z.string().meta({ description: 'HH:mm', example: '09:00' });

const workingDayResponseSchema = z
  .object({
    startsAt: timeField,
    endsAt: timeField,
    break: z
      .object({ startsAt: timeField, endsAt: timeField })
      .nullable()
      .meta({ description: 'Intervalo do dia; null quando não há.' }),
  })
  .nullable()
  .meta({ description: 'Jornada do dia; null quando é folga.' });

export const barberResponseSchema = z.object({
  id: z.uuid(),
  name: z.string().meta({ example: 'João' }),
  active: z.boolean().meta({
    description: 'false quando o barbeiro não é mais oferecido na agenda.',
  }),
  userId: z.uuid().nullable().meta({
    description: 'Usuário do painel vinculado; null quando não há.',
  }),
  serviceIds: z.array(z.uuid()).meta({
    description: 'Serviços que o barbeiro realiza, na ordem cadastrada.',
  }),
  workingHours: z.object({
    monday: workingDayResponseSchema,
    tuesday: workingDayResponseSchema,
    wednesday: workingDayResponseSchema,
    thursday: workingDayResponseSchema,
    friday: workingDayResponseSchema,
    saturday: workingDayResponseSchema,
    sunday: workingDayResponseSchema,
  }),
});

export const savedBarberResponseSchema = barberResponseSchema.extend({
  warnings: z
    .array(
      z.object({
        weekday: z.enum(WEEKDAYS).meta({ example: 'monday' }),
        message: z.string().meta({
          example:
            'Segunda-feira: só o trecho da jornada dentro do horário de funcionamento estará disponível.',
        }),
      }),
    )
    .meta({
      description:
        'Dias em que parte da jornada fica fora do horário de funcionamento (CA-05.3). A jornada é salva mesmo assim.',
    }),
});

export const barberListResponseSchema = z.object({
  barbers: z.array(barberResponseSchema),
});

export type BarberResponse = z.infer<typeof barberResponseSchema>;
export type SavedBarberResponse = z.infer<typeof savedBarberResponseSchema>;
export type BarberListResponse = z.infer<typeof barberListResponseSchema>;
type WorkingDayResponse = z.infer<typeof workingDayResponseSchema>;

export class BarberPresenter {
  static toResponse(barber: Barber): BarberResponse {
    const workingHours = Object.fromEntries(
      WEEKDAYS.map((weekday) => {
        const day = barber.workingHours.forDay(weekday);
        if (!day) return [weekday, null];
        return [
          weekday,
          {
            startsAt: day.startsAt.toString(),
            endsAt: day.endsAt.toString(),
            break: day.break
              ? {
                  startsAt: day.break.startsAt.toString(),
                  endsAt: day.break.endsAt.toString(),
                }
              : null,
          },
        ];
      }),
    ) as Record<Weekday, WorkingDayResponse>;

    return {
      id: barber.id,
      name: barber.name,
      active: barber.active,
      userId: barber.userId,
      serviceIds: [...barber.serviceIds],
      workingHours,
    };
  }

  static toSavedResponse(
    barber: Barber,
    warnings: WorkingHoursWarning[],
  ): SavedBarberResponse {
    return {
      ...BarberPresenter.toResponse(barber),
      warnings: warnings.map(({ weekday, message }) => ({ weekday, message })),
    };
  }

  static toListResponse(barbers: Barber[]): BarberListResponse {
    return {
      barbers: barbers.map((barber) => BarberPresenter.toResponse(barber)),
    };
  }
}
