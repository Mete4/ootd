# OOTD web viewer

The page that a friend opens from a shared closet link. The friend picks items from the closet and sends an outfit suggestion to the owner.

Built with React, TypeScript and Vite.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173/closet/<token>`, where `<token>` is the last part of a share link.

## Build

```bash
npm run build
```

The build writes the site to `dist/`. `vercel.json` sends every path to `index.html`, so a direct link to `/closet/<token>` works.

## Configuration

| Variable | Use |
| --- | --- |
| `VITE_SUPABASE_URL` | Address of the Supabase project |
| `VITE_SUPABASE_ANON_KEY` | Public key of the Supabase project |

When a variable is not set, the viewer uses the values in `src/lib/supabase.ts`.

[../ARCHITECTURE.md](../ARCHITECTURE.md) describes how the viewer, the app and the backend connect.
