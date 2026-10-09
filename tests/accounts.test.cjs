const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Accounts}=require('../desktop/core/accounts.cjs');const {Store}=require('../desktop/core/store.cjs');const {Engine}=require('../desktop/core/engine.cjs');const {JobQueue}=require('../desktop/core/queue.cjs');
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(){const data=new Map(),vault={get:key=>data.get(key),set:(key,value)=>data.set(key,structuredClone(value))},settings=()=>({provider:'openai',model:'primary-model',openaiKey:'primary-secret'}),auth={status:()=>({connected:false,email:''}),vault};return {data,vault,accounts:new Accounts(vault,settings,auth,async()=>{})};}
const extra=(accounts,values={})=>accounts.save({name:'Tài khoản phụ',provider:'openai',model:'second-model',openaiKey:'second-secret',enabled:true,maxParallel:2,...values});
test('account profiles keep keys private, reject duplicate keys and persist configuration',()=>{
 const f=fixture(),id=extra(f.accounts);const pub=f.accounts.list();assert.equal(pub.accounts.length,2);assert.ok(!JSON.stringify(pub).includes('secret'));assert.equal(pub.enabled,false);assert.equal(f.accounts.get().maxParallel,16);
 f.accounts.configure({enabled:true,primarySlots:2});assert.equal(f.accounts.get().maxParallel,2);assert.throws(()=>extra(f.accounts,{openaiKey:'primary-secret'}),/đã có/);assert.throws(()=>extra(f.accounts,{openaiKey:'second-secret'}),/đã có/);
 f.accounts.save({...f.accounts.get(id),name:'Đổi tên',openaiKey:undefined});assert.equal(f.accounts.get(id).openaiKey,'second-secret');assert.equal(new Accounts(f.vault,f.accounts.settings,f.accounts.auth,async()=>{}).list().enabled,true);
});
test('equal capacities distribute evenly, respect pins, disabled/busy/quota states and available slots',()=>{
 const {accounts}=fixture(),id=extra(accounts);accounts.configure({enabled:true,primarySlots:2});const items=[],running=new Map();
 for(let i=0;i<4;i++){const item={id:String(i)},selected=accounts.allocate(item,running,items);Object.assign(item,selected);items.push(item);running.set(item.id,{});}assert.equal(items.filter(x=>x.accountId===id).length,2);assert.equal(accounts.allocate({id:'five'},running,items),null);
 running.clear();accounts.blocked.add('primary');assert.equal(accounts.allocate({id:'new'},running,items).accountId,id);assert.equal(accounts.allocate({accountId:'primary'},running,items).accountId,id);accounts.busy.add(id);assert.equal(accounts.allocate({id:'new'},running,items),null);accounts.busy.clear();accounts.save({...accounts.get(id),enabled:false});assert.equal(accounts.allocate({accountId:id},running,items),null);
});
test('each ChatGPT profile has isolated OAuth tokens and host identity, without replacing primary credentials',async()=>{
 const f=fixture(),a=extra(f.accounts,{provider:'chatgpt',model:'chat-model',openaiKey:undefined}),b=extra(f.accounts,{provider:'chatgpt',name:'ChatGPT khác',model:'chat-model',openaiKey:undefined});
 for(const [id,token] of [[a,'token-one'],[b,'token-two']]){const auth=f.accounts.authFor(id);auth.vault.set('chatgpt',{subject:id,email:id+'@example.com',access_token:token,scopes:['chatgpt.tokens.use.direct'],expires_at:Date.now()+999999});auth.vault.set('hostId','host-'+id);assert.equal(await auth.access(),token);assert.equal(auth.vault.get('hostId'),'host-'+id);}
 assert.equal(f.vault.get('chatgpt'),undefined);f.accounts.authFor(a).logout();assert.equal(f.accounts.authFor(a).status().connected,false);assert.equal(await f.accounts.authFor(b).access(),'token-two');assert.ok(!JSON.stringify(f.accounts.list()).includes('token-two'));
});
test('quota from one account pauses its story while other account completes all unassigned stories',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'viet-pool-'));try{
  const store=new Store(root),{accounts}=fixture(),id=extra(accounts,{maxParallel:1});accounts.configure({enabled:true,primarySlots:1});
  const projects=Array.from({length:5},(_,i)=>{const p=store.create({title:'Truyện '+i,genre:'Phiêu lưu',premise:'Hành trình',style:'Tự nhiên',target:1,words:300});p.bible='Hồ sơ';p.arcs=[{title:'Quyển',start:1,end:1,summary:'Hành trình'}];return store.save(p);});
  const used=[];const queue=new JobQueue(store,(emit,item)=>{const ai={generate:async(_,input)=>{used.push(item.accountId);await tick();if(item.accountId==='primary'){const e=new Error('Hết quota');e.quota=true;throw e;}const v=JSON.parse(input);let text;if(v.task.startsWith('Lập chính xác'))text=JSON.stringify({chapters:[{number:1,title:'Chương',plan:'Một cảnh'}]});else if(v.task.startsWith('Kiểm tra'))text=JSON.stringify({approved:true,issues:[],summary:'Cảnh mới',facts:[],stateUpdates:{},openThreads:[]});else text='Nội dung '+v.context.title;return {text,usage:{input:1,output:1}};}};return new Engine(store,ai,emit);},()=>{},{allocate:(item,running,items)=>accounts.allocate(item,running,items),onBlocked:(item,q)=>{accounts.blocked.add(item.accountId);q.pauseAccount(item.accountId);}});
  queue.setLimit(2);for(const p of projects)queue.enqueue(p.id,1);for(let i=0;i<1000&&queue.busy();i++)await tick();assert.equal(queue.busy(),false);assert.equal(used.filter(x=>x==='primary').length,1);assert.equal(store.load(projects[0].id).job.blocked,true);
  for(const p of projects.slice(1)){const saved=store.load(p.id);assert.equal(saved.chapters[0].status,'approved');assert.equal(saved.job.accountId,id);}assert.equal(queue.snapshot().items.length,1);assert.equal(queue.snapshot().items[0].accountId,'primary');
  const restored=new JobQueue(store,()=>{},()=>{},{allocate:(item,running,items)=>accounts.allocate(item,running,items)});assert.equal(restored.snapshot().items[0].accountId,'primary');restored.remove(projects[0].id);assert.equal(store.load(projects[0].id).job.accountId,undefined);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
