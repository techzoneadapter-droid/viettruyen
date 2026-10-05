const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Store,context}=require('../desktop/core/store.cjs'),{Engine}=require('../desktop/core/engine.cjs'),{JobQueue}=require('../desktop/core/queue.cjs');
function fixture(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'viet-performance-')),store=new Store(root),p=store.create({title:'Truyện dài',genre:'Phiêu lưu',premise:'Một hành trình',style:'Tự nhiên',target:1000,words:2000});return {root,store,p,done:()=>fs.rmSync(root,{recursive:true,force:true})};}
test('warm progress reads no manuscript, remains isolated and refreshes on external changes or restart',()=>{
 const f=fixture(),read=fs.readFileSync;try{const {store,p}=f;p.chapters=Array.from({length:1000},(_,i)=>({number:i+1,status:i<117?'approved':'planned',content:'Truyện dài. '.repeat(100),wordCount:1000}));store.save(p);const q=new JobQueue(store,()=>{});q.items=[{id:p.id,count:500,status:'running'}];let reads=0;fs.readFileSync=(...args)=>{reads++;return read(...args);};for(let i=0;i<20;i++){assert.equal(q.snapshot().items[0].totalCompleted,117);store.list();}assert.equal(reads,0);fs.readFileSync=read;
 const detached=store.progress(p.id);detached.completed=999;assert.equal(store.progress(p.id).completed,117);
 const external=JSON.parse(read(store.file(p.id),'utf8'));external.chapters[117].status='approved';fs.writeFileSync(store.file(p.id),JSON.stringify(external));assert.equal(q.snapshot().items[0].totalCompleted,118);assert.equal(new Store(f.root).progress(p.id).completed,118);
 fs.writeFileSync(store.file(p.id),'broken');assert.throws(()=>store.progress(p.id),/Không đọc được/);assert.equal(read(store.file(p.id),'utf8'),'broken');
 }finally{fs.readFileSync=read;f.done();}
});
test('batched live text preserves every delta, write-review order and complete chapter context',async()=>{
 const f=fixture();try{const {store,p}=f;p.bible='Hồ sơ thế giới đầy đủ';p.arcs=[{title:'Quyển',start:1,end:1000,summary:'Hành trình'}];p.chapters=[{number:1,title:'Đầu tiên',plan:'Cảnh mở đầu',status:'planned',content:'',wordCount:0,issues:[]}];store.save(p);const expected=context(p,1),events=[],calls=[];
 const engine=new Engine(store,{generate:async(_,input,options)=>{const data=JSON.parse(input);calls.push(data.task);assert.deepEqual(data.context,expected);if(data.task.startsWith('Viết chương')){for(let i=0;i<500;i++)options.onDelta('x');return {text:'x'.repeat(500),usage:{input:1,output:1}};}return {text:JSON.stringify({approved:true,issues:[],summary:'Cảnh mở đầu',facts:[],stateUpdates:{},openThreads:[]}),usage:{input:1,output:1}};}},e=>events.push(e));
 await engine.run(p.id,1);assert.equal(calls.length,2);assert.match(calls[0],/^Viết chương/);assert.match(calls[1],/^Kiểm tra/);const deltas=events.filter(e=>e.type==='delta');assert.equal(deltas.length,1);assert.equal(deltas.map(e=>e.delta).join(''),'x'.repeat(500));const saved=store.load(p.id);assert.equal(saved.chapters[0].status,'approved');assert.equal(saved.memories.length,1);assert.equal(saved.job.completed,1);
 }finally{f.done();}
});
