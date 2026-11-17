import {eligibleEvidence} from '../public/knowledge.js';
import {CORE,STAGES,VERSION,answerInstructions} from './prompts.mjs';
import {enforceTopicPurpose} from './topic-purpose.mjs';
const str={type:'string'},arr=items=>({type:'array',items}),obj=properties=>({type:'object',additionalProperties:false,properties,required:Object.keys(properties)});
const ev=obj({id:str,blockId:str,kind:{type:'string',enum:['source','user_note']},quote:str});
const candidate=obj({id:str,blockId:str,kind:{type:'string',enum:['source','user_note']},quote:str,use:str,limitation:str});
const topic=obj({id:str,name:str,purpose:str,rule:str,evidence:arr(ev)});
const schemas={review:obj({acceptedEvidenceIds:arr(str),rationale:str}),plan:obj({status:{type:'string',enum:['ready','clarify']},depth:{type:'string',enum:['explore','focused']},question:str,goal:str,outputKind:{type:'string',enum:['directions','advice','steps','copy']},anchorTerms:{...arr(str),maxItems:4},questions:{...arr(str),minItems:1,maxItems:4}}),search:obj({candidates:arr(candidate)}),answer:obj({status:{type:'string',enum:['ready','no_match','clarify']},question:str,summary:str,draft:str,recommendations:arr(obj({title:str,advice:str,tradeoff:str,evidence:arr(ev)})),plan:arr(str),missing:arr(str),nextStep:str}),topics:obj({topics:arr(topic)}),taxonomy:obj({topics:arr(topic)}),assign:obj({assignments:arr(obj({id:str,topicId:str,reason:str,evidence:ev}))})};
export function validateKB(body){
 const stage=body.mode?.replace('kb-','');if(!schemas[stage])throw Error('Unknown knowledge stage');
 if(JSON.stringify(body).length>180000)throw Error('Knowledge request too large');
 if(body.anchorTerms!==undefined&&(!Array.isArray(body.anchorTerms)||body.anchorTerms.length>4||body.anchorTerms.some(x=>typeof x!=='string'||x.length>80)))throw Error('Invalid retrieval anchors');
 const blocks=body.blocks||[];if(!Array.isArray(blocks)||blocks.length>24)throw Error('Batch exceeds 24 blocks');
 const keys=new Set();for(const b of blocks){if(typeof b.id!=='string'||typeof b.blockId!=='string'||keys.has(b.blockId)||!['source','user_note'].includes(b.kind)||typeof b.text!=='string'||b.text.length>4500)throw Error('Invalid evidence block');keys.add(b.blockId);}
 const evidence=body.evidence||[];if(!Array.isArray(evidence)||evidence.length>120)throw Error('Invalid candidate count');
 if(body.taskContext&&(!Array.isArray(body.taskContext.selectedIds)||!Array.isArray(body.taskContext.excludedIds)))throw Error('Invalid task context');
 return {stage,blocks,evidence};
}
export function checkEvidence(e,blocks,candidates=[]){return !!e&&typeof e.quote==='string'&&e.quote.trim().length>=4&&eligibleEvidence(e.quote)&&(blocks.some(b=>b.id===e.id&&b.blockId===e.blockId&&b.kind===e.kind&&b.text.includes(e.quote))||candidates.some(c=>c.id===e.id&&c.blockId===e.blockId&&c.kind===e.kind&&c.quote===e.quote));}
// Deterministic guard for the user/reference boundary. Flags numbers and copied spans in the draft that appear in
// reference text but nowhere in what the user wrote. It flags and never rewrites: a method name such as "8pt grid" is legitimate.
export const userWords=body=>{const t=body.taskContext||{};return [body.currentTask,t.goal,t.constraints,t.preferences,...(t.history||[]).filter(h=>h.role==='user').map(h=>h.text)].filter(Boolean).join('\n');};
export function borrowedFromReferences(draft,userText,refs){
 const norm=x=>String(x||'').replace(/\s+/g,' ');const d=norm(draft),u=norm(userText),qs=(refs||[]).map(r=>({id:r.id,q:norm(r.quote)}));const out=[],seen=new Set();
 const add=(text,id)=>{text=text.trim();if(!text||seen.has(text))return;seen.add(text);out.push({text,id});};
 for(const m of d.matchAll(/\d+(?:[.,]\d+)?\s*(?:%|％|倍|万|千|k\b|K\b|x\b|×|人|位|天|周|个月|年|步|分钟|小时)?/g)){const t=m[0].trim();if(t.length<2)continue;if(u.includes(t))continue;const r=qs.find(r=>r.q.includes(t));if(r)add(t,r.id);}
 const N=14;for(let i=0;i+N<=d.length;i++){const span=d.slice(i,i+N);if(/[【】]|\[TODO/.test(span)||!/\p{L}/u.test(span)||u.includes(span))continue;const r=qs.find(r=>r.q.includes(span));if(!r)continue;let j=i+N;while(j<d.length&&r.q.includes(d.slice(i,j+1))&&!u.includes(d.slice(i,j+1)))j++;add(d.slice(i,j),r.id);i=j-1;}
 return out.slice(0,5);
}
export function answerIssues(data,body){
 const issues=[];const user=userWords(body);const sections=data.sections||[];const text=sections.map(x=>x.text).join('\n');
 if(sections.some(s=>/:source:\d|blockId|evidenceId|\},\{/.test([s.heading,s.text,s.use].join(' '))))issues.push('Remove internal identifiers or JSON fragments from the visible output.');
 if(data.status==='ready'){
  if(!sections.length||sections.some(x=>!x.text?.trim()))issues.push('Ready output must contain usable sections.');
  if(body.depth==='explore'&&(data.outputKind!=='directions'||sections.length<2||sections.length>3))issues.push('Exploration requires two or three distinct directions.');
  if(body.depth==='focused'&&data.outputKind==='directions')issues.push('Focused request needs its requested output, not exploration branches.');
  if(/(?:^|\n)\s*(?:draft|explore|focused)\s*(?:[:：]|$)/im.test(text))issues.push('Remove internal template labels.');
  if(data.outputKind==='copy'&&sections.length!==1)issues.push('Return one rewritten passage.');
  if(data.outputKind==='copy'&&user.includes('部分')&&!text.includes('部分'))issues.push('Preserve the USER partial scope: keep 部分 in the rewritten responsibility.');
 }
 if((data.plan||[]).length<2||(data.plan||[]).length>3)issues.push('Return two or three practical next steps.');
 for(const c of data.userClaims||[])if(!c.claim?.trim()||!c.userQuote?.trim()||!user.includes(c.userQuote))issues.push('A personal claim lacks an exact supporting USER quote.');
 return [...new Set(issues)];
}
export const latestRequest=body=>{const full=String(body.currentTask||'');const goal=body.taskContext?.goal||'';return goal&&full.startsWith(goal+'\n')?full.slice(goal.length+1):full;};
// The source-access disclosure is factual UI context, not a claim delegated to the model.
export function discloseTextOnly(data,body){
 const request=latestRequest(body);
 if(!/截图|图片|配色|颜色|色彩|视频|screenshot|image|palette|colou?r|video/i.test(request))return data;
 const notice=body.language==='en'?'This response uses saved text only; images and videos have not been analyzed.':'以下建议仅依据收藏文字，尚未分析图片或视频。';
 return {...data,summary:notice+(data.summary?' '+data.summary:'')};
}
const normalizedTerm=x=>String(x||'').toLowerCase().replace(/[^a-z0-9\p{L}]/gu,'');
export function anchoredBlocks(body){
 const anchors=(body.anchorTerms||[]).filter(x=>typeof x==='string'&&x.trim().length>=2).slice(0,4).map(normalizedTerm);
 return (body.blocks||[]).filter(b=>!anchors.length||anchors.some(term=>normalizedTerm(b.text).includes(term)||(b.topics||[]).some(label=>normalizedTerm(label).includes(term))));
}
// Keep the method around a hit: a single result sentence can lose the how-to immediately beside it.
// Context stays in the SAME authorized block/kind and is an exact contiguous excerpt, never inferred text.
export function expandEvidenceContext(candidate,blocks){
 const b=blocks.find(b=>b.id===candidate.id&&b.blockId===candidate.blockId&&b.kind===candidate.kind);
 const at=b?.text.indexOf(candidate.quote);if(!b||at<0)return candidate;
 if(b.text.length<=1600)return {...candidate,quote:b.text};
 let start=Math.max(0,at-500),end=Math.min(b.text.length,Math.max(at+candidate.quote.length,start+1600));
 start=Math.max(0,end-1600);return {...candidate,quote:b.text.slice(start,end)};
}
const passageUseful=e=>!/^\s*#?\d{1,2}:\d{2}(?:\[时刻\])?#?\s*[^。！？\n]{0,35}$/.test(e.quote||'');
const noEvidence=(body)=>({status:'no_match',question:'',summary:body.language==='en'?'The supplied text does not support this task. Images and video have not been analyzed.':'已读文字中没有足以支持这个任务的依据；图片和视频尚未分析。',draft:'',recommendations:[],missing:[],plan:body.language==='en'?['Add a written explanation or tutorial for this task.','Then search the updated library again.']:['补充与这个任务直接相关的文字说明或教程。','再用补充后的资料继续这个任务。'],nextStep:body.language==='en'?'Add a relevant written reference.':'补充相关的文字资料。',borrowed:[],promptVersion:VERSION});

async function callModel(stage,schema,payload,instructions,timeout=55000){
 const model=process.env.FOLIO_KB_MODEL||process.env.OPENAI_MODEL||'gpt-5.4-mini';
 const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model,...(model.startsWith('gpt-5')?{reasoning:{effort:['answer','audit'].includes(stage)?'medium':'low'}}:{}),store:false,instructions,input:JSON.stringify(payload),max_output_tokens:stage==='answer'?10000:5000,text:{format:{type:'json_schema',name:'folio_'+stage,strict:true,schema}}}),signal:AbortSignal.timeout(timeout)});
 const d=await response.json();if(!response.ok)throw Error(d.error?.code==='insufficient_quota'?'OpenAI quota exhausted':'AI request failed; retry this batch');
 const text=d.output?.flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('');
 if(d.status==='incomplete'||!text)throw Error('AI response incomplete; retry this step.');
 return {parsed:JSON.parse(text),model:d.model,usage:d.usage};
}
export function validateKBOutput(data,body){const {stage,blocks,evidence}=validateKB(body);const valid=e=>checkEvidence(e,blocks,evidence);
 if(stage==='search')return {candidates:(data.candidates||[]).filter(valid).filter(c=>!(body.taskContext?.excludedIds||[]).includes(c.id)).slice(0,6)};
 if(stage==='topics'||stage==='taxonomy'){return {topics:(data.topics||[]).slice(0,6).map((t,i)=>({...t,id:'topic-'+i,evidence:(t.evidence||[]).filter(valid)})).filter(t=>t.name?.trim()&&t.name.length<=60&&t.evidence.length&&(!body.approvedTopics?.length||body.approvedTopics.some(a=>a.name===t.name)))};}
 if(stage==='assign')return {assignments:(data.assignments||[]).filter(a=>a.id===a.evidence?.id&&valid(a.evidence)&&(body.topics||[]).some(t=>t.id===a.topicId))};
 if(stage==='answer'){const seen=new Set();const recommendations=(data.recommendations||[]).filter(r=>r.evidence?.length&&r.evidence.every(valid)&&!seen.has(r.evidence[0].id)&&seen.add(r.evidence[0].id)).slice(0,3);
  // A draft is shown only when at least one saved note supports it. The model's own no_match explanation (e.g. images not analysed) is kept.
  if(data.status==='no_match'||!recommendations.length)return {...data,status:data.status==='clarify'?'clarify':'no_match',recommendations:[],draft:'',summary:(data.status==='no_match'||data.status==='clarify')&&data.summary?data.summary:body.language==='en'?'No recommendations with verifiable evidence.':'没有足够的可核对依据来提出建议。'};const draft=typeof data.draft==='string'?data.draft:'';const plan=(Array.isArray(data.plan)?data.plan:[]).filter(x=>typeof x==='string'&&x.trim()).slice(0,3);return {...data,draft,plan,nextStep:data.nextStep||plan[0]||'',recommendations,borrowed:borrowedFromReferences(draft,userWords(body),body.evidence)};}
 return data;
}
export async function knowledgeRequest(body){const deadline=Date.now()+52000;const invoke=(...args)=>callModel(...args,Math.max(1,deadline-Date.now()));const {stage}=validateKB(body);if(!process.env.OPENAI_API_KEY)throw Error('AI is not configured');
 const options=['search','topics','assign'].includes(stage)?(stage==='search'?anchoredBlocks(body):(body.blocks||[])).flatMap(b=>{
 const lines=b.text.split(/\n|(?<=[。！？])(?=.)/u).filter(t=>eligibleEvidence(t));return lines.flatMap(line=>{const parts=[];for(let i=0;i<line.length;i+=350)parts.push(line.slice(i,i+400));return parts;}).map(quote=>({id:b.id,blockId:b.blockId,kind:b.kind,quote,...(stage==='search'&&b.topics?.length?{topics:b.topics}:{})}));
 }):['answer','review','taxonomy'].includes(stage)?(body.evidence||[]):[];
 const labelled=(['search','review','answer'].includes(stage)?options.filter(passageUseful):options).map((e,i)=>({...e,evidenceId:'E'+i}));
 let schema=schemas[stage];
 const topicPlanner=stage==='plan' && Array.isArray(body.topicCatalog);
 if(topicPlanner)schema=obj({...schema.properties,topicScope:obj({mode:{type:'string',enum:['unrestricted','any','all']},names:arr(str)})});
 if((['search','answer','review','topics','taxonomy','assign'].includes(stage))&&!labelled.length)return stage==='search'?{candidates:[]}:stage==='review'?{evidence:[]}:stage==='assign'?{assignments:[]}:['topics','taxonomy'].includes(stage)?{topics:[]}:noEvidence(body);
 const ref={type:'string',enum:labelled.map(e=>e.evidenceId)};
 const sourceNotes=[...new Set(labelled.map(e=>e.id))].map(id=>({id,passages:labelled.filter(e=>e.id===id)}));
 if(['topics','taxonomy'].includes(stage))schema=obj({topics:arr(obj({id:str,name:body.approvedTopics?.length?{type:'string',enum:body.approvedTopics.map(t=>t.name)}:str,purpose:str,rule:str,evidenceIds:{...arr(ref),maxItems:3}}))});
 if(stage==='assign')schema=obj({assignments:arr(obj({id:str,topicId:{type:'string',enum:(body.topics||[]).map(t=>t.id)},reason:str,evidenceId:ref}))});
 if(stage==='review')schema=obj({acceptedEvidenceIds:{...arr(ref),maxItems:8},rationale:str});
 if(stage==='search')schema=obj({candidates:arr(obj({evidenceId:ref,use:str,limitation:str}))});
 if(stage==='answer')schema=obj({status:{type:'string',enum:['ready','no_match','clarify']},outputKind:{type:'string',enum:body.depth==='explore'?['directions']:['advice','steps','copy']},question:str,summary:str,sections:{...arr(obj({heading:str,text:str,sourceId:{type:'string',enum:sourceNotes.map(n=>n.id)},use:str})),maxItems:body.outputKind==='copy'?1:3},userClaims:arr(obj({claim:str,userQuote:str})),plan:{...arr(str),minItems:2,maxItems:3},missing:{...arr(str),maxItems:3}});
 const payload={...(topicPlanner?{topicCatalog:body.topicCatalog}:{}),sourceNotes:stage==='answer'?sourceNotes:[],depth:['explore','focused'].includes(body.depth)?body.depth:'',inventory:body.inventory||[],currentTask:latestRequest(body),originalGoal:body.taskContext?.goal||'',outputKind:body.outputKind||'',anchorTerms:body.anchorTerms||[],taskContext:body.taskContext||null,questions:body.questions||[],coverage:body.coverage||{},materials:body.blocks||[],validatedCandidates:['answer','review','taxonomy'].includes(stage)?labelled:body.evidence||[],evidenceOptions:['search','topics','assign'].includes(stage)?labelled:[],topics:body.topics||[],approvedTopics:body.approvedTopics||[]};
 const instructions=(stage==='answer'?answerInstructions(body.depth,body.outputKind):STAGES[stage])+(topicPlanner?STAGES.topicScope:'')+`\nResponse language: ${body.language==='en'?'English':'Chinese'}.`;
 let d=await invoke(stage,schema,payload,CORE+'\n'+instructions);let parsed=d.parsed;
 let quality=null;
 if(stage==='answer'){
  const auditSchema=obj({issues:{...arr(obj({code:{type:'string',enum:['user_fact','source_support','capability','task_form','protocol']},message:str})),maxItems:6}});let issues=[];const audits=[];
  for(let attempt=0;attempt<2;attempt++){
   const audit=await invoke('audit',auditSchema,{currentTask:latestRequest(body),userFacts:userWords(body),depth:body.depth,sourceNotes,answer:parsed},STAGES.audit);
   issues=[...answerIssues(parsed,body),...(audit.parsed.issues||[]).map(i=>i.message)];audits.push({issues,proposal:parsed,model:audit.model,usage:audit.usage});
   if(!issues.length)break;
   if(attempt===0)d=await invoke('answer',schema,{...payload,previousAnswer:parsed,correctionRequired:issues},CORE+'\n'+instructions+'\nRevise the previous answer to address every correctionRequired item; if evidence is inadequate, give no_match. Do not merely add a disclaimer to unsupported content.'),parsed=d.parsed;
  }
  quality={reviewed:true,repaired:audits.length>1,audits};
  if(issues.length)return {...noEvidence(body),summary:body.language==='en'?'This answer did not pass the fact and evidence checks. Add the missing facts or a closer reference before trying again.':'这次回答没有通过事实和依据核对。请补充任务事实或更直接的参考后重试。',quality:{...quality,blocked:true},model:d.model,usage:d.usage};
  parsed.recommendations=[...new Set((parsed.sections||[]).map(s=>s.sourceId))].map(id=>({title:parsed.sections.filter(s=>s.sourceId===id).map(s=>s.heading).filter(Boolean).join(' / ')||(body.language==='en'?'Writing structure':'文案结构'),advice:[...new Set(parsed.sections.filter(s=>s.sourceId===id).map(s=>s.use))].join(' '),tradeoff:'',evidence:labelled.filter(e=>e.id===id)}));
  parsed.draft=(parsed.sections||[]).map(s=>s.heading?s.heading+'\n'+s.text:s.text).join('\n\n');
  delete parsed.sections;delete parsed.userClaims;
 }
 if(stage==='review')return {evidence:[...new Set(parsed.acceptedEvidenceIds||[])].map(id=>labelled.find(e=>e.evidenceId===id)).filter(Boolean).slice(0,8),rationale:parsed.rationale,model:d.model,usage:d.usage};
 if(['topics','taxonomy'].includes(stage))parsed.topics=(parsed.topics||[]).map(t=>({...t,evidence:(t.evidenceIds||[]).map(id=>labelled.find(e=>e.evidenceId===id)).filter(Boolean)}));
 if(stage==='assign')parsed.assignments=(parsed.assignments||[]).map(a=>({...a,evidence:labelled.find(e=>e.evidenceId===a.evidenceId)}));
 if(stage==='search')parsed.candidates=(parsed.candidates||[]).map(c=>({...labelled.find(e=>e.evidenceId===c.evidenceId),use:c.use,limitation:c.limitation}));
 if(stage==='search')parsed.candidates=parsed.candidates.map(c=>expandEvidenceContext(c,body.blocks||[]));
 if(stage==='answer')parsed.nextStep=(parsed.plan||[])[0]||'';
 const validated=validateKBOutput(parsed,body);const result=['topics','taxonomy','assign'].includes(stage)?enforceTopicPurpose(validated,body):validated;if(stage==='answer'&&result.status!=='clarify')result.question='';return {...(stage==='answer'?discloseTextOnly(result,body):result),...(quality?{quality}:{}),promptVersion:VERSION,model:d.model,usage:d.usage};
}
