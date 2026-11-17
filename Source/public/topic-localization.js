const names=[['网站制作','Website building'],['交互原型','Interactive prototypes'],['视觉素材','Visual assets'],['职业发展','Career development'],['研究学习','Research and learning']];
export function knownTopicName(name,language){const pair=names.find(p=>p.includes(name)||(name==='Research & learning'&&p[0]==='研究学习'));return pair?pair[language==='zh'?0:1]:name;}
export const topicSource=t=>Object.fromEntries(['name','purpose','rule'].map(k=>[k,String(t[k]||'')]));
export const topicSignature=t=>JSON.stringify(topicSource(t));
export function topicText(t,field,language){
 const tr=t.translations;
 if(tr?.source?.[field]===String(t[field]||'')&&typeof tr?.[language]?.[field]==='string')return tr[language][field];
 return field==='name'?knownTopicName(t.name,language):String(t[field]||'');
}
export function translationsComplete(t){return ['name','purpose','rule'].every(k=>t.translations?.source?.[k]===String(t[k]||'')&&['zh','en'].every(lang=>typeof t.translations?.[lang]?.[k]==='string'&&(k!=='name'||t.translations[lang][k].trim())));}
export function setTopicText(t,field,value,language){
 // Keep the user's exact edit. Invalidate only this field's other-language label.
 const tr=t.translations||{source:{},zh:{},en:{}};t[field]=value;
 tr.source={...tr.source,[field]:value};tr[language]={...tr[language],[field]:value};
 tr[language==='zh'?'en':'zh']={...tr[language==='zh'?'en':'zh']};delete tr[language==='zh'?'en':'zh'][field];t.translations=tr;
}
export function attachTranslations(t,translated){
 const source=topicSource(t);const tr={source,zh:{},en:{}};
 for(const k of ['name','purpose','rule']){
  for(const lang of ['zh','en']){const v=translated?.[lang]?.[k];if(typeof v!=='string'||v.length>(k==='name'?60:2000)||(k==='name'&&!v.trim()))return t;tr[lang][k]=v;}
  // Preserve any previous manually edited/verified label verbatim.
  for(const lang of ['zh','en'])if(t.translations?.source?.[k]===source[k]&&typeof t.translations?.[lang]?.[k]==='string')tr[lang][k]=t.translations[lang][k];
  const originalLang=/[\u3400-\u9fff]/u.test(source[k])?'zh':'en';tr[originalLang][k]=source[k];
 }
 if(knownTopicName(source.name,'zh')!==knownTopicName(source.name,'en')){tr.zh.name=knownTopicName(source.name,'zh');tr.en.name=knownTopicName(source.name,'en');}
 return {...t,translations:tr};
}
export function representativeNotes(evidence){
 const grouped=new Map();for(const e of evidence||[]){if(!e?.id)continue;if(!grouped.has(e.id))grouped.set(e.id,{id:e.id,evidence:[]});const group=grouped.get(e.id);if(!group.evidence.some(x=>x.quote===e.quote&&x.kind===e.kind))group.evidence.push(e);}
 return [...grouped.values()].slice(0,3);
}
