# Employee Timesheet Tracking App

Full-stack timesheet application built with React + Vite (Tailwind CSS), Node.js + Express, and PostgreSQL.

---

## Project structure

```
timesheetapp/
├── client/          # React + Vite frontend
│   └── src/
│       ├── api/         # Axios instance + auto-refresh interceptor
│       ├── context/     # AuthContext (JWT state)
│       ├── components/  # Layout, Navbar, ProtectedRoute
│       └── pages/
│           ├── Login.jsx
│           ├── employee/  Timesheet.jsx, History.jsx
│           └── admin/     Dashboard.jsx, Timesheets.jsx, Employees.jsx
└── server/          # Express backend
    ├── db/
    │   ├── pool.js      # pg Pool singleton
    │   ├── schema.sql   # CREATE TABLE statements
    │   └── seed.js      # Admin + 3 employee seed
    ├── middleware/      # auth.js, errorHandler.js
    ├── routes/          # auth.js, timesheets.js, admin.js
    └── services/
        └── email.js     # Resend integration
```

---

## Local development

### Prerequisites

- Node.js 18+
- PostgreSQL 14+ running locally (or use a cloud DB)

### 1 — Clone and install

```bash
# Server
cd server
npm install

# Client
cd ../client
npm install
```

### 2 — Configure environment variables

**server/.env** (copy from `.env.example`):

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/timesheetdb
JWT_SECRET=some-long-random-secret
JWT_REFRESH_SECRET=another-long-random-secret
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
FROM_EMAIL=onboarding@resend.dev
CLIENT_URL=http://localhost:5173
PORT=3001
NODE_ENV=development
```

**client/.env** — leave blank in development (Vite proxy handles `/api` → `localhost:3001`):

```env
VITE_API_URL=
```

### 3 — Create database and run schema

```bash
createdb timesheetdb
psql timesheetdb < server/db/schema.sql
```

### 4 — Seed demo users

```bash
cd server
npm run seed
```

Credentials after seed:

| Role     | Email                 | Password     |
|----------|-----------------------|--------------|
| Admin    | admin@company.com     | admin123     |
| Employee | alice@company.com     | employee123  |
| Employee | bob@company.com       | employee123  |
| Employee | carol@company.com     | employee123  |

### 5 — Start servers

```bash
# Terminal 1 — backend
cd server
npm run dev    # nodemon, port 3001

# Terminal 2 — frontend
cd client
npm run dev    # Vite, port 5173
```

Open http://localhost:5173

---

## Deployment

### Render (backend + PostgreSQL)

1. **Create a PostgreSQL instance** on Render (free tier).  
   Copy the **Internal Database URL** — you'll need it.

2. **Create a Web Service** pointing to the `server/` directory.
   - Build command: `npm install`
   - Start command: `npm start`
   - Set environment variables:

   | Key                  | Value                                       |
   |----------------------|---------------------------------------------|
   | `DATABASE_URL`       | Render internal DB URL                      |
   | `JWT_SECRET`         | random 32+ char string                      |
   | `JWT_REFRESH_SECRET` | different random 32+ char string            |
   | `RESEND_API_KEY`     | from Resend dashboard                       |
   | `FROM_EMAIL`         | verified sender (or `onboarding@resend.dev`)|
   | `CLIENT_URL`         | your Vercel frontend URL (set after step 3) |
   | `NODE_ENV`           | `production`                                |

3. After deploy, run the seed once via Render **Shell**:
   ```bash
   node db/seed.js
   ```

### Vercel (frontend)

1. Import the repo and set **Root Directory** to `client`.
2. Framework preset: **Vite**.
3. Set environment variable:

   | Key            | Value                               |
   |----------------|-------------------------------------|
   | `VITE_API_URL` | `https://your-app.onrender.com/api` |

4. Deploy. Then update `CLIENT_URL` on Render to the Vercel URL.

### Resend (email)

1. Create a free account at https://resend.com
2. For testing without a custom domain, use `from: onboarding@resend.dev` — emails are delivered only to your Resend account's verified address.
3. To send to real addresses, add and verify your domain in the Resend dashboard and update `FROM_EMAIL` accordingly.

---

## API reference

| Method | Path                                    | Auth         | Description                           |
|--------|-----------------------------------------|--------------|---------------------------------------|
| POST   | `/api/auth/login`                       | —            | Login, returns tokens + user          |
| POST   | `/api/auth/refresh`                     | —            | Refresh access token                  |
| POST   | `/api/auth/logout`                      | Bearer       | Logout (client clears tokens)         |
| GET    | `/api/timesheets/my`                    | Employee     | All own timesheets                    |
| GET    | `/api/timesheets/my/:weekStart`         | Employee     | Get/create timesheet for a week       |
| PUT    | `/api/timesheets/:id`                   | Employee     | Save draft (entries + notes)          |
| POST   | `/api/timesheets/:id/submit`            | Employee     | Submit for approval                   |
| GET    | `/api/admin/timesheets`                 | Admin        | All timesheets, optional `?status=`   |
| GET    | `/api/admin/timesheets/:id`             | Admin        | Single timesheet detail               |
| POST   | `/api/admin/timesheets/:id/approve`     | Admin        | Approve                               |
| POST   | `/api/admin/timesheets/:id/reject`      | Admin        | Reject with optional note             |
| GET    | `/api/admin/employees`                  | Admin        | All employees with submission stats   |

---

## Security notes

- Passwords hashed with bcrypt (cost 10).
- Access tokens expire in **15 minutes**; refresh tokens in **7 days**.
- All routes except `/api/auth/login` and `/api/auth/refresh` require a valid Bearer token.
- Admin-only routes additionally enforce `role = 'admin'`.
- CORS restricted to `CLIENT_URL` — set this to your exact frontend origin in production.
- `week_start_date` is always normalized to the Monday of the given week.
