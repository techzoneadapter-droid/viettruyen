const http=require('node:http');
const crypto=require('node:crypto');
class ChatGPTAuth {
 constructor(vault,openExternal,fetcher=fetch){Object.assign(this,{vault,openExternal,fetch:fetcher,pending:null,refreshing:null});}
 status(){const c=this.vault.get('chatgpt');return {connected:!!c,email:c?.email||'',planUsage:c?.scopes?.includes('chatgpt.tokens.use.direct')||false};}
 async login(){
  if(this.pending)throw new Error('Đang chờ đăng nhập trong trình duyệt.');
  const previous=this.vault.get('chatgpt');let host=this.vault.get('hostId');if(!host){host='urn:uuid:'+crypto.randomUUID();this.vault.set('hostId',host);}
  const state=crypto.randomBytes(32).toString('base64url'),nonce=crypto.randomBytes(32).toString('base64url'),verifier=crypto.randomBytes(48).toString('base64url');
  let timer,server,redirect;
  return new Promise((resolve,reject)=>{
   const finish=(error,value)=>{clearTimeout(timer);server.close();this.pending=null;error?reject(error):resolve(value);};
   server=http.createServer(async(req,res)=>{try{
    const url=new URL(req.url,redirect);if(url.pathname!=='/auth/callback'){res.writeHead(404).end();return;}
    if(url.searchParams.get('state')!==state){res.writeHead(400).end('Invalid state');return;}
    if(url.searchParams.has('error'))throw new Error('Đăng nhập bị từ chối: '+url.searchParams.get('error'));
    const client=url.searchParams.get('client_id')||previous?.client_id;
    if(!client||client==='dynamic_agent_client'||(previous&&client!==previous.client_id))throw new Error('Đăng ký ứng dụng chưa hoàn tất.');
    const code=url.searchParams.get('code');if(!code)throw new Error('Thiếu mã đăng nhập.');
    const r=await this.fetch('https://auth.openai.com/api/accounts/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:client,code,code_verifier:verifier,redirect_uri:redirect,resource:'https://api.openai.com/v1'}),signal:AbortSignal.timeout(30000)});
    if(!r.ok)throw new Error('Không đổi được mã đăng nhập: HTTP '+r.status);const t=await r.json();
    const d=await this.fetch('https://auth.openai.com/.well-known/openid-configuration',{signal:AbortSignal.timeout(30000)});if(!d.ok)throw new Error('Không xác minh được nhà cung cấp đăng nhập.');const config=await d.json();
    if(config.issuer!=='https://auth.openai.com'||new URL(config.jwks_uri).origin!=='https://auth.openai.com')throw new Error('Nhà cung cấp không hợp lệ.');
    const {jwtVerify,createRemoteJWKSet}=await import('jose');const {payload}=await jwtVerify(t.id_token,createRemoteJWKSet(new URL(config.jwks_uri)),{issuer:config.issuer,audience:client});
    if(payload.nonce!==nonce||(previous&&payload.sub!==previous.subject))throw new Error('Danh tính đăng nhập không khớp.');const scopes=(t.scope||'').split(' ');
    if(!scopes.includes('chatgpt.tokens.use.direct'))throw new Error('Tài khoản chưa cấp quyền dùng gói ChatGPT cho ứng dụng. Có thể chuyển sang Gemini API hoặc OpenAI API.');
    this.vault.set('chatgpt',{...t,client_id:client,subject:payload.sub,email:payload.email||'',scopes,expires_at:Date.now()+(t.expires_in||3600)*1000});
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end('<h2>Đã kết nối Việt Truyện.</h2><p>Bạn có thể đóng cửa sổ và trở lại ứng dụng.</p>');finish(null,this.status());
   }catch(e){res.writeHead(400,{'Content-Type':'text/plain; charset=utf-8'}).end('Đăng nhập không thành công. Trở lại Việt Truyện để xem chi tiết.');finish(e);}});
   server.on('error',e=>finish(e));server.listen(0,'127.0.0.1',()=>{
    redirect=`http://127.0.0.1:${server.address().port}/auth/callback`;
    const params=new URLSearchParams({client_id:previous?.client_id||'dynamic_agent_client',ext_agent_host_id:host,response_type:'code',redirect_uri:redirect,scope:'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',resource:'https://api.openai.com/v1',state,nonce,code_challenge_method:'S256',code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url')});
    if(previous?.id_token)params.set('id_token_hint',previous.id_token);else params.set('agent_name_hint','VietTruyen');this.openExternal('https://auth.openai.com/api/accounts/authorize?'+params).catch(e=>finish(e));
   });timer=setTimeout(()=>finish(new Error('Đăng nhập quá thời gian. Hãy thử lại.')),300000);this.pending={cancel:()=>finish(new Error('Đã hủy đăng nhập.'))};
  });
 }
 cancel(){this.pending?.cancel();}
 logout(){this.cancel();this.vault.set('chatgpt',null);return this.status();}
 async access({force=false,rejectedToken}={}){
  const c=this.vault.get('chatgpt');if(!c)throw new Error('Hãy đăng nhập ChatGPT trước.');if(this.refreshing)return this.refreshing;if(rejectedToken&&c.access_token!==rejectedToken)force=false;if(!force&&Date.now()<c.expires_at-90000)return c.access_token;
  this.refreshing=(async()=>{const r=await this.fetch('https://auth.openai.com/api/accounts/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:c.client_id,refresh_token:c.refresh_token,resource:'https://api.openai.com/v1'}),signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error('Phiên ChatGPT hết hạn. Hãy đăng nhập lại.');const t=await r.json(),scopes=t.scope?t.scope.split(' '):c.scopes;if(!scopes.includes('chatgpt.tokens.use.direct'))throw new Error('Quyền dùng gói ChatGPT không còn được cấp.');this.vault.set('chatgpt',{...c,...t,scopes,expires_at:Date.now()+(t.expires_in||3600)*1000});return t.access_token;})();try{return await this.refreshing;}finally{this.refreshing=null;}
 }
}
module.exports={ChatGPTAuth};
