import { z } from 'zod';
import { SUSPENSION_REASONS } from '../../domain/entities/barbershop-subscription';

// US-21 (door 3): the panel shows the read-only warning from this field.
export const suspensionReasonSchema = z
  .enum(SUSPENSION_REASONS)
  .nullable()
  .meta({
    description:
      'Por que a barbearia está suspensa, com o painel em modo leitura e o bot sem agendar (US-21): `trial_ended` (o teste gratuito acabou sem pagamento), `payment_overdue` (cobrança recusada há `SUBSCRIPTION_GRACE_DAYS` dias ou mais, padrão 5) ou `subscription_ended` (passou o `cancelsAt` de uma assinatura cancelada). `null` quando não está suspensa.',
    example: null,
  });
