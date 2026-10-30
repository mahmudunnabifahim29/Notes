# NoteAtlas

A notes website built with TypeScript, React and Vinext, plus a Python audience research project. Notes and research records live in Cloudflare D1; file attachments live in R2.

## Features

- Sign in with ChatGPT; each account owns its notes.
- Create, edit, delete, star, search, categorize, color and sort notes.
- Upload TXT/Markdown as editable text, and attach PDF, TXT, MD, CSV, PNG, JPG or WebP files. Maximum 5 MB per file, ten attachments per note, and 500 notes per account.
- Generate a random read-only sharing URL. Revoking its token disables both the note and shared attachment access. The Site's own access setting still applies; a private Site's links are private too.
- Research is off by default. Adults can opt in to pseudonymous usage research and a separate optional survey. Notes work without research consent.
- Owner dashboard: 30-day usage totals and self-reported age band, gender, country of residence, education/work stage and purpose. Approximate network country is separate and can be unavailable. Demographic cells below five are combined; unknown answers are not guessed.
- Export behavior-only CSV, train the included Python K-means project, then import its JSON model for aggregate scoring. No demographic prediction is implemented. Model training runs on your computer; the hosted website scores using the imported model.

## Initial owner and public launch

Every new Site starts owner-private. Open the Site once as its owner before broadening access. The first authenticated account visiting `/api/session` while it is private initializes `settings.research_owner`; only that account can access analytics, exports and model management. This bootstrap relies on that initial private access boundary. Do not publish a fresh database publicly before initializing the owner. All subsequent notes are scoped to their authenticated owner.

The first workspace is empty. Use **Create a note**, **Upload note**, or **Add example notes**. Anonymous preview shows explicitly labeled sample notes; sample analytics never writes records to the live database. Sharing is read-only, not collaborative editing.

## Development

Requirements: Node >=22.13 and the dependencies in package.json. Sites hosting and ChatGPT identity use the supplied platform integration; no separate OAuth or public development auth shortcut is added.

- `npm run dev`: local Vinext development.
- `npm run build`: build Worker and client assets.
- `node node_modules/typescript/bin/tsc --noEmit`: type check.
- `npm run db:generate`: generate Drizzle migrations after schema changes.
- After building: `node tests/api.integration.mjs` exercises authentication, ownership, uploads, sharing/revocation, consent, withdrawal, retention, model validation, and D1/R2 cleanup using isolated in-memory test stores.

Apply pending migration SQL to the local D1 database before previewing. Local preview and production databases are separate. See the retained starter instructions in the Sites plugin for the supported migration/deployment commands. Never edit applied migration history or create migration-owned tables during requests.

### Code map

| Path | Purpose |
| --- | --- |
| app/workspace.tsx | Notes workspace and owner dashboard navigation |
| app/editor.tsx | Note editor, uploads and deletion |
| app/research-dialog.tsx | Optional research consent, survey and withdrawal |
| app/analytics.tsx | Audience charts and ML workflow |
| app/s/[token] | Read-only shared notes |
| app/api/[...path]/route.ts | Authorized notes, attachment and research endpoints |
| lib/server.ts | Database queries, consent cookie, events and aggregation |
| lib/research-model.ts | Model validation and TypeScript inference |
| db/schema.ts / drizzle | D1 schema and generated migrations |
| ml | Python training workflow and its README |
| public/ml/noteatlas-ml.zip | Downloadable copy of the Python starter |

## Research data and limits

Consent uses a random HttpOnly SameSite cookie, separate from account identity. No research event stores note content, note IDs, emails, raw IPs or full user agents. Request country is a network estimate, not nationality. Device category is a coarse client estimate; language is the browser preference, not a personal identity.

Active time is an estimate sampled in visible tabs, not proof of reading. Counts refer to opted-in browser records, not unique humans or all traffic. Star changes count as note edits. Starter examples are not counted as creates. Sharing enable requests count as shares, not unique people reached. Basic event limits reduce accidental floods but are not bot detection or abuse prevention.

Research records expire after 90 days; cleanup runs on research signup, owner analytics or export requests. It is not an independent scheduled deletion process. Withdrawal deletes the participant and linked events for the current cookie. Previously exported datasets and trained model parameters must be handled separately. Retain exports securely, honor withdrawal in your copies, and retrain or remove affected models when needed. Aggregation and small-cell combination reduce disclosure but do not guarantee anonymity or formal privacy protection.

This first version uses manual saves, plain text note content, read-only links, and local Python training. It does not implement real-time collaborative editing, OCR, malware scanning, automatic model retraining, or a complete public-service abuse control system.

Read `ml/README.md` for feature definitions, training/holdout details, limitations and sources.
# Notes
