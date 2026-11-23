import {contentWords} from './text.mjs';
export const RELEVANCE_VERSION='topic-overlap-v1';
// Declared general instruction vocabulary, independent of directory records and answer keys.
// Generic words contribute weakly; they cannot establish topical evidence by themselves.
const generic=new Set('directory entry tool resource form service page application find information responsible'.split(' '));
const stem=w=>w.replace(/(ing|ers|ies|ed|es|s)$/,'');
const boilerplate='This is a synthetic entry in the SearchAssist study directory. It does not open an external service.';
export function scoreEvidence(goal,text){
 const terms=contentWords(goal).map(term=>({term,stem:stem(term),weight:generic.has(term)?0.1:1}));
 const visible=new Set(contentWords(String(text??'').replaceAll(boilerplate,'').replaceAll('DIRECTORY ENTRY','')).map(stem));
 const matched=terms.filter(t=>visible.has(t.stem)),topics=terms.filter(t=>t.weight===1),matchedTopics=matched.filter(t=>t.weight===1);
 const total=terms.reduce((n,t)=>n+t.weight,0),overlap=total?matched.reduce((n,t)=>n+t.weight,0)/total:0;
 return {version:RELEVANCE_VERSION,overlap,eligible:matchedTopics.length>0&&overlap>=0.25,minimumOverlap:0.25,
  topicTerms:topics.map(t=>t.term),matchedTopicTerms:matchedTopics.map(t=>t.term),genericMatched:matched.filter(t=>t.weight<1).map(t=>t.term)};
}
