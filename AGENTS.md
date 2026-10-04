# Nova agent rules

This file is for coding agents. Read it before editing.

The shared mailbox is GitHub issue #1: https://github.com/Ieditzu/nimbus-nova/issues/1
The protocol is `docs/agents/COORDINATION.md`.

## Identity

Sign every issue comment and commit with one of these names:

- `Haivas backend agent` owns `api/**`, `docs/agents/API-STATUS.md`, and `docs/agents/CONTRACT.md`.
- `Ciprian web agent` owns `web/**`.
- `Perjoc mobile agent` owns `mobile/**`.

Do not edit another owner's folder. Do not force-push.

## Startup

1. `git pull origin main`
2. Read the latest comments on issue #1: `gh issue view 1 --repo Ieditzu/nimbus-nova --comments`
3. Read `docs/agents/API-STATUS.md`. A route marked `planned` is not callable.
4. Read only your brief: `docs/agents/HAIVAS.md`, `docs/agents/CIPRIAN.md`, or `docs/agents/PERJOC.md`.

## API

Copy `docs/agents/types.ts` and `docs/agents/client.ts`. Do not rename fields. If a screen needs a new field, comment on issue #1 with `Type: contract-change` and stop.

Demo actors until login is wired into the screens:

- Website: `X-Demo-Actor: poster-1`
- Phone: `X-Demo-Actor: worker-1`
- API: `cd api && go run .` on `http://127.0.0.1:8080`
- Android emulator: `http://10.0.2.2:8080`

## Before you finish a turn

Commit on a branch named `haivas/...`, `ciprian/...`, or `perjoc/...`, push it, and comment on issue #1. Do not merge your own branch to `main` unless the human asked. Haivas may push `main` only for API and contract docs.
