import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
// Serve only shipped app assets, never repository files, recordings, or arbitrary directories.
const assets=new Set(['index.html','app.mjs','data.mjs','engine.mjs','study.mjs','simulation-session.mjs','workspace.mjs','workspace-view.mjs','review-project.mjs','paired.mjs','coverage.mjs','study-summary.mjs','ratings.mjs','zip.mjs','review-bundle.mjs','styles.css','style.css','favicon.svg']);
export async function startBrowserServer() {
  const root=new URL('../dist/',import.meta.url);
  const server=createServer(async(req,res)=>{
    try {
      const url=new URL(req.url,'http://127.0.0.1'),name=url.pathname==='/'?'index.html':url.pathname.slice(1);
      if(req.method!=='GET'||!assets.has(name)){res.writeHead(404).end();return;}
      const data=await readFile(fileURLToPath(new URL(name,root)));
      res.writeHead(200,{'Content-Type':name.endsWith('.mjs')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.svg')?'image/svg+xml':'text/html','Cache-Control':'no-store'}).end(data);
    }catch{res.writeHead(404).end();}
  });
  await new Promise((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',done);});
  return {origin:`http://127.0.0.1:${server.address().port}`,close:()=>new Promise((done,reject)=>server.close(e=>e?reject(e):done()))};
}
