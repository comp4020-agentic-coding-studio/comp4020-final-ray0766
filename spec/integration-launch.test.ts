import { expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { integratedStartup } from '../src/server/launch-options.ts';

it('keeps ordinary production and NODE_ENV=test startup integrated unless the fixture is explicitly requested',()=>{
  expect(integratedStartup({},'.data/little-post.sqlite',false)).toBe(true);
  expect(integratedStartup({NODE_ENV:'test'},':memory:',false)).toBe(true);
  expect(integratedStartup({},':memory:',true)).toBe(false);
  expect(()=>integratedStartup({TEST_LEGACY_WORLD:'1',DATABASE_PATH:':memory:',HOST:'127.0.0.1'},':memory:',false)).toThrow('NODE_ENV=test');
});

it('allows the explicit legacy HTTP fixture without creating files, and refuses existing databases or the main path',()=>{
  const env={NODE_ENV:'test',TEST_LEGACY_WORLD:'1',HOST:'127.0.0.1',DATABASE_PATH:':memory:'};
  expect(integratedStartup(env,':memory:',false)).toBe(false);
  expect(()=>integratedStartup(env,':memory:',true)).toThrow('without HOME_SAMPLE');
  expect(()=>integratedStartup({...env,HOST:'0.0.0.0'},':memory:',false)).toThrow('HOST=127.0.0.1');
  expect(()=>integratedStartup({...env,DATABASE_PATH:'.data/little-post.sqlite'},'.data/little-post.sqlite',false)).toThrow('main database');
  const dir=mkdtempSync(join(tmpdir(),'integration-launch-'));
  try{
    const path=join(dir,'fixture.sqlite');expect(integratedStartup({...env,DATABASE_PATH:path},path,false)).toBe(false);expect(existsSync(path)).toBe(false);
    writeFileSync(path,'original fixture bytes');
    expect(()=>integratedStartup({...env,DATABASE_PATH:path},path,false)).toThrow('existing database');expect(readFileSync(path,'utf8')).toBe('original fixture bytes');
  }finally{rmSync(dir,{recursive:true,force:true});}
});
