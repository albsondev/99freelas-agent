# 99Freelas AI Agent

Monorepo para um agente de apoio operacional no 99Freelas, com foco em captacao de oportunidades, triagem tecnica, geracao de propostas, auditoria e automacao controlada.

## Status atual

As cinco primeiras entregas agora cobrem a base do monorepo, a persistencia, a API administrativa, o pipeline inicial de filas e o nucleo de regras:

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

## Limites desta fase

O repositorio ainda nao executa integracoes reais com 99Freelas, Redis ou OpenAI.

Tambem deixei a base configurada com `AUTOMATION_MODE="REVIEW_REQUIRED"` por padrao. A ideia aqui e comecar com um pipeline auditavel e seguro antes de habilitar qualquer submissao real. Isso protege sua conta, reputacao e evita automacoes ruins logo no inicio.

No Supabase, configurei `auto_expose_new_tables = false` em `supabase/config.toml`. Essa escolha acompanha a direcao mais recente da plataforma e evita expor tabelas novas sem `GRANT` explicito.

## Arquitetura planejada

```txt
apps/
  api/         Fastify + endpoints internos
  worker/      BullMQ + Playwright + orquestracao
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
```

## Proximos passos

O proximo commit deve entrar na Fase 5:

- integrar LLM provider real e prompt versionado
- gerar propostas estruturadas em JSON com validacao
- salvar propostas no Supabase com compliance aplicado
- preparar a transicao do worker de score para geracao de proposta
