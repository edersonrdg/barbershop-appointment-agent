import { User, UserRole } from '../../domain/entities/user';

export interface UserListResponse {
  users: Array<{
    id: string;
    name: string;
    email: string;
    role: UserRole;
  }>;
}

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
