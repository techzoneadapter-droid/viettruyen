const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {Store,context}=require('../desktop/core/store.cjs');const {AI,parseJSON,readSSE}=require('../desktop/core/ai.cjs');const {Engine}=require('../desktop/core/engine.cjs');
function fixture(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'viet-test-'));const store=new Store(root);const p=store.create({title:'Truyện thử',genre:'Phiêu lưu',premise:'Tìm kho báu',style:'Tự nhiên',target:500,words:1000});return {root,store,p};}
function review(approved=true){return {approved,issues:approved?[]:['Sai tên'],summary:'An tìm thấy bản đồ ở bến cảng.',facts:['An có bản đồ'],stateUpdates:{An:'Ở bến cảng, giữ bản đồ'},openThreads:['Ai giấu bản đồ?']};}
test('atomic store survives restart, bounds target, and rejects traversal',()=>{const {root,store,p}=fixture();assert.equal(new Store(root).load(p.id).title,p.title);assert.throws(()=>store.load('../project'));assert.throws(()=>store.create({...p,target:1001}));assert.ok(fs.existsSync(store.file(p.id)));fs.rmSync(root,{recursive:true});});
test('corrupted data is never silently replaced',()=>{const {store,p,root}=fixture();fs.writeFileSync(store.file(p.id),'bad');assert.throws(()=>store.load(p.id),/không ghi đè/);assert.equal(fs.readFileSync(store.file(p.id),'utf8'),'bad');fs.rmSync(root,{recursive:true});});
test('import creates a separate copy and clears running job',()=>{const {store,p,root}=fixture();p.job={status:'running'};const q=store.import(p);assert.notEqual(p.id,q.id);assert.equal(q.job,null);assert.equal(store.list().length,2);fs.rmSync(root,{recursive:true});});
test('context excludes future memory and recalls older relevant facts',()=>{const {p,root}=fixture();p.memories=[{chapter:1,summary:'Bản đồ nằm ở cảng',facts:[]},{chapter:90,summary:'An tìm kho báu',facts:[]},{chapter:100,summary:'Tương lai',facts:[]}];p.chapters=[{number:95,plan:'Bản đồ ở cảng'}];const c=context(p,95);assert.equal(c.relevant[0].chapter,1);assert.ok(c.recent.every(m=>m.chapter<95));fs.rmSync(root,{recursive:true});});
test('SSE handles UTF-8 split chunks and CRLF',async()=>{const bytes=new TextEncoder().encode('data: {"type":"response.output_text.delta","delta":"Truyện"}\r\n\r\ndata: {"type":"response.completed"}\n\n');const out=[];await readSSE(new Response(new ReadableStream({start(c){for(let i=0;i<bytes.length;i++)c.enqueue(bytes.slice(i,i+1));c.close();}})),e=>out.push(e));assert.equal(out[0].delta,'Truyện');assert.equal(out[1].type,'response.completed');});
test('OpenAI incomplete stream cannot become approved content',async()=>{const ai=new AI(()=>({provider:'openai',openaiKey:'fixture',model:'test'}),{},async()=>new Response('data: {"type":"response.output_text.delta","delta":"Draft"}\n\n'));await assert.rejects(()=>ai.generate('Write','Story'),/trước khi AI viết xong/);});
test('Gemini blocked or truncated output is rejected',async()=>{const ai=new AI(()=>({provider:'gemini',geminiKey:'fixture',model:'test'}),{},async()=>Response.json({candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'partial'}]}}]}));await assert.rejects(()=>ai.generate('Write','Story'),/chưa hoàn tất/);});
test('engine resumes saved draft after quota failure without writing twice',async()=>{const {store,p,root}=fixture();p.arcs=[{title:'Quyển 1',start:1,end:500,summary:'Tìm bản đồ'}];p.bible='An tìm bản đồ.';p.chapters=[{number:1,title:'Bến cảng',plan:'An tìm bản đồ',content:'Nội dung đã lưu',wordCount:1000,status:'draft',issues:[]}];store.save(p);let calls=0;const engine=new Engine(store,{generate:async()=>{calls++;throw new Error('Hết hạn mức');}});await engine.run(p.id,1);assert.equal(store.load(p.id).chapters[0].content,'Nội dung đã lưu');assert.equal(store.load(p.id).job.status,'error');engine.ai={generate:async()=>({text:JSON.stringify(review()),usage:{input:10,output:10}})};await engine.run(p.id,1);assert.equal(store.load(p.id).chapters[0].status,'approved');assert.equal(store.load(p.id).memories.length,1);assert.equal(calls,1);fs.rmSync(root,{recursive:true});});
test('a rejected chapter stops the batch and does not contaminate memory',async()=>{const {store,p,root}=fixture();p.arcs=[{title:'Quyển 1',start:1,end:500,summary:'Tìm bản đồ'}];p.chapters=[{number:1,title:'Bến cảng',plan:'An tìm bản đồ',content:'Nội dung',wordCount:1000,status:'draft',issues:[]}];store.save(p);let count=0;const engine=new Engine(store,{generate:async()=>({text:count++===1?'Bản sửa':JSON.stringify(review(false)),usage:{input:0,output:0}})});await engine.run(p.id,5);const q=store.load(p.id);assert.equal(q.chapters[0].status,'needs_review');assert.equal(q.memories.length,0);assert.equal(q.chapters.length,1);assert.equal(q.job.status,'paused');fs.rmSync(root,{recursive:true});});
test('invalid plan cannot overwrite existing bible',async()=>{const {store,p,root}=fixture();p.bible='Hồ sơ cũ';store.save(p);const engine=new Engine(store,{generate:async()=>({text:JSON.stringify({bible:'Hồ sơ khác rất dài',arcs:[{title:'Q',start:2,end:500,summary:'X'}]}),usage:{}})},undefined,{sleep:async()=>engine.pause()});await engine.run(p.id,1);assert.equal(store.load(p.id).bible,'Hồ sơ cũ');assert.equal(store.load(p.id).arcs.length,0);fs.rmSync(root,{recursive:true});});
test('JSON handles fenced responses without evaluating content',()=>{assert.deepEqual(parseJSON('```json\n{"approved":true}\n```'),{approved:true});assert.throws(()=>parseJSON('not json'));});
test('structured chapter plans preserve scenes and reject unusable values',()=>{
 const {parsePlans}=require('../desktop/core/engine.cjs');
 const response=plan=>JSON.stringify({chapters:[{number:21,title:'Chương mới',plan}]});
 const p=parsePlans(response({scenes:[{location:'Bến cảng',action:'An tìm bản đồ'},'Gặp người dẫn đường'],progress:'Tìm ra dấu vết',knowledge:{An:'Biết vị trí'},ending:'Có người theo dõi'})).chapters[0].plan;
 assert.match(p,/location: Bến cảng/);assert.match(p,/action: An tìm bản đồ/);assert.match(p,/Gặp người dẫn đường/);assert.match(p,/An: Biết vị trí/);
 assert.equal(parsePlans(response('Dàn ý thường')).chapters[0].plan,'Dàn ý thường');
 for(const invalid of [null,{},[],12,true,{scene:null},' ', 'x'.repeat(6001)])assert.throws(()=>parsePlans(response(invalid)),/Dàn ý|dàn ý/);
});
test('batch resumes after structured plan failure and preserves all twenty existing chapters',async()=>{
 const {store,p,root}=fixture();
 try{
  p.arcs=[{title:'Quyển 1',start:1,end:500,summary:'Tiếp tục hành trình'}];p.bible='Hồ sơ hiện có';
  p.chapters=Array.from({length:20},(_,i)=>({number:i+1,title:`Chương ${i+1}`,plan:'Dàn ý đã lưu',content:`Nội dung riêng ${i+1}`,status:'approved',wordCount:4,issues:[]}));
  p.memories=[{chapter:20,summary:'Dữ kiện đã lưu',facts:['An có bản đồ']}];
  store.save(p);const original=JSON.stringify(p.chapters);let calls=0;
  const engine=new Engine(store,{generate:async()=>({text:JSON.stringify({chapters:[{number:21,title:'Lỗi',plan:null}]}),usage:{}})},undefined,{sleep:async()=>engine.pause()});
  await engine.run(p.id,500);assert.equal(JSON.stringify(store.load(p.id).chapters),original);
  engine.ai={generate:async()=>{calls++;return {text:calls===1?JSON.stringify({chapters:Array.from({length:10},(_,i)=>({number:21+i,title:`Chương ${21+i}`,plan:{scene:'An đi đến cảng',progress:['Tìm dấu vết','Gặp người lạ'],ending:'Bí mật mới'}}))}):calls===2?'Chương mới đã viết':JSON.stringify(review()),usage:{}};}};
  await engine.run(p.id,1);const q=store.load(p.id);
  assert.equal(JSON.stringify(q.chapters.slice(0,20)),original);assert.equal(q.chapters[20].status,'approved');assert.match(q.chapters[20].plan,/scene: An đi đến cảng/);assert.equal(q.chapters[29].number,30);assert.equal(q.memories[0].summary,'Dữ kiện đã lưu');assert.equal(calls,3);
 }finally{fs.rmSync(root,{recursive:true});}
});
test('legacy validation logs and fresh Zod errors become Vietnamese messages',()=>{
 const {errorText}=require('../desktop/core/messages.js');const {z}=require('zod');
 const old=JSON.stringify([{expected:'string',code:'invalid_type',path:['chapters',0,'plan'],message:'Invalid input: expected string, received object'}]);
 assert.match(errorText(old),/dàn ý chương/);assert.doesNotMatch(errorText(old),/invalid_type|expected|received/);
 const result=z.object({summary:z.string()}).safeParse({summary:{}});assert.match(errorText(result.error),/kiểm tra chương/);
 assert.equal(errorText('Hết hạn mức'),'Hết hạn mức');assert.equal(errorText('[1,2]'),'[1,2]');
});
test('resume clears legacy job error before the first AI request',async()=>{
 const {store,p,root}=fixture();try{
  p.arcs=[{title:'Quyển 1',start:1,end:500,summary:'Đi tìm bản đồ'}];p.job={status:'error',message:'[{"code":"invalid_type","path":["chapters",0,"plan"]}]'};store.save(p);
  const engine=new Engine(store,{generate:async()=>{const job=store.load(p.id).job;assert.equal(job.status,'running');assert.equal(job.message,'Lập dàn ý chương 1–10');throw new Error('Hết hạn mức');}});
  await engine.run(p.id,1);assert.equal(store.load(p.id).job.message,'Hết hạn mức');
 }finally{fs.rmSync(root,{recursive:true});}
});
