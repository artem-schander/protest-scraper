import { Router, Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { getDatabase } from '../db/connection.js';
import { Protest, ProtestInput, ProtestUpdateInput } from '../types/protest.js';
import { UserRole } from '../types/user.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';

const router = Router();

// GET /api/protests - List protests with filters
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { city, source, language, days, verified, limit, skip, lat, lon, radius } = req.query;

    const db = getDatabase();
    const protests = db.collection<Protest>('protests');

    // Build query filter
    const filter: any = {};

    // Always exclude soft-deleted events
    filter.deleted = { $ne: true };

    // City filter
    if (city && typeof city === 'string') {
      filter.city = city;
    }

    // source filter
    if (source && typeof source === 'string') {
      filter.source = source;
    }

    // language filter
    if (language && typeof language === 'string') {
      filter.language = language;
    }

    // Geolocation filter (takes precedence over city filter)
    if (lat && lon && typeof lat === 'string' && typeof lon === 'string') {
      const latitude = parseFloat(lat);
      const longitude = parseFloat(lon);
      const radiusKm = radius && typeof radius === 'string' ? parseFloat(radius) : 50; // Default 50km

      if (!isNaN(latitude) && !isNaN(longitude) && !isNaN(radiusKm)) {
        // Use $geoWithin + $centerSphere for geolocation search
        // This works with additional sorting unlike $near
        filter.geoLocation = {
          $geoWithin: {
            $centerSphere: [
              [longitude, latitude], // GeoJSON: [lon, lat]
              radiusKm / 6378.1, // Convert km to radians (Earth radius = 6378.1 km)
            ],
          },
        };

        // Remove city filter when using geolocation
        delete filter.city;
      }
    }

    // Date range filter
    if (days && typeof days === 'string') {
      const daysNum = parseInt(days, 10);
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + daysNum);

      filter.start = {
        $gte: new Date(),
        $lte: futureDate,
      };
    }

    // Verified filter
    if (verified !== undefined && typeof verified === 'string') {
      filter.verified = verified === 'true';
    } else {
      filter.verified = true;
    }

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
        title: p.title,
        start: p.start,
        end: p.end,
        location: p.location,
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

    const newProtest: Omit<Protest, '_id'> = {
      source: protestData.source || 'Manual Submission',
      city: protestData.city || null,
      title: protestData.title,
      start: protestData.start || null,
      end: protestData.end || null,
      language: protestData.language || null,
      location: protestData.location || null,
      url: protestData.url || '',
      attendees: protestData.attendees || null,
      verified,
      createdBy: req.user?.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await protests.insertOne(newProtest as Protest);

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
        updatedAt: new Date(),
      };

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
