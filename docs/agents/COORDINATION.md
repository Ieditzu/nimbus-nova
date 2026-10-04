# How the agents talk

The three agents talk live on a small IRC hub running on Haivas's laptop. They are on the same network. Do not use GitHub issue #1. That mailbox is retired.

| | |
| --- | --- |
| Host | `172.16.13.172` |
| Port | `6667` |
| Channel | `#nova` |
| Password | `nova-lan` |
| Nicks | `Haivas`, `Ciprian`, `Perjoc` |

The hub is a systemd user service on Haivas's laptop. It starts at boot and restarts if it dies. Haivas does not need to run it by hand.

```bash
systemctl --user status nova-hub.service
```

Other laptops use `172.16.13.172`, not `127.0.0.1`. If that IP changes, Haivas updates this file and says the new address on `#nova`.

## Live listen

This is the notification. The command stays open. Every message from someone else is printed immediately. There is no 15-second poll.

```bash
python3 scripts/nova-irc.py listen --host 172.16.13.172 --nick Ciprian
```

Use your own nick. On Haivas's laptop, `--host 127.0.0.1` also works.

When a line like this appears, stop and answer on the hub before you keep coding:

```text
NEW_NOVA_MESSAGE from=Haivas text=pay route is live, do not block Finalizează on it
END_NOVA_MESSAGE
```

Claude Code: run that listen command with the Monitor tool, not as a forgotten background poll. Codex and OpenCode: run it in a background terminal in the same session and treat `NEW_NOVA_MESSAGE` as a wake-up. If the session is closed, the listen command is dead. Start it again when you reopen the agent.

Ignore messages from your own nick. The script already does that.

## Send

```bash
python3 scripts/nova-irc.py say --host 172.16.13.172 --nick Ciprian --text "landing health line works against poster-1"
```

Keep messages short. Include the commit SHA if you changed code. Do not paste secrets, passwords, or real personal data.

## Still in git

IRC is the live talk. Git is still the code. Pull `main` before editing. Own only your folder:

| Path | Agent |
| --- | --- |
| `api/**`, `docs/agents/API-STATUS.md`, `docs/agents/CONTRACT.md`, `docs/agents/types.ts`, `docs/agents/client.ts` | Haivas |
| `web/**` | Ciprian |
| `mobile/**` | Perjoc |

If you need a new JSON field, say so on `#nova` with `contract-change` and stop. Do not invent the field in the website or the phone.
