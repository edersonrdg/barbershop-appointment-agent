import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { InviteBarberUseCase } from '../../usecases/invite-barber/invite-barber.use-case';
import { ListUsersUseCase } from '../../usecases/list-users/list-users.use-case';
import { RemoveBarberUseCase } from '../../usecases/remove-barber/remove-barber.use-case';
import {
  InvitationPresenter,
  InvitationResponse,
} from '../presenters/invitation.presenter';
import {
  UserListPresenter,
  UserListResponse,
} from '../presenters/user-list.presenter';
import type { AuthenticatedSession } from './authenticated-session';
import { CurrentSession } from './current-session.decorator';
import type { InviteBarberBody } from './schemas/invite-barber.schema';
import { inviteBarberSchema } from './schemas/invite-barber.schema';
import type { UserIdParams } from './schemas/user-id.params.schema';
import { userIdParamsSchema } from './schemas/user-id.params.schema';
import { ZodValidationPipe } from './zod-validation.pipe';

// Owner only: no @Roles, so the session guard denies barbers (AD-007).
@Controller('users')
export class UsersController {
  constructor(
    private readonly inviteBarber: InviteBarberUseCase,
    private readonly listUsers: ListUsersUseCase,
    private readonly removeBarber: RemoveBarberUseCase,
  ) {}

  @Post('invitations')
  @HttpCode(HttpStatus.CREATED)
  async invite(
    @CurrentSession() session: AuthenticatedSession,
    @Body(new ZodValidationPipe(inviteBarberSchema)) body: InviteBarberBody,
  ): Promise<InvitationResponse> {
    return InvitationPresenter.toResponse(
      await this.inviteBarber.execute({
        barbershopId: session.barbershopId,
        email: body.email,
        name: body.name,
      }),
    );
  }

  @Get()
  async list(
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<UserListResponse> {
    return UserListPresenter.toResponse(
      await this.listUsers.execute({ barbershopId: session.barbershopId }),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentSession() session: AuthenticatedSession,
    @Param(new ZodValidationPipe(userIdParamsSchema)) params: UserIdParams,
  ): Promise<void> {
    await this.removeBarber.execute({
      barbershopId: session.barbershopId,
      userId: params.id,
    });
  }
}
