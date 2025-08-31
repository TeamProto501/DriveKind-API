# Express.js on Vercel

Simple Express.js + Vercel example that uses Vercel Postgres to add and display users in a table.

## How to Use

BE sure to create a Vercel Postgres database and add you environment variables to your `.env` file. You can find an example of the `.env` file in the `.env.example` file.

You can choose from one of the following two methods to use this repository:

### One-Click Deploy

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=vercel-examples):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/examples/tree/main/solutions/express&project-name=express&repository-name=express)

### Clone and Deploy

```bash
git clone https://github.com/vercel/examples/tree/main/solutions/express
```

Install the Vercel CLI:

```bash
npm i -g vercel
```

Then run the app at the root of the repository:

```bash
vercel dev
```

## Public Treatment Plan Sharing

This API includes functionality for securely sharing treatment plans publicly via UUID-based links.

### Features

- **Secure UUID Links**: Generate unique, unguessable links for treatment plans
- **Access Control**: Only authenticated users can generate links for their organization's treatment plans
- **Public Access**: Generated links can be accessed without authentication
- **Link Management**: Deactivate links or set expiration times
- **Audit Trail**: Track who created links and when

### API Endpoints

#### Generate Public Link (Authenticated)
```
POST /treatment-plans/:id/generate-public-link
Authorization: Bearer <token>

Optional Body:
{
  "expires_in_hours": 24
}

Response:
{
  "message": "Public treatment plan link created successfully",
  "data": {
    "uuid": "550e8400-e29b-41d4-a716-446655440000",
    "link": "public/treatment-plan/550e8400-e29b-41d4-a716-446655440000",
    "treatment_plan_id": 123,
    "created_at": "2024-01-01T12:00:00Z",
    "expires_at": "2024-01-02T12:00:00Z",
    "is_active": true
  }
}
```

#### Access Public Treatment Plan (No Authentication)
```
GET /public/treatment-plan/:uuid

Response:
{
  "message": "Public treatment plan retrieved successfully",
  "data": {
    "treatment_plan": { ... },
    "organization": {
      "name": "Smile Design Manhattan",
      "code": "SDM"
    },
    "shared_at": "2024-01-01T12:00:00Z",
    "expires_at": "2024-01-02T12:00:00Z"
  }
}
```

#### Management Routes (Authenticated)
- `PUT /public-links/:uuid/deactivate` - Deactivate a public link
- `GET /treatment-plans/:id/public-links` - List all public links for a treatment plan

### Security

- UUIDs are cryptographically secure (128-bit entropy)
- Links can be deactivated or expired
- Only treatment plan owners can generate links
- Service role access is used safely for public data retrieval
- Row-level security policies protect organizational data