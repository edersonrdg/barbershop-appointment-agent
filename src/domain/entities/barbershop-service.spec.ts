import { InvalidServiceAddOnError } from '../errors/invalid-service-add-on.error';
import { ServiceDuration } from '../value-objects/service-duration';
import { ServicePrice } from '../value-objects/service-price';
import { BarbershopService } from './barbershop-service';

const NOW = new Date('2026-09-27T12:00:00.000Z');

function buildService(
  id: string,
  name: string,
  barbershopId = 'barbershop-a',
): BarbershopService {
  return BarbershopService.create({
    id,
    barbershopId,
    name,
    price: ServicePrice.create(4500),
    duration: ServiceDuration.create(30),
    now: NOW,
  });
}

function describeService(service: BarbershopService) {
  return {
    id: service.id,
    barbershopId: service.barbershopId,
    name: service.name,
    priceCents: service.priceCents,
    durationMinutes: service.durationMinutes,
    active: service.active,
    suggestedAddOnIds: [...service.suggestedAddOnIds],
    createdAt: service.createdAt,
  };
}

describe('BarbershopService', () => {
  it('CA-04.1: a new service is active, has no add-ons and carries the given values', () => {
    const service = BarbershopService.create({
      id: 'service-1',
      barbershopId: 'barbershop-a',
      name: 'Corte',
      price: ServicePrice.create(4500),
      duration: ServiceDuration.create(30),
      now: NOW,
    });

    expect(describeService(service)).toEqual({
      id: 'service-1',
      barbershopId: 'barbershop-a',
      name: 'Corte',
      priceCents: 4500,
      durationMinutes: 30,
      active: true,
      suggestedAddOnIds: [],
      createdAt: NOW,
    });
  });

  it('CA-04.1: update replaces name, price and duration and keeps active and add-ons', () => {
    const beard = buildService('service-2', 'Barba');
    const service = buildService('service-1', 'Corte');
    service.changeSuggestedAddOns([beard]);
    service.deactivate();

    service.update({
      name: 'Corte Degradê',
      price: ServicePrice.create(5000),
      duration: ServiceDuration.create(45),
    });

    expect(describeService(service)).toEqual({
      id: 'service-1',
      barbershopId: 'barbershop-a',
      name: 'Corte Degradê',
      priceCents: 5000,
      durationMinutes: 45,
      active: false,
      suggestedAddOnIds: ['service-2'],
      createdAt: NOW,
    });
  });

  describe('CA-04.2: suggested add-ons', () => {
    it('keeps the ids of active services of the same barbershop, in the given order', () => {
      const service = buildService('service-1', 'Corte');
      const beard = buildService('service-2', 'Barba');
      const brows = buildService('service-3', 'Sobrancelha');

      service.changeSuggestedAddOns([brows, beard]);

      expect(service.suggestedAddOnIds).toEqual(['service-3', 'service-2']);
    });

    it('replaces the previous list, including with an empty one', () => {
      const service = buildService('service-1', 'Corte');
      const beard = buildService('service-2', 'Barba');
      const brows = buildService('service-3', 'Sobrancelha');
      service.changeSuggestedAddOns([beard]);

      service.changeSuggestedAddOns([brows]);
      expect(service.suggestedAddOnIds).toEqual(['service-3']);

      service.changeSuggestedAddOns([]);
      expect(service.suggestedAddOnIds).toEqual([]);
    });

    it.each([
      [
        'a service of another barbershop',
        () => buildService('service-9', 'Barba', 'barbershop-b'),
        'Serviço adicional não encontrado.',
      ],
      [
        'the service itself',
        () => buildService('service-1', 'Corte'),
        'Um serviço não pode ser adicional de si mesmo.',
      ],
      [
        'an inactive service',
        () => {
          const inactive = buildService('service-2', 'Barba');
          inactive.deactivate();
          return inactive;
        },
        'Os serviços adicionais devem estar ativos.',
      ],
    ])(
      'rejects %s with InvalidServiceAddOnError and keeps the previous list',
      (_case, buildAddOn, message) => {
        const service = buildService('service-1', 'Corte');
        service.changeSuggestedAddOns([buildService('service-3', 'Pézinho')]);

        const change = () =>
          service.changeSuggestedAddOns([
            buildService('service-4', 'Hidratação'),
            buildAddOn(),
          ]);

        expect(change).toThrow(InvalidServiceAddOnError);
        expect(change).toThrow(message);
        expect(service.suggestedAddOnIds).toEqual(['service-3']);
      },
    );
  });

  describe('CA-04.3: deactivate and activate', () => {
    it('deactivate only turns active off; name, price, duration and add-ons stay', () => {
      const service = buildService('service-1', 'Corte');
      service.changeSuggestedAddOns([buildService('service-2', 'Barba')]);
      const before = describeService(service);

      service.deactivate();

      expect(describeService(service)).toEqual({ ...before, active: false });
    });

    it('activate turns an inactive service back on', () => {
      const service = buildService('service-1', 'Corte');
      service.deactivate();

      service.activate();

      expect(service.active).toBe(true);
    });

    it('repeating deactivate or activate changes nothing', () => {
      const service = buildService('service-1', 'Corte');
      service.deactivate();
      const inactive = describeService(service);

      service.deactivate();
      expect(describeService(service)).toEqual(inactive);

      service.activate();
      const active = describeService(service);
      service.activate();
      expect(describeService(service)).toEqual(active);
    });
  });
});
