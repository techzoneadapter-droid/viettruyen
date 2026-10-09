const {keyField,apiBase}=require('./providers.cjs');
const {setTimeout:delay}=require('node:timers/promises');
const {limitScope,retryDelay,responseLimits}=require('./limits.cjs');
function parseJSON(text) {
  let value=text.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');
  try {return JSON.parse(value);} catch {}
  const first=value.indexOf('{'),last=value.lastIndexOf('}');
  if(first>=0&&last>first) return JSON.parse(value.slice(first,last+1));
  throw new Error('AI trả về dữ liệu không đúng định dạng. Dữ liệu truyện vẫn được giữ lại.');
}
async function readSSE(response,onEvent) {
  let buffer='';const decoder=new TextDecoder();
  const frame=value=>{const data=value.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');if(data&&data!=='[DONE]')onEvent(JSON.parse(data));};
  for await(const chunk of response.body){
    buffer+=decoder.decode(chunk,{stream:true});buffer=buffer.replace(/\r\n/g,'\n');
    let index;while((index=buffer.indexOf('\n\n'))>=0){frame(buffer.slice(0,index));buffer=buffer.slice(index+2);}
  }
  buffer+=decoder.decode();if(buffer.trim())frame(buffer.replace(/\r\n/g,'\n'));
}
function streamError(event){
 const detail=event.response?.error||event.error||event,code=String(detail.code||event.type||'');
 const reason=event.response?.incomplete_details?.reason;
 const quota=/quota|billing|usage_limit|user_not_eligible|credit|spend_limit/i.test(code);
 const temporary=!quota&&/^(server_is_overloaded|server_error|internal_server_error|rate_limit_exceeded|slow_down|temporarily_unavailable|timeout)$/.test(code);
 const e=new Error(quota?'Hết hạn mức AI hoặc quota tài khoản. Nội dung đã lưu.':temporary?'Máy chủ AI đang quá tải hoặc giới hạn tốc độ tạm thời. Nội dung đã lưu.':reason==='max_output_tokens'?'AI chưa hoàn tất: đã chạm giới hạn token; tăng token tối đa hoặc chọn Tự động trong Kết nối AI':'AI chưa hoàn tất nội dung. Bản nháp chưa được duyệt.');
 e.retryable=temporary;e.quota=quota;e.code=code;return e;
}

class AI {
  constructor(settings,auth,fetcher=(...args)=>fetch(...args),{sleep=delay,random=Math.random,onLimits=()=>{}}={}) {this.settings=settings;this.auth=auth;this.fetch=fetcher;this.sleep=sleep;this.random=random;this.notBefore=0;this.onLimits=onLimits;}
  async models() {
    const s=this.settings();
    if(s.provider==='gemini') {
      if(!s.geminiKey) throw new Error('Hãy nhập Gemini API key.');
      const res=await this.fetch('https://generativelanguage.googleapis.com/v1beta/models',{headers:{'x-goog-api-key':s.geminiKey},signal:AbortSignal.timeout(30000)});
      if(!res.ok) throw new Error('Không lấy được model Gemini: HTTP '+res.status);
      const v=await res.json(); return (v.models||[]).filter(m=>m.supportedGenerationMethods?.includes('generateContent')).map(m=>({id:m.name.replace('models/',''),name:m.displayName||m.name}));
    }
    const token=s.provider==='chatgpt'?await this.auth.access():s[keyField(s.provider)];
    if(!token) throw new Error('Hãy kết nối tài khoản hoặc nhập API key.');
    const res=await this.fetch(apiBase(s.provider)+'/models',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});
    if(!res.ok) throw new Error('Không lấy được model: HTTP '+res.status);
    const v=await res.json(); return v.models ? v.models.filter(m=>m.visibility==='list').map(m=>({id:m.slug,name:m.display_name})): (v.data||[]).map(m=>({id:m.id,name:m.id}));
  }
  async generate(instructions,input,{signal,onDelta=()=>{},onRetry=()=>{},restartInterrupted=false,onInterrupted=()=>{},shouldPause=()=>false}={}) {
    const attempts=restartInterrupted?8:5;
    const paused=()=>{const e=new Error('Đã tạm dừng trong lúc chờ AI; các bước hoàn tất được giữ lại.');e.pauseRequested=true;return e;};
    const waitFor=async ms=>{if(!restartInterrupted){await this.sleep(ms,null,{signal});return;}let left=ms;while(left>0){if(shouldPause())throw paused();const step=Math.min(left,1000);await this.sleep(step,null,{signal});left-=step;}if(shouldPause())throw paused();};
    for(let attempt=0;attempt<attempts;attempt++){
      if(signal?.aborted)throw new DOMException('Đã dừng','AbortError');
      if(shouldPause())throw paused();
      if(this.notBefore>Date.now())await waitFor(this.notBefore-Date.now());
      let consumed=false,partial='';
      try{return await this.generateOnce(instructions,input,{signal,onDelta:delta=>{consumed=true;partial+=delta;onDelta(delta);}});}
      catch(e){
        if(partial)e.partialText=partial;
        const temporary=!e.quota&&(e.retryable||e.name==='TypeError'||e.name==='TimeoutError');
        if(signal?.aborted||(consumed&&!restartInterrupted)||!temporary||attempt===attempts-1)throw e;
        const wait=e.retryAfter??(Math.min(120000,5000*2**attempt)+Math.floor(this.random()*1500));
        if(wait>180000)throw e;
        if(partial)await onInterrupted({text:partial,attempt:attempt+1});
        if(shouldPause())throw paused();
        this.notBefore=Math.max(this.notBefore,Date.now()+wait);
        onRetry({attempt:attempt+1,max:attempts-1,wait,message:`AI quá tải, mất kết nối hoặc giới hạn tạm thời; chờ ${Math.ceil(wait/1000)} giây rồi thử lại ${attempt+1}/${attempts-1}.`});
      }
    }
  }
  async generateOnce(instructions,input,{signal,onDelta=()=>{}}={}) {
    const s=this.settings(); if(!s.model) throw new Error('Chọn model trong Kết nối AI trước khi viết.');
      const scope=limitScope(s,this.auth);
      const budget=Number(s.maxOutputTokens)||0;
      let response;
      const timeout=AbortSignal.timeout(15*60*1000);
      const combined=signal?AbortSignal.any([signal,timeout]):timeout;
      if(s.provider==='gemini') {
        if(!s.geminiKey) throw new Error('Chưa có Gemini API key.');
        response=await this.fetch('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(s.model)+':generateContent',{
          method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':s.geminiKey},signal:combined,
          body:JSON.stringify({systemInstruction:{parts:[{text:instructions}]},contents:[{role:'user',parts:[{text:input}]}],...(budget>0?{generationConfig:{maxOutputTokens:budget}}:{})})
        });
      } else {
        let token=s.provider==='chatgpt'?await this.auth.access():s[keyField(s.provider)];
        if(!token) throw new Error('Chưa kết nối AI.');
        const send=accessToken=>this.fetch(apiBase(s.provider)+'/responses',{method:'POST',headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},signal:combined,body:JSON.stringify({model:s.model,instructions,input:[{role:'user',content:input}],store:false,stream:true,...(budget>0?{max_output_tokens:budget}:{})})});
        response=await send(token);
        if(response.status===401&&s.provider==='chatgpt'){
          this.onLimits(scope,s,{...responseLimits(response),status:'error'});
          if(combined.aborted)throw combined.reason;
          await response.body?.cancel();
          token=await this.auth.access({force:true,rejectedToken:token});
          response=await send(token);
        }
      }
      const observed=responseLimits(response);
      if(!response.ok) {
        let code='';try{const v=await response.json();code=v.error?.code||v.error?.status||'';}catch{}
        const quota=/quota|billing|usage_limit|user_not_eligible|credit|spend_limit/i.test(String(code));
        const retryAfter=retryDelay(response.headers)??undefined;
        const temporary=!quota&&([408,409,500,502,503,504].includes(response.status)||(response.status===429&&(/rate_limit|slow_down/i.test(String(code))||Number.isFinite(retryAfter))));
        this.onLimits(scope,s,{...observed,status:quota?'quota_exhausted':response.status===429?'limited':'error'});
        const e=new Error(response.status===429?(temporary?'AI giới hạn tốc độ tạm thời. Dữ liệu đã lưu.':'Hết hạn mức AI hoặc quota tài khoản. Tạm dừng; tiếp tục khi hạn mức trở lại.'):`AI trả HTTP ${response.status}. ${temporary?'Máy chủ tạm thời không sẵn sàng.':'Kiểm tra quyền tài khoản, API key và model.'}`);
        e.retryable=temporary;e.quota=quota||(response.status===429&&!temporary);e.status=response.status;if(Number.isFinite(retryAfter))e.retryAfter=retryAfter;throw e;
      }
      this.onLimits(scope,s,observed);
      if(s.provider==='gemini') {
        const v=await response.json(),candidate=v.candidates?.[0];
        if(candidate?.finishReason!=='STOP') throw new Error('Gemini chưa hoàn tất nội dung: '+(candidate?.finishReason==='MAX_TOKENS'?'đã chạm giới hạn token; tăng token tối đa hoặc chọn Tự động trong Kết nối AI':candidate?.finishReason||v.promptFeedback?.blockReason||'không có nội dung'));
        const text=(candidate.content?.parts||[]).filter(x=>!x.thought).map(x=>x.text||'').join('');
        if(!text.trim()) throw new Error('AI trả về nội dung rỗng.'); onDelta(text);
        return {text,usage:{input:v.usageMetadata?.promptTokenCount||0,output:v.usageMetadata?.candidatesTokenCount||0}};
      }
      let text='',complete=false,usage={input:0,output:0};
      await readSSE(response,event=>{
        if(event.type==='response.output_text.delta') {text+=event.delta;onDelta(event.delta);}
        if(event.type==='response.completed') {complete=true;usage={input:event.response?.usage?.input_tokens||0,output:event.response?.usage?.output_tokens||0};}
        if(['response.failed','response.incomplete','error'].includes(event.type)){const e=streamError(event);this.onLimits(scope,s,{...observed,status:e.quota?'quota_exhausted':/rate_limit|slow_down/.test(e.code)?'limited':'error'});throw e;}
      });
      if(!complete||!text.trim()){const e=new Error('Kết nối kết thúc trước khi AI viết xong. Bản nháp chưa được duyệt.');e.retryable=true;this.onLimits(scope,s,{...observed,status:'error'});throw e;}
      return {text,usage};
  }
}
module.exports={AI,readSSE,parseJSON};
