import { Router, Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { getDatabase } from '@/db/connection.js';
import { Protest, ProtestInput, ProtestQueryFilters, ProtestUpdateInput } from '@/types/protest.js';
import { UserRole } from '@/types/user.js';
import { authenticate, authorize, AuthRequest } from '@/middleware/auth.js';
import { buildProtestFilter } from '@/utils/filter-builder.js';
import { getModerationWebSocket } from '@/services/moderation-websocket-instance.js';

const router = Router();

// GET /api/protests - List protests with filters
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { limit, skip }: ProtestQueryFilters = req.query;

    const db = getDatabase();
    const protests = db.collection<Protest>('protests');

    // Build query filter using shared utility
    const filter = buildProtestFilter(req);

    const limitNum = Math.min(parseInt((limit as string) || '50', 10), 100); // Max 100
    const skipNum = parseInt((skip as string) || '0', 10);

    const results = await protests
      .find(filter)
      .sort({ start: 1 })
      .skip(skipNum)
      .limit(limitNum)
      .toArray();

    const total = await protests.countDocuments(filter);

    res.json({
      protests: results.map((p) => ({
        id: p._id?.toString(),
        source: p.source,
        city: p.city,
        country: p.country,
        language: p.language,
        title: p.title,
        start: p.start,
        startTimeKnown: p.startTimeKnown,
        end: p.end,
        endTimeKnown: p.endTimeKnown,
        location: p.location,
        originalLocation: p.originalLocation,
        coordinates: p.geoLocation?.coordinates
          ? { lat: p.geoLocation.coordinates[1], lon: p.geoLocation.coordinates[0] }
          : null,
        url: p.url,
        attendees: p.attendees,
        categories: p.categories,
        verified: p.verified,
        createdAt: p.createdAt,
      })),
      pagination: {
        total,
        limit: limitNum,
        skip: skipNum,
      },
    });
  } catch (error) {
    console.error('Error fetching protests:', error);
    res.status(500).json({ error: 'Failed to fetch protests' });
  }
});

// GET /api/protests/:id - Get single protest by ID
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      res.status(400).json({ error: 'Invalid protest ID' });
      return;
    }

    const db = getDatabase();
    const protests = db.collection<Protest>('protests');

    const protest = await protests.findOne({ _id: new ObjectId(id) });

    if (!protest) {
      res.status(404).json({ error: 'Protest not found' });
      return;
    }

    // Don't expose deleted events to public
    if (protest.deleted) {
      res.status(404).json({ error: 'Protest not found' });
      return;
    }

    res.json({
      id: protest._id?.toString(),
      source: protest.source,
      city: protest.city,
      country: protest.country,
      language: protest.language,
      title: protest.title,
      start: protest.start,
      startTimeKnown: protest.startTimeKnown,
      end: protest.end,
      endTimeKnown: protest.endTimeKnown,
      location: protest.location,
      originalLocation: protest.originalLocation,
      coordinates: protest.geoLocation?.coordinates
        ? { lat: protest.geoLocation.coordinates[1], lon: protest.geoLocation.coordinates[0] }
        : null,
      url: protest.url,
      attendees: protest.attendees,
      categories: protest.categories,
      verified: protest.verified,
      createdBy: protest.createdBy,
      editedBy: protest.editedBy,
      createdAt: protest.createdAt,
      updatedAt: protest.updatedAt,
    });
  } catch (error) {
    console.error('Error fetching protest:', error);
    res.status(500).json({ error: 'Failed to fetch protest' });
  }
});

// POST /api/protests - Add new protest (authenticated)
router.post('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const protestData: ProtestInput = req.body;

    if (!protestData.title) {
      res.status(400).json({ error: 'Title is required' });
      return;
    }

    const db = getDatabase();
    const protests = db.collection<Protest>('protests');

    // Auto-verify if user is MODERATOR or ADMIN
    const verified =
      req.user?.role === UserRole.MODERATOR || req.user?.role === UserRole.ADMIN;

    // Normalize date fields so Mongo stores real Date objects instead of ISO strings
    const startDate = protestData.start !== undefined && protestData.start !== null ? new Date(protestData.start) : null;
    const endDate = protestData.end !== undefined && protestData.end !== null ? new Date(protestData.end) : null;

    const newProtest: Omit<Protest, '_id'> = {
      source: protestData.source || 'Manual Submission',
      city: protestData.city || null,
      country: protestData.country || null,
      title: protestData.title,
      start: startDate && !Number.isNaN(startDate.getTime()) ? startDate : null,
      end: endDate && !Number.isNaN(endDate.getTime()) ? endDate : null,
      language: protestData.language || null,
      location: protestData.location || null,
      geoLocation: protestData.geoLocation || undefined,
      url: protestData.url || '',
      attendees: protestData.attendees || null,
      verified,
      createdBy: req.user?.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await protests.insertOne(newProtest as Protest);

    // Broadcast new event to moderators if it requires verification
    if (!verified) {
      const ws = getModerationWebSocket();
      if (ws) {
        ws.broadcastEventCreate(result.insertedId.toString(), req.user?.userId || 'unknown');
      }
    }

    res.status(201).json({
      message: verified
        ? 'Protest created and verified'
        : 'Protest created (pending verification)',
      protest: {
        id: result.insertedId.toString(),
        ...newProtest,
      },
    });
  } catch (error) {
    console.error('Error creating protest:', error);
    res.status(500).json({ error: 'Failed to create protest' });
  }
});

// PUT /api/protests/:id - Update protest (MODERATOR or ADMIN only)
router.put(
  '/:id',
  authenticate,
  authorize(UserRole.MODERATOR, UserRole.ADMIN),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const updates: ProtestUpdateInput = req.body;

      if (!ObjectId.isValid(id)) {
        res.status(400).json({ error: 'Invalid protest ID' });
        return;
      }

      const db = getDatabase();
      const protests = db.collection<Protest>('protests');

      const updateData: any = {
        ...updates,
        manuallyEdited: true, // Mark as manually edited to prevent scraper overwrites
        editedBy: req.user?.userId, // Track who edited
        updatedAt: new Date(),
      };

      if (updates.start !== undefined) {
        const parsedStart =
          updates.start !== null ? new Date(updates.start as Date | string) : null;
        updateData.start =
          parsedStart && !Number.isNaN(parsedStart.getTime()) ? parsedStart : null;
      }

      if (updates.end !== undefined) {
        const parsedEnd = updates.end !== null ? new Date(updates.end as Date | string) : null;
        updateData.end = parsedEnd && !Number.isNaN(parsedEnd.getTime()) ? parsedEnd : null;
      }

      const result = await protests.findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: updateData },
        { returnDocument: 'after' }
      );

      if (!result) {
        res.status(404).json({ error: 'Protest not found' });
        return;
      }

      res.json({
        message: 'Protest updated successfully',
        protest: {
          id: result._id?.toString(),
          ...result,
        },
      });
    } catch (error) {
      console.error('Error updating protest:', error);
      res.status(500).json({ error: 'Failed to update protest' });
    }
  }
);

// DELETE /api/protests/:id - Delete protest (ADMIN only)
router.delete(
  '/:id',
  authenticate,
  authorize(UserRole.ADMIN),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        res.status(400).json({ error: 'Invalid protest ID' });
        return;
      }

      const db = getDatabase();
      const protests = db.collection<Protest>('protests');

      // Soft delete: mark as deleted instead of removing
      const result = await protests.findOneAndUpdate(
        { _id: new ObjectId(id) },
        {
          $set: {
            deleted: true,
            manuallyEdited: true,
            updatedAt: new Date(),
          },
        },
        { returnDocument: 'after' }
      );

      if (!result) {
        res.status(404).json({ error: 'Protest not found' });
        return;
      }

      res.json({ message: 'Protest deleted successfully' });
    } catch (error) {
      console.error('Error deleting protest:', error);
      res.status(500).json({ error: 'Failed to delete protest' });
    }
  }
);

export default router;
