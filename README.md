# InternHarbor — HS Internship Finder

Personal Next.js app for finding high school internships, ranking them against your profile, and drafting application materials you review and submit yourself.

## Features

- Local profile (interests, skills, grade, city, résumé text) in `localStorage`
- Ranked internship feed with match reasons
- Filters for remote, field tags, and deadline window
- Draft assist for cover emails + “why me” blurbs (`OPENAI_API_KEY`, with local fallback)
- Application tracker (saved / drafted / applied / rejected)
- Nightly ingest via Vercel Cron into Vercel KV (falls back to curated seed data)

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind CSS v4
- Vercel Cron + Vercel KV (`@vercel/kv`)
- OpenAI for drafts
- Public Remotive API + We Work Remotely RSS for refreshable listings

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Copy `.env.example` to `.env.local` if you want OpenAI drafts and KV caching. Without env vars the app still runs on seed listings and a local draft fallback.

## Deploy on Vercel

1. Push this repo to GitHub and import it in [Vercel](https://vercel.com/new).
2. Add environment variables:
   - `OPENAI_API_KEY` — optional but recommended for stronger drafts
   - `CRON_SECRET` — required to protect `/api/cron/ingest`
   - `KV_REST_API_URL` and `KV_REST_API_TOKEN` — from a Vercel KV / Upstash Redis store
3. Enable the Cron job defined in `vercel.json` (`0 12 * * *` UTC → `/api/cron/ingest`).
4. Deploy.

Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically when `CRON_SECRET` is set.

### Manual ingest

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://YOUR_DOMAIN/api/cron/ingest
```

## Notes

- Nothing auto-submits applications. Apply links open in a new tab.
- Profile and tracker stay in the browser — no user accounts.
- Seed programs live in `data/seed-internships.json`; edit that file to curate more HS-friendly opportunities.
