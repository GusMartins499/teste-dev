import { Module } from '@nestjs/common';
import { CEP_PROVIDERS } from './providers/cep-provider.interface';
import { CepController } from './cep.controller';
import { CepService } from './cep.service';
import { BrasilApiProvider } from './providers/brasilapi.provider';
import { ViaCepProvider } from './providers/viacep.provider';

@Module({
  controllers: [CepController],
  providers: [
    ViaCepProvider,
    BrasilApiProvider,
    {
      provide: CEP_PROVIDERS,
      useFactory: (viacep: ViaCepProvider, brasilapi: BrasilApiProvider) => [
        viacep,
        brasilapi,
      ],
      inject: [ViaCepProvider, BrasilApiProvider],
    },
    CepService,
  ],
})
export class CepModule {}
