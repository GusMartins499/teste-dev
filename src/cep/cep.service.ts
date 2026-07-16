import { Inject, Injectable } from '@nestjs/common';
import {
  CEP_PROVIDERS,
  type CepProvider,
  type CepResponse,
} from './providers/cep-provider.interface';
import {
  AllProvidersDownError,
  CepNotFoundError,
  ProviderFailureError,
  type ProviderAttempt,
} from './errors';
import { RoundRobin } from './round-robin';

@Injectable()
export class CepService {
  private readonly rotation: RoundRobin<CepProvider>;

  constructor(
    @Inject(CEP_PROVIDERS) private readonly providers: CepProvider[],
  ) {
    this.rotation = new RoundRobin(providers);
  }

  async lookup(cep: string): Promise<CepResponse> {
    const attempts: ProviderAttempt[] = [];

    for (const provider of this.rotation.next()) {
      try {
        const address = await provider.lookup(cep);
        return { ...address, meta: { source: provider.name } };
      } catch (error) {
        if (error instanceof CepNotFoundError) {
          throw error;
        }
        if (error instanceof ProviderFailureError) {
          attempts.push({ provider: provider.name, outcome: error.outcome });
          continue;
        }
        throw error;
      }
    }

    throw new AllProvidersDownError(attempts);
  }
}
