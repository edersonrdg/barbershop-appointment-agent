import { Barbershop } from '../../domain/entities/barbershop';
import { User } from '../../domain/entities/user';
import { WhatsAppConnection } from '../../domain/entities/whatsapp-connection';
import { CountingWhatsAppMetrics } from '../testing/counting-whatsapp-metrics';
import { FakeEmailSender } from '../testing/fake-email-sender';
import { FixedClock } from '../testing/fixed-clock';
import { InMemoryAccountStore } from '../testing/in-memory-account-store';
import { InMemoryBarbershopRepository } from '../testing/in-memory-barbershop.repository';
import { InMemoryUserRepository } from '../testing/in-memory-user.repository';
import { InMemoryWhatsAppConnectionRepository } from '../testing/in-memory-whatsapp-connection.repository';
import {
  ApplyWhatsAppConnectionStateUseCase,
  DROP_EMAIL_SUBJECT,
} from './apply-whatsapp-connection-state.use-case';

const NOW = new Date('2026-09-29T15:00:00.000Z');
const APP_WEB_URL = 'https://painel.exemplo.com';

function setup(initial: WhatsAppConnection['status'] = 'connected') {
  const store = new InMemoryAccountStore();
  const barbershop = Barbershop.startTrial({
    id: 'barbershop-a',
    name: 'Barbearia do Zé',
    now: NOW,
  });
  store.barbershops.push(barbershop);
  store.users.push(
    User.createOwner({
      id: 'owner-a',
      barbershopId: barbershop.id,
      name: 'José',
      email: 'dono@barbearia.com',
      phone: '+5511912345678',
      passwordHash: 'hash',
      now: NOW,
    }),
  );
  const connections = new InMemoryWhatsAppConnectionRepository();
  connections.rows.set(
    barbershop.id,
    WhatsAppConnection.restore({
      barbershopId: barbershop.id,
      status: initial,
      disconnectedAt: null,
      updatedAt: new Date('2026-09-28T10:00:00.000Z'),
    }),
  );
  const emailSender = new FakeEmailSender();
  const metrics = new CountingWhatsAppMetrics();
  const useCase = new ApplyWhatsAppConnectionStateUseCase(
    connections,
    new InMemoryBarbershopRepository(store),
    new InMemoryUserRepository(store),
    emailSender,
    metrics,
    new FixedClock(NOW),
    APP_WEB_URL,
  );
  return { useCase, connections, emailSender, metrics, barbershop };
}

describe('ApplyWhatsAppConnectionStateUseCase', () => {
  it('CA-13.3 (C15): the drop e-mail names the barbershop, the local time and the reconnect link', async () => {
    const { useCase, emailSender, barbershop } = setup();

    await useCase.execute({ barbershopId: barbershop.id, state: 'close' });

    expect(emailSender.sent).toHaveLength(1);
    const [message] = emailSender.sent;
    expect(message.to).toBe('dono@barbearia.com');
    expect(message.subject).toBe(DROP_EMAIL_SUBJECT);
    expect(message.subject).toBe('O WhatsApp da barbearia desconectou');
    expect(message.text).toContain('Barbearia do Zé');
    expect(message.text).toContain('29/09/2026 12:00');
    expect(message.text).toContain(
      'https://painel.exemplo.com/configuracoes/whatsapp',
    );
  });

  it('CA-13.3 (C20): a failing e-mail keeps the drop recorded and reports the failure', async () => {
    const { useCase, connections, emailSender, barbershop } = setup();
    const failure = new Error('smtp down');
    emailSender.failure = failure;

    const result = await useCase.execute({
      barbershopId: barbershop.id,
      state: 'close',
    });

    const stored = connections.rows.get(barbershop.id)!;
    expect(stored.status).toBe('disconnected');
    expect(stored.disconnectedAt).toEqual(NOW);
    expect(result.alert).toEqual({ outcome: 'failed', error: failure });
  });

  it('counts a drop once and sends nothing when the drop was already recorded', async () => {
    const { useCase, emailSender, metrics, barbershop } = setup();

    await useCase.execute({ barbershopId: barbershop.id, state: 'close' });
    const second = await useCase.execute({
      barbershopId: barbershop.id,
      state: 'close',
    });

    expect(emailSender.sent).toHaveLength(1);
    expect(metrics.disconnections).toBe(1);
    expect(second.alert).toEqual({ outcome: 'none' });
  });

  it('returns no connection for a barbershop that never asked to connect', async () => {
    const { useCase, emailSender } = setup();

    const result = await useCase.execute({
      barbershopId: 'barbershop-without-connection',
      state: 'close',
    });

    expect(result).toEqual({ connection: null, alert: { outcome: 'none' } });
    expect(emailSender.sent).toEqual([]);
  });
});
