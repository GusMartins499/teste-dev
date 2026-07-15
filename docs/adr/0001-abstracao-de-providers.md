# ADR 0001 — Abstração dos providers de CEP

- **Status:** Aceita
- **Data:** 2026-07-15
- **Cobre:** README §1 (Abstração)

## Contexto

O serviço consulta duas APIs externas (ViaCEP e BrasilAPI) que divergem em tudo que
importa:

Formatos confirmados chamando as duas APIs em 2026-07-15, não de memória:

| | ViaCEP | BrasilAPI |
|---|---|---|
| Logradouro | `logradouro` | `street` |
| Bairro | `bairro` | `neighborhood` |
| Cidade | `localidade` | `city` |
| UF | `uf` | `state` |
| Complemento | `complemento` | **não expõe** |
| CEP devolvido | `"01310-100"` (com máscara) | `"01310100"` |
| CEP inexistente | **HTTP 200** + `{"erro": "true"}` (string, não booleano) | HTTP 404 |
| CEP malformado | HTTP 400 + corpo **HTML** | HTTP 400 + JSON |

Repare na linha mais importante: a ViaCEP **mente no status HTTP** para CEP
inexistente. Os dois providers codificam "não existe" de formas incompatíveis.

Duas armadilhas que só apareceram ao chamar as APIs de verdade:

- O `erro` da ViaCEP é a **string** `"true"`, não o booleano `true`. Um
  `if (payload.erro === true)` passaria no code review e falharia em produção.
- O 400 da ViaCEP vem com corpo **HTML**. Ler `.json()` antes de checar o status
  estoura o parser, e o erro que sobe é de parsing — não o 400 real, que é o
  diagnóstico útil.

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
qualquer coisa vazar. `ViaCepProvider` converte `200 + {"erro": "true"}` em
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

**Herança de uma `BaseCepProvider` abstrata.** Rejeitada — mas não pelo motivo que
esta ADR alegava originalmente. A versão anterior dizia que "os dois providers não
compartilham nada além da assinatura", e isso é **falso**: eles compartilham o `fetch`,
o `AbortSignal.timeout` e a tradução de `TimeoutError`/`TypeError` para
`ProviderTimeoutError`/`ProviderUnavailableError`.

O que **não** se compartilha é a classificação de status, e é justamente onde uma base
class enganaria: na ViaCEP um 4xx significa que *nós* montamos a URL errado (o DTO já
validou o formato), enquanto na BrasilAPI o **404 é resposta legítima** e vira
`CepNotFoundError`. Herdar essa parte produziria o bug mais caro possível — "não
existe" tratado como falha de provider, disparando fallback e punindo no breaker quem
respondeu certo.

A rejeição continua de pé porque o compartilhamento real é **comportamento sem
estado**: uma função (`fetch` + timeout + tradução de erro de rede) serve melhor que
herança, não arrasta `this` nem ciclo de vida do Nest, e se testa sozinha. A extração
acontece quando o segundo provider existir — extrair antes seria desenhar a abstração
com um chamador só, adivinhando o que o segundo vai precisar.

## Consequências

**Boas:**
- Terceira API = uma classe nova + o nome dela no `inject`. Serviço, breaker,
  controller, DTO e filtro: zero alteração. O breaker novo nasce sozinho porque a
  chave é o `name`.
- O serviço não conhece status HTTP. Testável sem mock de rede.
- Cada tradução ganha teste unitário isolado — e o `200 + {"erro": "true"}` da ViaCEP
  é exatamente o tipo de coisa que quebra calada.

**Custos:**
- `@Inject` + `Symbol` é mais cerimônia que injetar a classe direto.
- A tradução é código que existe só para reconciliar formato de terceiro. É trabalho
  real, e ele é pago uma vez por provider.
