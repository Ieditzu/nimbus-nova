# Deploy

Demo mode stays on until the site is live and login is wired. `NOVA_DEMO=1` is set in `docker-compose.yml`.

The VPS already serves other sites on ports 80 and 443. This stack stays on localhost: the site on `8090`, the API on `8091`, and the phone web app on `8092`.

From the repo root, on the VPS:

```sh
docker compose -f deploy/docker-compose.yml up -d --build
```

Public hosts, proxied through Cloudflare to `185.211.5.32`:

- `https://nimbusnova.cc` and `https://www.nimbusnova.cc` are the landing site.
- `https://app.nimbusnova.cc` is the phone web app. It calls `https://api.nimbusnova.cc`.
- `https://admin.nimbusnova.cc` is the admin panel.
- `https://api.nimbusnova.cc` is the API. Demo mode stays on.

A push to `main` runs `.github/workflows/deploy.yml`. That ships the tree to the VPS over the deploy key and rebuilds the containers. Do not put the deploy private key in git.

Do not point the website at `http://127.0.0.1:8080` in production. Leave `VITE_API_BASE_URL` unset so the browser uses the public origin.
