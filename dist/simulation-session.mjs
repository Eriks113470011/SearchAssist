import {createSession,snapshot,csv} from './study.mjs';
export const SIMULATION_STORAGE_KEY='searchassist-simulation-browser-v1';
export const BROWSER_RECORDING_FORMAT='searchassist-simulation-browser-recording';
export function isSimulationRecording(s){return s?.format===BROWSER_RECORDING_FORMAT&&s.dataOrigin==='synthetic'&&s.runner==='browser'&&s.calibrationStatus==='uncalibrated';}
export function createSimulationSession(options,time){return {...createSession(options,time),format:BROWSER_RECORDING_FORMAT,dataOrigin:'synthetic',calibrationStatus:'uncalibrated',runner:'browser',humanRatings:null};}
export function advanceSimulationBlock(session,time={wall:Date.now()}) {
  if(!isSimulationRecording(session)||session.phase!=='ratings'||session.ratings.length)throw new Error('Only a synthetic browser session can advance without human ratings.');
  session.phase=session.taskIndex===12?'complete':'tasks';
  if(session.phase==='complete')session.finishedAt=new Date(time.wall).toISOString();
}
export function simulationRecordingCsv(session,time) {
  if(!isSimulationRecording(session))throw new Error('Expected a synthetic browser recording.');
  const rows=snapshot(session,time).trials.map(t=>({dataOrigin:'synthetic',calibrationStatus:'uncalibrated',runner:'browser',participant:session.participant,...t}));
  return csv(rows,['dataOrigin','calibrationStatus','runner','participant','taskIndex','condition','success','skipped','activeElapsedMs','wallElapsedMs','initialQuery','finalQuery','queryReformulations','resultOpens','incorrectFinalSelection']);
}
