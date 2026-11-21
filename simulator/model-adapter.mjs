import {records as directory} from '../dist/data.mjs';
import {search,normalize,explain} from '../dist/engine.mjs';
export const ADAPTER_VERSION='guided-public-model-v1';
export function createModelAdapter({condition,initialQuery,records=directory}) {
  if(!['A','B','C'].includes(condition))throw new Error('Unknown condition.');
  const mode={A:'exact',B:'fuzzy',C:'assist'}[condition];let query=initialQuery,previous=null,limit=12,epoch=0,openDetail=null,matchCache=null;
  const matches=()=>matchCache??=search(records,query,{mode,category:'All categories',field:'all',related:true});
  function candidate(handle) {
    const match=/^e(\d+)-r(\d+)$/.exec(handle??''),list=matches();
    if(!match||Number(match[1])!==epoch||Number(match[2])>=Math.min(limit,list.length))throw new Error('Unavailable or stale result handle.');
    return {match:list[Number(match[2])],position:Number(match[2])};
  }
  function suggestion() {
    if(condition!=='C'||previous!==null||!query.trim())return null;
    const first=matches()[0];if(!first||first.kind!=='spelling'||first.coverage<1)return null;
    const changes=first.evidence.filter(e=>e.kind==='spelling'),proposed=normalize(query).split(' ').map(t=>changes.find(e=>e.query===t)?.term??t).join(' ');
    return proposed!==normalize(query)?proposed:null;
  }
  function observe() {
    const list=matches();return {epoch,query,totalResults:list.length,candidates:list.slice(0,limit).map((m,i)=>({handle:`e${epoch}-r${i}`,position:i,group:condition==='C'?(['direct','browse'].includes(m.kind)?'Direct matches':'Approximate matches'):null})),
      explanationsAvailable:condition==='C'&&!!query.trim(),suggestionAvailable:!!suggestion(),undoAvailable:previous!==null,moreAvailable:list.length>limit,openDetail};
  }
  function preview(action) {
    if(openDetail&&!['submit','close_details'].includes(action.type))throw new Error('Close the detail dialog before using other controls.');
    const base={readingText:'',keyCount:0,clicks:0,waits:0};
    if(['read_card','read_explanation','open_details','submit'].includes(action.type)) {
      const {match:m,position}=candidate(action.handle),r=m.record;
      if(action.type==='submit') {if(openDetail!==action.handle)throw new Error('Submission requires the open detail dialog.');return {...base,clicks:1};}
      if(action.type==='read_explanation') {
        if(condition!=='C'||m.kind==='browse')throw new Error('No matching explanation is visible.');
        const text=explain(m);return {...base,readingText:text,card:{handle:action.handle,position,kind:'explanation',text}};
      }
      if(action.type==='read_card') {
        const text=[r.title,r.category,r.description,r.tags[0]??''].join(' ');
        return {...base,readingText:text,card:{handle:action.handle,position,kind:'card',text}};
      }
      if(typeof action.read!=='boolean')throw new Error('Specify whether the agent reads opened details.');
      const text=[r.title,r.category,r.description,...r.tags,'This is a synthetic entry in the SearchAssist study directory. It does not open an external service.'].join(' ');
      return {...base,clicks:1,readingText:action.read?text:'',...(action.read?{card:{handle:action.handle,position,kind:'details',text}}:{})};
    }
    if(action.type==='read_suggestion') {const proposed=suggestion();if(!proposed)throw new Error('No suggestion is visible.');return {...base,readingText:'Did you mean '+proposed,suggestion:{query:proposed}};}
    if(action.type==='apply_suggestion') {if(!suggestion())throw new Error('No suggestion can be applied.');return {...base,clicks:1,waits:1};}
    if(action.type==='undo_suggestion') {if(previous===null)throw new Error('No suggestion can be undone.');return {...base,clicks:1,waits:1};}
    if(action.type==='rewrite') {if(typeof action.query!=='string'||!action.query.trim()||action.query.length>256)throw new Error('Invalid rewritten query.');return {...base,keyCount:action.query.length+3,clicks:1,waits:1};}
    if(action.type==='show_more') {if(!observe().moreAvailable)throw new Error('No more results are available.');return {...base,clicks:1,waits:1};}
    if(action.type==='close_details') {if(!openDetail)throw new Error('No details are open.');return {...base,clicks:1};}
    if(action.type==='skip')return {...base,clicks:1};
    throw new Error('Unknown simulation action.');
  }
  function execute(action) {
    const result=preview(action);
    if(action.type==='apply_suggestion'){const proposed=suggestion();previous=query;query=proposed;epoch++;limit=12;matchCache=null;}
    if(action.type==='undo_suggestion'){query=previous;previous=null;epoch++;limit=12;matchCache=null;}
    if(action.type==='rewrite'){query=action.query;previous=null;epoch++;limit=12;matchCache=null;}
    if(action.type==='show_more')limit+=12;
    if(action.type==='open_details')openDetail=action.handle;
    if(action.type==='close_details')openDetail=null;
    return result;
  }
  return {observe,preview,execute,selectionId:handle=>candidate(handle).match.record.id};
}
