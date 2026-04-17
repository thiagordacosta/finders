# Finders Dashboard

Painel com cadastro de finders e indicacoes, com persistencia em Supabase.

## Deploy gratuito recomendado

1. Crie um projeto no Supabase.
2. Rode o SQL de [supabase-schema.sql](./supabase-schema.sql) no SQL Editor do Supabase.
3. Copie o conteúdo de [supabase-config.example.js](./supabase-config.example.js) para [supabase-config.js](./supabase-config.js), ou edite diretamente o arquivo `supabase-config.js`.
4. Preencha `SUPABASE_URL` e `SUPABASE_ANON_KEY`.
5. Publique o site no Vercel, Netlify ou GitHub Pages.

## Rodar localmente sem backend

Abra `index.html` com um servidor estatico simples ou publique diretamente no Vercel/Netlify.

Exemplo com Python:

```bash
python3 -m http.server 3000
```

Abra `http://127.0.0.1:3000`.

## Observacoes

- O projeto agora foi preparado para persistir apenas os dados de finders e leads no Supabase.
- O `anon key` do Supabase pode ficar no front-end, desde que o RLS esteja habilitado.
- As policies do SQL estao abertas para facilitar seu uso imediato. Se quiser, eu posso endurecer a seguranca depois.
