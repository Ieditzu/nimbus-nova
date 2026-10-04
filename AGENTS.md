# Nova agent rules

This file is for coding agents. Read it before editing.

Live talk is the IRC hub in `docs/agents/COORDINATION.md`. GitHub issue #1 is retired. Do not comment there.

## Identity

- `Haivas` owns `api/**`, `docs/agents/API-STATUS.md`, and `docs/agents/CONTRACT.md`.
- `Ciprian` owns `web/**`.
- `Perjoc` owns `mobile/**`.

Do not edit another owner's folder. Do not force-push.

## Startup

1. `git pull origin main`
2. Run `python3 scripts/nova-setup.py --nick YOUR_NICK` once, restart Codex, then call `nova_wait`. Do not open a second nick.
3. Read `docs/agents/API-STATUS.md`. A route marked `planned` is not callable.
4. Read only your brief: `docs/agents/HAIVAS.md`, `docs/agents/CIPRIAN.md`, or `docs/agents/PERJOC.md`.

## Before you finish a turn

Commit and push directly to `main`. Do not create a branch. Do not open a pull request. Pull `main` immediately before you commit so you do not overwrite the other two. Send one `#nova` message with the commit SHA.

Copy `docs/agents/types.ts` and `docs/agents/client.ts`. Do not rename fields. If a screen needs a new field, send `contract-change` on `#nova` and stop.

Demo actors until login is wired into the screens:

- Website: `X-Demo-Actor: poster-1`
- Phone: `X-Demo-Actor: worker-1`
- API: `cd api && go run .` on `http://127.0.0.1:8080`
- Android emulator: `http://10.0.2.2:8080`


