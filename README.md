# ICONIC SHIPPING SERVICES

```
iconic-shipping/
├── backend/    Node.js + Express + PostgreSQL (API, login, enquiries, quotes, PDF)
├── frontend/   HTML/CSS/JS (website, login, customer portal, admin)
├── Dockerfile
└── render.yaml
```

## Local run
1. Node 20+ aur PostgreSQL install karo
2. `cd backend && cp .env.example .env` (DATABASE_URL, JWT_SECRET 32+ chars, SMTP, ADMIN_EMAIL/ADMIN_PASSWORD bharo)
3. `npm install`
4. `npm run db:init`
5. `npm run admin:create`
6. `npm start` -> http://localhost:3000

Backend `../frontend` folder ko khud serve karta hai, isliye ek hi service deploy karni hai (recommended).

## Frontend alag host karna ho (optional)
- `frontend/config.js` mein `window.API_BASE = "https://api.yourdomain.com"`
- backend `.env` mein `CORS_ORIGIN=https://www.yourdomain.com`
- Dono HTTPS par hone chahiye. Alag domains par cookies kuch browsers mein block ho sakti hain, isliye same domain behtar hai.

## Deploy (Render)
Repo root se Docker service banao, env variables `.env.example` se daalo, phir `npm run db:init` aur `npm run admin:create` ek baar chalao. Poora checklist: DEPLOYMENT_CHECKLIST.md

## Email (Brevo, free)
Render free plan outbound SMTP block karta hai, isliye default **Brevo HTTP API** hai (`BREVO_API_KEY`). Key na ho aur `SMTP_HOST` ho to SMTP fallback chalta hai.

Setup: Brevo free account > Senders mein apna sender email verify karo > SMTP & API > API Keys se key banao > Render env mein `BREVO_API_KEY`, `MAIL_FROM` (verified email), `NOTIFY_EMAIL` daalo.

Emails: welcome, naya enquiry (admin + customer confirmation), status change, quotation ready.
Start par log mein `[mail] Brevo API ready` dikhna chahiye. Test: admin login karke `POST /api/admin/test-email` (body `{"to":"you@example.com"}`).

## Password reset
Login page par "Forgot password?" > email par 1 ghante ka one-time link. Naya table `password_resets` hai, isliye deploy ke baad **`npm run db:init` dobara chalao** (safe hai, data nahi mitta). Render env mein `APP_URL` = apna site URL set karo.

Quotation email ke saath PDF ab attach hota hai.
