import 'dotenv/config';
import { createServer } from './server';

const start = async () => {
  try {
    const server = await createServer();
    const port = Number(process.env.PORT) || 3000;

    await server.listen({ port, host: '0.0.0.0' });

    console.log(`🚀 API server listening on http://localhost:${port}`);
    console.log(`📊 Health check: http://localhost:${port}/health`);
    console.log(`📊 API health: http://localhost:${port}/api/v1/health`);
  } catch (err) {
    console.error('Error starting server:', err);
    process.exit(1);
  }
};

start();
