import { z } from 'zod';
import { User } from '../../domain/entities/user';

export const userListResponseSchema = z.object({
  users: z.array(
    z.object({
      id: z.uuid(),
      name: z.string().meta({ example: 'Carlos Silva' }),
      email: z.string().meta({ example: 'barbeiro@barbearia.com' }),
      role: z.enum(['owner', 'barber']),
    }),
  ),
});

export type UserListResponse = z.infer<typeof userListResponseSchema>;

export class UserListPresenter {
  static toResponse(users: User[]): UserListResponse {
    return {
      users: users.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      })),
    };
  }
}
