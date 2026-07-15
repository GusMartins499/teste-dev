# ADR 0001 — Abstração dos providers de CEP

- **Status:** Aceita
- **Data:** 2026-07-15
- **Cobre:** README §1 (Abstração)

## Contexto

O serviço consulta duas APIs externas (ViaCEP e BrasilAPI) que divergem em tudo que
importa:

| | ViaCEP | BrasilAPI |
|---|---|---|
| Logradouro | `logradouro` | `street` |
| Bairro | `bairro` | `neighborhood` |
| Cidade | `localidade` | `city` |
| UF | `uf` | `state` |
| CEP inexistente | **HTTP 200** + `{"erro": true}` | HTTP 404 |
| CEP malformado | HTTP 400 | HTTP 400 |

Repare na linha mais importante: a ViaCEP **mente no status HTTP** para CEP
inexistente. Os dois providers codificam "não existe" de formas incompatíveis.

O README pergunta explicitamente: *"Se amanhã adicionarmos uma terceira API, o que
muda no código?"*. Existe uma resposta certa — *uma classe nova e um registro* — e
qualquer desenho que exija editar o orquestrador falhou.

## Decisão

**Uma interface com identidade**, e nada mais:

```ts
export interface CepProvider {
  readonly name: string;                    // 'viacep' | 'brasilapi' | ...
  lookup(cep: string): Promise<Address>;
}
```

O `name` faz três trabalhos com uma string só: chave do circuit breaker
([ADR 0002](0002-circuit-breaker-proprio.md)), atributo do span/log
([ADR 0004](0004-observabilidade-otel-jaeger.md)) e `meta.source` na resposta.

**Camada anticorrupção dentro de cada provider.** Cada implementação traduz o
contrato *dela* e os erros *dela* para o vocabulário do domínio antes de deixar
qualquer coisa vazar. `ViaCepProvider` converte `200 + {"erro": true}` em
`CepNotFoundError`; `BrasilApiProvider` converte `404` no **mesmo**
`CepNotFoundError`. Os dois mentem de formas diferentes lá dentro e saem falando a
mesma língua aqui fora.

**Registro por multi-token**, com `Symbol` para não colidir com tokens de terceiros:

```ts
export const CEP_PROVIDERS = Symbol('CEP_PROVIDERS');

{
  provide: CEP_PROVIDERS,
  useFactory: (...providers: CepProvider[]) => providers,
  inject: [ViaCepProvider, BrasilApiProvider],   // ← só esta linha muda
}
```

O `@Inject(CEP_PROVIDERS)` é necessário porque `CepProvider` é interface: o
TypeScript apaga ela na compilação, então não sobra token para o Nest resolver por
tipo. É o preço de programar contra interface em vez de classe concreta — e é
exatamente o que torna esta ADR possível.

**Contrato único `Address`** na saída, idêntico independente de quem respondeu.

## Alternativas consideradas

**`if`/`switch` por provider no serviço.** Rejeitada: transforma a pergunta do README
em "muda o serviço, o enum e mais dois lugares".

**Cada provider devolvendo seu próprio formato, normalizado no serviço.** Rejeitada:
concentra no orquestrador o conhecimento de que a ViaCEP responde 200 em erro. O
`catch` viraria uma árvore de `if (status === 404 || (status === 200 && body.erro))`
— código confuso no lugar mais caro do sistema. Normalizar na borda mantém o serviço
legível.

**Herança de uma `BaseCepProvider` abstrata.** Rejeitada: os dois providers não
compartilham nada além da assinatura. Base class aqui seria acoplamento sem reuso.

## Consequências

**Boas:**
- Terceira API = uma classe nova + o nome dela no `inject`. Serviço, breaker,
  controller, DTO e filtro: zero alteração. O breaker novo nasce sozinho porque a
  chave é o `name`.
- O serviço não conhece status HTTP. Testável sem mock de rede.
- Cada tradução ganha teste unitário isolado — e o `200 + {"erro": true}` da ViaCEP
  é exatamente o tipo de coisa que quebra calada.

**Custos:**
- `@Inject` + `Symbol` é mais cerimônia que injetar a classe direto.
- A tradução é código que existe só para reconciliar formato de terceiro. É trabalho
  real, e ele é pago uma vez por provider.
