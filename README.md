# MediCare+

Healthcare coordination for patients and clinicians: appointments, time-limited consultation access, digital prescriptions, automatic medication schedules, reminders, and medical history.

The product plan is unchanged. This repository is the implementation of that plan.

## Pages

- `index.html` — landing
- Patient: login, register, dashboard, appointments, book-appointment, prescriptions, medications, medical-history, notifications, profile, settings
- Doctor: login, register, dashboard, appointments, consultation, prescriptions, profile
- `doctors/index.html` — verified directory
- `how-it-works.html`, `security.html`, `privacy.html`, `terms.html`
- Admin (operations, not a public sitemap page): `admin/login.html`, `admin/dashboard.html`

## Architecture

The browser never talks to PostgreSQL. HTML/JS is the client. All data and permissions go through REST endpoints under `/api`, mounted from `server/routes/index.js`.

| Need | How it is implemented |
| --- | --- |
| Frontend/backend split | Static pages + `fetch('/api/...')`. No medical authorization in the browser. |
| Database | PostgreSQL with the planned entities, FKs, indexes, and appointment overlap exclusion. |
| Authentication | Email/password, bcrypt, httpOnly JWT cookie, email verify and reset. |
| RBAC | `role` stored on `users` and checked with `requireRole` on every protected route. |
| Patient | Own profile, bookings, prescriptions, schedules, history, notifications. |
| Doctor | Own appointments, time-window patient summary, issue prescriptions. Cannot self-verify. |
| Admin | Provisioned only (no public register). Verify/reject doctors, deactivate users, view audit stats. Cannot open patient charts through a patient-id URL. |
| Prescription → schedule | Transaction in `prescriptionController.js` writes Rx, medicines, dose rows, notification. |
| Reminders | Vercel cron `GET/POST /api/jobs/reminders` (not `setInterval`). Batched with `SKIP LOCKED`. |
| Security | Helmet, CORS, CSRF origin check, rate limits, parameterized SQL, secrets not returned. |
| Audit | `audit_logs` for login, booking, history view, consult start, Rx, meds taken, admin verify. |
| Scale | Pagination, extra indexes (`002_scale.sql`), pooled connections, reminder batching, public directory short cache. |

## Workflow

Patient registration/login → find doctor → view profile → book appointment → doctor receives appointment → appointment begins → backend authorization → temporary patient access → consultation → digital prescription → automatic delivery → medication schedule → reminder → mark taken → medical history updated.

Doctors never send prescriptions manually. Access to patient information is allowed only when all of the following are true on the **server**:

1. Authenticated
2. Role is doctor
3. Doctor owns the appointment
4. Appointment belongs to the patient
5. Appointment is valid
6. Server time ≥ start
7. Server time < end

Frontend clocks, `localStorage`, hidden fields, and URL parameters are not used for authorization.

## Local development

Local PostgreSQL is expected on `DATABASE_URL` (Docker Compose is included). If Docker is not installed, install PostgreSQL 16 or use a hosted instance such as Neon, then run migrate and seed.

```bash
docker compose up -d
cp .env.example .env
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Open http://localhost:3000

Demo accounts (from seed):

- Patient: `patient@medicare.local` / `DemoPass123!`
- Doctor: `doctor@medicare.local` / `DemoPass123!`
- Admin: `admin@medicare.local` / `DemoPass123!` (sign in at `/admin/login.html`)

The seed creates a **live consultation window** for the demo doctor so the 3-minute walkthrough can show authorization without waiting.

## Environment

See `.env.example`. Never put secrets in client JavaScript.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | HttpOnly session token signing |
| `SESSION_SECRET` | Reserved for cookie signing if enabled |
| `CRON_SECRET` | Protects `/api/jobs/reminders` |
| `CLIENT_URL` | CORS / CSRF origin |
| `EMAIL_*` | Optional SMTP. If unset, messages are logged in development |

## Vercel deployment

1. Push this repository to GitHub.
2. Import the project in Vercel (Node.js).
3. Attach a hosted PostgreSQL database (Neon, Supabase, or Vercel Postgres).
4. Set environment variables from `.env.example` (`COOKIE_SECURE` should be `true`, `CLIENT_URL` the production origin, `NODE_ENV=production`).
5. Run migrations against production (`DATABASE_URL=... npm run db:migrate`) and optionally `npm run db:seed` for a demo.
6. Vercel Cron is declared in `vercel.json` (`/api/jobs/reminders` every 5 minutes). Set `CRON_SECRET`; Vercel sends it as `Authorization: Bearer`.
7. Confirm `/api/health` and sign-in on the production URL before calling the deployment complete.

The API is a single Express app exported from `api/index.js`. Static pages remain at the repository root.

## Sustainability and performance

- System font stack (no third-party font CDN).
- Paginated list APIs; dashboard overview endpoints batch queries.
- Public doctor directory cached for 30 seconds; private APIs use `no-store`.
- Medication reminders are server-scheduled, not `setInterval` in the browser.
- Duplicate reminders are prevented with a unique notification index and `reminder_sent_at`.
- Appointment overlap is blocked by a PostgreSQL exclusion constraint, not only the UI.
- Indexes on foreign keys, status, and time columns.
- Static CSS/JS cache headers on Vercel.

## Security

- bcrypt password hashes, httpOnly JWT cookies, Helmet CSP, rate limits, CORS, origin checks on mutations.
- Parameterized SQL via `pg`.
- Role-specific registration endpoints; users cannot change `role` from the client.
- Patient history for clinicians is `GET /api/appointments/:id/patient-summary` inside the access window — not a public `/api/patients/:id/history`.
- Friendly errors; no SQL/stack traces to the client.
- Audit log for login, logout, booking, history view, consultation start, prescriptions, and marking medication taken.

## Diagrams

- `docs/medicare-flowchart.png` — sitemap and care workflow
- `docs/medicare-database-diagram.png` — relational model

## 3-minute demonstration

1. Landing page
2. Patient sign-in
3. Find doctor / book (or use the seeded live appointment)
4. Doctor sign-in
5. Open the live appointment — show “Patient information available.”
6. Start consultation, save notes, issue a prescription
7. Patient prescriptions, medications, medical history
