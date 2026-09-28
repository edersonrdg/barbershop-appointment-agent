import { z } from 'zod';
import { Barbershop } from '../../domain/entities/barbershop';
import { Weekday, WEEKDAYS } from '../../domain/value-objects/weekday';

const timeField = z.string().meta({ description: 'HH:mm', example: '09:00' });

const dayOpeningHoursResponseSchema = z
  .object({
    opensAt: timeField,
    closesAt: timeField,
    break: z
      .object({ startsAt: timeField, endsAt: timeField })
      .nullable()
      .meta({ description: 'Intervalo do dia; null quando não há.' }),
  })
  .nullable()
  .meta({ description: 'Horário do dia; null quando a barbearia fecha.' });

export const barbershopSettingsResponseSchema = z.object({
  name: z.string().meta({ example: 'Barbearia do Zé' }),
  address: z.string().nullable().meta({ example: 'Rua das Flores, 123' }),
  timezone: z.string().meta({ example: 'America/Sao_Paulo' }),
  openingHours: z.object({
    monday: dayOpeningHoursResponseSchema,
    tuesday: dayOpeningHoursResponseSchema,
    wednesday: dayOpeningHoursResponseSchema,
    thursday: dayOpeningHoursResponseSchema,
    friday: dayOpeningHoursResponseSchema,
    saturday: dayOpeningHoursResponseSchema,
    sunday: dayOpeningHoursResponseSchema,
  }),
});

export type BarbershopSettingsResponse = z.infer<
  typeof barbershopSettingsResponseSchema
>;
type DayOpeningHoursResponse = z.infer<typeof dayOpeningHoursResponseSchema>;

export class BarbershopSettingsPresenter {
  static toResponse(barbershop: Barbershop): BarbershopSettingsResponse {
    const openingHours = Object.fromEntries(
      WEEKDAYS.map((weekday) => {
        const day = barbershop.openingHours.forDay(weekday);
        if (!day) return [weekday, null];
        return [
          weekday,
          {
            opensAt: day.opensAt.toString(),
            closesAt: day.closesAt.toString(),
            break: day.break
              ? {
                  startsAt: day.break.startsAt.toString(),
                  endsAt: day.break.endsAt.toString(),
                }
              : null,
          },
        ];
      }),
    ) as Record<Weekday, DayOpeningHoursResponse>;

    return {
      name: barbershop.name,
      address: barbershop.address,
      timezone: barbershop.timezone,
      openingHours,
    };
  }
}
