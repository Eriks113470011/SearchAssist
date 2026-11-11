import {assignments, reviewFiles, MAX_FILES} from './workspace.mjs';

export const PROJECT_FORMAT = 'searchassist-review-project';
export const PROJECT_VERSION = 2;
export const MAX_PROJECT_BYTES = 12 * 1024 * 1024;
export const MAX_DECISION_NOTE = 1000;
const fail = (condition, message) => {if (!condition) throw new Error(message);};
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max) => typeof value === 'string' && value.length <= max;

function validateProject(p) {
  fail(object(p) && p.format === PROJECT_FORMAT && [1, PROJECT_VERSION].includes(p.projectVersion), 'Choose a supported SearchAssist workspace project JSON file. Individual session JSON belongs in Review session exports.');
  fail(text(p.savedAt, 64) && Number.isFinite(Date.parse(p.savedAt)), 'The workspace save date is invalid.');
  fail(object(p.assignment), 'The saved assignment plan is missing.');
  const {prefix, start, count} = p.assignment;
  // All fields are required: default arguments must not repair a damaged project.
  fail(typeof prefix === 'string' && Number.isInteger(start) && Number.isInteger(count), 'The saved assignment plan is invalid.');
  const planConfig = {prefix, start, count}; assignments(planConfig);
  fail(object(p.analysis) && typeof p.analysis.includePartial === 'boolean' && typeof p.analysis.excludeInterrupted === 'boolean', 'The saved analysis settings are invalid.');
  fail(p.projectVersion === 1 || typeof p.analysis.pairedSuccessfulOnly === 'boolean', 'The saved paired-timing setting is invalid.');
  fail(Array.isArray(p.files) && p.files.length <= MAX_FILES, 'A workspace may contain at most 60 review files.');
  for (const f of p.files) {
    fail(object(f) && text(f.name, 256) && f.name.length > 0, 'A saved source file name is invalid.');
    fail(f.choice === null || typeof f.choice === 'boolean', 'A saved inclusion choice is invalid.');
    fail(text(f.decisionNote, MAX_DECISION_NOTE), 'Keep each decision note to 1,000 characters.');
    fail(f.session === null ? text(f.error, 2000) && f.error.length > 0 : object(f.session) && f.error === null, 'A saved review file has inconsistent validation data.');
  }
  // Revalidate every embedded recording and recompute duplicate groups. Never trust stored flags or summaries.
  const entries = reviewFiles(p.files.map(f => ({name:f.name, text:f.session === null ? null : JSON.stringify(f.session)})));
  for (let i=0; i<entries.length; i++) {
    fail(p.files[i].session === null || entries[i].session !== null, `Recording ${i + 1} is invalid: ${entries[i].error}`);
    if (p.files[i].session === null) entries[i].error = p.files[i].error;
  }
  const choices = {}, notes = {};
  p.files.forEach((f, i) => {if (f.choice !== null) choices[i] = f.choice; notes[i] = f.decisionNote;});
  return {savedAt:p.savedAt, planConfig, entries, options:{includePartial:p.analysis.includePartial, excludeInterrupted:p.analysis.excludeInterrupted, pairedSuccessfulOnly:p.projectVersion === 1 ? true : p.analysis.pairedSuccessfulOnly, choices}, notes};
}

export function parseProject(input) {
  fail(typeof input === 'string' && new TextEncoder().encode(input).length <= MAX_PROJECT_BYTES, 'Choose a workspace JSON file no larger than 12 MB.');
  let p; try {p = JSON.parse(input);} catch {throw new Error('This workspace file is not valid JSON.');}
  return validateProject(p);
}
function payload(state, savedAt) {
  const {entries, planConfig, options = {}, notes = {}} = state;
  return {format:PROJECT_FORMAT, projectVersion:PROJECT_VERSION, savedAt, assignment:planConfig,
    analysis:{includePartial:options.includePartial ?? false, excludeInterrupted:options.excludeInterrupted ?? false, pairedSuccessfulOnly:options.pairedSuccessfulOnly ?? true},
    files:entries.map(e => ({name:e.name, session:e.session, error:e.error, choice:options.choices?.[e.id] ?? null, decisionNote:notes[e.id] ?? ''}))};
}
export function exportProject(state, savedAt = new Date().toISOString()) {
  const clean = validateProject(payload(state, savedAt));
  const result = JSON.stringify(payload(clean, savedAt));
  fail(new TextEncoder().encode(result).length <= MAX_PROJECT_BYTES, 'This workspace exceeds the 12 MB project limit. Review a smaller batch.');
  return result;
}
