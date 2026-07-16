export class CepNotFoundError extends Error {
  constructor(
    readonly cep: string,
    readonly provider: string,
  ) {
    super(`CEP ${cep} não encontrado`);
    this.name = new.target.name;
  }
}

export type ProviderOutcome = 'timeout' | 'unavailable';

export abstract class ProviderFailureError extends Error {
  constructor(
    readonly provider: string,
    readonly outcome: ProviderOutcome,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ProviderTimeoutError extends ProviderFailureError {
  constructor(
    provider: string,
    readonly timeoutMs: number,
  ) {
    super(provider, 'timeout', `${provider} não respondeu em ${timeoutMs}ms`);
  }
}

export class ProviderUnavailableError extends ProviderFailureError {
  constructor(
    provider: string,
    readonly detail: string,
  ) {
    super(provider, 'unavailable', `${provider} indisponível (${detail})`);
  }
}
