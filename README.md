# InternHarbor — Find & Apply anywhere

Personal Next.js app for high school students: discover opportunities and apply on **any** platform from one desk.

## Flow

1. Save your **Background** (contact, school, résumé, reusable facts)
2. **Find** programs or paste any application URL
3. InternHarbor reads the page (HTML + AI), drafts answers
4. You review, then:
   - **Google Forms** → optional one-click submit
   - **Everything else** → live-page autofill (console paste / bookmarklet) that fills fields on Greenhouse, Lever, Workday, Typeform, school portals, and custom sites

## Setup

```bash
HACKCLUB_API_KEY=your_key_from_ai.hackclub.com
npm install
npm run dev
```

Deploy on Vercel with that single env var.

## How universal autofill works

Browsers block websites from silently typing into another site. InternHarbor instead:

1. Extracts fields from the target page (and uses Hack Club AI when the page is a heavy SPA)
2. Fills answers from your background
3. Generates a page script that matches labels / names / placeholders and sets values (including React-controlled inputs)
4. You run that script on the live application tab (paste in console, or use the bookmarklet)

File uploads and CAPTCHAs stay manual by design.
