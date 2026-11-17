// Narrow, high-confidence guard: a direct hiring invitation plus application/role context.
// Mere mentions of AI, research, Adobe or careers never trigger it. Source text only, not user notes.
export function recruitmentIds(body){
 const texts=new Map();
 for(const b of body.blocks||[])if(b.kind==='source')texts.set(b.id,(texts.get(b.id)||'')+'\n'+b.text);
 for(const x of body.inventory||[])texts.set(x.id,(texts.get(x.id)||'')+'\n'+(x.excerpt||''));
 const invitation=/招(?:聘)?(?:暑期|夏季|科研|研究)?实习生|我们[^。\n]{0,20}(?:招聘|在招)|we(?:['’]re| are) (?:hiring|recruiting|looking for)|join our team|invites? applications/i;
 const application=/欢迎申请|申请链接|投递|简历|岗位|职位|apply|application|internship|open roles|resume|CV\b/i;
 return new Set([...texts].filter(([,text])=>invitation.test(text)&&application.test(text)).map(([id])=>id));
}
const isCareer=t=>/^(职业发展|求职|职业机会|招聘|Career development|Career opportunities|Careers|Jobs|Recruitment)$/i.test(t.name?.trim()||'');
export function enforceTopicPurpose(result,body){
 const ids=recruitmentIds(body);if(!ids.size)return result;
 if(result.topics){
  const topics=result.topics.map(t=>({...t,evidence:[...(t.evidence||[])]}));const target=topics.find(isCareer),moved=[];
  for(const t of topics)if(!isCareer(t)){moved.push(...t.evidence.filter(e=>ids.has(e.id)));t.evidence=t.evidence.filter(e=>!ids.has(e.id));}
  if(target)for(const e of moved)if(!target.evidence.some(x=>x.id===e.id&&x.quote===e.quote))target.evidence.push(e);
  return {...result,topics:topics.filter(t=>t.evidence.length)};
 }
 if(result.assignments){
  const target=(body.topics||[]).find(isCareer);
  return {...result,assignments:result.assignments.filter(a=>!ids.has(a.id)||target).map(a=>ids.has(a.id)&&a.topicId!==target.id?{...a,topicId:target.id,reason:body.language==='en'?'A direct hiring invitation with application details; its primary purpose is a career opportunity.':'包含明确招聘邀请与申请信息，主要用途是寻找职业机会。'}:a)};
 }
 return result;
}
