import {
  CepNotFoundError,
  ProviderFailureError,
  ProviderTimeoutError,
  ProviderUnavailableError,
} from './errors';

describe('errors', () => {
  describe('name', () => {
    it.each([
      [new CepNotFoundError('99999999', 'viacep'), 'CepNotFoundError'],
      [new ProviderTimeoutError('viacep', 3_000), 'ProviderTimeoutError'],
      [
        new ProviderUnavailableError('viacep', 'ECONNREFUSED'),
        'ProviderUnavailableError',
      ],
    ])(
      'reports $1 so logs identify the concrete failure',
      (error, expected) => {
        expect(error.name).toBe(expected);
      },
    );

    it('derives the name of a new subclass without it opting in', () => {
      class ProviderRefusedError extends ProviderFailureError {
        constructor(provider: string) {
          super(provider, 'unavailable', 'refused');
        }
      }

      expect(new ProviderRefusedError('brasilapi').name).toBe(
        'ProviderRefusedError',
      );
    });
  });

  describe('taxonomy', () => {
    it.each([
      new ProviderTimeoutError('viacep', 3_000),
      new ProviderUnavailableError('viacep', 'HTTP 503'),
    ])(
      'groups $name under ProviderFailureError, the single fallback discriminator',
      (error) => {
        expect(error).toBeInstanceOf(ProviderFailureError);
      },
    );

    it('keeps CepNotFoundError out of ProviderFailureError, because the provider answered correctly', () => {
      expect(new CepNotFoundError('99999999', 'viacep')).not.toBeInstanceOf(
        ProviderFailureError,
      );
    });
  });
});
