import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { RegisterBarbershopUseCase } from '../../usecases/register-barbershop/register-barbershop.use-case';
import {
  SessionPresenter,
  SessionResponse,
} from '../presenters/session.presenter';
import { Public } from './public.decorator';
import type { SignupBody } from './schemas/signup.schema';
import { signupSchema } from './schemas/signup.schema';
import { ZodValidationPipe } from './zod-validation.pipe';

@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly registerBarbershop: RegisterBarbershopUseCase) {}

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  async signup(
    @Body(new ZodValidationPipe(signupSchema)) body: SignupBody,
  ): Promise<SessionResponse> {
    return SessionPresenter.toResponse(
      await this.registerBarbershop.execute(body),
    );
  }
}
