import { z } from 'zod';
import { BarbershopService } from '../../domain/entities/barbershop-service';

export const serviceResponseSchema = z.object({
  id: z.uuid(),
  name: z.string().meta({ example: 'Corte' }),
  priceCents: z
    .number()
    .int()
    .meta({ description: 'Preço em centavos de real.', example: 4500 }),
  durationMinutes: z
    .number()
    .int()
    .meta({ description: 'Duração em minutos.', example: 30 }),
  active: z.boolean().meta({
    description: 'false quando o serviço não é mais oferecido.',
  }),
  suggestedAddOnIds: z.array(z.uuid()).meta({
    description: 'Serviços sugeridos como adicionais, na ordem cadastrada.',
  }),
});

export const serviceListResponseSchema = z.object({
  services: z.array(serviceResponseSchema),
});

export type ServiceResponse = z.infer<typeof serviceResponseSchema>;
export type ServiceListResponse = z.infer<typeof serviceListResponseSchema>;

export class ServicePresenter {
  static toResponse(service: BarbershopService): ServiceResponse {
    return {
      id: service.id,
      name: service.name,
      priceCents: service.priceCents,
      durationMinutes: service.durationMinutes,
      active: service.active,
      suggestedAddOnIds: [...service.suggestedAddOnIds],
    };
  }

  static toListResponse(services: BarbershopService[]): ServiceListResponse {
    return {
      services: services.map((service) => ServicePresenter.toResponse(service)),
    };
  }
}
