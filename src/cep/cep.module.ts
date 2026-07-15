import { Module } from '@nestjs/common';
import { CEP_PROVIDERS, type CepProvider } from './cep-provider';
import { CepController } from './cep.controller';
import { CepService } from './cep.service';
import { ViaCepProvider } from './providers/viacep.provider';

@Module({
  controllers: [CepController],
  providers: [
    ViaCepProvider,
    {
      provide: CEP_PROVIDERS,
      useFactory: (...providers: CepProvider[]) => {
        if (providers.length === 0) {
          throw new Error('nenhum provider de CEP registrado em CEP_PROVIDERS');
        }
        return providers;
      },
      inject: [ViaCepProvider],
    },
    CepService,
  ],
})
export class CepModule {}
