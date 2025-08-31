# DriveKind API

Simple Express API with a users endpoint, built for Vercel serverless deployment.

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

3. For local development:
```bash
npm run dev
# or
vercel dev
```

4. For deployment to Vercel:
```bash
vercel --prod
```

## API Endpoints

- `GET /` - API info (public)
- `GET /users` - Get all users from the Supabase users table (requires JWT authentication)

## Authentication

This API uses JWT authentication with Supabase. Protected endpoints require:
1. `Authorization: Bearer <jwt_token>` header
2. Valid user profile in the `profiles` table
3. User must be assigned to an organization

## Database Schema

This API expects the following Supabase tables:

**users table:**
- `id` (primary key)
- `name` (text)
- `email` (text)  
- `created_at` (timestamp)

**profiles table:**
- `auth_user_id` (references Supabase auth users)
- `org_id` (organization ID)
- `first_name` (text)
- `last_name` (text)

The API uses Row Level Security (RLS) with user tokens for data access control.

## Project Structure

```
DriveKind-API/
├── api/
│   ├── index.js          # Main serverless function
│   └── database.js       # Database operations
├── vercel.json           # Vercel configuration
├── package.json          # Dependencies and scripts
├── .env.example          # Environment variables template
└── README.md
```

This structure follows Vercel's serverless function conventions where files in `/api` become serverless endpoints.