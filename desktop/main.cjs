const {app,BrowserWindow,ipcMain,shell,dialog,safeStorage}=require('electron');
const path=require('node:path');const fs=require('node:fs');const {pathToFileURL}=require('node:url');const {z}=require('zod');
const {Store,atomic,read}=require('./core/store.cjs');const {AI}=require('./core/ai.cjs');const {Engine}=require('./core/engine.cjs');const {ChatGPTAuth}=require('./core/auth.cjs');
const settingsSchema=z.object({provider:z.enum(['chatgpt','gemini','openai']),model:z.string().max(200),geminiKey:z.string().max(500).optional(),openaiKey:z.string().max(500).optional()});
app.setName('VietTruyen');if(process.env.VIETTRUYEN_TEST_USER_DATA)app.setPath('userData',process.env.VIETTRUYEN_TEST_USER_DATA);let win,store,engine,auth,vault,updater;let update={status:'idle',message:'Bấm Kiểm tra cập nhật để tìm phiên bản mới.'};
function emit(event){if(win&&!win.isDestroyed())win.webContents.send('event',event);}
class Vault{
 constructor(file){this.file=file;this.value={};if(fs.existsSync(file)){if(!safeStorage.isEncryptionAvailable())throw new Error('Không mở được kho thông tin kết nối được mã hóa.');this.value=JSON.parse(safeStorage.decryptString(Buffer.from(read(file,'').data,'base64')));}}
 get(key){return this.value[key];}
 set(key,value){if(!safeStorage.isEncryptionAvailable()||(process.platform==='linux'&&safeStorage.getSelectedStorageBackend()==='basic_text'))throw new Error('Hệ điều hành chưa có kho mã hóa an toàn. Không lưu thông tin đăng nhập.');const next={...this.value,[key]:value};atomic(this.file,{data:safeStorage.encryptString(JSON.stringify(next)).toString('base64')});this.value=next;}
}
function settings(){return {...{provider:'chatgpt',model:''},...(vault.get('settings')||{})};}
function publicSettings(){const s=settings();return {provider:s.provider,model:s.model,hasGeminiKey:!!s.geminiKey,hasOpenaiKey:!!s.openaiKey,chatgpt:auth.status()};}
function idle(){if(engine.busy())throw new Error('Hãy tạm dừng và chờ tác vụ kết thúc trước khi thay đổi dữ liệu hoặc cập nhật.');}
function installUpdates(){
 const {autoUpdater}=require('electron-updater');updater=autoUpdater;updater.autoDownload=false;updater.autoInstallOnAppQuit=false;updater.allowDowngrade=false;
 function state(status,message,extra={}){update={status,message,...extra};emit({type:'update',...update});}
 updater.on('checking-for-update',()=>state('checking','Đang kiểm tra phiên bản mới…'));
 updater.on('update-available',info=>state('available',`Có phiên bản ${info.version}. Bấm Tải bản mới.`,{version:info.version}));
 updater.on('update-not-available',()=>state('current','Bạn đang dùng phiên bản mới nhất.'));
 updater.on('download-progress',p=>state('downloading',`Đang tải: ${Math.round(p.percent)}%`,{percent:p.percent}));
 updater.on('update-downloaded',info=>state('ready',`Đã tải phiên bản ${info.version}. Bấm Cài và khởi động lại.`,{version:info.version}));
 updater.on('error',()=>state('error','Không kiểm tra hoặc tải được bản phát hành. Kiểm tra mạng rồi thử lại.'));
}
function handle(name,fn){ipcMain.handle(name,async(event,...args)=>{const expected=pathToFileURL(path.join(__dirname,'ui/index.html')).href;if(event.sender!==win.webContents||event.senderFrame?.url!==expected)throw new Error('Nguồn yêu cầu không hợp lệ.');try{return {ok:true,data:await fn(...args)};}catch(e){return {ok:false,error:e.message};}});}
app.whenReady().then(()=>{
 const root=path.join(app.getPath('userData'),'data');store=new Store(root);vault=new Vault(path.join(app.getPath('userData'),'credentials.json'));auth=new ChatGPTAuth(vault,url=>shell.openExternal(url));engine=new Engine(store,new AI(settings,auth),emit);
 for(const p of store.list()){const v=store.load(p.id);if(v.job?.status==='running'){v.job={...v.job,status:'paused',message:'Ứng dụng đã đóng giữa tác vụ. Bấm Tiếp tục để chạy từ phần đã lưu.'};store.save(v);}}
 installUpdates();
 handle('init',()=>({projects:store.list(),settings:publicSettings(),version:app.getVersion(),update}));
 handle('projects:list',()=>store.list());handle('projects:get',id=>store.load(z.string().parse(id)));
 handle('projects:create',input=>{idle();return store.create(input);});
 handle('projects:save',input=>{
  idle();const v=z.object({id:z.string(),bible:z.string().max(30000),style:z.string().max(4000)}).parse(input);const p=store.load(v.id);store.backup(p);p.bible=v.bible;p.style=v.style;return store.save(p);
 });
 handle('chapters:save',input=>{
  idle();const v=z.object({id:z.string(),number:z.number().int().min(1).max(1000),content:z.string().max(200000),plan:z.string().max(6000)}).parse(input);const p=store.load(v.id),c=p.chapters.find(c=>c.number===v.number);if(!c)throw new Error('Không tìm thấy chương.');store.backup(p);
  if(c.content!==v.content){c.content=v.content;c.wordCount=v.content.trim()?v.content.trim().split(/\s+/).length:0;p.memories=p.memories.filter(m=>m.chapter<v.number);p.ledger=Object.assign({},...p.memories.map(m=>m.stateUpdates||{}));p.openThreads=p.memories.at(-1)?.openThreads||[];for(const later of p.chapters.filter(x=>x.number>=v.number&&x.content)){later.status='needs_review';later.issues=['Nội dung chương trước đã thay đổi; cần kiểm tra lại.'];}}
  c.plan=v.plan;return store.save(p);
 });
 handle('jobs:start',async input=>{const v=z.object({id:z.string(),count:z.number().int().min(1).max(1000),planOnly:z.boolean().default(false)}).parse(input);if(engine.busy())throw new Error('Có tác vụ đang chạy.');void engine.run(v.id,v.count,{planOnly:v.planOnly}).catch(e=>emit({type:'finished',message:e.message}));return {started:true};});
 handle('jobs:pause',()=>{engine.pause();return true;});handle('jobs:abort',()=>{engine.abort();return true;});
 handle('settings:save',input=>{idle();const v=settingsSchema.parse(input);const s=settings();vault.set('settings',{...s,...v,geminiKey:v.geminiKey===undefined?s.geminiKey:v.geminiKey,openaiKey:v.openaiKey===undefined?s.openaiKey:v.openaiKey});return publicSettings();});
 handle('auth:login',()=>{idle();return auth.login();});handle('auth:cancel',()=>auth.cancel());handle('auth:logout',()=>{idle();return auth.logout();});handle('ai:models',()=>{idle();return engine.ai.models();});
 handle('ai:test',async()=>{idle();const r=await engine.ai.generate('Chỉ trả lời bằng tiếng Việt.','Trả lời đúng một câu: Kết nối thành công.');return {text:r.text,usage:r.usage};});
 handle('export',async input=>{
  const v=z.object({id:z.string(),format:z.enum(['txt','json'])}).parse(input),p=store.load(v.id);const r=await dialog.showSaveDialog(win,{defaultPath:p.title.replace(/[<>:"/\\|?*]/g,'_')+'.'+v.format,filters:[{name:v.format==='txt'?'Văn bản':'Sao lưu truyện',extensions:[v.format]}]});if(r.canceled)return null;
  const content=v.format==='json'?JSON.stringify(p,null,2):p.title+'\n\n'+p.chapters.filter(c=>c.content).map(c=>`Chương ${c.number}: ${c.title}\n\n${c.content}`).join('\n\n\n');fs.writeFileSync(r.filePath,content,'utf8');return r.filePath;
 });
 handle('import',async()=>{idle();const r=await dialog.showOpenDialog(win,{filters:[{name:'Sao lưu Việt Truyện',extensions:['json']}],properties:['openFile']});if(r.canceled)return null;const file=r.filePaths[0];if(fs.statSync(file).size>50*1024*1024)throw new Error('Bản sao lưu lớn hơn 50 MB.');return store.import(JSON.parse(fs.readFileSync(file,'utf8')));});
 handle('data:open',()=>shell.openPath(root));
 handle('update:check',async()=>{idle();if(!app.isPackaged){update={status:'dev',message:'Cập nhật chỉ hoạt động trong bản đã cài đặt.'};return update;}if(['checking','downloading'].includes(update.status))return update;await updater.checkForUpdates();return update;});
 handle('update:download',async()=>{idle();if(update.status!=='available')throw new Error('Hãy kiểm tra bản mới trước.');await updater.downloadUpdate();return update;});
 handle('update:install',()=>{idle();if(update.status!=='ready')throw new Error('Bản cập nhật chưa tải xong.');for(const item of store.list())store.backup(store.load(item.id));updater.quitAndInstall(false,true);return true;});
 win=new BrowserWindow({width:1380,height:900,minWidth:1050,minHeight:700,title:'Việt Truyện',backgroundColor:'#f7f6f2',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());win.loadFile(path.join(__dirname,'ui/index.html'));
 win.on('close',e=>{if(engine.busy()){e.preventDefault();dialog.showMessageBox(win,{type:'question',buttons:['Tiếp tục viết','Dừng và đóng'],defaultId:0,cancelId:0,message:'Có tác vụ đang chạy',detail:'Dừng sẽ giữ lại các bước đã lưu. Bạn có thể tiếp tục khi mở app.'}).then(r=>{if(r.response===1){engine.abort();const done=setInterval(()=>{if(!engine.busy()){clearInterval(done);win.close();}},200);}});}});
}).catch(error=>{dialog.showErrorBox('Không mở được Việt Truyện',error.message);app.quit();});
app.on('window-all-closed',()=>{auth?.cancel();app.quit();});
