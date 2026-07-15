import {
  CepNotFoundError,
  ProviderTimeoutError,
  ProviderUnavailableError,
} from '../errors';
import { ViaCepProvider } from './viacep.provider';

const FOUND_PAYLOAD = {
  cep: '01310-100',
  logradouro: 'Avenida Paulista',
  complemento: 'de 612 a 1510 - lado par',
  unidade: '',
  bairro: 'Bela Vista',
  localidade: 'São Paulo',
  uf: 'SP',
  estado: 'São Paulo',
  regiao: 'Sudeste',
  ibge: '3550308',
  gia: '1004',
  ddd: '11',
  siafi: '7107',
};

function mockFetch(body: unknown, status = 200): jest.Mock {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => await Promise.resolve(body),
  });
  global.fetch = fetchMock;
  return fetchMock;
}

function mockFetchRejecting(error: unknown): jest.Mock {
  const fetchMock = jest.fn().mockRejectedValue(error);
  global.fetch = fetchMock;
  return fetchMock;
}

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

describe('ViaCepProvider', () => {
  const provider = new ViaCepProvider();

  afterEach(() => jest.restoreAllMocks());

  describe('when the cep is found', () => {
    it('translates the ViaCEP payload into the domain contract', async () => {
      mockFetch(FOUND_PAYLOAD);

      await expect(provider.lookup('01310100')).resolves.toEqual({
        cep: '01310100',
        logradouro: 'Avenida Paulista',
        complemento: 'de 612 a 1510 - lado par',
        bairro: 'Bela Vista',
        cidade: 'São Paulo',
        uf: 'SP',
      });
    });

    it('strips the mask from the cep that ViaCEP returns', async () => {
      mockFetch(FOUND_PAYLOAD);

      const address = await provider.lookup('01310100');

      expect(address.cep).toBe('01310100');
    });

    it('turns an empty complemento into null', async () => {
      mockFetch({ ...FOUND_PAYLOAD, complemento: '' });

      const address = await provider.lookup('01310100');

      expect(address.complemento).toBeNull();
    });
  });

  describe('when the cep does not exist', () => {
    it('maps the string "true" in { erro } on HTTP 200 to CepNotFoundError', async () => {
      mockFetch({ erro: 'true' });

      await expect(provider.lookup('99999999')).rejects.toBeInstanceOf(
        CepNotFoundError,
      );
    });
  });

  describe('when the provider is at fault', () => {
    it('maps a timeout to ProviderTimeoutError', async () => {
      mockFetchRejecting(timeoutError());

      await expect(provider.lookup('01310100')).rejects.toBeInstanceOf(
        ProviderTimeoutError,
      );
    });

    it('reports the configured timeout so the failure is diagnosable', async () => {
      mockFetchRejecting(timeoutError());

      await expect(provider.lookup('01310100')).rejects.toMatchObject({
        provider: 'viacep',
        outcome: 'timeout',
        timeoutMs: 3_000,
      });
    });

    it.each(['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET'])(
      'maps the network failure %s to ProviderUnavailableError',
      async (code) => {
        mockFetchRejecting(networkError(code));

        await expect(provider.lookup('01310100')).rejects.toMatchObject({
          provider: 'viacep',
          outcome: 'unavailable',
          detail: code,
        });
      },
    );

    it.each([500, 502, 503, 504])(
      'maps HTTP %i to ProviderUnavailableError',
      async (status) => {
        mockFetch(null, status);

        await expect(provider.lookup('01310100')).rejects.toBeInstanceOf(
          ProviderUnavailableError,
        );
      },
    );

    it('maps HTTP 429 to ProviderUnavailableError, since rate limiting is their side', async () => {
      mockFetch(null, 429);

      await expect(provider.lookup('01310100')).rejects.toBeInstanceOf(
        ProviderUnavailableError,
      );
    });

    it('never parses the body of a 5xx, because ViaCEP answers errors with HTML', async () => {
      const fetchMock = mockFetch(null, 503);
      fetchMock.mockResolvedValue({
        ok: false,
        status: 503,
        json: async () =>
          await Promise.reject(new Error('should not be called')),
      });

      await expect(provider.lookup('01310100')).rejects.toBeInstanceOf(
        ProviderUnavailableError,
      );
    });
  });

  describe('when we are at fault', () => {
    it('does not disguise a 4xx as a provider failure, because the dto already rejected malformed ceps', async () => {
      mockFetch(null, 400);

      await expect(provider.lookup('123')).rejects.not.toBeInstanceOf(
        ProviderUnavailableError,
      );
      await expect(provider.lookup('123')).rejects.toThrow(
        'viacep respondeu HTTP 400',
      );
    });
  });

  it('aborts the request through a timeout signal', async () => {
    const fetchMock = mockFetch(FOUND_PAYLOAD);

    await provider.lookup('01310100');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
