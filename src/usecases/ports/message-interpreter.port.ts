export const MESSAGE_INTERPRETER = Symbol('MessageInterpreter');

export const MESSAGE_TOPICS = ['services', 'address', 'opening_hours'] as const;

export type MessageTopic = (typeof MESSAGE_TOPICS)[number];

export const BOOKING_PERIODS = ['morning', 'afternoon', 'evening'] as const;

export type BookingPeriod = (typeof BOOKING_PERIODS)[number];

/** CA-17.1: the bot offers up to this many slots at a time. */
export const MAX_OFFERED_SLOTS = 3;

/**
 * Highest option number the client can choose: up to 3 offered slots or, in
 * US-18, up to this many of their appointments (door 5).
 */
export const MAX_CHOICE = 10;

export interface MessageInterpretation {
  topics: MessageTopic[];
  /** Catalog names the client asked about, or wants to book (US-17). */
  services: string[];
  /** Services the client asked about that are not in the catalog, as written. */
  unknownServices: string[];
  offTopic: boolean;
  /** US-16: the client asked to talk to a person (RF-11). */
  humanRequested: boolean;
  /** US-17: the client wants to book, or answers the booking in progress. */
  bookingRequested: boolean;
  /** Barber name as registered, when the client named one. */
  barber: string | null;
  /** The client has no barber preference ("tanto faz", RF-03). */
  anyBarber: boolean;
  /** Local date of the barbershop, `YYYY-MM-DD`. */
  date: string | null;
  period: BookingPeriod | null;
  /** Local time, `HH:MM`. */
  time: string | null;
  /** US-18: the client wants to cancel an appointment (RF-04). */
  cancelRequested: boolean;
  /** US-18: the client wants to move an appointment to another slot (RF-04). */
  rescheduleRequested: boolean;
  /** US-19: the client confirms they will come to the appointment (CA-19.2). */
  confirmRequested: boolean;
  /** Number of the listed option the client chose, 1 to `MAX_CHOICE`. */
  choice: number | null;
  /** US-23: the client accepts the suggested add-on service (CA-23.2). */
  addOnAccepted: boolean;
}

export interface MessageInterpreterInput {
  barbershopName: string;
  serviceNames: string[];
  text: string;
  /** Today in the barbershop timezone, so relative dates can be resolved. */
  today: { date: string; weekday: string };
  /** Active barbers of the barbershop. */
  barberNames: string[];
  /** The options in the offer in force, in order, without their numbers. */
  offeredOptions: string[];
  /**
   * US-18: the client's appointments listed for them to pick one, in order,
   * without their numbers.
   */
  appointmentOptions: string[];
  /**
   * US-23: catalog name of the add-on suggested in the previous message,
   * while the client has not answered it.
   */
  suggestedAddOn: string | null;
}

// US-15: the LLM only extracts what the client wants; the reply is written
// from the barbershop's data (RF-09). US-17: it never picks a slot, it only
// says which offered option was chosen. US-18: likewise it only says which
// listed appointment was chosen. US-23: and whether the suggested add-on was
// accepted. Every method rejects with
// MessageInterpreterUnavailableError when the model fails.
export interface MessageInterpreter {
  interpret(input: MessageInterpreterInput): Promise<MessageInterpretation>;
  ping(): Promise<void>;
}
