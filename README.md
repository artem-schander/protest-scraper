# 🪧 Protest Service API

**A collaborative open-source service to collect and share upcoming protests and demonstrations across Germany.**
Built with **Node.js**, **Express**, and **Prisma**, backed by **PostgreSQL**, and designed to support both **automatic scraping** and **manual user submissions** via JWT-secured REST API.

> **⚠️ Work in Progress**
> This project is under active development. The scraper component is functional, but the API/database infrastructure is not yet implemented. See the [Roadmap](#-roadmap--progress) for current status.

---

## 🚀 Features

- **Automated scraping** of official protest data from Berlin Police
- Public REST API for upcoming protests (filter by city or date range)
- JWT-based authentication for registered users
- Role system (`USER`, `MODERATOR`, `ADMIN`)
- Admin & Moderator routes for verifying, editing, or deleting entries
- Integration-ready with automated scrapers (import endpoint)
- Dockerized setup with PostgreSQL & Prisma ORM
- Comprehensive test suite with Vitest

---

## 🧩 Tech Stack

| Component | Tool |
|------------|------|
| Backend | Node.js (Express) |
| ORM | Prisma |
| Database | PostgreSQL |
| Auth | JWT (JSON Web Token) |
| Deployment | Docker + Docker Compose |

---

## 🧰 Setup

### Prerequisites
- Node.js ≥ 18
- Docker & Docker Compose

### Installation

```bash
git clone https://github.com/YOUR_USERNAME/protest-service.git
cd protest-service
cp .env.example .env
docker compose up -d
npx prisma migrate dev --name init
```

### Running in Dev Mode

```bash
npm run dev
```

### Running the Scraper

```bash
npm run scrape                    # Scrape protests (default: next 40 days)
npm run scrape -- --days 30       # Scrape protests for next 30 days
```

Output files:
- `protests.json` - JSON format
- `protests.csv` - CSV format
- `protests.ics` - iCalendar format

**Scraper Documentation:** See [Scraper Usage Guide](#-scraper-standalone-usage) below for detailed options.

### Running Tests

```bash
npm test                          # Run tests once
npm run test:watch               # Run tests in watch mode
```

### Running in Production

```bash
docker compose up -d --build
```

---

## 📚 API Overview

| Method | Endpoint | Auth | Description |
|--------|-----------|------|-------------|
| `POST` | `/api/auth/register` | - | Register new user |
| `POST` | `/api/auth/login` | - | Obtain JWT token |
| `GET` | `/api/protests` | Optional | List protests (filter by `?city=Berlin&days=40`) |
| `POST` | `/api/protests` | ✅ | Add new protest |
| `PUT` | `/api/protests/:id` | MODERATOR / ADMIN | Edit protest |
| `DELETE` | `/api/protests/:id` | ADMIN | Delete protest |

---

## 🔑 Roles & Permissions

| Role | Can Add | Can Edit | Can Delete | Auto-Verified |
|------|----------|-----------|-------------|---------------|
| USER | ✅ | ❌ | ❌ | ❌ |
| MODERATOR | ✅ | ✅ | ❌ | ✅ |
| ADMIN | ✅ | ✅ | ✅ | ✅ |

---

## 🔧 Scraper Standalone Usage

The protest scraper can be used as a standalone command-line tool without the API/database infrastructure.

### Prerequisites

```bash
yarn install
yarn build
```

### Command Line Options

```bash
node dist/scraper/scrape-protests.js [options]

Options:
  --days <n>      Days forward to scrape (default: 40)
  --out <csv>     CSV output file (default: protests.csv)
  --json <json>   JSON output file (default: protests.json)
  --ics <ics>     iCalendar output file (default: protests.ics)
```

### Usage Examples

```bash
# Basic usage (next 40 days, default filenames)
node dist/scraper/scrape-protests.js

# Custom date range
node dist/scraper/scrape-protests.js --days 90

# Custom output files
node dist/scraper/scrape-protests.js \
  --days 30 \
  --out demo-data.csv \
  --json demo-data.json \
  --ics demo-data.ics
```

### Data Sources

The scraper automatically collects protest/demonstration data from:

- **Berlin Police** (Versammlungsbehörde) - Official assembly registrations
- **Dresden City** (Versammlungsübersicht) - Official assembly list
- **Friedenskooperative** - Peace movement actions
- **DemokraTEAM** - Anti-fascist & democracy events (filtered for demos/protests only)

### Output Format

#### JSON Structure
```json
{
  "source": "DemokraTEAM",
  "city": "Berlin",
  "title": "Demo für Demokratie",
  "start": "2025-10-15T14:00:00.000Z",
  "end": null,
  "location": "Berlin, Brandenburger Tor",
  "url": "https://www.demokrateam.org/aktionen/...",
  "attendees": 5000
}
```

#### CSV Format
```csv
source,city,title,start,end,location,url,attendees
"DemokraTEAM","Berlin","Demo für Demokratie","2025-10-15T14:00:00.000Z","","Berlin, Brandenburger Tor","https://...",5000
```

#### ICS Format
Standard iCalendar format compatible with Google Calendar, Apple Calendar, Outlook, etc.

### Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `source` | string | Data source name |
| `city` | string \| null | City where event takes place |
| `title` | string | Event title/theme |
| `start` | ISO 8601 string \| null | Event start date/time (UTC) |
| `end` | ISO 8601 string \| null | Event end date/time (UTC) |
| `location` | string \| null | Full location description |
| `url` | string | Source URL for event details |
| `attendees` | number \| null | Expected/announced number of attendees |

### Error Handling

The scraper includes:
- Automatic retry with delays to respect rate limits
- Individual source error handling (one source failure won't stop others)
- Detailed error logging to stderr
- Final result count logged to stdout as JSON

---

## 🗺️ Roadmap & Progress

### ✅ Completed Features

#### Scraper Core
- [x] Berlin Police scraper (table parsing with date/time extraction)
- [x] Dresden City scraper (JSON API integration)
- [x] Friedenskooperative scraper (event box parsing)
- [x] DemokraTEAM scraper (hybrid POST API + HTML parsing with label filtering)
- [x] German date parser (supports multiple formats: DD.MM.YYYY, DD.MM HH:mm, etc.)
- [x] Attendee number extraction from German text patterns
- [x] Duplicate detection and removal
- [x] Date range filtering
- [x] CSV export
- [x] JSON export
- [x] ICS (iCalendar) export
- [x] Comprehensive test suite (date parsing, deduplication, filtering)

#### Data Model
- [x] Source tracking
- [x] City extraction and normalization
- [x] Location details
- [x] Start/end time support
- [x] Event URLs
- [x] Optional attendee count field

### 🚧 In Progress / Planned Features

#### Scraper Enhancements
- [ ] Köln Police scraper (requires official police source URL)
- [ ] Hamburg scraper integration
- [ ] Munich scraper integration
- [ ] Additional regional sources

#### API & Database (Not Yet Implemented)
- [ ] PostgreSQL database schema
- [ ] Prisma ORM integration
- [ ] Express REST API
- [ ] JWT authentication
- [ ] User registration endpoint
- [ ] Login endpoint
- [ ] Public protest listing endpoint
- [ ] Protected protest creation endpoint
- [ ] Moderator edit endpoint
- [ ] Admin delete endpoint
- [ ] Manual verification workflow for USER submissions
- [ ] Auto-verification for MODERATOR/ADMIN submissions

#### Deployment & DevOps
- [ ] Docker Compose setup
- [ ] Production Dockerfile
- [ ] Environment configuration (.env.example)
- [ ] CI/CD pipeline
- [ ] Automated scraper schedule (cron job)

#### Documentation & Quality
- [x] README with usage instructions
- [x] Scraper standalone documentation
- [x] Roadmap checklist
- [ ] API endpoint documentation
- [ ] Authentication flow documentation
- [ ] Contributing guidelines
- [ ] Code of conduct

### 📋 Feature Priority

**High Priority:**
1. Complete API implementation (endpoints, auth, database)
2. Docker containerization
3. Automated scraping schedule
4. API documentation

**Medium Priority:**
1. Additional scraper sources (Hamburg, Munich, etc.)
2. Webhook/notification system for new protests
3. Search and advanced filtering
4. Event categorization/tagging

**Low Priority:**
1. Frontend dashboard
2. Admin panel UI
3. Email notifications
4. Mobile app API

---

## 🤝 Contributing

Pull requests are welcome!
Please open an issue first to discuss significant changes.

For scraper contributions:
- Add new sources to `src/scraper/scrape-protests.ts`
- Follow existing parser patterns
- Include tests for date parsing edge cases
- Update this README's roadmap

---

## 📄 License

AGPL-3.0 License © 2025 Artem Schander
