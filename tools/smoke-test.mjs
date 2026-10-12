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
check('战力提升共 9 档', nodes.get('producers').children.length === 9, 'n=' + nodes.get('producers').children.length);
check('只显示 1 个生产单位', nodes.get('producers').children.filter((c) => c.style.display !== 'none').length === 1);
check('升级项全部隐藏', nodes.get('upgrades').children.every((c) => c.style.display === 'none'));
check('产出统计初始为 0', nodes.get('stat-manual').textContent === '0' && nodes.get('stat-auto').textContent === '0' && nodes.get('stat-total').textContent === '0');

console.log('\n[1b] 境界一览弹窗');
const rModal = nodes.get('realm-modal');
const rList = nodes.get('realm-list');
check('列出全部境界', rList.children.length === 10, 'n=' + rList.children.length);
check('当前境界高亮为第 1 档', rList.children[0].classList.contains('current'));
check('阈值显示正确（武者 = 100）', rList.children[1].children[1].children[1].textContent === '100',
  rList.children[1].children[1].children[1].textContent);
click('realm-row');
check('点境界区域 → 打开', rModal.classList.contains('hidden') === false);
rModal._handlers.click[0]({ target: rModal });
check('点空白处 → 关闭', rModal.classList.contains('hidden') === true);

console.log('\n[2] 点击吞噬');
for (let i = 0; i < 30; i++) click('devour');
check('点击 30 次得到 30 能量', nodes.get('energy').textContent === '30', nodes.get('energy').textContent);
check('累计点击产出 = 30', nodes.get('stat-manual').textContent === '30', nodes.get('stat-manual').textContent);
check('累计自动产出仍为 0', nodes.get('stat-auto').textContent === '0', nodes.get('stat-auto').textContent);

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
check('自动产出入账到统计', parseFloat(nodes.get('stat-auto').textContent) > 0, nodes.get('stat-auto').textContent);
check('总和 > 点击产出', parseFloat(nodes.get('stat-total').textContent) > parseFloat(nodes.get('stat-manual').textContent),
  nodes.get('stat-total').textContent + ' vs ' + nodes.get('stat-manual').textContent);
check('占比已计算', nodes.get('stat-manual-pct').textContent.indexOf('%') > 0, nodes.get('stat-manual-pct').textContent);

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

console.log('\n[5b] 离线时长档位');
const offRow = nodes.get('offline-list').children[0];
const offLv = () => offRow.children[1].children[0].children[1].textContent;
const offSub = () => offRow.children[1].children[2].textContent;
const offCost = () => offRow.children[2].children[1].textContent;
check('初始为 Lv.1', offLv() === 'Lv.1', offLv());
check('未达标时显示开启门槛', offCost().indexOf('开启') >= 0, offCost());
for (let i = 0; i < 8000; i++) click('devour');
check('达标后显示成本', offCost().indexOf('开启') < 0, offCost());
offRow.children[2]._handlers.click[0]();
check('提升到 Lv.2', offLv() === 'Lv.2', offLv());
check('下一档为 10 小时', offSub().indexOf('10 小时') >= 0, offSub());
check('页脚同步更新为 8 小时', nodes.get('foot-offline').textContent.indexOf('8 小时') >= 0, nodes.get('foot-offline').textContent);

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

console.log('\n[6b] v0.1.x 旧存档迁移');
const legacy = {
  v: 1, energy: 5000, totalEnergy: 9000, clicks: 300,
  producers: { tudi: 22, nianshi: 5, tunshou: 2, feichuan: 0 },
  upgrades: { quan: 3, leishen: 1, jiyin: 1 },
  startedAt: Date.now() - 86400000, lastSeen: Date.now(),
};
nodes.get('save-text').value = btoa(JSON.stringify(legacy));
click('btn-import');
check('旧存档导入成功', nodes.get('save-hint').textContent.indexOf('成功') >= 0, nodes.get('save-hint').textContent);
check('能量保留', nodes.get('energy').textContent === '5.00K', nodes.get('energy').textContent);
const pRows = nodes.get('producers').children;
const owned = (i) => pRows[i].children[1].children[0].children[1].textContent;
check('tudi 22 → 念力觉醒', owned(0) === '×22', owned(0));
check('nianshi 5 → 信念驱动', owned(1) === '×5', owned(1));
check('tunshou 2 → 智能生命', owned(2) === '×2', owned(2));
check('feichuan 0 → 金角巨兽', owned(3) === '×0', owned(3));
check('不朽遗产（门槛 1万）此时仍未解锁', pRows[4].style.display === 'none', pRows[4].style.display);
const uRows = nodes.get('upgrades').children;
const uLv = (i) => uRows[i].children[1].children[0].children[1].textContent;
check('拳力淬炼等级保留', uLv(0) === 'Lv.3', uLv(0));
check('leishen → 九重雷刀', uLv(1) === '已获得', uLv(1));
check('jiyin → 木芽晶和柳木心', uLv(2) === '已获得', uLv(2));
check('虚拟宇宙网络（门槛 3万）此时仍未解锁', uRows[5].style.display === 'none', uRows[5].style.display);
check('点击之力按迁移后的倍率算', nodes.get('click-power').textContent === '8', nodes.get('click-power').textContent);
check('总产出按迁移后的倍率算（31.2 × 1.5）', nodes.get('rate').textContent === '+46.8 / 秒', nodes.get('rate').textContent);
check('旧存档统计按下限回填（点击 = 300）', nodes.get('stat-manual').textContent === '300', nodes.get('stat-manual').textContent);
check('旧存档自动产出 = 9000 - 300', nodes.get('stat-auto').textContent === '8.70K', nodes.get('stat-auto').textContent);

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
