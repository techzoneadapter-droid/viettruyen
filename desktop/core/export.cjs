const fs=require('node:fs');const {zipSync,strToU8}=require('fflate');const {coverPath}=require('./cover.cjs');
function storyText(p){return p.title+'\n\n'+(p.synopsis?'TÓM TẮT TRUYỆN\n'+p.synopsis+'\n\n':'')+p.chapters.filter(c=>c.content).map(c=>`Chương ${c.number}: ${c.title}\n\n${c.content}`).join('\n\n\n');}
function storyZip(store,p){const file=coverPath(store,p),cover=fs.readFileSync(file),entries={'truyen.txt':strToU8(storyText(p)),'truyen.json':strToU8(JSON.stringify(p,null,2)),['bia.'+p.cover.format]:new Uint8Array(cover)};if(p.synopsis)entries['tom-tat.txt']=strToU8(p.synopsis);for(const c of p.chapters.filter(c=>c.content))entries[`chapters/chuong-${String(c.number).padStart(4,'0')}.txt`]=strToU8(`Chương ${c.number}: ${c.title}\n\n${c.content}`);
 if(p.translation)entries['ban-goc.txt']=strToU8(p.chapters.map(c=>c.title+'\n\n'+c.source).join('\n\n'));
 entries['manifest.json']=strToU8(JSON.stringify({title:p.title,genre:p.genre,exportedAt:new Date().toISOString(),target:p.target,chapters:p.chapters.filter(c=>c.content).map(c=>({number:c.number,title:c.title,status:c.status})),cover:{file:'bia.'+p.cover.format,width:p.cover.width,height:p.cover.height,bytes:cover.length,format:p.cover.format}},null,2));
 if(Object.values(entries).reduce((n,v)=>n+v.length,0)>150*1024*1024)throw new Error('Truyện quá lớn để xuất ZIP một lần. Xuất TXT/JSON riêng hoặc chia quyển.');return Buffer.from(zipSync(entries,{level:6}));}
function writeExport(file,data){fs.writeFileSync(file+'.tmp',data);fs.renameSync(file+'.tmp',file);}
module.exports={storyText,storyZip,writeExport};
