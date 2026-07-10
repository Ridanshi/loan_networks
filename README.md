# Loan Networks Admin Dashboard

Lightweight internal admin dashboard for exploring the PostgreSQL database structure and key operational tables.

## Setup

1. Install dependencies:

   ```bash
   npm install
   npm install --prefix backend
   npm install --prefix frontend
   ```

2. Create `backend/.env`:

   ```env
   DATABASE_URL=postgres://user:password@host:5432/database
   PORT=4000
   ```

3. Generate the live database map:

   ```bash
   npm run analyze:db
   ```

4. Start both apps:

   ```bash
   npm run dev
   ```

Frontend: http://localhost:5173

Backend: http://localhost:4000

## Notes

- No mock schemas or seed data are included.
- API queries use the configured PostgreSQL database.
- If a requested display column is absent from the actual schema, the API omits that column instead of fabricating it.
