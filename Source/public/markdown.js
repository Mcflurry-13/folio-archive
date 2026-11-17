import {safeURL} from './data.js';
// Markdown is reference text, never rendered as HTML or executed.
export function parseMarkdown(raw,filename='note.md',category='未分类'){
 const text=raw.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n').trim();
 if(!text)throw new Error('没有找到有效资料。');
 if(text.length>20000)throw new Error('Markdown exceeds 20,000 characters; split the file before importing.');
 const title=text.match(/^#\s+(.+)$/m)?.[1].trim()||filename.replace(/\.(md|markdown)$/i,'');
 const source=text.match(/^(?:原文链接|来源|Source)\s*[:：]\s*(.+)$/mi)?.[1]?.trim()||'';
 const url=safeURL(source.match(/\]\((https?:\/\/[^\s)]+)\)/)?.[1]||source);
 const externalId=url&&['xiaohongshu.com','www.xiaohongshu.com'].includes(new URL(url).hostname)?new URL(url).pathname.match(/\/(?:explore|discovery\/item|user\/profile\/[^/]+|board\/[^/]+)\/([a-f0-9]{24})(?:\/|$)/i)?.[1]:null;
 // Preserve the complete text, including media URLs and provenance; do not download remote media.
 return {title,url,content:text,category,...(externalId?{id:'xiaohongshu:'+externalId}:{})};
}
export function exportMarkdown(item){
 return `# ${item.title}\n\n原文链接: ${item.url||''}\n\n---\n\n${item.content||''}\n\n${item.note?'## 我的笔记\n\n'+item.note+'\n':''}`;
}
