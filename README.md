This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Render

This is a full-stack Next.js app with API routes, a PostgreSQL database, and
OAuth/webhook integrations — it needs a Node.js server, so **GitHub Pages won't
work**. [Render](https://render.com) is the quickest path to production.

### One-click deploy (recommended)

This repo includes a `render.yaml` Blueprint. After pushing to GitHub:

1. Go to [render.com](https://render.com) → **New** → **Blueprint** → select your repo.
2. Review the proposed resources (1 web service + 1 Postgres database, both free tier).
3. Click **Deploy Blueprint**. Render prompts you for each `sync: false` env var
   (API keys, client secrets — see `.env.example` for the full list).
4. After the first deploy, update `NEXTAUTH_URL` to your Render URL and register
   the production webhook/redirect URIs in your TrueLayer, Salt Edge, and
   Trading 212 consoles.

### Manual deploy

1. **Database:** New → PostgreSQL → name it `memoney-db`, plan `Free`, region `Oregon`.
2. **Web Service:** New → Web Service → connect your repo.
   - **Build:** `npx prisma generate --schema prisma/schema.production.prisma && npx prisma db push --schema prisma/schema.production.prisma && npm run build`
   - **Start:** `npm start`
3. Attach the `memoney-db` database → Render injects `DATABASE_URL`.
4. Add env vars (see `.env.example`).

See `render.yaml` for the full infrastructure definition.
