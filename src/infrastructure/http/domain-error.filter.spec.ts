import { ArgumentsHost, Logger } from '@nestjs/common';
import { BarberBlockNotFoundError } from '../../domain/errors/barber-block-not-found.error';
import { BarberNameAlreadyExistsError } from '../../domain/errors/barber-name-already-exists.error';
import { BarberNotFoundError } from '../../domain/errors/barber-not-found.error';
import { BarberUserAlreadyLinkedError } from '../../domain/errors/barber-user-already-linked.error';
import { DomainError } from '../../domain/errors/domain.error';
import { InvalidBarberServiceError } from '../../domain/errors/invalid-barber-service.error';
import { InvalidBarberUserError } from '../../domain/errors/invalid-barber-user.error';
import { InvalidWorkingHoursError } from '../../domain/errors/invalid-working-hours.error';
import { EmailAlreadyRegisteredError } from '../../domain/errors/email-already-registered.error';
import { InvalidCredentialsError } from '../../domain/errors/invalid-credentials.error';
import { InvalidOpeningHoursError } from '../../domain/errors/invalid-opening-hours.error';
import { InvalidPasswordResetTokenError } from '../../domain/errors/invalid-password-reset-token.error';
import { InvalidServiceAddOnError } from '../../domain/errors/invalid-service-add-on.error';
import { InvalidValueError } from '../../domain/errors/invalid-value.error';
import { ServiceNameAlreadyExistsError } from '../../domain/errors/service-name-already-exists.error';
import { ServiceNotFoundError } from '../../domain/errors/service-not-found.error';
import { DomainErrorFilter } from './domain-error.filter';

interface CapturedResponse {
  statusCode?: number;
  body?: unknown;
}

function handle(error: DomainError): CapturedResponse {
  const captured: CapturedResponse = {};
  const response = {
    status(code: number) {
      captured.statusCode = code;
      return response;
    },
    json(body: unknown) {
      captured.body = body;
      return response;
    },
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
  new DomainErrorFilter().catch(error, host);

  return captured;
}

describe('DomainErrorFilter', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    [
      'InvalidWorkingHoursError',
      new InvalidWorkingHoursError(
        'Segunda-feira: o fim da jornada deve ser depois do início.',
      ),
      400,
      'Segunda-feira: o fim da jornada deve ser depois do início.',
    ],
    [
      'InvalidBarberServiceError',
      new InvalidBarberServiceError(
        'Os serviços realizados devem estar ativos.',
      ),
      400,
      'Os serviços realizados devem estar ativos.',
    ],
    [
      'InvalidBarberUserError',
      new InvalidBarberUserError(),
      400,
      'Usuário não encontrado.',
    ],
    [
      'BarberNameAlreadyExistsError',
      new BarberNameAlreadyExistsError(),
      409,
      'Já existe um barbeiro com esse nome.',
    ],
    [
      'BarberUserAlreadyLinkedError',
      new BarberUserAlreadyLinkedError(),
      409,
      'Esse usuário já está vinculado a outro barbeiro.',
    ],
    [
      'BarberNotFoundError',
      new BarberNotFoundError(),
      404,
      'Barbeiro não encontrado.',
    ],
  ])(
    'US-05: maps %s to its status with the spec message',
    (_name, error, statusCode, message) => {
      expect(handle(error)).toEqual({ statusCode, body: { message } });
    },
  );

  it('CA-01.3: maps EmailAlreadyRegisteredError to 409 with the spec message', () => {
    expect(handle(new EmailAlreadyRegisteredError())).toEqual({
      statusCode: 409,
      body: { message: 'Este e-mail já está cadastrado.' },
    });
  });

  it('maps InvalidCredentialsError to 401 with the spec message', () => {
    expect(handle(new InvalidCredentialsError())).toEqual({
      statusCode: 401,
      body: { message: 'E-mail ou senha inválidos.' },
    });
  });

  it('CA-01.5: maps InvalidPasswordResetTokenError to 400 with the spec message', () => {
    expect(handle(new InvalidPasswordResetTokenError())).toEqual({
      statusCode: 400,
      body: { message: 'Link de redefinição inválido ou expirado.' },
    });
  });

  it('CA-03.2: maps InvalidOpeningHoursError to 400 with its message', () => {
    const message =
      'Segunda-feira: o horário de fechamento deve ser depois do de abertura.';

    expect(handle(new InvalidOpeningHoursError(message))).toEqual({
      statusCode: 400,
      body: { message },
    });
  });

  it('CA-04.1: maps ServiceNameAlreadyExistsError to 409 with the spec message', () => {
    expect(handle(new ServiceNameAlreadyExistsError())).toEqual({
      statusCode: 409,
      body: { message: 'Já existe um serviço com esse nome.' },
    });
  });

  it('CA-04.2: maps InvalidServiceAddOnError to 400 with its message', () => {
    const message = 'Os serviços adicionais devem estar ativos.';

    expect(handle(new InvalidServiceAddOnError(message))).toEqual({
      statusCode: 400,
      body: { message },
    });
  });

  it('CA-04.3: maps ServiceNotFoundError to 404 with the spec message', () => {
    expect(handle(new ServiceNotFoundError())).toEqual({
      statusCode: 404,
      body: { message: 'Serviço não encontrado.' },
    });
  });

  it('RN-26: maps BarberBlockNotFoundError to 404 with the spec message', () => {
    expect(handle(new BarberBlockNotFoundError())).toEqual({
      statusCode: 404,
      body: { message: 'Bloqueio não encontrado.' },
    });
  });

  it('maps an unmapped domain error to 500 without leaking its message', () => {
    expect(handle(new InvalidValueError('telefone +5511912345678'))).toEqual({
      statusCode: 500,
      body: { message: 'Erro interno.' },
    });
  });
});
