export const MESSAGE_INTERPRETER = Symbol('MessageInterpreter');

export const MESSAGE_TOPICS = ['services', 'address', 'opening_hours'] as const;

export type MessageTopic = (typeof MESSAGE_TOPICS)[number];

export const BOOKING_PERIODS = ['morning', 'afternoon', 'evening'] as const;

export type BookingPeriod = (typeof BOOKING_PERIODS)[number];

/** CA-17.1: the bot offers up to this many slots at a time. */
export const MAX_OFFERED_SLOTS = 3;

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
  /** Number of the offered option the client chose, 1 to 3. */
  choice: number | null;
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
}

// US-15: the LLM only extracts what the client wants; the reply is written
// from the barbershop's data (RF-09). US-17: it never picks a slot, it only
// says which offered option was chosen. Every method rejects with
// MessageInterpreterUnavailableError when the model fails.
export interface MessageInterpreter {
  interpret(input: MessageInterpreterInput): Promise<MessageInterpretation>;
  ping(): Promise<void>;
}
