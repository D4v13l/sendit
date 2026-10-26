# Self-hosting Good Outside for you and a few friends

The artifact edition also runs as an ordinary static website. Outside Claude, the page fetches
forecasts and drive distances straight from the viewer's browser, so every feature works on any
phone or computer: day-trip ratings, the weather map, zoomed-in samples, forecasts by elevation,
surfing and postcode search.

This folder deploys that site to **your own Cloudflare account**, on a hostname you choose, behind
**Cloudflare Access**, which allows in only the email addresses you list.

## Why Cloudflare rather than the home server

The site is static files. Nothing runs on a server and nothing is stored about anyone, so it doesn't
need a computer of yours to run on. Serving it from Cloudflare means:

- **Your home network stays out of the path.** No open ports, no tunnel into the LAN, and nothing
  on the Unraid box to patch or that could become a way in.
- **Sign-in happens before the site.** Access answers every request to the hostname with its own
  sign-in page. People not on your list never receive a single file of the site.
- **It costs nothing at this size.** Static-asset requests on Workers are free. Zero Trust is free
  for up to 50 users (Cloudflare may ask for a payment method when you first set it up).

If you'd still like a copy on the Unraid box, keep it LAN-only: serve `dist-web/` read-only from an
unprivileged web-server container, and don't forward a port to it. For access away from home, use
the Cloudflare copy.

## What protects the site

- **Fail-closed deploys.** `deploy.mjs` asks the Cloudflare API which Access applications cover
  the hostname, and refuses to deploy unless one does. It also refuses when that application:
  - covers only a path,
  - has a Bypass or Service Auth policy, or
  - has an Allow policy that includes everyone.
- **Post-deploy check.** After deploying, the script fetches the site and fails loudly if it
  answers without the Access sign-in.
- **One way in.** The Worker serves only that custom hostname. The `*.workers.dev` address and
  preview URLs are turned off, so there's no unprotected side door.
- **No third-party scripts.** Leaflet and topojson-client are served from the site itself. The
  Leaflet file is checked against the hash Leaflet publishes for 1.9.4.
- **Strict response headers** (`dist-web/_headers`):
  - The Content Security Policy lets the page run only its own scripts, and connect only to
    itself, Open-Meteo and the OSRM routing server. Nothing can frame it.
  - Other headers: `Referrer-Policy: no-referrer`, `noindex`, HSTS, `nosniff`, and a
    Permissions-Policy that turns off location, camera and microphone.
- **No server-side storage.** Bookmarks and the last search stay in each person's browser.

## Privacy: what each party sees

| Who | Sees |
|---|---|
| Cloudflare (your account) | Requests to the site and your friends' email addresses (for the sign-in codes). |
| You, in Zero Trust → Logs | Who signed in and when. |
| Open-Meteo and the OSRM demo server | The viewer's IP address and the coordinates being checked. The referrer is withheld, so they don't learn your hostname. |
| GitHub (if you deploy with Actions) | Your Cloudflare secrets, encrypted. The hostname is a secret too, so it's masked in the public run logs. |

Remaining considerations:

- **Free services with usage limits.**
  - Open-Meteo is free for non-commercial use, about 10,000 calls a day per viewer's IP. A search
    uses roughly 100 point-calls.
  - The OSRM demo server is meant for light use. When it's unavailable, drive times fall back to
    estimates marked "est.".
- **Data licences travel with the site.** OpenSkiData is ODbL; its notice is in the Coverage
  panel.

## One-time setup

You'll need your Cloudflare account, a hostname on a domain whose DNS is on Cloudflare (for example
`outside.yourdomain.com`), and this fork on GitHub.

### 1. Create the Access application first

In the Cloudflare dashboard, open **Zero Trust**. Choose the Free plan if asked.

1. Go to **Access → Applications → Add an application → Self-hosted**.
2. Name it, for example *Good Outside*.
3. Under **Application domain**, enter the subdomain and domain. Leave the path empty.
4. Set the session duration you like; a month is fine for friends.
5. Under **Identity providers**, keep **One-time PIN**: people get a code by email, with no
   passwords.
6. Add a policy named *Friends*: Action **Allow**, Include → **Emails** → your address and your
   friends' addresses.
7. Don't add Bypass rules or "Everyone".

Your friends' addresses live only in Cloudflare, never in this repository.

### 2. Create a narrowly scoped API token

Go to **My Profile → API Tokens → Create Token** and start from the **Edit Cloudflare Workers**
template.

1. Under **Account Resources**, choose your account only.
2. Under **Zone Resources**, choose only the zone for your domain.
3. Add a permission: **Account → Access: Apps and Policies → Read**. The deploy script uses it to
   confirm the site is protected.
4. Optionally set an expiry date. Revoke the token any time; the site keeps running.

If attaching the custom domain fails with a permissions error, add **Zone → DNS → Edit** for that
zone.

Your **Account ID** is on the right of the Workers & Pages overview page.

### 3. Add three secrets to the fork

In GitHub, open the fork's **Settings → Secrets and variables → Actions → New repository secret**:

- `CLOUDFLARE_API_TOKEN`: the token from step 2.
- `CLOUDFLARE_ACCOUNT_ID`: your account ID.
- `GOOD_OUTSIDE_HOSTNAME`: for example `outside.yourdomain.com`.

### 4. Enable Actions and run the deploy

GitHub keeps Actions off on new forks: open the **Actions** tab and enable workflows.

GitHub only lists a manually run workflow once its file is on the default branch, so merge this
branch into your fork's default branch first. Then open **Actions → Deploy Good Outside web → Run
workflow**.

The run takes a few minutes. It downloads the pinned catalog snapshot and map data, checks them
against their recorded hashes, runs the tests, builds the site, confirms Access protects the
hostname, deploys, and checks that the live site answers with the sign-in page.

### 5. Check it yourself

Open the hostname in a private window. You should see the Cloudflare Access sign-in, receive a code
by email, and then see the planner. Send your friends the link; they sign in the same way.

## Day to day

- **Add or remove a friend.** Edit the Access policy's email list; no redeploy needed. To cut off
  someone's current session, go to **Zero Trust → Users** and revoke it.
- **Update the site.** Run the workflow again.
- **Take it down.** Delete the Worker (default name `good-outside-web`) in Workers & Pages.

## Deploying from your own computer instead

Use Node 22 and run these from `apps/good-outside/artifact`:

```sh
npm ci
node fetch-data.mjs && node fetch-terrain.mjs   # pinned map data and terrain tiles
(cd ../../.. && npm run data:download)           # catalog snapshot, checked against data/snapshots.json
node build.mjs && node build-web.mjs
read -rs CLOUDFLARE_API_TOKEN && export CLOUDFLARE_API_TOKEN   # paste the token; it stays out of shell history
CLOUDFLARE_ACCOUNT_ID=… GOOD_OUTSIDE_HOSTNAME=outside.yourdomain.com node web/deploy.mjs
```

`node web/deploy.mjs --check-only` runs just the Access check. `--dry-run` builds the Worker
upload without contacting your account.
