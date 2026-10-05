const path=require('node:path');
const {atomic,read}=require('./store.cjs');
const {errorText}=require('./messages.js');
const MAX_PARALLEL=16;
class JobQueue{
 constructor(store,factory,emit=()=>{}){
  Object.assign(this,{store,factory,emit,running:new Map(),stopping:false});
  const saved=read(this.file(),{limit:2,items:[]});this.limit=Math.max(1,Math.min(MAX_PARALLEL,Number.isInteger(saved.limit)?saved.limit:2));
  this.items=(saved.items||[]).filter(x=>{const p=store.load(x.id);if(p.job?.status==='completed')return false;if(!x.planOnly&&p.job?.remaining===0){p.job={...p.job,status:'completed',message:'Đợt viết đã hoàn tất tại điểm lưu cuối.'};store.save(p);return false;}return true;}).map(x=>({...x,status:'paused',message:'App đã đóng. Bấm Tiếp tục để chạy phần còn lại.'}));
  // A chapter checkpoint is authoritative if the process closed before queue metadata.
  for(const item of this.items){const p=store.load(item.id);if(p.job?.remaining!==undefined&&item.status==='paused'){item.count=p.job.remaining||item.count;item.remaining=item.count;}}
  this.save();
 }
 file(){return path.join(this.store.root,'jobs.json');}
 snapshot(){return {limit:this.limit,maxParallel:MAX_PARALLEL,items:this.items.map(x=>{const p=this.store.progress(x.id),job=p.job||{};return {...x,totalCompleted:p.completed,target:p.target,currentChapter:job.currentChapter??null,requested:job.requested??x.count,completed:job.completed??0,remaining:job.remaining??x.count};}),active:this.running.size};}
 save(){atomic(this.file(),{limit:this.limit,items:this.items});this.emit({type:'queue',...this.snapshot()});}
 busy(){return this.running.size>0||this.items.some(x=>x.status==='queued');}
 locked(id){return this.running.has(id)||this.items.some(x=>x.id===id&&x.status==='queued');}
 setLimit(value){if(!Number.isInteger(value)||value<1||value>MAX_PARALLEL)throw new Error(`Chọn từ 1 đến ${MAX_PARALLEL} truyện chạy đồng thời.`);this.limit=value;this.save();this.pump();return this.snapshot();}
 enqueue(id,count=5,{planOnly=false}={}){
  if(this.stopping)throw new Error('Đang dừng các tác vụ. Chờ hoàn tất trước khi chạy tiếp.');
  if(this.locked(id))throw new Error('Truyện này đã chạy hoặc đã nằm trong hàng đợi.');
  if(!Number.isInteger(count)||count<1||count>1000)throw new Error('Số chương trong đợt phải từ 1 đến 1.000.');
  const p=this.store.load(id);const left=p.target-p.chapters.filter(c=>c.status==='approved').length;if(!planOnly&&!left)throw new Error('Truyện đã hoàn tất số chương dự kiến.');if(!planOnly)count=Math.min(count,left);this.items=this.items.filter(x=>x.id!==id);
  this.items.push({id,title:p.title,count,planOnly,status:'queued',remaining:count,completed:0,message:'Đang chờ lượt chạy.'});
  p.job={...p.job,status:'queued',message:'Đang chờ lượt chạy.',remaining:count,requested:count,completed:0,planOnly,currentChapter:null};this.store.save(p);this.save();this.pump();return this.snapshot();
 }
 resume(id){const item=this.items.find(x=>x.id===id&&x.status==='paused');if(!item)throw new Error('Không có đợt tạm dừng cho truyện này.');return this.enqueue(id,Math.max(1,item.count),{planOnly:item.planOnly});}
 pause(id,abort=false){
  for(const item of this.items.filter(x=>!id||x.id===id)){
   const engine=this.running.get(item.id);
   if(engine){if(!engine.busy()){item.stopRequested=true;item.status='paused';const p=this.store.load(item.id);p.job={...p.job,status:'paused',message:'Đã tạm dừng trước khi bắt đầu.'};this.store.save(p);}abort?engine.abort():engine.pause();item.message=abort?'Đang dừng…':'Sẽ tạm dừng sau bước hiện tại.';}
   else if(item.status==='queued'){item.status='paused';item.message='Đã tạm dừng hàng đợi.';const p=this.store.load(item.id);p.job={...p.job,status:'paused',message:item.message};this.store.save(p);}
  }
  this.save();return this.snapshot();
 }
 remove(id){if(this.running.has(id))throw new Error('Tạm dừng truyện trước khi bỏ khỏi hàng đợi.');this.items=this.items.filter(x=>x.id!==id);const p=this.store.load(id);p.job={...p.job,status:'paused',message:'Đã bỏ đợt khỏi hàng đợi. Nội dung truyện được giữ nguyên.'};this.store.save(p);this.save();return this.snapshot();}
 shutdown(){this.stopping=true;this.pause(undefined,true);}
 pump(){
  if(this.stopping)return;
  while(this.running.size<this.limit){
   const item=this.items.find(x=>x.status==='queued');if(!item)break;
   item.status='running';const engine=this.factory(event=>{if(event.message)item.message=errorText(event.message);if(event.type==='saved'){const job=this.store.progress(item.id).job;item.remaining=job.remaining;item.completed=job.completed;}this.emit(event);if(event.type!=='delta')this.save();});
   this.running.set(item.id,engine);this.save();
   Promise.resolve().then(()=>item.stopRequested?this.store.load(item.id):engine.run(item.id,item.count,{planOnly:item.planOnly})).then(p=>{
    if(p.job.blocked)this.pause(undefined,false);
    if(p.job.status==='completed'){this.items=this.items.filter(x=>x.id!==item.id);}
    else{item.status='paused';item.count=Math.max(1,p.job.remaining??item.count);item.message=p.job.message;}
   }).catch(e=>{item.status='paused';item.message=errorText(e);}).finally(()=>{this.running.delete(item.id);this.save();this.pump();});
  }
 }
}
module.exports={JobQueue,MAX_PARALLEL};
