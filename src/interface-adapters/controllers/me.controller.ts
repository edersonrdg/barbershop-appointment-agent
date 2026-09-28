import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { GetMyAccountUseCase } from '../../usecases/get-my-account/get-my-account.use-case';
import {
  MyAccountPresenter,
  MyAccountResponse,
  myAccountResponseSchema,
} from '../presenters/my-account.presenter';
import { ApiZodResponse } from './api-docs/api-zod-response.decorator';
import type { AuthenticatedSession } from './authenticated-session';
import { CurrentSession } from './current-session.decorator';
import { Roles } from './roles.decorator';

@ApiTags('Conta')
@Controller('me')
export class MeController {
  constructor(private readonly getMyAccount: GetMyAccountUseCase) {}

  // RN-26: the tenant comes only from the session; query, headers and body
  // are deliberately not read.
  @Get()
  @Roles('owner', 'barber')
  @ApiOperation({
    summary: 'Dados do usuário logado e da barbearia dele (US-01)',
  })
  @ApiZodResponse({
    status: HttpStatus.OK,
    description: 'Usuário e barbearia da sessão.',
    schema: myAccountResponseSchema,
  })
  async show(
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<MyAccountResponse> {
    return MyAccountPresenter.toResponse(
      await this.getMyAccount.execute({
        barbershopId: session.barbershopId,
        userId: session.userId,
      }),
    );
  }
}
