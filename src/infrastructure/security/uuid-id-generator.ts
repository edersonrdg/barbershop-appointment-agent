import { randomUUID } from 'node:crypto';
import { IdGenerator } from '../../usecases/ports/id-generator.port';

export class UuidIdGenerator implements IdGenerator {
  next(): string {
    return randomUUID();
  }
}
