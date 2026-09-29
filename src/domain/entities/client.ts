import { InvalidValueError } from '../errors/invalid-value.error';
import { PhoneNumber } from '../value-objects/phone-number';

const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 80;
export const CLIENT_NAME_MESSAGE =
  'Informe o nome do cliente, com 2 a 80 caracteres.';

export interface ClientProps {
  id: string;
  barbershopId: string;
  name: string;
  phone: string;
  createdAt: Date;
  returnReminderEnabled: boolean;
}

export class Client {
  private constructor(private readonly props: ClientProps) {}

  static create({
    id,
    barbershopId,
    name,
    phone,
    now,
  }: {
    id: string;
    barbershopId: string;
    name: string;
    phone: PhoneNumber;
    now: Date;
  }): Client {
    return new Client({
      id,
      barbershopId,
      name: normalizeName(name),
      phone: phone.value,
      createdAt: now,
      // RN-21: the return reminder stays off until the client opts in (CA-25.1).
      returnReminderEnabled: false,
    });
  }

  static restore(props: ClientProps): Client {
    return new Client({ ...props });
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

  get phone(): string {
    return this.props.phone;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get returnReminderEnabled(): boolean {
    return this.props.returnReminderEnabled;
  }
}

function normalizeName(raw: string): string {
  const name = raw.trim();
  if (name.length < NAME_MIN_LENGTH || name.length > NAME_MAX_LENGTH) {
    throw new InvalidValueError(CLIENT_NAME_MESSAGE);
  }
  return name;
}
