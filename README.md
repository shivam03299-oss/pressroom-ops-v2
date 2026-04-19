# PRESSROOM.OPS v2

DTF print unit management dashboard — backed by Supabase for real multi-device sync with role-based login.

## Accounts

- **Admin** (Shivam): full access to all pages including P&L, Payroll, Insights
- **Workers** (Jai, Sushil, Ravi): Attendance, Production, Orders, Dispatches, Warehouse only

## Run locally

```bash
npm install
npm run dev
```

Opens at http://localhost:5173

## Deploy to Vercel

1. Push this folder to a GitHub repo
2. Go to vercel.com → Add New → Project → import the repo → Deploy
3. No configuration needed — Vercel auto-detects Vite

## Install as mobile app

After deploying, open the URL in Chrome on Android → tap menu → "Install app" → icon appears on home screen.

## Data flow

All data is stored in Supabase. Changes on one device appear on all others within 1-2 seconds via real-time subscriptions.
