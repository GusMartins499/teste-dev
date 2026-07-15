# ADR 0004 — Observabilidade com OpenTelemetry + Jaeger

- **Status:** Aceita
- **Data:** 2026-07-15
- **Cobre:** README §3 (Observabilidade)

## Contexto

O README pergunta: *"Se der erro em produção, como a gente descobre o que
aconteceu?"*.

A pergunta é específica do nosso problema. Um erro aqui raramente é um evento único —
é uma **sequência**: tentei a ViaCEP, ela pendurou 3s, o circuito abriu, caí para a
BrasilAPI, ela respondeu 200 em 140ms. Nenhuma linha de log isolada conta essa
história; ela vive na relação entre as tentativas.

## Decisão

**OpenTelemetry SDK → OTel Collector → Jaeger**, tudo no `docker-compose`, subindo
com o projeto. Sem SaaS, sem conta em lugar nenhum — o avaliador dá `docker compose
up` e vê.

**Trace acima de log, para este problema.** Log estruturado conta *o que* aconteceu;
o trace **desenha**:

```
GET /cep/01310100                                    3.14s
├── viacep.lookup          [timeout]                 3.00s
└── brasilapi.lookup       [ok]                      0.14s
```

O avaliador bate o olho e entende a cadeia de fallback inteira sem ler uma linha de
código. Um print disso é provavelmente o ativo mais persuasivo do projeto.

**Atributos por span de provider:**

| Atributo | Exemplo |
|---|---|
| `provider.name` | `viacep` |
| `provider.outcome` | `ok` / `timeout` / `http_5xx` / `not_found` / `circuit_open` |
| `circuit.state` | `closed` / `open` / `half-open` |
| `cep` | `01310100` |

Com isso o Jaeger responde sozinho perguntas como *"por que o P99 subiu ontem às
3h"*. O `provider.name` é o mesmo `name` da interface
([ADR 0001](0001-abstracao-de-providers.md)) — uma identidade, três usos.

**pino para log estruturado em JSON, com `trace_id` embutido.** Log e trace se
cruzam: do trace no Jaeger você chega na linha de log, e vice-versa. Não usamos o
`Logger` do Nest — ele é conveniente para desenvolvimento, mas o alvo aqui é
correlação, e isso exige o `trace_id` em todo evento.

**Array `attempts` acumulado no serviço**, emitido em um evento quando a cadeia
inteira falha: quem foi tentado, em que ordem, quanto cada um demorou, e por que cada
um falhou.

**`trace_id` no corpo do erro devolvido ao cliente**
([ADR 0005](0005-taxonomia-de-erros-e-let-it-crash.md)) — para ele te dar o ID quando
reclamar, em vez de "deu erro lá pelas 3 da tarde".

## Alternativas consideradas

**`Logger` do Nest.** Rejeitada: sem correlação e sem estrutura. Responde "deu erro",
não "o que aconteceu".

**Só logs (pino → Loki → Grafana).** Considerada seriamente e rejeitada — é uma stack
boa, mas para *este* problema você perde o melhor ativo do projeto. A relação temporal
entre tentativas é o dado, e o trace mostra ela nativamente. Reconstruir isso a partir
de linhas de log correlacionadas é trabalho manual em cima de algo que o Jaeger dá
pronto.

**Elastic / Datadog / SigNoz.** Rejeitadas: peso de infra ou conta externa,
desproporcional ao escopo.

**Prometheus + métricas.** Rejeitada por escopo. Métrica responde *quantos*; a
pergunta do README é *o que aconteceu naquele request*, que é trace. Num sistema real
os dois conviveriam, e o OTel já deixa a porta aberta.

## Consequências

**Boas:**
- A cadeia de fallback é visível, não inferida.
- OTel é padrão vendor-neutro: trocar Jaeger por Tempo, Datadog ou qualquer outro é
  mexer no Collector, não na aplicação.
- Bug em produção é diagnosticável a partir de um `trace_id` que o cliente informa.

**Custos:**
- Dois containers a mais no `docker-compose` (Collector + Jaeger).
- Instrumentação é código que não entrega feature. É o preço de responder à
  pergunta 3.
- `cep` como atributo de span é dado de consulta do usuário. Neste domínio é inócuo
  (CEP não identifica pessoa), mas num sistema com PII de verdade essa linha exigiria
  uma discussão que aqui não precisamos ter.
