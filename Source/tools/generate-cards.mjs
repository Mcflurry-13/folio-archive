// Generate reading cards for the two built-in collections with the same rules the app uses for any imported note.
// Run on a machine that holds the server key:  node --env-file=.env.local tools/generate-cards.mjs eval|build
// eval  : 12 fixed notes, results written to test-output/cards/ for review. No collection file changes.
// build : every note in both collections; replaces the cached cards in public/collection/*/library.json.
// The key is read from the environment by lib/summarize.mjs and never printed or written.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {summarize} from '../lib/summarize.mjs';
import {summarySource,summaryHash,currentSummary,cardLineProblem} from '../public/summary-data.js';

const FILES={x:'public/collection/x-v1/library.json',rednote:'public/collection/v1/library.json'};
// Text prompt post, video with a described method, video with a blank cover, research paper, opportunity, course link;
// recruitment, video-contest promo, shared prompt, opinion piece, resume method, question post.
export const EVAL_IDS=['x-2120508498236596597','x-2115789995860517254','x-2114840905622618376','x-2120699496158114136','x-2118759160443769253','x-2095224415567167978',
 'xiaohongshu:6ae70cef0000000015004a30','xiaohongshu:6ae3fca7000000000e02f990','xiaohongshu:692fd129000000001d0389de','xiaohongshu:6ae9d8e0000000001f0153b1','xiaohongshu:692dc283000000001e02a337','xiaohongshu:6aed27b4000000002a0066d9'];

const mode=process.argv[2];
if(!['eval','build'].includes(mode)){console.error('Usage: node --env-file=.env.local tools/generate-cards.mjs eval|build');process.exit(1);}
if(!process.env.OPENAI_API_KEY){console.error('OPENAI_API_KEY is not set. Run with --env-file=.env.local.');process.exit(1);}

const collections={};for(const [k,f] of Object.entries(FILES))collections[k]=JSON.parse(await readFile(f,'utf8'));
const stamp=new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);

async function cardsFor(items){
 const out=new Map(),problems=[],raw=[];let model='';
 let pending=items.filter(x=>summarySource(x).useful);
 for(const x of items.filter(x=>!summarySource(x).useful))out.set(x.id,{id:x.id,status:'insufficient'});
 for(let attempt=1;attempt<=3&&pending.length;attempt++){
  const batches=[];for(let i=0;i<pending.length;i+=8)batches.push(pending.slice(i,i+8));
  for(let i=0;i<batches.length;i+=2){
   const results=await Promise.all(batches.slice(i,i+2).map(b=>summarize({items:b.map(summarySource)},{debug:true}).catch(e=>({summaries:[],failed:b.map(x=>x.id),error:e.message}))));
   for(const r of results){model=r.model||model;for(const s of r.summaries)out.set(s.id,s);for(const p of r.problems||[])problems.push({...p,attempt});for(const s of r.raw||[])raw.push({...s,attempt});if(r.error)problems.push({id:'(batch)',why:r.error,attempt});}
   process.stdout.write(`  attempt ${attempt}: ${out.size}/${items.length}\r`);
  }
  pending=pending.filter(x=>!out.has(x.id));
 }
 process.stdout.write('\n');
 return {out,problems,raw,model,missing:pending.map(x=>x.id)};
}

const byId=new Map(Object.values(collections).flatMap(c=>c.items).map(x=>[x.id,x]));
if(mode==='eval'){
 const items=EVAL_IDS.map(id=>byId.get(id));
 const {out,problems,raw,model,missing}=await cardsFor(items);
 const rows=items.map(x=>{const s=out.get(x.id)||{};const src=summarySource(x);return {id:x.id,title:x.title,format:src.format,status:s.status||'failed',zh:s.zh||'',en:s.en||'',evidence:s.evidence||'',input:src.content.slice(0,700)};});
 await mkdir('test-output/cards',{recursive:true});
 const file=`test-output/cards/eval-${stamp}.json`;
 await writeFile(file,JSON.stringify({model,createdAt:new Date().toISOString(),rows,problems,raw,missing},null,1));
 for(const r of rows)console.log(`\n[${r.status}] ${r.format} · ${r.title}\n  zh: ${r.zh}\n  en: ${r.en}`);
 console.log(`\nRejected by program checks (all attempts): ${problems.length}. Saved to ${file}`);
}else{
 const report={};
 for(const [key,data] of Object.entries(collections)){
  console.log(`${key}: ${data.items.length} notes`);
  // Owner-approved display captions are not fabricated source evidence or model outputs. Preserve them on rebuild.
  const captions=new Map(data.items.map(x=>[x.id,currentSummary(data.summaries,x)]).filter(([,s])=>s?.origin==='owner-caption'&&s.status==='ready'&&!cardLineProblem(s.zh,'zh')&&!cardLineProblem(s.en,'en')));
  const {out,problems,model,missing}=await cardsFor(data.items.filter(x=>!captions.has(x.id)));
  const summaries={},now=new Date().toISOString();
  for(const x of data.items){const s=out.get(x.id);if(captions.has(x.id))summaries[x.id]=captions.get(x.id);else if(s)summaries[x.id]={...s,hash:summaryHash(x),createdAt:now,model};}
  data.summaries=summaries;
  if(data.items.some(x=>summaries[x.id]&&!currentSummary(summaries,x)))throw Error('Hash mismatch; nothing written');
  await writeFile(FILES[key],JSON.stringify(data));
  report[key]={ready:Object.values(summaries).filter(s=>s.status==='ready').length,ownerCaptions:captions.size,insufficient:Object.values(summaries).filter(s=>s.status==='insufficient').length,notGenerated:missing.length,rejectedAttempts:problems.length,model};
 }
 await mkdir('test-output/cards',{recursive:true});
 await writeFile(`test-output/cards/build-${stamp}.json`,JSON.stringify(report,null,1));
 console.log(JSON.stringify(report,null,1));
}
