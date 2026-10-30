# Open NoteAtlas in VS Code on your Mac

This is the source of the deployed NoteAtlas version, plus local setup and handoff files. It contains the TypeScript website, server API, SQL migrations, and Python ML project. It contains no node_modules, credentials, production database records, or uploaded files.

## 1. Open the project

Unzip NoteAtlas_VSCode.zip. In VS Code, choose File > Open Folder and select the extracted `noteatlas` folder (the one containing package.json).

Install Node.js 22.13 or newer if it is not installed. Open Terminal > New Terminal in VS Code and run:

```bash
npm install -g pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm setup:local
pnpm dev
```

The setup command builds the website and applies unapplied SQL migrations to your local database. If Wrangler asks to apply migrations, confirm the LOCAL database operation. The command uses --local, never --remote. It is safe to rerun setup:local for subsequent local migrations.

Open the localhost URL printed by the server, normally http://localhost:5173. You can use Firefox. Leave that terminal running. Ctrl+C stops the server.

A clean exported copy selects the starter's portable mode. Its development server simulates ChatGPT sign-in for LOOPBACK requests only. Clicking Sign in locally creates the development user local_seedy, displayed as Seedy. This is local test authentication; it does not log into or modify your hosted site. The mock is not part of the production build. Keep the development server on localhost.

If pnpm is already installed, check pnpm --version. The packageManager field pins 11.25.0. If npm global installation fails due to how Node was installed, use your normal Node version manager or ask Codex to diagnose that error; avoid changing system ownership.

## 2. Continue with Codex in VS Code

Install the official OpenAI Codex extension if it is not installed, sign in with your ChatGPT account, and open the Codex sidebar. On macOS use Cmd+Shift+P and select `Codex: Open Codex Sidebar` if the icon is missing.

The open project folder supplies the code context. Do not rely on the website URL or this ChatGPT conversation being the local source checkout. Give Codex this prompt:

> Read CODEX_HANDOFF.md and LOCAL_SETUP.md. Inspect this NoteAtlas codebase, verify the local setup on my Mac, run the appropriate checks, and explain its structure in easy Bangla. Preserve the existing notes features, consent behavior, and research privacy boundaries. Ask before changing hosting, authentication, or production data. Then help me with one change at a time.

Official documentation: https://learn.chatgpt.com/docs/ide and https://learn.chatgpt.com/docs/projects

## 3. Run the Python ML project separately

Use a second VS Code terminal while the website keeps running:

```bash
cd ml
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python make_demo.py
python train.py demo_activity.csv
```

Use Python 3.10 or newer. The generated practice records and model are SYNTHETIC, not findings about visitors. Read ml/README.md before using real research exports. For real training, replace the demo CSV with the owner-only activity export from your website. Python training runs separately from the web server.

## 4. Keep local and hosted work in sync

The ZIP is a one-time copy, without Git history. Changing local files does not automatically redeploy the ChatGPT-hosted site, copy local data to it, or download its production data. The retained .openai/hosting.json identifies the existing Site; it is not a credential.

For a long-term workflow, initialize a Git repository for this local project and publish it to a private repository you control. Use commits and pushes/pulls to transfer code. Connecting a Codex Cloud environment to that repository is a separate step from opening it in VS Code. Deploying to your own hosting also requires configuring its database, uploads, and production authentication; the hosted Sites sign-in flow is platform-managed.

The exported source corresponds to Site version 1, commit 5eb259734ac55ec4bf766d964521b726dd1a80a2. The export adds this guide, CODEX_HANDOFF.md, setup-local.mjs, setup:local, and VS Code extension recommendations. It does not change the deployed Site.
