// UI labels only: inspect user requests, never reference text or model-written copy.
// This does not change the model's plan, output, or confidence.
export function outputLabel(goal, history = [], depth = '') {
 const requests=[goal,...history.filter(t=>t.role==='user'&&!t.borrowedReview).map(t=>t.text)];
 for(const raw of requests.reverse()) {
  const q=String(raw||'').trim();
  // A factual follow-up keeps the previous request's output type.
  if(/^(我负责|我的角色|我的偏好|补充事实|i (?:was responsible|worked|prefer)|my role)\b/i.test(q)||/^(我负责|我的角色|我的偏好|补充事实)/.test(q))continue;
  const how=/(怎么|如何|怎样|步骤|教程)|\b(how (?:do|can|should|to)|steps? to|walk me through)\b/i.test(q);
  if(how)return ['实施步骤','Implementation steps'];
  const recommend=/(哪些|推荐|建议|灵感|找.{0,8}(参考|思路)|对比|比较)|\b(which|recommend|suggest|inspiration|compare|find .{0,20}(ideas|references))\b/i.test(q);
  // An explicit writing/editing request takes precedence over a request to cite references.
  if(/(帮我|请|替我).{0,12}(写|改写|润色|(?:修改|改).{0,8}(简历|文案|介绍|经历))|^(写|改写|润色)|\b(write|rewrite|rework|draft|edit|polish)\b/i.test(q))return ['文案草稿','Text draft'];
  if(recommend){
   if(/(首页|首屏|home\s?page|hero)/i.test(q)&&/(交互|动效|interaction|animation|effects?)/i.test(q))return ['首页交互建议','Homepage interaction ideas'];
   return ['建议方向','Suggested directions'];
  }
  if(/(帮我做|我要做|我想做)|\b(help me (?:build|make)|i want to (?:build|make))\b/i.test(q))return depth==='explore'?['建议方向','Suggested directions']:['建议','Suggestions'];
  // A new, unrecognized question must not inherit a misleading old task label.
  if(/[?？]$/.test(q))return ['回答','Response'];
 }
 return depth==='explore'?['建议方向','Suggested directions']:['回答','Response'];
}
