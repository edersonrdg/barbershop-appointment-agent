import { Barbershop } from '../../domain/entities/barbershop';
import { PasswordResetToken } from '../../domain/entities/password-reset-token';
import { User } from '../../domain/entities/user';

export class InMemoryAccountStore {
  barbershops: Barbershop[] = [];
  users: User[] = [];
  passwordResetTokens: PasswordResetToken[] = [];
}
