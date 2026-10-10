import {createHash} from 'node:crypto';
import type {APIRequestContext} from '@playwright/test';

/** Public runtime provenance only. Cookies, response headers and identity
 * payloads are neither retained nor returned. Call after fixture auth. */
export async function isolatedRuntimeAssets(request:APIRequestContext,baseURL:string){
 const origin=new URL(baseURL);if(!['127.0.0.1','localhost'].includes(origin.hostname)||origin.port!=='8134')throw Error('Runtime evidence is restricted to isolated 8134.');
 const read=async(path:string)=>{const url=new URL(path,origin);if(url.origin!==origin.origin||path!=='/'&&!path.startsWith('/assets/'))throw Error('Unexpected runtime asset location.');const response=await request.get(url.href);if(response.status()!==200)throw Error(`Runtime asset unavailable: ${path} (${response.status()}).`);const body=await response.body();return {body,record:{path,bytes:body.length,sha256:createHash('sha256').update(body).digest('hex')}};};
 const html=await read('/'),paths=[...new Set([...html.body.toString('utf8').matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)].map(match=>match[1]))];
 if(!paths.some(p=>p.endsWith('.js')))throw Error('Served HTML has no local JavaScript entry.');
 const assets=[];for(const path of paths)assets.push((await read(path)).record);
 return {origin:origin.origin,index:html.record,assets,meaning:'SHA256 of actual served HTML and its linked entry/preload/style assets. Static GET only, after existing identity auth; no cookie values, headers or player payloads retained.'};
}
