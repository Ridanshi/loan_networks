import path from 'node:path';
import dotenv from 'dotenv';
import type { NextFunction, Request, Response } from 'express';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

console.log('DATABASE_URL loaded:', !!process.env.DATABASE_URL);

const [{ default: cors }, { default: express }, { default: dataRoutes }, { default: verifyRoutes }] = await Promise.all([
  import('cors'),
  import('express'),
  import('./routes/dataRoutes.js'),
  import('./routes/verifyRoutes.js')
]);

const app = express();
const port = Number(process.env.PORT || 4000);

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api', dataRoutes);
app.use('/api', verifyRoutes);

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(error);
  const message = error instanceof Error ? error.message : String(error || 'Unexpected server error');

  res.status(500).json({
    message
  });
});

app.listen(port, () => {
  console.log(`API server running on http://localhost:${port}`);
});
