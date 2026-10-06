import { SetMetadata } from '@nestjs/common';

export const ALLOW_WHILE_SUSPENDED_KEY = 'allowWhileSuspended';

// US-21 (door 2): a suspended barbershop is read-only, so every authenticated
// write is refused unless its route opts out here, as the subscription routes
// do so the Owner can pay.
export const AllowWhileSuspended = () =>
  SetMetadata(ALLOW_WHILE_SUSPENDED_KEY, true);
