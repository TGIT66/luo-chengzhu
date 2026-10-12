/* 《叫我罗城主》阶段 0 —— 纯前端离线增量游戏
 *
 * 无依赖、无构建工具。想调数值，只改下面「配置区」即可。
 * 部署：整个文件夹丢给任意静态托管（如 Netlify Drop），
 *       手机 Chrome 打开网址 →「安装应用 / 添加到主屏幕」。
 */
(function () {
  'use strict';

  /* ==================================================================
   *  配置区
   * ================================================================== */

  var SAVE_KEY = 'lcz_save_v1';
  var AUTOSAVE_MS = 10000;      // 自动存档间隔
  var OFFLINE_EFFICIENCY = 0.5; // 离线收益效率（50%）
  var OFFLINE_CAP_HOURS = 8;    // 离线收益上限（小时）
  var RENDER_MS = 100;          // 界面刷新节流（毫秒）

  // 生产单位：成本 = baseCost * costMult^已拥有数量
  var PRODUCERS = [
    { id:'tudi',    name:'武者学徒',   icon:'🥋', desc:'武馆里最能吃苦的一批人', baseCost:15,    costMult:1.15, rate:0.1 },
    { id:'nianshi', name:'精神念师',   icon:'🧠', desc:'以精神念力压缩、提纯能量', baseCost:120,   costMult:1.15, rate:1.2 },
    { id:'tunshou', name:'吞噬兽',     icon:'🐾', desc:'来自异星的凶兽，本能即吞噬', baseCost:1400,  costMult:1.15, rate:9   },
    { id:'feichuan',name:'陨墨星舰队', icon:'🛸', desc:'横扫星域，按恒星单位收割',   baseCost:18000, costMult:1.15, rate:65  }
  ];

  // 升级：type = clickAdd / clickMult / globalMult
  var UPGRADES = [
    { id:'quan',     name:'拳力淬炼', icon:'👊', type:'clickAdd',   baseCost:25,    costMult:1.9, max:Infinity,
      desc:function (lv) { return '吞噬之力 +' + (lv + 1) + '（每级叠加）'; } },
    { id:'leishen',  name:'雷神传承', icon:'⚡', type:'clickMult',  baseCost:500,   costMult:1,   max:1, value:2,
      desc:function () { return '点击吞噬效果 ×2'; } },
    { id:'jiyin',    name:'基因药剂', icon:'🧪', type:'globalMult', baseCost:2500,  costMult:1,   max:1, value:2,
      desc:function () { return '所有自动产出 ×2'; } },
    { id:'jiuchong', name:'九重雷刀', icon:'🗡️', type:'clickMult',  baseCost:9000,  costMult:1,   max:1, value:3,
      desc:function () { return '点击吞噬效果 ×3'; } },
    { id:'jingshen', name:'精神网络', icon:'🌐', type:'globalMult', baseCost:60000, costMult:1,   max:1, value:3,
      desc:function () { return '所有自动产出 ×3'; } }
  ];

  // 境界：按「累计获得」的基因能量解锁。
  // 注意：这里的境界名称是占位，请按你对原著的记忆自行修改名称与阈值。
  var REALMS = [
    { name:'武徒',   at:0 },
    { name:'武者',   at:100 },
    { name:'武师',   at:2000 },
    { name:'武尊',   at:50000 },
    { name:'行星级', at:1e6 },
    { name:'恒星级', at:1e8 },
    { name:'宇宙级', at:1e10 },
    { name:'域主级', at:1e13 },
    { name:'界主级', at:1e16 },
    { name:'不朽',   at:1e20 }
  ];

  var UNITS = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

  /* ==================================================================
   *  小工具
   * ================================================================== */

  function $(id) { return document.getElementById(id); }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) { n.className = cls; }
    if (text != null) { n.textContent = text; }
    return n;
  }

  // 数字格式化：1234 -> 1.23K
  function fmt(n) {
    if (n == null || isNaN(n)) { return '0'; }
    if (!isFinite(n)) { return '∞'; }
    if (n < 0) { return '-' + fmt(-n); }
    if (n < 1000) {
      if (n === Math.floor(n)) { return String(n); }
      return n < 10 ? n.toFixed(2) : (n < 100 ? n.toFixed(1) : String(Math.floor(n)));
    }
    var i = 0;
    while (n >= 1000 && i < UNITS.length - 1) { n /= 1000; i++; }
    if (n >= 1000) { return n.toExponential(2).replace('e+', 'e'); }
    return n.toFixed(2) + UNITS[i];
  }

  function fmtDuration(sec) {
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    if (h > 0) { return h + ' 小时 ' + m + ' 分'; }
    if (m > 0) { return m + ' 分 ' + Math.floor(sec % 60) + ' 秒'; }
    return Math.floor(sec) + ' 秒';
  }

  /* ==================================================================
   *  状态
   * ================================================================== */

  function freshState() {
    var producers = {};
    for (var i = 0; i < PRODUCERS.length; i++) { producers[PRODUCERS[i].id] = 0; }
    var now = Date.now();
    return {
      v: 1,
      energy: 0,        // 当前基因能量
      totalEnergy: 0,   // 累计获得（决定境界）
      clicks: 0,
      producers: producers,
      upgrades: {},
      startedAt: now,
      lastSeen: now
    };
  }

  var state = freshState();
  var ui = {};

  /* ==================================================================
   *  数值计算
   * ================================================================== */

  function globalMult() {
    var m = 1;
    for (var i = 0; i < UPGRADES.length; i++) {
      var u = UPGRADES[i];
      var lv = state.upgrades[u.id] || 0;
      if (u.type === 'globalMult' && lv > 0) { m *= Math.pow(u.value, lv); }
    }
    return m;
  }

  function getRate() {
    var r = 0;
    for (var i = 0; i < PRODUCERS.length; i++) {
      var p = PRODUCERS[i];
      r += p.rate * (state.producers[p.id] || 0);
    }
    return r * globalMult();
  }

  function getClickPower() {
    var power = 1 + (state.upgrades.quan || 0);
    for (var i = 0; i < UPGRADES.length; i++) {
      var u = UPGRADES[i];
      var lv = state.upgrades[u.id] || 0;
      if (u.type === 'clickMult' && lv > 0) { power *= Math.pow(u.value, lv); }
    }
    return power;
  }

  function producerCost(p) {
    return Math.ceil(p.baseCost * Math.pow(p.costMult, state.producers[p.id] || 0));
  }

  function upgradeCost(u) {
    return Math.ceil(u.baseCost * Math.pow(u.costMult, state.upgrades[u.id] || 0));
  }

  function upgradeMaxed(u) {
    return (state.upgrades[u.id] || 0) >= u.max;
  }

  function realmIndex() {
    var idx = 0;
    for (var i = 0; i < REALMS.length; i++) {
      if (state.totalEnergy >= REALMS[i].at) { idx = i; }
    }
    return idx;
  }

  function addEnergy(amount) {
    state.energy += amount;
    state.totalEnergy += amount;
  }

  /* ==================================================================
   *  玩家操作
   * ================================================================== */

  function devour() {
    var gain = getClickPower();
    addEnergy(gain);
    state.clicks++;
    floatText('+' + fmt(gain));
    render();
  }

  function buyProducer(p) {
    var cost = producerCost(p);
    if (state.energy < cost) { return; }
    state.energy -= cost;
    state.producers[p.id] = (state.producers[p.id] || 0) + 1;
    render();
  }

  function buyUpgrade(u) {
    if (upgradeMaxed(u)) { return; }
    var cost = upgradeCost(u);
    if (state.energy < cost) { return; }
    state.energy -= cost;
    state.upgrades[u.id] = (state.upgrades[u.id] || 0) + 1;
    toast('已获得：' + u.name);
    render();
  }

  /* ==================================================================
   *  界面
   * ================================================================== */

  function buildProducers() {
    var box = ui.producers;
    box.innerHTML = '';
    for (var i = 0; i < PRODUCERS.length; i++) {
      (function (p) {
        var row = el('div', 'card');
        var main = el('div', 'card-main');
        var title = el('div', 'card-title');
        title.appendChild(el('span', 'card-name', p.name));
        var owned = el('span', 'card-owned', '×0');
        title.appendChild(owned);
        var rate = el('div', 'card-rate', '');
        main.appendChild(title);
        main.appendChild(el('div', 'card-desc', p.desc));
        main.appendChild(rate);

        var btn = el('button', 'buy-btn');
        btn.type = 'button';
        btn.appendChild(el('span', 'buy-label', '招募'));
        var cost = el('span', 'buy-cost', '');
        btn.appendChild(cost);
        btn.addEventListener('click', function () { buyProducer(p); });

        row.appendChild(el('div', 'card-icon', p.icon));
        row.appendChild(main);
        row.appendChild(btn);
        box.appendChild(row);

        p._row = row; p._owned = owned; p._rate = rate; p._btn = btn; p._cost = cost;
      })(PRODUCERS[i]);
    }
  }

  function buildUpgrades() {
    var box = ui.upgrades;
    box.innerHTML = '';
    for (var i = 0; i < UPGRADES.length; i++) {
      (function (u) {
        var row = el('div', 'card');
        var main = el('div', 'card-main');
        var title = el('div', 'card-title');
        title.appendChild(el('span', 'card-name', u.name));
        var lvEl = el('span', 'card-owned', '');
        title.appendChild(lvEl);
        var desc = el('div', 'card-desc', '');
        main.appendChild(title);
        main.appendChild(desc);

        var btn = el('button', 'buy-btn');
        btn.type = 'button';
        btn.appendChild(el('span', 'buy-label', u.max > 1 ? '参悟' : '获取'));
        var cost = el('span', 'buy-cost', '');
        btn.appendChild(cost);
        btn.addEventListener('click', function () { buyUpgrade(u); });

        row.appendChild(el('div', 'card-icon', u.icon));
        row.appendChild(main);
        row.appendChild(btn);
        box.appendChild(row);

        u._row = row; u._owned = lvEl; u._desc = desc; u._btn = btn; u._cost = cost;
      })(UPGRADES[i]);
    }
  }

  function render() {
    var rate = getRate();
    ui.energy.textContent = fmt(state.energy);
    ui.rate.textContent = '+' + fmt(rate) + ' / 秒';
    ui.clickPower.textContent = fmt(getClickPower());

    var ri = realmIndex();
    ui.realm.textContent = REALMS[ri].name;
    var next = REALMS[ri + 1];
    if (next) {
      var from = REALMS[ri].at;
      var span = next.at - from;
      var progress = span > 0 ? (state.totalEnergy - from) / span : 0;
      progress = Math.max(0, Math.min(1, progress));
      ui.realmBar.style.width = (progress * 100).toFixed(1) + '%';
      ui.realmNext.textContent = '下一境界：' + next.name + '（' + fmt(state.totalEnergy) + ' / ' + fmt(next.at) + '）';
    } else {
      ui.realmBar.style.width = '100%';
      ui.realmNext.textContent = '已达当前版本最高境界';
    }

    for (var i = 0; i < PRODUCERS.length; i++) {
      var p = PRODUCERS[i];
      var owned = state.producers[p.id] || 0;
      var cost = producerCost(p);
      var visible = i === 0 || state.totalEnergy >= p.baseCost * 0.4;
      p._row.style.display = visible ? '' : 'none';
      if (!visible) { continue; }
      p._owned.textContent = '×' + owned;
      p._cost.textContent = fmt(cost);
      p._rate.textContent = owned > 0
        ? '当前产出 +' + fmt(p.rate * owned * globalMult()) + ' / 秒'
        : '基础产出 +' + fmt(p.rate) + ' / 秒';
      p._btn.disabled = state.energy < cost;
      p._btn.classList.toggle('can', state.energy >= cost);
    }

    for (var j = 0; j < UPGRADES.length; j++) {
      var u = UPGRADES[j];
      var visible2 = state.totalEnergy >= u.baseCost * 0.4;
      u._row.style.display = visible2 ? '' : 'none';
      if (!visible2) { continue; }
      var lv = state.upgrades[u.id] || 0;
      var uCost = upgradeCost(u);
      var maxed = upgradeMaxed(u);
      u._owned.textContent = u.max > 1 ? 'Lv.' + lv : (lv > 0 ? '已获得' : '');
      u._desc.textContent = u.desc(lv);
      u._cost.textContent = maxed ? '已满级' : fmt(uCost);
      u._btn.disabled = maxed || state.energy < uCost;
      u._btn.classList.toggle('can', !maxed && state.energy >= uCost);
      u._row.classList.toggle('done', maxed);
    }
  }

  function floatText(text) {
    var s = el('span', 'float', text);
    s.style.setProperty('--dx', (Math.random() * 60 - 30).toFixed(0) + 'px');
    ui.devour.appendChild(s);
    setTimeout(function () { if (s.parentNode) { s.parentNode.removeChild(s); } }, 900);
  }

  var toastTimer = null;
  function toast(msg) {
    ui.toast.textContent = msg;
    ui.toast.classList.remove('hidden');
    if (toastTimer) { clearTimeout(toastTimer); }
    toastTimer = setTimeout(function () { ui.toast.classList.add('hidden'); }, 1800);
  }

  function showOffline(seconds, gain) {
    ui.offlineText.textContent =
      '你离开了 ' + fmtDuration(seconds) + '，麾下战力自行吞噬，' +
      '带回 ' + fmt(gain) + ' 基因能量。';
    ui.offlineModal.classList.remove('hidden');
  }

  /* ==================================================================
   *  主循环与离线收益
   * ================================================================== */

  var lastFrame = 0;
  var lastRender = 0;

  function loop(now) {
    if (!lastFrame) { lastFrame = now; }
    var dt = (now - lastFrame) / 1000;
    lastFrame = now;
    if (dt > 1) { dt = 1; }          // 回到前台时不全额补算，离线收益另有计算
    if (dt > 0) {
      var r = getRate();
      if (r > 0) { addEnergy(r * dt); }
    }
    if (now - lastRender >= RENDER_MS) {
      lastRender = now;
      render();
    }
    requestAnimationFrame(loop);
  }

  // 按「上次在线时间」结算离线收益
  function applyOffline() {
    var now = Date.now();
    var last = state.lastSeen || now;
    var seconds = (now - last) / 1000;
    state.lastSeen = now;
    if (!(seconds > 1)) { return; }
    var capped = Math.min(seconds, OFFLINE_CAP_HOURS * 3600);
    var gain = getRate() * capped * OFFLINE_EFFICIENCY;
    if (gain <= 0) { return; }
    addEnergy(gain);
    if (capped >= 60) { showOffline(capped, gain); }
  }

  /* ==================================================================
   *  存档
   * ================================================================== */

  function saveGame() {
    state.lastSeen = Date.now();
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      toast('存档失败：浏览器存储不可用');
      return false;
    }
  }

  function parseSave(raw) {
    var data = JSON.parse(raw);
    var base = freshState();
    var merged = Object.assign(base, data);
    var prod = {};
    for (var i = 0; i < PRODUCERS.length; i++) {
      var id = PRODUCERS[i].id;
      prod[id] = (data.producers && Number(data.producers[id])) || 0;
    }
    merged.producers = prod;
    merged.upgrades = Object.assign({}, data.upgrades || {});
    return merged;
  }

  function loadGame() {
    var raw = null;
    try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { raw = null; }
    if (raw) {
      try {
        state = parseSave(raw);
      } catch (e) {
        state = freshState();
        toast('存档已损坏，已重新开始');
      }
    }
  }

  function b64encode(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) { bin += String.fromCharCode(bytes[i]); }
    return btoa(bin);
  }

  function b64decode(b64) {
    var bin = atob(b64.replace(/\s+/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) { bytes[i] = bin.charCodeAt(i); }
    return new TextDecoder().decode(bytes);
  }

  function exportSave() {
    saveGame();
    try {
      ui.saveText.value = b64encode(JSON.stringify(state));
      ui.saveHint.textContent = '已生成存档码，复制后存到备忘录。';
    } catch (e) {
      ui.saveHint.textContent = '生成失败：' + e.message;
    }
  }

  function importSave() {
    var code = (ui.saveText.value || '').trim();
    if (!code) { ui.saveHint.textContent = '请先粘贴存档码。'; return; }
    try {
      state = parseSave(b64decode(code));
      state.lastSeen = Date.now();
      saveGame();
      render();
      ui.saveHint.textContent = '导入成功。';
      toast('存档已导入');
    } catch (e) {
      ui.saveHint.textContent = '存档码无效。';
    }
  }

  function resetGame() {
    if (!window.confirm('确定要重置全部进度吗？此操作不可撤销。')) { return; }
    state = freshState();
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    saveGame();
    render();
    ui.saveModal.classList.add('hidden');
    toast('已重置');
  }

  function copySave() {
    var text = ui.saveText.value;
    if (!text) { ui.saveHint.textContent = '先点「导出」生成存档码。'; return; }
    ui.saveText.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    if (ok) {
      ui.saveHint.textContent = '已复制到剪贴板。';
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function () {
        ui.saveHint.textContent = '已复制到剪贴板。';
      }, function () {
        ui.saveHint.textContent = '复制失败，请长按文本框手动复制。';
      });
    } else {
      ui.saveHint.textContent = '复制失败，请长按文本框手动复制。';
    }
  }

  /* ==================================================================
   *  初始化
   * ================================================================== */

  function cacheDom() {
    ui.energy = $('energy');
    ui.rate = $('rate');
    ui.clickPower = $('click-power');
    ui.realm = $('realm');
    ui.realmNext = $('realm-next');
    ui.realmBar = $('realm-bar');
    ui.devour = $('devour');
    ui.producers = $('producers');
    ui.upgrades = $('upgrades');
    ui.offlineModal = $('offline-modal');
    ui.offlineText = $('offline-text');
    ui.saveModal = $('save-modal');
    ui.saveText = $('save-text');
    ui.saveHint = $('save-hint');
    ui.toast = $('toast');
  }

  function bindEvents() {
    ui.devour.addEventListener('click', devour);

    $('btn-save').addEventListener('click', function () { ui.saveModal.classList.remove('hidden'); });
    $('btn-close-save').addEventListener('click', function () { ui.saveModal.classList.add('hidden'); });
    $('btn-export').addEventListener('click', exportSave);
    $('btn-import').addEventListener('click', importSave);
    $('btn-copy').addEventListener('click', copySave);
    $('btn-reset').addEventListener('click', resetGame);
    $('offline-ok').addEventListener('click', function () { ui.offlineModal.classList.add('hidden'); });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        saveGame();
      } else {
        applyOffline();
        lastFrame = 0;
        render();
      }
    });
    window.addEventListener('pagehide', function () { saveGame(); });
  }

  function registerSW() {
    if (!('serviceWorker' in navigator)) { return; }
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') { return; }
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }

  function requestPersistentStorage() {
    try {
      if (navigator.storage && navigator.storage.persist) { navigator.storage.persist().catch(function () {}); }
    } catch (e) {}
  }

  function boot() {
    cacheDom();
    buildProducers();
    buildUpgrades();
    bindEvents();
    loadGame();
    applyOffline();
    render();
    requestPersistentStorage();
    registerSW();
    setInterval(saveGame, AUTOSAVE_MS);
    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
