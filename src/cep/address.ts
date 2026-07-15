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
