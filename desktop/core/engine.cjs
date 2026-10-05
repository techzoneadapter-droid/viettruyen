const {setTimeout:retrySleep}=require('node:timers/promises');
const {errorText}=require('./messages.js');
const {parseJSON}=require('./ai.cjs');const {context}=require('./store.cjs');const {z}=require('zod');
const skeleton=z.object({bible:z.string().min(10).max(30000),arcs:z.array(z.object({title:z.string(),start:z.number().int(),end:z.number().int(),summary:z.string()})).min(1).max(40)});
// Models may express a chapter plan as named scenes/steps instead of a string.
// Preserve the information as readable text before validating and persisting it.
function planText(value,depth=0){
 if(typeof value==='string')return value;
 if(depth>8)throw new Error('Dàn ý chương có quá nhiều tầng. Hãy bấm Tiếp tục để lập lại dàn ý.');
 if(depth>0&&(typeof value==='number'||typeof value==='boolean'))return String(value);
 if(Array.isArray(value)&&value.length)return value.map(v=>planText(v,depth+1)).join('\n');
 if(value&&typeof value==='object'&&Object.keys(value).length)return Object.entries(value).map(([key,v])=>`${key}: ${planText(v,depth+1)}`).join('\n');
 throw new Error('AI trả dàn ý chương trống hoặc không hợp lệ. Các chương đã lưu được giữ nguyên; bấm Tiếp tục để thử lại.');
}
const plans=z.object({chapters:z.array(z.object({number:z.number().int(),title:z.string().max(250),plan:z.preprocess(planText,z.string().trim().min(1).max(6000))})).min(1).max(10)});
function parsePlans(text){
 const result=plans.safeParse(parseJSON(text));
 if(!result.success)throw new Error('AI trả dàn ý chương thiếu trường hoặc quá dài. Các chương đã lưu được giữ nguyên; bấm Tiếp tục để lập lại đợt dàn ý này.');
 return result.data;
}
const reviewSchema=z.object({approved:z.boolean(),issues:z.array(z.string()),summary:z.string().min(1).max(4000),facts:z.array(z.string().max(1000)).max(30),stateUpdates:z.record(z.string(),z.string().max(2000)).default({}),openThreads:z.array(z.string().max(600)).max(30).default([])});
const WRITER='Bạn là nhà văn viết truyện dài bằng tiếng Việt. Tuân thủ hồ sơ truyện, dàn ý, trạng thái nhân vật và dữ kiện đã duyệt. Phân biệt điều độc giả biết với điều từng nhân vật biết. Không tự đổi tên, hồi sinh nhân vật hay giải quyết mâu thuẫn bằng năng lực chưa được thiết lập. Cảnh phải tạo tiến triển, có hành động, đối thoại tự nhiên, cảm xúc và chi tiết cụ thể. Xây dựng truyện nguyên bản; không sao chép nhân vật, thế giới đặc trưng, chuỗi tình tiết hoặc câu văn từ tác phẩm có sẵn. Không nhắc đến AI, không thêm lời dẫn ngoài truyện.';
class Engine{
 constructor(store,ai,emit=()=>{},{sleep=retrySleep}={}){Object.assign(this,{store,ai,emit,sleep,active:null});}
 busy(){return !!this.active;}
 pause(){if(this.active){this.active.pause=true;this.emit({type:'status',project:this.active.id,message:'Sẽ tạm dừng sau bước hiện tại; nội dung sẽ được lưu.'});}}
 abort(){this.active?.controller.abort();}
 async call(p,instructions,prompt,label,stream=false){if(this.active?.controller.signal.aborted)throw new Error('Đã dừng tác vụ.');p.job={...p.job,status:'running',message:label};this.store.save(p);this.emit({type:'phase',project:p.id,message:label});let r,pending='',timer;const flush=()=>{clearTimeout(timer);timer=null;if(pending){const delta=pending;pending='';this.emit({type:'delta',project:p.id,delta});}};const live=delta=>{pending+=delta;if(pending.length>=4096)flush();else if(!timer)timer=setTimeout(flush,80);};try{r=await this.ai.generate(instructions,prompt,{signal:this.active?.controller.signal,onDelta:stream?live:undefined,restartInterrupted:true,shouldPause:()=>!!this.active?.pause,onInterrupted:({text})=>{flush();if(stream){const number=Number(label.match(/\d+/)?.[0]),chapter=p.chapters.find(c=>c.number===number);if(chapter){chapter.interruptedDraft=text;this.store.save(p);}}},onRetry:retry=>{p.job={...p.job,message:retry.message};this.store.save(p);this.emit({type:'phase',project:p.id,message:retry.message});}});flush();}catch(e){flush();if(stream&&e.partialText){const number=Number(label.match(/\d+/)?.[0]),chapter=p.chapters.find(c=>c.number===number);if(chapter){chapter.interruptedDraft=e.partialText;chapter.issues=['Kết nối bị ngắt. Phần nhận được đã lưu riêng và chưa được duyệt. Bấm Tiếp tục để tạo lại phần chưa hoàn tất.'];this.store.save(p);}}throw e;}p.usage||={input:0,output:0,calls:0};p.usage.input+=r.usage.input||0;p.usage.output+=r.usage.output||0;p.usage.calls++;this.store.save(p);return r.text;}
 async structured(p,instructions,prompt,label,validate){
  let feedback='';
  const check=()=>{if(this.active.controller.signal.aborted)throw new DOMException('Đã dừng','AbortError');if(this.active.pause){const e=new Error('Đã tạm dừng; bản nháp và các chương hoàn tất được giữ lại.');e.pauseRequested=true;throw e;}};
  for(let attempt=0;;attempt++){
   check();
   const text=await this.call(p,instructions,prompt+(attempt?'\nLần trước phản hồi sai cấu trúc. Chỉ trả JSON đúng schema đã yêu cầu; giữ nguyên số chương và đủ mọi trường bắt buộc. Không thêm lời giải thích ngoài JSON. Những trường cần kiểm tra: '+feedback:''),label+(attempt?` (tự thử lại lần ${attempt})`:''));
   try{return validate(text);}catch(e){
    check();feedback=(e.issues?.map(x=>x.path.join('.')+': '+x.code).join('; ')||errorText(e)).slice(0,1200);
    if(attempt>=2){const wait=Math.min(60000,5000*2**Math.min(attempt-2,4));p.job={...p.job,message:`${label}: AI trả sai định dạng; chờ ${wait/1000} giây rồi tự thử lại lần ${attempt+1}.`};this.store.save(p);this.emit({type:'phase',project:p.id,message:p.job.message});for(let left=wait;left>0;left-=1000){check();await this.sleep(Math.min(left,1000),null,{signal:this.active.controller.signal});}check();}
   }
  }
 }
 async run(id,count=5,{planOnly=false}={}){
  if(this.active)throw new Error('Có tác vụ đang chạy. Hãy tạm dừng trước.');if(!Number.isInteger(count)||count<1||count>1000)throw new Error('Số chương trong đợt không hợp lệ.');
  const p=this.store.load(id);this.active={id,pause:false,controller:new AbortController()};this.store.backup(p);const binding=p.job?.accountId?{accountId:p.job.accountId,accountName:p.job.accountName,accountModel:p.job.accountModel,accountProvider:p.job.accountProvider}:{};p.job={...binding,status:'running',message:'Chuẩn bị',requested:count,completed:0,remaining:count,planOnly,currentChapter:null,started:new Date().toISOString()};this.store.save(p);
  try{
   if(!p.arcs.length){const v=await this.structured(p,'Bạn là biên tập viên cấu trúc truyện dài. Chỉ trả JSON hợp lệ.',JSON.stringify({task:'Tạo hồ sơ thế giới, nhân vật, quy tắc năng lực, phong cách, bí mật và kết thúc dự kiến; chia thành các quyển liên tiếp khoảng 25–50 chương. JSON {bible:string,arcs:[{title,start,end,summary}]}. Phủ đủ 1 đến target, không chồng lấn. Mỗi quyển có mục tiêu, xung đột, bước ngoặt và kết thúc.',title:p.title,genre:p.genre,premise:p.premise,style:p.style,target:p.target}),'Xây dựng hồ sơ và các quyển',text=>{const v=skeleton.parse(parseJSON(text));let next=1;for(const a of v.arcs){if(a.start!==next||a.end<a.start||a.end>p.target)throw new Error('Dàn ý quyển không phủ đúng số chương. Hãy chạy lại.');next=a.end+1;}if(next!==p.target+1)throw new Error('Dàn ý chưa phủ đủ số chương.');return v;});p.bible=v.bible;p.arcs=v.arcs;this.store.save(p);}
   if(this.afterPlan)await this.afterPlan(p,this.active.controller.signal);
   if(!planOnly)for(let i=0;i<count&&!this.active.pause;i++){
    const n=Array.from({length:p.target},(_,j)=>j+1).find(number=>p.chapters.find(c=>c.number===number)?.status!=='approved');if(!n)break;p.job.currentChapter=n;const arc=p.arcs.find(a=>n>=a.start&&n<=a.end);let c=p.chapters.find(c=>c.number===n);
    if(!c){const end=Math.min(arc.end,n+9);const v=await this.structured(p,'Bạn lập dàn ý chương tiếng Việt. Chỉ trả JSON hợp lệ.',JSON.stringify({task:`Lập chính xác chương ${n} đến ${end}. JSON {chapters:[{number,title,plan}]}. plan phải là một chuỗi văn bản, không phải object hay array; nêu cảnh, bước tiến, nhân vật biết gì và điểm kết; tránh lặp.`,context:context(p,n),ledger:p.ledger||{},threads:p.openThreads||[],nextArc:p.arcs.find(a=>a.start===arc.end+1)}),`Lập dàn ý chương ${n}–${end}`,text=>{const v=parsePlans(text);if(v.chapters.length!==end-n+1||v.chapters.some((x,j)=>x.number!==n+j))throw new Error('Dàn ý chương thiếu hoặc sai số thứ tự.');return v;});p.chapters.push(...v.chapters.filter(x=>!p.chapters.some(c=>c.number===x.number)).map(x=>({...x,content:'',status:'planned',wordCount:0,issues:[]})));p.chapters.sort((a,b)=>a.number-b.number);this.store.save(p);c=p.chapters.find(c=>c.number===n);}
    if(this.active.pause)break;
    const chapterContext=context(p,n);
    if(!c.content){c.content=await this.call(p,WRITER,JSON.stringify({task:`Viết chương ${n}: ${c.title}. Khoảng ${p.words} từ. Chỉ trả nội dung chương, không Markdown hay tiêu đề.`,context:chapterContext,ledger:p.ledger||{},openThreads:p.openThreads||[]}),`Viết chương ${n}`,true);delete c.interruptedDraft;c.wordCount=c.content.trim().split(/\s+/u).length;c.status='draft';this.store.save(p);}
    if(this.active.pause)break;let review;
    for(let pass=0;pass<4;pass++){
     review=await this.structured(p,'Bạn là biên tập viên kiểm tra tính nhất quán. Chỉ trả JSON hợp lệ. Không coi mọi thay đổi hợp lý là lỗi.',JSON.stringify({task:'Kiểm tra dữ kiện, tên, thời gian, kiến thức nhân vật, cảnh lặp và kế hoạch. approved=false nếu có lỗi rõ ràng. JSON {approved:boolean,issues:string[],summary:string,facts:string[],stateUpdates:{"tên nhân vật/địa điểm/vật phẩm":"trạng thái mới đã xác nhận"},openThreads:string[]}. openThreads là danh sách tổng hợp tuyến đang mở sau chương, gồm cả tuyến cũ chưa giải quyết. Không bịa dữ kiện.',context:chapterContext,ledger:p.ledger||{},openThreads:p.openThreads||[],content:c.content}),`Kiểm tra chương ${n}`,text=>reviewSchema.parse(parseJSON(text)));c.issues=review.issues;this.store.save(p);if(review.approved)break;
     if(pass<3&&!this.active.pause){c.content=await this.call(p,WRITER,JSON.stringify({task:'Viết lại toàn bộ chương để sửa lỗi, giữ cảnh đúng, độ dài và văn phong.',issues:review.issues,context:chapterContext,ledger:p.ledger||{},content:c.content}),`Sửa chương ${n}`,true);delete c.interruptedDraft;c.wordCount=c.content.trim().split(/\s+/u).length;this.store.save(p);}else break;
    }
    c.status=review.approved?'approved':'needs_review';
    if(review.approved){p.job.completed++;p.job.remaining=Math.max(0,count-p.job.completed);p.memories=p.memories.filter(m=>m.chapter!==n);p.memories.push({chapter:n,summary:review.summary,facts:review.facts,stateUpdates:review.stateUpdates,openThreads:review.openThreads});p.memories.sort((a,b)=>a.chapter-b.chapter);p.ledger={...(p.ledger||{}),...review.stateUpdates};p.openThreads=review.openThreads;}
    this.store.save(p);this.emit({type:'saved',project:p.id,chapter:n});if(!review.approved){p.job={...p.job,status:'paused',message:`Chương ${n} cần bạn xem lại. Sửa nội dung rồi bấm Tiếp tục.`};break;}
   }
   if(p.job.status==='running')p.job={...p.job,status:(!this.active.pause&&(planOnly||p.job.remaining===0||p.chapters.filter(c=>c.status==='approved').length===p.target))?'completed':'paused',message:planOnly?'Đã tạo hồ sơ và dàn ý quyển.':p.chapters.filter(c=>c.status==='approved').length===p.target?'Đã hoàn tất truyện.':'Đã lưu đợt viết. Bấm Tiếp tục để viết đợt sau.'};
  }catch(e){p.job={...p.job,status:e.pauseRequested?'paused':'error',blocked:!!e.quota,message:e.name==='AbortError'?'Đã dừng và giữ dữ liệu đã lưu.':errorText(e)};}finally{this.store.save(p);this.active=null;this.emit({type:'finished',project:p.id,message:p.job.message});}return p;
 }
}
module.exports={Engine,reviewSchema,parsePlans};
