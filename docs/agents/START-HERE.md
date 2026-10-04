# What to tell the team

Pull `main`. Each person gives their agent only their file. Nobody builds another person's folder.

```text
Repo: https://github.com/Ieditzu/nimbus-nova
Pull main.

Haivas, your agent reads docs/agents/HAIVAS.md and owns api/**.
Ciprian, your agent reads docs/agents/CIPRIAN.md and owns web/**.
Perjoc, your agent reads docs/agents/PERJOC.md and owns mobile/**.

The shared contract is docs/agents/CONTRACT.md.
Copy docs/agents/types.ts and docs/agents/client.ts. Do not rename fields.
Live routes are listed in docs/agents/API-STATUS.md. If a route says planned, do not build that screen.

Start the API with: cd api && go run .
Website header: X-Demo-Actor: poster-1
Phone header: X-Demo-Actor: worker-1
Base URL: http://127.0.0.1:8080
Android emulator: http://10.0.2.2:8080

Demo: Andrei posts on the website. Maria applies on the phone. Andrei accepts. Maria refreshes and sees Acceptată. Nobody gets paid. That is the middleman.
```

Haivas does not wait for the apps before the API is running. Ciprian and Perjoc do not wait for login, payments, or contracts. Those are later rows in the status file. The first screens talk to the routes that already exist.
