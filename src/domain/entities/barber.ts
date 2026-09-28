import { InvalidBarberServiceError } from '../errors/invalid-barber-service.error';
import { InvalidBarberUserError } from '../errors/invalid-barber-user.error';
import { WeeklyWorkingHours } from '../value-objects/weekly-working-hours';
import { BarbershopService } from './barbershop-service';
import { User } from './user';

export const BARBER_SERVICE_REQUIRED_MESSAGE =
  'Informe pelo menos um serviço realizado.';
export const BARBER_SERVICE_NOT_FOUND_MESSAGE = 'Serviço não encontrado.';
export const BARBER_SERVICE_INACTIVE_MESSAGE =
  'Os serviços realizados devem estar ativos.';

export interface BarberProps {
  id: string;
  barbershopId: string;
  name: string;
  active: boolean;
  userId: string | null;
  serviceIds: string[];
  workingHours: WeeklyWorkingHours;
  createdAt: Date;
}

export class Barber {
  private constructor(private props: BarberProps) {}

  static create({
    id,
    barbershopId,
    name,
    workingHours,
    now,
  }: {
    id: string;
    barbershopId: string;
    name: string;
    workingHours: WeeklyWorkingHours;
    now: Date;
  }): Barber {
    return new Barber({
      id,
      barbershopId,
      name,
      active: true,
      userId: null,
      serviceIds: [],
      workingHours,
      createdAt: now,
    });
  }

  static restore(props: BarberProps): Barber {
    return new Barber(props);
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

  get active(): boolean {
    return this.props.active;
  }

  get userId(): string | null {
    return this.props.userId;
  }

  get serviceIds(): readonly string[] {
    return this.props.serviceIds;
  }

  get workingHours(): WeeklyWorkingHours {
    return this.props.workingHours;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  update({
    name,
    workingHours,
  }: {
    name: string;
    workingHours: WeeklyWorkingHours;
  }): void {
    this.props = { ...this.props, name, workingHours };
  }

  // A service must be active only when the relation is saved; a later
  // deactivation keeps the relation and the schedule skips inactive services.
  changeServices(services: readonly BarbershopService[]): void {
    if (services.length === 0) {
      throw new InvalidBarberServiceError(BARBER_SERVICE_REQUIRED_MESSAGE);
    }
    for (const service of services) {
      if (service.barbershopId !== this.barbershopId) {
        throw new InvalidBarberServiceError(BARBER_SERVICE_NOT_FOUND_MESSAGE);
      }
      if (!service.active) {
        throw new InvalidBarberServiceError(BARBER_SERVICE_INACTIVE_MESSAGE);
      }
    }
    this.props = {
      ...this.props,
      serviceIds: services.map((service) => service.id),
    };
  }

  linkUser(user: User | null): void {
    if (user && user.barbershopId !== this.barbershopId) {
      throw new InvalidBarberUserError();
    }
    this.props = { ...this.props, userId: user?.id ?? null };
  }

  activate(): void {
    this.props = { ...this.props, active: true };
  }

  deactivate(): void {
    this.props = { ...this.props, active: false };
  }
}
