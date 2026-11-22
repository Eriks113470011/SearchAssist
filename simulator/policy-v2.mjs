import {relevance,rewriteCandidates} from './text.mjs';
// This module receives public observations only. Do not import engine, data, study, runner or evaluator.
export function createPolicyV2(goal,startingQuery,profile,draw) {
  const memory=new Map(),tried=new Set([startingQuery.toLowerCase()]);let epoch=-1,inspected=0,rewrites=0,usedSuggestion=false;
  let suggestionRead=false,undone=false;
  const rewritesToTry=rewriteCandidates(goal,startingQuery,profile.vocabulary);
  function update(observation) {
    if(observation.epoch!==epoch){epoch=observation.epoch;memory.clear();inspected=0;suggestionRead=false;}
  }
  function observeCard(card) {
    let old=memory.get(card.handle);
    if(!old){old={handle:card.handle,position:card.position,text:card.text,explanationRead:false,detailsRead:false};memory.set(card.handle,old);inspected++;}
    if(card.kind==='explanation'){old.explanationRead=true;old.text+=' '+card.text;}
    if(card.kind==='details'){old.detailsRead=true;old.text+=' '+card.text;}
    const noise=(draw('recognition',epoch,card.position,card.kind)*2-1)*profile.recognitionNoise;
    const overlap=relevance(goal,old.text),rankBoost=profile.rankBias/(card.position+1);
    old.score=overlap+rankBoost+noise;old.evidence={version:'goal-overlap-v1',overlap,rankBoost,noise,score:old.score,threshold:profile.threshold,eligible:true,source:card.kind};
  }
  return {
    inspect(handle) {const c=handle?memory.get(handle):[...memory.values()].sort((a,b)=>b.score-a.score||a.position-b.position)[0];return c?structuredClone({handle:c.handle,position:c.position,...c.evidence}):null;},
    receive(result) {
      if(result.card)observeCard(result.card);
      if(result.suggestion){suggestionRead=true;tried.add(result.suggestion.query.toLowerCase());}
    },
    decide(observation,limits) {
      update(observation);
      if(observation.openDetail){const candidate=memory.get(observation.openDetail);if(candidate&&profile.verifyDetails&&!candidate.detailsRead)return {type:'read_details',handle:observation.openDetail,reason:'Read the visible detail dialog before deciding.'};return candidate&&candidate.score>=profile.threshold ? {type:'submit',handle:observation.openDetail,reason:'Submit the inspected candidate through the open detail dialog.'} : {type:'close_details',reason:'The inspected details do not justify submission.'};}
      const best=[...memory.values()].sort((a,b)=>b.score-a.score||a.position-b.position)[0];
      if(best && (inspected>=Math.min(profile.scanLimit,observation.totalResults)||profile.scanLimit===1)) {
        if(observation.explanationsAvailable&&!best.explanationRead&&draw('read-explanation',epoch,best.position)<profile.explanationAttention)return {type:'read_explanation',handle:best.handle,reason:'Attend to the visible matching explanation.'};
        if(best.score>=profile.threshold) {
          return {type:'open_details',handle:best.handle,read:false,reason:profile.verifyDetails?'Open and read the most plausible candidate’s details.':'Open the detail dialog for the plausible candidate without further reading.'};
        }
      }
      const unread=observation.candidates.find(c=>!memory.has(c.handle));
      if(unread&&inspected<profile.scanLimit)return {type:'read_card',handle:unread.handle,reason:'Inspect the next visible result.'};
      if(observation.moreAvailable&&inspected<profile.scanLimit)return {type:'show_more',reason:'Inspect additional public results.'};
      if(observation.suggestionAvailable&&!usedSuggestion&&draw('accept-suggestion',epoch)<profile.suggestionAcceptance) {
        if(!suggestionRead)return {type:'read_suggestion',reason:'Inspect the available correction before accepting it.'};
        usedSuggestion=true;return {type:'apply_suggestion',reason:'Try the inspected correction; no outcome feedback is available.'};
      }
      if(observation.undoAvailable&&usedSuggestion&&!undone&&(!best||best.score<profile.threshold)){undone=true;return {type:'undo_suggestion',reason:'Insufficient evidence after a correction; restore the earlier query.'};}
      if(rewrites<limits.maxRewrites) {
        const query=rewritesToTry.find(q=>!tried.has(q.toLowerCase()));
        if(query){tried.add(query.toLowerCase());rewrites++;let typed=query;const slip=query.length>3&&draw('typing-slip',rewrites)<profile.typingErrorRate;
          if(slip){const i=Math.min(query.length-2,Math.floor(draw('slip-position',rewrites)*(query.length-1)));typed=query.slice(0,i)+query[i+1]+query[i]+query.slice(i+2);tried.add(typed.toLowerCase());}
          return {type:'rewrite',query:typed,typingSlip:slip,reason:slip?'A configured typing slip transposes adjacent characters in a planned rewrite.':'Try alternative wording available from the task prompt or starting query.'};}
      }
      return {type:'skip',reason:'No inspected candidate meets the threshold and no configured recovery remains.'};
    }
  };
}
