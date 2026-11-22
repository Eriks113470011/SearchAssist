import {parseProject,exportProject} from './review-project.mjs';
import {studySummaryAssets} from './study-summary.mjs';
import {csv} from './study.mjs';
import {assignments,assignmentCsv,reviewCsv,auditCsv} from './workspace.mjs';
import {pairedCsv} from './paired.mjs';
import {coverageCsv,assignmentChecksCsv} from './coverage.mjs';
import {ratingSummaryCsv,pairedRatingSummaryCsv} from './ratings.mjs';
import {storedZip} from './zip.mjs';

export const BUNDLE_FORMAT='searchassist-review-bundle';
export const BUNDLE_VERSION=1;
const encoder=new TextEncoder();
const rowsCsv=rows=>csv(rows,Object.keys(rows[0]));
export async function createReviewBundle(state,{includeIndividual=false,generatedAt=new Date().toISOString()}={}) {
  if(typeof includeIndividual!=='boolean')throw new Error('Choose whether to include individual study data.');
  if(typeof generatedAt!=='string'||generatedAt.length>64||!Number.isFinite(Date.parse(generatedAt)))throw new Error('The bundle date is invalid.');
  const date=new Date(generatedAt).toISOString();
  // Capture and revalidate before the first asynchronous hash: later UI edits cannot mix snapshots.
  const project=exportProject(state,date),snapshot=parseProject(project);
  const {entries,planConfig,options,notes}=snapshot;
  if(!entries.length)throw new Error('Import session files before downloading a review bundle.');
  const assets=studySummaryAssets(entries,planConfig,options,date),summary=assets.summary;
  if(!globalThis.crypto?.subtle)throw new Error('Bundle integrity checks require HTTPS or localhost. Use individual downloads in this browser.');
  const files=[],omitted=[];
  const add=(path,text)=>files.push({path,data:encoder.encode(text)});
  add('readme.txt',`SearchAssist 1.4 review bundle\nGenerated ${date}\n\nExtract this ZIP before opening study-summary.html. It works offline; use the browser Print command to print or save as PDF. JSON time values and differences use milliseconds; success uses proportions or percentage points as labelled. Rating responses are ordinal 1-7. CSV values use the JSON units. All files describe one current-plan/current-batch snapshot. Read the report's definitions and limits.\n\n${includeIndividual?'This bundle includes individual study data in individual/. Workspace JSON contains full recordings, typed queries, participant observations, decisions and notes; other individual CSVs retain codes, filenames and applicable reviewer notes. Keep this archive with study data. Open individual/workspace.json through Open workspace JSON to restore the review. Undo history is not saved.':'Aggregate-only bundle. Codes, filenames, plan prefixes, query text, participant observations, reviewer notes, and individual rows are omitted. Small-group counts may still identify people in context. This bundle does not contain a restorable workspace; download a separate workspace backup if needed.'}\n\nmanifest.json lists each payload file's UTF-8 byte count and SHA-256 digest. The manifest does not hash itself. Checksums detect file changes; they are not a digital signature or proof of authenticity. This ZIP is not encrypted. Missing participant-level reports are listed under omittedFiles. No data are uploaded by the app.\n`);
  add('study-summary.html',assets.html);add('study-summary.json',assets.json);
  add('condition-summary.csv',rowsCsv(summary.conditions));add('paired-summary.csv',rowsCsv(summary.paired));
  add('rating-distributions.csv',ratingSummaryCsv(entries,options));add('matched-ratings.csv',pairedRatingSummaryCsv(entries,options));
  // The existing balance CSV includes a plan prefix; the aggregate bundle deliberately uses reduced rows.
  add('balance.csv',rowsCsv(summary.balance));
  if(includeIndividual) {
    add('individual/workspace.json',project);add('individual/assignments.csv',assignmentCsv(assignments(planConfig)));
    add('individual/inclusion-log.csv',auditCsv(entries,{...options,notes}));
    add('individual/coverage.csv',coverageCsv(entries,planConfig,options));add('individual/assignment-checks.csv',assignmentChecksCsv(entries,planConfig,options));
    if(summary.review.includedRecordings) {
      add('individual/participant-conditions.csv',reviewCsv(entries,options));add('individual/paired-participants.csv',pairedCsv(entries,options));
    } else for(const path of ['individual/participant-conditions.csv','individual/paired-participants.csv'])omitted.push({path,reason:'No included recordings.'});
  }
  const manifest={format:BUNDLE_FORMAT,bundleVersion:BUNDLE_VERSION,applicationVersion:'1.4',generatedAt:date,
    dataScope:includeIndividual?'includes-individual-data':'aggregate-only',archiveEncryption:'none',summaryVersion:summary.summaryVersion,
    protocol:summary.protocol,units:summary.units,settings:summary.settings,review:summary.review,
    hashAlgorithm:'SHA-256',hashScope:'All listed payload files; manifest.json excludes itself. Digests are not signatures.',omittedFiles:omitted,files:[]};
  for(const file of files) {
    const digest=new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',file.data));
    manifest.files.push({path:file.path,bytes:file.data.length,sha256:[...digest].map(n=>n.toString(16).padStart(2,'0')).join('')});
  }
  return {bytes:storedZip([{path:'manifest.json',data:encoder.encode(JSON.stringify(manifest,null,2))},...files]),manifest};
}
