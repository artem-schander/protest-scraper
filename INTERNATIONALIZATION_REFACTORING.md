# Internationalization Refactoring - Completion Summary

**Status**: ✅ Complete
**Date**: 2025-10-23
**Tests**: 166/166 passing (all tests passing, including 37 new tests for date/attendee parsing)

## What Was Accomplished

### Phase 1: Infrastructure ✓
Created a flexible configuration system for multiple countries:

- **`src/scraper/config/countries.ts`**: ISO 3166-1 alpha-2 country code mappings (20+ countries)
- **`src/scraper/config/locales.ts`**: Locale configurations with:
  - Timezone (IANA format)
  - Language tags (BCP 47: de-DE, de-AT, fr-FR, en-US)
  - Month name mappings (local language → numeric)
  - Date format patterns (for dayjs parsing)
  - Number format patterns (approximate, ranges, thousands)

- **`src/scraper/utils/date-parser.ts`**: Generic date parser
  - Replaced hardcoded `parseGermanDate()` with `parseDate(str, locale)`
  - Supports multiple languages and date formats
  - Handles missing years (assumes current/next year)
  - 13 tests covering German date formats

- **`src/scraper/utils/attendee-parser.ts`**: Generic attendee extraction
  - Replaced hardcoded German logic with `parseAttendees(text, locale, keywords)`
  - Language-specific helpers: `parseGermanAttendees()`, `parseEnglishAttendees()`, `parseFrenchAttendees()`
  - Handles approximate counts, ranges, thousand separators
  - 23 tests covering German, English, French patterns

### Phase 2: German Sources Refactoring ✓
Moved all 4 German scrapers to organized structure:

**`src/scraper/sources/germany/`**:
- `berlin.ts` - Berlin Police assembly registry
- `dresden.ts` - Dresden City JSON API
- `friedenskooperative.ts` - Peace movement (5 categories: Demonstration, Vigil, Government Event, Counter-Demo, Blockade)
- `demokrateam.ts` - DemokraTEAM WordPress API (3 months forward)
- `index.ts` - Exports all German parsers

All parsers now:
- Use `LOCALES['DE']` for configuration
- Call `parseDate(dateStr, locale)` instead of `parseGermanDate()`
- Call `parseGermanAttendees(text, locale)` with locale context
- Set `country: locale.countryCode` and `language: locale.language`

### Phase 3: Registry System ✓
Created centralized source management:

**`src/scraper/sources/registry.ts`**:
```typescript
interface ScraperSource {
  id: string;              // 'berlin-police'
  name: string;            // 'Berlin Police'
  country: string;         // 'DE'
  city?: string | null;    // 'Berlin' or null for nationwide
  parser: () => Promise<ProtestEvent[]>;
  enabled: boolean;
  description?: string;
}

export const SOURCES: ScraperSource[] = [
  { id: 'berlin-police', name: 'Berlin Police', country: 'DE', city: 'Berlin', ... },
  { id: 'dresden-city', name: 'Dresden City', country: 'DE', city: 'Dresden', ... },
  // ...
];

export function getEnabledSources(): ScraperSource[];
export function getSourcesByCountry(countryCode: string): ScraperSource[];
export function getSourceById(id: string): ScraperSource | undefined;
```

**Updated entry points**:
- `scrape-protests.ts`: Loads sources via `getEnabledSources()` (file export)
- `import-to-db.ts`: Loads sources via `getEnabledSources()` (database import)

Both automatically pick up new sources without modification.

### Phase 4: Testing & Documentation ✓

**Build**: ✅ Compiles without errors
**Tests**: ✅ 166/166 passing (all tests passing)

New test files added:
- `test/scraper/utils/date-parser.test.ts` - 13 tests for locale-aware date parsing
- `test/scraper/utils/attendee-parser.test.ts` - 23 tests for attendee extraction

**Documentation updated**:
- `CLAUDE.md`: Added scraper architecture section, updated directory structure, new "Adding a Scraper Source" guide
- `README.md`: Updated data sources section with architecture highlights

## How to Add New Sources

### For Existing Country (e.g., Hamburg, Germany)

**3 steps**:

1. Create parser: `src/scraper/sources/germany/hamburg.ts`
```typescript
import { ProtestEvent } from '@/scraper/scrape-protests.js';
import { LOCALES } from '@/scraper/config/locales.js';
import { parseDate } from '@/scraper/utils/date-parser.js';
import { parseGermanAttendees } from '@/scraper/utils/attendee-parser.js';

export async function parseHamburgPolice(): Promise<ProtestEvent[]> {
  const locale = LOCALES['DE'];
  // Fetch, parse, return events
}
```

2. Export: Add to `src/scraper/sources/germany/index.ts`
```typescript
export { parseHamburgPolice } from './hamburg.js';
```

3. Register: Add to `src/scraper/sources/registry.ts`
```typescript
{
  id: 'hamburg-police',
  name: 'Hamburg Police',
  country: 'DE',
  city: 'Hamburg',
  parser: parseHamburgPolice,
  enabled: true,
}
```

### For New Country (e.g., France)

**4 steps**:

1. Create directory: `src/scraper/sources/france/`

2. Create parser: `src/scraper/sources/france/paris.ts`
```typescript
import { LOCALES } from '@/scraper/config/locales.js';
import { parseDate } from '@/scraper/utils/date-parser.js';
import { parseFrenchAttendees } from '@/scraper/utils/attendee-parser.js';

export async function parseParisPolice(): Promise<ProtestEvent[]> {
  const locale = LOCALES['FR'];  // Uses French config
  const date = parseDate(frenchDateStr, locale);
  const attendees = parseFrenchAttendees(text, locale);
  // ...
}
```

3. Create index: `src/scraper/sources/france/index.ts`

4. Register with `country: 'FR'` in registry

## Benefits

✅ **No hardcoded logic**: All German-specific code replaced with configuration  
✅ **Easy expansion**: Add sources in 3-4 steps  
✅ **Automatic pickup**: Both file export and DB import use registry  
✅ **Clear organization**: Sources grouped by country  
✅ **Maintainable**: Generic utilities handle date/number parsing  
✅ **Tested**: Full test coverage for core functionality  
✅ **Backward compatible**: Old parser functions still exist for tests  

## File Changes Summary

**Created (11 files)**:
- `src/scraper/config/countries.ts`
- `src/scraper/config/locales.ts`
- `src/scraper/utils/date-parser.ts`
- `src/scraper/utils/attendee-parser.ts`
- `src/scraper/sources/registry.ts`
- `src/scraper/sources/germany/index.ts`
- `src/scraper/sources/germany/berlin.ts`
- `src/scraper/sources/germany/dresden.ts`
- `src/scraper/sources/germany/friedenskooperative.ts`
- `src/scraper/sources/germany/demokrateam.ts`
- `test/scraper/utils/date-parser.test.ts`
- `test/scraper/utils/attendee-parser.test.ts`

**Modified (4 files)**:
- `src/scraper/scrape-protests.ts` - Uses registry, imports COUNTRY_NAMES from config
- `src/scraper/import-to-db.ts` - Uses registry
- `scraper/CLAUDE.md` - Added architecture docs
- `scraper/README.md` - Updated data sources section

**Impact**: Minimal breaking changes. Old parser functions remain as exports for backward compatibility.

## Next Steps (Future Work)

1. Add parsers for other German cities (Hamburg, Munich, Cologne, Frankfurt)
2. Add parsers for Austria (Vienna Police, Austrian sources)
3. Add parsers for France (Paris Prefecture, French sources)
4. Expand locale configurations with more date formats as needed
5. Consider adding more sophisticated NLP for attendee extraction
6. Add source health monitoring/alerting

## References

- Main refactoring plan: `INTERNATIONALIZATION_REFACTORING.md`
- Implementation guide: `CLAUDE.md` § "Adding a New Scraper Source"
- Locale configuration: `src/scraper/config/locales.ts`
- Source registry: `src/scraper/sources/registry.ts`
