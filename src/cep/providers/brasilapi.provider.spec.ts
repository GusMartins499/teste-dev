import { CepNotFoundError, ProviderUnavailableError } from '../errors';
import { BrasilApiProvider } from './brasilapi.provider';

const FOUND_PAYLOAD = {
  cep: '01310100',
  state: 'SP',
  city: 'São Paulo',
  neighborhood: 'Bela Vista',
  street: 'Avenida Paulista',
  service: 'open-cep',
};

function mockFetch(body: unknown, status = 200): jest.SpyInstance {
  return jest.spyOn(global, 'fetch').mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => await Promise.resolve(body),
  } as unknown as Response);
}

describe('BrasilApiProvider', () => {
  const provider = new BrasilApiProvider();

  afterEach(() => jest.restoreAllMocks());

  describe('when the cep is found', () => {
    it('translates the BrasilAPI payload into the domain contract', async () => {
      mockFetch(FOUND_PAYLOAD);

      await expect(provider.lookup('01310100')).resolves.toEqual({
        cep: '01310100',
        logradouro: 'Avenida Paulista',
        complemento: null,
        bairro: 'Bela Vista',
        cidade: 'São Paulo',
        uf: 'SP',
      });
    });

    it('always reports complemento as null, since BrasilAPI has no such field', async () => {
      mockFetch(FOUND_PAYLOAD);

      const address = await provider.lookup('01310100');

      expect(address.complemento).toBeNull();
    });
  });

  describe('when the cep does not exist', () => {
    it('maps HTTP 404 to CepNotFoundError, since 404 is a legitimate answer here', async () => {
      mockFetch(null, 404);

      await expect(provider.lookup('99999999')).rejects.toBeInstanceOf(
        CepNotFoundError,
      );
    });
  });

  describe('when the provider is at fault', () => {
    it.each([500, 502, 503, 504, 429])(
      'maps HTTP %i to ProviderUnavailableError',
      async (status) => {
        mockFetch(null, status);

        await expect(provider.lookup('01310100')).rejects.toBeInstanceOf(
          ProviderUnavailableError,
        );
      },
    );
  });

  describe('when we are at fault', () => {
    it('treats a 400 as our bug, not a provider failure, because the dto validated the input', async () => {
      mockFetch(null, 400);

      await expect(provider.lookup('123')).rejects.not.toBeInstanceOf(
        ProviderUnavailableError,
      );
      await expect(provider.lookup('123')).rejects.toThrow(
        'brasilapi respondeu HTTP 400',
      );
    });
  });
});
