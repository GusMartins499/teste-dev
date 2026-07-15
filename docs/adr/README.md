# Architecture Decision Records

Registro das decisões de arquitetura deste projeto: o **porquê** de cada escolha, as
alternativas descartadas e o preço que cada uma cobra.

## Índice

| # | Decisão | Cobre |
|---|---|---|
| [0001](0001-abstracao-de-providers.md) | Abstração dos providers de CEP | §1 Abstração |
| [0002](0002-circuit-breaker-proprio.md) | Circuit breaker próprio, por provider | §2 Resiliência |
| [0003](0003-last-known-good-sem-redis.md) | Last known good em LRU local, sem Redis e sem TTL | §2 Resiliência |
| [0004](0004-observabilidade-otel-jaeger.md) | Observabilidade com OpenTelemetry + Jaeger | §3 Observabilidade |
| [0005](0005-taxonomia-de-erros-e-let-it-crash.md) | Taxonomia de erros e a fronteira do "let it crash" | §4 Tratamento de erros |

## Como os 4 pontos do desafio são cobertos

**§1 — Abstração.** Interface `CepProvider` com identidade (`name` + `lookup`),
camada anticorrupção dentro de cada provider (contrato *e* erros traduzidos na borda)
e registro por multi-token `Symbol`. *Terceira API = uma classe nova + o nome dela no
`inject`.* Serviço, breaker, controller, DTO e filtro: zero alteração. → [0001](0001-abstracao-de-providers.md)

**§2 — Resiliência.** Timeout de ~3s (não os 30s do enunciado), round-robin entre
providers, fallback automático, e circuit breaker de três estados por provider — com
os dois circuitos abertos a resposta sai em ~1ms em vez de ~6s. Quando tudo falha,
ainda há um degrau: o último resultado bom, servido com `stale: true` em vez de 503.
→ [0002](0002-circuit-breaker-proprio.md), [0003](0003-last-known-good-sem-redis.md)

**§3 — Observabilidade.** OpenTelemetry → Collector → Jaeger no `docker-compose`, com
um span por tentativa de provider. A cadeia de fallback vira desenho, não inferência.
pino em JSON com `trace_id` cruzando log e trace; `trace_id` também no corpo do erro,
para o cliente apontar o request exato. → [0004](0004-observabilidade-otel-jaeger.md)

**§4 — Tratamento de erros.** Uma taxonomia, usada em dois lugares: ela decide "faz
fallback?" **e** "conta como falha no breaker?". 400 para malformado (nem chama a
rede), 404 terminal (não faz fallback, não abre circuito), timeout/5xx fallbackable,
503 só depois do last known good, 500 para bug — que sobe sem ser capturado.
→ [0005](0005-taxonomia-de-erros-e-let-it-crash.md)

## Duas notas honestas

**O estado é por instância e efêmero de propósito.** Circuit breaker e last known good
vivem em memória; um restart zera os dois. É o preço aceito do let-it-crash na
fronteira de bug ([0005](0005-taxonomia-de-erros-e-let-it-crash.md)).

**Onde o Redis voltaria legitimamente.** Num deploy multi-réplica, cada instância tem
seu LRU e a cobertura no apagão cai por N. Aí um Redis compartilhado faz sentido — mas
como **estado compartilhado de degradação**, não como cache de latência. O "não" da
[0003](0003-last-known-good-sem-redis.md) é decisão de escopo, não dogma.

## Formato

[MADR](https://adr.github.io/madr/) simplificado: contexto, decisão, alternativas
consideradas (com o motivo da rejeição) e consequências — boas **e** ruins.
