import express, { Application } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.js';
import protestRoutes from './routes/protests.js';
import exportRoutes from './routes/export.js';
import adminUsersRoutes from './routes/admin-users.js';

export function createApp(): Application {
  const app: Application = express();

  // Middleware
  app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true // Allow cookies to be sent
  }));
  app.use(cookieParser());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Routes
  app.get('/', (_req, res) => {
    res.json({
      message: 'Protest Listing Service API',
      version: '1.0.0',
      endpoints: {
        auth: {
          register: 'POST /api/auth/register',
          login: 'POST /api/auth/login',
        },
        protests: {
          list: 'GET /api/protests',
          create: 'POST /api/protests (authenticated)',
          update: 'PUT /api/protests/:id (moderator/admin)',
          delete: 'DELETE /api/protests/:id (admin)',
        },
        export: {
          csv: 'GET /api/export/csv?city=Berlin&days=30',
          json: 'GET /api/export/json?city=Berlin&days=30',
          ics: 'GET /api/export/ics?city=Berlin&days=30 (subscribable!)',
        },
        admin: {
          listUsers: 'GET /api/admin/users',
          createUser: 'POST /api/admin/users',
          updateUser: 'PATCH /api/admin/users/:id',
          deleteUser: 'DELETE /api/admin/users/:id',
          banUser: 'POST /api/admin/users/:id/ban',
          unbanUser: 'POST /api/admin/users/:id/unban',
          resendVerification: 'POST /api/admin/users/:id/resend-verification'
        }
      },
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/protests', protestRoutes);
  app.use('/api/export', exportRoutes);
  app.use('/api/admin/users', adminUsersRoutes);

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}
