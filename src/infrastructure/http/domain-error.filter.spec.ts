import { ArgumentsHost, Logger } from '@nestjs/common';
import { DomainError } from '../../domain/errors/domain.error';
import { EmailAlreadyRegisteredError } from '../../domain/errors/email-already-registered.error';
import { InvalidCredentialsError } from '../../domain/errors/invalid-credentials.error';
import { InvalidOpeningHoursError } from '../../domain/errors/invalid-opening-hours.error';
import { InvalidPasswordResetTokenError } from '../../domain/errors/invalid-password-reset-token.error';
import { InvalidServiceAddOnError } from '../../domain/errors/invalid-service-add-on.error';
import { InvalidValueError } from '../../domain/errors/invalid-value.error';
import { ServiceNameAlreadyExistsError } from '../../domain/errors/service-name-already-exists.error';
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

  it('maps an unmapped domain error to 500 without leaking its message', () => {
    expect(handle(new InvalidValueError('telefone +5511912345678'))).toEqual({
      statusCode: 500,
      body: { message: 'Erro interno.' },
    });
  });
});
