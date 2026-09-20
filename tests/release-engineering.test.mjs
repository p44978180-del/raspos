import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyReleaseSource,verifyAsset} from '../scripts/release-verification.mjs';
const head='a'.repeat(40), other='b'.repeat(40), tag='v4.0.0';
const draft={tag_name:tag,draft:true,target_commitish:head};
const api=(object,target=head)=>async url=>url.includes('/commits/')?{sha:target}:url.includes('/git/tags/')?{object:{type:'commit',sha:head}}:{object};
test('accepts matching lightweight and annotated tags',async()=>{
  await verifyReleaseSource(api({type:'commit',sha:head}),'owner/repo',draft,tag,head);
  await verifyReleaseSource(api({type:'tag',sha:other}),'owner/repo',draft,tag,head);
});
test('rejects an older tag even if draft target matches current source',async()=>{
  await assert.rejects(verifyReleaseSource(api({type:'commit',sha:other}),'owner/repo',draft,tag,head),/tag points/);
});
test('rejects mismatched draft target and already published releases',async()=>{
  await assert.rejects(verifyReleaseSource(api(null,other),'owner/repo',draft,tag,head),/targets/);
  await assert.rejects(verifyReleaseSource(api(null),'owner/repo',{...draft,draft:false},tag,head),/identity/);
});
test('allows a new draft with no tag but does not hide network failures',async()=>{
  await verifyReleaseSource(async url=>{if(url.includes('/commits/'))return{sha:head};throw new Error('GitHub 404: not found')},'o/r',draft,tag,head);
  await assert.rejects(verifyReleaseSource(async()=>{throw new Error('timeout')},'o/r',draft,tag,head),/timeout/);
});
test('requires attested exact bytes and a complete upload',()=>{
  const expected={name:'app.apk',bytes:100,sha256:head};
  const asset={name:expected.name,size:100,state:'uploaded',digest:`sha256:${head}`};
  verifyAsset(asset,expected);
  for(const change of [{digest:null},{digest:`sha256:${other}`},{size:101},{state:'starter'},{name:'other.apk'}])assert.throws(()=>verifyAsset({...asset,...change},expected));
});
