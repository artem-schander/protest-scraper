# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A collaborative open-source REST API service for collecting and sharing upcoming protests and demonstrations across Germany. The service supports both automated scraping integration and manual user submissions via JWT-secured endpoints.

**Tech Stack:**
- Backend: Node.js with Express
- Database: MongoDB (native driver, no ORM)
- Authentication: JWT (JSON Web Token)
- Deployment: Docker + Docker Compose

## Commands

### Development Setup
```bash
# First time setup
cp .env.example .env                    # Create environment file
docker compose up -d                    # Start MongoDB
npm install                             # Install dependencies
npm run dev                             # Start development server
```

### Database Management
MongoDB uses the native driver without migrations. Database indexes are automatically created on application startup via `src/db/connection.ts`.

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

### Data Model

MongoDB collections with TypeScript interfaces defined in `src/types/`:

**Users Collection:**
- email (unique), password (hashed), role (USER/MODERATOR/ADMIN)
- Indexes: email (unique)

**Protests Collection:**
- source, city, title, start, end, location, url, attendees, verified, createdBy
- Indexes: city, start, verified, city+start composite, 2dsphere geospatial
- Protests submitted by USER role require `verified: false` by default
- Protests submitted by MODERATOR/ADMIN should be auto-verified (`verified: true`)

### Integration Points

The service is designed to accept automated scraper imports via the protest creation endpoint. Scraper services should use a service account with MODERATOR role for auto-verified submissions.

## Development Guidelines

- MongoDB native driver is used without ORM for simplicity and performance
- Database indexes are created automatically on startup via `connectToDatabase()`
- JWT secret must be stored in `.env` file (never commit)
- Passwords are hashed using bcrypt before storage
- Query filters on `/api/protests` endpoint support city filtering and date range (days parameter)
- All timestamps are stored in UTC as Date objects
- TypeScript interfaces in `src/types/` define data models without runtime validation