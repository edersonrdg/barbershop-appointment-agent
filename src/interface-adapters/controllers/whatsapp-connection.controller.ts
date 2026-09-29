import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConnectWhatsAppUseCase } from '../../usecases/connect-whatsapp/connect-whatsapp.use-case';
import { GetWhatsAppConnectionUseCase } from '../../usecases/get-whatsapp-connection/get-whatsapp-connection.use-case';
import {
  WhatsAppConnectionPresenter,
  WhatsAppConnectionResponse,
  whatsAppConnectionResponseSchema,
  WhatsAppQrCodeResponse,
  whatsAppQrCodeResponseSchema,
} from '../presenters/whatsapp-connection.presenter';
import { ApiErrorResponse } from './api-docs/api-error-response.decorator';
import { ApiZodResponse } from './api-docs/api-zod-response.decorator';
import type { AuthenticatedSession } from './authenticated-session';
import { CurrentSession } from './current-session.decorator';

// Owner only: no @Roles, so the session guard denies barbers (AD-007).
// RN-26: the tenant comes only from the session.
@ApiTags('Configurações')
@Controller('whatsapp/connection')
export class WhatsAppConnectionController {
  private readonly logger = new Logger(WhatsAppConnectionController.name);

  constructor(
    private readonly connectWhatsApp: ConnectWhatsAppUseCase,
    private readonly getWhatsAppConnection: GetWhatsAppConnectionUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Gera o QR code para conectar o WhatsApp da barbearia (US-13)',
    description:
      'Cria a instância da barbearia no conector, se ainda não existir, e devolve um QR code para ler no WhatsApp Business. Chamar de novo devolve um QR code atualizado. O celular continua funcionando depois da conexão.',
  })
  @ApiZodResponse({
    status: HttpStatus.OK,
    description: 'QR code emitido; a conexão fica `connecting`.',
    schema: whatsAppQrCodeResponseSchema,
  })
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    'O número da barbearia já está conectado.',
    'O WhatsApp já está conectado.',
  )
  @ApiErrorResponse(
    HttpStatus.BAD_GATEWAY,
    'O conector de WhatsApp não respondeu, respondeu com erro ou não devolveu QR code.',
    'Não foi possível falar com o WhatsApp. Tente de novo em instantes.',
  )
  async connect(
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<WhatsAppQrCodeResponse> {
    const { qrCode } = await this.connectWhatsApp.execute({
      barbershopId: session.barbershopId,
    });
    return WhatsAppConnectionPresenter.toQrCode(qrCode);
  }

  @Get()
  @ApiOperation({
    summary: 'Status da conexão do WhatsApp da barbearia (US-13)',
    description:
      'Confere o estado atual no conector; se ele não responder, devolve o último estado conhecido. Uma queda detectada aqui também envia o e-mail de alerta aos Donos.',
  })
  @ApiZodResponse({
    status: HttpStatus.OK,
    description: 'Estado da conexão.',
    schema: whatsAppConnectionResponseSchema,
  })
  async show(
    @CurrentSession() session: AuthenticatedSession,
  ): Promise<WhatsAppConnectionResponse> {
    const { connection, alert } = await this.getWhatsAppConnection.execute({
      barbershopId: session.barbershopId,
    });
    if (alert.outcome === 'failed') {
      this.logger.error(
        { barbershopId: session.barbershopId, err: errorIdentity(alert.error) },
        'WhatsApp drop alert could not be e-mailed.',
      );
    }
    return WhatsAppConnectionPresenter.toResponse(connection);
  }
}

// LGPD: an e-mail error may carry the Owner's address, so only its name and
// code are logged.
function errorIdentity(error: unknown): { name?: string; code?: string } {
  const { name, code } = (error ?? {}) as { name?: string; code?: string };
  return { name, code };
}
