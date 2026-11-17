// Runs only in the requested note tab. Reads DOM content; never reads cookies.
export function extractNote(){
  const root=document.querySelector('.note-container, #noteContainer');
  const title=root?.querySelector('#detail-title')?.textContent?.trim();
  const content=root?.querySelector('#detail-desc')?.innerText?.trim();
  if(!root||(!title&&!content))return null;
  const urls=[...document.querySelectorAll('meta[property="og:image"]')].map(x=>x.content);
  urls.push(...[...root.querySelectorAll('.note-slider-img img')].map(x=>x.currentSrc||x.src));
  const poster=root.querySelector('video')?.poster;if(poster)urls.push(poster);
  const seen=new Set();const images=[];
  for(const value of urls){try{const u=new URL(value,location.href);if(!(u.hostname.endsWith('.xhscdn.com')||u.hostname.endsWith('.rednotecdn.com'))||u.hostname.includes('avatar'))continue;u.protocol='https:';const key=u.pathname.split('/').pop().split('!')[0];if(seen.has(key))continue;seen.add(key);images.push(u.href);}catch{}}
  return {title:title||content.slice(0,80),content:content||'',url:location.href,images:images.slice(0,20),mediaType:root.querySelector('video')?'video':'images'};
}
