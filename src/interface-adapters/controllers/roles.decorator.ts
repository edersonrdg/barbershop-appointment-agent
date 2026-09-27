import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../domain/entities/user';

export const ROLES_KEY = 'roles';

// AD-007: an authenticated route without @Roles accepts only the owner, so a
// route added by a later story is closed to barbers until it says otherwise.
export const DEFAULT_ROLES: readonly UserRole[] = ['owner'];

export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
