import {selectSessions} from './workspace.mjs';
import {csv} from './study.mjs';

export const RATING_DEFINITION = 'post-block-ratings-v1';
export const RATING_ITEMS = Object.freeze([
  Object.freeze({measure:'confidence',label:'Confidence',low:'Not at all confident',high:'Very confident'}),
  Object.freeze({measure:'trust',label:'Trust',low:'Not at all',high:'Very much'}),
  Object.freeze({measure:'ease',label:'Ease',low:'Very difficult',high:'Very easy'})
]);
const comparisons = [['A','B'],['A','C'],['B','C']];
const median = values => {
  if (!values.length) return null;
  const sorted=[...values].sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);
  return sorted.length%2 ? sorted[middle] : (sorted[middle-1]+sorted[middle])/2;
};

// Imported recordings have already been validated. Only final submitted block ratings count.
// Never inspect ratingDraft or apply task-timing filters to these ordinal responses.
export function ratingSummary(entries, options={}) {
  const {sessions}=selectSessions(entries,options);
  return ['A','B','C'].flatMap(condition=>RATING_ITEMS.map(({measure})=>{
    const values=sessions.flatMap(({session})=>session.ratings.filter(r=>r.condition===condition).map(r=>r[measure]));
    return {condition,measure,includedSessions:sessions.length,submittedRatings:values.length,missingRatings:sessions.length-values.length,median:median(values),
      ...Object.fromEntries(Array.from({length:7},(_,i)=>[`count${i+1}`,values.filter(v=>v===i+1).length]))};
  }));
}
export function pairedRatingSummary(entries, options={}) {
  const {sessions}=selectSessions(entries,options);
  return comparisons.flatMap(([referenceCondition,comparatorCondition])=>RATING_ITEMS.map(({measure})=>{
    const pairs=sessions.flatMap(({session})=>{
      const a=session.ratings.find(r=>r.condition===referenceCondition),b=session.ratings.find(r=>r.condition===comparatorCondition);
      return a&&b ? [[a[measure],b[measure]]] : [];
    });
    return {comparison:`${comparatorCondition} - ${referenceCondition}`,referenceCondition,comparatorCondition,measure,
      includedSessions:sessions.length,pairedParticipants:pairs.length,unpairedParticipants:sessions.length-pairs.length,
      higher:pairs.filter(([a,b])=>b>a).length,same:pairs.filter(([a,b])=>b===a).length,lower:pairs.filter(([a,b])=>b<a).length};
  }));
}
function exportRows(rows, options) {
  return rows.map(row=>{
    const item=RATING_ITEMS.find(item=>item.measure===row.measure);
    return {ratingDefinition:RATING_DEFINITION,...row,scaleMin:1,scaleMax:7,lowAnchor:item.low,highAnchor:item.high,includePartial:!!options.includePartial};
  });
}
export function ratingSummaryCsv(entries, options={}) {
  const rows=exportRows(ratingSummary(entries,options),options);
  return csv(rows,Object.keys(rows[0]));
}
export function pairedRatingSummaryCsv(entries, options={}) {
  const rows=exportRows(pairedRatingSummary(entries,options),options);
  return csv(rows,Object.keys(rows[0]));
}
