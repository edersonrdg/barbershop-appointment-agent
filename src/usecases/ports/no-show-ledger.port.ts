export const NO_SHOW_LEDGER = Symbol('NoShowLedger');

// The no-show counter is derived from the appointments, never stored: a no-show
// counts while it started after the client's last reset (RN-11, RN-13).
export interface NoShowLedger {
  /**
   * The `no_show` appointments of the client in the barbershop that started
   * after the client's last reset (all of them when there was none).
   */
  countFor(barbershopId: string, clientId: string): Promise<number>;
  /**
   * Marks `now` as the reset of every client of the barbershop with a counted
   * no-show whose latest counted no-show started at or before `cutoff`, and
   * returns how many clients were reset.
   */
  resetExpired(barbershopId: string, cutoff: Date, now: Date): Promise<number>;
}
