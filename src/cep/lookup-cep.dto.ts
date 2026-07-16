import { Matches } from 'class-validator';

export class LookupCepParams {
  @Matches(/^\d{8}$/, {
    message: 'cep deve conter exatamente 8 dígitos, sem máscara',
  })
  cep!: string;
}
