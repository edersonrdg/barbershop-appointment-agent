export type WhatsAppConnectionStatus =
  'disconnected' | 'connecting' | 'connected';

// What the messaging connector reports about the number, whatever the vendor.
export type WhatsAppConnectorState = 'open' | 'connecting' | 'close';

export interface WhatsAppConnectionProps {
  barbershopId: string;
  status: WhatsAppConnectionStatus;
  disconnectedAt: Date | null;
  updatedAt: Date;
}

export interface WhatsAppConnectionTransition {
  connection: WhatsAppConnection;
  changed: boolean;
  // A drop is connected -> disconnected, the only change that alerts the Owner
  // (RNF-07, CA-13.3).
  dropped: boolean;
}

export class WhatsAppConnection {
  private constructor(private readonly props: WhatsAppConnectionProps) {}

  // A barbershop that never asked to connect has no stored connection.
  static neverConnected(barbershopId: string, now: Date): WhatsAppConnection {
    return new WhatsAppConnection({
      barbershopId,
      status: 'disconnected',
      disconnectedAt: null,
      updatedAt: now,
    });
  }

  static restore(props: WhatsAppConnectionProps): WhatsAppConnection {
    return new WhatsAppConnection({ ...props });
  }

  get barbershopId(): string {
    return this.props.barbershopId;
  }

  get status(): WhatsAppConnectionStatus {
    return this.props.status;
  }

  get disconnectedAt(): Date | null {
    return this.props.disconnectedAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  startConnecting(now: Date): WhatsAppConnection {
    return this.with({ status: 'connecting' }, now);
  }

  apply(
    state: WhatsAppConnectorState,
    now: Date,
  ): WhatsAppConnectionTransition {
    const unchanged = { connection: this, changed: false, dropped: false };
    const { status } = this.props;

    if (state === 'open') {
      if (status === 'connected') return unchanged;
      return this.changedTo({ status: 'connected', disconnectedAt: null }, now);
    }

    if (state === 'connecting') {
      // The connector reconnects transient drops on its own, so a connected
      // number that is reconnecting still counts as connected.
      if (status !== 'disconnected') return unchanged;
      return this.changedTo({ status: 'connecting' }, now);
    }

    if (status === 'disconnected') return unchanged;
    if (status === 'connecting') {
      // A QR code that expired unread is not a drop.
      return this.changedTo({ status: 'disconnected' }, now);
    }
    return {
      ...this.changedTo({ status: 'disconnected', disconnectedAt: now }, now),
      dropped: true,
    };
  }

  private changedTo(
    changes: Partial<
      Pick<WhatsAppConnectionProps, 'status' | 'disconnectedAt'>
    >,
    now: Date,
  ): WhatsAppConnectionTransition {
    return {
      connection: this.with(changes, now),
      changed: true,
      dropped: false,
    };
  }

  private with(
    changes: Partial<
      Pick<WhatsAppConnectionProps, 'status' | 'disconnectedAt'>
    >,
    now: Date,
  ): WhatsAppConnection {
    return new WhatsAppConnection({
      ...this.props,
      ...changes,
      updatedAt: now,
    });
  }
}
