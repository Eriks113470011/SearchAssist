import {checkConstraints} from './constraints.mjs';
import {scoreRecoveryEvidence,recoveryQueries} from './recovery.mjs';
// This module receives public observations only. Do not import engine, data, study, runner or evaluator.
export function createPolicyV5(goal,startingQuery,profile,draw) {
  const memory=new Map(),tried=new Set([startingQuery.toLowerCase()]);let epoch=-1,inspected=0,rewrites=0,usedSuggestion=false;
  let suggestionRead=false,undone=false;
  const rewritesToTry=recoveryQueries(goal,startingQuery,profile.vocabulary);
  function update(observation) {
    if(observation.epoch!==epoch){epoch=observation.epoch;memory.clear();inspected=0;suggestionRead=false;}
  }
  function observeCard(card) {
    let old=memory.get(card.handle);
    if(!old){old={handle:card.handle,position:card.position,text:card.text,explanationRead:false,detailsRead:false};memory.set(card.handle,old);inspected++;}
    if(card.kind==='explanation'){old.explanationRead=true;old.text+=' '+card.text;}
    if(card.kind==='details'){old.detailsRead=true;old.text+=' '+card.text;}
    const noise=(draw('recognition',epoch,card.position,card.kind)*2-1)*profile.recognitionNoise;
    if(card.title)old.title=card.title;
    if(card.kind==='card')old.cardText=card.text;
    if(card.kind==='explanation')old.explanationText=card.text;
    if(card.kind==='details')old.detailText=card.text;
    const text=old.detailsRead?old.detailText:[old.cardText,old.explanationText].filter(Boolean).join(' ');
    const evidence=scoreRecoveryEvidence(goal,text,{title:old.title??'',startingQuery}),rankBoost=profile.rankBias/(card.position+1);
    const summaryCheck=checkConstraints(goal,old.cardText??'',{title:old.title??''});
    const detailCheck=old.detailsRead?checkConstraints(goal,old.detailText??'',{title:old.title??''}):null;
    old.constraints={...summaryCheck,detailCheck,qualified:summaryCheck.qualified&&(!detailCheck||detailCheck.qualified),reason:detailCheck&&!detailCheck.qualified?'detail-'+detailCheck.reason:summaryCheck.reason};
    old.score=evidence.overlap+rankBoost+noise;old.evidence={...evidence,rankBoost,noise,score:old.score,threshold:profile.threshold,source:card.kind,constraints:old.constraints,detailsVerified:old.detailsRead};
    if(!old.constraints.qualified)old.rejected=true;
  }
  return {
    inspect(handle) {const c=handle?memory.get(handle):[...memory.values()].sort((a,b)=>Number(b.evidence.eligible)-Number(a.evidence.eligible)||b.score-a.score||a.position-b.position)[0];return c?structuredClone({handle:c.handle,position:c.position,...c.evidence}):null;},
    receive(result) {
      if(result.card)observeCard(result.card);
      if(result.suggestion){suggestionRead=true;tried.add(result.suggestion.query.toLowerCase());}
    },
    decide(observation,limits) {
      update(observation);
      if(observation.openDetail){
        const candidate=memory.get(observation.openDetail);
        if(candidate&&!candidate.detailsRead)return {type:'read_details',handle:observation.openDetail,reason:'Verify attended evidence before submission, including required constraints.'};
        if(candidate&&!candidate.rejected&&candidate.constraints.qualified&&candidate.evidence.eligible&&candidate.score>=profile.threshold)return {type:'submit',handle:observation.openDetail,reason:'The attended description supports every recognized requirement, with no detected contradiction.'};
        if(candidate)candidate.rejected=true;
        return {type:'close_details',reason:'Reject the candidate and inspect alternatives; evidence does not justify submission.'};
      }
      const ranked=[...memory.values()].sort((a,b)=>Number(b.evidence.eligible)-Number(a.evidence.eligible)||b.score-a.score||a.position-b.position);
      const best=ranked.find(c=>!c.rejected&&c.evidence.eligible&&(c.score>=profile.threshold||!c.detailsRead));
      if(best && (inspected>=Math.min(profile.scanLimit,observation.totalResults)||profile.scanLimit===1)) {
        if(observation.explanationsAvailable&&!best.explanationRead&&draw('read-explanation',epoch,best.position)<profile.explanationAttention)return {type:'read_explanation',handle:best.handle,reason:'Attend to the visible matching explanation.'};
        if(best.evidence.eligible&&(best.score>=profile.threshold||!best.detailsRead)) {
          return {type:'open_details',handle:best.handle,read:false,reason:'Open a qualifying candidate for a charged detail check before submission.'};
        }
      }
      const unread=observation.candidates.find(c=>!memory.has(c.handle));
      if(unread)return {type:'read_card',handle:unread.handle,reason:'Inspect a visible alternative; rejected or unverified candidates cannot be submitted.'};
      if(observation.moreAvailable)return {type:'show_more',reason:'Inspect additional public results.'};
      if(observation.suggestionAvailable&&!usedSuggestion&&draw('accept-suggestion',epoch)<profile.suggestionAcceptance) {
        if(!suggestionRead)return {type:'read_suggestion',reason:'Inspect the available correction before accepting it.'};
        usedSuggestion=true;return {type:'apply_suggestion',reason:'Try the inspected correction; no outcome feedback is available.'};
      }
      if(observation.undoAvailable&&usedSuggestion&&!undone&&(!best||!best.evidence.eligible||best.score<profile.threshold)){undone=true;return {type:'undo_suggestion',reason:'Insufficient evidence after a correction; restore the earlier query.'};}
      if(rewrites<limits.maxRewrites) {
        const titleQueries=profile.vocabulary==='broad'?ranked.filter(c=>!c.rejected&&c.evidence.eligible&&c.title).map(c=>c.title):[];
        const query=[...titleQueries,...rewritesToTry].find(q=>q.length<=256&&!tried.has(q.toLowerCase()));
        if(query){tried.add(query.toLowerCase());rewrites++;let typed=query;const slip=query.length>3&&draw('typing-slip',rewrites)<profile.typingErrorRate;
          if(slip){const i=Math.min(query.length-2,Math.floor(draw('slip-position',rewrites)*(query.length-1)));typed=query.slice(0,i)+query[i+1]+query[i]+query.slice(i+2);tried.add(typed.toLowerCase());}
          return {type:'rewrite',query:typed,typingSlip:slip,reason:slip?'A configured typing slip transposes adjacent characters in a planned rewrite.':(titleQueries.includes(query)?'Refine the query using a previously attended eligible result title.':'Try a topical word or phrase from the public task prompt.')};}
      }
      return {type:'skip',reason:'No inspected candidate has sufficient qualifying evidence and no configured recovery remains.'};
    }
  };
}
