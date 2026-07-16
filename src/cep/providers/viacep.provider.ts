import { Injectable } from '@nestjs/common';
import type { Address } from '../address';
import type { CepProvider } from '../cep-provider';
import {
  CepNotFoundError,
  ProviderTimeoutError,
  ProviderUnavailableError,
} from '../errors';

const BASE_URL = 'https://viacep.com.br/ws';
const TIMEOUT_MS = 3_000;
const TOO_MANY_REQUESTS = 429;

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
    const response = await this.request(cep);

    if (isProviderFault(response.status)) {
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

  private async request(cep: string): Promise<Response> {
    try {
      return await fetch(`${BASE_URL}/${cep}/json/`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new ProviderTimeoutError(this.name, TIMEOUT_MS);
      }
      throw new ProviderUnavailableError(this.name, networkDetail(error));
    }
  }
}

function isProviderFault(status: number): boolean {
  return status === TOO_MANY_REQUESTS || status >= 500;
}

function networkDetail(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'unknown';
  }
  const code = (error.cause as { code?: string } | undefined)?.code;
  return code ?? error.name;
}

function onlyDigits(cep: string): string {
  return cep.replace(/\D/g, '');
}
