import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AcceptInvitationUseCase } from '../../usecases/accept-invitation/accept-invitation.use-case';
import { AuthenticateUserUseCase } from '../../usecases/authenticate-user/authenticate-user.use-case';
import { RequestPasswordResetUseCase } from '../../usecases/request-password-reset/request-password-reset.use-case';
import { ResetPasswordUseCase } from '../../usecases/reset-password/reset-password.use-case';
import { RegisterBarbershopUseCase } from '../../usecases/register-barbershop/register-barbershop.use-case';
import {
  SessionPresenter,
  SessionResponse,
  sessionResponseSchema,
} from '../presenters/session.presenter';
import { ApiErrorResponse } from './api-docs/api-error-response.decorator';
import { ApiZodResponse } from './api-docs/api-zod-response.decorator';
import { messageResponseSchema } from './api-docs/message-response.schema';
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

@ApiTags('Autenticação')
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
  @ApiOperation({
    summary: 'Cadastra a barbearia e o Dono (US-01)',
    description:
      'Cria a barbearia em período de teste, o usuário Dono e já devolve a sessão.',
  })
  @ApiZodResponse({
    status: HttpStatus.CREATED,
    description: 'Barbearia criada e Dono autenticado.',
    schema: sessionResponseSchema,
  })
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    'O e-mail já pertence a outro usuário da plataforma.',
    'Este e-mail já está cadastrado.',
  )
  async signup(
    @Body(new ZodValidationPipe(signupSchema)) body: SignupBody,
  ): Promise<SessionResponse> {
    return SessionPresenter.toResponse(
      await this.registerBarbershop.execute(body),
    );
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Autentica Dono ou Barbeiro (US-01)' })
  @ApiZodResponse({
    status: HttpStatus.OK,
    description: 'Credenciais válidas.',
    schema: sessionResponseSchema,
  })
  @ApiErrorResponse(
    HttpStatus.UNAUTHORIZED,
    'E-mail ou senha inválidos, sem indicar qual dos dois.',
    'E-mail ou senha inválidos.',
  )
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
  @ApiOperation({
    summary: 'Solicita o link de redefinição de senha (US-01)',
    description:
      'A resposta é sempre a mesma, exista ou não o e-mail, para não revelar quem tem cadastro.',
  })
  @ApiZodResponse({
    status: HttpStatus.ACCEPTED,
    description: 'Pedido aceito; o e-mail é enviado se o cadastro existir.',
    schema: messageResponseSchema,
  })
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) body: ForgotPasswordBody,
  ): Promise<typeof FORGOT_PASSWORD_RESPONSE> {
    await this.requestPasswordReset.execute(body);
    return FORGOT_PASSWORD_RESPONSE;
  }

  @Post('password/reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Redefine a senha com o token do e-mail (US-01)' })
  @ApiZodResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Senha alterada; o token deixa de valer.',
  })
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    'Token inválido, expirado ou já usado.',
    'Link de redefinição inválido ou expirado.',
  )
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordBody,
  ): Promise<void> {
    await this.resetPasswordUseCase.execute(body);
  }

  @Post('invitations/accept')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Aceita o convite e cria o acesso do Barbeiro (US-02)',
  })
  @ApiZodResponse({
    status: HttpStatus.CREATED,
    description: 'Barbeiro criado e autenticado.',
    schema: sessionResponseSchema,
  })
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    'Convite inválido, expirado ou já usado.',
    'Convite inválido ou expirado.',
  )
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    'O e-mail do convite já pertence a outro usuário.',
    'Este e-mail já está cadastrado.',
  )
  async acceptInvite(
    @Body(new ZodValidationPipe(acceptInvitationSchema))
    body: AcceptInvitationBody,
  ): Promise<SessionResponse> {
    return SessionPresenter.toResponse(
      await this.acceptInvitation.execute(body),
    );
  }
}
