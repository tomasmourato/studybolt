# StudyBolt

An open-source AI study app in the spirit of [Turbo AI](https://www.turbo.ai/). Drop in lecture recordings, PDFs, YouTube videos, Word documents, images or pasted text (up to 10 per study set, combined into one) and get:

- **Notes** with TL;DR summaries, tables, LaTeX math, Mermaid diagrams, a glossary and key takeaways, streamed in live
- **Lessons**: a step-by-step interactive lesson with explanations, illustrations and checkpoint questions, an optional narrator, and a tutor chat that knows which part you're on
- **Flashcards** with Leitner-style spaced repetition and a memory score
- **Practice quizzes** with explanations and score history
- **Chat** grounded in your notes and the full transcript
- **Podcasts**: a two-host audio episode generated with Gemini text-to-speech
- **Resources**: free online videos, exercise sheets, books, courses and articles that match your notes, with every link checked
- **Live lecture recording** in the browser
- The **transcript / extracted text** of every source

All AI runs on the Google Gemini API, **using each student's own API key**.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ftomasmourato%2Fstudybolt)

## Your key never leaves your browser

StudyBolt is built so the people who host it never see your Gemini API key or your study materials:

- **Bring your own key.** The first time you open the app, it asks for your Gemini API key and shows how to get a free one. The key is kept only in your browser: in session storage (gone when the tab closes) or, if you tick "Remember on this device", in local storage. It is never sent to StudyBolt's server and never written to a database.
- **Straight to Google.** Your browser calls `generativelanguage.googleapis.com` directly with your key. Uploaded files go from your browser to the Gemini Files API the same way.
- **Enforced by the browser.** The app's [Content-Security-Policy](next.config.ts) only allows network requests to the app itself and `https://generativelanguage.googleapis.com`, so the page can't send your key anywhere else.
- **No database, no accounts.** Study sets, uploads, podcasts and lesson media are stored in your browser's IndexedDB on your device.
- **One small server route.** [`/api/resources`](src/app/api/resources/route.ts) receives only the search keywords the Resources tab planned (never the key, notes or files), searches free catalogs and checks that links work, because browsers can't read other sites directly. It stores nothing.

The key-handling code is short if you want to check it: [`src/lib/api-key.ts`](src/lib/api-key.ts) (where the key is kept) and [`src/lib/gemini.ts`](src/lib/gemini.ts) (the only place it's used).

## Getting a Gemini API key

1. Open [Google AI Studio](https://aistudio.google.com/apikey) and sign in with a Google account. It's free and doesn't need a credit card.
2. First time? Accept the terms and AI Studio creates a key for you. Otherwise click **Create API key** and pick a project.
3. Copy the key (it usually starts with `AQ.` or `AIza`) and paste it into StudyBolt.

On the free tier, Google may use what you send to improve its products, and people may review it. Enable billing in AI Studio to turn that off and raise the limits. Google's terms require Gemini API users to be 18 or older.

## Run it locally

Requires Node.js 20.9+.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and paste your key when asked. No `.env` file is needed.

## Deploy to Vercel

1. Fork or import this repository in [Vercel](https://vercel.com/new) (or use the button above).
2. Deploy. No environment variables are required, since every student brings their own key.

Optional environment variables:

| Variable | Purpose |
| --- | --- |
| `YOUTUBE_API_KEY` | Real YouTube search results in the Resources tab. Create a key in the [Google Cloud console](https://console.cloud.google.com/) with **YouTube Data API v3** enabled (free, 10,000 units a day; each resource search uses up to 300). This is the host's key, used only on the server; Gemini keys don't work for it. Without it, the tab still suggests videos Gemini knows (only those that check out) and ready-made YouTube searches. |
| `NEXT_PUBLIC_GEMINI_MODEL` | First model to try for notes, flashcards, quizzes and chat |
| `NEXT_PUBLIC_GEMINI_FAST_MODEL` | First model to try for titles and transcripts |
| `NEXT_PUBLIC_GEMINI_TTS_MODEL` | First model to try for podcasts and narration |
| `NEXT_PUBLIC_GEMINI_IMAGE_MODEL` | First model to try for lesson illustrations |

`NEXT_PUBLIC_` variables are built into the page, so only put model names there, never keys.

## Gemini models and free-tier limits

Each Gemini model has its own quota and capacity, and some free-tier models allow only about 20 requests per day. The app picks models by task and falls back automatically when one is out of quota, overloaded or unavailable to the student's key:

| Task | Default order |
| --- | --- |
| Notes, flashcards, quizzes, chat, podcast scripts | `gemini-3.8-flash` → `gemini-3.7-flash` → `gemini-3.6-flash` → `gemini-3.5-flash` → `gemini-3.5-flash-lite` → `gemini-3.1-flash-lite` → Gemma 4 |
| Titles and transcripts | `gemini-3.5-flash-lite` → `gemini-3.1-flash-lite` → `gemini-3.5-flash` → `gemini-3.6-flash` → `gemini-3.7-flash` → `gemini-3.8-flash` → Gemma 4 |
| Podcast voices and lesson narration | `gemini-3.1-flash-tts-preview` → `gemini-3.8-flash-tts` → `gemini-3.8-flash-lite-tts` → `gemini-2.5-flash-preview-tts` |
| Lesson illustrations | `gemini-3.1-flash-image` → `gemini-3.1-flash-lite-image` → `gemini-2.5-flash-image` |

A model that hits a daily quota is skipped for an hour; daily quotas reset at midnight Pacific time. Image models have no free-tier quota, so without billing, lesson illustrations are drawn as simple SVG graphics by a text model instead.

**When Gemini is overloaded.** Google serves free-tier requests from capacity it can cut when demand spikes, so every Gemini model can answer "503 high demand" for minutes at a time. The last resort is Gemma 4 (`gemma-4-26b-a4b-it`, then `gemma-4-31b-it`), open models that run on the same key with their own capacity. Gemma only reads text and its free tier accepts about 16,000 input tokens a minute, so it covers chat, flashcards, quizzes, lessons and notes from shorter text materials; larger materials, files, audio, video and YouTube still need Gemini. Notes, lessons and podcasts also wait and try again for up to two minutes, showing a countdown.

## How it works

- **Next.js 16 (App Router).** The landing page is public; `/library` and `/sets/[id]` sit behind a key gate ([`src/components/KeyGate.tsx`](src/components/KeyGate.tsx)) that shows the key tutorial until a key is entered and checked with Google.
- **Everything runs in the browser.** [`src/lib/actions.ts`](src/lib/actions.ts) holds every operation (create a set, flashcards, quizzes, lessons, chat, podcasts, resources) and calls Gemini with the `@google/genai` SDK from the page.
- **Storage** is IndexedDB ([`src/lib/db.ts`](src/lib/db.ts), [`src/lib/store.ts`](src/lib/store.ts)): one store for study sets, one for files (uploads, podcast WAVs, lesson images and narration). Components subscribe to the store, so progress shows up live without polling.
- **Background work** (notes, podcasts, lessons, resource searches) runs in the tab that started it and keeps going while you move around the app. Closing the tab stops it; the browser asks first. Web Locks let other open tabs see that a job is still alive, so a second tab doesn't mark it as interrupted.
- **Uploads** go from the browser to the Gemini Files API with the resumable protocol, in chunks, with progress. Google keeps them for 48 hours; StudyBolt re-uploads from IndexedDB when needed.
- **Resources** never trust links the model remembers, since most of them don't exist. Gemini reads the notes and plans searches in the browser; the server route queries real catalogs (Wikibooks, Wikipedia, LibreTexts, Internet Archive open-license items, and YouTube when `YOUTUBE_API_KEY` is set), checks YouTube videos with oEmbed and other pages by fetching them (refusing private and local addresses), and Gemini then picks the relevant results by their real titles.
- **Word documents** are converted to text in the browser with `mammoth`, because Gemini doesn't read `.docx` directly. YouTube links are passed straight to Gemini.

| Path | Purpose |
| --- | --- |
| `src/lib/api-key.ts` | Where the student's key is kept (browser only) |
| `src/lib/gemini.ts` | Gemini client, model fallback, streaming, uploads, TTS, key check |
| `src/lib/actions.ts` | Everything the study-set screens can do |
| `src/lib/prompts.ts` | Prompts and JSON schemas for every feature |
| `src/lib/jobs.ts` | Background note and podcast generation |
| `src/lib/lesson.ts` | Lesson generation, illustrations and narration |
| `src/lib/resources.ts` | Resource search (browser side) |
| `src/lib/resource-search.ts` | Catalog search and link checking (server side) |
| `src/lib/store.ts`, `src/lib/db.ts` | IndexedDB storage |
| `src/components/set/` | Study set tabs: notes, lesson, flashcards, quiz, chat, podcast, resources, source |

## Limitations

- Study sets live in one browser on one device. Clearing the site's data deletes them, and they don't sync.
- Keep the tab open while notes or a podcast are being made.

## Scripts

- `npm run dev` starts the development server
- `npm run build` then `npm start` runs a production build
- `npm run lint` runs ESLint

## License

[MIT](LICENSE)
