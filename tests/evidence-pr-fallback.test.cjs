const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('.github/workflows/post-merge-release-evidence-ebbb.yml', 'utf8');
const snippet = 'async function resolveOriginatingPR' + source.split('async function resolveOriginatingPR')[1].split('const pr = await resolveOriginatingPR(github, owner, repo, mainSha);')[0];
const resolve = vm.runInNewContext(`(function(){ ${snippet} return resolveOriginatingPR; })()`, {URL});
const sha = 'a'.repeat(40), head = 'b'.repeat(40);
const row = {number: 42, updated_at: '2026-01-01', merged_at: '2026-01-01', merged: true,
  merge_commit_sha: sha, base: {ref: 'main', repo: {full_name: 'org/repo'}}, head: {sha: head}};
const next = '<https://api.github.com/repos/org/repo/pulls?per_page=100&page=2>; rel="next"';
function fake(scans, readback=row, associated=[]) {
  let n=0;
  return {rest:{repos:{listPullRequestsAssociatedWithCommit:async()=>({data:associated})}, pulls:{
    list:async ({page})=>{const scan=scans[Math.floor(n++ / 2)]; if (!scan || !scan[page-1]) throw Error('incomplete'); return scan[page-1]},
    get:async()=>({data:readback})}}};
}
const page = {data:[{...row, number: 1, merge_commit_sha:head}], headers:{link:next}};
const last = {data:[row], headers:{}};
test('two complete matching scans and direct PR lookup', async()=>{
  assert.equal((await resolve(fake([[page,last],[page,last]]),'org','repo',sha)).data.number,42);
});
test('inventory drift fails closed', async()=>{
  const changed={data:[{...row, updated_at:'later'}]};
  await assert.rejects(resolve(fake([[page,last],[page,changed]]),'org','repo',sha),/changed/);
});
test('duplicate and incomplete inventories fail closed', async()=>{
  await assert.rejects(resolve(fake([[page,{data:[{...row,number:1}]}]]),'org','repo',sha),/duplicate/);
  await assert.rejects(resolve(fake([[page]]),'org','repo',sha));
});
test('multiple matches fail and independent readback is checked', async()=>{
  const multi={data:[row,{...row,number:43}]};
  assert.equal(await resolve(fake([[page,multi],[page,multi]]),'org','repo',sha),null);
  await assert.rejects(resolve(fake([[page,last],[page,last]],{...row,merge_commit_sha:head}),'org','repo',sha),/readback/);
});
test('existing associated match skips fallback; API errors are propagated',async()=>{
  assert.equal((await resolve(fake([],row,[row]),'org','repo',sha)).data.number,42);
  const x=fake([]); x.rest.repos.listPullRequestsAssociatedWithCommit=async()=>{throw Error('API error')};
  await assert.rejects(resolve(x,'org','repo',sha),/API error/);
});
test('no matching merge stays unqualified',async()=>{
  const nonmatch={data:[{...row,merge_commit_sha:head}]};
  assert.equal(await resolve(fake([[page,nonmatch],[page,nonmatch]]),'org','repo',sha),null);
});
test('direct lookup errors are propagated',async()=>{
  const x=fake([],row,[row]); x.rest.pulls.get=async()=>{throw Error('readback error')};
  await assert.rejects(resolve(x,'org','repo',sha),/readback error/);
});
test('reject malformed and hostile pagination links', async()=>{
  const bad = [
    'nonsense',
    '<https://evil.example/repos/org/repo/pulls?per_page=100&page=2>; rel="next"',
    '<https://api.github.com/repos/org/other/pulls?per_page=100&page=2>; rel="next"',
    '<https://api.github.com/repos/org/repo/pulls?per_page=100&page=3>; rel="next"',
    '<https://api.github.com/repos/org/repo/pulls?per_page=50&page=2>; rel="next"',
    '<https://api.github.com/repos/org/repo/pulls?per_page=100&page=2&page=3>; rel="next"',
    '<https://api.github.com/repos/org/repo/pulls?per_page=100&page=2>; rel="next", invalid'
  ];
  for (const link of bad) await assert.rejects(resolve(fake([[{data:[row],headers:{link}}]]),'org','repo',sha));
});
test('reject full page without next link',async()=>{
  const rows=Array.from({length:100},(_,i)=>({...row,number:i+1}));
  await assert.rejects(resolve(fake([[{data:rows}]]),'org','repo',sha),/Full PR page/);
});
test('page cap and empty page with next fail closed',async()=>{
  const empty = fake([[{data:[],headers:{link:next}}]]);
  await assert.rejects(resolve(empty,'org','repo',sha),/Incomplete PR pagination/);
  let count=0;
  const x=fake([]);
  x.rest.pulls.list=async({page})=>{count++; return {data:[{...row,number:page}],headers:{link:`<https://api.github.com/repos/org/repo/pulls?per_page=100&page=${page+1}>; rel="next"`}}};
  await assert.rejects(resolve(x,'org','repo',sha),/Incomplete PR pagination/);
  assert.equal(count,100);
});
