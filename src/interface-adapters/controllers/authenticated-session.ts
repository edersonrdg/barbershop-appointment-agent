import { UserRole } from '../../domain/entities/user';

export interface AuthenticatedSession {
  userId: string;
  barbershopId: string;
  role: UserRole;
}
