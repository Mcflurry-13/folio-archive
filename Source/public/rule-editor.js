// Presentation only: never interpret source HTML or change the stored inclusion rule.
export function ruleBlocks(text){
 const value=String(text||'').trim();
 try{if(/^[\[{]/.test(value))return [{type:'code',text:JSON.stringify(JSON.parse(value),null,2)}];}catch{}
 const blocks=[];let paragraph=[],list=null,code=null;
 const flush=()=>{if(paragraph.length){blocks.push({type:'p',text:paragraph.join('\n')});paragraph=[];}list=null;};
 for(const line of value.split('\n')){
  if(/^\s*```/.test(line)){if(code){blocks.push({type:'code',text:code.join('\n')});code=null;}else{flush();code=[];}continue;}
  if(code){code.push(line);continue;}
  const match=line.match(/^\s*(?:([-*+])|\d+[.)])\s+(.+)$/);
  if(match){if(paragraph.length)flush();const type=match[1]?'ul':'ol';if(list?.type!==type){list={type,items:[]};blocks.push(list);}list.items.push(match[2]);continue;}
  if(!line.trim()){flush();continue;}list=null;paragraph.push(line);
 }
 if(code)blocks.push({type:'code',text:code.join('\n')});flush();
 return blocks;
}
export function createRuleEditor({h,L,value,disabled,onCommit}){
 const inline=text=>String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map(s=>s.startsWith('**')?h('strong',{},s.slice(2,-2)):s.startsWith('`')?h('code',{},s.slice(1,-1)):s);
 const display=h('div',{class:'rule-reading'},...ruleBlocks(value).map(b=>b.type==='code'?h('pre',{},h('code',{},b.text)):b.items?h(b.type,{},...b.items.map(t=>h('li',{},...inline(t)))):h('p',{},...inline(b.text))));
 const area=h('textarea',{class:'rule-textarea',value,rows:2,disabled,'aria-label':L('归类规则','Inclusion rule')});
 const resize=()=>{area.style.height='auto';area.style.height=(area.scrollHeight+2)+'px';};
 const edit=h('button',{type:'button',class:'chip',disabled},L('编辑规则','Edit rule'));
 const done=h('button',{type:'button',class:'chip'},L('完成','Done'));
 const editor=h('div',{class:'rule-editing',hidden:true},area,h('p',{class:'fine'},L('支持段落、Markdown 列表和 JSON。','Supports paragraphs, Markdown lists and JSON.')),done);
 edit.onclick=()=>{display.hidden=true;editor.hidden=false;edit.hidden=true;resize();area.focus();};
 area.oninput=resize;
 area.onchange=()=>onCommit(area.value);
 done.onclick=()=>{area.blur();if(area.value===value){editor.hidden=true;display.hidden=false;edit.hidden=false;edit.focus();}};
 const observer=new ResizeObserver(()=>{if(!editor.hidden)resize();});observer.observe(editor);
 // Disconnect once the enclosing proposal is redrawn.
 const cleanup=new MutationObserver(()=>{if(!editor.isConnected){observer.disconnect();cleanup.disconnect();}});
 queueMicrotask(()=>{if(editor.isConnected)cleanup.observe(editor.closest('.ai-organizer').parentNode,{childList:true,subtree:true});});
 return h('section',{class:'rule-field'},h('div',{class:'rule-heading'},h('span',{},L('归类规则','Inclusion rule')),edit),display,editor,h('p',{class:'fine rule-help'},L('规则会用于本次分类。编辑后保存的是规则；点击生成预览后，AI 才会按新规则重新整理。','These rules guide this organization. Editing saves the rule; generating a preview asks AI to classify using the updated rule.')));
}
