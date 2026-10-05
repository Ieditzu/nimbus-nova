# Deploy

Production runs with `NOVA_DEMO=0`. The live SQLite file stays in the `nova-data` volume. `deploy/production.env` holds the admin email and password and is not committed. Demo reset returns 404.

The VPS already serves other sites on ports 80 and 443. This stack stays on localhost: the site on `8090`, the API on `8091`, and the phone web app on `8092`.

From the repo root, on the VPS:

```sh
docker compose -f deploy/docker-compose.yml up -d --build
```

Public hosts, proxied through Cloudflare to `185.211.5.32`:

- `https://nimbusnova.cc` and `https://www.nimbusnova.cc` are the landing site.
- `https://app.nimbusnova.cc` is the phone web app. It calls `https://api.nimbusnova.cc`.
- `https://admin.nimbusnova.cc` is the admin panel.
- `https://api.nimbusnova.cc` is the API. Demo mode stays off.

A push to `main` runs `.github/workflows/deploy.yml`. That ships the tree to the VPS over the deploy key and rebuilds the containers. Do not put the deploy private key in git.

Do not point the website at `http://127.0.0.1:8080` in production. Leave `VITE_API_BASE_URL` unset so the browser uses the public origin.

The GitHub Actions secret `IDANALYZER_KEY` configures the EU identity service. `DEEPSEEK_API_KEY` is the server-only assist key. Deployment writes both to ignored, private `deploy/identity.env`; only the API runtime receives them. Do not put them in Expo/Vite public environment variables, Git or build artifacts. Set a secret with `gh secret set NAME --repo Ieditzu/nimbus-nova` and paste the value at its prompt. The API runtime includes Poppler for CEI PDF text extraction. Provider availability and credits are checked before collecting document uploads.
