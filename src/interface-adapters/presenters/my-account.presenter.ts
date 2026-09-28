import { z } from 'zod';
import { MyAccount } from '../../usecases/get-my-account/get-my-account.use-case';

export const myAccountResponseSchema = z.object({
  user: z.object({
    id: z.string().meta({ format: 'uuid' }),
    name: z.string().meta({ example: 'José da Silva' }),
    email: z.string().meta({ example: 'dono@barbearia.com' }),
    phone: z.string().meta({
      description: 'Telefone no formato E.164.',
      example: '+5511912345678',
    }),
    role: z.enum(['owner']).meta({ description: 'Perfil do usuário.' }),
  }),
  barbershop: z.object({
    id: z.string().meta({ format: 'uuid' }),
    name: z.string().meta({ example: 'Barbearia do José' }),
    timezone: z.string().meta({ example: 'America/Sao_Paulo' }),
    subscriptionStatus: z.enum(['trialing']),
    trialEndsAt: z.string().meta({
      format: 'date-time',
      description: 'Fim do período de teste, em UTC (ISO 8601).',
      example: '2026-10-11T12:00:00.000Z',
    }),
  }),
});

export type MyAccountResponse = z.infer<typeof myAccountResponseSchema>;

export class MyAccountPresenter {
  static toResponse({ user, barbershop }: MyAccount): MyAccountResponse {
    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
      barbershop: {
        id: barbershop.id,
        name: barbershop.name,
        timezone: barbershop.timezone,
        subscriptionStatus: barbershop.subscriptionStatus,
        trialEndsAt: barbershop.trialEndsAt.toISOString(),
      },
    };
  }
}
