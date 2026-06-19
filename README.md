# 99Freelas Chrome Extension

Extensao do Google Chrome para uso manual no 99Freelas.

Fluxo:

1. Voce encontra um projeto interessante no 99Freelas.
2. Cola a URL do projeto no popup da extensao.
3. A extensao abre o projeto, entra na tela de proposta, consulta o Gemini e preenche:
   - valor
   - prazo
   - detalhes da proposta
4. A extensao **nao envia** a proposta. O envio continua manual.

## Como usar

1. Abra a pasta do projeto no seu computador.
2. No Chrome, acesse `chrome://extensions`.
3. Ative o `Modo do desenvolvedor`.
4. Clique em `Carregar sem compactacao`.
5. Selecione a pasta [extension](/Users/andrealbson/Documents/PROJETOS/99freelas-agent/extension).
6. Abra as opcoes da extensao e informe sua chave do Gemini.
7. Estando logado no 99Freelas no Chrome, clique no icone da extensao.
8. Cole a URL do projeto e clique em `Abrir e preencher`.

## Configuracao local

As configuracoes sao salvas localmente no Chrome:

- chave da API do Gemini
- modelo do Gemini
- nome e headline do freelancer
- resumo profissional
- GitHub/portfolio
- regras minimas de valor e desconto sobre a media

## Observacoes

- A extensao foi feita para funcionar no seu Chrome ja logado no 99Freelas.
- O preenchimento para na etapa final. Nenhum clique de envio e executado.
- Se o projeto ja tiver proposta enviada, a extensao apenas avisa e nao tenta reenviar.
- A chave do Gemini nao vai para o Git. Ela fica no armazenamento local da extensao.

## Comandos uteis

Verificacao estrutural rapida:

```bash
npm run check
```

Gerar um `.zip` da extensao:

```bash
npm run pack
```
