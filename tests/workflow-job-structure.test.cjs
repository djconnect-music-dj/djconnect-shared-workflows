const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const expected={
 'djconnect-python-5f12.yml':['software-assurance-governance','dependency-audit','tests','ruff','bandit'],
 'djconnect-semgrep-733.yml':['software-assurance-governance','semgrep'],
 'djconnect-codeql-191.yml':['software-assurance-governance','analyze'],
 'djconnect-semgrep-191.yml':['software-assurance-governance','semgrep'],
};
for (const [file,jobs] of Object.entries(expected)) test(`${file} retains all job boundaries`,()=>{
 const text=fs.readFileSync(`.github/workflows/${file}`,'utf8');
 const sections=text.split(/^jobs:\s*$/m);assert.equal(sections.length,2);
 const actual=[...sections[1].matchAll(/^  ([a-zA-Z0-9_-]+):\s*$/gm)].map(m=>m[1]);
 assert.deepEqual(actual,jobs);
});

test('duplicate YAML keys are rejected',()=>{
 const {spawnSync}=require('node:child_process');
 const result=spawnSync('ruby',['scripts/validate_workflow_yaml.rb','tests/fixtures/duplicate-workflow.yml.fixture'],{encoding:'utf8'});
 assert.notEqual(result.status,0);assert.match(result.stderr,/duplicate key runs-on/);
});
