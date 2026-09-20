import {spawnSync} from 'node:child_process';

export const repository='p44978180-del/raspos';
let token;
export function githubToken(){
  if(token)return token;
  token=process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if(!token){
    const result=spawnSync('git',['credential','fill'],{input:'protocol=https\nhost=github.com\n\n',encoding:'utf8',windowsHide:true,env:{...process.env,GIT_TERMINAL_PROMPT:'0'}});
    const fields=Object.fromEntries((result.stdout || '').trim().split(/\r?\n/).map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1)]}));
    token=fields.password;
  }
  if(!token)throw new Error('GitHub credentials unavailable. Configure Git Credential Manager or GITHUB_TOKEN.');
  return token;
}
export async function github(endpoint,{method='GET',body,contentType='application/json'}={}){
  const url=new URL(endpoint.startsWith('https:')?endpoint:`https://api.github.com${endpoint}`);
  if(!['api.github.com','uploads.github.com'].includes(url.hostname)||url.protocol!=='https:')throw new Error('Unexpected GitHub endpoint');
  const res=await fetch(url,{method,redirect:'error',signal:AbortSignal.timeout(120000),headers:{Authorization:`Bearer ${githubToken()}`,Accept:'application/vnd.github+json','User-Agent':'TIM-Campus-Release','X-GitHub-Api-Version':'2022-11-28',...(body?{'Content-Type':contentType}:{})},body:body?(typeof body==='object'&&!Buffer.isBuffer(body)?JSON.stringify(body):body):undefined});
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(`GitHub ${res.status}: ${data.message || 'request failed'}`);
  return data;
}
