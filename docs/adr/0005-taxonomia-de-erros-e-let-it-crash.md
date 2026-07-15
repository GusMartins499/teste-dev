# ADR 0005 — Taxonomia de erros e a fronteira do "let it crash"

- **Status:** Aceita
- **Data:** 2026-07-15
- **Cobre:** README §4 (Tratamento de erros), §2 (Resiliência)

## Contexto

O README é direto: *"Erros diferentes devem ter tratamentos diferentes. Timeout não é
a mesma coisa que 404."*

É um aviso disfarçado de dica. A implementação ingênua faz
`try { provider1 } catch { provider2 }` — qualquer erro cai no fallback. Mas **404 é
uma resposta autoritativa, não uma falha**: significa "esse CEP não existe". Cair para
o fallback nesse caso erra duas vezes — gasta uma chamada de rede para receber o mesmo
404, e apaga a diferença entre *"não achei"* e *"não consegui perguntar"*.

## Decisão

### A taxonomia é uma regra só, usada em dois lugares

Ela decide **"faz fallback?"** e **"conta como falha no breaker?"** — sempre junto:

| Classe | Exemplo | Fallback? | Conta no breaker? | HTTP |
|---|---|---|---|---|
| **Malformado** | CEP com 7 dígitos | — (nem chama) | Não | **400** |
| **Terminal** | `CepNotFoundError` | **Não** | **Não** | **404** |
| **Fallbackable** | timeout, 5xx, DNS, reset | **Sim** | **Sim** | (próximo provider) |
| **Todos falharam** | `AllProvidersDownError` | — | — | **503** |
| **Bug** | `undefined is not a function` | Não | Não | **500** |

**Malformado morre no DTO**, com 400, sem gastar rede nem poluir a estatística do
breaker.

**Terminal não faz fallback** (o segundo provider diria o mesmo) e **não abre o
circuito**: cem 404s significam um provider saudável respondendo cem vezes
corretamente. Abrir o breaker aí seria tirar do ar quem está funcionando.

**503 só depois do last known good falhar** ([ADR 0003](0003-last-known-good-sem-redis.md)).

A classificação acontece **dentro de cada provider**
([ADR 0001](0001-abstracao-de-providers.md)) — é lá que o `200 + {"erro": "true"}` da
ViaCEP e o `404` da BrasilAPI viram o mesmo `CepNotFoundError`. Por isso o `catch` do
serviço não conhece status HTTP.

### `ExceptionFilter` global, não middleware

```ts
@Catch()
export class AllExceptionsFilter implements ExceptionFilter { /* ... */ }
```

Middleware no Nest roda **antes** do handler e não captura de forma confiável exceção
nascida dentro dele. O filtro é o único lugar do código que conhece status HTTP, e é
onde o `trace_id` entra no corpo do erro
([ADR 0004](0004-observabilidade-otel-jaeger.md)).

### A fronteira do "let it crash": bug vs. falha esperada

Queremos o espírito — **nenhum `try/catch` defensivo espalhado, um único ponto de
tradução, zero bug escondido** — mas a fronteira precisa ser explícita, porque
let-it-crash literal e o circuit breaker estão em rota de colisão.

Let it crash é filosofia de Erlang, e se sustenta em duas coisas que o Node **não
tem**: processo isolado por tarefa e árvore de supervisão. Em Node há *um* processo
compartilhado — crashar de verdade mata todos os requests em voo e leva junto o estado
do breaker e do last known good.

Aplicar isso a timeout de provider **faria perder o teste**: o enunciado inteiro é *"a
API externa caiu e o seu serviço continua funcionando"*.

A fronteira, então:

- **Timeout da ViaCEP não é crash — é o produto.** Tratar isso não é código
  defensivo; é a funcionalidade pedida. Fica no orquestrador.
- **`CepNotFoundError` sobe limpo** até o filtro e vira 404. Sem `try/catch` no meio
  do caminho.
- **`AllProvidersDownError` sobe** e vira 503.
- **Bug sobe, não é capturado**, vira 500 e vaza inteiro para o Jaeger.

O `try/catch` do loop de providers **não é defesa — é regra de negócio**: existe para
decidir fallback, e relança o que não entende.

### Let it crash literal, onde ele cabe

`unhandledRejection` / `uncaughtException` → loga, **mata o processo**, e
`restart: unless-stopped` sobe de novo. Estado corrompido não se remenda.

## Alternativas consideradas

**Fallback em qualquer erro.** Rejeitada: é o alvo explícito da dica do README.

**Fallback em 404 "por garantia".** Considerada — é defensável argumentar que um
provider pode ter base desatualizada e o outro conhecer o CEP. Rejeitada porque o
custo é pago em *todo* 404 (uma chamada de rede extra, sempre) para cobrir um caso
raro, e porque destrói a distinção entre "não existe" e "não consegui perguntar", que
é justamente o que o README pede para preservar.

**Middleware de erro (estilo Express).** Rejeitada: o Nest tem a ferramenta certa, e
middleware não pega exceção do handler de forma confiável.

**Let it crash literal em falha de provider.** Rejeitada: contradiz o enunciado.

## Consequências

**Boas:**
- 404 responde rápido e barato, e não penaliza a saúde de um provider que funciona.
- Um único lugar traduz erro em HTTP.
- Bug não tem onde se esconder: sobe, vira 500, aparece no trace.
- O cliente recebe `trace_id` no erro e consegue apontar o request exato.

**Custos:**
- Se um provider tiver base desatualizada, um 404 dele encerra a consulta — a decisão
  acima assume que "não existe" é confiável nas duas APIs.
- Crash de processo derruba requests em voo e zera breaker + last known good. Aceito:
  **o estado é por instância e efêmero de propósito**, e um restart é preferível a
  operar com estado corrompido.
