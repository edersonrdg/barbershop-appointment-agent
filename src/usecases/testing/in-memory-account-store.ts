import { Barbershop } from '../../domain/entities/barbershop';
import { PasswordResetToken } from '../../domain/entities/password-reset-token';
import { User } from '../../domain/entities/user';
import { UserInvitation } from '../../domain/entities/user-invitation';
import { BookingRules } from '../../domain/value-objects/booking-rules';

export class InMemoryAccountStore {
  barbershops: Barbershop[] = [];
  users: User[] = [];
  passwordResetTokens: PasswordResetToken[] = [];
  userInvitations: UserInvitation[] = [];
  bookingRules = new Map<string, BookingRules>();
}
