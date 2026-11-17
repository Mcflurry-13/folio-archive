#!/usr/bin/env node
// Runs the EVALUATION.md questions against a running Folio server, through the same plan → search → review → answer
// pipeline as public/kb-workspace.js. Independent of the UI. Records which saves survive each stage.
//
//   node tools/eval-agent.mjs                       fixture library (tools/fixtures/eval-library.json), output in evidence/eval/
//   node tools/eval-agent.mjs --library BACKUP.json a Folio JSON backup ({version:1,items}); output goes OUTSIDE the project
//                                                    (../folio-eval-private/) so personal saves never enter the repo or deploy.
//   FOLIO_BASE=http://127.0.0.1:5180/  (default)
//
// Each run sends saved text to the configured OpenAI model through the local server, the same as normal use.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chunks,batches,inTopicScope} from '../public/knowledge.js';

const args=process.argv.slice(2);const libArg=args.includes('--library')?args[args.indexOf('--library')+1]:'';
const base=process.env.FOLIO_BASE||'http://127.0.0.1:5180/';
const libPath=libArg?resolve(libArg):new URL('./fixtures/eval-library.json',import.meta.url);
const lib=JSON.parse(await readFile(libPath,'utf8'));const items=Array.isArray(lib)?lib:lib.items;
if(!Array.isArray(items)||!items.length)throw Error('Library has no items');
const topicOf=id=>items.find(x=>x.id===id)?.category||'';

async function call(body){
 const r=await fetch(new URL('api/find',base),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,language:'zh'})});
 const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(`${body.mode}: ${d.error||r.status}`);return d;
}
const newTask=goal=>({id:crypto.randomUUID(),revision:0,goal,constraints:'',preferences:'',confirmedDirections:'',rejectedDirections:'',unresolvedQuestions:'',selectedIds:[],excludedIds:[],history:[]});

// Mirrors search() in public/kb-workspace.js.
async function ask(task,follow=''){
 if(follow)task.history=[...task.history,{role:'user',text:follow}];
 const manual = new Map(lib.manualTopics || []);
 const available=items.map(x=>({...x,topics:[x.category,...(manual.get(x.id)||[])].filter(Boolean)}));
 const input={currentTask:task.goal+(follow?'\n'+follow:'')};
 const req=(stage,data)=>call({mode:'kb-'+stage,taskContext:{...task,history:task.history.slice(-8)},...data});
 const plan=await req('plan',{...input,topicCatalog:[...new Set(available.flatMap(x=>x.topics))]});
 if(plan.status==='clarify'){task.history.push({role:'assistant',text:plan.question});return {plan,stages:{searched:[],reviewed:[]},result:{status:'clarify',question:plan.question,summary:plan.question,draft:'',recommendations:[]}};}
 const scoped=inTopicScope(available,plan.topicScope);const all=chunks(scoped);
 input.coverage={authorizedCount:scoped.length,textCount:new Set(all.map(x=>x.id)).size};
 const depth=plan.depth||'';input.outputKind=plan.outputKind||'';input.anchorTerms=plan.anchorTerms||[];let evidence=[];const bs=batches(all);
 for(const b of bs){const r=await req('search',{...input,depth,questions:plan.questions,blocks:b});evidence.push(...r.candidates);}
 evidence=[...new Map(evidence.map(e=>[e.blockId+'|'+e.quote,e])).values()];
 const searched=[...new Set(evidence.map(e=>e.id))];
 const reviewed=await req('review',{...input,depth,evidence,questions:plan.questions});evidence=reviewed.evidence;
 const read=new Set(all.map(b=>b.id)).size;
 const result=await req('answer',{...input,depth,questions:plan.questions,evidence,coverage:{...input.coverage,readCount:read,completedBatches:bs.length,totalBatches:bs.length,missingText:scoped.length-read}});
 task.history.push({role:'assistant',text:result.question||result.summary,draft:result.draft||'',missing:result.missing});
 return {plan,stages:{searched,reviewed:[...new Set(evidence.map(e=>e.id))]},result};
}

const cited=r=>[...new Set((r.recommendations||[]).flatMap(x=>(x.evidence||[]).map(e=>e.id)))];
const visible=r=>[r.question||r.summary,r.draft,...(r.recommendations||[]).flatMap(x=>[x.title,x.advice]),...(r.plan||(r.nextStep?[r.nextStep]:[])),...(r.missing||[])].filter(Boolean).join('').length;
// Heuristic hints only. The pass/fail written in EVALUATION.md is a human judgment after reading the output.
const hints={
 1:o=>[`depth=${o.plan.depth||'-'}`,`topics cited=${new Set(cited(o.result).map(topicOf)).size}`],
 2:o=>[`topics cited=${new Set(cited(o.result).map(topicOf)).size}`],
 3:o=>{const t=JSON.stringify(o.result);return [`mentions text-only=${/文字|text/.test(o.result.summary||o.result.question||'')}`,`asks for upload=${/上传|upload/i.test(t)}`];},
 4:o=>[`depth=${o.plan.depth||'-'}`,`cites preview-1=${cited(o.result).includes('preview-1')}`,`preview-1 searched=${o.stages.searched.includes('preview-1')} reviewed=${o.stages.reviewed.includes('preview-1')}`],
 5:o=>[`borrowed=${(o.result.borrowed||[]).map(b=>b.text).join('|')||'none'}`,`reference numbers in draft=${/62|88/.test(o.result.draft||'')}`,`homepage carried over=${/首页|相机|书架/.test(o.result.draft||'')}`]
};

const startedAt=new Date().toISOString();
let checkpoint=Promise.resolve();
const saveProgress=()=>checkpoint=checkpoint.then(async()=>{const version=runs[0]?.result.promptVersion||'unknown';const stamp=startedAt.slice(0,16).replace(/-/g,'').replace('T','-').replace(':','');const dir=libArg?resolve('..','folio-eval-private'):resolve('evidence','eval');await mkdir(dir,{recursive:true});const file=resolve(dir,`${version}-${libArg?'library':'fixtures'}-${stamp}.json`);await writeFile(file,JSON.stringify({version,base,library:libArg?'private backup (path not recorded)':'tools/fixtures/eval-library.json',items:items.length,ranAt:startedAt,runs},null,2));return file;});
const runs=[];const log=async(n,q,o)=>{const r=o.result;runs.push({n,question:q,...o});console.log(`\nQ${n} ${q}\n  ${r.promptVersion||'?'} · ${r.status} · depth ${o.plan.depth||'-'} · ${visible(r)} chars · cited ${cited(r).join(', ')||'none'}\n  stages: searched ${o.stages.searched.join(',')||'-'} | reviewed ${o.stages.reviewed.join(',')||'-'}\n  hints: ${(hints[n]?.(o)||[]).join(' · ')}\n  summary: ${(r.question||r.summary||'').slice(0,160)}\n  draft: ${(r.draft||'').replace(/\n/g,' / ').slice(0,240)}`);if(r.quality?.audits?.some(a=>a.issues.length))console.log('  review:',JSON.stringify(r.quality.audits.map(a=>a.issues)));await saveProgress();};

const Q={1:'帮我做个人网站',2:'我收藏过哪些交互效果适合放在首页？',3:'照我收藏的截图配色，帮我定网站颜色',4:'怎么用 Three.js 做首屏的滚动相机动画？',5:'帮我改这段简历经历：参与了学校选课系统的重设计项目，负责部分界面设计，和团队一起完成了用户调研。'};
for(const n of [1,3,4]){await log(n,Q[n],await ask(newTask(Q[n])));}
const t2=newTask(Q[2]);await log(2,Q[2],await ask(t2));await log(5,Q[5]+' (same conversation as Q2)',await ask(t2,Q[5]));

console.log(`\nSaved ${await saveProgress()}`);
