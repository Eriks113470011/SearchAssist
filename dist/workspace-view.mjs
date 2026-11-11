import {assignments, assignmentCsv, reviewFiles, selectSessions, compareConditions, reviewCsv, auditCsv, MAX_FILES, MAX_BATCH_BYTES} from './workspace.mjs';

import {pairedSummary, pairedCsv, pairedSummaryCsv} from './paired.mjs';
import {parseProject, exportProject, MAX_PROJECT_BYTES} from './review-project.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const seconds = ms => ms === null ? '—' : `${(ms / 1000).toFixed(2)} s`;
function download(content, name, type = 'text/csv;charset=utf-8') {
  const link = document.createElement('a'), url = URL.createObjectURL(new Blob([content], {type}));
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function mountWorkspace(root) {
  let planConfig = {prefix:'P', start:1, count:18}, plan = assignments(planConfig), entries = [], choices = {}, notes = {}, includePartial = false, excludeInterrupted = false, pairedSuccessfulOnly = true, importGeneration = 0, dirty = false;
  root.innerHTML = `<div class="page-heading"><div><div class="eyebrow"><span></span>PREPARE. CHECK. COMPARE.</div><h1>Study workspace<span>.</span></h1><p>Plan balanced assignments and review exported recordings on this device.</p></div><div class="heading-index">04 <span>/ WORKSPACE</span></div></div>
    <div class="panel project-panel"><h2>Save or open a workspace</h2><p>Keep your generated assignment plan, imported recordings, inclusion choices, analysis settings, and decision notes in one workspace JSON file. Nothing is saved automatically; reload clears this workspace unless you download it first.</p><p class="small-print">Workspace JSON contains the full imported recordings, including typed queries and participant observations. Keep it with your study data. CSV reports omit those recording details.</p><div class="export-actions"><button id="save-project" class="primary">Download workspace JSON ↓</button></div><label class="file-label" for="open-project">Open workspace JSON (up to 12 MB)</label><input id="open-project" type="file" accept=".json,application/json"><p id="project-status" role="status" aria-live="polite"></p><p id="project-dirty" class="small-print" role="status" aria-live="polite">No unsaved workspace changes.</p></div>
    <div class="panel section-gap"><h2>Plan participant assignments</h2><p>Every 18 consecutive assignments cover all six condition orders and three task rotations once. Continue numbering when adding participants. This is a balancing schedule, not random assignment or a sample-size recommendation.</p>
    <form id="assignment-form" class="workspace-controls"><label>Code prefix<input id="plan-prefix" value="P" maxlength="12" required></label><label>Starting number<input id="plan-start" type="number" value="1" min="1" max="999999" required></label><label>Participants<input id="plan-count" type="number" value="18" min="1" max="180" required></label><button class="primary">Generate schedule</button></form>
    <p id="plan-status" role="status" aria-live="polite"></p><div class="export-actions"><button id="download-plan" class="secondary">Download assignment CSV ↓</button></div><div id="assignment-table" class="table-scroll" role="region" aria-label="Participant assignments" tabindex="0"></div></div>
    <div class="panel section-gap"><h2>Review session exports</h2><p>Choose up to 60 v0.2 session JSON files, at most 1 MB each and 10 MB total. v0.5 retains the v0.2 recording schema. The review does not modify recordings or your current study session. Files stay in memory here; reload clears the review.</p>
    <label class="file-label" for="review-files">Session JSON files</label><input id="review-files" type="file" accept=".json,application/json" multiple><p id="review-status" role="status" aria-live="polite"></p>
    <div class="workspace-controls review-filters"><label><input id="include-partial" type="checkbox"> Include incomplete sessions</label><label><input id="exclude-interrupted" type="checkbox"> Exclude interrupted trials from timing means</label><button id="clear-review" class="text-btn">Clear review</button></div>
    <p class="small-print">Complete sessions are included by default. Every file with a repeated participant code is excluded until you choose one. Codes are compared without letter case. Selecting multiple files for one code excludes that participant until the conflict is resolved. Set analysis rules before collection.</p>
    <div id="review-table" class="table-scroll" role="region" aria-label="Session inclusion decisions" tabindex="0"></div><p id="duplicate-status" role="status" aria-live="polite"></p>
    <h3 class="section-gap">Condition comparison</h3><p class="small-print">Success rates and active times below are means of each included participant’s condition results. Incomplete sessions can contribute different participants to each condition; these displays are descriptive, not paired tests. Timing exclusions do not change success counts. Blank values mean no eligible data.</p>
    <div id="comparison-table" class="table-scroll" role="region" aria-label="Condition comparison" tabindex="0"></div>
    <h3 class="section-gap">Within-participant comparisons</h3><p class="small-print">Each comparison uses participants who finished both four-task condition blocks. If incomplete sessions are included, contributing participants can differ between comparisons. B − A means Fuzzy minus Exact; C is SearchAssist. Positive success differences mean higher success in the comparison condition; negative time differences mean less active time.</p>
    <div class="workspace-controls review-filters"><label><input id="paired-successful-only" type="checkbox" checked> Paired timing: require correct selections in both conditions</label></div>
    <p class="small-print">Timing matches task types within each participant. When interruption exclusion is enabled, an interrupted trial removes that task type from both sides. Participant means receive equal weight; available task types can differ between participants. Matching type does not establish equal task difficulty. These are descriptive differences, without significance tests.</p>
    <div id="paired-table" class="table-scroll" role="region" aria-label="Within-participant comparisons" tabindex="0"></div>
    <div class="export-actions"><button id="download-paired" class="secondary">Download paired participant CSV ↓</button><button id="download-paired-summary" class="secondary">Download paired summary CSV ↓</button></div>
    <div class="export-actions"><button id="download-review" class="primary">Download participant-condition CSV ↓</button><button id="download-audit" class="secondary">Download inclusion log CSV ↓</button></div><p class="small-print">Exports include participant codes, file names, inclusion decisions, and selected analysis rules. The inclusion log also includes your decision notes. Both CSVs omit recorded queries and participant observation notes. Keep identifying information out of codes and file names. No session files are uploaded by the app.</p></div>`;
  const find = selector => root.querySelector(selector);
  function markDirty() {dirty = true; find('#project-dirty').textContent = 'Unsaved workspace changes. Download workspace JSON to keep them.';}
  const readPlanFields = () => ({prefix:find('#plan-prefix').value, start:Number(find('#plan-start').value), count:Number(find('#plan-count').value)});
  find('#assignment-form').addEventListener('input', markDirty);
  find('#save-project').onclick = () => {
    try {
      if (JSON.stringify(readPlanFields()) !== JSON.stringify(planConfig)) throw new Error('Generate the assignment schedule before saving edited plan fields.');
      const content = exportProject({planConfig, entries, options:options(), notes});
      download(content, 'searchassist-v05-workspace.json', 'application/json');
      dirty = false; find('#project-status').textContent = 'Workspace JSON downloaded. Open this file to continue on another visit.'; find('#project-dirty').textContent = 'No unsaved workspace changes.';
    } catch (error) {find('#project-status').textContent = error.message;}
  };
  find('#open-project').onchange = async event => {
    const file = event.target.files?.[0], generation = ++importGeneration;
    if (!file) return;
    find('#project-status').textContent = 'Checking workspace file…';
    try {
      if (file.size > MAX_PROJECT_BYTES) throw new Error('Choose a workspace JSON file no larger than 12 MB.');
      const restored = parseProject(await file.text());
      if (generation !== importGeneration) return;
      if ((dirty || entries.length) && !confirm('Replace this facilitator workspace? Download its workspace JSON first to keep your current review. The active study recording will be unchanged.')) {find('#project-status').textContent = 'Opening cancelled. The current workspace is unchanged.'; return;}
      planConfig = restored.planConfig; plan = assignments(planConfig); entries = restored.entries;
      choices = restored.options.choices; notes = restored.notes; includePartial = restored.options.includePartial; excludeInterrupted = restored.options.excludeInterrupted; pairedSuccessfulOnly = restored.options.pairedSuccessfulOnly;
      find('#plan-prefix').value = planConfig.prefix; find('#plan-start').value = planConfig.start; find('#plan-count').value = planConfig.count;
      find('#include-partial').checked = includePartial; find('#exclude-interrupted').checked = excludeInterrupted; find('#paired-successful-only').checked = pairedSuccessfulOnly;
      dirty = false; renderPlan(); renderReview();
      find('#plan-status').textContent = `${plan.length} assignments restored from the workspace.`;
      find('#review-status').textContent = `${entries.length} review file(s) restored from the workspace.`;
      find('#project-status').textContent = 'Workspace opened. Review choices and analysis settings have been restored.';
      find('#project-dirty').textContent = 'No unsaved workspace changes.';
    } catch (error) {if (generation === importGeneration) find('#project-status').textContent = `${error.message} The current workspace is unchanged.`;}
    finally {event.target.value = '';}
  };
  function renderPlan() {
    find('#assignment-table').innerHTML = `<table class="data-table"><caption>Participant assignment schedule</caption><thead><tr><th>Code</th><th>Condition order</th><th>Task rotation</th><th>Session</th></tr></thead><tbody>${plan.map((r, i) => `<tr><td>${esc(r.participant)}</td><td>${r.order.split('').join(' → ')}</td><td>${[1,2,3].map(n => (n + r.setRotation - 1) % 3 + 1).join(' → ')}</td><td><button class="text-btn" data-assignment="${i}" aria-label="Set up ${esc(r.participant)}">Set up session →</button></td></tr>`).join('')}</tbody></table>`;
  }
  find('#assignment-form').onsubmit = event => {
    event.preventDefault();
    try {
      const next = readPlanFields(); plan = assignments(next); planConfig = next; markDirty();
      renderPlan(); find('#plan-status').textContent = `${plan.length} assignments generated. Download the schedule before leaving.`;
    } catch (error) {find('#plan-status').textContent = error.message;}
  };
  find('#assignment-table').onclick = event => {
    const button = event.target.closest('[data-assignment]');
    if (button) document.dispatchEvent(new CustomEvent('study-assignment', {detail: plan[Number(button.dataset.assignment)]}));
  };
  find('#download-plan').onclick = () => download(assignmentCsv(plan), 'searchassist-v05-assignments.csv');
  const options = () => ({includePartial, excludeInterrupted, pairedSuccessfulOnly, choices, notes});
  function renderReview() {
    const selection = selectSessions(entries, options());
    find('#review-table').innerHTML = entries.length ? `<table class="data-table"><caption>Choose which recordings contribute</caption><thead><tr><th>Include</th><th>File / participant</th><th>Progress</th><th>Checks</th><th>Decision note</th></tr></thead><tbody>${entries.map(e => {
      const s = e.session, disabled = !s || !includePartial && s.phase !== 'complete';
      const checked = !disabled && choices[e.id] !== false && (!e.duplicate || choices[e.id] === true);
      const interrupted = s?.trials.filter(t => t.pauseCount || t.resumeCount || t.restored).length ?? 0;
      return `<tr><td><input type="checkbox" data-review-id="${e.id}" aria-label="Include file ${e.id + 1}: ${esc(e.name)}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}></td><td><strong>${esc(e.name)}</strong><br>${esc(s?.participant ?? 'Invalid file')}</td><td>${s ? `${s.trials.length} / 12 tasks · ${s.phase === 'complete' ? 'Complete' : 'Incomplete'}` : '—'}</td><td>${esc(e.error ?? [e.duplicate ? 'Repeated participant code' : 'Validated', interrupted ? `${interrupted} interrupted trial(s)` : ''].filter(Boolean).join(' · '))}</td><td><textarea data-review-note="${e.id}" maxlength="1000" rows="2" aria-label="Decision note for file ${e.id + 1}: ${esc(e.name)}" placeholder="Optional reason or observation">${esc(notes[e.id] ?? '')}</textarea></td></tr>`;
    }).join('')}</tbody></table>` : '<p class="small-print">Import session exports to begin a review.</p>';
    find('#duplicate-status').textContent = selection.conflicts.length ? `Resolve repeated selections for: ${selection.conflicts.join(', ')}. These participants are excluded.` : `${selection.sessions.length} session(s) included.`;
    find('#comparison-table').innerHTML = `<table class="data-table"><caption>Descriptive condition results</caption><thead><tr><th>Condition</th><th>Participants with trials</th><th>Correct / attempted</th><th>Mean participant success</th><th>Participants with timing</th><th>Mean participant active time</th></tr></thead><tbody>${compareConditions(entries, options()).map(r => `<tr><td>${r.condition}</td><td>${r.contributingSessions}</td><td>${r.successes} / ${r.attempted}</td><td>${r.meanParticipantSuccessRate === null ? '—' : `${(r.meanParticipantSuccessRate * 100).toFixed(1)}%`}</td><td>${r.timedSessions}</td><td>${seconds(r.meanParticipantActiveMs)}</td></tr>`).join('')}</tbody></table>`;
    const signed = (n, suffix) => n === null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(2)} ${suffix}`;
    find('#paired-table').innerHTML = `<table class="data-table"><caption>Differences within the same participants</caption><thead><tr><th>Comparison</th><th>Success participants</th><th>Mean success difference (percentage points)</th><th>Timing participants</th><th>Matched task-type pairs</th><th>Mean active-time difference</th></tr></thead><tbody>${pairedSummary(entries, options()).map(r => `<tr><td>${r.comparison.replace(' - ', ' − ')}</td><td>${r.successParticipants}</td><td>${signed(r.meanSuccessDifferencePp, 'pp')}</td><td>${r.timingParticipants}</td><td>${r.timedTaskPairs}</td><td>${signed(r.meanActiveDifferenceMs === null ? null : r.meanActiveDifferenceMs / 1000, 's')}</td></tr>`).join('')}</tbody></table>`;
    find('#download-paired').disabled = selection.sessions.length === 0;
    find('#download-paired-summary').disabled = selection.sessions.length === 0;
    find('#download-review').disabled = selection.sessions.length === 0;
    find('#download-audit').disabled = entries.length === 0;
    find('#clear-review').disabled = entries.length === 0;
  }
  find('#review-files').onchange = async event => {
    const files = [...event.target.files], generation = ++importGeneration;
    if (!files.length) return;
    find('#review-status').textContent = 'Checking session files…';
    try {
      if (files.length > MAX_FILES || files.reduce((n, f) => n + f.size, 0) > MAX_BATCH_BYTES) throw new Error('Choose at most 60 files totaling at most 10 MB.');
      // Oversized files are reported individually without reading their content.
      const loaded = await Promise.all(files.map(async file => ({name: file.name, text: file.size > 1024 * 1024 ? null : await file.text()})));
      if (generation !== importGeneration) return;
      const next = reviewFiles(loaded);
      if (entries.length && !confirm('Replace this review batch and its decisions? Download workspace JSON first to keep it.')) {find('#review-status').textContent = 'Import cancelled. The current review is unchanged.'; return;}
      entries = next; choices = {}; notes = {}; markDirty();
      for (let i = 0; i < entries.length; i++) if (files[i].size > 1024 * 1024) entries[i].error = 'Choose a session JSON file smaller than 1 MB.';
      find('#review-status').textContent = `${entries.filter(e => e.session).length} valid and ${entries.filter(e => e.error).length} invalid file(s). This batch replaces the previous review.`;
      renderReview();
    } catch (error) {if (generation === importGeneration) find('#review-status').textContent = `${error.message} The previous review is unchanged.`;}
    finally {event.target.value = '';}
  };
  find('#review-table').onchange = event => {
    if (event.target.matches('[data-review-id]')) {const id = event.target.dataset.reviewId; choices[id] = event.target.checked; markDirty(); renderReview(); find(`[data-review-id="${id}"]`).focus();}
  };
  find('#review-table').oninput = event => {if (event.target.matches('[data-review-note]')) {notes[event.target.dataset.reviewNote] = event.target.value; markDirty();}};
  find('#include-partial').onchange = event => {includePartial = event.target.checked; markDirty(); renderReview();};
  find('#exclude-interrupted').onchange = event => {excludeInterrupted = event.target.checked; markDirty(); renderReview();};
  find('#paired-successful-only').onchange = event => {pairedSuccessfulOnly = event.target.checked; markDirty(); renderReview();};
  find('#download-paired').onclick = () => download(pairedCsv(entries, options()), 'searchassist-v05-paired-participants.csv');
  find('#download-paired-summary').onclick = () => download(pairedSummaryCsv(entries, options()), 'searchassist-v05-paired-summary.csv');
  find('#clear-review').onclick = () => {++importGeneration; entries = []; choices = {}; notes = {}; markDirty(); find('#review-status').textContent = 'Review cleared. Original files and study recordings are unchanged.'; renderReview();};
  find('#download-review').onclick = () => download(reviewCsv(entries, options()), 'searchassist-v05-participant-conditions.csv');
  find('#download-audit').onclick = () => download(auditCsv(entries, options()), 'searchassist-v05-inclusion-log.csv');
  renderPlan(); renderReview();
}
