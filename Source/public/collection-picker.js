import {sampleURL} from './sample-session.js';
// First-visit choice only. Loading and persistence are owned by the existing installer.
export function choosePublicCollection({language='en',setLanguage,install,returnURL,previousSessions=[],initialError=false}){
 return new Promise(resolve=>{
  let lang=language,busy=false,error=initialError?(language==='zh'?'暂时无法载入这组资料，请重试。':'This collection could not load. Please try again.'):'';
  const host=document.createElement('section');host.className='collection-welcome';host.setAttribute('aria-labelledby','welcomeTitle');
  const L=(zh,en)=>lang==='zh'?zh:en;
  const node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text)e.textContent=text;return e;};
  function draw(){
   const focus=host.contains(document.activeElement)?document.activeElement?.dataset.collection:null;
   document.documentElement.lang=lang==='zh'?'zh-CN':'en';host.replaceChildren();host.setAttribute('aria-busy',String(busy));
   const bar=node('header','welcome-bar'),brand=node('span','welcome-brand','Folio'),toggle=node('button','chip',lang==='zh'?'EN':'中文');toggle.type='button';toggle.disabled=busy;toggle.setAttribute('aria-label',L('切换到英文','Switch to Chinese'));toggle.onclick=()=>{lang=lang==='zh'?'en':'zh';setLanguage(lang);draw();};bar.append(brand,toggle);if(returnURL){const back=node('a','welcome-return',L('返回资料库','Back to library'));back.href=returnURL;bar.insertBefore(back,toggle);}
   const intro=node('div','welcome-intro');intro.append(node('p','welcome-eyebrow',L('从收藏开始','Start with a collection')),node('h1','',L('让收藏，帮你完成下一件事。','Your saves. Your next idea.')));intro.querySelector('h1').id='welcomeTitle';
   intro.append(node('p','welcome-lede',L('选一组 100 条未分类收藏，从导入、AI 整理到完成任务，体验完整流程。','Start with 100 unorganized saves. Import a collection, let AI suggest topics, then put your knowledge to work.')));
   const choices=node('div','welcome-choices');
   const cards=[{key:'x',name:'X',tag:L('英文内容','English collection'),description:L('界面设计、AI 工具、研究和职业机会。公开帖整理成的参考资料。','Interface design, AI tools, research and career opportunities. Curated from public posts.'),topics:L('交互细节 · 创意工具 · 人机协作','Interaction details · Creative tools · Human–AI collaboration')},{key:'rednote',name:'RedNote',tag:L('中文内容','Chinese collection'),description:L('个人网站、作品集、设计素材和学习经验。来自真实的小红书收藏。','Personal websites, portfolios, design resources and learning notes. From a real saved collection.'),topics:L('作品集呈现 · 网站制作 · 设计灵感','Portfolio stories · Website building · Design inspiration')}];
   for(const c of cards){
    const card=node('button','welcome-choice');card.type='button';card.dataset.collection=c.key;card.disabled=busy;card.setAttribute('aria-label',L(`使用 ${c.name} 的 100 条资料`,`Use 100 ${c.name} references`));
    const top=node('span','welcome-choice-top');const mark=node('span','welcome-source '+c.key);if(c.key==='rednote'){const logo=node('img','');logo.src='/assets/rednote-icon.png';logo.alt='';logo.width=42;logo.height=42;mark.append(logo);}else mark.textContent='𝕏';mark.setAttribute('aria-hidden','true');top.append(mark,node('span','welcome-count','100'));
    const title=node('span','welcome-choice-title',c.name);const tag=node('span','welcome-language',c.tag);
    card.append(top,title,tag,node('span','welcome-description',c.description),node('span','welcome-topics',c.topics),node('span','welcome-cta',L('开始新体验 →','Start a fresh experience →')));
    card.onclick=async()=>{if(busy)return;busy=true;error='';draw();let result;try{result=await install(c.key);}catch{}if(!result||result.status==='unavailable'){busy=false;error=L('暂时无法载入这组资料，请重试。','This collection could not load. Please try again.');draw();host.querySelector(`[data-collection=${c.key}]`)?.focus();return;}host.remove();resolve(result);};choices.append(card);
   }
   const status=node('p','welcome-status',busy?L('正在载入 100 条资料…','Loading 100 references…'):error||L('无需登录。选择后即可使用 AI；资料会保存在这个浏览器。','No sign-in. AI is ready to use. Your collection stays in this browser.'));status.setAttribute('role',error?'alert':'status');
   if(returnURL){status.textContent=error|| (busy?L('正在打开资料集…','Opening collection…'):L('示例单独保存，不会替换你原来的资料。','Examples are saved separately. Your original library stays intact.'));const own=node('a','welcome-return',L('打开原来的资料库','Open my original library'));own.href='/?library=personal&lang='+lang+'#library';host.append(bar,intro,choices,status,own);}else host.append(bar,intro,choices,status);
   if(previousSessions.length){
    const history=node('details','welcome-history'),summary=node('summary','',L('继续之前的体验','Continue a previous experience'));history.append(summary);
    for(const session of previousSessions){const name=session.key==='x'?'X':'RedNote';const link=node('a','welcome-return',L(`继续 ${name}${session.experience?'':'（早期记录）'} · ${session.count} 篇`,`Continue ${name}${session.experience?'':' (earlier progress)'} · ${session.count} saves`));link.dataset.resumeCollection=session.key;link.href=sampleURL(session.key,lang,session.experience,{resume:true});history.append(link);}
    host.append(history);
   }
   if(focus)host.querySelector(`[data-collection=${focus}]`)?.focus();
  }
  document.body.append(host);document.querySelector('#startupStatus')?.remove();draw();
 });
}
