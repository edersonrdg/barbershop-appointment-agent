import { InvalidValueError } from '../errors/invalid-value.error';
import { CPF_CNPJ_MESSAGE, CpfCnpj } from './cpf-cnpj';

describe('US-20 CPF/CNPJ', () => {
  it.each([
    ['529.982.247-25', '52998224725'],
    ['52998224725', '52998224725'],
    ['11.222.333/0001-81', '11222333000181'],
    ['11222333000181', '11222333000181'],
  ])('AC 6: accepts %s and keeps only the digits (C1)', (raw, digits) => {
    expect(CpfCnpj.create(raw).value).toBe(digits);
    expect(CpfCnpj.isValid(raw)).toBe(true);
  });

  it.each([
    ['52998224724', 'CPF with a wrong check digit'],
    ['11222333000180', 'CNPJ with a wrong check digit'],
    ['11111111111', 'repeated digits'],
    ['5299822472', '10 digits'],
    ['112223330001811', '15 digits'],
    ['abc', 'letters'],
  ])('AC 6: rejects %s (%s) (C1)', (raw) => {
    expect(CpfCnpj.isValid(raw)).toBe(false);
    expect(() => CpfCnpj.create(raw)).toThrow(
      new InvalidValueError(CPF_CNPJ_MESSAGE),
    );
    expect(CPF_CNPJ_MESSAGE).toBe('Informe um CPF ou CNPJ válido.');
  });
});
