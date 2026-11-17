// Run only for a corpus whose owner explicitly approved public distribution.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {normalizeItem} from '../public/data.js';
import {currentSummary} from '../public/summary-data.js';
const [backup,summariesFile]=process.argv.slice(2);
if(!backup||!summariesFile)throw Error('Usage: node tools/build-public-collection.mjs <approved-backup> <summary-cache>');
const raw=JSON.parse(await readFile(backup,'utf8')),cache=JSON.parse(await readFile(summariesFile,'utf8'));
if(raw.items?.length!==100)throw Error('Expected the approved 100-record snapshot');
const root=new URL('../public/collection/v1/',import.meta.url);await mkdir(new URL('images/',root),{recursive:true});
const items=[],summaries={},assets=new Map();let imageCount=0;
for(const entry of raw.items){
 const x=normalizeItem(entry);if(x.note)throw Error('Personal notes require a separate publishing review');
 const images=[...new Set([x.image,...x.images].filter(Boolean))],links=[];
 for(const data of images){const m=data.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);if(!m)throw Error('Invalid image');const bytes=Buffer.from(m[2],'base64'),name=createHash('sha256').update(bytes).digest('hex').slice(0,24)+'.'+(m[1]==='jpeg'?'jpg':m[1]);if(!assets.has(name)){await writeFile(new URL('images/'+name,root),bytes);assets.set(name,bytes.length);}links.push(`![Saved image](/collection/v1/images/${name})`);imageCount++;}
 // Preserve the source body; replace expiring media links in the export footer.
 const parts=x.content.split(/^---\s*$/m);if(parts.length<3)throw Error('Expected exported source/body/media boundaries');
 parts[0]=parts[0].split('\n').filter(line=>!/^收藏专辑:|^专辑排列:/.test(line)).join('\n');
 parts[2]=parts[2].split('\n').filter(line=>!/^\s*(图片|图片链接|配图|封面)(?:链接)?\s*[:：]/.test(line)&&!/^!\[/.test(line)).join('\n');
 const content=parts.join('---\n').trim()+'\n\n'+links.join('\n');
 const item=normalizeItem({...x,content,image:'',images:[],note:'',category:'未分类'});items.push(item);
 const summary=currentSummary(cache,item);if(summary)summaries[item.id]=summary;
}
const payload={version:1,id:'folio-public-100-v1',items,summaries};
const json=JSON.stringify(payload);await writeFile(new URL('library.json',root),json);
console.log(JSON.stringify({items:items.length,imageReferences:imageCount,uniqueImages:assets.size,imageBytes:[...assets.values()].reduce((a,b)=>a+b,0),textBytes:Buffer.byteLength(json),cachedSummaries:Object.keys(summaries).length}));
