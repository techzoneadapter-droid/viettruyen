const {_electron:electron}=require('playwright-core');const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'viet-desktop-'));let instance;
 const executable=process.env.VIETTRUYEN_SMOKE_EXE||path.resolve('dist/win-unpacked/VietTruyen.exe');
 try{
  instance=await electron.launch({executablePath:executable,env:{...process.env,VIETTRUYEN_TEST_USER_DATA:root},timeout:60000});
  const page=await instance.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.getByRole('button',{name:'＋ Tạo truyện mới',exact:true}).waitFor();
  await page.screenshot({path:'dist/ui-home.png'});
  await page.getByRole('button',{name:'＋ Tạo truyện mới',exact:true}).click();
  await page.locator('[name=title]').fill('Hành trình 1.000 chương');await page.locator('[name=premise]').fill('An tìm lại bản đồ, cứu thành phố và khám phá bí mật về gia đình.');await page.locator('[name=target]').fill('1000');
  await page.getByRole('button',{name:'Tạo truyện mới →',exact:true}).click();
  await page.getByRole('heading',{name:'Hành trình 1.000 chương'}).waitFor();assert.match(await page.locator('#content').innerText(),/1000 chương dự kiến/);
  await page.getByRole('button',{name:'Hồ sơ truyện',exact:true}).click();await page.locator('#bible').fill('An 20 tuổi, sống ở bến cảng. Chưa biết thân thế gia đình.');await page.getByRole('button',{name:'Lưu hồ sơ',exact:true}).click();await page.getByRole('status').filter({hasText:'Đã lưu hồ sơ.'}).waitFor();
  const p=await page.evaluate(async()=>{const list=await window.viet.call('projects:list');return window.viet.call('projects:get',list[0].id);});assert.equal(p.target,1000);assert.match(p.bible,/An 20 tuổi/);
  await page.locator('nav').getByRole('button',{name:'Kết nối AI',exact:true}).click();await page.locator('#provider').selectOption('gemini');await page.locator('#api-key').fill('test-only-key');await page.getByRole('button',{name:'Lưu kết nối',exact:true}).click();await page.getByRole('status').filter({hasText:'Đã lưu kết nối.'}).waitFor();
  const settings=await page.evaluate(()=>window.viet.call('init'));assert.equal(settings.settings.provider,'gemini');assert.equal(settings.settings.hasGeminiKey,true);assert.equal(settings.settings.geminiKey,undefined);
  const credentialFile=path.join(root,'credentials.json');assert.ok(fs.existsSync(credentialFile));assert.ok(!fs.readFileSync(credentialFile,'utf8').includes('test-only-key'));
  await page.getByRole('button',{name:'Cập nhật ứng dụng',exact:true}).click();await page.getByRole('button',{name:'Kiểm tra cập nhật',exact:true}).waitFor();
  await page.screenshot({path:'dist/ui-update.png'});assert.deepEqual(errors,[]);
  await instance.close();instance=null;
  instance=await electron.launch({executablePath:executable,env:{...process.env,VIETTRUYEN_TEST_USER_DATA:root},timeout:60000});const reopened=await instance.firstWindow();await reopened.getByRole('button',{name:/Hành trình 1.000 chương/}).waitFor();assert.match(await reopened.locator('#connection-label').innerText(),/Gemini/);
  console.log('WINDOWS DESKTOP PASS: installed app opens; real IPC; project persists with 1000 target; bible saved; credentials encrypted; update screen opens; restart preserves data; no renderer errors.');
 }finally{if(instance)await instance.close();fs.rmSync(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});
