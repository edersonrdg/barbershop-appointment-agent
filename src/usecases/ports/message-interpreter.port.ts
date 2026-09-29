export const MESSAGE_INTERPRETER = Symbol('MessageInterpreter');

export const MESSAGE_TOPICS = ['services', 'address', 'opening_hours'] as const;

export type MessageTopic = (typeof MESSAGE_TOPICS)[number];

export interface MessageInterpretation {
  topics: MessageTopic[];
  /** Catalog names the client asked about. */
  services: string[];
  /** Services the client asked about that are not in the catalog, as written. */
  unknownServices: string[];
  offTopic: boolean;
  /** US-16: the client asked to talk to a person (RF-11). */
  humanRequested: boolean;
}

export interface MessageInterpreterInput {
  barbershopName: string;
  serviceNames: string[];
  text: string;
}

// US-15: the LLM only extracts what the client wants; the reply is written
// from the barbershop's data (RF-09). Every method rejects with
// MessageInterpreterUnavailableError when the model fails.
export interface MessageInterpreter {
  interpret(input: MessageInterpreterInput): Promise<MessageInterpretation>;
  ping(): Promise<void>;
}
