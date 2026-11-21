export const RNG_VERSION='fnv1a32-mulberry32-keyed-v1';
// Independent keyed draws avoid shifting recognition randomness when another action adds timing draws.
export function randomUnit(seed,...keys) {
  let h=(2166136261^seed)>>>0;
  for(const byte of new TextEncoder().encode(JSON.stringify(keys)))h=Math.imul(h^byte,16777619)>>>0;
  let n=(h+0x6d2b79f5)>>>0;n=Math.imul(n^(n>>>15),n|1);n^=n+Math.imul(n^(n>>>7),n|61);
  return ((n^(n>>>14))>>>0)/4294967296;
}
export function triangular([min,mode,max],u) {
  if(max===min)return min;
  const pivot=(mode-min)/(max-min);
  return u<pivot ? min+Math.sqrt(u*(max-min)*(mode-min)) : max-Math.sqrt((1-u)*(max-min)*(max-mode));
}
