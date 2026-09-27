import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AcceptInvitationUseCase } from '../../usecases/accept-invitation/accept-invitation.use-case';
import { AuthenticateUserUseCase } from '../../usecases/authenticate-user/authenticate-user.use-case';
import { RequestPasswordResetUseCase } from '../../usecases/request-password-reset/request-password-reset.use-case';
import { ResetPasswordUseCase } from '../../usecases/reset-password/reset-password.use-case';
import { RegisterBarbershopUseCase } from '../../usecases/register-barbershop/register-barbershop.use-case';
import {
  SessionPresenter,
  SessionResponse,
} from '../presenters/session.presenter';
import { Public } from './public.decorator';
import type { AcceptInvitationBody } from './schemas/accept-invitation.schema';
import { acceptInvitationSchema } from './schemas/accept-invitation.schema';
import type { ForgotPasswordBody } from './schemas/forgot-password.schema';
import { forgotPasswordSchema } from './schemas/forgot-password.schema';
import type { LoginBody } from './schemas/login.schema';
import { loginSchema } from './schemas/login.schema';
import type { ResetPasswordBody } from './schemas/reset-password.schema';
import { resetPasswordSchema } from './schemas/reset-password.schema';
import type { SignupBody } from './schemas/signup.schema';
import { signupSchema } from './schemas/signup.schema';
import { ZodValidationPipe } from './zod-validation.pipe';

const FORGOT_PASSWORD_RESPONSE = {
  message:
    'Se o e-mail estiver cadastrado, enviaremos um link para redefinir a senha.',
};

@Public()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly registerBarbershop: RegisterBarbershopUseCase,
    private readonly authenticateUser: AuthenticateUserUseCase,
    private readonly requestPasswordReset: RequestPasswordResetUseCase,
    private readonly resetPasswordUseCase: ResetPasswordUseCase,
    private readonly acceptInvitation: AcceptInvitationUseCase,
  ) {}

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  async signup(
    @Body(new ZodValidationPipe(signupSchema)) body: SignupBody,
  ): Promise<SessionResponse> {
    return SessionPresenter.toResponse(
      await this.registerBarbershop.execute(body),
    );
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginBody,
  ): Promise<SessionResponse> {
    return SessionPresenter.toResponse(
      await this.authenticateUser.execute(body),
    );
  }

  // The body is fixed so the response never reveals whether the e-mail exists.
  @Post('password/forgot')
  @HttpCode(HttpStatus.ACCEPTED)
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) body: ForgotPasswordBody,
  ): Promise<typeof FORGOT_PASSWORD_RESPONSE> {
    await this.requestPasswordReset.execute(body);
    return FORGOT_PASSWORD_RESPONSE;
  }

  @Post('password/reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordBody,
  ): Promise<void> {
    await this.resetPasswordUseCase.execute(body);
  }

  @Post('invitations/accept')
  @HttpCode(HttpStatus.CREATED)
  async acceptInvite(
    @Body(new ZodValidationPipe(acceptInvitationSchema))
    body: AcceptInvitationBody,
  ): Promise<SessionResponse> {
    return SessionPresenter.toResponse(
      await this.acceptInvitation.execute(body),
    );
  }
}
