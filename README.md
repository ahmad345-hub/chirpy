# Chirpy

Chirpy is a backend REST API built with TypeScript, Express, and PostgreSQL.

The project provides user authentication and a simple social platform where users can create, view, filter, sort, and delete chirps.

## Features

- User registration and login
- Password hashing with Argon2
- JWT authentication
- Refresh tokens
- Create and retrieve chirps
- Filter chirps by author
- Sort chirps by creation date
- Delete chirps with authorization
- Chirpy Red membership
- Webhook handling
- API key authentication for webhooks
- PostgreSQL database
- Database migrations with Drizzle ORM

## Tech Stack

- TypeScript
- Node.js
- Express
- PostgreSQL
- Drizzle ORM
- JWT
- Argon2
- Vitest

## Setup

Clone the repository:

```bash
git clone https://github.com/ahmad345-hub/chirpy.git
cd chirpy


Install dependencies:
npm install

Create a .env file:
DB_URL="your_database_url"
PORT=8080
PLATFORM="dev"
JWT_SECRET="your_jwt_secret"
POLKA_KEY="your_polka_key"

Run the server:
npm run dev

The server will be available at:
http://localhost:8080

Tests
Run the tests with:
npm test
