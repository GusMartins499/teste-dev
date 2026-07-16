import { HttpStatus } from '@nestjs/common';
import { ProviderTimeoutError, ProviderUnavailableError } from '../errors';

const TOO_MANY_REQUESTS: number = HttpStatus.TOO_MANY_REQUESTS;
const SERVER_ERROR_FLOOR: number = HttpStatus.INTERNAL_SERVER_ERROR;

export const DEFAULT_TIMEOUT_MS = 3_000;

export async function providerFetch(
  url: string,
  provider: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  try {
    return await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new ProviderTimeoutError(provider, timeoutMs);
    }
    throw new ProviderUnavailableError(provider, networkDetail(error));
  }
}

export function isServerFault(status: number): boolean {
  return status === TOO_MANY_REQUESTS || status >= SERVER_ERROR_FLOOR;
}

export function onlyDigits(cep: string): string {
  return cep.replace(/\D/g, '');
}

function networkDetail(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'unknown';
  }
  const code = (error.cause as { code?: string } | undefined)?.code;
  return code ?? error.name;
}
