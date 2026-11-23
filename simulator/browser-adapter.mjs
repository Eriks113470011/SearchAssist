export const BROWSER_ADAPTER_VERSION='guided-dom-v1';
// This adapter reads visible DOM content and operates controls. It never reads app globals,
// engine modules, the task key, or browser storage. IDs are resolved only after submission.
export function createBrowserAdapter(page) {
  let epoch=0,openDetail=null,selectedId=null;
  const cards=()=>page.locator('#results .result-card');
  async function candidate(handle){const m=/^e(\d+)-r(\d+)$/.exec(handle??'');if(!m||Number(m[1])!==epoch||Number(m[2])>=await cards().count())throw new Error('Unavailable or stale result handle.');return {card:cards().nth(Number(m[2])),position:Number(m[2])};}
  async function observe() {
    const query=await page.locator('#query').inputValue(),count=await cards().count();
    const groups=await cards().evaluateAll(nodes=>nodes.map(n=>{const text=n.parentElement.previousElementSibling?.textContent??'';return text.startsWith('Direct matches')?'Direct matches':text.includes('Approximate matches')?'Approximate matches':null;}));
    return {epoch,query,totalResults:Number.parseInt(await page.locator('#result-count').textContent(),10),candidates:Array.from({length:count},(_,i)=>({handle:`e${epoch}-r${i}`,position:i,group:groups[i]})),
      explanationsAvailable:await page.locator('#results .explanation').count()>0,suggestionAvailable:await page.locator('#apply-suggestion').isVisible(),undoAvailable:await page.locator('#undo-query').isVisible(),moreAvailable:await page.locator('[data-action="more"]').isVisible(),openDetail};
  }
  async function preview(action) {
    if(openDetail&&!['submit','close_details','read_details'].includes(action.type))throw new Error('Close the detail dialog before using other controls.');
    const base={readingText:'',keyCount:0,clicks:0,waits:0};
    if(['read_card','read_explanation','open_details','read_details','submit'].includes(action.type)) {
      const {card,position}=await candidate(action.handle);
      if(action.type==='submit'){if(openDetail!==action.handle)throw new Error('Submission requires the open detail dialog.');return {...base,clicks:1};}
      if(action.type==='open_details'){if(action.read!==false)throw new Error('Open details first, then explicitly read_details.');return {...base,clicks:1};}
      let text;
      if(action.type==='read_card')text=(await Promise.all(['.result-title','.card-category',':scope > p','.tag'].map(s=>card.locator(s).first().textContent()))).map(s=>s.trim()).join(' ');
      if(action.type==='read_explanation'){if(!await card.locator('.explanation').isVisible())throw new Error('No explanation is visible.');text=(await card.locator('.explanation').textContent()).trim();}
      if(action.type==='read_details'){
        if(openDetail!==action.handle||!await page.locator('#detail-dialog').isVisible())throw new Error('Reading details requires the open dialog.');
        text=(await page.locator('#detail-content').locator('.eyebrow,h2,:scope > p:not(.simulation-detail-label),.detail-meta .tag,.detail-section p').allTextContents()).map(s=>s.trim()).join(' ');
      }
      return {...base,readingText:text,card:{handle:action.handle,position,kind:{read_card:'card',read_explanation:'explanation',read_details:'details'}[action.type],text}};
    }
    const state=await observe();
    if(action.type==='read_suggestion'){if(!state.suggestionAvailable)throw new Error('No suggestion is visible.');const query=await page.locator('#suggested-query').inputValue();return {...base,readingText:'Did you mean '+query,suggestion:{query}};}
    if(action.type==='rewrite'){if(typeof action.query!=='string'||!action.query.trim()||action.query.length>256)throw new Error('Invalid rewritten query.');return {...base,keyCount:action.query.length+3,clicks:1,waits:1};}
    if(action.type==='apply_suggestion'&&!state.suggestionAvailable||action.type==='undo_suggestion'&&!state.undoAvailable||action.type==='show_more'&&!state.moreAvailable)throw new Error('Requested control is unavailable.');
    if(['apply_suggestion','undo_suggestion','show_more'].includes(action.type))return {...base,clicks:1,waits:1};
    if(action.type==='close_details'){if(!openDetail)throw new Error('No details are open.');return {...base,clicks:1};}
    if(action.type==='skip')return {...base,clicks:1};
    throw new Error('Unknown simulation action.');
  }
  async function execute(action) {
    const result=await preview(action);
    if(['read_card','read_explanation'].includes(action.type))await (await candidate(action.handle)).card.scrollIntoViewIfNeeded();
    if(action.type==='open_details'){await (await candidate(action.handle)).card.locator('.result-title').click();await page.locator('#submit-result').waitFor({state:'visible'});openDetail=action.handle;}
    if(action.type==='submit'){selectedId=await page.locator('#submit-result').getAttribute('data-id');await page.locator('#submit-result').click();openDetail=null;}
    if(action.type==='close_details'){await page.locator('#detail-dialog .dialog-close').click();openDetail=null;}
    if(action.type==='skip')await page.locator('#skip-task').click();
    if(action.type==='rewrite'){await page.locator('#query').fill(action.query);await page.locator('#query').press('Enter');epoch++;}
    if(action.type==='apply_suggestion'){await page.locator('#apply-suggestion').click();epoch++;}
    if(action.type==='undo_suggestion'){await page.locator('#undo-query').click();epoch++;}
    if(action.type==='show_more')await page.locator('[data-action="more"]').click();
    return result;
  }
  return {observe,preview,execute,selectionId:()=>selectedId};
}
