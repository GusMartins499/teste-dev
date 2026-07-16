import type { Address, CepProvider } from './providers/cep-provider.interface';
import { CepService } from './cep.service';
import {
  AllProvidersDownError,
  CepNotFoundError,
  ProviderTimeoutError,
  ProviderUnavailableError,
} from './errors';

const ADDRESS: Address = {
  cep: '01310100',
  logradouro: 'Avenida Paulista',
  complemento: null,
  bairro: 'Bela Vista',
  cidade: 'São Paulo',
  uf: 'SP',
};

class FakeProvider implements CepProvider {
  calls = 0;

  constructor(
    readonly name: string,
    private readonly behavior: () => Promise<Address>,
  ) {}

  async lookup(): Promise<Address> {
    this.calls++;
    return await this.behavior();
  }
}

function succeeds(name: string): FakeProvider {
  return new FakeProvider(name, async () => await Promise.resolve(ADDRESS));
}

function fails(name: string, error: Error): FakeProvider {
  return new FakeProvider(name, async () => await Promise.reject(error));
}

describe('CepService', () => {
  describe('rotation', () => {
    it('alternates the starting provider on each call (round-robin)', async () => {
      const a = succeeds('a');
      const b = succeeds('b');
      const service = new CepService([a, b]);

      const first = await service.lookup('01310100');
      const second = await service.lookup('01310100');
      const third = await service.lookup('01310100');

      expect([
        first.meta.source,
        second.meta.source,
        third.meta.source,
      ]).toEqual(['a', 'b', 'a']);
    });

    it('does not call the second provider when the first succeeds', async () => {
      const a = succeeds('a');
      const b = succeeds('b');
      const service = new CepService([a, b]);

      await service.lookup('01310100');

      expect(a.calls).toBe(1);
      expect(b.calls).toBe(0);
    });
  });

  describe('fallback', () => {
    it('falls back to the next provider on a provider failure', async () => {
      const a = fails('a', new ProviderTimeoutError('a', 3_000));
      const b = succeeds('b');
      const service = new CepService([a, b]);

      const result = await service.lookup('01310100');

      expect(result.meta.source).toBe('b');
      expect(b.calls).toBe(1);
    });

    it('throws AllProvidersDownError with every attempt when all fail', async () => {
      const a = fails('a', new ProviderTimeoutError('a', 3_000));
      const b = fails('b', new ProviderUnavailableError('b', 'HTTP 503'));
      const service = new CepService([a, b]);

      await expect(service.lookup('01310100')).rejects.toMatchObject({
        attempts: [
          { provider: 'a', outcome: 'timeout' },
          { provider: 'b', outcome: 'unavailable' },
        ],
      });
      await expect(service.lookup('01310100')).rejects.toBeInstanceOf(
        AllProvidersDownError,
      );
    });
  });

  describe('not found is authoritative', () => {
    it('rethrows CepNotFoundError without trying the next provider', async () => {
      const a = fails('a', new CepNotFoundError('99999999', 'a'));
      const b = succeeds('b');
      const service = new CepService([a, b]);

      await expect(service.lookup('99999999')).rejects.toBeInstanceOf(
        CepNotFoundError,
      );
      expect(b.calls).toBe(0);
    });
  });

  describe('a bug is not a fallback reason', () => {
    it('rethrows an unexpected error without trying the next provider', async () => {
      const a = fails('a', new TypeError('undefined is not a function'));
      const b = succeeds('b');
      const service = new CepService([a, b]);

      await expect(service.lookup('01310100')).rejects.toBeInstanceOf(
        TypeError,
      );
      expect(b.calls).toBe(0);
    });
  });
});
