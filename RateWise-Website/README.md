# RateWise — Product Review Website

A responsive product-review platform with a Node.js/Express API and SQLite database.

## Features
- Product catalogue with photos, descriptions, INR prices, average ratings and review counts
- Search, category and minimum-rating filters
- Account registration and sign-in
- One review per customer per product; 1–5 star rating
- Review validation (10–1,000 characters)
- Edit/delete own reviews
- Admin moderation: approve, pending, hide or permanently delete
- Sort approved reviews by newest, oldest, highest or lowest rating
- Mobile-friendly interface

## Run locally
1. Install Node.js 18 or newer.
2. In this folder run `npm install`.
3. Set environment variables (recommended):
   - `JWT_SECRET`: a long random secret
   - `ADMIN_EMAIL`: administrator email
   - `ADMIN_PASSWORD`: strong administrator password
4. Run `npm start`.
5. Open `http://localhost:3000`.

For a quick local demo only, the default admin login is:
- Email: `admin@ratewise.local`
- Password: `ChangeMe123!`

**Change these defaults before publishing.** Set a unique `JWT_SECRET` and strong admin credentials.

## Deploy on Render
1. Upload this project to a GitHub repository.
2. In Render, create a **Web Service** and connect that repository.
3. Build command: `npm install`
4. Start command: `npm start`
5. Add environment variables `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`.
6. Add a persistent disk and set `DB_PATH` to a file path on that disk, e.g. `/var/data/ratewise.db`.
7. Deploy. Open the Render URL.

SQLite needs persistent storage on a hosted service. Without a persistent disk, data may be lost when the service restarts or redeploys.

## Notes
- This is a starter project. Before a public production launch, add email verification, password reset, rate limiting, CSRF protections, image hosting/product management, backups and a privacy policy.
- The seeded catalogue uses public Unsplash image URLs; replace them with images you have permission to use.
- Average ratings and review counts include approved reviews only. New reviews are approved by default; admins can change their moderation status.
