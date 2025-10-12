import dayjs from 'dayjs';
import { createEvents } from 'ics';
import { Protest } from '../types/protest.js';

export interface ExportFilters {
  city?: string;
  days?: number;
  verified?: boolean;
}

export function protestsToCSV(protests: Protest[]): string {
  if (protests.length === 0) {
    return 'source,city,title,start,end,location,url,attendees,verified\n';
  }

  const lines = ['source,city,title,start,end,location,url,attendees,verified'];

  for (const p of protests) {
    const row = [
      p.source,
      p.city || '',
      p.title,
      p.start?.toISOString() || '',
      p.end?.toISOString() || '',
      p.location || '',
      p.url,
      p.attendees?.toString() || '',
      p.verified.toString(),
    ];

    lines.push(row.map((v) => `"${v.toString().replace(/"/g, '""')}"`).join(','));
  }

  return lines.join('\n');
}

export function protestsToJSON(protests: Protest[]): string {
  const events = protests.map((p) => ({
    id: p._id?.toString(),
    source: p.source,
    city: p.city,
    title: p.title,
    start: p.start?.toISOString() || null,
    end: p.end?.toISOString() || null,
    location: p.location,
    url: p.url,
    attendees: p.attendees,
    verified: p.verified,
    createdAt: p.createdAt?.toISOString(),
  }));

  return JSON.stringify(events, null, 2);
}

export async function protestsToICS(protests: Protest[]): Promise<string> {
  const icsEvents = protests
    .filter((p) => p.start)
    .map((p) => {
      const startDate = dayjs(p.start!);
      const startArray: [number, number, number, number, number] = [
        startDate.year(),
        startDate.month() + 1, // ICS months are 1-indexed
        startDate.date(),
        startDate.hour(),
        startDate.minute(),
      ];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const event: any = {
        start: startArray,
        title: p.title,
        location: p.location || p.city || '',
        description: `${p.source}${p.attendees ? `\nExpected attendees: ${p.attendees}` : ''}`,
        productId: 'protest-scraper',
        uid: p._id?.toString() || `${p.url}-${p.start}`,
      };

      // Add URL
      if (p.url) {
        event.url = p.url;
      }

      // Add categories
      const categories: string[] = [];
      categories.push('Germany');
      if (p.city) categories.push(p.city);
      if (p.source) categories.push(p.source);

      if (categories.length > 0) {
        event.categories = categories;
      }

      // Add end time if available
      if (p.end) {
        const endDate = dayjs(p.end);
        event.end = [
          endDate.year(),
          endDate.month() + 1,
          endDate.date(),
          endDate.hour(),
          endDate.minute(),
        ];
      }

      return event;
    });

  const { error, value } = createEvents(icsEvents);

  if (error) {
    throw new Error(`Failed to generate ICS: ${error.message || error}`);
  }

  return value || '';
}
