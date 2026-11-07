export const normalize=s=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
export function distance(a,b){const d=Array.from({length:a.length+1},(_,i)=>[i]);for(let j=1;j<=b.length;j++)d[0][j]=j;for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++){d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]!==b[j-1]));if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])d[i][j]=Math.min(d[i][j],d[i-2][j-2]+1);}return d[a.length][b.length];}
export function search(records,query,{mode='assist',category='All categories',field='all',related=true}={}){
const q=normalize(query),qt=q.split(' ').filter(Boolean);const found=[];
for(const r of records){if(category!=='All categories'&&r.category!==category)continue;
if(!q){found.push({record:r,kind:'browse',score:0,evidence:[],coverage:1});continue;}
const fields=(field==='title'?[['title',r.title]]:[['title',r.title],['category',r.category],['description',r.description],['tags',r.tags.join(' ')]]);
const literal=fields.find(([,v])=>normalize(v).includes(q));
if(literal){found.push({record:r,kind:'direct',score:literal[0]==='title'?110+(normalize(r.title)===q?10:0):100,evidence:[{field:literal[0],query:q,term:q}],coverage:1});continue;}
if(mode==='exact')continue;
if(related){const alias=r.aliases.find(a=>normalize(a.term)===q);if(alias){found.push({record:r,kind:alias.type,score:94,evidence:[{field:'curated '+alias.type,query:q,term:r.title,source:alias.term}],coverage:1});continue;}}
const words=fields.flatMap(([field,v])=>normalize(v).split(' ').map(term=>({term,field})));
const evidence=[];let cost=0;
for(const token of qt){let best=null;
for(const w of words){let c=Infinity;let kind='';if(w.term===token){c=0;kind='word';}else if(token.length>=3&&w.term.startsWith(token)){c=.4;kind='partial';}else if(token.length>=4&&w.term.length>=4){const d=distance(token,w.term);if(d<=(token.length>=7?2:1)&&d/Math.max(token.length,w.term.length)<=.29){c=d;kind='spelling';}}
if(Number.isFinite(c)&&(!best||c<best.cost))best={field:w.field,query:token,term:w.term,kind,cost:c};}
if(best){evidence.push(best);cost+=best.cost;}}
if(!evidence.length)continue;
const coverage=evidence.length/qt.length;if(coverage<.5)continue;
const kind=coverage<1?'partialQuery':evidence.some(e=>e.kind==='spelling')?'spelling':evidence.some(e=>e.kind==='partial')?'partial':'reordered';
found.push({record:r,kind,score:80*coverage-cost*5+(evidence.every(e=>e.field==='title')?3:0),coverage,evidence});
}
return found.sort((a,b)=>b.score-a.score||a.record.title.localeCompare(b.record.title));}
export function explain(m){const e=m.evidence;switch(m.kind){case'direct':return `Your words appear in the ${e[0].field}.`;case'alias':return `“${e[0].source}” is a stored alias for “${m.record.title}”.`;case'synonym':return `“${e[0].source}” is a curated related term for “${m.record.title}”.`;case'spelling':return e.filter(x=>x.kind==='spelling').map(x=>`“${x.query}” is close to “${x.term}” in the ${x.field}.`).join(' ');case'partial':return `Part of a word matches: ${e.map(x=>`“${x.query}” → “${x.term}”`).join(', ')}.`;case'partialQuery':return `${e.length} of your query’s words matched. Other words did not match.`;case'reordered':return 'All your words appear, in a different order or in separate fields.';default:return 'Browse this directory entry.';}}
export const kindLabels={direct:'Direct match',alias:'Known alias',synonym:'Related term',spelling:'Close spelling',partial:'Partial word',partialQuery:'Some words matched',reordered:'Word match'};
