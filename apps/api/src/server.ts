import Fastify from 'fastify';
import cors from '@fastify/cors';

export async function createServer() {
  const server = Fastify({
    logger: {
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    },
  });

  // Register CORS
  await server.register(cors, {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  });

  // Health check route
  server.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // API v1 routes
  server.get('/api/v1/health', async () => {
    return {
      status: 'ok',
      version: '1.0.0',
      timestamp: new Date().toISOString()
    };
  });

  return server;
}
