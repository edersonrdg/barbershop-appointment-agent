import { UserRole } from '../../domain/entities/user';
import { SubscriptionStatus } from '../../domain/entities/barbershop';
import { MyAccount } from '../../usecases/get-my-account/get-my-account.use-case';

export interface MyAccountResponse {
  user: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    role: UserRole;
  };
  barbershop: {
    id: string;
    name: string;
    timezone: string;
    subscriptionStatus: SubscriptionStatus;
    trialEndsAt: string;
  };
}

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
