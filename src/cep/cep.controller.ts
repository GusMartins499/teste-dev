import { Controller, Get, Param } from '@nestjs/common';
import type { CepResponse } from './providers/cep-provider.interface';
import { CepService } from './cep.service';
import { LookupCepParams } from './lookup-cep.dto';

@Controller('cep')
export class CepController {
  constructor(private readonly cepService: CepService) {}

  @Get(':cep')
  async lookup(@Param() params: LookupCepParams): Promise<CepResponse> {
    return await this.cepService.lookup(params.cep);
  }
}
