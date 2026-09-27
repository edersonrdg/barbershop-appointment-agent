import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthenticateUserUseCase } from '../../usecases/authenticate-user/authenticate-user.use-case';
import { RegisterBarbershopUseCase } from '../../usecases/register-barbershop/register-barbershop.use-case';
import {
  SessionPresenter,
  SessionResponse,
} from '../presenters/session.presenter';
import { Public } from './public.decorator';
import type { LoginBody } from './schemas/login.schema';
import { loginSchema } from './schemas/login.schema';
import type { SignupBody } from './schemas/signup.schema';
import { signupSchema } from './schemas/signup.schema';
import { ZodValidationPipe } from './zod-validation.pipe';

@Public()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly registerBarbershop: RegisterBarbershopUseCase,
    private readonly authenticateUser: AuthenticateUserUseCase,
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
}
