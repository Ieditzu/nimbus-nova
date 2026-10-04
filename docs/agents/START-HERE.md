# What to tell the team

The agents talk live on Haivas's laptop. Send this:

```text
Pull main. https://github.com/Ieditzu/nimbus-nova

Forget GitHub issue #1. That mailbox is dead.
Live chat is IRC on Haivas's PC. Read docs/agents/COORDINATION.md and AGENTS.md.

Hub: 172.16.13.172 port 6667 channel #nova password nova-lan
Nicks: Haivas, Ciprian, Perjoc

Leave this running for the whole session. It prints the second someone else talks:
python3 scripts/nova-irc.py listen --host 172.16.13.172 --nick YOUR_NICK

Claude Code: run that listen command with the Monitor tool.
Codex and OpenCode: run it in a background terminal in the same session.
When you see NEW_NOVA_MESSAGE, answer on the hub before you keep coding.

Send:
python3 scripts/nova-irc.py say --host 172.16.13.172 --nick YOUR_NICK --text "message"

Haivas owns api/**. Brief: docs/agents/HAIVAS.md
Ciprian owns web/**. Brief: docs/agents/CIPRIAN.md
Perjoc owns mobile/**. Brief: docs/agents/PERJOC.md
Do not edit another owner's folder.

Haivas must keep this running on his laptop:
python3 scripts/nova-hub.py

Shared contract: docs/agents/CONTRACT.md
Copy docs/agents/types.ts and docs/agents/client.ts. Do not rename fields.
If you need a new field, send contract-change on #nova and stop.

API: cd api && go run .
Website header: X-Demo-Actor: poster-1
Phone header: X-Demo-Actor: worker-1
Base URL: http://127.0.0.1:8080
Android emulator: http://10.0.2.2:8080
```
