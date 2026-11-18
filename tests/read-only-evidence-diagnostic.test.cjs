// Offline-only tests: no network calls, secrets, releases, or GitHub writes.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const file='.github/workflows/post-merge-evidence-readonly-diagnostic.yml';
const source=fs.readFileSync(file,'utf8');
function run(scenario){return JSON.parse(execFileSync(process.execPath,['tests/org-policy-mock-collector.cjs',file,scenario,'active_source'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));}
test('diagnostic has no production write or publication path',()=>{
 assert.match(source,/workflow_call:/);
 assert.doesNotMatch(source,/^\s+(?:contents|statuses|actions|checks|pull-requests):\s*write\s*$/m);
 assert.doesNotMatch(source,/gh release (?:create|upload)|createCommitStatus|actions\/upload-artifact/);
 assert.ok(source.includes('Read-only diagnostic; no release, status, artifact or qualification is published.'));
});
test('missing real coverage and parentless commits stay unqualified inputs',()=>{
 const missing=run('missing-artifact');assert.equal(missing.post_merge.coverage,'FAIL');
 const genesis=run('genesis');assert.deepEqual(genesis.main_parents,[]);assert.equal(genesis.originating_pr,null);
});
test('bad provenance does not silently continue',()=>{
 for (const scenario of ['malformed-link','hostile-link','association-error','duplicate-artifact','run-race']) assert.throws(()=>run(scenario));
});
