// ZIP method 0 (stored), UTF-8 flag, CRC32, local/central records, one disk.
// PKWARE APPNOTE sections 4.3.7, 4.3.12, 4.3.16:
// https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT
export const MAX_ZIP_BYTES = 32 * 1024 * 1024;
const encoder=new TextEncoder();
const crcTable=Uint32Array.from({length:256},(_,n)=>{
  for(let i=0;i<8;i++)n=n&1 ? 0xedb88320^(n>>>1) : n>>>1;
  return n>>>0;
});
export function crc32(bytes) {
  let crc=0xffffffff;
  for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);
  return (crc^0xffffffff)>>>0;
}
export function storedZip(files) {
  if(!Array.isArray(files)||!files.length||files.length>32)throw new Error('Choose 1–32 bundle files.');
  const names=new Set();let total=22;
  const entries=files.map(({path,data})=>{
    if(typeof path!=='string'||path.length>256||!/^(?:[a-z0-9][a-z0-9._-]*\/)*[a-z0-9][a-z0-9._-]*$/.test(path)||names.has(path))throw new Error('Bundle paths must be unique, safe relative names.');
    if(!(data instanceof Uint8Array))throw new Error('Bundle file data must be UTF-8 bytes.');
    names.add(path);const name=encoder.encode(path);total+=76+name.length*2+data.length;
    if(total>MAX_ZIP_BYTES)throw new Error('The review bundle exceeds 32 MB. Download reports separately.');
    return {name,data,crc:crc32(data)};
  });
  const output=new Uint8Array(total),view=new DataView(output.buffer);let offset=0;
  const put16=(at,n)=>view.setUint16(at,n,true),put32=(at,n)=>view.setUint32(at,n,true);
  for(const e of entries) {
    e.offset=offset;put32(offset,0x04034b50);put16(offset+4,20);put16(offset+6,0x800);
    // Fixed 1980-01-01 metadata keeps archives deterministic; actual UTC date is in the manifest.
    put16(offset+12,33);put32(offset+14,e.crc);put32(offset+18,e.data.length);put32(offset+22,e.data.length);put16(offset+26,e.name.length);
    output.set(e.name,offset+30);output.set(e.data,offset+30+e.name.length);offset+=30+e.name.length+e.data.length;
  }
  const centralStart=offset;
  for(const e of entries) {
    put32(offset,0x02014b50);put16(offset+4,20);put16(offset+6,20);put16(offset+8,0x800);put16(offset+14,33);
    put32(offset+16,e.crc);put32(offset+20,e.data.length);put32(offset+24,e.data.length);put16(offset+28,e.name.length);put32(offset+42,e.offset);
    output.set(e.name,offset+46);offset+=46+e.name.length;
  }
  const centralSize=offset-centralStart;put32(offset,0x06054b50);put16(offset+8,entries.length);put16(offset+10,entries.length);put32(offset+12,centralSize);put32(offset+16,centralStart);
  return output;
}
