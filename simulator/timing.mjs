import {words} from './text.mjs';
import {triangular} from './random.mjs';
export const TIMING_VERSION='operator-cost-hypotheses-v1';
export function actionCost(action,preview,timing,timeScale,draw,index) {
  const sample=key=>triangular(timing[key],draw('timing',action.type,index,key))*timeScale;
  const components={readingMs:Math.round(words(preview.readingText).length*sample('wordMs')),decisionMs:Math.round(sample('decisionMs')),
    typingMs:Math.round(preview.keyCount*sample('keyMs')),pointClickMs:Math.round(preview.clicks*sample('pointClickMs')),systemWaitMs:Math.round(preview.waits*timing.systemWaitMs)};
  return {type:action.type,keyCount:preview.keyCount,readWords:words(preview.readingText).length,clicks:preview.clicks,...components,durationMs:Object.values(components).reduce((a,b)=>a+b,0)};
}
