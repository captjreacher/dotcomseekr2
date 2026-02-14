import { FastifyInstance } from 'fastify';
import { checkDatabaseConnection } from '../services/supabase';

export async function healthRoutes(server: FastifyInstance) {
  // Basic health check
  server.get('/health', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  });

  // Detailed health check with DB status
  server.get('/api/v1/health', async () => {
    const dbConnected = await checkDatabaseConnection();

    return {
      status: dbConnected ? 'ok' : 'degraded',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      services: {
        database: dbConnected ? 'connected' : 'disconnected',
        api: 'ok',
      },
      uptime: process.uptime(),
    };
  });
}
