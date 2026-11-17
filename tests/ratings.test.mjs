import test from 'node:test';
import assert from 'node:assert/strict';
import * as study from '../dist/study.mjs';
import {assignments,reviewFiles} from '../dist/workspace.mjs';
import {exportProject,parseProject} from '../dist/review-project.mjs';
import {ratingSummary,pairedRatingSummary,ratingSummaryCsv,pairedRatingSummaryCsv} from '../dist/ratings.mjs';
import {studySummaryAssets} from '../dist/study-summary.mjs';

const plan={prefix:'PRIVATE_',start:1,count:18},date='2026-11-14T12:00:00Z';
const at=ms=>({wall:Date.UTC(2026,10,14)+ms,mono:ms});
const defaults={A:{confidence:2,trust:4,ease:6},B:{confidence:4,trust:4,ease:4},C:{confidence:6,trust:4,ease:2}};
function recording({participant='PRIVATE_001',order='ABC',setRotation=0,count=12,submitLast=true,ratings=defaults,interrupted=false}={}) {
  const s=study.createSession({participant,order,setRotation},at(0));let ms=0;
  for(let i=0;i<count;i++) {
    study.startTrial(s,at(ms));study.setQuery(s,'PRIVATE_QUERY');
    if(interrupted){study.pauseTrial(s,'manual',at(ms+100));study.resumeTrial(s,at(ms+1100));ms+=1000;}
    ms+=500;study.completeTrial(s,study.taskAt(s).target,at(ms));
    if(s.phase==='ratings') {
      const condition=order[Math.floor(i/4)],values={...ratings[condition],notes:'PRIVATE_OBSERVATION'};
      if(i===count-1&&!submitLast)s.ratingDraft=values;else study.addRatings(s,values,at(ms));
    }
  }
  return JSON.stringify(study.snapshot(s,at(ms)));
}
const entries=(...configs)=>reviewFiles(configs.map((config,i)=>({name:`PRIVATE_FILE_${i}.json`,text:recording(config)})));
const row=(rows,condition,measure='confidence')=>rows.find(r=>r.condition===condition&&r.measure===measure);
const paired=(rows,comparison,measure='confidence')=>rows.find(r=>r.comparison===comparison&&r.measure===measure);

test('empty rating summaries retain all questions, zero counts, and missing medians',()=>{
  const r=ratingSummary([]),p=pairedRatingSummary([]);assert.equal(r.length,9);assert.equal(p.length,9);
  assert.ok(r.every(r=>r.median===null&&r.submittedRatings===0&&r.missingRatings===0));
  assert.ok(p.every(r=>r.pairedParticipants===0&&r.higher===0&&r.same===0&&r.lower===0));
});
test('distributions and odd/even medians retain separate questions and all seven response points',()=>{
  const e=entries(...[1,2,7].map((n,i)=>({participant:`PRIVATE_${i+1}`,ratings:{...defaults,A:{confidence:n,trust:3,ease:7}}})));
  const a=row(ratingSummary(e),'A');assert.equal(a.median,2);assert.equal(a.submittedRatings,3);assert.equal(a.missingRatings,0);
  assert.deepEqual(Array.from({length:7},(_,i)=>a['count'+(i+1)]),[1,1,0,0,0,0,1]);
  assert.equal(row(ratingSummary(e),'A','trust').median,3);assert.equal(row(ratingSummary(e),'A','ease').median,7);
  assert.equal(row(ratingSummary(e,{choices:{1:false}}),'A').median,4);
  assert.equal(row(ratingSummary(entries({})),'B').median,4);
});
test('condition labels and matched directions work across every order and rotation',()=>{
  for(const config of assignments(plan)) {
    const e=entries(config),r=ratingSummary(e),p=pairedRatingSummary(e);
    assert.deepEqual(['A','B','C'].map(c=>row(r,c).median),[2,4,6]);
    for(const comparison of ['B - A','C - A','C - B']) {
      assert.equal(paired(p,comparison).higher,1);assert.equal(paired(p,comparison,'trust').same,1);assert.equal(paired(p,comparison,'ease').lower,1);
    }
  }
});
test('unfinished drafts never become submitted ratings or matched observations',()=>{
  const e=entries({count:8,submitLast:false});assert.equal(e[0].session.ratingDraft.confidence,4);
  assert.equal(row(ratingSummary(e),'A').submittedRatings,0);
  const options={includePartial:true},r=ratingSummary(e,options),p=pairedRatingSummary(e,options);
  assert.equal(row(r,'A').submittedRatings,1);assert.equal(row(r,'B').submittedRatings,0);assert.equal(row(r,'B').missingRatings,1);assert.equal(row(r,'B').median,null);
  assert.equal(paired(p,'B - A').pairedParticipants,0);assert.equal(paired(p,'B - A').unpairedParticipants,1);
});
test('partial recordings can contribute different submitted and matched participant sets',()=>{
  const e=entries({count:8},{participant:'PRIVATE_002',order:'CAB',count:8},{participant:'PRIVATE_003',count:4,submitLast:false}),options={includePartial:true};
  const r=ratingSummary(e,options),p=pairedRatingSummary(e,options);
  assert.deepEqual(['A','B','C'].map(c=>row(r,c).submittedRatings),[2,1,1]);
  assert.deepEqual(['B - A','C - A','C - B'].map(c=>paired(p,c).pairedParticipants),[1,1,0]);
  assert.deepEqual(['B - A','C - A','C - B'].map(c=>paired(p,c).unpairedParticipants),[2,2,3]);
});
test('invalid files, case-insensitive duplicates, explicit choices, and conflicts follow existing inclusion rules',()=>{
  const e=reviewFiles([{name:'bad.json',text:'{'},{name:'one.json',text:recording({})},{name:'two.json',text:recording({participant:'private_001'})},{name:'three.json',text:recording({participant:'PRIVATE_002'})}]);
  assert.equal(row(ratingSummary(e),'A').submittedRatings,1);
  assert.equal(row(ratingSummary(e,{choices:{1:true}}),'A').submittedRatings,2);
  const options={choices:{1:true,2:true,3:false}};
  assert.equal(row(ratingSummary(e,options),'A').submittedRatings,0);assert.equal(paired(pairedRatingSummary(e,options),'B - A').pairedParticipants,0);
});
test('timing filters leave submitted rating summaries and matched directions unchanged',()=>{
  const e=entries({interrupted:true});
  assert.deepEqual(ratingSummary(e,{excludeInterrupted:true,pairedSuccessfulOnly:false}),ratingSummary(e));
  assert.deepEqual(pairedRatingSummary(e,{excludeInterrupted:true,pairedSuccessfulOnly:false}),pairedRatingSummary(e));
});
test('paired counts indicate comparison-relative direction and sum to matched participants',()=>{
  const e=entries({}, {participant:'PRIVATE_002',ratings:{...defaults,B:{confidence:1,trust:4,ease:7}}},{participant:'PRIVATE_003',ratings:{...defaults,B:defaults.A}});
  const r=paired(pairedRatingSummary(e),'B - A');
  assert.deepEqual([r.pairedParticipants,r.higher,r.same,r.lower,r.unpairedParticipants],[3,1,1,1,0]);
  for(const p of pairedRatingSummary(e))assert.equal(p.higher+p.same+p.lower,p.pairedParticipants);
});
test('aggregate CSVs contain nine rows, scale anchors, missing medians, and no individual text',()=>{
  const e=entries({}),options={notes:{0:'PRIVATE_REVIEW_NOTE'}};
  for(const text of [ratingSummaryCsv(e,options),pairedRatingSummaryCsv(e,options)]) {
    assert.equal(text.split('\r\n').length,10);assert.match(text,/post-block-ratings-v1/);assert.match(text,/scaleMin/);assert.match(text,/Very confident/);assert.match(text,/Very difficult/);
    for(const secret of ['PRIVATE_','PRIVATE_QUERY','PRIVATE_OBSERVATION','PRIVATE_REVIEW_NOTE'])assert.ok(!text.includes(secret));
  }
  const csv=ratingSummaryCsv([]);assert.match(csv,/"median"/);assert.ok(!csv.includes('"null"'));assert.match(csv,/"A","confidence","0","0","0",""/);
});
test('ratings are read-only and survive workspace round-trips without changing recording schemas',()=>{
  const e=entries({}, {participant:'PRIVATE_002',count:8}),options={includePartial:true,choices:{0:false}},before=JSON.stringify(e);
  const restored=parseProject(exportProject({entries:e,planConfig:plan,options,notes:{0:'PRIVATE_REVIEW_NOTE'}},date));
  assert.deepEqual(ratingSummary(restored.entries,restored.options),ratingSummary(e,options));
  assert.deepEqual(pairedRatingSummary(restored.entries,restored.options),pairedRatingSummary(e,options));
  assert.equal(JSON.stringify(e),before);assert.equal(e[0].session.schemaVersion,2);
});
test('summary version 2 includes the same aggregate rating data and ordinal scale definitions',()=>{
  const e=entries({}),options={includePartial:true};const {summary:r,json,html}=studySummaryAssets(e,plan,options,date);
  assert.equal(r.summaryVersion,2);assert.equal(r.applicationVersion,'0.8');assert.equal(r.ratingScale.definition,'post-block-ratings-v1');
  assert.deepEqual(r.ratings,ratingSummary(e,options));assert.deepEqual(r.pairedRatings,pairedRatingSummary(e,options));
  assert.equal(r.ratingScale.questions.length,3);assert.equal(r.units.rating,'ordinal scale from 1 to 7');
  assert.match(html,/Confidence, trust, and ease/);assert.match(html,/Score 1 \/ 2 \/ 3 \/ 4 \/ 5 \/ 6 \/ 7 counts/);
  for(const secret of ['PRIVATE_','PRIVATE_QUERY','PRIVATE_OBSERVATION']){assert.ok(!json.includes(secret));assert.ok(!html.includes(secret));}
});
