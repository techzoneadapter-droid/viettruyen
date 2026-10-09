const path=require('node:path');
const {atomic,read}=require('./store.cjs');
const {errorText}=require('./messages.js');
const MAX_PARALLEL=16;
class JobQueue{
 constructor(store,factory,emit=()=>{},scheduler={}){
  Object.assign(this,{store,factory,emit,scheduler,running:new Map(),stopping:false});
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
  const p=this.store.load(id);const left=p.target-p.chapters.filter(c=>c.status==='approved').length;if(!planOnly&&!left)throw new Error('Truyện đã hoàn tất số chương dự kiến.');if(!planOnly)count=Math.min(count,left);const previous=this.items.find(x=>x.id===id);const binding=previous?.accountId?{accountId:previous.accountId,accountName:previous.accountName,accountModel:previous.accountModel,accountProvider:previous.accountProvider}:p.job?.accountId?{accountId:p.job.accountId,accountName:p.job.accountName,accountModel:p.job.accountModel,accountProvider:p.job.accountProvider}:{};this.items=this.items.filter(x=>x.id!==id);
  this.items.push({...binding,id,title:p.title,count,requested:count,completedBefore:0,planOnly,status:'queued',remaining:count,completed:0,message:'Đang chờ lượt chạy.'});
  p.job={...p.job,status:'queued',message:'Đang chờ lượt chạy.',remaining:count,requested:count,completed:0,planOnly,currentChapter:null};this.store.save(p);this.save();this.pump();return this.snapshot();
 }
 resume(id){const item=this.items.find(x=>x.id===id&&x.status==='paused');if(!item)throw new Error('Không có đợt tạm dừng cho truyện này.');return this.enqueue(id,Math.max(1,item.count),{planOnly:item.planOnly});}
 pause(id,abort=false){
  for(const item of this.items.filter(x=>!id||x.id===id)){
   const engine=this.running.get(item.id);
   if(engine){item.stopRequested=true;if(!engine.busy()){item.stopRequested=true;item.status='paused';const p=this.store.load(item.id);p.job={...p.job,status:'paused',message:'Đã tạm dừng trước khi bắt đầu.'};this.store.save(p);}abort?engine.abort():engine.pause();item.message=abort?'Đang dừng…':'Sẽ tạm dừng sau bước hiện tại.';}
   else if(item.status==='queued'){item.status='paused';item.message='Đã tạm dừng hàng đợi.';const p=this.store.load(item.id);p.job={...p.job,status:'paused',message:item.message};this.store.save(p);}
  }
  this.save();return this.snapshot();
 }
 pauseAccount(accountId){for(const item of this.items.filter(x=>x.accountId===accountId))this.pause(item.id,false);}
 remove(id){if(this.running.has(id))throw new Error('Tạm dừng truyện trước khi bỏ khỏi hàng đợi.');this.items=this.items.filter(x=>x.id!==id);const p=this.store.load(id);if(p.job){delete p.job.accountId;delete p.job.accountName;delete p.job.accountModel;delete p.job.accountProvider;}p.job={...p.job,status:'paused',message:'Đã bỏ đợt khỏi hàng đợi. Nội dung truyện được giữ nguyên.'};this.store.save(p);this.save();return this.snapshot();}
 shutdown(){this.stopping=true;this.pause(undefined,true);}
 pump(){
  if(this.stopping)return;
  while(this.running.size<this.limit){
   let binding;const item=this.items.find(x=>{if(x.status!=='queued')return false;if(!this.scheduler.allocate)return true;const selected=this.scheduler.allocate(x,this.running,this.items);if(!selected)return false;binding=selected;return true;});if(!item)break;
   if(binding){Object.assign(item,binding);const p=this.store.load(item.id);p.job={...p.job,...binding};this.store.save(p);}
   item.status='running';const engine=this.factory(event=>{if(event.message)item.message=errorText(event.message);if(event.type==='saved'){const job=this.store.progress(item.id).job;item.remaining=job.remaining;item.completed=job.completed;}this.emit(event);if(event.type!=='delta')this.save();},item);
   this.running.set(item.id,engine);this.save();
   Promise.resolve().then(()=>item.stopRequested?this.store.load(item.id):engine.run(item.id,item.count,{planOnly:item.planOnly,completedBefore:item.completedBefore||0,requested:item.requested||item.count})).then(p=>{
    if(p.job.blocked){if(this.scheduler.onBlocked)this.scheduler.onBlocked(item,this);else this.pause(undefined,false);}
    if(p.job.status==='completed'){this.items=this.items.filter(x=>x.id!==item.id);}
    else{item.status='paused';item.count=Math.max(1,p.job.remaining??item.count);item.message=p.job.message;
     if(p.job.blocked&&!item.stopRequested&&!this.stopping){const binding=this.scheduler.recover?.(item,this.running,this.items);
      if(binding){const from=item.accountName||item.accountId;item.requested=p.job.requested;item.completedBefore=p.job.completed;Object.assign(item,binding);item.status='queued';item.message=`${from} hết quota; tự chuyển sang ${binding.accountName} · ${binding.accountModel}. Đang chờ lượt để tiếp tục.`;p.job={...p.job,...binding,blocked:false,status:'queued',message:item.message};this.store.save(p);this.emit({type:'status',project:item.id,message:item.message});}
      else{item.message=p.job.message+' Không còn tài khoản AI dự phòng sẵn sàng; thêm kết nối rồi bấm Tiếp tục.';p.job.message=item.message;this.store.save(p);}
     }
    }
   }).catch(e=>{item.status='paused';item.message=errorText(e);}).finally(()=>{this.running.delete(item.id);this.save();this.pump();});
  }
 }
}
module.exports={JobQueue,MAX_PARALLEL};
