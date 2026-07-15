# ADR 0002 — Circuit breaker próprio, por provider

- **Status:** Aceita
- **Data:** 2026-07-15
- **Cobre:** README §2 (Resiliência)

## Contexto

O README pergunta: *"O que acontece quando uma API demora 30 segundos? E quando as
duas estão fora?"*. A primeira pergunta já contém a crítica — a resposta não pode ser
"espero 30 segundos".

Com timeout agressivo mas sem memória, **todo** request paga o timeout de um provider
que já sabemos estar morto. Descobrimos de novo, uma requisição por vez. Com os dois
providers fora, cada request queima ~6s antes de falhar.

## Decisão

**Timeout de ~3s por provider** (configurável por env), não os 30s do enunciado.

**Circuit breaker escrito à mão**, três estados:

- **`closed`** — normal, chamadas passam, conta falhas.
- **`open`** — falhou demais, chamadas nem saem (falha em ~1ms). Após o cooldown,
  vira `half-open`.
- **`half-open`** — deixa **uma** sonda passar. Sucesso → `closed`. Falha → `open` e
  reinicia o cooldown.

**Números:** 3 falhas para abrir, 30s de cooldown. Configuráveis por env.

**Uma instância por provider, nunca global.** O sentido inteiro do desenho é "a
ViaCEP está fora, a BrasilAPI não" — um breaker global derrubaria as duas juntas.

**O breaker é uma classe simples, sem `@Injectable()`.** Ele não tem dependência
nenhuma: é um contador com relógio, e não sabe o que é HTTP, provider, CEP ou Nest.
Decorá-lo acoplaria uma máquina de estados ao framework por nada, e o teste dela
passaria a exigir um módulo do Nest de pé.

Quem vira Nest é o **registro**:

```ts
@Injectable()
export class CircuitBreakerRegistry {
  private readonly breakers = new Map<string, CircuitBreaker>();

  for(providerName: string): CircuitBreaker { /* get-or-create */ }
}
```

**Singleton é obrigatório, não preferência.** Se o registro nascer por request, o
contador zera a cada chamada, `failures` nunca chega a 3, o circuito nunca abre — e
sobram 30 linhas de código decorativo que não fazem nada. É o pior tipo de bug: o
silencioso. O escopo padrão do Nest já é singleton; a regra é *não estragar* (nada de
`Scope.REQUEST` no caminho).

**Só erro *fallbackable* conta como falha.** Um 404 **não pode** abrir o circuito: se
cem pessoas consultam cem CEPs inexistentes, a ViaCEP respondeu perfeitamente cem
vezes — ela está saudável. Abrir o breaker aí seria tirar do ar um provider que
funciona. A taxonomia de [ADR 0005](0005-taxonomia-de-erros-e-let-it-crash.md) é uma
regra só, usada em dois lugares: decide "faz fallback?" **e** "conta como falha?".

**`now: () => number` injetado no construtor.** Sem isso, testar o cooldown exigiria
`sleep(30s)` na suíte. Com isso, o teste é três linhas.

## Alternativas consideradas

**`opossum` (ou qualquer lib pronta).** Rejeitada. O README diz explicitamente que
quer ver como lidamos com resiliência — uma dependência pronta esconde exatamente o
que está sendo avaliado. O breaker inteiro tem ~30 linhas e zero dependência; o custo
de escrever é menor que o de justificar por que não escrevi.

**Só retry com backoff, sem breaker.** Rejeitada: retry ataca falha transitória, não
provider fora do ar. Sob apagão, retry *piora* — mais carga em cima de quem já caiu, e
mais latência para o cliente.

**Breaker global, um para todos os providers.** Rejeitada: apaga a distinção que é o
ponto do exercício.

## Consequências

**Boas:**
- Com os dois circuitos `open`, a resposta sai em ~1ms em vez de ~6s. É a resposta
  direta a *"e quando as duas estão fora?"*.
- Provider fora do ar para de receber carga nossa — cortesia com quem já está mal.
- A máquina de estados é testável sem rede, sem Nest e sem relógio real.

**Custos:**
- Estado em memória, por instância. Num deploy multi-réplica cada uma aprende
  sozinha, e o restart zera tudo ([ADR 0005](0005-taxonomia-de-erros-e-let-it-crash.md)).
  Aceito e documentado.
- `half-open` sacrifica uma requisição real como sonda a cada cooldown.
- Escolher threshold e cooldown é chute calibrado, não ciência. Por isso vão em env.
