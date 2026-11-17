import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {findReferences} from './lib/agent.mjs';
const root=resolve('public');let active=0;
const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/api/find'){
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
  const fail=(status,error)=>{res.writeHead(status);res.end(JSON.stringify({error}));};
  if(req.method!=='POST')return fail(405,'Method not allowed');
  if(req.headers.origin&&!['http://127.0.0.1:5180','http://localhost:5180'].includes(req.headers.origin))return fail(403,'Origin not allowed');
  if(active>=2)return fail(429,'请等当前检索完成。');
  active++;
  try{let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>500000)throw new Error('资料过大，请缩小检索范围。');}const result=await findReferences(JSON.parse(raw));res.end(JSON.stringify(result));}catch(e){fail(e.status||400,e.message);}finally{active--;}
  return;
 }
 if(req.method!=='GET'){res.writeHead(405);return res.end();}
 const file=resolve(root,'.'+(pathname==='/'?'/index.html':decodeURIComponent(pathname)));
 if(!file.startsWith(root+'/')){res.writeHead(403);return res.end();}
 try{const body=await readFile(file);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.json':'application/json','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp'})[extname(file)]||'application/octet-stream');res.end(body);}catch{res.writeHead(404);res.end('Not found');}
});server.listen(5180,'127.0.0.1',()=>console.log('拾页 → http://127.0.0.1:5180'));
