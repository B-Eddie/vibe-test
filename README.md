# InternHarbor — Find & Apply anywhere

Personal Next.js app for high school students: discover opportunities and apply on **any** platform from one desk, powered by the **Gemini API**.

## Flow

1. Save your **Background** (contact, school, résumé, reusable facts)
2. **Find** programs (curated seed + Gemini Google Search grounding) or paste any application URL
3. Gemini reads/extracts fields and drafts answers from your background
4. You review, then:
   - **Google Forms** → optional one-click submit
   - **Everything else** → live-page autofill (console paste / bookmarklet)

## Setup

1. Create an API key in [Google AI Studio](https://aistudio.google.com/apikey)
2. Add `.env.local`:

```bash
GEMINI_API_KEY=your_key_here
# optional:
# GEMINI_MODEL=gemini-2.0-flash
```

3. Run:

```bash
npm install
npm run dev
```

Deploy on Vercel with `GEMINI_API_KEY` (and optional `GEMINI_MODEL`).

## How universal autofill works

Browsers block websites from silently typing into another site. InternHarbor instead:

1. Extracts fields from the target page (HTML + Gemini when the page is a heavy SPA)
2. Fills answers from your background with Gemini
3. Generates a page script that matches labels / names / placeholders and sets values (including React-controlled inputs)
4. You run that script on the live application tab (paste in console, or use the bookmarklet)

File uploads and CAPTCHAs stay manual by design.
