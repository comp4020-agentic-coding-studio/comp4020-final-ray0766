import {existsSync} from 'node:fs';
export function guideConfiguration(env:NodeJS.ProcessEnv,exists:(path:string)=>boolean=existsSync){
 if(env.GUIDE_AI_ENABLED!=='1')return null;
 const ledger=env.GUIDE_AI_LEDGER_PATH,key=env.DEEPSEEK_API_KEY,production=env.GUIDE_AI_DEPLOYMENT==='production';
 if(!ledger||!key)throw Error('Guide configuration is incomplete.');
 if(production){
  if(env.FLY_APP_NAME!=='comp4020-final-ray0766'||(env.HOST??'0.0.0.0')!=='0.0.0.0'||ledger!=='/data/guide-ai/trial.sqlite'||!exists(ledger))throw Error('Production guide requires the authorised app and transferred persistent ledger.');
 }else if(env.GUIDE_AI_DEPLOYMENT||env.HOST!=='127.0.0.1')throw Error('Guide access requires an explicit authorised deployment.');
 return{ledger,key,production};
}
