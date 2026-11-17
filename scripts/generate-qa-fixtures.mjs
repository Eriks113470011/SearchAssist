import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {assignments} from '../dist/workspace.mjs';
import * as study from '../dist/study.mjs';
const root=resolve('qa-fixtures'),plan={prefix:'QA_',start:1,count:18};
const at=ms=>({wall:Date.UTC(2026,10,17)+ms,mono:ms});
function fixture(config,count=12) {
  const s=study.createSession(config,at(0));let ms=0;
  const ratings={A:{confidence:2,trust:4,ease:6},B:{confidence:4,trust:4,ease:4},C:{confidence:6,trust:4,ease:2}};
  for(let i=0;i<count;i++) {
    study.startTrial(s,at(ms));ms+=({A:1000,B:700,C:400})[s.order[Math.floor(i/4)]];
    study.completeTrial(s,study.taskAt(s).target,at(ms));
    if(s.phase==='ratings')study.addRatings(s,{...ratings[s.order[Math.floor(i/4)]],notes:'Synthetic QA only'},at(ms));
  }
  return JSON.stringify(study.snapshot(s,at(ms)),null,2)+'\n';
}
await mkdir(resolve(root,'clean'),{recursive:true});await mkdir(resolve(root,'edge'),{recursive:true});
// Exclusive writes prevent overwriting an existing folder's files. Delete/move it before rerunning.
const save=(path,text)=>writeFile(resolve(root,path),text,{flag:'wx'});
for(const a of assignments(plan))await save('clean/'+a.participant+'.json',fixture(a));
await save('edge/duplicate-QA_001.json',fixture({participant:'qa_001',order:'CBA',setRotation:2}));
await save('edge/partial-QA_019.json',fixture({participant:'QA_019',order:'ABC',setRotation:0},4));
await save('edge/invalid.json','{\n');
await save('readme.txt','SYNTHETIC QA ONLY — never pool with participant data.\nUse clean/ first: set prefix QA_, start 1, count 18 and Generate schedule. Expect 18 matching complete recordings, 100% success, A/B/C mean times 1.00/0.70/0.40 s; paired B-A/C-A/C-B times -0.30/-0.60/-0.30 s. Confidence medians A/B/C 2/4/6; trust 4/4/4; ease 6/4/2. Each of the 18 balance cells has one planned and included matching recording.\nAdd edge/ separately to test duplicates, partial inclusion, invalid isolation, and undo. A newly duplicated QA_001 needs an explicit selection. QA_019 is outside the 18-code plan and incomplete. Undo removes those three added files.\n');
console.log('Created synthetic fixtures in '+root+'. See docs/ACCEPTANCE-v1.0.md.');
