const {createHash}=require('node:crypto');
function limitScope(settings,auth){
 const identity=settings.provider==='chatgpt'?(auth?.vault?.get('chatgpt')?.subject||auth?.status?.().email||''):settings.provider==='gemini'?settings.geminiKey:settings.openaiKey;
 return createHash('sha256').update(JSON.stringify([settings.provider,settings.model,identity||''])).digest('hex');
}
function retryDelay(headers,now=Date.now()){
 const raw=headers.get('retry-after');if(raw===null||!raw.trim())return null;
 const seconds=Number(raw);if(Number.isFinite(seconds)&&seconds>=0&&seconds*1000<=8640000000000000-now)return seconds*1000;
 const date=Date.parse(raw);return Number.isFinite(date)?Math.max(0,date-now):null;
}
function responseLimits(response,now=Date.now()){
 const numeric=name=>{const raw=response.headers.get(name);if(raw===null||!raw.trim())return null;const value=Number(raw);return Number.isFinite(value)&&value>=0?value:null;};
 const window=kind=>({limit:numeric(`x-ratelimit-limit-${kind}`),remaining:numeric(`x-ratelimit-remaining-${kind}`),reset:response.headers.get(`x-ratelimit-reset-${kind}`)?.slice(0,64)||null});
 const retry=retryDelay(response.headers,now);
 return {observedAt:new Date(now).toISOString(),httpStatus:response.status,status:response.ok?'accepted':response.status===429?'limited':'error',requests:window('requests'),tokens:window('tokens'),projectTokens:window('project-tokens'),retryAt:retry===null?null:new Date(now+retry).toISOString()};
}
class LimitTracker{
 constructor(){this.records=new Map();}
 record(scope,settings,data){this.records.delete(scope);this.records.set(scope,{provider:settings.provider,model:settings.model,...data});if(this.records.size>100)this.records.delete(this.records.keys().next().value);}
 snapshot(settings,auth){const v=this.records.get(limitScope(settings,auth));return v?structuredClone(v):{provider:settings.provider,model:settings.model,status:'unknown',observedAt:null};}
}
module.exports={limitScope,retryDelay,responseLimits,LimitTracker};
