import test from 'node:test';
import assert from 'node:assert/strict';
import {search,explain} from '../dist/engine.mjs';
import {records} from '../dist/data.mjs';
test('literal search recovers a normalized phrase but rejects a misspelling and unstored acronym',()=>{
assert.equal(search(records,' CALENDAR   SETTINGS ',{mode:'exact'})[0].record.id,'calendar');
assert.equal(search(records,'calender',{mode:'exact'}).length,0);
assert.equal(search(records,'NYC',{mode:'exact'}).length,0);
});
test('fuzzy and assist share every ranked result and evidence',()=>{
for(const q of ['calender','NYC','laptop','reset pass','portal tuition','zzzzzz','library banana'])assert.deepEqual(search(records,q,{mode:'fuzzy'}),search(records,q,{mode:'assist'}));
});
test('stored aliases and related terms can be disabled without inventing short-word matches',()=>{
assert.equal(search(records,'NYC')[0].record.id,'nyc');
assert.equal(search(records,'laptop')[0].kind,'synonym');
assert.equal(search(records,'laptop',{related:false}).length,0);
assert.equal(search(records,'XY').length,0);
});
test('filters apply before matching, and evidence names the actual field',()=>{
assert.equal(search(records,'calender',{category:'Forms'}).length,0);
const tagMatch=search(records,'calender').find(x=>x.record.id==='exam');
assert.equal(tagMatch.evidence[0].field,'tags');assert.match(explain(tagMatch),/tags/);
assert.equal(search(records,'calender',{field:'title'}).some(x=>x.record.id==='exam'),false);
});
test('missing query words remain visibly partial and nonsense is not forced to match',()=>{
assert.equal(search(records,'library banana')[0].kind,'partialQuery');
assert.match(explain(search(records,'library banana')[0]),/Other words did not match/);
assert.equal(search(records,'zzzzzzzzzz').length,0);
});
test('controlled task targets are recovered by approximate starting queries',()=>{
for(const [q,id] of [['calender','calendar'],['NYC','nyc'],['official trans','transcript'],['portal tuition','tuition'],['libary research','library'],['DMV','dmv'],['student hous','housing'],['settings email','email'],['scholrship','scholarships'],['MIT','mit'],['intern opp','internship'],['schedule examination','exam']])assert.ok(search(records,q).some(x=>x.record.id===id),`${q} should find ${id}`);
});
