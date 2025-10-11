# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A collaborative open-source REST API service for collecting and sharing upcoming protests and demonstrations across Germany. The service supports both automated scraping integration and manual user submissions via JWT-secured endpoints.

**Tech Stack:**
- Backend: Node.js with Express
- Database: PostgreSQL
- ORM: Prisma
- Authentication: JWT (JSON Web Token)
- Deployment: Docker + Docker Compose

## Commands

### Development Setup
```bash
# First time setup
docker compose up -d                    # Start PostgreSQL
npx prisma migrate dev --name <name>    # Run database migrations
npm run dev                             # Start development server
```

### Database Management
```bash
npx prisma migrate dev --name <name>    # Create and apply new migration
npx prisma migrate deploy               # Apply migrations in production
npx prisma generate                     # Regenerate Prisma Client after schema changes
npx prisma studio                       # Open Prisma Studio GUI for database inspection
```

### Production
```bash
docker compose up -d --build            # Build and start all services in production mode
```

## Architecture

### Authentication & Authorization

The service implements a three-tier role-based access control system:

- **USER**: Can add protests (require manual verification before appearing publicly)
- **MODERATOR**: Can add protests (auto-verified) + edit existing protests
- **ADMIN**: Full permissions (add, edit, delete)

JWT tokens are used for authentication. The auth flow involves:
1. User registration via `/api/auth/register`
2. Login via `/api/auth/login` returns JWT token
3. Protected endpoints require JWT in Authorization header

### API Structure

**Public Endpoints:**
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login (returns JWT)
- `GET /api/protests` - List protests with optional filters (`?city=Berlin&days=40`)

**Protected Endpoints:**
- `POST /api/protests` - Add new protest (requires JWT, any authenticated user)
- `PUT /api/protests/:id` - Edit protest (MODERATOR or ADMIN only)
- `DELETE /api/protests/:id` - Delete protest (ADMIN only)

### Data Model Considerations

The Prisma schema should include:
- **User**: email, password (hashed), role (USER/MODERATOR/ADMIN)
- **Protest**: title, description, city, date, location, verified status, timestamps
- Protests submitted by USER role require `verified: false` by default
- Protests submitted by MODERATOR/ADMIN should be auto-verified (`verified: true`)

### Integration Points

The service is designed to accept automated scraper imports via the protest creation endpoint. Scraper services should use a service account with MODERATOR role for auto-verified submissions.

## Development Guidelines

- Use Prisma migrations for all database schema changes (never modify the database directly)
- JWT secret should be stored in `.env` file (never commit)
- Implement proper password hashing (bcrypt recommended)
- Query filters on `/api/protests` endpoint should support both city filtering and date range (days parameter)
- All timestamps should be stored in UTC
- protest scraper: no errors but also no protests
- demokrateam wip