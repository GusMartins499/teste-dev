export interface Address {
  cep: string;
  logradouro: string;
  complemento: string | null;
  bairro: string;
  cidade: string;
  uf: string;
}

export interface CepResponse extends Address {
  meta: {
    source: string;
  };
}

export const CEP_PROVIDERS = Symbol('CEP_PROVIDERS');

export interface CepProvider {
  readonly name: string;
  lookup(cep: string): Promise<Address>;
}
