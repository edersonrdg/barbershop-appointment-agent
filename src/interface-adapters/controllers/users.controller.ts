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
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InviteBarberUseCase } from '../../usecases/invite-barber/invite-barber.use-case';
import { ListUsersUseCase } from '../../usecases/list-users/list-users.use-case';
import { RemoveBarberUseCase } from '../../usecases/remove-barber/remove-barber.use-case';
import {
  InvitationPresenter,
  InvitationResponse,
  invitationResponseSchema,
} from '../presenters/invitation.presenter';
import {
  UserListPresenter,
  UserListResponse,
  userListResponseSchema,
} from '../presenters/user-list.presenter';
import { ApiErrorResponse } from './api-docs/api-error-response.decorator';
import { ApiZodResponse } from './api-docs/api-zod-response.decorator';
import type { AuthenticatedSession } from './authenticated-session';
import { CurrentSession } from './current-session.decorator';
import type { InviteBarberBody } from './schemas/invite-barber.schema';
import { inviteBarberSchema } from './schemas/invite-barber.schema';
import type { UserIdParams } from './schemas/user-id.params.schema';
import { userIdParamsSchema } from './schemas/user-id.params.schema';
import { ZodValidationPipe } from './zod-validation.pipe';

// Owner only: no @Roles, so the session guard denies barbers (AD-007).
@ApiTags('Usuários')
@Controller('users')
export class UsersController {
  constructor(
    private readonly inviteBarber: InviteBarberUseCase,
    private readonly listUsers: ListUsersUseCase,
    private readonly removeBarber: RemoveBarberUseCase,
  ) {}

  @Post('invitations')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Convida um Barbeiro por e-mail (US-02)',
  })
  @ApiZodResponse({
    status: HttpStatus.CREATED,
    description: 'Convite criado e e-mail enviado.',
    schema: invitationResponseSchema,
  })
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    'O e-mail já pertence a um usuário da plataforma.',
    'Este e-mail já está cadastrado.',
  )
  @ApiErrorResponse(
    HttpStatus.BAD_GATEWAY,
    'Falha ao enviar o e-mail do convite.',
    'Não foi possível enviar o convite. Tente novamente.',
  )
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
  @ApiOperation({ summary: 'Lista os usuários da barbearia (US-02)' })
  @ApiZodResponse({
    status: HttpStatus.OK,
    description: 'Dono e Barbeiros da barbearia da sessão.',
    schema: userListResponseSchema,
  })
  async list(
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<UserListResponse> {
    return UserListPresenter.toResponse(
      await this.listUsers.execute({ barbershopId: session.barbershopId }),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remove um Barbeiro (US-02)',
    description: 'O acesso do Barbeiro removido cai na requisição seguinte.',
  })
  @ApiZodResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Barbeiro removido.',
  })
  @ApiErrorResponse(
    HttpStatus.NOT_FOUND,
    'Não há Barbeiro com esse id nesta barbearia (RN-26).',
    'Usuário não encontrado.',
  )
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
