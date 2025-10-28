#!/usr/bin/env node

/**
 * Cleanup duplicate events in the database
 *
 * Duplicates are detected using the same logic as the import script:
 * - Same URL, title, city, source
 * - Start dates within ±3 days of each other
 *
 * When duplicates are found:
 * - Keep the oldest event (by createdAt)
 * - Merge manual edits from newer duplicates
 * - Delete newer duplicates
 */

import 'dotenv/config';
import { program } from 'commander';
import { connectToDatabase, closeConnection } from '@/db/connection.js';
import { Protest } from '@/types/protest.js';

interface CleanupResult {
  totalEvents: number;
  duplicatesFound: number;
  eventsDeleted: number;
  errors: number;
}

async function cleanupDuplicates(dryRun: boolean): Promise<CleanupResult> {
  console.error('[cleanup] Connecting to database...');
  const db = await connectToDatabase();
  const protests = db.collection<Protest>('protests');

  const result: CleanupResult = {
    totalEvents: 0,
    duplicatesFound: 0,
    eventsDeleted: 0,
    errors: 0,
  };

  // Get all events (excluding deleted and fully manual)
  const allEvents = await protests.find({
    deleted: { $ne: true },
    fullyManual: { $ne: true },
  }).sort({ createdAt: 1 }).toArray(); // Sort by oldest first

  result.totalEvents = allEvents.length;
  console.error(`[cleanup] Found ${result.totalEvents} events to check`);

  // Track processed events to avoid checking the same group twice
  const processed = new Set<string>();

  for (const event of allEvents) {
    if (processed.has(event._id.toString())) continue;

    // Find potential duplicates using fuzzy date matching
    const startDate = event.start;
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
    const threeDaysAgo = startDate ? new Date(startDate.getTime() - threeDaysMs) : null;
    const threeDaysLater = startDate ? new Date(startDate.getTime() + threeDaysMs) : null;

    const query: any = {
      _id: { $ne: event._id }, // Exclude current event
      url: event.url,
      title: event.title,
      city: event.city,
      source: event.source,
      deleted: { $ne: true },
      fullyManual: { $ne: true },
    };

    if (startDate) {
      query.start = {
        $gte: threeDaysAgo,
        $lte: threeDaysLater,
      };
    }

    const duplicates = await protests.find(query).sort({ createdAt: 1 }).toArray();

    if (duplicates.length > 0) {
      result.duplicatesFound += duplicates.length;

      console.error(`\n[cleanup] Found ${duplicates.length + 1} duplicates for:`);
      console.error(`  Title: ${event.title}`);
      console.error(`  Date: ${event.start?.toISOString()}`);
      console.error(`  City: ${event.city}`);
      console.error(`  Source: ${event.source}`);

      // Keep the oldest (current event), merge data from newer ones
      for (const duplicate of duplicates) {
        processed.add(duplicate._id.toString());

        console.error(`  → Duplicate ID: ${duplicate._id.toString()}`);
        console.error(`    Created: ${duplicate.createdAt?.toISOString()}`);
        console.error(`    Start: ${duplicate.start?.toISOString()}`);

        if (!dryRun) {
          try {
            // Check if duplicate has manual edits we should preserve
            if (duplicate.manuallyEdited && duplicate.editedFields && duplicate.editedFields.length > 0) {
              console.error(`    ⚠️  Has manual edits (${duplicate.editedFields.join(', ')}), merging...`);

              // Merge edited fields into the original event
              const updateFields: any = {};
              const mergedEditedFields = new Set([...(event.editedFields || []), ...duplicate.editedFields]);

              for (const field of duplicate.editedFields) {
                if (duplicate[field as keyof Protest] !== undefined) {
                  updateFields[field] = duplicate[field as keyof Protest];
                }
              }

              if (Object.keys(updateFields).length > 0) {
                await protests.updateOne(
                  { _id: event._id },
                  {
                    $set: {
                      ...updateFields,
                      editedFields: Array.from(mergedEditedFields),
                      manuallyEdited: true,
                      updatedAt: new Date(),
                    },
                  }
                );
                console.error(`    ✓ Merged manual edits into original event`);
              }
            }

            // Delete the duplicate
            await protests.deleteOne({ _id: duplicate._id });
            result.eventsDeleted++;
            console.error(`    ✓ Deleted duplicate`);
          } catch (error) {
            const err = error as Error;
            console.error(`    ✗ Error: ${err.message}`);
            result.errors++;
          }
        } else {
          console.error(`    [DRY RUN] Would delete this duplicate`);
        }
      }

      processed.add(event._id.toString());
    }
  }

  console.error(`\n[cleanup] Summary:`);
  console.error(`  Total events checked: ${result.totalEvents}`);
  console.error(`  Duplicates found: ${result.duplicatesFound}`);
  console.error(`  Events deleted: ${result.eventsDeleted}`);
  console.error(`  Errors: ${result.errors}`);

  if (dryRun) {
    console.error(`\n[cleanup] DRY RUN - No changes made to database`);
  }

  await closeConnection();

  return result;
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  program
    .option('--dry-run', 'Preview what would be deleted without making changes', false)
    .parse(process.argv);

  const opts = program.opts<{ dryRun: boolean }>();

  cleanupDuplicates(opts.dryRun)
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch((error) => {
      console.error('[cleanup] Fatal error:', error);
      process.exit(1);
    });
}

export { cleanupDuplicates };
