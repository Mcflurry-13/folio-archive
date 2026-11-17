// Display and card-input helpers shared by the browser and the server.
// They only remove, select or label existing text. Nothing here rewrites or generates content.

// Provenance notes written when the public X sample was built. They describe the record, not the post.
const PROVENANCE=/^\s*(?:Record type:.*|Curated source summary; not a verbatim transcript\.?|Text and metadata retrieved through FxTwitter\..*)\s*$/i;

// Saved source text without provenance notes. The build-time excerpt of the post's opening was always cut mid-sentence:
// readers never see it, but the card writer keeps it, labelled, because it often names what the post is ("Good prompt to …").
export function cleanSourceText(text,{keepOpening=false}={}){
 const out=[];let excerpt=false;
 for(const line of String(text||'').split('\n')){
  const t=line.trim();
  if(PROVENANCE.test(t))continue;
  if(/^#{1,6}\s*Short source excerpt\s*$/i.test(t)){excerpt=true;continue;}
  if(excerpt){if(!t)continue;if(/^>/.test(t)){if(keepOpening)out.push('Post opening (cut short in the source): '+t.replace(/^>\s*/,''));continue;}excerpt=false;}
  out.push(line);
 }
 return out.join('\n').replace(/\n{3,}/g,'\n\n').trim();
}

// Decided by the program from the saved record, never by the model.
export function mediaFormat(item){
 const raw=String(item?.content||'');
 if(/^\s*(?:-\s*)?(?:video|gif)\s*:\s*https?:\/\//mi.test(raw)||/^\s*视频(?:链接)?\s*[:：]\s*https?:\/\//m.test(raw)||/本篇为视频笔记/.test(raw))return 'video';
 if(/!\[[^\]]*\]\([^)]+\)/.test(raw)||[item?.image,...(item?.images||[])].some(Boolean))return 'image';
 return 'text';
}

const cjkHeavy=s=>(s.match(/[㐀-鿿぀-ヿ]/g)||[]).length>s.length*.3;
// Ends at a sentence boundary inside the budget; falls back to a clause boundary with an ellipsis only when no sentence fits.
export function clipSentence(text,max){
 const s=String(text||'').replace(/\s+/g,' ').trim();max=max||(cjkHeavy(s)?110:210);
 if(s.length<=max)return {text:s,clipped:false};
 const head=s.slice(0,max+1);let end=-1,m;const re=/[。！？!?…]+["'”’）)]*|\.+["'”’)]*(?=\s|$)/g;
 while((m=re.exec(head))){const stop=m.index+m[0].length;if(stop<=max)end=stop;}
 if(end>=max*.45)return {text:s.slice(0,end).trim(),clipped:true};
 const soft=Math.max(...[' ','，','、','；',','].map(ch=>head.lastIndexOf(ch,max)));
 return {text:s.slice(0,soft>max*.45?soft:max).replace(/[\s,，、；;:：]+$/,'')+'…',clipped:true};
}

// Whole sentences from the start of the text: as many as fit the budget, and at least the first one when it is not
// much longer. Only a first sentence longer than that is cut, at a clause boundary.
export function leadSentences(text,budget,hard=budget*1.7){
 const s=String(text||'').replace(/\s+/g,' ').trim();if(s.length<=budget)return s;
 const parts=s.match(/[^。！？!?.]+(?:[。！？!?]+|\.+(?=\s|$))["'”’）)]*\s*|[^。！？!?.]+$/g)||[s];
 let out='';for(const p of parts){if((out+p).trim().length>budget)break;out+=p;}
 if(out.trim())return out.trim();
 return parts[0].trim().length<=hard?parts[0].trim():clipSentence(s,budget).text;
}
// The first readable paragraph of saved text: no headings, image lines, link lines or trailing hashtag runs.
export function previewText(body){
 const out=[];
 for(const line of cleanSourceText(body).split('\n')){
  const t=line.trim();
  if(/^#{1,6}\s/.test(t)||/^---+$/.test(t)){if(out.length)break;continue;}
  if(!t||/^!\[/.test(t)||/^(?:-\s*)?https?:\/\/\S+$/.test(t)||/^(?:#[^\s#]+\s*)+$/.test(t))continue;
  out.push(t.replace(/^>\s*/,'').replace(/(?:\s*#[^\s#]+)+\s*$/,'').trim());
 }
 return out.join(' ').replace(/\s+/g,' ').trim();
}

// Author and the most useful date the record has: when it was posted if known, otherwise when it was saved.
export function sourceMeta(item,L,language='en'){
 const raw=String(item?.content||'');
 const author=((raw.match(/^(?:作者|Author)\s*[:：]\s*(.+)$/m)||[])[1]?.trim()||String(item?.author||'').trim()).replace(/\s*\(@[^)]*\)\s*$/,'');
 const posted=(raw.match(/^(?:Published|发布时间|发布于)\s*[:：]\s*(\S+)/m)||[])[1];
 const when=new Date(posted||item?.createdAt||'');
 let date='';
 if(!isNaN(when)){const d=when.toLocaleDateString(language==='zh'?'zh-CN':'en-US',{month:'short',day:'numeric',...(when.getFullYear()!==new Date().getFullYear()?{year:'numeric'}:{})});date=posted?L(`发布于 ${d}`,`Posted ${d}`):L(`收藏于 ${d}`,`Saved ${d}`);}
 return {author,date};
}

// A video's first frame is often a blank title card. This only measures pixel detail; it does not interpret the picture.
export function isLowDetailImage(img){
 try{
  const n=64,c=document.createElement('canvas');c.width=n;c.height=n;const g=c.getContext('2d',{willReadFrequently:true});
  g.drawImage(img,0,0,n,n);const d=g.getImageData(0,0,n,n).data,lum=[];
  for(let i=0;i<d.length;i+=4)lum.push(.299*d[i]+.587*d[i+1]+.114*d[i+2]);
  let edges=0,pairs=0;
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){const v=lum[y*n+x];if(x<n-1){pairs++;if(Math.abs(v-lum[y*n+x+1])>10)edges++;}if(y<n-1){pairs++;if(Math.abs(v-lum[(y+1)*n+x])>10)edges++;}}
  return edges/pairs<0.027;
 }catch{return false;}
}
