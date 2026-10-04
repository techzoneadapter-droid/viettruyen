const fs=require('node:fs'),path=require('node:path');
const {Store,atomic}=require('./store.cjs');
function moveStorage(current,destination,commit){
 const source=fs.realpathSync(current);fs.mkdirSync(destination,{recursive:true});const target=fs.realpathSync(destination);
 const inside=(a,b)=>{const r=path.relative(a,b);return !r||(!r.startsWith('..'+path.sep)&&r!=='..'&&!path.isAbsolute(r));};
 if(source===target)return new Store(source);
 if(inside(source,target)||inside(target,source))throw new Error('Chọn thư mục khác, không nằm trong hoặc chứa thư mục dữ liệu hiện tại.');
 if(fs.readdirSync(target).length)throw new Error('Chọn thư mục trống để tránh ghi đè truyện có sẵn.');
 const files=[];
 function copy(dir,relative=''){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const rel=path.join(relative,entry.name),from=path.join(dir,entry.name),to=path.join(target,rel);if(entry.isSymbolicLink())throw new Error('Thư mục dữ liệu có liên kết; không tự chuyển để tránh mất dữ liệu.');if(entry.isDirectory()){fs.mkdirSync(to,{recursive:true});copy(from,rel);}else{fs.copyFileSync(from,to,fs.constants.COPYFILE_EXCL);files.push(rel);if(!fs.readFileSync(from).equals(fs.readFileSync(to)))throw new Error('Kiểm tra bản sao thất bại.');}}}
 try{copy(source);const next=new Store(target);for(const p of next.list())next.load(p.id);commit(target);return next;}catch(e){throw new Error('Chưa đổi nơi lưu. Dữ liệu gốc vẫn còn nguyên. '+e.message);}
}
module.exports={moveStorage};
