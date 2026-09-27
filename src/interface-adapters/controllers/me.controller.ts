import { Controller, Get } from '@nestjs/common';
import { GetMyAccountUseCase } from '../../usecases/get-my-account/get-my-account.use-case';
import {
  MyAccountPresenter,
  MyAccountResponse,
} from '../presenters/my-account.presenter';
import type { AuthenticatedSession } from './authenticated-session';
import { CurrentSession } from './current-session.decorator';
import { Roles } from './roles.decorator';

@Controller('me')
export class MeController {
  constructor(private readonly getMyAccount: GetMyAccountUseCase) {}

  // RN-26: the tenant comes only from the session; query, headers and body
  // are deliberately not read.
  @Get()
  @Roles('owner', 'barber')
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
