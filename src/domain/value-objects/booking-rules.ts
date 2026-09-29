import { InvalidValueError } from '../errors/invalid-value.error';

export const MAX_DEADLINE_MINUTES = 10080;
export const DEADLINE_STEP_MINUTES = 5;
export const MIN_NO_SHOW_LIMIT = 1;
export const MAX_NO_SHOW_LIMIT = 10;
export const MIN_WAITLIST_OFFER_MINUTES = 5;
export const MAX_WAITLIST_OFFER_MINUTES = 120;
export const MIN_RETURN_REMINDER_DAYS = 7;
export const MAX_RETURN_REMINDER_DAYS = 365;

export interface BookingRulesProps {
  minimumAdvanceMinutes: number;
  cancellationDeadlineMinutes: number;
  noShowLimit: number;
  waitlistOfferMinutes: number;
  returnReminderDays: number;
}

// CA-06.1: padrões de toda barbearia nova. Oferta (15 min) e retorno (30 dias)
// são sugestões a validar (PRD §19), por isso ficam editáveis por barbearia.
const DEFAULT_RULES: BookingRulesProps = {
  minimumAdvanceMinutes: 60,
  cancellationDeadlineMinutes: 120,
  noShowLimit: 2,
  waitlistOfferMinutes: 15,
  returnReminderDays: 30,
};

export class BookingRules {
  private constructor(private readonly props: BookingRulesProps) {}

  static create(props: BookingRulesProps): BookingRules {
    if (!BookingRules.isValid(props)) {
      throw new InvalidValueError('Regras de agendamento inválidas.', 'RF-35');
    }
    return new BookingRules({ ...props });
  }

  static defaults(): BookingRules {
    return BookingRules.create(DEFAULT_RULES);
  }

  static isValid(props: BookingRulesProps): boolean {
    return (
      isValidDeadlineMinutes(props.minimumAdvanceMinutes) &&
      isValidDeadlineMinutes(props.cancellationDeadlineMinutes) &&
      isValidNoShowLimit(props.noShowLimit) &&
      isValidWaitlistOfferMinutes(props.waitlistOfferMinutes) &&
      isValidReturnReminderDays(props.returnReminderDays)
    );
  }

  get minimumAdvanceMinutes(): number {
    return this.props.minimumAdvanceMinutes;
  }

  get cancellationDeadlineMinutes(): number {
    return this.props.cancellationDeadlineMinutes;
  }

  get noShowLimit(): number {
    return this.props.noShowLimit;
  }

  get waitlistOfferMinutes(): number {
    return this.props.waitlistOfferMinutes;
  }

  get returnReminderDays(): number {
    return this.props.returnReminderDays;
  }

  // RN-12: the client stays blocked while the count reaches the current limit,
  // so changing the limit re-evaluates every client (ATD-10).
  blocksSelfBooking(noShowCount: number): boolean {
    return noShowCount >= this.props.noShowLimit;
  }
}

// Antecedência e cancelamento aceitam 0: "sem restrição" (CA-06.2).
export function isValidDeadlineMinutes(minutes: number): boolean {
  return (
    isIntegerBetween(minutes, 0, MAX_DEADLINE_MINUTES) &&
    minutes % DEADLINE_STEP_MINUTES === 0
  );
}

export function isValidNoShowLimit(value: number): boolean {
  return isIntegerBetween(value, MIN_NO_SHOW_LIMIT, MAX_NO_SHOW_LIMIT);
}

export function isValidWaitlistOfferMinutes(minutes: number): boolean {
  return isIntegerBetween(
    minutes,
    MIN_WAITLIST_OFFER_MINUTES,
    MAX_WAITLIST_OFFER_MINUTES,
  );
}

export function isValidReturnReminderDays(days: number): boolean {
  return isIntegerBetween(
    days,
    MIN_RETURN_REMINDER_DAYS,
    MAX_RETURN_REMINDER_DAYS,
  );
}

function isIntegerBetween(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}
