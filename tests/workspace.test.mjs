import test from 'node:test';
import assert from 'node:assert/strict';
import * as study from '../dist/study.mjs';
import * as workspace from '../dist/workspace.mjs';

const at = ms => ({wall: Date.UTC(2026,10,7) + ms, mono: ms});
function recording(participant = 'P001', count = 12, success = true) {
  const s = study.createSession({participant, order: 'ABC', setRotation: 0}, at(0));
  for (let i = 0; i < count; i++) {
    study.startTrial(s, at(i * 1000));
    study.completeTrial(s, success ? study.taskAt(s).target : null, at(i * 1000 + 500));
    if (s.phase === 'ratings') study.addRatings(s, {confidence: 4, trust: 5, ease: 6, notes: 'Private observation'}, at(i * 1000 + 500));
  }
  return JSON.stringify(study.snapshot(s, at(count * 1000)));
}
const file = (text, name = 'session.json') => ({name, text});

test('assignment schedules cover every order/rotation cell once in each 18 participants', () => {
  for (const start of [1, 7, 19, 102]) {
    const rows = workspace.assignments({start});
    assert.equal(new Set(rows.map(r => `${r.order}/${r.setRotation}`)).size, 18);
    for (const order of study.orders) assert.equal(rows.filter(r => r.order === order).length, 3);
    for (const rotation of [0,1,2]) assert.equal(rows.filter(r => r.setRotation === rotation).length, 6);
  }
  const full = workspace.assignments({count: 36});
  assert.deepEqual(workspace.assignments({start: 19}), full.slice(18));
  assert.equal(full[0].participant, 'P001'); assert.match(workspace.assignmentCsv(full), /"taskRotation"/);
});
test('assignment bounds and participant prefixes reject invalid input', () => {
  for (const options of [{prefix:'=evil'}, {prefix:''}, {count:0}, {count:181}, {start:0}, {start:999999,count:2}, {count:1.1}]) assert.throws(() => workspace.assignments(options));
});
test('review validates snapshots without adding recovery events, time, or pause flags', () => {
  const s = study.createSession({participant:'P001', order:'CAB', setRotation:2}, at(0));
  study.startTrial(s, at(0));study.setQuery(s, 'pending edit');
  const saved = study.snapshot(s, at(500)), input = JSON.stringify(saved);
  const [entry] = workspace.reviewFiles([file(input)]);
  assert.equal(entry.error, null);assert.deepEqual(entry.session, saved);
  assert.equal(entry.session.currentTrial.restored, false);assert.equal(entry.session.currentTrial.pauseCount, 0);
  assert.equal(entry.session.events.length, 1);assert.equal(entry.session.currentTrial.activeMs, 500);
  assert.equal(study.restoreSession(input, at(10000)).currentTrial.restored, true);
});
test('invalid and legacy files are isolated while valid recordings remain usable', () => {
  const entries = workspace.reviewFiles([file('{'), file(JSON.stringify({version:'0.1'})), file(recording())]);
  assert.match(entries[0].error, /JSON/);assert.match(entries[1].error, /v0.2/);
  assert.equal(workspace.selectSessions(entries).sessions.length, 1);
  assert.throws(() => workspace.reviewFiles(Array(61).fill(file('{}'))), /60/);
  assert.throws(() => workspace.reviewFiles([file('x'.repeat(workspace.MAX_BATCH_BYTES + 1))]), /10 MB/);
  assert.match(workspace.reviewFiles([file('x'.repeat(study.MAX_IMPORT_BYTES + 1))])[0].error, /1 MB/);
});
test('duplicates require an explicit choice, and conflicts exclude every selected copy', () => {
  const entries = workspace.reviewFiles([file(recording('P001')),file(recording('p001')),file(recording('P002'))]);
  assert.deepEqual(entries.map(e=>e.duplicate), [true,true,false]);
  assert.deepEqual(workspace.selectSessions(entries).sessions.map(e=>e.id), [2]);
  assert.deepEqual(workspace.selectSessions(entries,{choices:{0:true}}).sessions.map(e=>e.id), [0,2]);
  const conflict = workspace.selectSessions(entries,{choices:{0:true,1:true}});
  assert.deepEqual(conflict.conflicts, ['P001']);assert.deepEqual(conflict.sessions.map(e=>e.id), [2]);
  assert.match(workspace.auditCsv(entries,{choices:{0:true,1:true}}), /Multiple files selected/);
});
test('incomplete sessions are opt-in and unfinished ratings do not become final scores', () => {
  const s = JSON.parse(recording('P001',4));s.phase='ratings';s.ratings=[];s.ratingDraft={confidence:7,trust:null,ease:null,notes:'Draft'};
  const entries = workspace.reviewFiles([file(JSON.stringify(s))]);
  assert.equal(workspace.conditionRows(entries).length, 0);
  const rows = workspace.conditionRows(entries,{includePartial:true});
  assert.equal(rows.length, 3);assert.equal(rows[0].attempted, 4);assert.equal(rows[0].confidence, null);
  assert.equal(rows[1].meanActiveMs, null);assert.match(workspace.auditCsv(entries), /Incomplete session/);
});
test('turning off partial inclusion resolves conflicts from disabled incomplete copies', () => {
  const entries = workspace.reviewFiles([file(recording('P001')),file(recording('P001',1))]);
  const choices = {0:true,1:true};
  assert.equal(workspace.selectSessions(entries,{choices,includePartial:true}).sessions.length,0);
  const selection = workspace.selectSessions(entries,{choices,includePartial:false});
  assert.deepEqual(selection.conflicts,[]);assert.deepEqual(selection.sessions.map(e=>e.id),[0]);
});
test('interruption exclusions affect only timing, and all-excluded means stay empty', () => {
  const s = JSON.parse(recording());
  s.trials.slice(0,4).forEach(t => {t.pauseCount=1;t.resumeCount=1;t.restored=true;});
  const entries = workspace.reviewFiles([file(JSON.stringify(s))]);
  const all = workspace.conditionRows(entries)[0], filtered = workspace.conditionRows(entries,{excludeInterrupted:true})[0];
  assert.equal(all.meanActiveMs, 500);assert.equal(filtered.meanActiveMs, null);assert.equal(filtered.timedTrials, 0);
  assert.equal(filtered.attempted, 4);assert.equal(filtered.successes, 4);assert.equal(filtered.interruptedTrials, 4);
  assert.equal(workspace.compareConditions(entries,{excludeInterrupted:true})[0].timedSessions, 0);
});
test('condition comparison weights participant success rates equally with partial sessions', () => {
  const entries = workspace.reviewFiles([file(recording('P001')),file(recording('P002',1,false))]);
  const rows = workspace.compareConditions(entries,{includePartial:true});
  assert.equal(rows[0].meanParticipantSuccessRate, .5);assert.equal(rows[0].contributingSessions, 2);
  assert.equal(rows[0].successes, 4);assert.equal(rows[0].attempted, 5);assert.equal(rows[1].contributingSessions, 1);
});
test('review exports record filters and inclusion reasons without queries or notes', () => {
  const entries = workspace.reviewFiles([file(recording(), '=formula.csv'),file(recording('P002',1))]);
  const data = workspace.reviewCsv(entries,{excludeInterrupted:true});
  assert.match(data,/"'\=formula.csv"/);assert.match(data,/"excludeInterrupted"/);
  assert.ok(!data.includes('Private observation'));assert.ok(!data.includes('calender'));
  assert.match(workspace.auditCsv(entries), /Incomplete session/);
  assert.throws(() => workspace.reviewCsv([]), /eligible/);
});
