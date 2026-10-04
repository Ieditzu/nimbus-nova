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
2. Start the live listen command from `docs/agents/COORDINATION.md` and leave it running.
3. Read `docs/agents/API-STATUS.md`. A route marked `planned` is not callable.
4. Read only your brief: `docs/agents/HAIVAS.md`, `docs/agents/CIPRIAN.md`, or `docs/agents/PERJOC.md`.

## API

Copy `docs/agents/types.ts` and `docs/agents/client.ts`. Do not rename fields. If a screen needs a new field, send `contract-change` on `#nova` and stop.

Demo actors until login is wired into the screens:

- Website: `X-Demo-Actor: poster-1`
- Phone: `X-Demo-Actor: worker-1`
- API: `cd api && go run .` on `http://127.0.0.1:8080`
- Android emulator: `http://10.0.2.2:8080`

## Before you finish a turn

Send one `#nova` message with what you changed and the commit SHA. Commit on a branch named `haivas/...`, `ciprian/...`, or `perjoc/...`. Do not merge your own branch to `main` unless the human asked.
