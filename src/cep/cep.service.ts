import { Inject, Injectable } from '@nestjs/common';
import type { CepResponse } from './address';
import { CEP_PROVIDERS, type CepProvider } from './cep-provider';

@Injectable()
export class CepService {
  constructor(
    @Inject(CEP_PROVIDERS) private readonly providers: CepProvider[],
  ) {}

  async lookup(cep: string): Promise<CepResponse> {
    const [provider] = this.providers;

    const address = await provider.lookup(cep);

    return { ...address, meta: { source: provider.name } };
  }
}
