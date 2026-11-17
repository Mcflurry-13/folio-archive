import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/find.mjs';

function response(){return {code:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};}

test('public API needs no browser token, still validates input and HTTP method',async()=>{
 for(let i=0;i<65;i++){
  const res=response();await handler({method:'POST',headers:{},body:{task:'Review my portfolio',items:[]}},res);
  assert.equal(res.code,200);assert.equal(res.body.status,'no_match');assert.equal(res.headers['Cache-Control'],'no-store');
 }
 const bad=response();await handler({method:'POST',headers:{},body:{}},bad);assert.equal(bad.code,400);
 const get=response();await handler({method:'GET',headers:{}},get);assert.equal(get.code,405);
});

test('anonymous AI calls use only the server credential and never return it',async()=>{
 const previousKey=process.env.OPENAI_API_KEY,previousFetch=globalThis.fetch;
 process.env.OPENAI_API_KEY='test-only-server-key';let calls=0;
 globalThis.fetch=async(url,options)=>{
  assert.equal(url,'https://api.openai.com/v1/responses');
  assert.equal(options.headers.Authorization,'Bearer test-only-server-key');calls++;
  return {ok:true,json:async()=>({model:'test-model',output:[{content:[{type:'output_text',text:JSON.stringify({status:'ready',summary:'Review mobile navigation.',question:'',results:[{id:'a',evidence:'Test links on mobile.',why:'Checks navigation.',suggestion:'Check each project link.'}]})}]}]})};
 };
 try{
  for(const headers of [{},{authorization:'Bearer obsolete-browser-token'}]){
   const res=response();await handler({method:'POST',headers,body:{task:'Review portfolio navigation',items:[{id:'a',title:'Mobile review',content:'Test links on mobile.',note:'',category:''}]}},res);
   assert.equal(res.code,200);assert.equal(res.body.status,'ready');assert.equal(JSON.stringify(res.body).includes('test-only-server-key'),false);
  }
  assert.equal(calls,2);
 }finally{globalThis.fetch=previousFetch;if(previousKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previousKey;}
});
