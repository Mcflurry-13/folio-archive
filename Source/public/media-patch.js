// Media packs are local data. They never fetch a URL or alter source text.
const dataImage=v=>typeof v==='string'&&v.length<4300000&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v);
export function noteId(item){
 if(/^xiaohongshu:[a-f0-9]{24}$/i.test(item?.id||''))return item.id.slice(12).toLowerCase();
 try{const u=new URL(item?.url);if(!['www.xiaohongshu.com','xiaohongshu.com'].includes(u.hostname))return '';return u.pathname.match(/\/(?:explore|discovery\/item|user\/profile\/[^/]+|board\/[^/]+)\/([a-f0-9]{24})(?:\/|$)/i)?.[1].toLowerCase()||'';}catch{return '';}
}
export function applyMediaPatch(existing,pack){
 if(pack?.type!=='folio-media-patch'||pack.version!==1||!Array.isArray(pack.entries)||pack.entries.length>2000)throw Error('Invalid media pack');
 const patches=new Map();
 for(const e of pack.entries){if(!/^[a-f0-9]{24}$/i.test(e.noteId)||!Array.isArray(e.images)||!e.images.length||e.images.length>20||e.images.some(x=>!dataImage(x))||e.images.reduce((n,x)=>n+x.length,0)>24000000)throw Error('Invalid media pack');if(patches.has(e.noteId.toLowerCase()))throw Error('Duplicate media entry');patches.set(e.noteId.toLowerCase(),e);}
 let updated=0,protectedCount=0;const matched=new Set();
 const items=existing.map(old=>{const id=noteId(old),p=patches.get(id);if(!p)return old;matched.add(id);if(dataImage(old.image)||(old.images||[]).some(dataImage)){protectedCount++;return old;}updated++;return {...old,image:p.images[0],images:[...new Set(p.images)]};});
 return {items,updated,protectedCount,unmatched:patches.size-matched.size};
}
