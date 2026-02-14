import { createServer } from './server';

const start = async () => {
  try {
    const server = await createServer();
    const port = Number(process.env.PORT) || 3000;

    await server.listen({ port, host: '0.0.0.0' });
    console.log(`🚀 API server listening on http://localhost:${port}`);
  } catch (err) {
    console.error('Error starting server:', err);
    process.exit(1);
  }
};

start();
