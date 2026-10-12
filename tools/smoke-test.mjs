/* 无头冒烟测试：用最小 DOM 桩加载 game.js，验证核心循环不报错。
 * 运行： node tools/smoke-test.mjs
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const code = fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8');

const ids = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
if (ids.length === 0) throw new Error('index.html 里没找到任何 id');

const failures = [];
function check(name, cond, extra = '') {
  if (cond) {
    console.log('  ok   ' + name);
  } else {
    failures.push(name + (extra ? ' -> ' + extra : ''));
    console.log('  FAIL ' + name + (extra ? ' -> ' + extra : ''));
  }
}

function makeEl(tag = 'div') {
  const el = {
    tagName: tag,
    children: [],
    style: { setProperty() {}, },
    className: '',
    textContent: '',
    value: '',
    disabled: false,
    _handlers: {},
    classList: {
      _s: new Set(),
      add(...c) { c.forEach((x) => this._s.add(x)); },
      remove(...c) { c.forEach((x) => this._s.delete(x)); },
      toggle(c, f) { if (f === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); } else if (f) { this._s.add(c); } else { this._s.delete(c); } },
      contains(c) { return this._s.has(c); },
    },
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); },
    remove() {},
    select() {},
    setAttribute() {},
    getAttribute() { return null; },
    addEventListener(t, f) { (this._handlers[t] = this._handlers[t] || []).push(f); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0 }; },
    get parentNode() { return null; },
  };
  let _html = '';
  Object.defineProperty(el, 'innerHTML', {
    get() { return _html; },
    set(v) { _html = v; if (v === '') el.children.length = 0; },
  });
  return el;
}

const nodes = new Map();
for (const id of ids) nodes.set(id, makeEl());

const docHandlers = {};
const store = new Map();
let rafCb = null;

const document = {
  readyState: 'complete',
  hidden: false,
  createElement: makeEl,
  getElementById(id) {
    if (!nodes.has(id)) throw new Error('game.js 引用了 index.html 中不存在的 id: #' + id);
    return nodes.get(id);
  },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  addEventListener(t, f) { (docHandlers[t] = docHandlers[t] || []).push(f); },
  execCommand() { return false; },
  body: makeEl('body'),
};

const sandbox = {
  console,
  document,
  Math,
  Date,
  JSON,
  Object,
  Array,
  Number,
  String,
  Boolean,
  isNaN,
  isFinite,
  parseInt,
  parseFloat,
  TextEncoder,
  TextDecoder,
  btoa,
  atob,
  setTimeout: () => 0,
  clearTimeout: () => {},
  setInterval: () => 0,
  clearInterval: () => {},
  requestAnimationFrame: (cb) => { rafCb = cb; return 1; },
  performance: { now: () => Date.now() },
  navigator: { storage: { persist: () => Promise.resolve(true) } },
  location: { protocol: 'file:', hostname: '', pathname: '/' },
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  },
};
sandbox.window = sandbox;
sandbox.window.confirm = () => true;
sandbox.window.addEventListener = (t, f) => { (docHandlers[t] = docHandlers[t] || []).push(f); };
sandbox.globalThis = sandbox;

console.log('加载 game.js ...');
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'game.js' });

const click = (id) => {
  const h = nodes.get(id)._handlers.click;
  if (!h || !h.length) throw new Error('#' + id + ' 没有绑定 click');
  h.forEach((f) => f());
};

console.log('\n[1] 初始化');
check('能量初始为 0', nodes.get('energy').textContent === '0', nodes.get('energy').textContent);
check('境界显示为武徒', nodes.get('realm').textContent === '武徒', nodes.get('realm').textContent);
check('只显示 1 个生产单位', nodes.get('producers').children.filter((c) => c.style.display !== 'none').length === 1);
check('升级项全部隐藏', nodes.get('upgrades').children.every((c) => c.style.display === 'none'));

console.log('\n[2] 点击吞噬');
for (let i = 0; i < 30; i++) click('devour');
check('点击 30 次得到 30 能量', nodes.get('energy').textContent === '30', nodes.get('energy').textContent);

console.log('\n[3] 招募第一个生产单位');
const firstRow = nodes.get('producers').children[0];
const buyBtn = firstRow.children[2];
check('买得起时按钮可点', buyBtn.disabled === false);
buyBtn._handlers.click[0]();
check('能量被扣除（30 - 15）', nodes.get('energy').textContent === '15', nodes.get('energy').textContent);
check('拥有数变为 ×1', firstRow.children[1].children[0].children[1].textContent === '×1',
  firstRow.children[1].children[0].children[1].textContent);
check('单价涨到 18', buyBtn.children[1].textContent === '18', buyBtn.children[1].textContent);

console.log('\n[4] 主循环产出');
check('已注册 requestAnimationFrame', typeof rafCb === 'function');
const before = parseFloat(nodes.get('energy').textContent) || 0;
let t = 1000;
for (let i = 0; i < 20; i++) { const cb = rafCb; t += 500; cb(t); }
const after = parseFloat(nodes.get('energy').textContent) || 0;
check('10 秒后能量增长（0.1/秒）', after > before, before + ' -> ' + after);

console.log('\n[5] 升级解锁与购买');
for (let i = 0; i < 400; i++) click('devour');
const upgradeRows = nodes.get('upgrades').children;
check('有升级项已解锁', upgradeRows.some((c) => c.style.display !== 'none'));
const quanIdx = 0;
check('拳力淬炼可见', upgradeRows[quanIdx].style.display !== 'none');
const clickPowerBefore = nodes.get('click-power').textContent;
upgradeRows[quanIdx].children[2]._handlers.click[0]();
check('点击之力提升', nodes.get('click-power').textContent !== clickPowerBefore,
  clickPowerBefore + ' -> ' + nodes.get('click-power').textContent);

console.log('\n[6] 存档导出 / 导入 / 损坏兜底');
click('btn-export');
const code1 = nodes.get('save-text').value;
check('导出得到存档码', code1.length > 10, 'len=' + code1.length);
const energyBefore = nodes.get('energy').textContent;
nodes.get('save-text').value = code1;
click('btn-import');
check('导入后数值一致', nodes.get('energy').textContent === energyBefore,
  energyBefore + ' -> ' + nodes.get('energy').textContent);
nodes.get('save-text').value = '这不是存档码!!!';
click('btn-import');
check('坏存档不崩溃且被拒绝', nodes.get('save-hint').textContent.indexOf('无效') >= 0,
  nodes.get('save-hint').textContent);
check('存档已写入 localStorage', store.has('lcz_save_v1'));

console.log('\n[7] 重置');
click('btn-reset');
check('重置后能量归零', nodes.get('energy').textContent === '0', nodes.get('energy').textContent);
check('重置后回到武徒', nodes.get('realm').textContent === '武徒', nodes.get('realm').textContent);

console.log('\n[8] 页面切后台 / 回前台');
document.hidden = true;
(docHandlers.visibilitychange || []).forEach((f) => f());
document.hidden = false;
(docHandlers.visibilitychange || []).forEach((f) => f());
check('visibilitychange 未抛异常', true);

console.log('');
if (failures.length) {
  console.log('失败 ' + failures.length + ' 项：');
  failures.forEach((f) => console.log('  - ' + f));
  process.exit(1);
}
console.log('全部通过 ✅');
