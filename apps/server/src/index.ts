import cors from 'cors';
import express from 'express';
import mongoose from 'mongoose';

const port = Number(process.env.PORT ?? 4000);
const mongoUri = process.env.MONGODB_URI;

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (_request, response) => {
  response.json({
    ok: true,
    service: '@wakey/server',
    mongoConfigured: Boolean(mongoUri),
    timestamp: new Date().toISOString()
  });
});

app.get('/api/v1/status', (_request, response) => {
  response.json({
    name: 'wakey-wakey-api',
    version: '0.1.0'
  });
});

app.post('/api/v1/sync', (request, response) => {
  response.status(202).json({
    received: true,
    payloadKeys: Object.keys(request.body ?? {})
  });
});

async function start() {
  if (mongoUri) {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');
  }

  app.listen(port, () => {
    console.log(`API server listening on http://localhost:${port}`);
  });
}

start().catch((error: unknown) => {
  console.error('Failed to start API server');
  console.error(error);
  process.exit(1);
});
