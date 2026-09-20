import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {github,repository} from './github-api.mjs';
import {verifyReleaseSource,verifyAsset} from './release-verification.mjs';
const root=path.resolve(import.meta.dirname,'..');
const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
const dir=path.join(root,'releases');
const receipt=JSON.parse(fs.readFileSync(path.join(dir,'build-release.json'),'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const apk=path.join(dir,receipt.filename);
if(receipt.mode!=='release'||receipt.version!==version||sha(fs.readFileSync(apk))!==receipt.sha256||!receipt.certificateSha256)throw new Error('Signed release receipt/artifact mismatch; build a new release first.');
const report=path.join(root,'docs/release-report.html');
const notes=fs.readFileSync(path.join(root,'docs/RELEASE-NOTES.md'),'utf8');
if(!fs.existsSync(report))throw new Error('Verified release report is required.');
const zip=path.join(dir,`tim-campus-${version}-web.zip`);
const python=process.env.PYTHON || 'python';
const archive=spawnSync(python,['-c','import pathlib,sys,zipfile; base=pathlib.Path(sys.argv[1]); z=zipfile.ZipFile(sys.argv[2],"w",zipfile.ZIP_DEFLATED); [(z.write(p,p.relative_to(base))) for p in base.rglob("*") if p.is_file()]; z.close()',path.join(root,'dist'),zip],{stdio:'inherit',windowsHide:true});
if(archive.status!==0)throw new Error('Web archive failed.');
const assets=[apk,apk+'.sha256',zip,report,path.join(dir,'build-release.json')];
const checksums=assets.map(file=>`${sha(fs.readFileSync(file))}  ${path.basename(file)}`).join('\n')+'\n';
fs.writeFileSync(path.join(dir,'SHA256SUMS.txt'),checksums);assets.push(path.join(dir,'SHA256SUMS.txt'));
if(process.argv.includes('--package-only')){console.log(assets.map(f=>path.basename(f)).join('\n'));process.exit(0)}
const git=(args)=>{const r=spawnSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true});if(r.status!==0)throw new Error('Git check failed');return r.stdout.trim()};
const head=git(['rev-parse','HEAD']);
if(git(['status','--porcelain']))throw new Error('Commit the reviewed source before publishing.');
if(receipt.commit!==head)throw new Error('Build receipt does not match the committed source; rebuild after commit.');
const remote=await github(`/repos/${repository}/commits/main`);
if(remote.sha!==head)throw new Error('Push the reviewed commit before publishing.');
const tag=`v${version}`;
let release;
try{release=await github(`/repos/${repository}/releases/tags/${tag}`)}catch(error){if(!error.message.startsWith('GitHub 404:'))throw error}
if(release && !release.draft)throw new Error('Published releases are immutable; increment the version to publish changes.');
release ||= await github(`/repos/${repository}/releases`,{method:'POST',body:{tag_name:tag,target_commitish:head,name:`ТИМ Кампус ${version}`,body:notes,draft:true,prerelease:true}});
await verifyReleaseSource(github,repository,release,tag,head);
const old=await github(`/repos/${repository}/releases/${release.id}/assets`);
for(const file of assets){
  const name=path.basename(file),bytes=fs.readFileSync(file);
  const existing=old.find(a=>a.name===name);
  if(existing){
    verifyAsset(existing,{name,bytes:bytes.length,sha256:sha(bytes)});
    continue;
  }
  await github(`https://uploads.github.com/repos/${repository}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`,{method:'POST',body:bytes,contentType:name.endsWith('.apk')?'application/vnd.android.package-archive':'application/octet-stream'});
}
const uploaded=await github(`/repos/${repository}/releases/${release.id}/assets`);
for(const file of assets){const name=path.basename(file);verifyAsset(uploaded.find(a=>a.name===name),{name,bytes:fs.statSync(file).size,sha256:sha(fs.readFileSync(file))})}
await verifyReleaseSource(github,repository,await github(`/repos/${repository}/releases/${release.id}`),tag,head);
const published=await github(`/repos/${repository}/releases/${release.id}`,{method:'PATCH',body:{draft:false,prerelease:true}});
console.log(`Published verified release: ${published.html_url}`);
