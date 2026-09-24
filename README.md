# Feed Panel

Operator console for sports feed management: event monitoring, odds comparison
(own vs. market average), alerts, archive, trading tools and settlements.

## Stack

- React 19, TypeScript 5, Vite
- Tailwind CSS v4 with HSL design tokens, Radix UI primitives
- React Router, TanStack Query, Framer Motion, i18next (EN/DE)
- PostgreSQL with row level security, hosted auth (e-mail/password, roles)
- Vitest (unit) and Playwright (end-to-end)

## Local development

```bash
npm install
npm run dev          # http://localhost:8080
npm run test         # unit tests
npm run test:e2e     # end-to-end tests (dev server must run)
```

Environment variables live in `.env`:

```
VITE_..._URL=...              # backend address
VITE_..._PUBLISHABLE_KEY=...  # public client key
```

Only the publishable key is ever shipped to the browser. Privileged operations
belong in server-side functions.

## Production build and deployment

### First install on an empty Ubuntu 24.04 server

```bash
curl -fsSL <raw-url-of-deploy.sh> -o deploy.sh
sudo REPO_URL=https://github.com/<you>/<repo>.git bash deploy.sh
```

The script checks and installs everything that is missing (git, nginx,
certbot, Node.js 20 + npm, build tools, ufw, fail2ban, unattended-upgrades,
swap, time sync), clones the repository to `/opt/feed-panel` and continues there.
HTTPS is only requested once DNS points to the server.

### Updates (inside the cloned repository)

```bash
sudo ./deploy.sh                       # feed.feedarea.net, branch main
sudo BRANCH=release ./deploy.sh
sudo SKIP_PULL=1 NO_BUMP=1 ./deploy.sh
sudo SKIP_FIREWALL=1 ./deploy.sh       # leave ufw untouched
```

`deploy.sh` installs missing packages, runs `git pull`, raises the patch
version, builds, backs up the previous release, publishes to `/var/www/html`,
writes the nginx site (SPA fallback, caching rules, security headers, backend
proxy under the own domain) and requests/renews the Let's Encrypt certificate.

## Roles

| Role   | Capabilities                                              |
| ------ | --------------------------------------------------------- |
| admin  | everything, including the audit log                        |
| trader | odds, suspensions, alerts, settlements, margin profiles    |
| viewer | read-only access to monitoring and reports                 |

New accounts receive the `trader` role; roles are stored in a dedicated table
and enforced by database policies, never in the browser.

## Odds feed worker

Live odds arrive over a permanent message connection, which runs as the systemd service `feed-worker` on the web server (installed by `deploy.sh`).

- Credentials: `/etc/feed-panel/uof.env` (asked once on the first interactive `sudo ./deploy.sh`, mode 640, owner root:feedworker).
- Logs: `journalctl -u feed-worker -f`
- The worker forwards signed message batches to the backend, refreshes the schedule every 10 minutes and requests recovery automatically after interruptions.
- Status in the panel: the indicator in the top bar (live / pre-match), admins can trigger a manual sync there.
