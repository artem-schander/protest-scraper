import { parseAmnestySwiss } from './dist/scraper/sources/switzerland/amnesty.js';
import { readFileSync } from 'fs';

console.log('Testing Amnesty Swiss parser with pre-fetched HTML...\n');

try {
  const html = readFileSync('/tmp/amnesty-test.html', 'utf8');
  const events = await parseAmnestySwiss(90, html);
  console.log(`Found ${events.length} events\n`);

  if (events.length > 0) {
    console.log('All events:');
    events.forEach((event, i) => {
      console.log(`\n${i + 1}. ${event.title}`);
      console.log(`   City: ${event.city}`);
      console.log(`   Location: ${event.location || 'N/A'}`);
      console.log(`   Start: ${event.start}`);
      console.log(`   Time known: ${event.startTimeKnown}`);
      console.log(`   URL: ${event.url}`);
    });
  }
} catch (err) {
  console.error('Error:', err.message);
  console.error(err.stack);
}
