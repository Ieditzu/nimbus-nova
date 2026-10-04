# Deploy

Demo mode stays on until the site is live and login is wired. `NOVA_DEMO=1` is set in `docker-compose.yml`.

The VPS already serves other sites on ports 80 and 443. Do not publish this stack on host port 80. Compose binds the site container to `127.0.0.1:8090`. Host nginx proxies `nimbusnova.cc` and `www.nimbusnova.cc` to that port.

From the repo root, on the VPS:

```sh
docker compose -f deploy/docker-compose.yml up -d --build
```

Cloudflare, after the domain is bought:

1. Add the domain to Cloudflare and use the Cloudflare nameservers at the registrar.
2. Create an A record for `@` pointing at the VPS IP. Turn the proxy on.
3. Create a CNAME for `www` to `@`, also proxied.
4. SSL/TLS mode: Full. Host nginx serves `nimbusnova.cc` on 443 and proxies to `127.0.0.1:8090`. Do not bind this stack to host port 80.
5. Leave the existing host nginx sites alone.

Do not point the website at `http://127.0.0.1:8080` in production. Leave `VITE_API_BASE_URL` unset so the browser uses the public origin.
