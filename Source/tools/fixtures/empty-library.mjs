// An existing, intentionally empty archive; no production onboarding bypass.
export async function prepareEmptyLibrary(page){
 const base=process.env.FOLIO_BASE||'http://127.0.0.1:5180/';
 await page.goto(base);
 await page.evaluate(async()=>{
  const request=indexedDB.open('folio-archive',1);
  request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('state'))request.result.createObjectStore('state');};
  const db=await new Promise((ok,no)=>{request.onsuccess=()=>ok(request.result);request.onerror=()=>no(request.error);});
  await new Promise((ok,no)=>{const tx=db.transaction('state','readwrite'),store=tx.objectStore('state'),read=store.get('items');read.onsuccess=()=>{if(read.result===undefined)store.put([],'items');};tx.oncomplete=ok;tx.onabort=()=>no(tx.error);});db.close();
 });
}
