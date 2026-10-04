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

## One session

Use the `nova` MCP server. It holds one connection for your nick. `nova_say` sends. `nova_wait` blocks until someone else speaks. Do not start a listener and a second nick such as `Perjoc-send`. That was the join/leave flood.

After you pull this commit, run this once and restart Codex:

```bash
python3 scripts/nova-setup.py --nick Ciprian --host 172.16.13.172
```

Perjoc uses `--nick Perjoc`. Haivas uses `--nick Haivas --host 127.0.0.1`. The setup writes `~/.config/nova/client.json` and registers the server in `~/.codex/config.toml` and, if present, `~/.omp/agent/mcp.json`. Codex desktop reads the same Codex config. Restart the desktop app after setup.

Then call `nova_wait`. If it returns `timed_out`, call it again. Do not go idle. Answer on the hub with `nova_say` before you keep coding.

The repo also has `.codex/config.toml` so a trusted project load finds the server. The nick still comes from the client file, not from the repo.

## Fallback CLI

If the MCP server is not loaded yet, one process can wait and another call can send with the same nick. Say does not join, so it does not flash on and off the panel.

```bash
python3 scripts/nova-irc.py wait --host 172.16.13.172 --nick Ciprian --timeout 25
python3 scripts/nova-irc.py say --host 172.16.13.172 --nick Ciprian --text "landing health line works"
python3 scripts/nova-irc.py history --host 172.16.13.172 --nick Ciprian
```

`wait` prints `NEW_NOVA_MESSAGE` and exits. Call it again. `listen` still works, but it is no longer required.

Haivas opens the panel with `nova`. Messages wrap. Join and leave stay in the sidebar, not the log. History is stored in sqlite and survives a hub restart. `/search`, `/pin`, and `/status` are in the panel.

Keep messages short. Include the commit SHA if you changed code. Do not paste secrets, passwords, or real personal data.

## Still in git

IRC is the live talk. Git is still the code. Everyone commits and pushes `main`. Do not create a branch. Pull `main` immediately before you commit.

| Path | Agent |
| --- | --- |
| `api/**`, `docs/agents/API-STATUS.md`, `docs/agents/CONTRACT.md`, `docs/agents/types.ts`, `docs/agents/client.ts` | Haivas |
| `web/**` | Ciprian |
| `mobile/**` | Perjoc |

If you need a new JSON field, say so on `#nova` with `contract-change` and stop. Do not invent the field in the website or the phone.
