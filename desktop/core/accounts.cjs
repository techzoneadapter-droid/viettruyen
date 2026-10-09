const {keyField,retainKeys}=require('./providers.cjs');
const {randomUUID}=require('node:crypto');const {ChatGPTAuth}=require('./auth.cjs');const {LimitTracker}=require('./limits.cjs');
const PRIMARY='primary';
class Accounts{
 constructor(vault,settings,auth,openExternal,limits=new LimitTracker()) {Object.assign(this,{vault,settings,auth,openExternal,limits,auths:new Map(),blocked:new Set(),cursor:0,busy:new Set()});}
 config(){return {enabled:false,primarySlots:2,...(this.vault.get('accountPool')||{})};}
 profiles(){return this.vault.get('aiAccounts')||[];}
 get(id=PRIMARY){if(id===PRIMARY)return {...this.settings(),id,name:'Kết nối chính',enabled:true,maxParallel:this.config().enabled?this.config().primarySlots:16};const p=this.profiles().find(p=>p.id===id);if(!p)throw new Error('Tài khoản AI không còn tồn tại.');return {...p};}
 authFor(id=PRIMARY){if(id===PRIMARY)return this.auth;if(!this.auths.has(id)){this.get(id);const vault={get:key=>this.get(id)[key],set:(key,value)=>{const items=this.profiles().map(p=>p.id===id?{...p,[key]:value}:p);this.vault.set('aiAccounts',items);}};this.auths.set(id,new ChatGPTAuth(vault,this.openExternal));}return this.auths.get(id);}
 ready(p){return !!p.model&&(p.provider==='chatgpt'?this.authFor(p.id).status().connected:p.provider==='gemini'?!!p.geminiKey:!!p[keyField(p.provider)]);}
 list(){return {enabled:this.config().enabled,primarySlots:this.config().primarySlots,accounts:[this.get(),...this.profiles()].map(p=>({id:p.id,name:p.name,provider:p.provider,model:p.model,maxOutputTokens:p.maxOutputTokens||0,enabled:p.enabled,maxParallel:p.maxParallel,ready:this.ready(p),blocked:this.blocked.has(p.id),hasGeminiKey:!!p.geminiKey,hasOpenaiKey:!!p.openaiKey,hasExperientialKey:!!p.experientialKey,chatgpt:this.authFor(p.id).status(),limits:this.limits.snapshot(p,this.authFor(p.id))}))};}
 save(input){const items=this.profiles();let p=input.id?this.get(input.id):{id:randomUUID(),enabled:true,maxParallel:2,maxOutputTokens:0};if(p.id===PRIMARY)throw new Error('Sửa kết nối chính ở phần phía trên.');if(!input.id&&items.length>=15)throw new Error('Tối đa 15 tài khoản bổ sung.');p={...p,...input,id:p.id,...retainKeys(p,input)};if(p.provider!=='chatgpt'){const key=keyField(p.provider);if(p[key]&&[this.get(),...items].some(x=>x.id!==p.id&&x.provider===p.provider&&x[key]===p[key]))throw new Error('API key này đã có trong một kết nối khác. Nhiều bản sao của cùng key không thêm hạn mức.');}this.vault.set('aiAccounts',items.filter(x=>x.id!==p.id).concat(p));this.blocked.delete(p.id);return p.id;}
 remove(id){if(id===PRIMARY)throw new Error('Không xóa kết nối chính.');this.get(id);this.auths.get(id)?.cancel();this.auths.delete(id);this.blocked.delete(id);this.vault.set('aiAccounts',this.profiles().filter(p=>p.id!==id));}
 configure(input){this.vault.set('accountPool',{...this.config(),...input});}
 available(){const all=this.config().enabled?[this.get(),...this.profiles()].filter(p=>p.enabled):[this.get()];return all.filter(p=>this.ready(p)&&!this.blocked.has(p.id)&&!this.busy.has(p.id));}
 allocate(item,running,items){
  const counts=new Map();for(const other of items)if(running.has(other.id))counts.set(other.accountId||PRIMARY,(counts.get(other.accountId||PRIMARY)||0)+1);
  if(item.accountId){let p;try{p=this.get(item.accountId);}catch{return null;}if(this.busy.has(p.id)||this.blocked.has(p.id)||!this.ready(p)||(p.id!==PRIMARY&&!p.enabled)||(counts.get(p.id)||0)>=p.maxParallel)return null;return {accountId:p.id,accountName:p.name,accountModel:item.accountModel||p.model,accountProvider:item.accountProvider||p.provider};}
  const all=this.available().filter(p=>(counts.get(p.id)||0)<p.maxParallel);if(!all.length)return null;
  const lowest=Math.min(...all.map(p=>(counts.get(p.id)||0)/p.maxParallel));const tied=all.filter(p=>(counts.get(p.id)||0)/p.maxParallel===lowest);const p=tied[this.cursor++%tied.length];return {accountId:p.id,accountName:p.name,accountModel:p.model,accountProvider:p.provider};
 }
}
module.exports={Accounts,PRIMARY};
