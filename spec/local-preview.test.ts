import { expect, it } from 'vitest';
import { matchesProcess, validateConfig } from '../scripts/local-preview.ts';

const root = '/tmp/canonical-world', runtime = root + '/.data/midpoint/runtime';
const config = () => ({ version: 1, canonicalRoot: root, branch: 'integration/midpoint', port: 8098, database: root + '/.data/midpoint/little-worlds.sqlite' });
it('accepts only the canonical directory, branch, port and preserved database path', () => {
  expect(() => validateConfig(config(), root)).not.toThrow();
  for (const patch of [{ canonicalRoot: '/tmp/old-worktree' }, { branch: 'main' }, { port: 8143 }, { database: '/tmp/sample.sqlite' }]) expect(() => validateConfig({ ...config(), ...patch }, root)).toThrow();
});
it('refuses sample/legacy and alternative database overrides before touching a saved world', () => {
  for (const env of [{ HOME_SAMPLE: '1' }, { TEST_LEGACY_WORLD: '1' }, { DATABASE_PATH: '/tmp/preview.sqlite' }]) expect(() => validateConfig(config(), root, env)).toThrow();
  expect(() => validateConfig(config(), root, { DATABASE_PATH: config().database })).not.toThrow();
});
it('requires both the exact runtime cwd and owned server command before allowing stop', () => {
  const cwd = 'p123\nn' + runtime + '\n', command = '/usr/bin/node ' + root + '/scripts/local-server.ts';
  expect(matchesProcess(root, runtime, cwd, command)).toBe(true);
  expect(matchesProcess(root, runtime, 'n/tmp/another-course\n', command)).toBe(false);
  expect(matchesProcess(root, runtime, cwd, '/usr/bin/node /tmp/another-course/server.ts')).toBe(false);
});
