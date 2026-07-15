# ADR 0003 — Last known good em LRU local, sem Redis e sem TTL

- **Status:** Aceita
- **Data:** 2026-07-15
- **Cobre:** README §2 (Resiliência)

## Contexto

*"E quando as duas estão fora?"* — a resposta mínima é 503. Dá para fazer melhor.

Endereço de CEP é um dado praticamente imutável: muda em anos, quando os Correios
reorganizam algo. Um endereço visto ontem é quase certamente correto hoje. Devolver
esse dado, **avisando que ele é velho**, é melhor que devolver nada.

## Decisão

**Guardar o último resultado bom de cada CEP em memória**, e ler **apenas quando
todos os providers falharem**. Nesse caso a resposta é 200 com aviso explícito:

```json
{ "cep": "01310100", "logradouro": "Avenida Paulista", "...": "...",
  "meta": { "stale": true, "cachedAt": "2026-07-14T08:40:12Z" } }
```

Isto **não é cache** — não está no caminho feliz e não existe para reduzir latência
nem carga. É **estratégia de degradação**. A distinção não é semântica: ela decide
tudo abaixo.

**Sem Redis.** Ver alternativas.

**Sem TTL.** O store só é lido quando tudo já falhou, então a métrica dele não é hit
rate — é **cobertura no momento do apagão** ("o CEP que me pediram agora, durante a
queda, é um que eu por acaso já vi antes dela?"). TTL só pode piorar isso: cada
entrada expirada é um 503 a mais numa hora em que estaríamos degradados mas vivos. O
TTL trabalharia contra a única função da estrutura.

Num cache normal o TTL protege correção — lá o dado velho se disfarça de fresco, e
você precisa de um limite para a própria mentira. Aqui não há disfarce: `stale: true`
denuncia. A justificativa evapora junto com ele. Um TTL de 24h significaria
literalmente *"prefiro dar 503 a devolver a Avenida Paulista de ontem"*.

TTL deve refletir a **volatilidade do dado**. Se fosse cotação de ação, o argumento
se inverteria com a mesma força: preço de ontem é ativamente perigoso, e TTL curto
salvaria. É a natureza do dado que decide, não o hábito.

**O timestamp fica — mas para divulgação, não para expiração.** Guardamos
`{ address, at }`; o `at` vai na resposta e deixa o **cliente** decidir se um dado de
três dias serve para o caso dele. É justamente por manter o timestamp que não
precisamos de TTL: em vez de chutar um limiar em nome dos outros, entregamos a
informação e passamos a decisão adiante.

**Limite por tamanho, não por tempo: LRU com teto de entradas** (10k, configurável).
O risco real nunca foi idade — é memória. O Brasil tem da ordem de 1 milhão de CEPs
distintos; a ~200–400 bytes por entrada (chave de 8 dígitos + objeto com ~7 strings +
overhead de objeto em JS), o pior caso absoluto — alguém varrendo o país inteiro
contra a API — é ~300MB de `Map`. Num teste com uma dúzia de CEPs isso é irrelevante;
como afirmação de engenharia, não é.

LRU (*Least Recently Used*: ao encher, descarta a entrada há mais tempo sem ser
tocada) encaixa porque, num apagão, os CEPs prováveis são os que já vinham sendo
pedidos. FIFO seria pior: despejaria um CEP quente só por ter entrado primeiro.

O `Map` do JS preserva ordem de inserção, então LRU sai em ~15 linhas — no `get`,
`delete` + `set` reinsere no fim; no `set`, se passou do teto, remove a primeira
chave. Despejo O(1).

**Escrita só em sucesso real de provider.** Servir um dado stale **não** reescreve a
entrada — senão o dado se auto-rejuvenesce, o `cachedAt` vira mentira, e perdemos
exatamente a propriedade pela qual pagamos o desenho inteiro.

## Alternativas consideradas

**Redis com TTL de 5 minutos.** Rejeitada, por dois motivos independentes:

1. **O TTL não bate com o dado.** 5 minutos é reflexo de dado volátil; endereço de
   CEP não é. Entregaria quase nenhum hit e sinalizaria um número padrão copiado sem
   pensar.
2. **Redis é uma terceira dependência externa que também cai** — num teste cujo tema
   é não ter ponto único de falha. A pergunta seguinte seria óbvia: *e quando o Redis
   estiver fora?*. Ou tratamos (mais código, mais fallback, num lugar que ninguém
   pediu) ou não tratamos, e aí introduzimos um SPOF no exercício sobre evitar SPOF.
   Some-se a isso que o README põe banco fora de escopo, e Redis é banco o bastante
   para contar.

**Cache no caminho feliz.** Rejeitada: otimiza latência, que não está sendo avaliado.
Over-engineering conta contra.

**`Map` sem teto.** Rejeitada. Existe um limite natural de graça — com let-it-crash +
`restart: unless-stopped` o processo reinicia e o `Map` esvazia sozinho — mas "minha
gestão de memória é o crash" não é uma frase defensável, e um revisor repara num
`Map` sem teto de qualquer forma. Limitar custa 15 linhas.

## Consequências

**Boas:**
- Sob apagão total, muitos requests respondem **200 degradado** em vez de 503.
- Zero infraestrutura nova, zero dependência nova, zero novo modo de falha.
- O cliente recebe informação suficiente (`stale`, `cachedAt`) para decidir sozinho.

**Custos:**
- Cobertura é oportunista: só ajuda em CEP já visto **por aquela instância**.
- Estado por instância e efêmero — restart zera.
- Num deploy multi-réplica a cobertura cai por N: a réplica que recebeu o request
  pode não ser a que viu aquele CEP.

## Onde o Redis voltaria legitimamente

No multi-réplica, exatamente pelo último custo acima. Mas repare que ele entraria
como **estado compartilhado de degradação**, não como cache de latência — um papel
diferente do que foi rejeitado aqui. O "não" desta ADR é decisão de escopo, não dogma.
