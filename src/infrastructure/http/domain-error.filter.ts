import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { DomainError } from '../../domain/errors/domain.error';
import { EmailAlreadyRegisteredError } from '../../domain/errors/email-already-registered.error';
import { InvalidCredentialsError } from '../../domain/errors/invalid-credentials.error';
import { InvalidInvitationError } from '../../domain/errors/invalid-invitation.error';
import { InvalidOpeningHoursError } from '../../domain/errors/invalid-opening-hours.error';
import { InvalidServiceAddOnError } from '../../domain/errors/invalid-service-add-on.error';
import { InvalidPasswordResetTokenError } from '../../domain/errors/invalid-password-reset-token.error';
import { InvitationDeliveryFailedError } from '../../domain/errors/invitation-delivery-failed.error';
import { ServiceNameAlreadyExistsError } from '../../domain/errors/service-name-already-exists.error';
import { ServiceNotFoundError } from '../../domain/errors/service-not-found.error';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';

const STATUS_BY_ERROR = new Map<unknown, HttpStatus>([
  [EmailAlreadyRegisteredError, HttpStatus.CONFLICT],
  [InvalidCredentialsError, HttpStatus.UNAUTHORIZED],
  [InvalidPasswordResetTokenError, HttpStatus.BAD_REQUEST],
  [InvalidInvitationError, HttpStatus.BAD_REQUEST],
  [InvalidOpeningHoursError, HttpStatus.BAD_REQUEST],
  [ServiceNameAlreadyExistsError, HttpStatus.CONFLICT],
  [InvalidServiceAddOnError, HttpStatus.BAD_REQUEST],
  [ServiceNotFoundError, HttpStatus.NOT_FOUND],
  [UserNotFoundError, HttpStatus.NOT_FOUND],
  [InvitationDeliveryFailedError, HttpStatus.BAD_GATEWAY],
]);

@Catch(DomainError)
export class DomainErrorFilter implements ExceptionFilter<DomainError> {
  private readonly logger = new Logger(DomainErrorFilter.name);

  catch(exception: DomainError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = STATUS_BY_ERROR.get(exception.constructor);

    if (status === undefined) {
      // The message of an unmapped error may carry user data (LGPD), so only
      // the code is logged and the client gets a generic body.
      this.logger.error(`Unmapped domain error: ${exception.code}`);
      response
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: 'Erro interno.' });
      return;
    }

    response.status(status).json({ message: exception.message });
  }
}
