import { Router, Request, Response } from 'express';
import { getDatabase } from '@/db/connection.js';
import { Protest } from '@/types/protest.js';
import { protestsToCSV, protestsToJSON, protestsToICS } from '@/utils/export.js';
import { buildProtestFilter } from '@/utils/filter-builder.js';

const router = Router();

// GET /api/export/csv - Export protests as CSV
router.get('/csv', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = getDatabase();
    const protests = db.collection<Protest>('protests');

    const filter = buildProtestFilter(req);
    const results = await protests.find(filter).sort({ start: 1 }).toArray();

    const csv = protestsToCSV(results);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="protests.csv"');
    res.send(csv);
  } catch (error) {
    console.error('Error exporting CSV:', error);
    res.status(500).json({ error: 'Failed to export CSV' });
  }
});

// GET /api/export/json - Export protests as JSON
router.get('/json', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = getDatabase();
    const protests = db.collection<Protest>('protests');

    const filter = buildProtestFilter(req);
    const results = await protests.find(filter).sort({ start: 1 }).toArray();

    const json = protestsToJSON(results);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="protests.json"');
    res.send(json);
  } catch (error) {
    console.error('Error exporting JSON:', error);
    res.status(500).json({ error: 'Failed to export JSON' });
  }
});

// GET /api/export/ics - Export protests as ICS (iCalendar) - subscribable!
router.get('/ics', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = getDatabase();
    const protests = db.collection<Protest>('protests');

    const filter = buildProtestFilter(req);
    const results = await protests.find(filter).sort({ start: 1 }).toArray();

    const ics = await protestsToICS(results);

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="protests.ics"');
    res.send(ics);
  } catch (error) {
    console.error('Error exporting ICS:', error);
    res.status(500).json({ error: 'Failed to export ICS' });
  }
});

export default router;
