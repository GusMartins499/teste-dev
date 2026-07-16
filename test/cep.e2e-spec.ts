import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AllExceptionsFilter } from './../src/all-exceptions.filter';
import { AppModule } from './../src/app.module';

describe('GET /cep/:cep (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await app.close();
  });

  function mockViaCep(body: unknown, status = 200): void {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => await Promise.resolve(body),
    } as Response);
  }

  it('returns the unified contract when the cep exists', async () => {
    mockViaCep({
      cep: '01310-100',
      logradouro: 'Avenida Paulista',
      complemento: 'de 612 a 1510 - lado par',
      bairro: 'Bela Vista',
      localidade: 'São Paulo',
      uf: 'SP',
    });

    await request(app.getHttpServer())
      .get('/cep/01310100')
      .expect(200)
      .expect({
        cep: '01310100',
        logradouro: 'Avenida Paulista',
        complemento: 'de 612 a 1510 - lado par',
        bairro: 'Bela Vista',
        cidade: 'São Paulo',
        uf: 'SP',
        meta: { source: 'viacep' },
      });
  });

  it('returns 404 when the cep does not exist, even though ViaCEP answers 200', async () => {
    mockViaCep({ erro: 'true' });

    await request(app.getHttpServer()).get('/cep/99999999').expect(404);
  });

  it('returns 400 for a malformed cep without hitting the network', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(
        new Error('the dto should have rejected this before any request'),
      );

    await request(app.getHttpServer()).get('/cep/123').expect(400);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns 503 when the provider times out, not 500, because the outage is theirs', async () => {
    const timeout = new Error('The operation was aborted due to timeout');
    timeout.name = 'TimeoutError';
    jest.spyOn(global, 'fetch').mockRejectedValue(timeout);

    await request(app.getHttpServer()).get('/cep/01310100').expect(503);
  });

  it('returns 503 when the provider answers 5xx', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => await Promise.reject(new Error('should not be called')),
    } as unknown as Response);

    await request(app.getHttpServer()).get('/cep/01310100').expect(503);
  });

  it('returns 503 when the network is unreachable', async () => {
    const unreachable = new TypeError('fetch failed');
    (unreachable as Error & { cause: { code: string } }).cause = {
      code: 'ENOTFOUND',
    };
    jest.spyOn(global, 'fetch').mockRejectedValue(unreachable);

    await request(app.getHttpServer()).get('/cep/01310100').expect(503);
  });
});
