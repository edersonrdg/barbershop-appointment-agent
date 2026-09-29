import {
  WhatsAppConnection,
  WhatsAppConnectionStatus,
  WhatsAppConnectorState,
} from './whatsapp-connection';

const EARLIER = new Date('2026-09-28T10:00:00.000Z');
const NOW = new Date('2026-09-29T15:00:00.000Z');
const PREVIOUS_DROP = new Date('2026-09-20T08:00:00.000Z');

function stored(status: WhatsAppConnectionStatus): WhatsAppConnection {
  return WhatsAppConnection.restore({
    barbershopId: 'shop-1',
    status,
    disconnectedAt: status === 'connected' ? null : PREVIOUS_DROP,
    updatedAt: EARLIER,
  });
}

interface Row {
  from: WhatsAppConnectionStatus;
  event: WhatsAppConnectorState;
  to: WhatsAppConnectionStatus;
  disconnectedAt: Date | null;
  changed: boolean;
  dropped: boolean;
}

// Every pair of stored status x connector event (9).
const TABLE: Row[] = [
  {
    from: 'connecting',
    event: 'open',
    to: 'connected',
    disconnectedAt: null,
    changed: true,
    dropped: false,
  },
  {
    from: 'disconnected',
    event: 'open',
    to: 'connected',
    disconnectedAt: null,
    changed: true,
    dropped: false,
  },
  {
    from: 'connected',
    event: 'open',
    to: 'connected',
    disconnectedAt: null,
    changed: false,
    dropped: false,
  },
  {
    from: 'connecting',
    event: 'connecting',
    to: 'connecting',
    disconnectedAt: PREVIOUS_DROP,
    changed: false,
    dropped: false,
  },
  {
    from: 'connected',
    event: 'connecting',
    to: 'connected',
    disconnectedAt: null,
    changed: false,
    dropped: false,
  },
  {
    from: 'disconnected',
    event: 'connecting',
    to: 'connecting',
    disconnectedAt: PREVIOUS_DROP,
    changed: true,
    dropped: false,
  },
  {
    from: 'connecting',
    event: 'close',
    to: 'disconnected',
    disconnectedAt: PREVIOUS_DROP,
    changed: true,
    dropped: false,
  },
  {
    from: 'connected',
    event: 'close',
    to: 'disconnected',
    disconnectedAt: NOW,
    changed: true,
    dropped: true,
  },
  {
    from: 'disconnected',
    event: 'close',
    to: 'disconnected',
    disconnectedAt: PREVIOUS_DROP,
    changed: false,
    dropped: false,
  },
];

describe('WhatsAppConnection', () => {
  describe('CA-13.2/CA-13.3 (C10): transition table over the 9 pairs', () => {
    it.each(TABLE)(
      '$from + $event -> $to (changed: $changed, dropped: $dropped)',
      ({ from, event, to, disconnectedAt, changed, dropped }) => {
        const result = stored(from).apply(event, NOW);

        expect(result.connection.status).toBe(to);
        expect(result.connection.disconnectedAt).toEqual(disconnectedAt);
        expect(result.changed).toBe(changed);
        expect(result.dropped).toBe(dropped);
        expect(result.connection.updatedAt).toEqual(changed ? NOW : EARLIER);
      },
    );

    it('covers all 9 pairs exactly once', () => {
      const pairs = new Set(TABLE.map(({ from, event }) => `${from}+${event}`));
      expect(pairs.size).toBe(9);
    });
  });

  it('starts connecting without touching the last drop', () => {
    const connection = stored('disconnected').startConnecting(NOW);

    expect(connection.status).toBe('connecting');
    expect(connection.disconnectedAt).toEqual(PREVIOUS_DROP);
    expect(connection.updatedAt).toEqual(NOW);
  });

  it('builds a never-connected barbershop as disconnected with no drop', () => {
    const connection = WhatsAppConnection.neverConnected('shop-1', NOW);

    expect(connection.status).toBe('disconnected');
    expect(connection.disconnectedAt).toBeNull();
  });
});
