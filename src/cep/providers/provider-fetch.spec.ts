import { ProviderUnavailableError } from '../errors';
import {
  DEFAULT_TIMEOUT_MS,
  isServerFault,
  onlyDigits,
  providerFetch,
} from './provider-fetch';

function timeoutError(): Error {
  const error = new Error('The operation was aborted due to timeout');
  error.name = 'TimeoutError';
  return error;
}

function networkError(code: string): Error {
  const error = new TypeError('fetch failed');
  (error as Error & { cause: { code: string } }).cause = { code };
  return error;
}

describe('providerFetch', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns the raw response so the caller interprets the status', async () => {
    const response = { ok: true, status: 200 } as Response;
    jest.spyOn(global, 'fetch').mockResolvedValue(response);

    await expect(providerFetch('https://example.com', 'viacep')).resolves.toBe(
      response,
    );
  });

  it('passes an AbortSignal so the request can time out', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, status: 200 } as Response);

    await providerFetch('https://example.com', 'viacep');

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('maps a timeout to ProviderTimeoutError carrying the provider name', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(timeoutError());

    await expect(
      providerFetch('https://example.com', 'brasilapi'),
    ).rejects.toMatchObject({
      provider: 'brasilapi',
      outcome: 'timeout',
      timeoutMs: 3_000,
    });
  });

  it('falls back to the default timeout when none is given', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(timeoutError());

    await expect(
      providerFetch('https://example.com', 'viacep'),
    ).rejects.toMatchObject({ timeoutMs: DEFAULT_TIMEOUT_MS });
  });

  it.each(['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET'])(
    'maps the network failure %s to ProviderUnavailableError',
    async (code) => {
      jest.spyOn(global, 'fetch').mockRejectedValue(networkError(code));

      await expect(
        providerFetch('https://example.com', 'viacep'),
      ).rejects.toMatchObject({ outcome: 'unavailable', detail: code });
    },
  );

  it.each([null, undefined, 'a bare string', 42])(
    'survives a thrown %p without crashing the error path itself',
    async (thrown) => {
      jest.spyOn(global, 'fetch').mockRejectedValue(thrown);

      await expect(
        providerFetch('https://example.com', 'viacep'),
      ).rejects.toBeInstanceOf(ProviderUnavailableError);
    },
  );
});

describe('isServerFault', () => {
  it.each([500, 502, 503, 504, 429])(
    'treats %i as the provider being at fault',
    (status) => {
      expect(isServerFault(status)).toBe(true);
    },
  );

  it.each([200, 400, 404])('does not treat %i as a server fault', (status) => {
    expect(isServerFault(status)).toBe(false);
  });
});

describe('onlyDigits', () => {
  it('strips a cep mask', () => {
    expect(onlyDigits('01310-100')).toBe('01310100');
  });
});
