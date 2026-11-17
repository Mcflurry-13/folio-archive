import test from 'node:test';import assert from 'node:assert/strict';
import {sampleArchiveName,sampleURL,freshSampleURL,validExperience} from '../public/sample-session.js';
test('fresh experiences have distinct storage, stable refresh URLs and explicit legacy resume',()=>{
 const a=new URL(freshSampleURL('rednote','en'),'https://example.com'),b=new URL(freshSampleURL('rednote','en'),'https://example.com');
 const token=a.searchParams.get('experience');assert.ok(validExperience(token));assert.notEqual(token,b.searchParams.get('experience'));
 assert.equal(sampleArchiveName('rednote',token),'folio-sample-rednote--'+token);assert.equal(sampleArchiveName(null,token),'folio-archive');
 assert.equal(sampleArchiveName('rednote','invalid'),'folio-sample-rednote');assert.equal(sampleURL('rednote','zh','',{resume:true}),'/?sample=rednote&lang=zh&resume=1#library');
 assert.equal(new URL(sampleURL('rednote','en',token,{collections:true}),'https://example.com').searchParams.get('experience'),token);
 assert.throws(()=>sampleURL('github'));
});
