import {summarySource,summaryHash,currentSummary,validateSummaryResults} from './summary-data.js';

export function createReadingSummaries({h,L,read,write,items,redraw,request},initial={}){
  let cache=initial||{},run=null,message='';
  const entry=x=>currentSummary(cache,x);
  const label=()=>L('AI 摘要','AI summary');
  const overview=()=>L('简介','Overview');
  const insufficient=()=>L('正文不足，打开原文查看更多。','Not enough source text. Open the original for more.');
  function preview(x){
    const s=entry(x);if(s?.status==='ready')return h('span',{class:'reading-preview'},h('span',{class:'reading-label',title:s.origin==='owner-caption'?overview():label()},s.origin==='owner-caption'?overview():'AI'),h('span',{class:'reading-copy'},L(s.zh,s.en)));
    if(s?.status==='insufficient'||!summarySource(x).useful)return h('span',{class:'reading-missing'},insufficient());
    return null;
  }
  function detail(host,x){
    host.replaceChildren();host.hidden=!x;if(!x)return;
    const s=entry(x);host.append(h('h3',{},s?.origin==='owner-caption'?overview():label()));
    if(s?.status==='ready')host.append(h('p',{class:'reading-detail-copy'},L(s.zh,s.en)));
    else if(s?.status==='insufficient'||!summarySource(x).useful)host.append(h('p',{class:'hint'},insufficient()));
    else host.append(h('p',{class:'hint'},L('先读简短摘要，再决定是否展开原文。','Read a short preview before exploring the source.')),h('button',{type:'button',class:'ghost',disabled:!!run,onclick:()=>generate([x])},L('生成这条摘要','Summarize this note')));
  }
  function banner(host,list,hidden=false){
    host.replaceChildren();host.hidden=hidden||!list.length;if(host.hidden)return;
    const pending=list.filter(x=>!entry(x)&&summarySource(x).useful),ready=list.filter(x=>entry(x)?.status==='ready').length,captions=list.filter(x=>entry(x)?.status==='ready'&&entry(x)?.origin==='owner-caption').length,short=list.filter(x=>entry(x)?.status!=='ready'&&(entry(x)?.status==='insufficient'||!summarySource(x).useful)).length;
    const info=h('div',{},h('strong',{},label()),
      h('p',{},run?L(`正在整理摘要 ${run.done} / ${run.total} · 已保存的结果不会丢失`,`Summarizing ${run.done} / ${run.total} · Completed previews are saved`):L(`${ready-captions} 条已有摘要${captions?` · ${captions} 条简介`:''}${short?` · ${short} 条正文不足`:''}`,`${ready-captions} summarized${captions?` · ${captions} overviews`:''}${short?` · ${short} need more text`:''}`)));
    const actions=h('div',{class:'reading-actions'});
    if(run)actions.append(h('button',{type:'button',class:'ghost',onclick:()=>{run.cancelled=true;run.controller?.abort();}},L('停止','Stop')));
    else if(pending.length)actions.append(h('button',{type:'button',class:'ghost',onclick:()=>generate(pending)},L(`总结当前 ${pending.length} 条`,`Summarize ${pending.length} ${pending.length===1?'note':'notes'}`)));
    host.append(info,actions);
    if(message)host.append(h('p',{class:'reading-message',role:'status'},message));
  }
  async function generate(list){
    if(run)return;
    const pending=list.filter(x=>!entry(x)&&summarySource(x).useful);if(!pending.length)return;
    const job={done:0,total:pending.length,cancelled:false,controller:null};run=job;message='';redraw();
    let failed=0;
    try{
      for(let i=0;i<pending.length&&!job.cancelled;i+=8){
        const batch=pending.slice(i,i+8),sources=batch.map(summarySource),hashes=new Map(batch.map(x=>[x.id,summaryHash(x)]));
        job.controller=new AbortController();
        const data=await request({mode:'summarize',items:sources},job.controller.signal);
        if(job.cancelled)break;
        const results=validateSummaryResults(data,sources);
        const next={...(await read('summaries')||{}),...cache};
        for(const s of results){const current=items().find(x=>x.id===s.id);if(current&&summaryHash(current)===hashes.get(s.id))next[s.id]={...s,hash:hashes.get(s.id),createdAt:new Date().toISOString(),model:data.model||''};}
        // Never write the items key: user edits, images and topics remain untouched.
        await write('summaries',next);cache=next;failed+=batch.length-results.length;job.done+=batch.length;redraw();
      }
      if(failed)message=L(`${failed} 条未生成有效摘要，可以重试。`,`${failed} previews could not be verified. You can retry.`);
    }catch(error){if(!job.cancelled){message=error.message||L('摘要生成失败，请重试。','Could not generate summaries. Please retry.');}}
    finally{run=null;redraw();}
  }
  return {preview,detail,banner,entry,generate};
}
