import {createHash} from 'node:crypto';
export const hash=value=>createHash('sha256').update(value).digest('hex');
const quote=s=>'"'+s.replaceAll('"','""')+'"';
export function fingerprint(db,previous){
 const tables=previous??Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({name})=>[name,{columns:db.prepare('PRAGMA table_info('+quote(name)+')').all().map(c=>c.name)}]));
 return Object.fromEntries(Object.entries(tables).map(([name,{columns}])=>{const rows=db.prepare('SELECT '+columns.map(quote).join(',')+' FROM '+quote(name)).all().map(r=>JSON.stringify(r)).sort();return[name,{columns,rows:rows.length,sha256:hash(JSON.stringify(rows))}];}));
}
export function health(db){return{schema:Number(db.prepare('PRAGMA user_version').get().user_version),integrity:db.prepare('PRAGMA integrity_check').all().map(r=>r.integrity_check),foreignKeys:db.prepare('PRAGMA foreign_key_check').all().length};}
