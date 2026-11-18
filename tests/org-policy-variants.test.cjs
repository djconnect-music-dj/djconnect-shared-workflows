// Offline synthetic tests; no GitHub requests, secrets, release or deployment.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {execFileSync} = require('node:child_process');
const P='89a2a8b4c7571965249bed745bf7c5c37a1221f1';
const variants=[['.github/workflows/software-assurance-governance-org-v1.yml','governance-3d7d'],['.github/workflows/post-merge-release-evidence-org-487.yml','evidence-4877'],['.github/workflows/post-merge-release-evidence-org-ebbb.yml','evidence-ebbb']];
for (const [file,snapshot] of variants) {
  test(`${snapshot} uses the exact public policy source`,()=>{
    const text=fs.readFileSync(file,'utf8');
    assert.match(text,/workflow_call:/);
    assert.match(text,/1461539726/);
    assert.ok(text.includes('djconnect-music-dj/.github'));
    assert.ok(text.includes(P));
    assert.ok(text.includes('policy-snapshots/'+snapshot));
    assert.ok(!text.includes('27b4501fa92a6a4ca3f41e2b3e0c59333850be02'));
    if(snapshot.startsWith('evidence-')) {
      assert.equal((text.match(/validate_record\(record, expected_policy_source=/g)||[]).length,2);
      assert.ok(text.includes(`run: test "$POLICY_REF" = "${P}"`));
    }
  });
}
function collect(file,scenario,role){
  return JSON.parse(execFileSync(process.execPath,['tests/org-policy-mock-collector.cjs',file,scenario,role],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
}
for (const file of variants.slice(1).map(x=>x[0])) {
  test(`${file} collector fails closed for root and missing evidence`,()=>{
    const normal=collect(file,'success','active_source');
    assert.equal(normal.main_sha,'a'.repeat(40));
    assert.equal(normal.post_merge.ci,'PASS');
    assert.equal(normal.post_merge.coverage,'PASS');
    const root=collect(file,'genesis','active_source');
    assert.deepEqual(root.main_parents,[]);
    assert.equal(root.originating_pr,null);
    const missing=collect(file,'missing-artifact','active_source');
    assert.equal(missing.post_merge.coverage,'FAIL');
    const wrong=collect(file,'wrong-sha','active_source');
    assert.equal(wrong.post_merge.ci,'FAIL');
  });
}
test('distribution collector fails closed for invalid pagination',()=>{
  const file=variants[1][0];
  const req=collect(file,'success','distribution');
  assert.equal(req.post_merge.distribution_integrity,'PASS');
  const two = collect(file,'repository-id-pages','distribution');
  assert.deepEqual(two.originating_pr.main_changed_files,['x.py','y.py']);
  for (const scenario of ['malformed-link','hostile-link','unknown-relation','wrong-page','extra-query','association-error','wrong-repository-id','wrong-commit-id']) {
    assert.throws(()=>collect(file,scenario,'distribution'));
  }
  const ambiguous=collect(file,'ambiguous-pr','distribution');
  assert.equal(ambiguous.originating_pr,null);
});
for (const file of variants.slice(1).map(x=>x[0])) {
  test(`${file} rejects stale, ambiguous and misbound run evidence`,()=>{
    for (const role of ['active_source','distribution']) {
      for (const scenario of ['ambiguous-workflow','ambiguous-time','duplicate-run','newer-run-race','latest-failed','latest-running','rerun','run-race','duplicate-artifact','expired-artifact','wrong-artifact-run','wrong-artifact-repo','wrong-artifact-sha','old-artifact','invalid-digest']) {
        let req;
        try { req=collect(file,scenario,role); } catch { continue; }
        assert.ok(req.post_merge.ci==='FAIL' || (role==='distribution' ? req.post_merge.distribution_integrity==='FAIL' : req.post_merge.coverage==='FAIL'),scenario);
      }
    }
  });
}
