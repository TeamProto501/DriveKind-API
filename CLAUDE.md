# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.
   
## Development Commands
- **Start development server**: `npm start` - Runs the Express.js server on port 3000
- **Local development**: `vercel dev` - Runs with Vercel CLI for testing deployment environment
- **Tests**: No test framework currently configured (package.json shows placeholder test script)

## Project Architecture

This is a **Smile Design Manhattan API** built with Express.js and deployed on Vercel. The application manages dental practice data including clients, providers, billables, visits, and user authentication.

### Core Components

- **`api/index.ts`** - Main Express application with all REST API routes
- **`api/database.js`** - Supabase database operations layer with CRUD functions for all entities
- **`api/business.js`** - Business logic utilities (currently password hashing/verification)
- **`components/`** - Static HTML files for basic web interface
- **`vercel.json`** - Routes all requests to `/api` endpoint

### Database Architecture

Uses **Supabase** as the database backend with these main entities:
- **clients** - Patient/client records (uses `clientid` as primary key)
- **providers** - Healthcare providers (uses `providerid` as primary key) 
- **billables** - Billing codes and procedures (uses `billablecode` as primary key)
- **visits** - Patient visits with details and images (uses `visitid` as primary key)
- **visitdetails** - Visit procedure details (linked to visits)
- **visitimages** - Visit-related images stored as base64 (linked to visits)
- **users** - Authentication users (uses `userid` as primary key)

### Key Patterns

- **Database Layer**: All database operations go through `database.js` functions that use Supabase client
- **Error Handling**: Uses try/catch with standardized JSON error responses
- **CORS**: Configured to allow all origins with credentials
- **Authentication**: Basic password hashing with salt, placeholder JWT tokens
- **File Structure**: Mixed JavaScript (.js) and TypeScript (.ts) files
- **Case Sensitivity**: Database uses lowercase column names (`clientid`, `visitid`, etc.)

### Environment Variables Required

- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_KEY` - Supabase anon/service key

### API Endpoints

- `/register`, `/login` - User authentication
- `/users` - User management
- `/clients/*` - Client CRUD operations
- `/providers/*` - Provider CRUD operations  
- `/billables/*` - Billable code CRUD operations
- `/visits/*` - Visit CRUD operations with details and images
- `/images/:id` - Image retrieval (placeholder implementation)

### Important Notes

- Visit creation handles complex nested data (visit + details + images in single transaction)
- Image data is stored as base64 in database
- Database operations use lowercase property names for consistency
- No TypeScript compilation step - files run directly with Node.js
- Password verification uses PBKDF2 with 1000 iterations