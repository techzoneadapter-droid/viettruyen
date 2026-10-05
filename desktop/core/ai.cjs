const {setTimeout:delay}=require('node:timers/promises');
function parseJSON(text) {
  let value=text.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');
  try {return JSON.parse(value);} catch {}
  const first=value.indexOf('{'),last=value.lastIndexOf('}');
  if(first>=0&&last>first) return JSON.parse(value.slice(first,last+1));
  throw new Error('AI trả về dữ liệu không đúng định dạng. Dữ liệu truyện vẫn được giữ lại.');
}
async function readSSE(response,onEvent) {
  let buffer=''; const decoder=new TextDecoder();
  for await(const chunk of response.body) {
    buffer+=decoder.decode(chunk,{stream:true}); buffer=buffer.replace(/\r\n/g,'\n');
    let index; while((index=buffer.indexOf('\n\n'))>=0) {
      const frame=buffer.slice(0,index); buffer=buffer.slice(index+2);
      const data=frame.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');
      if(data && data!=='[DONE]') onEvent(JSON.parse(data));
    }
  }
}
class AI {
  constructor(settings,auth,fetcher=fetch,{sleep=delay,random=Math.random}={}) {this.settings=settings;this.auth=auth;this.fetch=fetcher;this.sleep=sleep;this.random=random;this.notBefore=0;}
  async models() {
    const s=this.settings();
    if(s.provider==='gemini') {
      if(!s.geminiKey) throw new Error('Hãy nhập Gemini API key.');
      const res=await this.fetch('https://generativelanguage.googleapis.com/v1beta/models',{headers:{'x-goog-api-key':s.geminiKey},signal:AbortSignal.timeout(30000)});
      if(!res.ok) throw new Error('Không lấy được model Gemini: HTTP '+res.status);
      const v=await res.json(); return (v.models||[]).filter(m=>m.supportedGenerationMethods?.includes('generateContent')).map(m=>({id:m.name.replace('models/',''),name:m.displayName||m.name}));
    }
    const token=s.provider==='chatgpt'?await this.auth.access():s.openaiKey;
    if(!token) throw new Error('Hãy kết nối tài khoản hoặc nhập API key.');
    const res=await this.fetch('https://api.openai.com/v1/models',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});
    if(!res.ok) throw new Error('Không lấy được model: HTTP '+res.status);
    const v=await res.json(); return v.models ? v.models.filter(m=>m.visibility==='list').map(m=>({id:m.slug,name:m.display_name})): (v.data||[]).map(m=>({id:m.id,name:m.id}));
  }
  async generate(instructions,input,{signal,onDelta=()=>{},onRetry=()=>{}}={}) {
    for(let attempt=0;attempt<5;attempt++){
      if(signal?.aborted)throw new DOMException('Đã dừng','AbortError');
      if(this.notBefore>Date.now())await this.sleep(this.notBefore-Date.now(),null,{signal});
      let consumed=false,partial='';
      try{return await this.generateOnce(instructions,input,{signal,onDelta:delta=>{consumed=true;partial+=delta;onDelta(delta);}});}
      catch(e){
        if(partial)e.partialText=partial;
        if(signal?.aborted||consumed||!(e.retryable||e.name==='TypeError'||e.name==='TimeoutError')||attempt===4)throw e;
        const wait=e.retryAfter??(5000*2**attempt+Math.floor(this.random()*1000));
        if(wait>180000)throw e;
        this.notBefore=Math.max(this.notBefore,Date.now()+wait);
        onRetry({attempt:attempt+1,max:4,wait,message:`Lỗi kết nối hoặc giới hạn tạm thời; thử lại ${attempt+1}/4 sau ${Math.ceil(wait/1000)} giây.`});
      }
    }
  }
  async generateOnce(instructions,input,{signal,onDelta=()=>{}}={}) {
    const s=this.settings(); if(!s.model) throw new Error('Chọn model trong Kết nối AI trước khi viết.');
      let response;
      const timeout=AbortSignal.timeout(15*60*1000);
      const combined=signal?AbortSignal.any([signal,timeout]):timeout;
      if(s.provider==='gemini') {
        if(!s.geminiKey) throw new Error('Chưa có Gemini API key.');
        response=await this.fetch('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(s.model)+':generateContent',{
          method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':s.geminiKey},signal:combined,
          body:JSON.stringify({systemInstruction:{parts:[{text:instructions}]},contents:[{role:'user',parts:[{text:input}]}]})
        });
      } else {
        const token=s.provider==='chatgpt'?await this.auth.access():s.openaiKey;
        if(!token) throw new Error('Chưa kết nối AI.');
        response=await this.fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},signal:combined,body:JSON.stringify({model:s.model,instructions,input:[{role:'user',content:input}],store:false,stream:true})});
      }
      if(!response.ok) {
        let code='';try{const v=await response.json();code=v.error?.code||v.error?.status||'';}catch{}
        const quota=/quota|billing|usage_limit|user_not_eligible|credit|spend_limit/i.test(String(code));
        const retryHeader=response.headers.get('retry-after');
        const seconds=retryHeader===null?NaN:Number(retryHeader);
        const retryAfter=Number.isFinite(seconds)&&seconds>=0?seconds*1000:retryHeader?Math.max(0,Date.parse(retryHeader)-Date.now()):undefined;
        const temporary=!quota&&([408,409,500,502,503,504].includes(response.status)||(response.status===429&&(/rate_limit|slow_down/i.test(String(code))||Number.isFinite(retryAfter))));
        const e=new Error(response.status===429?(temporary?'AI giới hạn tốc độ tạm thời. Dữ liệu đã lưu.':'Hết hạn mức AI hoặc quota tài khoản. Tạm dừng; tiếp tục khi hạn mức trở lại.'):`AI trả HTTP ${response.status}. ${temporary?'Máy chủ tạm thời không sẵn sàng.':'Kiểm tra quyền tài khoản, API key và model.'}`);
        e.retryable=temporary;e.quota=response.status===429&&!temporary;e.status=response.status;if(Number.isFinite(retryAfter))e.retryAfter=retryAfter;throw e;
      }
      if(s.provider==='gemini') {
        const v=await response.json(),candidate=v.candidates?.[0];
        if(candidate?.finishReason!=='STOP') throw new Error('Gemini chưa hoàn tất nội dung: '+(candidate?.finishReason||v.promptFeedback?.blockReason||'không có nội dung'));
        const text=(candidate.content?.parts||[]).filter(x=>!x.thought).map(x=>x.text||'').join('');
        if(!text.trim()) throw new Error('AI trả về nội dung rỗng.'); onDelta(text);
        return {text,usage:{input:v.usageMetadata?.promptTokenCount||0,output:v.usageMetadata?.candidatesTokenCount||0}};
      }
      let text='',complete=false,usage={input:0,output:0};
      await readSSE(response,event=>{
        if(event.type==='response.output_text.delta') {text+=event.delta;onDelta(event.delta);}
        if(event.type==='response.completed') {complete=true;usage={input:event.response?.usage?.input_tokens||0,output:event.response?.usage?.output_tokens||0};}
        if(['response.failed','response.incomplete','error'].includes(event.type)) throw new Error('AI chưa hoàn tất: '+(event.response?.error?.code||event.error?.code||event.type));
      });
      if(!complete||!text.trim()) throw new Error('Kết nối kết thúc trước khi AI viết xong. Bản nháp chưa được duyệt.');
      return {text,usage};
  }
}
module.exports={AI,readSSE,parseJSON};
