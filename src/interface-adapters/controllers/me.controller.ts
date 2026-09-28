import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { GetMyAccountUseCase } from '../../usecases/get-my-account/get-my-account.use-case';
import {
  MyAccountPresenter,
  MyAccountResponse,
  myAccountResponseSchema,
} from '../presenters/my-account.presenter';
import type { AuthenticatedSession } from './authenticated-session';
import { CurrentSession } from './current-session.decorator';
import { ApiSessionAuth, ApiZodResponse } from './openapi/api-docs.decorators';

@ApiTags('Conta')
@ApiSessionAuth()
@Controller('me')
export class MeController {
  constructor(private readonly getMyAccount: GetMyAccountUseCase) {}

  // RN-26: the tenant comes only from the session; query, headers and body
  // are deliberately not read.
  @Get()
  @ApiOperation({
    summary: 'Dados do usuário logado e da barbearia dele',
    description:
      'A barbearia vem só do token; query, headers e body são ignorados.',
  })
  @ApiZodResponse(
    HttpStatus.OK,
    'Usuário e barbearia da sessão.',
    myAccountResponseSchema,
  )
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
