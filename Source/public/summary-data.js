import {sourceView} from './knowledge.js';
import {cleanSourceText,mediaFormat} from './card-text.js';

// Derived text only. Images, titles and personal notes are never substituted for source text.
// format comes from the saved record (text, image or video); a client that already cleaned the text may pass it along.
export function summarySource(item){
  const body=cleanSourceText(sourceView(item).body,{keepOpening:true}).replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/https?:\/\/\S+/g,'').replace(/#[^\s#]+/g,'').trim().slice(0,6000);
  const comparable=s=>s.replace(/[^\p{L}\p{N}]/gu,'');
  const useful=comparable(body).length>=25&&comparable(body)!==comparable(item.title||'');
  const detected=mediaFormat(item);
  const format=detected!=='text'?detected:['video','image'].includes(item.format)?item.format:'text';
  return {id:item.id,title:String(item.title||'').slice(0,160),content:body,format,useful};
}
// v3: card takeaways. Older previews are replaced the next time a card is generated.
export function summaryHash(item){
  const {title,content}=summarySource(item);let h=2166136261;
  for(const c of JSON.stringify([title,content]))h=Math.imul(h^c.charCodeAt(0),16777619);
  return 'v3-'+(h>>>0).toString(16);
}
export function currentSummary(cache,item){const entry=cache?.[item.id];return entry?.hash===summaryHash(item)?entry:null;}

// A card line must be one finished sentence that fits the card as written. Too long or cut short is rejected, never trimmed.
export const CARD_LIMITS={zh:56,en:34};
// A closed list, so the first word of every card means the same thing everywhere. Chinese and English must name the same kind.
export const CARD_KINDS=[['提示词','Prompt'],['方法','Method'],['工具','Tool'],['案例','Example'],['研究','Research'],['观点','Opinion'],['资源','Resource'],['课程','Course'],['招聘','Hiring'],['经验','Experience'],['提问','Question'],['活动','Event']];
export function cardKind(text,lang){const m=String(text||'').trim().match(lang==='zh'?/^([^：:\s]{1,6})[：:]/:/^([A-Za-z]+)\s*:/);if(!m)return -1;const i=CARD_KINDS.findIndex(k=>lang==='zh'?k[0]===m[1]:k[1].toLowerCase()===m[1].toLowerCase());return i;}
export function cardLineProblem(text,lang){
  const s=String(text||'').trim();
  if(!s)return 'empty';
  if(/…|\.\.\./.test(s))return 'ellipsis';
  if(lang==='zh'){if([...s].length>CARD_LIMITS.zh)return 'too long';if(!/[。！？][”」』）)]?$/.test(s))return 'not a finished sentence';}
  else{if(s.split(/\s+/).length>CARD_LIMITS.en||s.length>240)return 'too long';if(!/[.!?]["'’”)]?$/.test(s))return 'not a finished sentence';}
  const sentences=lang==='zh'?(s.match(/[。！？]/g)||[]).length:(s.match(/[.!?](?=\s+[A-Z])/g)||[]).length+1;
  if(sentences>1)return 'more than one sentence';
  if(/^(?:this (?:post|note|thread)|the (?:post|note|author) (?:describes|introduces|shares|explains))|^(?:本文|这篇|这条|作者(?:介绍|分享|讲述))/i.test(s))return 'describes the post instead of the takeaway';
  if(cardKind(s,lang)<0)return 'does not start with a kind from the list';
  if(lang==='zh'?/^提问[:：]/.test(s)&&!/评论/.test(s):/^question\s*:/i.test(s)&&!/comment/i.test(s))return 'question card does not point to the comments';
  return '';
}
// Quotable passages for the card writer. A label line ("目前开放这几个实习岗位：", "👉Prompt") is joined with the lines that
// follow, as one exact span of the source, so a card can cite the content and not the label. "10.30" is not a sentence end.
const isLabel=s=>/[:：]\s*$/.test(s)||s.replace(/[^\p{L}\p{N}]/gu,'').length<10;
export function evidenceOptions(content){
  const text=String(content||''),parts=text.split(/\n|(?<=[。！？!?])\s*|(?<=\.)(?!\d)\s*/u).map(s=>s.trim()).filter(s=>s.length>=4);
  const out=[];let pos=0;
  for(let i=0;i<parts.length&&out.length<24;i++){
    const start=text.indexOf(parts[i],pos);if(start<0)continue;let end=start+parts[i].length;
    if(isLabel(parts[i]))while(i+1<parts.length&&end-start<200){const k=text.indexOf(parts[i+1],end);if(k<0)break;end=k+parts[i+1].length;i++;if(!isLabel(parts[i]))break;}
    pos=end;out.push(text.slice(start,Math.min(end,start+200)));
  }
  return out;
}
export function validateSummaryResults(data,items,problems){
  if(!Array.isArray(data?.summaries))throw Error('Invalid summary response');
  const seen=new Set(),valid=[];const note=(id,why)=>problems&&problems.push({id,why});
  for(const s of data.summaries){
    const item=items.find(x=>x.id===s.id);
    if(!item||seen.has(s.id)||!['ready','insufficient'].includes(s.status))continue;
    if(s.status==='insufficient'){seen.add(s.id);valid.push({id:s.id,status:s.status});continue;}
    if(!item.useful){note(s.id,'source text too short');continue;}
    if(typeof s.evidence!=='string'||!item.content.includes(s.evidence)){note(s.id,'evidence not in source');continue;}
    if(s.evidence.replace(/[^\p{L}\p{N}]/gu,'').length<10||/[:：]\s*$/.test(s.evidence.trim())){note(s.id,'evidence is a label, not a supporting sentence');continue;}
    const bad=['zh','en'].map(k=>[k,cardLineProblem(s[k],k)]).find(([,p])=>p);
    if(bad){note(s.id,`${bad[0]}: ${bad[1]}`);continue;}
    if(cardKind(s.zh,'zh')!==cardKind(s.en,'en')){note(s.id,'Chinese and English name different kinds');continue;}
    seen.add(s.id);valid.push({id:s.id,status:'ready',zh:s.zh.trim(),en:s.en.trim(),evidence:s.evidence});
  }
  return valid;
}
