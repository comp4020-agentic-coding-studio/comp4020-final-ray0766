import { expect, it } from 'vitest';
import { SaveProgress } from '../src/client/save-progress.ts';

it('an acknowledgement only clears its captured movement, including while another save is queued', () => {
  const progress = new SaveProgress();
  progress.dirty('ground'); expect(progress.phase).toBe('pending');
  const first = progress.begin('ground'); expect(progress.phase).toBe('saving');
  progress.dirty('ground'); progress.acknowledge(first);
  expect(progress.phase).toBe('pending');
  const second = progress.begin('ground'); progress.acknowledge(first);
  expect(progress.phase).toBe('saving');
  progress.acknowledge(second); expect(progress.phase).toBe('saved');
});
it('late replies after reconnect cannot clear movement in the recovered visit', () => {
  const progress = new SaveProgress(); progress.dirty('flight');
  const old = progress.begin('flight'); progress.reset('flight');
  progress.dirty('flight'); const current = progress.begin('flight');
  progress.acknowledge(old); expect(progress.phase).toBe('saving');
  progress.dirty('flight'); progress.acknowledge(current); expect(progress.phase).toBe('pending');
});
it('ground and flight acknowledgements stay independent and notifications report phase changes', () => {
  const phases: string[] = [], progress = new SaveProgress(() => phases.push(progress.phase));
  progress.dirty('ground'); progress.dirty('ground'); const ground = progress.begin('ground');
  progress.dirty('flight'); progress.acknowledge(ground); expect(progress.phase).toBe('pending');
  const flight = progress.begin('flight'); progress.acknowledge(flight);
  expect(phases).toEqual(['pending', 'saving', 'pending', 'saving', 'saved']);
});
