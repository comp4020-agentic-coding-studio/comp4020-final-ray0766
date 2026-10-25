import {afterEach,expect,it} from 'vitest';
import {mkdtempSync,rmSync,existsSync} from 'node:fs';
import {join} from 'node:path';import {tmpdir} from 'node:os';
import {openStore} from '../src/server/store.ts';
import {presenceStore} from '../src/server/presence.ts';
import {defaultAppearance,appearanceOf,APPEARANCE_OPTIONS,validAppearance} from '../src/shared/appearance.ts';
import {normalize,SPAWN} from '../src/shared/world.ts';
const stores:ReturnType<typeof openStore>[]=[],dirs:string[]=[];
function open(path=':memory:'){const s=openStore(path);stores.push(s);return s;}
afterEach(()=>{for(const s of stores.splice(0))if(s.db.isOpen)s.close();for(const d of dirs.splice(0))rmSync(d,{recursive:true,force:true});});
const sample={...defaultAppearance('fern'),model:'sample' as const,skin:'deep' as const,hair:'bob' as const};
it('defaults legacy users to the new traveller and validates the finite exact option schema',()=>{
 const s=open();s.create('a');expect(s.state('a').appearance).toBeUndefined();expect(appearanceOf(s.state('a')).model).toBe('sample');
 for(const [key,values]of Object.entries(APPEARANCE_OPTIONS))for(const value of values)expect(validAppearance({...sample,[key]:value})).toBe(true);
 for(const appearance of [null,[],{}, {...sample,version:2},{...sample,skin:'#ffffff'}, {...sample,face:'<script>'},{...sample,extra:1}])expect(()=>s.appearance('a',{expectedRevision:0,appearance})).toThrow();
 for(const extra of [{playerId:'b'},{id:'b'},{revision:1}])expect(()=>s.appearance('a',{expectedRevision:0,appearance:sample,...extra})).toThrow();
 for(const revision of [-1,1.5,'0',null])expect(()=>s.appearance('a',{expectedRevision:revision,appearance:sample})).toThrow();
 expect(s.state('a').appearance).toBeUndefined();
});
it('only changes the authenticated identity, publishes authoritative appearance, and persists after restart',()=>{
 const d=mkdtempSync(join(tmpdir(),'appearance-'));dirs.push(d);const path=join(d,'test.sqlite'),s=open(path);s.create('a');s.create('b');const before=s.state('b');
 const saved=s.appearance('a',{expectedRevision:0,appearance:sample});expect(saved.appearance).toEqual({revision:1,options:sample});expect(saved.character).toBe('fern');expect(s.state('b')).toEqual(before);
 const p=presenceStore(s.state),body={planetId:'hub',facing:normalize([0,SPAWN[2],-SPAWN[1]])};p.heartbeat('a',body,100);expect(p.heartbeat('b',body,100).visitors[0].appearance).toEqual(saved.appearance);expect(()=>p.heartbeat('b',{...body,appearance:sample},120)).toThrow();
 s.close();const reopened=open(path);expect(reopened.state('a').appearance).toEqual(saved.appearance);expect(reopened.state('b').appearance).toBeUndefined();
});
it('rejects stale competing saves, accepts an idempotent retry and preserves parameters while using legacy coats',()=>{
 const s=open();s.create('a');s.appearance('a',{expectedRevision:0,appearance:sample});const first=s.state('a');
 s.appearance('a',{expectedRevision:0,appearance:sample});expect(s.state('a').revision).toBe(first.revision);
 expect(()=>s.appearance('a',{expectedRevision:0,appearance:{...sample,hair:'crop'}})).toThrow('another tab');expect(s.state('a').appearance).toEqual(first.appearance);
 s.appearance('a',{expectedRevision:1,appearance:{...sample,face:'oval'}});expect(s.state('a').appearance?.options).toEqual({...sample,face:'oval'});
 s.character('a','sky');expect(s.state('a').appearance).toEqual({revision:3,options:{...sample,face:'oval',coat:'sky'}});
 expect(()=>s.appearance('a',{expectedRevision:2,appearance:sample})).toThrow('another tab');
});
it('rolls back both appearance and coat when a write fails',()=>{const s=open();s.create('a');const before=s.state('a');s.db.exec("CREATE TRIGGER fail_appearance BEFORE UPDATE ON players BEGIN SELECT RAISE(ABORT,'injected failure'); END");expect(()=>s.appearance('a',{expectedRevision:0,appearance:sample})).toThrow('injected failure');expect(s.state('a')).toEqual(before);expect(s.db.isTransaction).toBe(false);});
it('backs up schema 18 and adds an empty side table without rewriting old players',()=>{
 const d=mkdtempSync(join(tmpdir(),'appearance-migration-'));dirs.push(d);const path=join(d,'test.sqlite'),s=open(path);s.create('old');const before=s.db.prepare('SELECT * FROM players').all();s.db.exec('DROP TABLE player_appearances; PRAGMA user_version=18');s.close();const migrated=open(path);expect(migrated.db.prepare('PRAGMA user_version').get()!.user_version).toBe(20);expect(migrated.migrationBackup&&existsSync(migrated.migrationBackup)).toBeTruthy();expect(migrated.db.prepare('SELECT * FROM players').all()).toEqual(before);expect(migrated.db.prepare('SELECT count(*) AS n FROM player_appearances').get()!.n).toBe(0);
});
