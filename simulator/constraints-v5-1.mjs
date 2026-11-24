import {words,contentWords} from './text.mjs';
import {scoreEvidence} from './relevance.mjs';

// Deliberately bounded English rules, not a general semantic parser. Inputs are public text only.
export const CONSTRAINT_VERSION='public-constraint-evidence-v1.1';
const normal=s=>words(s).join(' ');
const timeTerms=['tonight','morning','afternoon','evening','weekend','weekday','monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const token=(s,t)=>{
 const terms=t.split(' ');
 // Student is an audience noun: accept its singular/plural in every position,
 // including inside a qualified phrase. Keep all other V5 matching rules intact.
 const pattern=terms.map((w,i)=>/^students?$/.test(w)?'students?':w+(i===terms.length-1?'s?':''));
 return new RegExp('\\b'+pattern.join('\\s+')+'\\b').test(s);
};
const stem=w=>w.replace(/(ing|ers|ies|ed|es|s)$/,'');
const negative=/\b(?:not (?:available|offered|provided|handled|served|accepted|eligible|a working)|unavailable|ineligible|closed|archived|historic|no longer|referrals only|training only)\b/;
const workflow=new Set('directory entry tool resource form service page application find information responsible listing containing used changing department institution focused bookings booking appointments appointment registration reservations reservation locations location campus students student current open working public available for staff'.split(' '));
const boilerplate='This is a synthetic entry in the SearchAssist study directory. It does not open an external service.';
export function extractRequirements(prompt){
 const s=normal(prompt),out=[];
 const add=(kind,term)=>out.push({kind,term});
 for(const m of s.matchAll(/\b(north|south|east|west|central) campus\b/g))add('location',m[0]);
 for(const t of timeTerms)if(token(s,t))add('timing',t);
 for(const m of s.matchAll(/\b(international|domestic|visiting|graduate|undergraduate) students?\b/g))add('eligibility',m[0].replace(/students?$/,'students'));
 for(const t of ['graduate','undergraduate'])if(token(s,t)&&!out.some(r=>r.term.startsWith(t)))add('eligibility',t);
 if(!out.some(r=>r.kind==='eligibility')&&/\b(?:for|to) students?\b/.test(s))add('eligibility','students');
 if(/\bfor staff\b/.test(s))add('eligibility','staff');
 for(const t of ['open','current','working','onsite','walk in','public'])if(token(s,t))add(t==='public'?'eligibility':'availability',t);
 return out;
}
function clauses(text){
 return String(text).replaceAll(boilerplate,'').replace(/\bnot only\b/gi,'also').replace(/\b(?:not required|no appointments? (?:is |are )?required)\b/gi,'optional').split(/[.;!\n]|\bbut\b/i).map(normal).filter(Boolean);
}
function hasDenial(s){return negative.test(s)||/\bno\b/.test(s)||/\bnot\b/.test(s);}
function relevant(s,goal){
 const topics=new Set(contentWords(goal).map(stem));
 return contentWords(s).some(w=>topics.has(stem(w)));
}
function scopeConflict(s,req,requirements){
 if(!hasDenial(s))return false;
 const otherTimes=timeTerms.filter(t=>token(s,t));
 const requestedTimes=requirements.filter(r=>r.kind==='timing').map(r=>r.term);
 // "Closed on Sundays" does not contradict a Monday request.
 if(otherTimes.length&&requestedTimes.length&&!otherTimes.some(t=>requestedTimes.includes(t)))return false;
 if(req.kind==='location'||req.kind==='eligibility'||req.kind==='timing')return token(s,req.term);
 if(req.term==='current')return /\b(?:archived|historic|closed funding|closed year)\b/.test(s);
 if(req.term==='working')return /\b(?:not a working|training only|example)\b/.test(s);
 return token(s,req.term)||(/\b(?:closed|unavailable|no new|not available)\b/.test(s)&&!otherTimes.length);
}
export function checkConstraints(prompt,attendedText,{title=''}={}){
 const requirements=extractRequirements(prompt);
 // Remove the attended title once: a title/acronym alone cannot establish qualification.
 const beyondTitle=String(attendedText).replace(title,'');
 const cs=clauses(beyondTitle),checks=requirements.map(req=>{
  const contradict=cs.find(s=>scopeConflict(s,req,requirements)||(
   (req.kind==='location'&&/\b(?:north|south|east|west|central) campus only\b/.test(s)&&!token(s,req.term))||
   (req.kind==='eligibility'&&/\b(?:staff|domestic students|undergraduate students) only\b/.test(s)&&!token(s,req.term))||
   (req.kind==='timing'&&/\b(?:morning|afternoon|evening|weekend|weekday) only\b/.test(s)&&!token(s,req.term))));
  const support=cs.find(s=>token(s,req.term)&&!hasDenial(s));
  return {...req,status:contradict?'contradicted':support?'supported':'unknown',evidence:contradict??support??null};
 });
 const requestedTimes=requirements.filter(r=>r.kind==='timing').map(r=>r.term);
 const denial=cs.find(s=>{
  const times=timeTerms.filter(t=>token(s,t));
  if(times.length&&requestedTimes.length&&!times.some(t=>requestedTimes.includes(t)))return false;
  // Scoped denials of other audiences/locations are not universal service denials.
  const specific=/\b(?:campus|students?|staff)\b/.test(s)&&/\b(?:ineligible|not served|staff only)\b/.test(s);
  if(specific)return checks.some(c=>c.status==='contradicted'&&c.evidence===s);
  return relevant(s,prompt)&&(negative.test(s)||/\bno\s+/.test(s));
 });
 const description=scoreEvidence(prompt,beyondTitle);
 const qualifiers=new Set(requirements.flatMap(r=>r.term.split(' ')));
 const serviceTerms=contentWords(prompt).filter(w=>!workflow.has(w)&&!qualifiers.has(w));
 const positiveWords=new Set(cs.filter(s=>!hasDenial(s)).flatMap(s=>contentWords(s).map(stem)));
 const serviceSupported=!serviceTerms.length||serviceTerms.some(w=>positiveWords.has(stem(w)));
 const unsupportedPrompt=/\b(?:not|except|excluding|without)\b/.test(normal(prompt));
 const qualified=checks.every(c=>c.status==='supported')&&!denial&&description.eligible&&serviceSupported&&!unsupportedPrompt;
 return {version:CONSTRAINT_VERSION,requirements:checks,contradiction:denial??checks.find(c=>c.status==='contradicted')?.evidence??null,
  serviceTerms,serviceSupported,unsupportedPrompt,descriptionOverlap:description.overlap,descriptionEligible:description.eligible,qualified,
  reason:unsupportedPrompt?'unsupported-negative-requirement':!serviceSupported?'missing-service-evidence':denial||checks.some(c=>c.status==='contradicted')?'contradictory-evidence':checks.some(c=>c.status==='unknown')?'missing-required-evidence':!description.eligible?'insufficient-description-evidence':'requirements-supported'};
}
