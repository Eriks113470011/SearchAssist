import {records,categories} from './data.mjs';
import {search,normalize,explain,kindLabels} from './engine.mjs';
import * as study from './study.mjs';
import {mountWorkspace} from './workspace-view.mjs';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let mode='assist',view='search',limit=12,revealApprox=false,previousQuery=null,currentMatches=[],session=null,queryTimer,announcementTimer;
const symbols={Tools:'⌘',Services:'◎',Resources:'▤',Places:'⌖',Forms:'▧'};
$('#category').innerHTML=categories.map(x=>`<option>${x}</option>`).join('');
function highlight(text,m){if(mode!=='assist'||$('#explanation-style').value==='off'||!$('#query').value.trim())return esc(text);const terms=[...new Set(m.evidence.flatMap(e=>[e.query,e.term]).filter(t=>t&&t.length>1))].sort((a,b)=>b.length-a.length);if(!terms.length)return esc(text);const rx=new RegExp('('+terms.map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')','ig');return String(text).split(rx).map((s,i)=>i%2?`<mark>${esc(s)}</mark>`:esc(s)).join('');}
function explanationHtml(m){if(mode!=='assist'||m.kind==='browse'||$('#explanation-style').value==='off')return '';const text=esc(explain(m));return `<div class="explanation">${$('#explanation-style').value==='demand'?`<details data-explain="${m.record.id}"><summary>Why this matched</summary>${text}</details>`:text}</div>`;}
function card(m){const r=m.record,approx=!['direct','browse'].includes(m.kind);return `<article class="result-card"><div class="card-top"><span class="card-symbol" aria-hidden="true">${symbols[r.category]}</span><div><div class="card-category">${r.category}</div><h3><button class="result-title" data-record="${r.id}">${highlight(r.title,m)}</button></h3></div><span class="card-arrow" aria-hidden="true">↗</span></div><p>${highlight(r.description,m)}</p><div class="card-bottom"><span class="tag">${esc(r.tags[0])}</span>${mode==='assist'&&m.kind!=='browse'&&$('#explanation-style').value!=='off'?`<span class="match-badge ${approx?'approx':''}">${kindLabels[m.kind]}</span>`:'<span class="tag">Directory entry</span>'}</div>${explanationHtml(m)}</article>`;}
function grid(ms){return `<div class="result-grid">${ms.map(card).join('')}</div>`;}
function empty(title,text,actions=''){return `<div class="empty"><h3>${title}</h3><p>${text}</p>${actions?`<div class="empty-actions">${actions}</div>`:''}</div>`;}
function updateSuggestion(ms){const box=$('#suggestion');box.hidden=true;if(mode!=='assist'||!$('#query').value.trim())return;if(previousQuery!==null){box.innerHTML=`Suggestion applied. <button id="undo-query">Undo</button>`;box.hidden=false;return;}
const first=ms[0];if(!first||first.kind!=='spelling'||first.coverage<1)return;
const changes=first.evidence.filter(e=>e.kind==='spelling');let proposed=normalize($('#query').value).split(' ').map(t=>changes.find(e=>e.query===t)?.term??t).join(' ');
if(proposed===normalize($('#query').value))return;
box.innerHTML=`<label for="suggested-query">Did you mean</label><input id="suggested-query" maxlength="256" aria-label="Edit suggested query" value="${esc(proposed)}"><button id="apply-suggestion">Apply suggestion ↗</button><span class="sr-only">Your original query has not changed.</span>`;box.hidden=false;
}
function renderResults(){clearTimeout(announcementTimer);const q=$('#query').value;currentMatches=search(records,q,{mode,category:$('#category').value,field:$('#field').value,related:$('#related').checked});
const exact=currentMatches.filter(m=>m.kind==='direct'||m.kind==='browse'),approx=currentMatches.filter(m=>!['direct','browse'].includes(m.kind));
$('#results-heading').textContent=q.trim()?'Search results':'The directory';$('#result-count').textContent=`${currentMatches.length} ${q.trim()?(currentMatches.length===1?'match':'matches'):(currentMatches.length===1?'entry':'entries')}`;
$('#query-note').textContent=q.trim()?`Results for “${q}”`:'A small dataset. Room to explore.';
let content='';let visible=[];
if(mode==='assist'&&q.trim()){
 const directVisible=exact.slice(0,limit);visible.push(...directVisible);
 if(exact.length)content+=`<div class="group-heading">Direct matches <span>${exact.length} ${exact.length===1?'entry':'entries'} containing your words</span></div>`+grid(directVisible);
 else content+=empty('No direct matches. A few ways forward.','Your query is unchanged. You can edit it, try an approximate match, or browse the directory.',session?.phase==='tasks'?'':`<button class="secondary" data-action="browse">Browse all entries</button>${$('#category').value!=='All categories'||$('#field').value!=='all'?'<button class="secondary" data-action="reset-filters">Reset filters</button>':''}`);
 const pref=$('#approx-style').value;
 if(approx.length&&pref!=='none'){
  if(pref==='request'&&!revealApprox)content+=`<div class="load-row"><button class="secondary" data-action="reveal">Show ${approx.length} approximate ${approx.length===1?'match':'matches'}</button></div>`;
  else {const remaining=Math.max(0,limit-directVisible.length),av=approx.slice(0,remaining);visible.push(...av);if(av.length)content+=`<div class="group-heading">✦ Approximate matches <span>Related, partial, or close in spelling · ${approx.length} found</span></div>`+grid(av);}
 }
 if(!approx.length&&!exact.length)content+=`<div class="load-row"><p class="muted">Try a shorter query such as “calendar”, “library”, or “account”.</p></div>`;
 if(pref==='none'&&approx.length)content+=`<p class="small-print section-gap">${approx.length} approximate matches are hidden by your preference.</p>`;
}else{
 visible=currentMatches.slice(0,limit);content=visible.length?grid(visible):empty('No results found.','Try changing your search terms or browsing the directory.',session?.phase==='tasks'?'':'<button class="secondary" data-action="browse">Browse all entries</button>');
}
const maxVisible=mode==='assist'&&q.trim()?exact.length+(($('#approx-style').value==='none'||($('#approx-style').value==='request'&&!revealApprox))?0:approx.length):currentMatches.length;
if(maxVisible>visible.length)content+=`<div class="load-row"><button class="secondary" data-action="more">Show more entries <span>↓</span></button></div>`;
$('#results').innerHTML=content;$('#clear-query').hidden=!q;updateSuggestion(currentMatches);
announcementTimer=setTimeout(()=>{$('#status').textContent=`${currentMatches.length} matches found. ${visible.length} shown. ${mode==='assist'&&q.trim()?`${exact.length} direct and ${approx.length} approximate.`:''}`;},220);
}
function log(type, extra = {}) {if (!isRunning()) return; flushPendingQuery(); study.recordEvent(session, type, extra); saveSession();}
function changeQuery({from = 'typing'} = {}) {
  previousQuery = null; limit = 12; revealApprox = false; renderResults(); clearTimeout(queryTimer);
  if (isRunning()) {
    study.setQuery(session, $('#query').value, from);
    session.currentTrial.previousQuery = null;
    saveSession();
    const current = session, index = session.taskIndex;
    queryTimer = setTimeout(() => {if (session === current && session.taskIndex === index && isRunning()) {study.flushQuery(session); saveSession();}}, 300);
  }
}
$('#query').addEventListener('input',()=>changeQuery());
$('#search-form').addEventListener('submit',e=>{e.preventDefault();log('submit',{query:$('#query').value});renderResults();const first=$('#results .result-title');if(first)first.focus();});
$('#clear-query').onclick=()=>{$('#query').value='';changeQuery({from:'clear'});$('#query').focus();};
$$('[data-example]').forEach(b=>b.onclick=()=>{$('#query').value=b.dataset.example;changeQuery({from:'example'});$('#query').focus();});
function setMode(value){mode=value;$$('[data-mode]').forEach(b=>{b.classList.toggle('active',b.dataset.mode===mode);b.setAttribute('aria-pressed',String(b.dataset.mode===mode));});$('#options-toggle').hidden=mode!=='assist'||!!session&&session.phase==='tasks';$('#search-options').hidden=true;$('#options-toggle').setAttribute('aria-expanded','false');previousQuery=null;limit=12;revealApprox=false;renderResults();}
$$('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
$('#mode-info').onclick=()=>$('#info-dialog').showModal();
$('#options-toggle').onclick=()=>{const next=!$('#search-options').hidden;$('#search-options').hidden=next;$('#options-toggle').setAttribute('aria-expanded',String(!next));};
for(const id of ['category','field','related','explanation-style','approx-style'])$('#'+id).addEventListener('change',()=>{limit=12;revealApprox=false;previousQuery=null;log('options',{control:id,value:$('#'+id).type==='checkbox'?$('#'+id).checked:$('#'+id).value});renderResults();});
$('#suggestion').onclick = event => {
  if (event.target.id === 'apply-suggestion') {
    flushPendingQuery(); previousQuery = $('#query').value;
    $('#query').value = $('#suggested-query').value;
    if (isRunning()) {study.setQuery(session, $('#query').value, 'suggestion'); study.flushQuery(session, study.now(), 'suggestion_applied', {original: previousQuery}); saveSession();}
    limit=12; renderResults(); $('#query').focus();
  }
  if (event.target.id === 'undo-query') {
    flushPendingQuery(); const old = previousQuery; previousQuery = null; $('#query').value = old;
    if (isRunning()) {study.setQuery(session, old, 'undo'); study.flushQuery(session, study.now(), 'suggestion_undone'); saveSession();}
    renderResults(); $('#query').focus();
  }
};
$('#results').onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.record){openDetail(b.dataset.record);return;}switch(b.dataset.action){case'browse':$('#query').value='';$('#category').value='All categories';changeQuery({from:'browse'});$('#query').focus();break;case'reset-filters':$('#category').value='All categories';$('#field').value='all';renderResults();break;case'reveal':revealApprox=true;log('approximate_revealed');renderResults();break;case'more':limit+=12;renderResults();break;}};
$('#results').addEventListener('toggle',e=>{if(e.target.matches('details')&&e.target.open)log('explanation_opened',{recordId:e.target.dataset.explain});},true);
function openDetail(id){const m=currentMatches.find(x=>x.record.id===id);if(!m)return;const r=m.record;log('result_opened',{recordId:id,rank:currentMatches.indexOf(m)+1,query:$('#query').value});$('#detail-content').innerHTML=`<div class="eyebrow">${r.category.toUpperCase()} / DIRECTORY ENTRY</div><h2 id="detail-title">${highlight(r.title,m)}</h2><p>${esc(r.description)}</p><div class="detail-meta">${r.tags.map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div>${mode==='assist'&&m.kind!=='browse'&&$('#explanation-style').value!=='off'?`<div class="detail-section"><h3>Why this matched</h3><p>${esc(explain(m))}</p></div>`:''}<div class="detail-section"><h3>About this entry</h3><p>This is a synthetic entry in the SearchAssist study directory. It does not open an external service.</p></div>${session&&session.phase==='tasks'?`<button class="primary" id="submit-result" data-id="${id}">Submit this result →</button>`:''}`;$('#detail-dialog').showModal();const submit=$('#submit-result');if(submit)submit.onclick=()=>finishTask(id);}
$$('dialog').forEach(d=>{d.querySelector('.dialog-close').onclick=()=>d.close();d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}});});
document.addEventListener('keydown',e=>{const tag=document.activeElement?.tagName;if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(tag)&&!$('dialog[open]')){e.preventDefault();location.hash='search';$('#query').focus();}if(e.key==='ArrowDown'&&document.activeElement===$('#query')){const first=$('#results .result-title');if(first){e.preventDefault();first.focus();return;}}if(['ArrowDown','ArrowUp'].includes(e.key)&&document.activeElement?.classList.contains('result-title')){const buttons=$$('#results .result-title'),index=buttons.indexOf(document.activeElement),next=e.key==='ArrowDown'?index+1:index-1;e.preventDefault();if(next<0)$('#query').focus();else buttons[Math.min(next,buttons.length-1)]?.focus();}if(e.key==='Escape'&&document.activeElement===$('#query')&&$('#query').value){$('#query').value='';changeQuery({from:'escape'});}});
function renderResearch(){$('#view-research').innerHTML=`<div class="page-heading"><div><div class="eyebrow"><span></span> LISTEN FIRST. DESIGN SECOND.</div><h1>Behind the search<span>.</span><p>What 26 survey responses tell us about searching,<br>getting stuck, and finding a way forward.</p></div><div class="heading-index">02 <span>/ RESEARCH</span></div></div><p class="research-lead">The survey informs the first design. It does not yet establish whether SearchAssist improves success, speed, understanding, or trust. Those are questions for the comparison study.</p><div class="metrics"><div class="metric"><div class="number">26</div><b>Survey responses</b><p>All 26 selected the adult consent option.</p></div><div class="metric"><div class="number">15<span class="muted"> / 26</span></div><b>Want editable suggestions</b><p>Selected this correction preference; multiple selections allowed.</p></div><div class="metric"><div class="number">21<span class="muted"> / 26</span></div><b>Prefer brief explanations</b><p>13 chose a short sentence; 8 a short label.</p></div></div><div class="research-grid"><div class="panel"><h2>What gets in the way?</h2><p>Top frustrations selected · multiple selections · n = 26</p>${[['Irrelevant results',15],['Only part of a name known',12],['No results returned',11],['Spelling mistakes',9],['Correct result ranked too low',5]].map(([t,n])=>`<div class="bar-item"><div class="bar-label"><span>${t}</span><b>${n} / 26 · ${Math.round(n/26*100)}%</b></div><div class="bar-track"><div class="bar-fill" style="width:${n/26*100}%"></div></div></div>`).join('')}</div><div class="panel"><h2>Control matters</h2><p>Different preferences deserve adjustable defaults.</p><div class="finding"><small>12 OF 26 RESPONDENTS</small><h3>Keep approximate matches separate</h3><p>Another 8 want them only when requested. The prototype supports both approaches.</p></div><div class="finding"><small>16 OF 26 RESPONDENTS</small><h3>Show the matching text</h3><p>Highlights use underlining as well as background color. Keyboard focus has its own outline.</p></div><div class="finding"><small>13 OF 26 RESPONDENTS</small><h3>Offer explanations on demand</h3><p>7 chose “Only when requested”; 6 chose a tooltip or information icon. Expandable text provides a keyboard-accessible option.</p></div></div></div><div class="panel section-gap"><h2>Evidence → first design decisions</h2><p>These are design interpretations, to be tested in the prototype.</p><table class="data-table"><thead><tr><th>Survey evidence</th><th>Prototype response</th></tr></thead><tbody><tr><td>15 / 26 selected editable suggestions</td><td>Propose a correction, let the user edit it, and provide Apply and Undo.</td></tr><tr><td>14 / 26 want to see which field matched</td><td>Explanations name the title, description, category, or tags supporting a result.</td></tr><tr><td>14 / 26 selected closest matches; 14 selected related terms</td><td>Offer bounded spelling recovery and explicit curated term relationships.</td></tr><tr><td>Synonym acceptance varies: 9 require application-defined terms; 6 say yes; 5 say it depends; 4 say no; 2 are unsure</td><td>Use a visible, manually curated alias and synonym list. No inferred semantic relationships.</td></tr><tr><td>24 / 26 use smartphones; 21 / 26 use laptops</td><td>Responsive layouts, touch targets, and full keyboard access.</td></tr></tbody></table></div><div class="panel section-gap"><h2>Three comparison conditions</h2><table class="data-table"><thead><tr><th>Condition</th><th>Matching</th><th>Interface</th></tr></thead><tbody><tr><td>A · Exact</td><td>Normalized literal phrase in searchable fields</td><td>Single result list without explanations</td></tr><tr><td>B · Fuzzy</td><td>Approximate words plus curated aliases and synonyms</td><td>Single ranked list without explanations</td></tr><tr><td>C · SearchAssist</td><td>Same engine and ranking as B</td><td>Highlighted evidence, short explanations, editable corrections, separated approximate matches</td></tr></tbody></table><p>The study compares interface bundles. Differences between B and C cannot be attributed to explanations alone.</p></div><div class="research-note"><strong>Research scope and data quality.</strong> Source: “Search Behavior, Failures, and Result Transparency (Responses).xlsx”, Form Responses 1, 26 response rows dated October 1–15, 2026. This is an exploratory convenience sample; recruitment and demographic representativeness are not established by the workbook. All submitted rows are retained; no formal response-quality screening has been applied. Multiple-choice selections may overlap.</div><div class="panel section-gap"><h2>Analysis notes</h2><p>One “Search problem” value appears in the word-order frequency column and one in the incorrect-correction frequency column. They are invalid frequency values and excluded from those item-level frequency distributions (valid n = 25 each). One malformed option in the top-frustrations question is excluded from option counts, with the respondent retained in the overall denominator. The truncated option “I only knew part of the nam” is normalized to “Only part of a name known.” Options containing commas are parsed as complete options, not split into separate answers.</p><p class="section-gap">The initial research phase uses this survey in place of the interviews proposed in the abstract. The prototype has not yet undergone a participant evaluation. Accessibility features are implemented for testing; assistive-technology conformance has not been independently verified.</p></div>`;}
const {orders, conditionModes} = study;
let storageWarning = '', legacySession = null;
function isRunning() {return session?.phase === 'tasks' && session.currentTrial?.activeSince != null;}
function saveSession() {
  if (!session) return;
  if (session.currentTrial && view === 'search') session.currentTrial.previousQuery = previousQuery;
  try {sessionStorage.setItem(study.STORAGE_KEY, JSON.stringify(study.snapshot(session)));}
  catch {storageWarning = 'This browser could not save your session. Export JSON before leaving; reload recovery is unavailable.';}
  $('#storage-warning').textContent = storageWarning;
  $('#storage-warning').hidden = !storageWarning;
}
function flushPendingQuery() {
  clearTimeout(queryTimer);
  if (session?.currentTrial) study.flushQuery(session);
  saveSession();
}
function activeTask() {return study.taskAt(session);}
function studyHeading(eyebrow, title, description) {
  return `<div class="page-heading"><div><div class="eyebrow"><span></span>${eyebrow}</div><h1>${title}<span>.</span></h1><p>${description}</p></div><div class="heading-index">03 <span>/ STUDY</span></div></div>`;
}
function seconds(value) {return value === null ? '—' : `${(value / 1000).toFixed(1)} s`;}
function importPanel() {
  return `<div class="panel section-gap"><h2>Restore a saved session</h2><p>Choose a SearchAssist v0.2 session JSON export to continue on this device. Restored tasks stay paused until you choose Resume. v0.1 files use a different timing definition and remain separate.</p><label class="file-label" for="import-session">Session JSON file</label><input id="import-session" type="file" accept=".json,application/json"><p id="import-status" role="status" class="import-status" aria-live="polite"></p>${legacySession ? '<p class="small-print section-gap">A v0.1 session is still stored in this tab. Download it for your records before closing the tab.</p><button class="secondary" id="export-legacy">Download v0.1 session JSON ↓</button>' : ''}</div>`;
}
function bindImport() {
  if ($('#export-legacy')) $('#export-legacy').onclick = () => download(legacySession, 'searchassist-v01-original-session.json', 'application/json');
  const picker = $('#import-session');
  if (!picker) return;
  picker.onchange = async () => {
    const file = picker.files?.[0], status = $('#import-status');
    if (!file) return;
    try {
      if (file.size > study.MAX_IMPORT_BYTES) throw new Error('Choose a session JSON file smaller than 1 MB.');
      const restored = study.restoreSession(await file.text());
      if (session && !confirm('Replace the current session with this saved session? Export your current JSON first if you need to keep it.')) {picker.value = ''; return;}
      clearTimeout(queryTimer);
      session = restored;
      previousQuery = restored.currentTrial?.previousQuery ?? null;
      endTaskUI();
      view = 'study';
      saveSession();
      location.hash = 'study';
      studyView();
      route();
      $('#main').focus();
    } catch (error) {
      status.textContent = error.message;
      status.classList.add('error');
      picker.value = '';
    }
  };
}
function studyView() {
  const root = $('#view-study');
  if (session?.phase === 'ratings') {
    root.innerHTML = studyHeading(`BLOCK ${Math.floor((session.taskIndex - 1) / 4) + 1} OF 3 COMPLETE`, 'A quick reflection', 'Rate the search experience you just used. Your unfinished ratings are saved in this tab.') +
      `<form id="ratings-form" class="panel">${[['confidence','How confident were you that you found the requested entries?','Not at all confident','Very confident'], ['trust','How much did you trust this search experience?','Not at all','Very much'], ['ease','How easy was this search experience to use?','Very difficult','Very easy']].map(([id,title,low,high]) => `<fieldset class="rating-question"><legend>${title}</legend><div class="rating-row">${Array.from({length:7}, (_,i) => `<label><input type="radio" name="${id}" value="${i+1}" ${session.ratingDraft[id]===i+1?'checked':''} required> ${i+1}</label>`).join('')}</div><p class="small-print">1 = ${low} · 7 = ${high}</p></fieldset>`).join('')}<label class="small-print">Optional observation<textarea name="notes" maxlength="2000" rows="3" placeholder="What helped or got in the way?">${esc(session.ratingDraft.notes)}</textarea></label><button class="primary">${session.taskIndex === 12 ? 'Finish session' : 'Continue to next block'} →</button></form><div class="panel section-gap"><h2>Keep a copy of your progress</h2>${exportButtons()}</div>` + importPanel();
    const form = $('#ratings-form');
    const saveDraft = () => {const values = new FormData(form); session.ratingDraft = {confidence: values.has('confidence') ? Number(values.get('confidence')) : null, trust: values.has('trust') ? Number(values.get('trust')) : null, ease: values.has('ease') ? Number(values.get('ease')) : null, notes: values.get('notes') ?? ''}; saveSession();};
    form.addEventListener('input', saveDraft);
    form.addEventListener('change', saveDraft);
    form.onsubmit = event => {
      event.preventDefault();
      saveDraft();
      study.addRatings(session, session.ratingDraft);
      saveSession();
      if (session.phase === 'tasks') beginTask(); else {studyView(); $('#main').focus();}
    };
    bindExports(); bindImport(); return;
  }
  if (session?.phase === 'complete') {
    const correct = session.trials.filter(t => t.success).length;
    root.innerHTML = studyHeading('SESSION COMPLETE', 'Ready to reflect', 'Export a copy before closing this tab. These are results for one session.') +
      `<div class="metrics"><div class="metric"><div class="number">${correct} / 12</div><b>Correct final selections</b><p>Task success against the predefined targets.</p></div><div class="metric"><div class="number">${session.order}</div><b>Condition order</b><p>A Exact · B Fuzzy · C SearchAssist</p></div><div class="metric"><div class="number">${Math.round(session.trials.reduce((sum,t)=>sum+t.activeElapsedMs,0)/1000)}s</div><b>Total active task time</b><p>Paused and hidden-tab time excluded.</p></div></div><div class="panel"><h2>Session results</h2>${summaryTable()}<p class="small-print">Times include both successful and unsuccessful tasks; the summary CSV also reports successful-task time separately. Query edits are idle editing episodes, not keystrokes. These custom ratings are not a validated usability scale.</p>${exportButtons()}</div>` + importPanel();
    bindExports(); bindImport(); return;
  }
  const progress = session?.phase === 'tasks';
  root.innerHTML = studyHeading('TURN A PROTOTYPE INTO EVIDENCE', progress ? 'Pick up where you left off' : 'Put search to the test', progress ? 'Your query, completed tasks, and recorded active time are preserved.' : 'A guided, within-subject comparison of three search experiences.') +
    (progress ? `<div class="panel"><div class="resume-heading"><span class="pause-pill">Ⅱ PAUSED</span><span class="study-progress">Task ${session.taskIndex + 1} of 12 · Block ${Math.floor(session.taskIndex/4)+1} of 3</span></div><h2>${activeTask().prompt}</h2><p>Current query: <strong>${esc(session.currentTrial?.query ?? activeTask().query)}</strong></p><p>Active time so far: <strong>${seconds(session.currentTrial?.activeMs ?? 0)}</strong>. ${session.currentTrial?.restored ? 'This trial is flagged as restored in the export.' : 'The clock resumes only when you choose Resume.'}</p><div class="export-actions"><button class="primary" id="resume-session">Resume task →</button></div>${exportButtons()}</div>` :
      `<div class="study-intro"><div class="panel"><h2>The session at a glance</h2><div class="step"><span>1</span><div><h3>Choose an order and task rotation</h3><p>Balance all six condition orders and rotate the three matched task sets independently.</p></div></div><div class="step"><span>2</span><div><h3>Complete 12 directory tasks</h3><p>Four tasks per condition: spelling, abbreviation, incomplete words, and reordered words. Submit a result or skip. You can pause without resetting your query.</p></div></div><div class="step"><span>3</span><div><h3>Reflect and export</h3><p>Rate confidence, trust, and ease after each block. Download trial CSV, condition summary CSV, and session JSON. The JSON can restore your progress.</p></div></div><p class="small-print">Complete an unrecorded practice task in Explore first. Use anonymous codes and your course’s approved study and consent process.</p></div><form class="panel setup-form" id="start-study"><h2>Set up a session</h2><label for="participant-code">Anonymous participant code<input id="participant-code" maxlength="32" required placeholder="e.g. P001" pattern="[A-Za-z0-9_-]+" title="Use letters, numbers, underscores, or hyphens"></label><label for="condition-order">Condition order</label><select id="condition-order">${orders.map(o=>`<option value="${o}">${o.split('').join(' → ')}</option>`).join('')}</select><label for="set-rotation">Task set rotation</label><select id="set-rotation"><option value="0">1 → 2 → 3</option><option value="1">2 → 3 → 1</option><option value="2">3 → 1 → 2</option></select><p class="small-print">Queries, selections, task times, and ratings are recorded in this browser tab. No study responses are uploaded by the app. Export before closing the tab; exports contain what you type. Ordinary hosting access logs may still exist.</p><label class="checkline"><input type="checkbox" required><span>I agree to this local session recording and understand that I can stop and clear it.</span></label><button class="primary">Start study session →</button></form></div>`) + importPanel() +
    `<div class="panel section-gap"><h2>Reading the measurements</h2><p>The app records active time using a monotonic clock and wall time from the start of each task. Manual pauses, leaving the search view, reloads, and hidden tabs stop active timing. Returning requires an explicit Resume. Wall time still includes these interruptions. An abruptly closed browser can lose time since the last checkpoint (normally up to one second).</p><p class="section-gap">B and C use the same engine and ranking. Settings are fixed in guided tasks. C adds several interface features together. Task difficulty and custom ratings remain exploratory; this is not a validated comparison or usability scale.</p></div>`;
  if ($('#start-study')) $('#start-study').onsubmit = event => {
    event.preventDefault();
    session = study.createSession({participant: $('#participant-code').value, order: $('#condition-order').value, setRotation: Number($('#set-rotation').value)});
    beginTask();
  };
  if ($('#resume-session')) $('#resume-session').onclick = () => beginTask();
  bindExports(); bindImport();
}
function summaryTable() {
  return `<table class="data-table"><thead><tr><th>Condition</th><th>Success</th><th>Skips</th><th>Active time</th><th>Wall time</th><th>Edits</th><th>Trust / 7</th></tr></thead><tbody>${study.summarize(session).map(r=>`<tr><td>${r.condition} · ${conditionModes[r.condition]}</td><td>${r.successes} / ${r.attempted}</td><td>${r.skips}</td><td>${seconds(r.meanActiveMs)}</td><td>${seconds(r.meanWallMs)}</td><td>${r.queryReformulations}</td><td>${r.trust ?? '—'}</td></tr>`).join('')}</tbody></table>`;
}
function beginTask() {
  clearTimeout(queryTimer);
  if (!session.currentTrial) study.startTrial(session); else study.resumeTrial(session);
  const current = session.currentTrial, undoQuery = current.previousQuery;
  mode = conditionModes[session.order[Math.floor(session.taskIndex/4)]];
  $('#query').value = current.query;
  $('#category').value = 'All categories'; $('#field').value = 'all'; $('#related').checked = true;
  $('#explanation-style').value = 'short'; $('#approx-style').value = 'separate';
  setMode(mode);
  previousQuery = undoQuery;
  renderResults();
  $('#examples').hidden = true; $('.mode-row').hidden = true; $('.filter-row').hidden = true;
  $('#study-banner').hidden = false; $('.bottom-note').hidden = true;
  $('#study-banner').innerHTML = `<div class="study-task-top"><span class="tiny-cap">STUDY · TASK ${session.taskIndex+1} OF 12</span><span class="study-progress">Block ${Math.floor(session.taskIndex/4)+1} of 3 · ${session.order[Math.floor(session.taskIndex/4)]}</span></div><h2>${activeTask().prompt}</h2><p>Edit the supplied query, open a result, and submit your choice. You can pause at any time.</p><div class="study-task-actions"><button class="secondary" id="pause-task">Ⅱ Pause task</button><button class="secondary" id="skip-task">Skip task</button></div>`;
  $('#pause-task').onclick = () => pauseStudy('manual');
  $('#skip-task').onclick = () => finishTask(null);
  location.hash = 'search'; route(); saveSession(); $('#query').focus();
}
function pauseStudy(reason, navigate = true) {
  if (!isRunning()) return;
  flushPendingQuery();
  study.pauseTrial(session, reason);
  if ($('#detail-dialog').open) $('#detail-dialog').close();
  saveSession();
  if (navigate) {endTaskUI(); location.hash = 'study'; route(); $('#main').focus();}
}
function finishTask(selected) {
  if (!isRunning()) return;
  flushPendingQuery();
  study.completeTrial(session, selected);
  $('#detail-dialog').close();
  if (session.phase === 'ratings') {endTaskUI(); saveSession(); location.hash = 'study'; route(); $('#main').focus();}
  else beginTask();
}
function endTaskUI() {
  $('#study-banner').hidden = true; $('.bottom-note').hidden = false; $('#examples').hidden = false;
  $('.mode-row').hidden = false; $('.filter-row').hidden = false;
}
function clearData() {
  if (!confirm('Clear this session and its local recordings? Export your JSON first if you need to keep them.')) return;
  clearTimeout(queryTimer); session = null;
  try {sessionStorage.removeItem(study.STORAGE_KEY);} catch {}
  endTaskUI(); $('#query').value = ''; previousQuery = null; setMode('assist'); location.hash = 'study'; route();
}
function exportButtons() {
  return `<div class="export-actions"><button class="primary" id="export-json">Export session JSON ↓</button><button class="secondary" id="export-csv">Export trials CSV ↓</button><button class="secondary" id="export-summary">Export condition summary CSV ↓</button><button class="text-btn" id="clear-session">Clear session data</button></div>`;
}
function download(content, name, type) {
  const link = document.createElement('a'), url = URL.createObjectURL(new Blob([content], {type}));
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function bindExports() {
  if ($('#export-json')) $('#export-json').onclick = () => {flushPendingQuery(); download(JSON.stringify(study.snapshot(session), null, 2), `searchassist-v02-${session.participant}.json`, 'application/json');};
  if ($('#export-csv')) $('#export-csv').onclick = () => download(study.trialsCsv(session), `searchassist-v02-${session.participant}-trials.csv`, 'text/csv');
  if ($('#export-summary')) $('#export-summary').onclick = () => download(study.summaryCsv(session), `searchassist-v02-${session.participant}-conditions.csv`, 'text/csv');
  if ($('#clear-session')) $('#clear-session').onclick = clearData;
}
function route() {
  if (location.hash === '#main') return;
  view = location.hash.slice(1) || 'search';
  if (!['search','research','study','workspace'].includes(view)) view = 'search';
  if (session?.phase === 'tasks') {
    if (view !== 'search' && isRunning()) pauseStudy('navigation', false);
    if (!isRunning() || view !== 'search') {if (view === 'search') view = 'study'; endTaskUI();}
  }
  $$('.view').forEach(section => section.hidden = section.id !== `view-${view}`);
  $$('[data-view]').forEach(link => {link.classList.toggle('active',link.dataset.view===view); if (link.dataset.view===view) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current');});
  $('#breadcrumb').innerHTML = `Workspace <b>/</b> ${{search:'Explore search',research:'Research & insights',study:'Run a study',workspace:'Study workspace'}[view]}`;
  if (view === 'study') studyView();
  if (view === 'research') renderResearch();
}
mountWorkspace($('#view-workspace'));
document.addEventListener('study-assignment', event => {
  if (session) {alert('Export and clear the current study session before setting up another participant.'); return;}
  history.replaceState(null, '', '#study'); route();
  $('#participant-code').value = event.detail.participant;
  $('#condition-order').value = event.detail.order;
  $('#set-rotation').value = String(event.detail.setRotation);
  $('#participant-code').focus();
});
window.addEventListener('hashchange', route);
document.addEventListener('visibilitychange', () => {if (document.hidden) pauseStudy('tab_hidden');});
window.addEventListener('pagehide', () => pauseStudy('page_exit', false));
setInterval(() => {if (isRunning()) saveSession();}, 1000);
try {
  legacySession = sessionStorage.getItem('searchassist-study-v1');
  const saved = sessionStorage.getItem(study.STORAGE_KEY);
  if (saved) {session = study.restoreSession(saved); if (session.phase === 'tasks') location.hash = 'study';}
} catch (error) {storageWarning = `Session recovery was unavailable: ${error.message} You can restore an exported v0.2 JSON file from Run a study.`;}
setMode('assist'); renderResearch(); route();
if (session) saveSession();
$('#storage-warning').textContent = storageWarning; $('#storage-warning').hidden = !storageWarning;
