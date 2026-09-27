import { IdGenerator } from '../ports/id-generator.port';

export class SequentialIdGenerator implements IdGenerator {
  private counter = 0;

  next(): string {
    this.counter += 1;
    return `id-${this.counter}`;
  }
}
