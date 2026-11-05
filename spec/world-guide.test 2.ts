import { expect, it, vi } from 'vitest';
import { createGuideHelp } from '../src/server/guide-help.ts';
import { GUIDE_HELP, guideTarget } from '../src/shared/world-guide.ts';
import type { Universe } from '../src/shared/planets.ts';
it('only offers outdoor walking targets and does not fabricate a route when no gate exists', () => {
  const u = { currentPlanet: { id: 'p-other', mine: false, objects: [], blueprints: {}, radius: 14 }, player: { flight: { mode: 'ground' } } } as unknown as Universe;
  expect(guideTarget(u, 'home')).toBeNull(); expect(guideTarget(u, 'save')).toBeNull(); expect(guideTarget(u, 'visit')?.kind).toBe('port');
  expect(guideTarget({ ...u, player: { ...u.player, location: { kind: 'interior' } } } as Universe, 'visit')).toBeNull();
});
it('serves fixed help without an adapter; explicit opt-in alone still cannot send questions', async () => {
  const respond = vi.fn(async () => 'A mock answer');
  for (const options of [{}, { enabled: true }, { respond }]) {
    const service = createGuideHelp(options); expect(service.status.aiEnabled).toBe(false);
    expect(await service.reply({ topic: 'return', language: 'en' })).toEqual({ mode: 'fixed-help', answer: GUIDE_HELP.return.en });
    await expect(service.reply({ topic: 'return', question: 'How do I return?' })).rejects.toThrow('not enabled');
  }
  expect(respond).not.toHaveBeenCalled();
});
it('mock adapter receives only bounded question and public knowledge; refuses extra state fields', async () => {
  const respond = vi.fn(async () => 'x'.repeat(1700)), service = createGuideHelp({ enabled: true, respond });
  await expect(service.reply({ topic: 'save', question: 'hello', player: { private: 'data' } })).rejects.toThrow('topic');
  await expect(service.reply({ topic: 'save', question: 'x'.repeat(501) })).rejects.toThrow('500');
  expect((await service.reply({ topic: 'save', question: ' How do I save? ' })).answer.length).toBe(1600);
  expect(respond).toHaveBeenCalledOnce(); expect(respond.mock.calls[0]).toEqual(['How do I save?', Object.values(GUIDE_HELP).map(x => x.en).join('\n')]);
});
