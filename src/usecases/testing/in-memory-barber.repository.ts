import { Barber } from '../../domain/entities/barber';
import { BarberNameAlreadyExistsError } from '../../domain/errors/barber-name-already-exists.error';
import { BarberNotFoundError } from '../../domain/errors/barber-not-found.error';
import { BarberUserAlreadyLinkedError } from '../../domain/errors/barber-user-already-linked.error';
import { BarberRepository } from '../ports/barber.repository.port';

// Stores snapshots, like a database would, so a use case that mutates an
// entity and then fails leaves the stored state untouched.
export class InMemoryBarberRepository implements BarberRepository {
  private barbers: Barber[] = [];

  listByBarbershop(barbershopId: string): Promise<Barber[]> {
    return Promise.resolve(this.sortedOf(barbershopId).map(snapshot));
  }

  listActiveByBarbershop(barbershopId: string): Promise<Barber[]> {
    return Promise.resolve(
      this.sortedOf(barbershopId)
        .filter((barber) => barber.active)
        .map(snapshot),
    );
  }

  findById(barbershopId: string, barberId: string): Promise<Barber | null> {
    const found = this.barbers.find(
      (barber) =>
        barber.barbershopId === barbershopId && barber.id === barberId,
    );
    return Promise.resolve(found ? snapshot(found) : null);
  }

  findByUserId(barbershopId: string, userId: string): Promise<Barber | null> {
    const found = this.barbers.find(
      (barber) =>
        barber.barbershopId === barbershopId && barber.userId === userId,
    );
    return Promise.resolve(found ? snapshot(found) : null);
  }

  create(barber: Barber): Promise<void> {
    const conflict = this.conflictOf(barber);
    if (conflict) return Promise.reject(conflict);
    this.barbers.push(snapshot(barber));
    return Promise.resolve();
  }

  save(barber: Barber): Promise<void> {
    const index = this.barbers.findIndex(
      (stored) =>
        stored.id === barber.id && stored.barbershopId === barber.barbershopId,
    );
    if (index === -1) return Promise.reject(new BarberNotFoundError());
    const conflict = this.conflictOf(barber);
    if (conflict) return Promise.reject(conflict);
    this.barbers[index] = snapshot(barber);
    return Promise.resolve();
  }

  private sortedOf(barbershopId: string): Barber[] {
    return this.barbers
      .filter((barber) => barber.barbershopId === barbershopId)
      .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  }

  private conflictOf(candidate: Barber): Error | null {
    const others = this.barbers.filter((stored) => stored.id !== candidate.id);
    const nameTaken = others.some(
      (stored) =>
        stored.barbershopId === candidate.barbershopId &&
        stored.name.toLowerCase() === candidate.name.toLowerCase(),
    );
    if (nameTaken) return new BarberNameAlreadyExistsError();
    const userTaken =
      candidate.userId !== null &&
      others.some((stored) => stored.userId === candidate.userId);
    if (userTaken) return new BarberUserAlreadyLinkedError();
    return null;
  }
}

function snapshot(barber: Barber): Barber {
  return Barber.restore({
    id: barber.id,
    barbershopId: barber.barbershopId,
    name: barber.name,
    active: barber.active,
    userId: barber.userId,
    serviceIds: [...barber.serviceIds],
    workingHours: barber.workingHours,
    createdAt: barber.createdAt,
  });
}
