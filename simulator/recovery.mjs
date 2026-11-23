import {words} from './text.mjs';
import {scoreEvidence} from './relevance.mjs';
export const RECOVERY_POLICY_VERSION='attended-title-recovery-v1';
const acronymStop=new Set(['a','an','the','of','and','for','in','on','at','to']);
const normalized=text=>words(text).join(' ');
// General, public-text heuristics only. No directory imports, answer dictionary or private aliases.
export function scoreRecoveryEvidence(goal,text,{title='',startingQuery=''}={}){
 const base=scoreEvidence(goal,text),name=normalized(title),original=normalized(startingQuery);
 const initials=words(title).filter(w=>!acronymStop.has(w)).map(w=>w[0]).join('');
 const acronym=/^[A-Z]{2,5}$/.test(startingQuery.trim())&&initials===startingQuery.trim().toLowerCase();
 const exactTitle=!!name&&name===original;
 const queryCue=exactTitle?'exact-attended-title':acronym?'attended-title-initials':null;
 const querySupport=queryCue?1:0,queryWeight=0.4;
 // The unchanged topical gate is evaluated BEFORE query support, rank and recognition noise.
 return {...base,version:'topic-query-evidence-v1',goalOverlap:base.overlap,overlap:base.overlap+(1-base.overlap)*queryWeight*querySupport,
  querySupport,queryWeight,queryCue,queryCueOrigin:queryCue?'starting-query':null,attendedTitle:title};
}
export function recoveryQueries(goal,startingQuery,vocabulary){
 const topics=scoreEvidence(goal,'').topicTerms,original=words(startingQuery);
 const linked=topics.filter(w=>original.some(q=>q.length>=3&&w.startsWith(q.slice(0,3))));
 const known=vocabulary==='broad'?topics:topics.filter(w=>w.length<=8);
 const candidates=[...linked,...known,known.slice(0,2).join(' '),...known.slice(1).map((w,i)=>known[i]+' '+w),[...original].reverse().join(' ')];
 return [...new Set(candidates.filter(q=>q&&q.length<=256&&normalized(q)!==normalized(startingQuery)))];
}
