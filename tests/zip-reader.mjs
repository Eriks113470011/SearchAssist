// Small test-only reader for our stored ZIP output. Python zipfile independently validates CI artifacts.
export function readStoredFiles(bytes) {
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),decoder=new TextDecoder(),files=new Map();let offset=0;
  while(view.getUint32(offset,true)===0x04034b50) {
    const n=view.getUint16(offset+26,true),extra=view.getUint16(offset+28,true),size=view.getUint32(offset+18,true),start=offset+30+n+extra;
    files.set(decoder.decode(bytes.slice(offset+30,offset+30+n)),bytes.slice(start,start+size));offset=start+size;
  }
  if(view.getUint32(offset,true)!==0x02014b50||view.getUint32(bytes.length-22,true)!==0x06054b50||view.getUint16(bytes.length-12,true)!==files.size)throw new Error('Invalid stored archive');
  return files;
}
