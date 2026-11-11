import {selectSessions} from './workspace.mjs';
import {csv} from './study.mjs';

export const COMPARISONS = [['A','B'], ['A','C'], ['B','C']];
const taskTypes = ['spelling','alias','partial','reordered'];
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const interrupted = trial => trial.pauseCount > 0 || trial.resumeCount > 0 || trial.restored;

// One row per selected recording and comparison, including rows that cannot contribute.
export function pairedRows(entries, options = {}) {
  const {sessions} = selectSessions(entries, options);
  const successfulOnly = options.pairedSuccessfulOnly !== false;
  return sessions.flatMap(({id, name, session:s}) => COMPARISONS.map(([reference, comparator]) => {
    const left = s.trials.filter(t => t.condition === reference), right = s.trials.filter(t => t.condition === comparator);
    const completeBlocks = left.length === 4 && right.length === 4;
    const timed = [], excludedInterrupted = [], excludedUnsuccessful = [];
    if (completeBlocks) for (const type of taskTypes) {
      const a = left.find(t => t.queryType === type), b = right.find(t => t.queryType === type);
      if (options.excludeInterrupted && (interrupted(a) || interrupted(b))) {excludedInterrupted.push(type);continue;}
      if (successfulOnly && (!a.success || !b.success)) {excludedUnsuccessful.push(type);continue;}
      timed.push({type, referenceMs:a.activeElapsedMs, comparatorMs:b.activeElapsedMs});
    }
    const referenceSuccesses = left.filter(t => t.success).length, comparatorSuccesses = right.filter(t => t.success).length;
    return {fileIndex:id+1, fileName:name, recordingVersion:s.version, timingDefinition:s.timingDefinition, participant:s.participant, order:s.order, setRotation:s.setRotation, sessionPhase:s.phase,
      comparison:`${comparator} - ${reference}`, referenceCondition:reference, comparatorCondition:comparator,
      referenceTrials:left.length, comparatorTrials:right.length, referenceSuccesses, comparatorSuccesses,
      successEligible:completeBlocks, successDifferencePp:completeBlocks ? (comparatorSuccesses-referenceSuccesses)*25 : null,
      timedTaskPairs:timed.length, pairedTaskTypes:timed.map(t=>t.type).join('|'),
      referenceMeanActiveMs:mean(timed.map(t=>t.referenceMs)), comparatorMeanActiveMs:mean(timed.map(t=>t.comparatorMs)),
      activeDifferenceMs:mean(timed.map(t=>t.comparatorMs-t.referenceMs)),
      timingStatus:!completeBlocks ? 'Incomplete condition block' : timed.length ? 'Included' : 'No task types meet timing rules',
      excludedInterruptedTypes:excludedInterrupted.join('|'), excludedUnsuccessfulTypes:excludedUnsuccessful.join('|'),
      includePartial:!!options.includePartial, excludeInterrupted:!!options.excludeInterrupted, pairedSuccessfulOnly:successfulOnly};
  }));
}
export function pairedSummary(entries, options = {}) {
  const rows = pairedRows(entries, options);
  return COMPARISONS.map(([reference, comparator]) => {
    const comparison = `${comparator} - ${reference}`, group = rows.filter(r=>r.comparison===comparison);
    const success = group.filter(r=>r.successEligible), timing = group.filter(r=>r.timedTaskPairs > 0);
    return {comparison, referenceCondition:reference, comparatorCondition:comparator, selectedSessions:group.length,
      successParticipants:success.length, incompleteBlockSessions:group.length-success.length,
      meanSuccessDifferencePp:mean(success.map(r=>r.successDifferencePp)),
      timingParticipants:timing.length, timedTaskPairs:timing.reduce((n,r)=>n+r.timedTaskPairs,0),
      meanActiveDifferenceMs:mean(timing.map(r=>r.activeDifferenceMs)),
      includePartial:!!options.includePartial, excludeInterrupted:!!options.excludeInterrupted, pairedSuccessfulOnly:options.pairedSuccessfulOnly!==false};
  });
}
export function pairedCsv(entries, options = {}) {
  const rows = pairedRows(entries, options);
  if (!rows.length) throw new Error('Select at least one eligible session before exporting.');
  return csv(rows, Object.keys(rows[0]));
}
export function pairedSummaryCsv(entries, options = {}) {
  if (!selectSessions(entries, options).sessions.length) throw new Error('Select at least one eligible session before exporting.');
  const rows = pairedSummary(entries, options);
  return csv(rows, Object.keys(rows[0]));
}
