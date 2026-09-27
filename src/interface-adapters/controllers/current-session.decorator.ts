import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedSession } from './authenticated-session';

export const CurrentSession = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedSession =>
    context.switchToHttp().getRequest<{ session: AuthenticatedSession }>()
      .session,
);
