import { createServer } from 'vite';

/** Sample data from `src/lib/dev/seed.ts` as a storage string, loaded through Vite so `$lib` resolves. */
export async function sampleData(days: number, today: string): Promise<string> {
  const server = await createServer({
    configFile: 'vite.config.ts',
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  });
  try {
    const seed = (await server.ssrLoadModule('/src/lib/dev/seed.ts')) as {
      seedData: (options: { days: number; today: string }) => unknown;
    };
    return JSON.stringify(seed.seedData({ days, today }));
  } finally {
    await server.close();
  }
}
