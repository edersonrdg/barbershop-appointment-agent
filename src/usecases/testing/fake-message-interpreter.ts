import { MessageInterpreterUnavailableError } from '../../domain/errors/message-interpreter-unavailable.error';
import {
  MessageInterpretation,
  MessageInterpreter,
  MessageInterpreterInput,
} from '../ports/message-interpreter.port';

const NO_TOPIC: MessageInterpretation = {
  topics: [],
  services: [],
  unknownServices: [],
  offTopic: false,
  humanRequested: false,
};

export class FakeMessageInterpreter implements MessageInterpreter {
  readonly inputs: MessageInterpreterInput[] = [];
  next: MessageInterpretation = NO_TOPIC;
  failing = false;
  pingFailing = false;

  interpret(input: MessageInterpreterInput): Promise<MessageInterpretation> {
    this.inputs.push(input);
    if (this.failing) {
      return Promise.reject(new MessageInterpreterUnavailableError());
    }
    return Promise.resolve(this.next);
  }

  ping(): Promise<void> {
    return this.pingFailing
      ? Promise.reject(new MessageInterpreterUnavailableError())
      : Promise.resolve();
  }

  reset(): void {
    this.inputs.length = 0;
    this.next = NO_TOPIC;
    this.failing = false;
    this.pingFailing = false;
  }
}
