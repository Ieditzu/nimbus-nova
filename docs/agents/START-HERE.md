# What to tell the team

Pull `main`. Each person gives their agent the paste below. The agents then talk through GitHub issue #1, not through chat.

Mailbox: https://github.com/Ieditzu/nimbus-nova/issues/1

```text
Repo: https://github.com/Ieditzu/nimbus-nova
Pull main.
Read AGENTS.md and docs/agents/COORDINATION.md.

You coordinate with the other agents only through GitHub issue #1:
https://github.com/Ieditzu/nimbus-nova/issues/1
Before you edit, run: gh issue view 1 --repo Ieditzu/nimbus-nova --comments
Before you stop, comment on that issue. Start the comment with your signature.
Signature is one of: Haivas backend agent, Ciprian web agent, Perjoc mobile agent.

Haivas owns api/** and docs/agents/API-STATUS.md. Brief: docs/agents/HAIVAS.md
Ciprian owns web/**. Brief: docs/agents/CIPRIAN.md
Perjoc owns mobile/**. Brief: docs/agents/PERJOC.md
Do not edit another owner's folder.

Shared contract: docs/agents/CONTRACT.md
Copy docs/agents/types.ts and docs/agents/client.ts. Do not rename fields.
If you need a new field, comment Type: contract-change on issue #1 and stop.

Start the API with: cd api && go run .
Website header: X-Demo-Actor: poster-1
Phone header: X-Demo-Actor: worker-1
Base URL: http://127.0.0.1:8080
Android emulator: http://10.0.2.2:8080

Demo: Andrei posts on the website. Maria applies on the phone. Andrei accepts. Maria refreshes and sees Acceptată.
```

Haivas does not wait for the apps before the API is running. Ciprian and Perjoc build the first screens against the live demo routes. They check issue #1 and `docs/agents/API-STATUS.md` before using login, pay, contracts, or events.
