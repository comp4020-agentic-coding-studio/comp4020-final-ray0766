import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** Production always requires the persisted integration marker. The legacy
 * HTTP contract suite may use an explicit, fresh, isolated test database. */
export function integratedStartup(env: NodeJS.ProcessEnv, databasePath: string, homeSample: boolean): boolean {
  if (env.TEST_LEGACY_WORLD === undefined) return !homeSample;
  if (env.TEST_LEGACY_WORLD !== '1' || env.NODE_ENV !== 'test' || homeSample || env.HOST !== '127.0.0.1' || !env.DATABASE_PATH) throw new Error('TEST_LEGACY_WORLD requires NODE_ENV=test, HOST=127.0.0.1 and an explicit fresh DATABASE_PATH, without HOME_SAMPLE.');
  if (resolve(databasePath) === resolve('.data/little-post.sqlite') || (databasePath !== ':memory:' && existsSync(databasePath))) throw new Error('TEST_LEGACY_WORLD refuses the main database path or any existing database. Use :memory: or a fresh temporary path.');
  return false;
}
