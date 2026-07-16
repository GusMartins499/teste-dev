import { HttpStatus, Injectable } from '@nestjs/common';
import type { Address, CepProvider } from './cep-provider.interface';
import { CepNotFoundError, ProviderUnavailableError } from '../errors';
import { isServerFault, onlyDigits, providerFetch } from './provider-fetch';

const BASE_URL = 'https://brasilapi.com.br/api/cep/v1';
const NOT_FOUND: number = HttpStatus.NOT_FOUND;

interface BrasilApiPayload {
  cep?: string;
  street?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
}

@Injectable()
export class BrasilApiProvider implements CepProvider {
  readonly name = 'brasilapi';

  async lookup(cep: string): Promise<Address> {
    const response = await providerFetch(`${BASE_URL}/${cep}`, this.name);

    if (isServerFault(response.status)) {
      throw new ProviderUnavailableError(this.name, `HTTP ${response.status}`);
    }

    if (response.status === NOT_FOUND) {
      throw new CepNotFoundError(cep, this.name);
    }

    if (!response.ok) {
      throw new Error(`brasilapi respondeu HTTP ${response.status}`);
    }

    const payload = (await response.json()) as BrasilApiPayload;

    return {
      cep: onlyDigits(payload.cep ?? cep),
      logradouro: payload.street ?? '',
      complemento: null,
      bairro: payload.neighborhood ?? '',
      cidade: payload.city ?? '',
      uf: payload.state ?? '',
    };
  }
}
