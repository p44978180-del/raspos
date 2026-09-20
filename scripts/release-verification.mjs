// Publishing gates are shared by the release command and adversarial tests.
export async function verifyReleaseSource(api, repository, release, tag, head) {
  if (release.tag_name !== tag || !release.draft) throw new Error('Release identity or draft state mismatch');
  const target = await api(`/repos/${repository}/commits/${encodeURIComponent(release.target_commitish)}`);
  if (target.sha !== head) throw new Error('Draft release targets a different source commit');
  let ref;
  try { ref = await api(`/repos/${repository}/git/ref/tags/${encodeURIComponent(tag)}`) }
  catch (error) { if (!error.message.startsWith('GitHub 404:')) throw error; return }
  let object = ref.object;
  for (let depth = 0; object?.type === 'tag' && depth < 8; depth++) {
    object = (await api(`/repos/${repository}/git/tags/${object.sha}`)).object;
  }
  if (object?.type !== 'commit' || object.sha !== head) throw new Error('Release tag points to a different source commit');
}

export function verifyAsset(item, {name, bytes, sha256}) {
  if (!item || item.name !== name || item.size !== bytes || item.state !== 'uploaded') throw new Error('Uploaded asset identity/size/state mismatch');
  // Fail closed if GitHub cannot attest the uploaded bytes. Never publish unverified assets.
  if (item.digest !== `sha256:${sha256}`) throw new Error('Uploaded asset checksum missing or mismatched');
}
