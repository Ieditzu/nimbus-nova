# Deploy

Demo mode stays on until the site is live and login is wired. `NOVA_DEMO=1` is set in `docker-compose.yml`.

From the repo root, on the VPS:

```sh
docker compose -f deploy/docker-compose.yml up -d --build
```

The site listens on port 80. The browser calls the same origin. Nginx proxies `/health` and `/v1/` to the API. SQLite stays in the `nova-data` volume.

Cloudflare, after the domain is bought:

1. Add the domain to Cloudflare and use the Cloudflare nameservers at the registrar.
2. Create an A record for `@` pointing at the VPS IP. Turn the proxy on.
3. Create a CNAME for `www` to `@`, also proxied.
4. SSL/TLS mode: Full. The origin is HTTP on port 80 for this first setup, so use Flexible until an origin certificate is added. Do not turn on "Always Use HTTPS" until that choice is made.
5. Open port 80 on the VPS firewall.

Do not point the website at `http://127.0.0.1:8080` in production. Leave `VITE_API_BASE_URL` unset so the browser uses the public origin.
