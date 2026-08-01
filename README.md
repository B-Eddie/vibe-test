# InternHarbor — Find & Apply anywhere

Personal Next.js app for high school students: discover opportunities and apply on **any** platform from one desk.

All AI calls try **Hack Club AI** first (`HC_API_KEY`) — including Find live search via Exa — then fall back to **Gemini** (`GEMINI_API_KEY` / google_search).

## Flow

1. Save your **Background** (contact, school, résumé, reusable facts)
2. **Find** programs (curated seed + live AI search) or paste any application URL
3. AI reads/extracts fields and drafts answers from your background
4. You review, then:
   - **Google Forms** → optional one-click submit
   - **Everything else** → live-page autofill (console paste / bookmarklet)

## Setup

1. Create a Hack Club AI key at [ai.hackclub.com](https://ai.hackclub.com/) (preferred)
2. Optionally create a Gemini key at [Google AI Studio](https://aistudio.google.com/apikey) as fallback
3. Add `.env.local`:

```bash
HC_API_KEY=your_hack_club_key
# optional model override (default: inclusionai/ling-3.0-flash:free):
# HC_MODEL=inclusionai/ling-3.0-flash:free

# optional Gemini fallback (also used if HC Exa fails):
# GEMINI_API_KEY=your_gemini_key
# GEMINI_MODEL=gemini-3.5-flash
```

4. Run:

```bash
npm install
npm run dev
```

Deploy on Vercel with `HC_API_KEY` (and optional `GEMINI_API_KEY` fallback).

## How universal autofill works

Browsers block websites from silently typing into another site. InternHarbor instead:

1. Extracts fields from the target page (HTML + AI when the page is a heavy SPA)
2. Fills answers from your background with AI
3. Generates a page script that matches labels / names / placeholders and sets values (including React-controlled inputs)
4. You run that script on the live application tab (paste in console, or use the bookmarklet)

File uploads and CAPTCHAs stay manual by design.
