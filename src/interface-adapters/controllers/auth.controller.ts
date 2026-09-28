import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticateUserUseCase } from '../../usecases/authenticate-user/authenticate-user.use-case';
import { RequestPasswordResetUseCase } from '../../usecases/request-password-reset/request-password-reset.use-case';
import { ResetPasswordUseCase } from '../../usecases/reset-password/reset-password.use-case';
import { RegisterBarbershopUseCase } from '../../usecases/register-barbershop/register-barbershop.use-case';
import {
  SessionPresenter,
  SessionResponse,
  sessionResponseSchema,
} from '../presenters/session.presenter';
import {
  ApiMessageResponse,
  ApiValidationErrorResponse,
  ApiZodBody,
  ApiZodResponse,
} from './openapi/api-docs.decorators';
import { Public } from './public.decorator';
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
  ) {}

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Cadastra a barbearia e o Dono',
    description:
      'Cria a barbearia em período de teste e o usuário Dono, e já devolve a sessão.',
  })
  @ApiZodBody(signupSchema)
  @ApiZodResponse(
    HttpStatus.CREATED,
    'Barbearia criada; sessão do Dono.',
    sessionResponseSchema,
  )
  @ApiValidationErrorResponse()
  @ApiMessageResponse(
    HttpStatus.CONFLICT,
    'E-mail já cadastrado.',
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
  @ApiOperation({ summary: 'Autentica com e-mail e senha' })
  @ApiZodBody(loginSchema)
  @ApiZodResponse(HttpStatus.OK, 'Sessão criada.', sessionResponseSchema)
  @ApiValidationErrorResponse()
  @ApiMessageResponse(
    HttpStatus.UNAUTHORIZED,
    'E-mail ou senha incorretos; a resposta não diz qual dos dois.',
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
    summary: 'Solicita o link de redefinição de senha',
    description:
      'Responde 202 com o mesmo corpo exista ou não o e-mail, para não revelar quais e-mails estão cadastrados.',
  })
  @ApiZodBody(forgotPasswordSchema)
  @ApiMessageResponse(
    HttpStatus.ACCEPTED,
    'Pedido aceito.',
    FORGOT_PASSWORD_RESPONSE.message,
  )
  @ApiValidationErrorResponse()
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) body: ForgotPasswordBody,
  ): Promise<typeof FORGOT_PASSWORD_RESPONSE> {
    await this.requestPasswordReset.execute(body);
    return FORGOT_PASSWORD_RESPONSE;
  }

  @Post('password/reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Redefine a senha com o token do link',
    description: 'O token é de uso único.',
  })
  @ApiZodBody(resetPasswordSchema)
  @ApiZodResponse(HttpStatus.NO_CONTENT, 'Senha redefinida.')
  @ApiValidationErrorResponse({
    description: 'Token inválido, expirado ou já usado.',
    message: 'Link de redefinição inválido ou expirado.',
  })
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordBody,
  ): Promise<void> {
    await this.resetPasswordUseCase.execute(body);
  }
}
