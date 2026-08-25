# Sharks Editorial Calendar

Sistema de planejamento editorial multi-cliente para Sharks Company.

## Stack

- **Frontend:** React 19 + TypeScript + Vite 6 + Tailwind CSS 4
- **Backend:** Supabase (PostgreSQL, Auth, Realtime, Edge Functions)
- **Routing:** React Router 7
- **DnD:** @dnd-kit
- **Forms:** react-hook-form + zod

## Setup local

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variaveis de ambiente
cp .env.example .env.local
# editar .env.local com URL e ANON_KEY do Supabase

# 3. Rodar
npm run dev          # dev server em http://localhost:5173
npm run build        # build de producao em /dist
npm run preview      # preview do build local
```

## Variaveis de ambiente

| Variavel | Descricao | Obrigatoria |
|----------|-----------|-------------|
| `VITE_SUPABASE_URL` | URL do projeto Supabase | Sim |
| `VITE_SUPABASE_ANON_KEY` | Chave publica anon | Sim |

**Importante:** Apenas variaveis com prefixo `VITE_` sao inlinadas no bundle.
Segredos (service role, OAuth secrets) ficam no Supabase, nunca no frontend.

## Estrutura

```
src/
  components/      # UI components (ui/, layout/, actions/, calendar/, ...)
  contexts/        # React contexts (Auth, Workspace)
  hooks/           # Custom hooks (useActions, useAuth, ...)
  lib/             # Services + utils (supabase, actionService, ...)
  pages/           # Pages (auth/, sharks/, client/)
  types/           # TypeScript types
  App.tsx          # Routes
  main.tsx         # Entry point

supabase/
  functions/       # Edge Functions (Deno)
  migrations/      # SQL migrations

public/            # Static assets served as-is
```

## Deploy na Vercel

### Opcao 1: Git + Vercel Dashboard

1. Subir codigo para GitHub/GitLab/Bitbucket
2. Importar projeto em https://vercel.com/new
3. Configurar variaveis de ambiente no dashboard:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy automatico

### Opcao 2: CLI

```bash
npm i -g vercel
vercel login
vercel --prod
```

### Configuracao (ja incluida em `vercel.json`)

- `outputDirectory: dist`
- `framework: vite`
- Rewrites: todas as rotas para `/index.html` (SPA)
- Cache: 1 ano para `/assets/*` (immutable)
- Headers de seguranca: X-Frame-Options, X-Content-Type-Options, Referrer-Policy

## Supabase

Aplicar migrations em ordem:

```bash
# Via CLI (requer token com permissao db)
supabase db push

# Ou via Management API
# (ver scripts em supabase/apply-*.ps1)
```

Edge Functions deploy:

```bash
export SUPABASE_ACCESS_TOKEN=sbp_xxxxx
supabase functions deploy FUNCTION_NAME
```

## Build de producao

O build gera `dist/` com assets estaticos. Sem SSR. Hospedagem ideal:
- Vercel (recomendado)
- Netlify
- Cloudflare Pages
- Qualquer static host com rewrites SPA
