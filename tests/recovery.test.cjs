const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {AI,readSSE}=require('../desktop/core/ai.cjs'),{Engine}=require('../desktop/core/engine.cjs'),{Store}=require('../desktop/core/store.cjs');
const events=values=>new Response(values.map(v=>'data: '+JSON.stringify(v)+'\n\n').join(''));
const done=text=>events([{type:'response.output_text.delta',delta:text},{type:'response.completed',response:{usage:{input_tokens:1,output_tokens:1}}}]);
const fail=(code,partial='')=>events([...(partial?[{type:'response.output_text.delta',delta:partial}]:[]),{type:'response.failed',response:{error:{code}}}]);
const settings=()=>({provider:'openai',model:'fixture',openaiKey:'fixture'});
test('SSE overload retries before output and publishes error status instead of accepted status',async()=>{
 let calls=0;const status=[],retry=[];const ai=new AI(settings,{},async()=>++calls===1?fail('server_is_overloaded'):done('Truyện hoàn chỉnh'),{sleep:async()=>{},random:()=>0,onLimits:(_,__,v)=>status.push(v.status)});
 assert.equal((await ai.generate('Write','Story',{onRetry:v=>retry.push(v)})).text,'Truyện hoàn chỉnh');assert.equal(calls,2);assert.deepEqual(status,['accepted','error','accepted']);assert.equal(retry[0].attempt,1);
});
test('writer recovers a partial streamed chapter, saves interrupted draft before retry and approves only complete replacement',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'viet-recovery-'));try{
  const store=new Store(root),p=store.create({title:'Tiếp tục viết',genre:'Phiêu lưu',premise:'Hành trình',style:'Tự nhiên',target:2,words:300});p.bible='Hồ sơ';p.arcs=[{title:'Quyển',start:1,end:2,summary:'Hành trình'}];p.chapters=[1,2].map(number=>({number,title:'Chương '+number,plan:'Một cảnh',content:'',status:'planned',wordCount:0,issues:[]}));store.save(p);let writes=0,reviews=0,savedAtWait=false;const retry=[];
  const ai=new AI(settings,{},async(_,options)=>{const data=JSON.parse(JSON.parse(options.body).input[0].content.split('\nLần trước')[0]);if(data.task.startsWith('Viết chương')){writes++;if(writes>1)ai.notBefore=0;return writes===1?fail('server_is_overloaded','Bản ngắt chưa hoàn thành'):done('Bản hoàn chỉnh '+data.context.title);}reviews++;assert.ok(!data.content.includes('Bản ngắt'));return done(JSON.stringify({approved:true,issues:[],summary:'Cảnh hoàn chỉnh',facts:[],stateUpdates:{},openThreads:[]}));},{sleep:async()=>{const saved=store.load(p.id);assert.equal(saved.chapters[0].interruptedDraft,'Bản ngắt chưa hoàn thành');assert.equal(saved.chapters[0].content,'');assert.equal(saved.memories.length,0);savedAtWait=true;},random:()=>0});
  const engine=new Engine(store,ai,e=>{if(e.type==='phase'&&e.message.includes('thử lại'))retry.push(e);});await engine.run(p.id,2);const saved=store.load(p.id);assert.equal(savedAtWait,true);assert.equal(writes,3);assert.equal(reviews,2);assert.equal(saved.job.status,'completed');assert.equal(saved.job.completed,2);assert.equal(saved.memories.length,2);assert.ok(saved.chapters.every(c=>c.status==='approved'&&!c.content.includes('Bản ngắt')&&!c.interruptedDraft));assert.equal(retry.length,1);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('closed stream with partial output can restart explicitly; default callers still never replay partial output',async()=>{
 for(const recovery of [false,true]){let calls=0,checkpoint='';const ai=new AI(settings,{},async()=>++calls===1?new Response('data: {"type":"response.output_text.delta","delta":"Dở"}\n\n'):done('Xong'),{sleep:async()=>{},random:()=>0});const task=ai.generate('Write','Story',{restartInterrupted:recovery,onInterrupted:v=>checkpoint=v.text});if(recovery){assert.equal((await task).text,'Xong');assert.equal(checkpoint,'Dở');assert.equal(calls,2);}else{await assert.rejects(task,/trước khi AI viết xong/);assert.equal(calls,1);}}
});
test('recovery is bounded, respects long Retry-After and never retries quota, token cap or content filter',async()=>{
 let calls=0;const ai=new AI(settings,{},async()=>{calls++;return fail('server_is_overloaded');},{sleep:async()=>{},random:()=>0});await assert.rejects(ai.generate('Write','Story',{restartInterrupted:true}),/quá tải/);assert.equal(calls,8);
 for(const code of ['insufficient_quota','content_filter']){let count=0;const client=new AI(settings,{},async()=>{count++;return fail(code,'Dở');},{sleep:async()=>{assert.fail('Must not wait');}});await assert.rejects(client.generate('Write','Story',{restartInterrupted:true}));assert.equal(count,1);}
 let count=0;const client=new AI(settings,{},async()=>{count++;return Response.json({error:{code:'rate_limit_exceeded'}},{status:429,headers:{'retry-after':'600'}});});await assert.rejects(client.generate('Write','Story',{restartInterrupted:true}));assert.equal(count,1);
});
test('pause during recovery wait is responsive and stops any further AI request',async()=>{
 let calls=0,paused=false,sleeps=0;const ai=new AI(settings,{},async()=>{calls++;return fail('server_is_overloaded');},{sleep:async ms=>{assert.ok(ms<=1000);sleeps++;paused=true;},random:()=>0});await assert.rejects(ai.generate('Write','Story',{restartInterrupted:true,shouldPause:()=>paused}),e=>e.pauseRequested===true);assert.equal(calls,1);assert.equal(sleeps,1);
});
test('SSE processes the final complete event without requiring a trailing blank line',async()=>{
 const out=[];await readSSE(new Response('data: {"type":"response.completed"}'),v=>out.push(v));assert.equal(out[0].type,'response.completed');
});
