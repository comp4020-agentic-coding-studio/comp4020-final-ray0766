import {expect,it,vi} from 'vitest';
import {createStateLoader} from '../src/client/state-loader.ts';
import type {PlayerState} from '../src/shared/world.ts';

it('shares one identity-establishing request across bootstrap and reconnect ticks',async()=>{
  let resolve!:(state:PlayerState)=>void;
  const load=vi.fn(()=>new Promise<PlayerState>(done=>{resolve=done;})),loader=createStateLoader(load);
  const initial=loader.read(),reconnect=loader.read(),laterTick=loader.read();
  expect(load).toHaveBeenCalledTimes(1);expect(loader.pending).toBe(true);
  const state={planetId:'one-home',revision:0} as PlayerState;resolve(state);
  expect(await initial).toBe(state);expect(await reconnect).toBe(state);expect(await laterTick).toBe(state);expect(loader.pending).toBe(false);
  const next=loader.read();expect(load).toHaveBeenCalledTimes(2);resolve(state);await next;
});
it('releases a failed request so an explicit reconnect can retry',async()=>{
  const state={planetId:'home',revision:0} as PlayerState;
  const load=vi.fn<()=>Promise<PlayerState>>().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(state),loader=createStateLoader(load);
  await expect(loader.read()).rejects.toThrow('offline');expect(loader.pending).toBe(false);
  expect(await loader.read()).toBe(state);expect(load).toHaveBeenCalledTimes(2);
});
