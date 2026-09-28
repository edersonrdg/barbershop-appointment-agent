import { z } from 'zod';
import { MyAccount } from '../../usecases/get-my-account/get-my-account.use-case';

export const myAccountResponseSchema = z.object({
  user: z.object({
    id: z.uuid(),
    name: z.string().meta({ example: 'Ana Souza' }),
    email: z.string().meta({ example: 'dono@barbearia.com' }),
    phone: z.string().nullable().meta({
      description: 'Telefone em E.164; null para barbeiros convidados.',
      example: '+5511912345678',
    }),
    role: z.enum(['owner', 'barber']),
  }),
  barbershop: z.object({
    id: z.uuid(),
    name: z.string().meta({ example: 'Barbearia do Zé' }),
    timezone: z.string().meta({ example: 'America/Sao_Paulo' }),
    subscriptionStatus: z.enum(['trialing']),
    trialEndsAt: z.iso.datetime().meta({
      description: 'Fim do período de teste, em UTC (ISO 8601).',
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
