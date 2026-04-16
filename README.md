# Finders Dashboard

Painel com cadastro de finders, indicacoes e upload de PDF, com persistencia em disco.

## Rodar localmente

```bash
npm start
```

Abra `http://127.0.0.1:3000`.

## Publicar

Este projeto precisa de backend com armazenamento persistente, entao GitHub Pages sozinho nao atende.

Fluxo recomendado:

1. Subir este codigo para um repositorio no GitHub.
2. Conectar o repositorio a um servico como Render.
3. Fazer o deploy usando o arquivo `render.yaml`.
4. Garantir que o disco persistente fique montado em `/opt/render/project/src/data`.

## Persistencia

- Dados: `data/finders.json`
- PDFs: `data/uploads/`
