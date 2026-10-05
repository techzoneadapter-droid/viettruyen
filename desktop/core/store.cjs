const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { z } = require('zod');
const projectInput = z.object({title:z.string().trim().min(1).max(160),genre:z.string().max(160),premise:z.string().max(20000),style:z.string().max(4000),target:z.number().int().min(1).max(1000),words:z.number().int().min(300).max(6000)});
function atomic(file, value, {compact=false}={}) {
  fs.mkdirSync(path.dirname(file), {recursive:true});
  const temp = file + '.tmp';
  const fd = fs.openSync(temp, 'w', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(value, null, compact?undefined:2)); fs.fsyncSync(fd); } finally {fs.closeSync(fd);}
  fs.renameSync(temp, file);
}
function read(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch(e) { if(e.code === 'ENOENT') return fallback; throw new Error('Không đọc được dữ liệu. Hãy khôi phục bản sao lưu; app không ghi đè dữ liệu lỗi.'); }
}
function validateId(id) { if(!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Mã truyện không hợp lệ.'); return id; }
class Store {
  constructor(root) {this.summaries=new Map();this.root=root; fs.mkdirSync(root,{recursive:true});}
  file(id) {return path.join(this.root,'projects',validateId(id),'project.json');}
  create(input) {
    const p={...projectInput.parse(input),id:randomUUID(),created:new Date().toISOString(),updated:new Date().toISOString(),bible:'',synopsis:'',arcs:[],chapters:[],memories:[],job:null,usage:{input:0,output:0,calls:0},schema:1};
    this.save(p); return p;
  }
  load(id) {const p=read(this.file(id),null); if(!p) throw new Error('Không tìm thấy truyện.'); p.synopsis=typeof p.synopsis==='string'?p.synopsis:''; this.cacheSummary(p);return p;}
  summaryKey(id){const stat=fs.statSync(this.file(id),{bigint:true});return `${stat.mtimeNs}:${stat.ctimeNs}:${stat.size}:${stat.ino}`;}
  cacheSummary(p){const value={id:p.id,title:p.title,genre:p.genre,target:p.target,updated:p.updated,completed:p.chapters.filter(c=>c.status==='approved').length,words:p.chapters.reduce((s,c)=>s+(c.wordCount||0),0),job:p.job,cover:p.cover||null};this.summaries.set(p.id,{key:this.summaryKey(p.id),value:structuredClone(value)});}
  progress(id){const key=this.summaryKey(id),entry=this.summaries.get(id);if(!entry||entry.key!==key)this.load(id);return structuredClone(this.summaries.get(id).value);}
  list() {
    const dir=path.join(this.root,'projects'); if(!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter(id=>/^[a-f0-9-]{36}$/.test(id)).map(id=>this.progress(id)).sort((a,b)=>b.updated.localeCompare(a.updated));
  }
  save(p) {
    p.updated=new Date().toISOString(); const file=this.file(p.id);
    if(fs.existsSync(file)) fs.copyFileSync(file,file+'.bak');
    atomic(file,p,{compact:true});this.cacheSummary(p);return p;
  }
  backup(p) {atomic(path.join(this.root,'backups',`${p.id}-${Date.now()}.json`),p);}
  import(value) {
    if(!value || value.schema!==1) throw new Error('File không phải bản sao lưu Việt Truyện.');
    projectInput.parse(value); if(!Array.isArray(value.chapters)||!Array.isArray(value.memories)||!Array.isArray(value.arcs)) throw new Error('Bản sao lưu thiếu dữ liệu.');
    if(value.chapters.length>1000 || value.chapters.some(c=>!Number.isInteger(c.number)||c.number<1||c.number>1000||typeof c.content!=='string')) throw new Error('Chương trong bản sao lưu không hợp lệ.');
    const p={...value,id:randomUUID(),job:null}; return this.save(p);
  }
}
function retrieve(p, query, number, limit=8) {
  const terms=new Set(query.toLocaleLowerCase('vi').match(/[\p{L}\p{N}]+/gu)||[]);
  return p.memories.filter(m=>m.chapter<number && m.chapter<number-3).map(m=>{
    const words=(m.summary+' '+JSON.stringify(m.facts||[])).toLocaleLowerCase('vi').match(/[\p{L}\p{N}]+/gu)||[];
    const set=new Set(words); let score=0; for(const term of terms) if(term.length>2 && set.has(term)) score++;
    return {...m,score};
  }).filter(m=>m.score>0).sort((a,b)=>b.score-a.score||b.chapter-a.chapter).slice(0,limit).sort((a,b)=>a.chapter-b.chapter);
}
function context(p,number) {
  const arc=p.arcs.find(a=>number>=a.start && number<=a.end);
  const chapter=p.chapters.find(c=>c.number===number);
  return {title:p.title,premise:p.premise,style:p.style,bible:p.bible,arc,plan:chapter?.plan,recent:p.memories.filter(m=>m.chapter<number).slice(-3),relevant:retrieve(p,(chapter?.plan||'')+' '+(arc?.summary||''),number),previousEnding:p.chapters.find(c=>c.number===number-1)?.content.slice(-4500)||''};
}
module.exports={Store,atomic,read,context,retrieve,projectInput};
