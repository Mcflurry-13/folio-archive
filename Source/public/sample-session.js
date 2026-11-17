const keys=new Set(['x','rednote']);
export const validExperience=value=>/^\d{13}-[a-f0-9-]{36}$/.test(value||'')?value:'';
export function sampleArchiveName(key,experience=''){
 if(!keys.has(key))return 'folio-archive';
 return 'folio-sample-'+key+(validExperience(experience)?'--'+experience:'');
}
export function sampleURL(key,language='en',experience='',{resume=false,collections=false}={}){
 if(!keys.has(key))throw Error('Unknown sample');
 const p=new URLSearchParams({sample:key,lang:language==='zh'?'zh':'en'});
 if(validExperience(experience))p.set('experience',experience);
 if(resume)p.set('resume','1');if(collections)p.set('collections','1');
 return '/?'+p+'#library';
}
export function freshSampleURL(key,language='en'){
 return sampleURL(key,language,Date.now()+'-'+crypto.randomUUID());
}
// Discover only Folio sample copies. Existing databases are never deleted or overwritten.
// Keep the latest fresh experience and the earlier legacy copy for each collection.
export async function previousSampleSessions(factory=globalThis.indexedDB){
 try{
  const names=(await factory.databases()).map(x=>x.name).filter(Boolean);
  const candidates=names.flatMap(name=>{const m=/^folio-sample-(x|rednote)(?:--(.+))?$/.exec(name);return m&&(!m[2]||validExperience(m[2]))?[{name,key:m[1],experience:m[2]||''}]:[];}).sort((a,b)=>b.experience.localeCompare(a.experience));
  const found=[],seen=new Set();
  for(const candidate of candidates){
   const group=candidate.key+(candidate.experience?'recent':'legacy');if(seen.has(group))continue;
   const count=await new Promise(resolve=>{const r=factory.open(candidate.name);r.onerror=()=>resolve(0);r.onsuccess=()=>{const db=r.result;if(!db.objectStoreNames.contains('state')){db.close();resolve(0);return;}const q=db.transaction('state').objectStore('state').get('items');q.onsuccess=()=>{db.close();resolve(Array.isArray(q.result)?q.result.length:0);};q.onerror=()=>{db.close();resolve(0);};};});
   if(count){seen.add(group);found.push({...candidate,count});}
  }
  return found;
 }catch{return [];}
}
