# Roteiro de Abordagem e Vendas — Leads de Barbearias

Roteiro para uso manual ao abordar os leads gerados pelo Prospector Agent
(`data/fila_barbearia_*.json`), clicando no `wa_link` de cada lead. Cobre três
ofertas possíveis — **site**, **agendamento online** e **bot de WhatsApp** — já
que a barbearia certa para cada uma varia (ver "Como escolher a oferta"
abaixo).

## Como escolher a oferta por lead

| Sinal no lead | Oferta mais provável |
|---|---|
| Sem `site` cadastrado no OSM | Site/página online |
| Tem site mas parece estático/desatualizado | Agendamento online |
| Telefone cadastrado, provável alto volume de mensagens (bairro central, nome comercial forte) | Bot de WhatsApp |
| Score baixo / poucos dados (ex: só nome, sem endereço/telefone) | Abertura genérica — descobrir a dor antes de oferecer algo específico |

Na dúvida, use a **Abertura genérica** (abaixo) e deixe a barbearia indicar a
dor antes de puxar para uma oferta específica.

---

## 1. Abertura genérica (primeiro contato)

Use antes de saber qual das três ofertas faz mais sentido — o objetivo aqui é
só abrir conversa e diagnosticar a dor.

> Oi! Tudo bem? Vi a [Nome da Barbearia] aqui em [Cidade] e queria entender
> uma coisa rápida: hoje, como vocês lidam com marcação de horário e
> divulgação — é tudo pelo WhatsApp mesmo, ou já usam alguma ferramenta?

**Se a resposta indicar...**
- "É tudo no boca a boca / não uso nada" → puxar para **Site**
- "É só WhatsApp, mas dá trabalho responder todo mundo" → puxar para **Bot de WhatsApp**
- "Cliente liga ou manda mensagem pra marcar" → puxar para **Agendamento online**

---

## 2. Oferta: Site / página online

**Dor que resolve:** barbearia não aparece no Google, não tem como o cliente
ver fotos/preços/endereço antes de decidir, perde cliente pra concorrente que
"parece mais profissional" online.

**Mensagem de abertura (lead sem site):**
> Oi! Vi a [Nome] aqui em [Cidade] e reparei que vocês ainda não têm uma
> página própria no Google. Hoje boa parte de quem procura barbearia decide
> só olhando fotos e avaliações antes de ir — uma página simples resolve
> isso e ainda facilita achar o endereço e o WhatsApp de vocês. Faz sentido
> eu te mostrar um exemplo rápido?

**Argumentos de venda:**
- Cliente novo pesquisa no Google antes de escolher — sem página, a
  barbearia "não existe" pra quem não conhece de boca a boca.
- Página com fotos + preços + botão de WhatsApp reduz a barreira de decisão.
- Investimento único (ou manutenção baixa), sem depender de mensalidade de
  rede social pra ter alcance.

**Perguntas de qualificação:**
- Vocês já têm perfil no Instagram ou só WhatsApp/boca a boca?
- Quantos clientes novos por mês, hoje, vêm de indicação vs. de quem "achou
  vocês" sozinho?

**Fechamento:**
> Consigo te mostrar um modelo pronto em 2 minutos por aqui mesmo. Se fizer
> sentido pra você, a gente conversa sobre valor e prazo. Combinado?

---

## 3. Oferta: Sistema de agendamento online

**Dor que resolve:** tempo perdido respondendo "qual horário tem vago?" no
WhatsApp, cliente que desiste de marcar porque demora resposta, falta de
controle de agenda (over/double booking).

**Mensagem de abertura (lead com atendimento manual visível):**
> Oi! Vi a [Nome] aqui em [Cidade]. Uma coisa que vejo em barbearia parecida
> com a de vocês é perder tempo (e às vezes cliente) respondendo "tem
> horário vago?" no WhatsApp o dia inteiro. Um link de agendamento online
> resolve isso — cliente marca sozinho, vocês só confirmam. Quer ver como
> funciona?

**Argumentos de venda:**
- Cliente marca fora do horário comercial (à noite, fim de semana) sem
  precisar de resposta imediata do barbeiro.
- Reduz "no-show" com lembrete automático.
- Menos tempo do barbeiro/atendente gasto respondendo mensagem repetida.

**Perguntas de qualificação:**
- Hoje, quem marca demora pra receber resposta? Já perdeu cliente por isso?
- Quantos barbeiros trabalham aí — a agenda de cada um é separada?

**Fechamento:**
> Posso te mostrar uma tela de exemplo de como ficaria a agenda de vocês
> online. Topa dar uma olhada rapidinho?

---

## 4. Oferta: Bot / automação de WhatsApp

**Dor que resolve:** volume alto de mensagens repetitivas ("vocês abrem que
horas?", "quanto é o corte?", "tem vaga hoje?"), demora pra responder fora do
horário, atendimento inconsistente quando quem responde muda.

**Mensagem de abertura (lead com provável alto volume de mensagens):**
> Oi! Vi a [Nome] aqui em [Cidade]. Pelo movimento que vocês parecem ter,
> imagino que o WhatsApp não para — muita gente perguntando horário, preço,
> se tem vaga. Dá pra automatizar as perguntas mais repetidas e deixar só o
> que precisa de humano pra vocês responderem. Quer ver um exemplo de como
> isso funcionaria pra vocês?

**Argumentos de venda:**
- Resposta instantânea 24/7 pras perguntas mais comuns (horário, preço,
  endereço).
- Libera o barbeiro/atendente de responder a mesma coisa o dia inteiro.
- Cliente não desiste por demora — resposta imediata mantém o interesse.

**Perguntas de qualificação:**
- Quantas mensagens por dia, mais ou menos, vocês recebem no WhatsApp?
- Quem responde hoje — o próprio barbeiro no meio do atendimento?

**Fechamento:**
> Posso te mostrar rapidinho como ficaria o fluxo automático pras perguntas
> mais comuns. Topa ver um exemplo?

---

## 5. Objeções comuns (todas as ofertas)

| Objeção | Resposta |
|---|---|
| "Não tenho orçamento agora" | "Sem problema — te mando os detalhes e você decide com calma. Posso deixar registrado pra falar de novo em [1-2 semanas]?" |
| "Já uso [concorrente/rede social] e funciona" | "Ótimo que já tem algo rodando! Posso te mostrar como isso complementaria o que já usa, sem substituir — vale 2 minutos?" |
| "Manda mais informação por mensagem" | Enviar 1 exemplo visual (print/link) + preço de referência, sem textão. Fechar com pergunta direta: "Faz sentido pra você?" |
| Não responde após 1ª mensagem | Follow-up único após 3-4 dias: "Oi [Nome], só passando pra saber se rolou de ver aquilo que te mandei — sem pressa, é só avisar se não for o momento." Não insistir além disso. |

## 6. Regras gerais de abordagem

- **Baixo volume, personalizado.** Não disparar a mesma mensagem em massa —
  usar o nome da barbearia e o bairro/cidade sempre (ver `mensagem` já
  gerada em `data/fila_*.json` como base, mas ajustar manualmente antes de
  enviar).
- **Um follow-up, não mais que isso**, se não houver resposta — evitar
  característica de spam (ver seção de compliance no `README.md`).
- **Confirmar que o número é WhatsApp** antes de assumir — o `wa_link` vem do
  telefone cadastrado no OSM, que nem sempre é WhatsApp confirmado.
