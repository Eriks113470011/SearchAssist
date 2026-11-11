import {records} from './data.mjs';
export const taskSets=[[
{type:'spelling',query:'calender',target:'calendar',prompt:'Find the tool for changing event reminders and calendar preferences.'},
{type:'alias',query:'NYC',target:'nyc',prompt:'Find the directory entry for the city with five boroughs.'},
{type:'partial',query:'official trans',target:'transcript',prompt:'Find the form for ordering an official record of courses and grades.'},
{type:'reordered',query:'portal tuition',target:'tuition',prompt:'Find the tool used to pay tuition charges.'}],
[{type:'spelling',query:'libary research',target:'library',prompt:'Find the tool for searching the library’s journal articles and research papers.'},
{type:'alias',query:'DMV',target:'dmv',prompt:'Find the department responsible for driver licenses and vehicle registration.'},
{type:'partial',query:'student hous',target:'housing',prompt:'Find the form for applying for campus accommodation.'},
{type:'reordered',query:'settings email',target:'email',prompt:'Find the tool for changing email forwarding and signatures.'}],
[{type:'spelling',query:'scholrship',target:'scholarships',prompt:'Find the resource listing scholarship eligibility and application dates.'},
{type:'alias',query:'MIT',target:'mit',prompt:'Find the Massachusetts institution focused on engineering and technology.'},
{type:'partial',query:'intern opp',target:'internship',prompt:'Find the resource listing internships for current students.'},
{type:'reordered',query:'schedule examination',target:'exam',prompt:'Find the resource containing exam dates, times, and room assignments.'}]
];
export const orders=['ABC','ACB','BAC','BCA','CAB','CBA'],conditionModes={A:'exact',B:'fuzzy',C:'assist'};

export const VERSION = '0.2';
export const STORAGE_KEY = 'searchassist-study-v2';
export const MAX_IMPORT_BYTES = 1024 * 1024;
const ids = new Set(records.map(r => r.id));
const editingEvents = new Set(['query', 'suggestion_applied', 'suggestion_undone']);
const validEvents = new Set([...editingEvents, 'task_started', 'task_paused', 'task_resumed', 'task_completed', 'session_restored', 'submit', 'result_opened', 'approximate_revealed', 'explanation_opened', 'options']);
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const finite = x => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1e12;
const text = (x, max = 256) => typeof x === 'string' && x.length <= max;
export const now = () => ({wall: Date.now(), mono: performance.now()});
export function taskAt(session, index = session.taskIndex) {
  assert(Number.isInteger(index) && index >= 0 && index < 12, 'Invalid task index.');
  return taskSets[(Math.floor(index / 4) + session.setRotation) % 3][index % 4];
}
export function createSession({participant, order, setRotation}, time = now()) {
  assert(/^[A-Za-z0-9_-]{1,32}$/.test(participant), 'Use a participant code of 1–32 letters, numbers, underscores, or hyphens.');
  assert(orders.includes(order), 'Choose a valid condition order.');
  assert(Number.isInteger(setRotation) && setRotation >= 0 && setRotation <= 2, 'Choose a valid task rotation.');
  return {version: VERSION, schemaVersion: 2, datasetVersion: 'synthetic-directory-v1', protocolVersion: 'controlled-tasks-v1', timingDefinition: 'active-time-v2', participant, order, setRotation, startedAt: new Date(time.wall).toISOString(), phase: 'tasks', taskIndex: 0, trials: [], ratings: [], events: [], currentTrial: null, ratingDraft: {confidence: null, trust: null, ease: null, notes: ''}};
}
export function checkpoint(session, time = now()) {
  const c = session?.currentTrial;
  if (!c) return;
  if (c.activeSince !== null) {
    c.activeMs += Math.max(0, time.mono - c.activeSince);
    c.activeSince = time.mono;
  }
  c.wallElapsedMs = Math.max(c.wallElapsedMs, time.wall - c.wallStartedAt, 0);
}
export function recordEvent(session, type, extra = {}, time = now()) {
  if (session?.phase !== 'tasks' || !session.currentTrial) return;
  assert(validEvents.has(type), 'Unknown study event.');
  checkpoint(session, time);
  session.events.push({...extra, taskIndex: session.taskIndex, condition: session.order[Math.floor(session.taskIndex / 4)], type, elapsedMs: Math.round(session.currentTrial.activeMs), wallElapsedMs: Math.round(session.currentTrial.wallElapsedMs)});
}
export function startTrial(session, time = now()) {
  assert(session.phase === 'tasks' && !session.currentTrial, 'A new trial cannot start now.');
  const task = taskAt(session);
  session.currentTrial = {initialQuery: task.query, query: task.query, lastRecordedQuery: task.query, pendingSource: 'typing', previousQuery: null, activeMs: 0, wallElapsedMs: 0, wallStartedAt: time.wall, activeSince: time.mono, pauseReason: null, pauseCount: 0, resumeCount: 0, restored: false, queryReformulations: 0};
  recordEvent(session, 'task_started', {query: task.query}, time);
}
export function setQuery(session, value, source = 'typing') {
  assert(session?.phase === 'tasks' && session.currentTrial, 'There is no active trial.');
  assert(text(value), 'Queries must be at most 256 characters.');
  session.currentTrial.query = value;
  session.currentTrial.pendingSource = source;
}
export function flushQuery(session, time = now(), type = 'query', extra = {}) {
  const c = session?.currentTrial;
  if (!c || c.query === c.lastRecordedQuery) return;
  assert(editingEvents.has(type), 'Unknown query change.');
  c.queryReformulations++;
  c.lastRecordedQuery = c.query;
  recordEvent(session, type, {source: c.pendingSource, ...extra, query: c.query}, time);
}
export function pauseTrial(session, reason = 'manual', time = now()) {
  const c = session?.currentTrial;
  if (!c || c.activeSince === null) return false;
  flushQuery(session, time);
  checkpoint(session, time);
  c.activeSince = null;
  c.pauseReason = reason;
  c.pauseCount++;
  recordEvent(session, 'task_paused', {reason}, time);
  return true;
}
export function resumeTrial(session, time = now()) {
  const c = session?.currentTrial;
  assert(session?.phase === 'tasks' && c, 'There is no trial to resume.');
  if (c.activeSince !== null) return false;
  c.activeSince = time.mono;
  c.pauseReason = null;
  c.resumeCount++;
  recordEvent(session, 'task_resumed', {}, time);
  return true;
}
export function completeTrial(session, selectedId, time = now()) {
  const c = session.currentTrial;
  assert(session.phase === 'tasks' && c && c.activeSince !== null, 'Resume the trial before submitting a result.');
  assert(selectedId === null || ids.has(selectedId), 'Choose a directory entry or skip.');
  flushQuery(session, time);
  checkpoint(session, time);
  const task = taskAt(session), condition = session.order[Math.floor(session.taskIndex / 4)];
  const events = session.events.filter(e => e.taskIndex === session.taskIndex);
  const trial = {taskIndex: session.taskIndex + 1, condition, taskSet: (Math.floor(session.taskIndex / 4) + session.setRotation) % 3 + 1, queryType: task.type, targetId: task.target, selectedId, success: selectedId === task.target, skipped: selectedId === null, elapsedMs: Math.round(c.activeMs), activeElapsedMs: Math.round(c.activeMs), wallElapsedMs: Math.round(c.wallElapsedMs), pauseCount: c.pauseCount, resumeCount: c.resumeCount, restored: c.restored, initialQuery: task.query, finalQuery: c.query, queryReformulations: c.queryReformulations, resultOpens: events.filter(e => e.type === 'result_opened').length, incorrectResultOpens: events.filter(e => e.type === 'result_opened' && e.recordId !== task.target).length, incorrectFinalSelection: selectedId !== null && selectedId !== task.target};
  recordEvent(session, 'task_completed', {recordId: selectedId}, time);
  session.trials.push(trial);
  session.taskIndex++;
  session.currentTrial = null;
  session.phase = session.taskIndex % 4 === 0 ? 'ratings' : 'tasks';
  session.ratingDraft = {confidence: null, trust: null, ease: null, notes: ''};
  return trial;
}
export function addRatings(session, values, time = now()) {
  assert(session.phase === 'ratings', 'This block is not ready for ratings.');
  for (const key of ['confidence', 'trust', 'ease']) assert(Number.isInteger(values[key]) && values[key] >= 1 && values[key] <= 7, 'Choose a rating from 1 to 7 for each question.');
  assert(text(values.notes ?? '', 2000), 'Keep observations to 2,000 characters.');
  session.ratings.push({condition: session.order[Math.floor((session.taskIndex - 1) / 4)], confidence: values.confidence, trust: values.trust, ease: values.ease, notes: values.notes ?? ''});
  session.phase = session.taskIndex === 12 ? 'complete' : 'tasks';
  session.ratingDraft = {confidence: null, trust: null, ease: null, notes: ''};
  if (session.phase === 'complete') session.finishedAt = new Date(time.wall).toISOString();
}
export function snapshot(session, time = now()) {
  checkpoint(session, time);
  const copy = JSON.parse(JSON.stringify(session));
  if (copy.currentTrial) {
    copy.currentTrial.runningAtSave = copy.currentTrial.activeSince !== null;
    copy.currentTrial.activeSince = null; // A performance.now anchor cannot cross page loads.
  }
  return copy;
}
function checkTrial(t, s, i) {
  const expected = taskAt(s, i);
  assert(t && t.taskIndex === i + 1 && t.condition === s.order[Math.floor(i / 4)] && t.targetId === expected.target && t.initialQuery === expected.query && t.queryType === expected.type && t.taskSet === (Math.floor(i / 4) + s.setRotation) % 3 + 1, 'The session contains inconsistent task assignments.');
  assert(t.selectedId === null || ids.has(t.selectedId), 'The session contains an unknown result.');
  assert(t.success === (t.selectedId === t.targetId) && t.skipped === (t.selectedId === null) && t.incorrectFinalSelection === (t.selectedId !== null && !t.success), 'The session contains inconsistent outcomes.');
  for (const key of ['elapsedMs', 'activeElapsedMs', 'wallElapsedMs', 'pauseCount', 'resumeCount', 'queryReformulations', 'resultOpens', 'incorrectResultOpens']) assert(finite(t[key]), 'The session contains invalid trial measurements.');
  for (const key of ['pauseCount','resumeCount','queryReformulations','resultOpens','incorrectResultOpens']) assert(Number.isInteger(t[key]), 'Trial counts must be whole numbers.');
  assert(t.elapsedMs === t.activeElapsedMs && text(t.finalQuery) && typeof t.restored === 'boolean', 'The trial data are incomplete.');
}
export function validateSession(input, time = now()) {
  assert(typeof input === 'string' && new TextEncoder().encode(input).length <= MAX_IMPORT_BYTES, 'Choose a session JSON file smaller than 1 MB.');
  let s;
  try { s = JSON.parse(input); } catch { throw new Error('This file is not valid JSON.'); }
  assert(s?.version === VERSION && s.schemaVersion === 2 && s.timingDefinition === 'active-time-v2', 'Only SearchAssist v0.2 session exports can be restored. Keep v0.1 exports for their original analysis.');
  assert(s.datasetVersion === 'synthetic-directory-v1' && s.protocolVersion === 'controlled-tasks-v1', 'The session uses a different dataset or study protocol.');
  createSession(s, time);
  assert(['tasks', 'ratings', 'complete'].includes(s.phase) && Number.isInteger(s.taskIndex) && s.taskIndex >= 0 && s.taskIndex <= 12, 'The session has an invalid study state.');
  assert(typeof s.startedAt === 'string' && Number.isFinite(Date.parse(s.startedAt)), 'The session start date is invalid.');
  assert(Array.isArray(s.trials) && s.trials.length === s.taskIndex && Array.isArray(s.ratings) && Array.isArray(s.events) && s.events.length <= 10000, 'The session has incomplete or oversized records.');
  const ratingsExpected = s.phase === 'ratings' ? s.taskIndex / 4 - 1 : Math.floor(s.taskIndex / 4);
  assert((s.phase !== 'ratings' || s.taskIndex > 0 && s.taskIndex % 4 === 0) && (s.phase !== 'complete' || s.taskIndex === 12) && (s.phase !== 'tasks' || s.taskIndex < 12) && s.ratings.length === ratingsExpected, 'The session block progress is inconsistent.');
  s.trials.forEach((t, i) => checkTrial(t, s, i));
  s.ratings.forEach((r, i) => {
    assert(r && r.condition === s.order[i], 'The session ratings are out of order.');
    for (const key of ['confidence', 'trust', 'ease']) assert(Number.isInteger(r[key]) && r[key] >= 1 && r[key] <= 7, 'A session rating is invalid.');
    assert(text(r.notes, 2000), 'The session observation is invalid.');
  });
  for (const e of s.events) {
    assert(e && validEvents.has(e.type) && Number.isInteger(e.taskIndex) && e.taskIndex >= 0 && e.taskIndex < 12 && e.taskIndex <= s.taskIndex && e.condition === s.order[Math.floor(e.taskIndex / 4)] && finite(e.elapsedMs) && finite(e.wallElapsedMs), 'The session contains an invalid event.');
    if (editingEvents.has(e.type) || e.type === 'submit') assert(text(e.query), 'The session contains an invalid recorded query.');
    if (e.type === 'result_opened') assert(ids.has(e.recordId) && Number.isInteger(e.rank) && e.rank > 0 && e.rank <= records.length, 'The session contains an invalid result event.');
  }
  assert(s.ratingDraft && text(s.ratingDraft.notes, 2000), 'The saved rating draft is invalid.');
  for (const key of ['confidence','trust','ease']) assert(s.ratingDraft[key] === null || Number.isInteger(s.ratingDraft[key]) && s.ratingDraft[key] >= 1 && s.ratingDraft[key] <= 7, 'A saved draft rating is invalid.');
  const c = s.currentTrial;
  assert(s.phase === 'tasks' || c === null, 'Only a task can have unfinished trial data.');
  if (c) {
    assert(c.initialQuery === taskAt(s).query && text(c.query) && text(c.lastRecordedQuery) && (c.previousQuery === null || text(c.previousQuery)) && text(c.pendingSource, 40), 'The saved query is invalid.');
    assert(typeof c.wallStartedAt === 'number' && Number.isFinite(c.wallStartedAt) && c.wallStartedAt >= 0 && c.wallStartedAt <= 8.64e15, 'The saved task clock is invalid.');
    for (const key of ['activeMs', 'wallElapsedMs', 'pauseCount', 'resumeCount', 'queryReformulations']) assert(finite(c[key]), 'The saved task measurements are invalid.');
    for (const key of ['pauseCount','resumeCount','queryReformulations']) assert(Number.isInteger(c[key]), 'Saved trial counts must be whole numbers.');
    assert(typeof c.runningAtSave === 'boolean' && typeof c.restored === 'boolean', 'The saved task recovery state is invalid.');
    assert(c.activeSince === null, 'Export the session before importing its clock state.');
  }
  const pick = (object, keys) => Object.fromEntries(keys.filter(k => k in object).map(k => [k, object[k]]));
  s.trials = s.trials.map(t => pick(t, ['taskIndex','condition','taskSet','queryType','targetId','selectedId','success','skipped','elapsedMs','activeElapsedMs','wallElapsedMs','pauseCount','resumeCount','restored','initialQuery','finalQuery','queryReformulations','resultOpens','incorrectResultOpens','incorrectFinalSelection']));
  s.ratings = s.ratings.map(r => pick(r, ['condition','confidence','trust','ease','notes']));
  s.events = s.events.map(e => pick(e, ['taskIndex','condition','type','elapsedMs','wallElapsedMs','query','source','original','recordId','rank','reason','control','value']));
  s.ratingDraft = pick(s.ratingDraft, ['confidence','trust','ease','notes']);
  if(c) s.currentTrial = pick(c, ['initialQuery','query','lastRecordedQuery','pendingSource','previousQuery','activeMs','wallElapsedMs','wallStartedAt','activeSince','pauseReason','pauseCount','resumeCount','restored','queryReformulations','runningAtSave']);
  // Drop unknown top-level fields so an imported file cannot alter application settings.
  const keys = ['version','schemaVersion','datasetVersion','protocolVersion','timingDefinition','participant','order','setRotation','startedAt','finishedAt','phase','taskIndex','trials','ratings','events','currentTrial','ratingDraft'];
  return Object.fromEntries(keys.filter(k => k in s).map(k => [k, s[k]]));
}
export function restoreSession(input, time = now()) {
  const s = validateSession(input, time), c = s.currentTrial;
  if (c) {
    c.restored = true;
    if (c.runningAtSave) c.pauseCount++;
    c.pauseReason = 'restored';
    c.runningAtSave = false;
    recordEvent(s, 'session_restored', {}, time);
  }
  return s;
}
const mean = values => values.length ? values.reduce((a,b) => a+b,0) / values.length : null;
export function summarize(session) {
  return ['A','B','C'].map(condition => {
    const t = session.trials.filter(t => t.condition === condition), success = t.filter(t => t.success);
    const rating = session.ratings.find(r => r.condition === condition);
    return {version: VERSION, participant: session.participant, order: session.order, setRotation: session.setRotation, condition, attempted: t.length, successes: success.length, skips: t.filter(t=>t.skipped).length, incorrectSelections: t.filter(t=>t.incorrectFinalSelection).length, meanActiveMs: mean(t.map(t=>t.activeElapsedMs)), meanWallMs: mean(t.map(t=>t.wallElapsedMs)), meanSuccessfulActiveMs: mean(success.map(t=>t.activeElapsedMs)), queryReformulations: t.reduce((n,t)=>n+t.queryReformulations,0), pauses: t.reduce((n,t)=>n+t.pauseCount,0), restoredTrials: t.filter(t=>t.restored).length, confidence: rating?.confidence ?? null, trust: rating?.trust ?? null, ease: rating?.ease ?? null};
  });
}
export function csv(rows, keys) {
  const cell = value => {
    let s = String(value ?? '');
    if (!(typeof value === 'number' && Number.isFinite(value)) && (/^[\s\uFEFF]*[=+@\-]/.test(s) || /^[\t\r\n]/.test(s))) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };
  return [keys.map(cell).join(','), ...rows.map(r => keys.map(k => cell(r[k])).join(','))].join('\r\n');
}
export function trialsCsv(session) {
  const keys = ['version','schemaVersion','timingDefinition','participant','order','setRotation','taskIndex','condition','taskSet','queryType','targetId','selectedId','success','skipped','elapsedMs','activeElapsedMs','wallElapsedMs','pauseCount','resumeCount','restored','initialQuery','finalQuery','queryReformulations','resultOpens','incorrectResultOpens','incorrectFinalSelection','confidence','trust','ease'];
  const rows = session.trials.map(t => ({version: VERSION, schemaVersion: 2, timingDefinition: session.timingDefinition, participant: session.participant, order: session.order, setRotation: session.setRotation, ...t, ...session.ratings.find(r=>r.condition===t.condition)}));
  return csv(rows, keys);
}
export function summaryCsv(session) { const rows = summarize(session); return csv(rows, Object.keys(rows[0])); }
