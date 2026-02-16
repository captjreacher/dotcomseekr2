import Fastify from 'fastify';
import cors from '@fastify/cors';
import { healthRoutes } from './routes/health';
import { projectRoutes } from './routes/projects';
import { expansionRoutes } from './routes/expansion';
import { availabilityRoutes } from './routes/availability';

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

  // Register routes
  await server.register(healthRoutes);
  await server.register(projectRoutes);
  await server.register(expansionRoutes);
  await server.register(availabilityRoutes);

  return server;
}
