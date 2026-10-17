const test = require('node:test');
const assert = require('node:assert/strict');
const {summaryInstructions, summaryInput} = require('../desktop/core/synopsis.cjs');

test('synopsis prompt is concise and limited to overview, protagonist and cultivation', () => {
  assert.match(summaryInstructions, /180–300 từ/);
  assert.match(summaryInstructions, /3\.000 ký tự/);
  assert.match(summaryInstructions, /KHÁI QUÁT CÂU CHUYỆN/);
  assert.match(summaryInstructions, /CUỘC ĐỜI NHÂN VẬT CHÍNH/);
  assert.match(summaryInstructions, /HỆ THỐNG TU LUYỆN VÀ CẢNH GIỚI/);
  assert.match(summaryInstructions, /nối bằng dấu →/);
  assert.match(summaryInstructions, /bỏ mục 3/);
  assert.match(summaryInstructions, /ĐỀ XUẤT — CẦN DUYỆT/);
  assert.doesNotMatch(summaryInstructions, /650–1\.100|DIỄN BIẾN THEO GIAI ĐOẠN/);
});

test('summary source keeps established cultivation facts without changing a project', () => {
  const project = {
    title: 'Tập tu tiên', genre: 'Tiên hiệp', style: 'Mộc mạc', premise: 'Một thiếu niên lên núi',
    target: 200, bible: 'HỆ THỐNG CẢNH GIỚI: Luyện Khí → Trúc Cơ → Kim Đan',
    arcs: [{title:'Khởi đầu', start:1, end:20, summary:'Rời quê hương'}],
    ledger: {'tu vi của nhân vật chính':'Trúc Cơ sơ kỳ', 'vật dụng':'Kiếm gỗ'},
    openThreads: ['Tìm người thân'],
    chapters: [{number:1, status:'approved', content:'Rời làng.'}],
    memories: [{chapter:1, summary:'Lên đường'}]
  };
  const before = JSON.stringify(project);
  const input = summaryInput(project);
  assert.match(input.bible, /Luyện Khí → Trúc Cơ → Kim Đan/);
  assert.deepEqual(input.cultivationAndCharacterState, [{key:'tu vi của nhân vật chính', value:'Trúc Cơ sơ kỳ'}]);
  assert.equal(input.selectedMemories.length, 1);
  assert.equal(JSON.stringify(project), before);
});
