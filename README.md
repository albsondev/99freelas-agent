# 99Freelas AI Agent

Monorepo para um agente de apoio operacional no 99Freelas, com foco em captacao de oportunidades, triagem tecnica, geracao de propostas, auditoria e automacao controlada.

## Status atual

As sete primeiras entregas agora cobrem a base do monorepo, a persistencia, a API administrativa, o pipeline inicial de filas, o nucleo de regras, a geracao real de propostas com LLM e a autenticacao inicial do navegador:

- workspace `pnpm` com monorepo `apps/*` e `packages/*`
- configuracao compartilhada de TypeScript
- estrutura inicial de API, worker, dashboard e pacotes de dominio
- `.env.example`, `docker-compose.yml` e `.gitignore`
- schema inicial do Supabase com migrations, seed e `config.toml`
- repositories base para oportunidades, propostas, settings, profiles e logs
- validacao centralizada de ambiente com `Zod`
- servidor Fastify com tratamento basico de erro
- plugin admin do Supabase para a API
- rotas iniciais de `health`, `opportunities`, `proposals`, `settings` e `jobs`
- importacao manual de URL com deduplicacao e auditoria em `automation_runs`
- produtor BullMQ compartilhado com Redis
- worker com processors mockados para `email.poll`, `opportunity.fetch`, `opportunity.parse`, `opportunity.score`, `proposal.submit` e `notification.send`
- encadeamento real de jobs para mover uma oportunidade de `NEW` ate `QUALIFIED` no modo mockado da Fase 3
- normalizadores puros para moeda, prazo, skills, sanitizacao e sinais de risco
- `OpportunityScoringService`, `PricingService`, `DeadlineService`, `ComplianceValidatorService` e `DecisionEngineService`
- testes unitarios para o nucleo de regras no pacote `core`
- worker usando score real baseado em regras em vez de score fixo
- provider OpenAI para geracao estruturada de proposta com `Responses API`
- prompt versionado `proposal-v1` com saida JSON validada
- novo job `proposal.generate` encadeado apos o score
- persistencia da proposta no Supabase com compliance, estrategia de preco e estrategia de prazo
- endpoint manual `POST /opportunities/:id/generate-proposal` para regenerar proposta sem reimportar a oportunidade
- camada Playwright inicial para autenticacao do 99Freelas
- persistencia de `storageState` em `.auth/99freelas.storage-state.json`
- perfil dedicado da automacao em `.auth/99freelas.automation-profile`
- comando `pnpm auth:99freelas` com reaproveitamento de sessao salva
- comando `pnpm session:check` para validar se a sessao ainda esta utilizavel
- seletores reais do formulario de proposta mapeados a partir de uma aba autenticada no Chrome
- parser testado da pagina de proposta para media de ofertas, prazo medio e conexoes
- comando `pnpm proposal:prefill` para abrir a pagina real da proposta e preencher os campos sem clicar no envio final
- screenshot de auditoria do prefill salvo em `.audit/screenshots`
- comando `pnpm proposal:submit` em modo mockado para validar o estado final da pagina sem clicar no envio real
- comando `pnpm proposal:observe` para a IA escolher a melhor proposta elegivel, abrir o browser visivel e executar o fluxo passo a passo
- captura de screenshots antes e depois do preenchimento final para auditoria local
- guardrails centrais para envio real: score minimo, compliance aprovado, limites por hora/dia, modo `AUTOPILOT`, flag de ambiente e confirmacao explicita de CLI
- runtime alternativo `Python + Playwright` para deixar a automacao rodando em navegador dedicado, separado do Chrome pessoal

## Limites desta fase

O repositorio ainda nao executa o scraper real da oportunidade nem a submissao final do formulario no 99Freelas.

Nesta fase, o submit roda em modo seguro: ele preenche, revalida, coleta warnings, confere se o botao final esta habilitado e registra screenshots, mas nao clica em `Enviar proposta`.

O `Live Observer Mode - Observacao` usa esse mesmo fluxo, mas com navegador visivel, delays entre etapas, selecao automatica da melhor proposta candidata e pausa antes do envio.

Para o teste `Observacao + Envio`, o mesmo comando de submit agora pode rodar com observacao visual habilitada durante todo o fluxo, inclusive com pausa configuravel antes do clique final.

O clique real ficou preparado, mas so pode acontecer quando todas estas condicoes passam juntas:
- `AUTOMATION_MODE="AUTOPILOT"`
- `ENABLE_REAL_99FREELAS_SUBMISSION=true`
- proposta com `compliance_status = APPROVED`
- oportunidade com decisao `AUTO_SUBMIT` e score acima do minimo configurado
- limites horario e diario abaixo do teto
- comando executado com `--live --confirm-live-submit`

Na pratica, a autenticacao automatizada pode ser bloqueada pelo Cloudflare. Quando isso acontecer, agora existem duas trilhas:

- reaproveitar uma sessao manual ja autenticada no Chrome para observacao/live assistido
- migrar a execucao do navegador para `Python + Playwright` em um navegador dedicado, sem disputar sua sessao principal

Para operacao mais segura no dia a dia, a configuracao padrao agora favorece `BROWSER_SESSION_MODE="dedicated-profile"`. Nesse modo, a automacao abre uma janela/perfil proprio do Chrome em vez de disputar a sua navegacao pessoal na janela principal.

Quando o login no 99Freelas depender melhor do seu ambiente real do Chrome, tambem existe o modo `shared-profile`, mas ele deve ser tratado como apoio ao fluxo manual/observado no Chrome real, nao como automacao controlada garantida pelo worker.

Tambem deixei a base configurada com `AUTOMATION_MODE="REVIEW_REQUIRED"` por padrao. A ideia aqui e comecar com um pipeline auditavel e seguro antes de habilitar qualquer submissao real. Isso protege sua conta, reputacao e evita automacoes ruins logo no inicio.

No Supabase, configurei `auto_expose_new_tables = false` em `supabase/config.toml`. Essa escolha acompanha a direcao mais recente da plataforma e evita expor tabelas novas sem `GRANT` explicito.

## Arquitetura planejada

```txt
apps/
  api/         Fastify + endpoints internos
  worker/      BullMQ + Playwright + orquestracao
  browser-runner/ Python + Playwright para automacao isolada
  dashboard/   Next.js + auditoria e controle
packages/
  core/         tipos e regras de negocio
  config/       constantes e parsing de configuracoes
  integrations/ Supabase, browser, email, LLM e notificacoes
supabase/
  migrations/   schema e policies
tests/
  unit/
  integration/
  e2e/
```

## Fases

1. Base do monorepo
2. Schema e migrations do Supabase
3. API administrativa
4. Worker e filas
5. Regras de score, preco, prazo e compliance
6. Geracao de proposta com LLM
7. Autenticacao Playwright
8. Scraper e submissao mockada
9. Dashboard e endurecimento operacional

## Scripts esperados

Depois de instalar as dependencias com `pnpm install`, estes comandos serao a interface principal do projeto:

```bash
pnpm dev
pnpm dev:api
pnpm dev:worker
pnpm dev:dashboard
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm auth:99freelas
pnpm proposal:prefill
pnpm proposal:observe
pnpm proposal:submit
```

## Runtime Python

Para rodar a automacao em outro navegador e deixar o Chrome livre:

```bash
python3 -m pip install -r apps/browser-runner/requirements.txt
python3 -m playwright install firefox
```

Depois configure no `.env.local`:

```bash
BROWSER_AUTOMATION_RUNTIME="python-playwright"
PYTHON_EXECUTABLE="python3"
PYTHON_BROWSER_NAME="firefox"
PYTHON_BROWSER_PROFILE_DIR="./.auth/99freelas.python-profile"
PYTHON_BROWSER_STORAGE_STATE_PATH="./.auth/99freelas.python-storage-state.json"
```

Fluxo sugerido:

- rode `pnpm auth:99freelas` uma vez para autenticar o navegador dedicado da automacao
- use `pnpm session:check` para confirmar a sessao
- depois siga com `pnpm proposal:prefill`, `pnpm proposal:observe` ou `pnpm proposal:submit`

Nesse modo, o worker continua usando Supabase, score, LLM e guardrails do projeto atual. O que muda e apenas o "braço" de browser automation.

## Proximos passos

Com a Fase 8 praticamente fechada, os proximos passos ficam assim:

- validar um envio live controlado com proposta de baixo risco e conta monitorada
- registrar o resultado final no bucket/auditoria do Supabase
- decidir quando habilitar o job automatico de submit fora do modo manual

## Observacao ao vivo

Para ver a IA trabalhando no browser sem enviar a proposta:

```bash
pnpm proposal:observe
```

Flags uteis:

- `--proposal-id <id>` para observar uma proposta especifica
- `--step-delay-ms 2000` para desacelerar cada etapa observada
- `--hold-ms 60000` para manter a pagina aberta por mais tempo antes de fechar

## Janela dedicada

Para evitar interferencia com a sua navegacao normal no runtime original de Node, o recomendado e manter:

```bash
BROWSER_SESSION_MODE="dedicated-profile"
BROWSER_USER_DATA_DIR="./.auth/99freelas.automation-profile"
```

Fluxo sugerido:

- rode `pnpm auth:99freelas` uma vez para logar na janela dedicada da automacao
- deixe essa janela/perfil reservado para o agente
- use seu Chrome pessoal em outras abas ou janelas sem disputar a execucao do fluxo automatizado

## Nova janela do seu Chrome

Quando voce quiser aproveitar seus cookies, extensoes e historico do Chrome real para melhorar a validacao de login:

```bash
BROWSER_SESSION_MODE="shared-profile"
BROWSER_USER_DATA_DIR="/caminho/para/o/user-data-do-seu-chrome"
BROWSER_CHROME_PROFILE_DIRECTORY="Default"
```

No macOS, o caminho mais comum para `BROWSER_USER_DATA_DIR` e:

```bash
~/Library/Application Support/Google/Chrome
```

Observacoes:

- esse modo tenta abrir uma nova janela no mesmo perfil do Chrome que voce ja usa
- ele e melhor para login e validacoes humanas, mas traz mais risco de interferencia se voce mexer justamente nessa janela controlada
- em alguns cenarios o Chrome reaproveita a sessao ja aberta e o Playwright perde o controle dessa nova janela
- por isso, o worker nao trata `shared-profile` como modo confiavel de automacao controlada; ele deve ser visto como apoio operacional ao fluxo manual/live no Chrome real
- para execucao continua e mais isolada, o modo `dedicated-profile` continua sendo o mais seguro

## Observacao com envio

Para ver a IA preenchendo a proposta ao vivo e, ao final, efetuar o clique real de envio:

```bash
pnpm proposal:submit --live --confirm-live-submit --observe
```

Flags uteis:

- `--proposal-id <id>` para escolher uma proposta especifica
- `--step-delay-ms 2000` para desacelerar o preenchimento
- `--hold-ms 15000` para pausar mais tempo antes do clique final
