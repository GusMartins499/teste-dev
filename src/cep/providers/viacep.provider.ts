import { Injectable } from '@nestjs/common';
import type { Address, CepProvider } from './cep-provider.interface';
import { CepNotFoundError, ProviderUnavailableError } from '../errors';
import { isServerFault, onlyDigits, providerFetch } from './provider-fetch';

const BASE_URL = 'https://viacep.com.br/ws';

interface ViaCepPayload {
  cep?: string;
  logradouro?: string;
  complemento?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: string | boolean;
}

@Injectable()
export class ViaCepProvider implements CepProvider {
  readonly name = 'viacep';

  async lookup(cep: string): Promise<Address> {
    const response = await providerFetch(`${BASE_URL}/${cep}/json/`, this.name);

    if (isServerFault(response.status)) {
      throw new ProviderUnavailableError(this.name, `HTTP ${response.status}`);
    }

    if (!response.ok) {
      throw new Error(`viacep respondeu HTTP ${response.status}`);
    }

    const payload = (await response.json()) as ViaCepPayload;

    if (payload.erro) {
      throw new CepNotFoundError(cep, this.name);
    }

    return {
      cep: onlyDigits(payload.cep ?? cep),
      logradouro: payload.logradouro ?? '',
      complemento: payload.complemento || null,
      bairro: payload.bairro ?? '',
      cidade: payload.localidade ?? '',
      uf: payload.uf ?? '',
    };
  }
}
