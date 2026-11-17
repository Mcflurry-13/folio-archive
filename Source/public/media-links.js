// Remote media is derived from saved reference text; no downloads, rewrites or HTML execution.
export function remoteImages(text=''){
 const hits=[];
 const add=raw=>{try{if(!/^https?:\/\//.test(raw)&&!/^\/collection\/v1\/images\/[a-f0-9]{24}\.(jpg|png|webp)$/.test(raw))return;const u=new URL(raw.replace(/&amp;/g,'&'),import.meta.url);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return;hits.push(u.href);}catch{}};
 for(const m of String(text).matchAll(/!\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+["'][^"']*["'])?\s*\)/g))add(m[1]||m[2]);
 for(const line of String(text).split(/\r?\n/)){if(/^\s*(?:[-*]\s*)?(?:图片(?:链接)?|配图|封面(?:链接)?|images?|cover)\s*[:：]/i.test(line))for(const m of line.matchAll(/https?:\/\/[^\s<>"\])]+/g))add(m[0]);}
 return [...new Set(hits)].slice(0,20);
}
export function displayImages(item){const local=[item.image,...(item.images||[])].filter(v=>/^data:image\/(png|jpeg|webp);base64,/.test(v||''));const remote=remoteImages(item.content),publicMedia=remote.filter(src=>{const u=new URL(src);return u.origin===new URL(import.meta.url).origin&&/^\/collection\/v1\/images\//.test(u.pathname);});return [...new Set(local.length?[...local,...publicMedia]:remote)].slice(0,20);}

// Keep public image removal/reordering in the existing content field; data.js stays unchanged.
export function reconcilePublicImages(content,gallery){
 const publicImage=/!\[Saved image\]\(\/collection\/v1\/images\/[a-f0-9]{24}\.(?:jpg|png|webp)\)/g;
 if(!publicImage.test(content))return content;
 const links=gallery.flatMap(src=>{try{const u=new URL(src);return /^\/collection\/v1\/images\/[a-f0-9]{24}\.(jpg|png|webp)$/.test(u.pathname)&&u.origin===new URL(import.meta.url).origin?[`![Saved image](${u.pathname})`]:[];}catch{return [];}});
 return content.replace(publicImage,'').trim()+(links.length?'\n\n'+links.join('\n'):'');
}
