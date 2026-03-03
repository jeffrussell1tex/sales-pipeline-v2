# Sales Pipeline Tracker — Vite Migration

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file (already included, but confirm it has your key):
```
VITE_CLERK_PUBLISHABLE_KEY=pk_test_ZGVlcC15YWstMTYuY2xlcmsuYWNjb3VudHMuZGV2JA
```

3. Run locally:
```bash
npm run dev
```

4. Build for production:
```bash
npm run build
```

## Deploying to Netlify

This project is configured for Netlify via `netlify.toml`:
- Build command: `npm run build`  
- Publish directory: `dist`
- Functions directory: `netlify/functions` (same as before — no changes needed)

Add this environment variable in Netlify dashboard:
- `VITE_CLERK_PUBLISHABLE_KEY` = your Clerk publishable key
- `CLERK_SECRET_KEY` = your Clerk secret key (for functions)

## Project Structure

```
src/
  App.jsx                    # Main app (state + handlers)
  main.jsx                   # Entry point + ClerkProvider
  index.css                  # All styles
  utils/
    storage.js               # safeStorage + dbFetch with auth
  components/
    modals/                  # All modal components
    ui/                      # Shared UI components
netlify/
  functions/                 # All Netlify functions (unchanged)
```
