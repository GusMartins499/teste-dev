import type { Address } from './address';

export const CEP_PROVIDERS = Symbol('CEP_PROVIDERS');

export interface CepProvider {
  readonly name: string;
  lookup(cep: string): Promise<Address>;
}
