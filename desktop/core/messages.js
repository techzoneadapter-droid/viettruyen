(function(root){
 'use strict';
 function errorText(error){
  const message=typeof error==='string'?error:error?.message||'Không hoàn tất được thao tác. Hãy thử lại.';
  let issues=error?.issues;
  if(!issues){try{const value=JSON.parse(message);if(Array.isArray(value))issues=value;}catch{}}
  if(!Array.isArray(issues)||!issues.length||!issues.every(x=>x&&typeof x.code==='string'&&Array.isArray(x.path)))return message;
  const paths=issues.map(x=>x.path.join('.'));
  if(paths.some(x=>/^chapters\.\d+\.plan$/.test(x)))return 'AI trả dàn ý chương không đúng định dạng. Các chương đã lưu được giữ nguyên; bấm Tiếp tục viết để lập lại đợt dàn ý này.';
  if(paths.some(x=>/^(bible|arcs)(\.|$)/.test(x)))return 'AI trả hồ sơ hoặc dàn ý quyển không đúng định dạng. Dữ liệu đã lưu được giữ nguyên; hãy thử lại.';
  if(paths.some(x=>/^(approved|issues|summary|facts|stateUpdates|openThreads)(\.|$)/.test(x)))return 'AI trả kết quả kiểm tra chương không đúng định dạng. Bản nháp đã lưu; bấm Tiếp tục để kiểm tra lại.';
  return 'Dữ liệu trả về hoặc thông tin nhập chưa đúng định dạng. Kiểm tra thông tin rồi thử lại; nội dung đã lưu được giữ nguyên.';
 }
 const api={errorText};
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.VietMessages=api;
})(typeof globalThis==='object'?globalThis:this);
