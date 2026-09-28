import { InvalidServiceAddOnError } from '../errors/invalid-service-add-on.error';
import { ServiceDuration } from '../value-objects/service-duration';
import { ServicePrice } from '../value-objects/service-price';

export const ADD_ON_NOT_FOUND_MESSAGE = 'Serviço adicional não encontrado.';
export const ADD_ON_SELF_MESSAGE =
  'Um serviço não pode ser adicional de si mesmo.';
export const ADD_ON_INACTIVE_MESSAGE =
  'Os serviços adicionais devem estar ativos.';

export interface BarbershopServiceProps {
  id: string;
  barbershopId: string;
  name: string;
  price: ServicePrice;
  duration: ServiceDuration;
  active: boolean;
  suggestedAddOnIds: string[];
  createdAt: Date;
}

export class BarbershopService {
  private constructor(private props: BarbershopServiceProps) {}

  static create({
    id,
    barbershopId,
    name,
    price,
    duration,
    now,
  }: {
    id: string;
    barbershopId: string;
    name: string;
    price: ServicePrice;
    duration: ServiceDuration;
    now: Date;
  }): BarbershopService {
    return new BarbershopService({
      id,
      barbershopId,
      name,
      price,
      duration,
      active: true,
      suggestedAddOnIds: [],
      createdAt: now,
    });
  }

  static restore(props: BarbershopServiceProps): BarbershopService {
    return new BarbershopService(props);
  }

  get id(): string {
    return this.props.id;
  }

  get barbershopId(): string {
    return this.props.barbershopId;
  }

  get name(): string {
    return this.props.name;
  }

  get priceCents(): number {
    return this.props.price.cents;
  }

  get durationMinutes(): number {
    return this.props.duration.minutes;
  }

  get active(): boolean {
    return this.props.active;
  }

  get suggestedAddOnIds(): readonly string[] {
    return this.props.suggestedAddOnIds;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  update({
    name,
    price,
    duration,
  }: {
    name: string;
    price: ServicePrice;
    duration: ServiceDuration;
  }): void {
    this.props = { ...this.props, name, price, duration };
  }

  // CA-04.2: an add-on must be active only when the relation is saved; a later
  // deactivation keeps the relation and US-23 skips inactive add-ons.
  changeSuggestedAddOns(addOns: readonly BarbershopService[]): void {
    for (const addOn of addOns) {
      if (addOn.barbershopId !== this.barbershopId) {
        throw new InvalidServiceAddOnError(ADD_ON_NOT_FOUND_MESSAGE);
      }
      if (addOn.id === this.id) {
        throw new InvalidServiceAddOnError(ADD_ON_SELF_MESSAGE);
      }
      if (!addOn.active) {
        throw new InvalidServiceAddOnError(ADD_ON_INACTIVE_MESSAGE);
      }
    }
    this.props = {
      ...this.props,
      suggestedAddOnIds: addOns.map((addOn) => addOn.id),
    };
  }

  activate(): void {
    this.props = { ...this.props, active: true };
  }

  deactivate(): void {
    this.props = { ...this.props, active: false };
  }
}
