# InternHarbor — HS Internship Finder

Personal Next.js app for finding high school internships, ranking them against your profile, and drafting application materials you review and submit yourself.

## Features

- Local profile (interests, skills, grade, city, résumé text) in `localStorage`
- Ranked internship feed with match reasons
- On-demand live search via [Hack Club AI](https://ai.hackclub.com/) + Exa (no cron, no database)
- Draft assist for cover emails + “why me” blurbs through Hack Club AI
- Application tracker (saved / drafted / applied / rejected)

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind CSS v4
- Hack Club AI (`https://ai.hackclub.com/proxy/v1`) for chat drafts and Exa web search
- Deployable on Vercel with a single env var

## Setup

1. Create an API key at [ai.hackclub.com](https://ai.hackclub.com/).
2. Copy `.env.example` to `.env.local` and set:

```bash
HACKCLUB_API_KEY=your_key_here
```

3. Run locally:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Without an API key, the app still works on curated seed listings and a local draft fallback.

## Deploy on Vercel

1. Import this repo in [Vercel](https://vercel.com/new).
2. Set **one** environment variable: `HACKCLUB_API_KEY`.
3. Deploy.

No cron jobs, KV, or other services required.

## Notes

- Nothing auto-submits applications. Apply links open in a new tab.
- Profile and tracker stay in the browser — no user accounts.
- Seed programs live in `data/seed-internships.json`.
- Live listings are fetched when you open the feed, using your profile interests in the search query.
