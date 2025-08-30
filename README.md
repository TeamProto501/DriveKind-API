# DriveKind API

Simple Express API with a users endpoint.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy environment file and configure Supabase:
```bash
cp .env.example .env
```
Edit `.env` and add your Supabase credentials:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_KEY` - Your Supabase anonymous key

3. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## API Endpoints

- `GET /` - API info
- `GET /users` - Get all users from the Supabase users table

## Database

This API connects to Supabase and expects a `users` table with the following structure:
- `id` (primary key)
- `name` (text)
- `email` (text)
- `created_at` (timestamp)

The server runs on port 3000 by default.