# Sulie Labs — Railway build

This is your ORIGINAL site (same design, products, images, pages).
The only changes: the three Netlify functions are now real Express
routes inside `server.js`, and the admin no longer needs a login.

## What changed vs. the Netlify version
- Removed: `netlify/` folder, `netlify.toml`, `admin/config.yml`, Netlify Identity/Decap CMS login.
- Added: `server.js` (Express) + `package.json`.
- Frontend now calls `/api/create-invoice`, `/api/verify-invoice`, `/api/get-orders`
  instead of `/.netlify/functions/...`. (Same behavior, just different address.)

## Deploy on Railway
1. Put ALL these files in a GitHub repo (keep the folder structure exactly).
2. Railway → New Project → Deploy from GitHub repo → pick the repo.
3. Railway auto-detects Node, runs `npm install`, then `npm start`.
4. Open the generated URL. `/` is the store, `/admin` is the dashboard,
   `/admin/orders.html` is the paid-orders list.

## Environment variables (Railway → Variables)
Payment will NOT work until these are set AND your Paylink account is active:

    PAYLINK_API_ID            (from my.paylink.sa)
    PAYLINK_SECRET_KEY        (from my.paylink.sa)
    PAYLINK_BASE_URL          https://restpilot.paylink.sa   (testing)
                              https://restapi.paylink.sa     (live)
    SITE_URL                  your Railway URL, no trailing slash

Optional (order logging + confirmation email — safe to add later):

    ORDERS_SHEET_WEBHOOK_URL  Google Apps Script web-app URL
    ORDERS_SHEET_API_KEY      shared secret used in that script
    RESEND_API_KEY            from resend.com
    RESEND_FROM_EMAIL         e.g. "Sulie Labs <onboarding@resend.dev>"

The site, product pages, and admin all work WITHOUT these — only the
Paylink checkout and order-logging need them.

## Known dependency
`server.js` uses the built-in `fetch`, which needs Node 18+. `package.json`
pins `"node": ">=18"`, so Railway will use a compatible version.
