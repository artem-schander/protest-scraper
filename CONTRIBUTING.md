# Contributing to Protest Scraper

First off, thank you for considering contributing to Protest Scraper! It's people like you that make this project a valuable resource for activists and organizers.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [Pull Request Process](#pull-request-process)
- [Adding New Scrapers](#adding-new-scrapers)

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to the project maintainers.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates. When you create a bug report, include as many details as possible:

- **Use a clear and descriptive title**
- **Describe the exact steps to reproduce the problem**
- **Provide specific examples** (API requests, error messages, screenshots)
- **Describe the behavior you observed** and what you expected
- **Include your environment details** (Node.js version, OS, etc.)

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion:

- **Use a clear and descriptive title**
- **Provide a step-by-step description** of the suggested enhancement
- **Explain why this enhancement would be useful**
- **List any alternative solutions** you've considered

### Adding New Data Sources

We're always looking to expand coverage! If you know of an official protest registry:

1. Open an issue with the "New Data Source" template
2. Include the source URL and data format (HTML, JSON, RSS, etc.)
3. Check if the source allows automated scraping (robots.txt)
4. Mention if you're willing to implement the scraper yourself

### Your First Code Contribution

Unsure where to begin? Look for issues tagged with:

- `good first issue` - Simple issues perfect for newcomers
- `help wanted` - Issues where we need community help
- `documentation` - Improvements to docs and examples

## Development Setup

### Prerequisites

- Node.js ≥ 20.18.1
- Docker & Docker Compose (for MongoDB)
- Git

### Getting Started

1. **Fork and clone the repository:**
   ```bash
   git clone https://github.com/YOUR_USERNAME/protest-scraper.git
   cd protest-scraper
   ```

2. **Install dependencies:**
   ```bash
   yarn install
   ```

3. **Set up environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your MongoDB URI and JWT secret
   ```

4. **Start MongoDB:**
   ```bash
   docker compose up -d
   ```

5. **Run the development server:**
   ```bash
   yarn dev
   ```

6. **Run tests:**
   ```bash
   yarn test          # Unit + integration tests
   yarn test:watch    # Watch mode
   yarn coverage      # With coverage report
   ```

### Project Structure

```
src/
├── scraper/          # Data scraping & import logic
│   ├── sources/      # Scraper implementations by country
│   ├── utils/        # Parsing utilities (dates, attendees)
│   └── config/       # Locale configurations
├── routes/           # Express route handlers
├── middleware/       # Authentication & error handling
├── services/         # Email, WebSocket services
├── utils/            # Utilities (geocoding, filters, exports)
└── types/            # TypeScript interfaces

test/
├── unit/             # Pure logic tests (mocked dependencies)
├── integration/      # Tests with in-memory DB
└── e2e/              # Real external API calls
```

## Coding Standards

### General Guidelines

- **Use TypeScript** with strict mode enabled
- **Follow ESM module syntax** with `.js` extensions in imports
- **Use path aliases** (`@/` prefix) instead of relative imports
- **Write self-documenting code** with clear variable names
- **Add JSDoc comments** for exported functions

### Code Style

```typescript
// ✅ GOOD - Aliased imports with .js extension
import { parseDate } from '@/scraper/utils/date-parser.js';
import { Protest } from '@/types/protest.js';

// ❌ BAD - Relative imports
import { parseDate } from '../../scraper/utils/date-parser.js';

// ✅ GOOD - Descriptive function names
async function geocodeProtestLocation(address: string): Promise<GeoLocation> {
  // ...
}

// ❌ BAD - Unclear naming
async function getGeo(addr: string): Promise<any> {
  // ...
}
```

### Commit Messages

Follow the conventional commit format:

```
<type>(<scope>): <subject>

<body>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `test`: Adding or updating tests
- `refactor`: Code refactoring
- `chore`: Maintenance tasks

**Examples:**
```
feat(scraper): add Hamburg Police data source
fix(api): handle missing geoLocation in filter
docs(readme): update installation instructions
test(scraper): add unit tests for date parser
```

## Testing Guidelines

### Test Requirements

Every contribution must include appropriate tests:

1. **Unit Tests** - Required for all utilities and pure functions
2. **Integration Tests** - Required for API endpoints
3. **E2E Tests** - Required for new scrapers

### Writing Tests

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('Date Parser', () => {
  it('should parse German date format', () => {
    const locale = LOCALES['DE'];
    const result = parseDate('23. Oktober 2025', locale);

    expect(result).toBeDefined();
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(9); // October = 9
  });

  it('should detect time presence', () => {
    const locale = LOCALES['DE'];
    const result = parseDate('23. Oktober 2025 14:30', locale, true);

    expect(result.hasTime).toBe(true);
  });
});
```

### Test Coverage

- Aim for **80%+ code coverage** on new code
- **Critical paths** (auth, data import) should have 100% coverage
- Run `yarn coverage` to check coverage locally

### Testing Scrapers

Every new scraper **must have both**:

1. **Unit test** with mocked API response (`test/unit/scraper/sources/`)
2. **E2E test** calling real API (`test/e2e/scraper/sources/`)

Example:
```typescript
// test/unit/scraper/sources/germany/hamburg.test.ts
import MockAdapter from 'axios-mock-adapter';

describe('Hamburg Police Scraper', () => {
  it('should parse HTML table', async () => {
    const mock = new MockAdapter(axios);
    mock.onGet('https://example.com').reply(200, '<html>...</html>');

    const events = await parseHamburgPolice();
    expect(events).toHaveLength(3);
  });
});

// test/e2e/scraper/sources/germany/hamburg.e2e.test.ts
describe('Hamburg Police Scraper (E2E)', () => {
  it('should fetch and parse real data', async () => {
    const events = await parseHamburgPolice();
    expect(events.length).toBeGreaterThan(0);
  });
});
```

## Pull Request Process

### Before Submitting

1. **Update your fork:**
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Run all tests:**
   ```bash
   yarn test        # Must pass
   yarn coverage    # Check coverage
   yarn build       # Must compile
   ```

3. **Update documentation** if you changed:
   - API endpoints → Update README
   - Configuration → Update .env.example
   - Architecture → Update CLAUDE.md

### Submitting

1. **Push to your fork:**
   ```bash
   git push origin feature/your-feature-name
   ```

2. **Open a Pull Request** with:
   - Clear title describing the change
   - Reference to related issue (`Closes #123`)
   - Description of changes and motivation
   - Screenshots/examples if applicable
   - Checklist of completed items

3. **PR Template Checklist:**
   - [ ] Tests pass locally (`yarn test`)
   - [ ] Coverage maintained or improved
   - [ ] Documentation updated
   - [ ] No linting errors
   - [ ] Commit messages follow conventions
   - [ ] Branch is up-to-date with main

### Review Process

- **Automated checks** must pass (tests, coverage, build)
- **At least one maintainer** must approve
- **Changes requested?** Push additional commits (don't force-push)
- **Approved?** Maintainer will merge using squash-and-merge

## Adding New Scrapers

### Step-by-Step Guide

1. **Check robots.txt compliance:**
   ```typescript
   import { isAllowedByRobots } from '@/utils/robots.js';
   const allowed = await isAllowedByRobots('https://example.com/data', 'ProtestScraperBot');
   ```

2. **Create parser file:**
   ```typescript
   // src/scraper/sources/germany/hamburg.ts
   import { ProtestEvent } from '@/scraper/scrape-protests.js';
   import { LOCALES } from '@/scraper/config/locales.js';
   import { parseDate } from '@/scraper/utils/date-parser.js';

   export async function parseHamburgPolice(): Promise<ProtestEvent[]> {
     const locale = LOCALES['DE'];
     const events: ProtestEvent[] = [];

     // Fetch data
     // Parse HTML/JSON
     // Use parseDate(dateStr, locale) for dates

     return events;
   }
   ```

3. **Register in sources registry:**
   ```typescript
   // src/scraper/sources/registry.ts
   {
     id: 'hamburg-police',
     name: 'Hamburg Police',
     country: 'DE',
     city: 'Hamburg',
     parser: parseHamburgPolice,
     enabled: true,
     description: 'Official assembly registry',
   }
   ```

4. **Add unit test with mocked response**
5. **Add E2E test with real API**
6. **Document in README** under Data Sources

### Best Practices for Scrapers

- **Rate limiting:** Use `delay()` between requests
- **Error handling:** Gracefully handle network errors
- **Data validation:** Validate required fields (title, location, date)
- **Geocoding:** Use `geocodeAddress()` for coordinates
- **Locale-aware:** Use `parseDate()` and `parseAttendees()` with locale config
- **Deduplication:** Scraper framework handles this automatically

## Questions?

- **General questions:** Open a discussion on GitHub
- **Security issues:** Email maintainers directly (see SECURITY.md)
- **Need help?** Tag your issue with `question`

## Recognition

Contributors are recognized in:
- GitHub contributors page
- Release notes for significant contributions
- Special thanks section (major features)

Thank you for contributing! 🎉
