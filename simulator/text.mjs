const stop=new Set('a an the for of to and or in on at with your you this that is it find used get from by as into can be its'.split(' '));
export function words(text){return String(text).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).filter(Boolean);}
export function contentWords(text){return [...new Set(words(text).filter(w=>w.length>2&&!stop.has(w)))];}
const stem=w=>w.replace(/(ing|ers|ies|ed|es|s)$/,'');
export function relevance(goal,text) {
  const a=contentWords(goal).map(stem),b=new Set(contentWords(text).map(stem));
  if(!a.length||!b.size)return 0;
  // Independent goal/text overlap; it neither imports the matching engine nor knows the target.
  return a.filter(w=>b.has(w)).length/a.length;
}
export function rewriteCandidates(goal,startingQuery,vocabulary) {
  const original=words(startingQuery),tokens=contentWords(goal);
  const candidates=tokens.filter(w=>original.some(q=>q.length>=3&&w.startsWith(q.slice(0,3))));
  if(vocabulary==='broad') {
    candidates.push(tokens.slice(-3).join(' '),tokens.slice(0,3).join(' '));
    for(let i=0;i+1<tokens.length;i++)candidates.push(tokens.slice(i,i+2).join(' '));
  }
  candidates.push([...original].reverse().join(' '),...original,...tokens.filter(w=>vocabulary==='broad'||w.length<=8));
  return [...new Set(candidates.filter(s=>s&&s!==words(startingQuery).join(' ')&&s.length<=256))];
}
