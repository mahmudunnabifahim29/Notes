# NoteAtlas project handoff

## User and purpose

The owner is a CSE student using a MacBook M1, VS Code, and Firefox. The project is a simple notes website plus an ML research project. Explanations in easy Bangla are useful when requested; explain concepts before showing code.

## Existing behavior

- Create, edit, delete, categorize, color, search, sort, and star private notes.
- Import TXT/Markdown into editable notes; attach PDF, TXT, MD, CSV, PNG, JPG or WebP. Up to 5 MB per attachment, ten per note, and 500 notes per account.
- Read-only share tokens expose a note and its attachments to people who can access the Site. Revocation disables both. Sharing does not mean collaborative editing.
- Research is OFF until a visitor explicitly opts in. The initial research scope is adults 18+. The optional survey asks age band, gender, country of residence, education/work stage and purpose. Questions can be skipped.
- Research uses a random first-party browser ID, separate from account identity. Event records contain counts/kinds and estimated visible-tab time, not note content, note IDs, names, emails, full user agents or raw IPs.
- Demographics are self-reported. Approximate network country is a separate estimate and can be unknown. Do not infer age/gender to fill survey gaps.
- Owner-only 30-day dashboard, behavior-only CSV export, and JSON model import. Groups smaller than five are combined. Withdrawal deletes the current browser's linked research rows and events; exports or trained models need separate handling.
- Records expire after 90 days; cleanup is request-triggered, not scheduled.
- Python/scikit-learn K-means training groups behavior, uses a train/holdout split, and exports scaler/centroids for matching TypeScript inference. Synthetic practice data must remain labeled synthetic. Training does not run automatically on the web host.

## Architecture

TypeScript, React and Vinext; Cloudflare Workers runtime; D1 database; R2 attachments. Hosted sign-in is provided by Sites. Portable loopback development has a supplied mock sign-in. Do not weaken production authorization to make local development work.

Read LOCAL_SETUP.md first. Clean clones select portable mode without .sites-runtime/execution-profile.json. `pnpm setup:local` builds and applies local-only D1 migrations; `pnpm dev` starts the dev server.

Key files:
- app/workspace.tsx: notes and research navigation
- app/editor.tsx: writing, attachments, deletion
- app/research-dialog.tsx: consent, survey and withdrawal
- app/analytics.tsx: charts and ML workflow
- app/api/[...path]/route.ts: server authorization and operations
- app/s/[token]: shared note reader
- lib/server.ts: data access, events and aggregates
- lib/research-model.ts: model validation and inference
- db/schema.ts and drizzle/: SQL schema and migrations
- ml/: Python project; read its README
- tests/api.integration.mjs: built-Worker integration tests with isolated stores

## Verification already completed for the hosted source

TypeScript check and production build passed. 59 API and data-integrity checks passed using fresh in-memory D1/R2 stores. Desktop and mobile UI were checked. Python and TypeScript cluster assignments matched for all 90 synthetic records. Those were development checks, not evidence about real visitors or a new macOS run.

After relevant changes run `pnpm exec tsc --noEmit`, `pnpm build`, and `node tests/api.integration.mjs`. Keep migrations append-only. The initial database for each local copy is separate from production.

## Hosting context

Existing Site: https://noteatlas-workspace.gladstork3.chatgpt.site
Original source commit: 5eb259734ac55ec4bf766d964521b726dd1a80a2
Site version: 1 (last checked during export on 2026-10-30).
The Site starts private. Its first authenticated owner initializes the research-owner setting; initialize owner access while it is private before considering public access. A local mock user owns only the local database.

The export is a standalone source copy; Git history, credentials, hosted database contents and uploads are not included. Local edits do not automatically synchronize with the hosted Site. Confirm the intended repository/deployment destination before any future production changes.
