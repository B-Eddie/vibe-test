# InternHarbor — Find & Apply

Personal Next.js app for high school students: discover internships/programs and apply from one desk using your saved background.

## What it does

- **Find** — curated HS programs + live Hack Club AI web search
- **Background** — reusable applicant packet (contact, school, résumé, custom facts)
- **Apply** — paste a Google Form or any application URL; auto-fill from your background; review; submit Google Forms or copy/paste elsewhere
- **Tracker** — saved → drafted → ready → applied → rejected

## Setup

1. Get a free key at [ai.hackclub.com](https://ai.hackclub.com/)
2. Create `.env.local`:

```bash
HACKCLUB_API_KEY=your_key_here
```

3. Run:

```bash
npm install
npm run dev
```

## Deploy on Vercel

Set one env var: `HACKCLUB_API_KEY`. No cron or database required.

## Apply flow notes

- **Google Forms**: InternHarbor reads the public form structure, drafts answers with Hack Club AI, lets you edit, then POSTs to `formResponse` after you confirm.
- **Other sites**: prepares answer packets you can paste, opens the page, and marks the tracker.
- File-upload questions stay manual.
- Forms that require Google sign-in may not be readable.

## Privacy

Profile, answers, and tracker stay in your browser (`localStorage`). Nothing auto-submits until you confirm on the Apply desk.
