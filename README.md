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
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

Only the publishable key is ever shipped to the browser. Privileged operations
belong in server-side functions.

## Production build and deployment

```bash
npm run build        # writes ./dist
sudo ./deploy.sh     # builds and publishes to /var/www/html
TARGET=/srv/www sudo ./deploy.sh
```

`deploy.sh` installs dependencies, builds, backs up the previous release to
`/var/backups/feed-panel/<timestamp>` and syncs `dist/` to the web root.

The app is a single-page application, so the web server needs an SPA fallback:

```nginx
location / {
  try_files $uri $uri/ /index.html;
}
```

## Roles

| Role   | Capabilities                                              |
| ------ | --------------------------------------------------------- |
| admin  | everything, including the audit log                        |
| trader | odds, suspensions, alerts, settlements, margin profiles    |
| viewer | read-only access to monitoring and reports                 |

New accounts receive the `trader` role; roles are stored in a dedicated table
and enforced by database policies, never in the browser.
