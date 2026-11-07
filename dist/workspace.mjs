import {orders, validateSession, csv} from './study.mjs';

export const MAX_FILES = 60;
export const MAX_BATCH_BYTES = 10 * 1024 * 1024;
const conditions = ['A', 'B', 'C'];
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

export function assignments({prefix = 'P', start = 1, count = 18} = {}) {
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,11}$/.test(prefix)) throw new Error('Use a prefix of 1–12 letters, numbers, underscores, or hyphens, starting with a letter.');
  if (!Number.isInteger(start) || start < 1 || start > 999999 || !Number.isInteger(count) || count < 1 || count > 180 || start + count - 1 > 999999) throw new Error('Choose 1–180 assignments and a starting number between 1 and 999999.');
  return Array.from({length: count}, (_, i) => {
    const slot = (start - 1 + i) % 18;
    return {participant: prefix + String(start + i).padStart(3, '0'), order: orders[slot % 6], setRotation: Math.floor(slot / 6), position: start + i};
  });
}
export function assignmentCsv(rows) {
  return csv(rows.map(r => ({...r, taskRotation: [1, 2, 3].map(n => (n + r.setRotation - 1) % 3 + 1).join(' → ')})), ['position', 'participant', 'order', 'setRotation', 'taskRotation']);
}

// Validation for review never resumes or updates the imported recording.
export function reviewFiles(files) {
  if (!Array.isArray(files) || files.length > MAX_FILES) throw new Error(`Choose at most ${MAX_FILES} session files at once.`);
  const bytes = files.reduce((n, f) => n + (typeof f?.text === 'string' ? new TextEncoder().encode(f.text).length : 0), 0);
  if (bytes > MAX_BATCH_BYTES) throw new Error('Choose session files totaling at most 10 MB.');
  const entries = files.map((file, index) => {
    const entry = {id: index, name: String(file?.name ?? `Session ${index + 1}`).slice(0, 256), session: null, error: null, duplicate: false};
    try {entry.session = validateSession(file.text);} catch (error) {entry.error = error.message;}
    return entry;
  });
  const participantCounts = new Map();
  for (const e of entries) if (e.session) {
    // Case-insensitive matching is conservative for manually assigned codes.
    const code = e.session.participant.toUpperCase();
    participantCounts.set(code, (participantCounts.get(code) ?? 0) + 1);
  }
  for (const e of entries) if (e.session) e.duplicate = participantCounts.get(e.session.participant.toUpperCase()) > 1;
  return entries;
}

export function selectSessions(entries, {includePartial = false, choices = {}} = {}) {
  // A duplicate participant is excluded unless exactly one of its files is selected.
  const selected = entries.filter(e => e.session && (includePartial || e.session.phase === 'complete') && choices[e.id] !== false && (!e.duplicate || choices[e.id] === true));
  const codes = new Map();
  for (const e of selected) {
    const key = e.session.participant.toUpperCase();
    codes.set(key, (codes.get(key) ?? 0) + 1);
  }
  const conflicts = [...codes].filter(([, count]) => count > 1).map(([code]) => code);
  return {conflicts, sessions: selected.filter(e => codes.get(e.session.participant.toUpperCase()) === 1 && (includePartial || e.session.phase === 'complete'))};
}

export function conditionRows(entries, options = {}) {
  const {sessions} = selectSessions(entries, options);
  return sessions.flatMap(({id, name, session: s}) => conditions.map(condition => {
    const all = s.trials.filter(t => t.condition === condition);
    const timed = options.excludeInterrupted ? all.filter(t => !t.pauseCount && !t.resumeCount && !t.restored) : all;
    const successful = timed.filter(t => t.success), rating = s.ratings.find(r => r.condition === condition);
    return {fileIndex: id + 1, fileName: name, recordingVersion: s.version, timingDefinition: s.timingDefinition, participant: s.participant, order: s.order, setRotation: s.setRotation, sessionPhase: s.phase, condition,
      attempted: all.length, successes: all.filter(t => t.success).length, skips: all.filter(t => t.skipped).length, incorrectSelections: all.filter(t => t.incorrectFinalSelection).length,
      timedTrials: timed.length, interruptedTrials: all.filter(t => t.pauseCount || t.resumeCount || t.restored).length,
      meanActiveMs: mean(timed.map(t => t.activeElapsedMs)), meanWallMs: mean(timed.map(t => t.wallElapsedMs)), meanSuccessfulActiveMs: mean(successful.map(t => t.activeElapsedMs)),
      queryReformulations: all.reduce((n, t) => n + t.queryReformulations, 0), confidence: rating?.confidence ?? null, trust: rating?.trust ?? null, ease: rating?.ease ?? null,
      includePartial: !!options.includePartial, excludeInterrupted: !!options.excludeInterrupted};
  }));
}
export function compareConditions(entries, options = {}) {
  const rows = conditionRows(entries, options);
  return conditions.map(condition => {
    const group = rows.filter(r => r.condition === condition && r.attempted > 0);
    const rates = group.map(r => r.successes / r.attempted);
    return {condition, contributingSessions: group.length, attempted: group.reduce((n, r) => n + r.attempted, 0), successes: group.reduce((n, r) => n + r.successes, 0),
      meanParticipantSuccessRate: mean(rates), timedSessions: group.filter(r => r.timedTrials > 0).length,
      meanParticipantActiveMs: mean(group.filter(r => r.meanActiveMs !== null).map(r => r.meanActiveMs))};
  });
}
export function reviewCsv(entries, options = {}) {
  const rows = conditionRows(entries, options);
  if (!rows.length) throw new Error('Select at least one eligible session before exporting.');
  return csv(rows, Object.keys(rows[0]));
}
export function auditCsv(entries, options = {}) {
  const selected = new Set(selectSessions(entries, options).sessions.map(e => e.id));
  const conflicts = new Set(selectSessions(entries, options).conflicts);
  const rows = entries.map(e => ({fileIndex: e.id + 1, fileName: e.name, participant: e.session?.participant ?? '', phase: e.session?.phase ?? '', trials: e.session?.trials.length ?? '', included: selected.has(e.id),
    reason: e.error ? e.error : conflicts.has(e.session.participant.toUpperCase()) ? 'Multiple files selected for this participant' : options.choices?.[e.id] === false ? 'Manually excluded' : e.duplicate && options.choices?.[e.id] !== true ? 'Duplicate requires explicit selection' : !options.includePartial && e.session.phase !== 'complete' ? 'Incomplete session' : 'Included',
    includePartial: !!options.includePartial, excludeInterrupted: !!options.excludeInterrupted}));
  return csv(rows, ['fileIndex','fileName','participant','phase','trials','included','reason','includePartial','excludeInterrupted']);
}
