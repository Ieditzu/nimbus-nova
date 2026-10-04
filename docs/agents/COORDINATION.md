# How the agents talk

The three agents do not share a chat. They share this git repo and one GitHub issue.

Mailbox: https://github.com/Ieditzu/nimbus-nova/issues/1

This is the same pattern described by Jon Udell in InfoWorld, "The agent coordination protocol hiding in plain sight: GitHub issues" (22 September 2026): https://www.infoworld.com/article/4224587/the-agent-coordination-protocol-hiding-in-plain-sight-github-issues.html

GitHub issues already work from Codex, Claude Code, and OpenCode through `gh`. A custom chat tool would be a second place to look. Do not add one.

## Read this every session

```bash
git pull origin main
gh issue view 1 --repo Ieditzu/nimbus-nova --comments
```

Then read `docs/agents/API-STATUS.md` and your own brief.

## Write this before you stop

```bash
gh issue comment 1 --repo Ieditzu/nimbus-nova --body "$(cat <<'EOF'
Signature: Haivas backend agent
Type: status
Commit: abc1234
Need from: nobody
Done: Pay route is live and covered by go test.
Next: Ciprian can call api.pay after refetching main. Do not require pay on the first poster screen.
EOF
)"
```

Replace the signature with `Ciprian web agent` or `Perjoc mobile agent`. `Type` is `status`, `blocker`, `contract-change`, or `handoff`.

`contract-change` means you need a JSON field or route that is not in `docs/agents/CONTRACT.md`. Stop coding that screen. Haivas answers on the same issue, changes the contract, and marks the route `live` in `docs/agents/API-STATUS.md`.

## Branches

- `haivas/<short-topic>`
- `ciprian/<short-topic>`
- `perjoc/<short-topic>`

Push the branch. Open a pull request only if the human asks. The other agent pulls `main`, not your unmerged branch, unless the issue comment gives the branch name and says to pull it.

## Ownership

| Path | Only this agent edits it |
| --- | --- |
| `api/**` | Haivas backend agent |
| `docs/agents/API-STATUS.md` | Haivas backend agent |
| `docs/agents/CONTRACT.md` | Haivas backend agent |
| `docs/agents/types.ts` | Haivas backend agent |
| `docs/agents/client.ts` | Haivas backend agent |
| `web/**` | Ciprian web agent |
| `mobile/**` | Perjoc mobile agent |

If two agents need the same file, that file is in the wrong place. Say so on issue #1.

## What a good handoff contains

- The commit SHA.
- The command the other person runs, not a description of the command.
- The header and URL, if the API is involved.
- What not to build yet.

Bad: "backend is basically done, wire it up."
Good: "Commit 5e752fe. `cd api && go run .` Pay is `POST /v1/tasks/{id}/pay` with `X-Demo-Actor: poster-1` and body `{}`. Do not block Finalizează on pay."
