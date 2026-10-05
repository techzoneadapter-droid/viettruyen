const test=require('node:test'),assert=require('node:assert/strict');
const {AI}=require('../desktop/core/ai.cjs');const {LimitTracker,limitScope,responseLimits,retryDelay}=require('../desktop/core/limits.cjs');
const stream=(headers={})=>new Response('data: {"type":"response.output_text.delta","delta":"Đã kết nối"}\n\ndata: {"type":"response.completed","response":{"usage":{"input_tokens":2,"output_tokens":3}}}\n\n',{headers});
test('real limits preserve zero, distinguish missing data and honor Retry-After without inventing balances',()=>{
 const now=Date.UTC(2026,9,5),v=responseLimits(stream({'x-ratelimit-limit-requests':'100','x-ratelimit-remaining-requests':'0','x-ratelimit-reset-requests':'1s','x-ratelimit-limit-tokens':'bad','x-ratelimit-remaining-tokens':'','retry-after':'5'}),now);
 assert.deepEqual(v.requests,{limit:100,remaining:0,reset:'1s'});assert.deepEqual(v.tokens,{limit:null,remaining:null,reset:null});assert.equal(v.retryAt,new Date(now+5000).toISOString());assert.equal(retryDelay(new Headers({'retry-after':'invalid'}),now),null);assert.equal(retryDelay(new Headers({'retry-after':new Date(now+7000).toUTCString()}),now),7000);
});
test('limits are isolated by provider, model and credential; latest missing headers clear stale counts',()=>{
 const tracker=new LimitTracker(),s={provider:'openai',model:'a',openaiKey:'private-key'};tracker.record(limitScope(s),s,responseLimits(stream({'x-ratelimit-remaining-tokens':'42'})));
 assert.equal(tracker.snapshot(s).tokens.remaining,42);for(const other of [{...s,model:'b'},{...s,openaiKey:'another-key'},{...s,provider:'gemini',geminiKey:s.openaiKey}])assert.equal(tracker.snapshot(other).status,'unknown');
 const copy=tracker.snapshot(s);copy.tokens.remaining=999;assert.equal(tracker.snapshot(s).tokens.remaining,42);assert.ok(!JSON.stringify(copy).includes('private-key'));
 tracker.record(limitScope(s),s,responseLimits(stream()));assert.equal(tracker.snapshot(s).tokens.remaining,null);assert.equal(new LimitTracker().snapshot(s).status,'unknown');
 const auth=subject=>({vault:{get:()=>({subject})},status:()=>({email:'same@example.com'})});assert.notEqual(limitScope({provider:'chatgpt',model:'a'},auth('one')),limitScope({provider:'chatgpt',model:'a'},auth('two')));
});
test('token budgets use provider parameters, while automatic leaves existing requests unchanged',async()=>{
 for(const provider of ['openai','chatgpt','gemini'])for(const maxOutputTokens of [0,4096]){
  const s={provider,model:'fixture',openaiKey:'key',geminiKey:'key',maxOutputTokens};let body;const reports=[];
  const ai=new AI(()=>s,{access:async()=> 'token',status:()=>({email:'fixture'})},async(_,options)=>{body=JSON.parse(options.body);return provider==='gemini'?Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:'Đã kết nối'}]}}]}):stream({'x-ratelimit-remaining-requests':'8'});},{onLimits:(scope,settings,data)=>reports.push({scope,settings,data})});
  assert.equal((await ai.generate('Test','Story')).text,'Đã kết nối');assert.equal(reports.length,1);assert.equal(reports[0].data.status,'accepted');
  if(provider==='gemini')assert.equal(body.generationConfig?.maxOutputTokens,maxOutputTokens||undefined);else assert.equal(body.max_output_tokens,maxOutputTokens||undefined);
 }
});
test('quota errors report exhaustion and stop; temporary errors retain retry timestamp and recover',async()=>{
 const s={provider:'openai',model:'a',openaiKey:'key'},reports=[];let calls=0;
 const quota=new AI(()=>s,{},async()=>{calls++;return Response.json({error:{code:'insufficient_quota'}},{status:429});},{onLimits:(_,__,v)=>reports.push(v)});
 await assert.rejects(quota.generate('Test','Story'),/Hết hạn mức/);assert.equal(calls,1);assert.equal(reports[0].status,'quota_exhausted');assert.equal(reports[0].tokens.remaining,null);
 calls=0;reports.length=0;const temporary=new AI(()=>s,{},async()=>++calls===1?Response.json({error:{code:'rate_limit_exceeded'}},{status:429,headers:{'retry-after':'0','x-ratelimit-remaining-requests':'0'}}):stream(),{sleep:async()=>{},onLimits:(_,__,v)=>reports.push(v)});
 await temporary.generate('Test','Story');assert.equal(reports[0].status,'limited');assert.ok(reports[0].retryAt);assert.equal(reports[0].requests.remaining,0);assert.equal(reports.at(-1).status,'accepted');assert.equal(reports.at(-1).requests.remaining,null);
});
test('in-flight responses remain attributed to the original key when current settings change',async()=>{
 let saved={provider:'openai',model:'a',openaiKey:'old'},release;const gate=new Promise(r=>release=r),tracker=new LimitTracker();
 const ai=new AI(()=>saved,{},async()=>{await gate;return stream({'x-ratelimit-remaining-tokens':'9'});},{onLimits:(scope,s,data)=>tracker.record(scope,s,data)});
 const task=ai.generate('Test','Story');saved={...saved,openaiKey:'new'};release();await task;assert.equal(tracker.snapshot(saved).status,'unknown');assert.equal(tracker.snapshot({...saved,openaiKey:'old'}).tokens.remaining,9);
});
test('truncated output from either provider is rejected with token setting guidance',async()=>{
 for(const provider of ['openai','gemini']){
  const ai=new AI(()=>({provider,model:'a',openaiKey:'key',geminiKey:'key',maxOutputTokens:10}),{},async()=>provider==='gemini'?Response.json({candidates:[{finishReason:'MAX_TOKENS'}]}):new Response('data: {"type":"response.output_text.delta","delta":"Draft"}\n\ndata: {"type":"response.incomplete","response":{"incomplete_details":{"reason":"max_output_tokens"}}}\n\n'));
  await assert.rejects(ai.generate('Test','Story'),/tăng token tối đa/);
 }
});
