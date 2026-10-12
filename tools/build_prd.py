# -*- coding: utf-8 -*-
"""生成《叫我罗城主》简易 PRD（阶段 0）的 docx。

数值全部来自 game.js 顶部「配置区」，逐条抄录，未做推测。
"""
import math
import os

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

DOC_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "docs")
DOCX_PATH = os.path.join(DOC_DIR, "叫我罗城主-PRD.docx")

DATE = "2026-10-11"
CJK = "微软雅黑"
LATIN = "Segoe UI"

# ---------------------------------------------------------------- 原始数值
PRODUCERS = [
    ("武者学徒", "tudi", "🥋", 15, 1.15, 0.1, "武馆里最能吃苦的一批人"),
    ("精神念师", "nianshi", "🧠", 120, 1.15, 1.2, "以精神念力压缩、提纯能量"),
    ("吞噬兽", "tunshou", "🐾", 1400, 1.15, 9, "来自异星的凶兽，本能即吞噬"),
    ("陨墨星舰队", "feichuan", "🛸", 18000, 1.15, 65, "横扫星域，按恒星单位收割"),
]

UPGRADES = [
    ("拳力淬炼", "quan", "👊", "clickAdd", 25, 1.9, "∞（无上限）", "吞噬之力 +（等级+1），每级叠加"),
    ("雷神传承", "leishen", "⚡", "clickMult", 500, 1, "1", "点击吞噬效果 ×2"),
    ("基因药剂", "jiyin", "🧪", "globalMult", 2500, 1, "1", "所有自动产出 ×2"),
    ("九重雷刀", "jiuchong", "🗡️", "clickMult", 9000, 1, "1", "点击吞噬效果 ×3"),
    ("精神网络", "jingshen", "🌐", "globalMult", 60000, 1, "1", "所有自动产出 ×3"),
]

REALMS = ["武徒@0", "武者@100", "武师@2000", "武尊@50000", "行星级@1e6", "恒星级@1e8",
          "宇宙级@1e10", "域主级@1e13", "界主级@1e16", "不朽@1e20"]

CONSTANTS = [
    ("SAVE_KEY", "lcz_save_v1", "localStorage 存档键名"),
    ("AUTOSAVE_MS", "10000", "自动存档间隔 10 秒"),
    ("OFFLINE_EFFICIENCY", "0.5", "离线收益效率 50%"),
    ("OFFLINE_CAP_HOURS", "8", "离线收益上限 8 小时（28800 秒）"),
    ("RENDER_MS", "100", "界面渲染节流 100 毫秒"),
    ("主循环 dt 上限", "1 秒", "回到前台时单帧结算不超过 1 秒，避免与离线收益重复计算"),
    ("列表可见阈值", "基础成本 × 0.4", "累计能量达到该值时，生产单位/升级行才显示"),
    ("存档版本号", "v: 1", "存档对象字段 v 的固定值；数字单位表 UNITS = K M B T Qa Qi Sx Sp Oc No Dc"),
]

FORMULAS = [
    ("成本（生产单位 / 升级）", "ceil(baseCost × costMult ^ 已拥有数量或等级)",
     "单位侧 4 项 costMult 均为 1.15，每招募一次复利涨价；升级侧只有「拳力淬炼」costMult = 1.9，"
     "其余 4 项 costMult = 1 且上限 1 级"),
    ("点击之力", "[1 + 拳力淬炼等级] × Π(clickMult 项的 value ^ 等级)",
     "基础值 1，拳力淬炼每级加法 +1；雷神传承 ×2、九重雷刀 ×3 依次相乘"),
    ("自动产出", "Σ(单位每秒产出 × 拥有数量) × 全局产出倍率；全局倍率 = Π(globalMult 项的 value ^ 等级)",
     "getRate() 的返回值，也是离线收益的计算基数；基因药剂 ×2、精神网络 ×3，同时持有时为 ×6"),
    ("主循环结算", "energy += getRate() × dt，dt = min(实际帧间隔, 1 秒)",
     "requestAnimationFrame 驱动，约 60 帧/秒；dt 上限 1 秒，避免回到前台时重复结算离线时段"),
    ("离线收益", "getRate() × min(离开秒数, 8×3600) × 0.5",
     "离开秒数 = (Date.now() − lastSeen)/1000，小于 1 秒不结算；计入时长 ≥ 60 秒才弹窗"),
    ("境界进度与判定", "进度 = (totalEnergy − 当前阈值) / (下一阈值 − 当前阈值)，夹在 0～1；"
                  "境界取 REALMS 中 at ≤ totalEnergy 的最后一个下标",
     "用累计获得量 totalEnergy（只增不减），不用可消费的 energy；进度条宽度 = 进度 × 100%，保留 1 位小数"),
    ("数字格式化 fmt", "n<1000 直接显示；否则每 1000 进一位并保留 2 位小数；非有限值显示 ∞",
     "<10 保留 2 位小数，<100 保留 1 位小数，整数直接显示；单位表最多到 Dc（1e33），≥1e36 改用科学计数法"),
]


def set_run(run, size=10.0, bold=False, color=None, name=CJK):
    run.font.name = LATIN
    run.font.size = Pt(size)
    run.bold = bold
    if color:
        run.font.color.rgb = RGBColor(*color)
    rpr = run._element.get_or_add_rPr()
    rfonts = rpr.find(qn("w:rFonts"))
    if rfonts is None:
        rfonts = rpr.makeelement(qn("w:rFonts"), {})
        rpr.insert(0, rfonts)
    rfonts.set(qn("w:eastAsia"), name)
    rfonts.set(qn("w:ascii"), LATIN)
    rfonts.set(qn("w:hAnsi"), LATIN)


def init_styles(doc):
    normal = doc.styles["Normal"]
    normal.font.name = LATIN
    normal.font.size = Pt(10.0)
    normal.element.rPr.rFonts.set(qn("w:eastAsia"), CJK)
    normal.paragraph_format.space_after = Pt(1.5)
    normal.paragraph_format.line_spacing = 1.0

    for name, size in (("Heading 1", 14), ("Heading 2", 11.5)):
        st = doc.styles[name]
        st.font.name = LATIN
        st.font.size = Pt(size)
        st.font.bold = True
        st.font.color.rgb = RGBColor(0x1F, 0x33, 0x55)
        st.element.rPr.rFonts.set(qn("w:eastAsia"), CJK)
        st.paragraph_format.space_before = Pt(8 if name == "Heading 1" else 5)
        st.paragraph_format.space_after = Pt(3)

    for section in doc.sections:
        section.page_width = Cm(21.0)
        section.page_height = Cm(29.7)
        section.top_margin = Cm(1.8)
        section.bottom_margin = Cm(1.8)
        section.left_margin = Cm(1.9)
        section.right_margin = Cm(1.9)


def h(doc, text, level=1):
    p = doc.add_heading(text, level=level)
    for r in p.runs:
        set_run(r, size=14 if level == 1 else 11.5, bold=True, color=(0x1F, 0x33, 0x55))
    return p


def para(doc, text, size=10.0, bullet=False, indent=0.0):
    p = doc.add_paragraph(style="List Bullet" if bullet else None)
    if indent:
        p.paragraph_format.left_indent = Cm(indent)
    set_run(p.add_run(text), size=size)
    return p


def rich(doc, parts, bullet=False):
    """parts: [(text, bold), ...]"""
    p = doc.add_paragraph(style="List Bullet" if bullet else None)
    for item in parts:
        text, bold = (item, False) if isinstance(item, str) else item
        set_run(p.add_run(text), bold=bold)
    return p


def table(doc, headers, rows, widths, size=8.5):
    t = doc.add_table(rows=1, cols=len(headers))
    t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    t.autofit = False
    for i, text in enumerate(headers):
        cell = t.rows[0].cells[i]
        cell.text = ""
        set_run(cell.paragraphs[0].add_run(text), size=size, bold=True)
        cell.paragraphs[0].paragraph_format.space_after = Pt(1)
    for row in rows:
        cells = t.add_row().cells
        for i, text in enumerate(row):
            cells[i].text = ""
            p = cells[i].paragraphs[0]
            p.paragraph_format.space_after = Pt(1)
            set_run(p.add_run(str(text)), size=size)
    for row in t.rows:
        for i, w in enumerate(widths):
            row.cells[i].width = Cm(w)
    return t


def main():
    os.makedirs(DOC_DIR, exist_ok=True)
    doc = Document()
    init_styles(doc)

    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_run(title.add_run("《叫我罗城主》简易 PRD"), size=20, bold=True, color=(0x14, 0x22, 0x3A))
    sub = doc.add_paragraph()
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_run(sub.add_run("阶段 0 已实现版本 · 纯前端离线放置增量游戏原型"), size=10, color=(0x55, 0x5F, 0x70))

    table(doc, ["项目", "内容"], [
        ("项目名", "叫我罗城主（同人练习作，题材取自《吞噬星空》）"),
        ("版本", "v0.1（阶段 0）"),
        ("文档类型", "简易 PRD"),
        ("作者", "个人开发（编程初学者，独立完成）"),
        ("更新日期", DATE),
    ], widths=[3.5, 13.5], size=9)

    # ------------------------------------------------------------ 1
    h(doc, "1. 项目概述")
    rich(doc, [("一句话定位：", True),
               ("《叫我罗城主》是一款纯前端、完全离线、只装在作者自己 Android 手机上的放置增量"
                "（incremental / idle）游戏原型，个人同人练习作。")])
    rich(doc, [("目标：", True),
               ("跑通「点击产出 → 招募生产单位 → 自动产出 → 购买升级 → 境界提升 → 数字变大」的最小闭环；"
                "验证纯 HTML/CSS/JS + PWA 在 Android Chrome 上的离线可用性与可安装性；把全部数值集中在一处，"
                "以后调平衡只改 game.js 顶部的配置区。")])
    rich(doc, [("非目标（阶段 0 明确不做）：", True),
               ("不做云存档；不做联网、账号与登录；不做多人、排行与社交；不公开分发、不上架应用商店；"
                "不盈利、不接广告；不做音效与美术资源。")])

    # ------------------------------------------------------------ 2
    h(doc, "2. 目标用户与使用场景")
    para(doc, "唯一用户就是作者本人，一个开发者同时是唯一玩家。", bullet=True)
    para(doc, "设备与形态：Android 手机竖屏（manifest 中 orientation 固定为 portrait），Chrome 浏览器打开，"
              "通过「添加到主屏幕」安装后以 standalone 模式全屏运行，没有地址栏。", bullet=True)
    para(doc, "使用节奏：碎片时间打开，单手点几下「吞噬」就切走；晚上锁屏几小时，第二天打开时由离线收益一次性结算。", bullet=True)
    para(doc, "环境与设计推论：地铁、电梯等无网络环境要能正常玩，打开即进游戏、不等加载、不需登录；"
              "因此按钮要足够大、可单手拇指触达，进度全部本地保存，"
              "离线收益必须在「回到前台」和「冷启动」两条路径上都能正确结算。", bullet=True)

    # ------------------------------------------------------------ 3
    h(doc, "3. 题材与世界观")
    para(doc, "资源与动作：唯一的资源叫「基因能量」，界面上的主数值区标签即为此。"
              "核心动作叫「吞噬」（代码中的 devour 函数），每点一次按钮获得一次基因能量。")
    para(doc, "数值分成两个：energy 是可消费的当前持有量，totalEnergy 是只增不减的累计获得量，"
              "境界只看 totalEnergy，这样买单位、买升级不会把境界进度退回去。", bullet=True)
    para(doc, "生产单位与升级的命名思路：单位沿「人类武者 → 精神念师 → 异星凶兽 → 星际舰队」这条从低到高的线，"
              "每个单位自带一句设定说明；升级按功法、秘宝、药剂三类取材，功能与名字尽量对得上——"
              "拳力淬炼是可反复叠加的肉身功法（点击加法），雷神传承与九重雷刀是点击倍率，"
              "基因药剂与精神网络是全局产出倍率。界面文案上，单位列表叫「麾下战力」，升级列表叫「功法与秘宝」，"
              "按钮按类型分为「招募」「获取」「参悟」（可叠加项用「参悟」）。", bullet=True)
    rich(doc, [("境界名占位声明：", True),
               ("代码 REALMS 数组里的境界名称（武徒 / 武者 / 武师 / 武尊 / 行星级 / 恒星级 / 宇宙级 / "
                "域主级 / 界主级 / 不朽）与对应阈值都是占位符，需要作者按自己对原著的记忆逐个校对修改。"
                "本文档只负责如实抄录代码现状，不对原著设定的准确性负责。")])

    # ------------------------------------------------------------ 4
    h(doc, "4. 核心玩法循环")
    para(doc, "点击「吞噬」→ 攒够基因能量 → 招募生产单位 → 单位每秒自动产出 → "
              "用能量购买升级放大点击与全局产出 → 累计能量推高境界 → 列表解锁更强的单位 → 数字继续变大，回到第一步。")
    para(doc, "循环中的两个加速点：升级带来的乘法（点击 ×2 / ×3、全局 ×2 / ×3）负责让数字陡增；"
              "境界提升只做展示，既不给数值加成、也不解锁内容（阶段 0 的刻意简化）；"
              "列表项的显隐由累计能量与基础成本的比例（totalEnergy ≥ baseCost × 0.4）单独决定，"
              "与境界无关——realmIndex() 只驱动徽章和进度条。", bullet=True)
    para(doc, "渐进解锁与节奏：列表项在「累计能量 ≥ 基础成本 × 0.4」时才出现，第一项武者学徒始终可见，"
              "避免一进游戏就看到满屏买不起的东西；阶段 0 不追求长期留存曲线，"
              "只要求单次会话内能明显感到「变快」，关掉应用后靠离线收益维持进度感。", bullet=True)

    # ------------------------------------------------------------ 5
    h(doc, "5. 阶段 0 功能清单")
    features = [
        "点击「吞噬」按钮产出基因能量，每次产出等于当前点击之力，并弹出飘字反馈",
        "4 个自动生产单位，成本随已拥有数量按 1.15 复利增长",
        "5 项升级，覆盖点击加法、点击乘法、全局产出乘法三种类型",
        "境界展示：标题栏境界徽章 + 下一境界文字 + 进度条",
        "离线收益：回到前台或冷启动时按时间戳一次性结算，并弹「修行归来」窗",
        "数字紧凑格式化：K / M / B / T / Qa / Qi / Sx / Sp / Oc / No / Dc，超出后用科学计数法",
        "localStorage 自动存档（每 10 秒一次，切后台、关闭页面、导出前各存一次）+ base64 存档码导入导出",
        "PWA 离线安装：manifest + Service Worker 缓存全部静态资源",
        "存储持久化申请 navigator.storage.persist()，降低被浏览器清理的概率",
        "渲染节流 100 毫秒，主循环用 requestAnimationFrame；列表项按累计能量渐进显示（阈值 = 基础成本 × 0.4）",
        "轻提示 toast（1.8 秒自动隐藏）与点击飘字（0.9 秒后移除），另含重置游戏",
    ]
    for f in features:
        rich(doc, [(f, False), ("　【已实现】", True)])

    # ------------------------------------------------------------ 6
    h(doc, "6. 数值与公式表")
    h(doc, "6.1 生产单位（PRODUCERS）", 2)
    table(doc, ["名称", "ID", "图标", "基础成本", "成本增长率", "每秒产出", "设定说明"],
          [(n, i, ic, bc, cm, r, d) for (n, i, ic, bc, cm, r, d) in PRODUCERS],
          widths=[2.2, 1.7, 1.0, 1.7, 2.0, 1.7, 6.7])

    sample_rows = []
    for (n, i, ic, bc, cm, r, d) in PRODUCERS:
        cells = [n, f"{r}/秒"]
        for owned in (0, 1, 10, 50):
            cells.append(f"{math.ceil(bc * cm ** owned):,}")
        sample_rows.append(tuple(cells))
    para(doc, "招募成本抽样（按 ceil(baseCost × 1.15^已拥有数量) 计算）：")
    table(doc, ["单位", "单价产出", "×0", "×1", "×10", "×50"],
          sample_rows, widths=[3.0, 2.0, 2.2, 2.2, 2.6, 3.0])

    h(doc, "6.2 升级（UPGRADES）", 2)
    table(doc, ["名称", "ID", "类型", "基础成本", "成长率", "上限", "效果"],
          [(n, i, t, bc, cm, mx, eff) for (n, i, ic, t, bc, cm, mx, eff) in UPGRADES],
          widths=[2.1, 1.9, 2.1, 1.8, 1.4, 1.9, 5.8])
    para(doc, "表中行序即代码 UPGRADES 数组的顺序，也就是界面上「功法与秘宝」列表的实际显示顺序。"
              "类型取值只有三种：clickAdd（点击加法，每级 +1）、clickMult（点击乘法，×value）、"
              "globalMult（全局产出乘法，×value）。4 项一次性升级的成长率均为 1、上限 1 级，"
              "因此实际只有「拳力淬炼」会随着购买不断涨价。", size=9)

    h(doc, "6.3 境界（REALMS，按累计基因能量解锁）", 2)
    table(doc, ["境界", "解锁阈值（累计基因能量）"],
          [(x.split("@")[0], x.split("@")[1]) for x in REALMS],
          widths=[4.0, 6.0])
    para(doc, "再次强调：以上境界名称与阈值均为占位符，需作者自行校对。", size=9)

    h(doc, "6.4 关键公式", 2)
    table(doc, ["项目", "公式（对应代码）", "说明"], FORMULAS, widths=[2.9, 6.6, 7.5], size=8.5)

    h(doc, "6.5 所有常量", 2)
    table(doc, ["常量 / 参数", "取值", "含义"], CONSTANTS, widths=[3.6, 5.2, 8.2], size=8.5)

    # ------------------------------------------------------------ 7
    h(doc, "7. 存档与离线收益规则")
    h(doc, "7.1 存档", 2)
    para(doc, "存储位置：localStorage，键名 lcz_save_v1（常量 SAVE_KEY），值是一段 JSON 字符串。", bullet=True)
    para(doc, "存档字段：v（版本号，固定 1）、energy、totalEnergy、clicks、producers（各生产单位数量）、"
              "upgrades（各升级等级）、startedAt、lastSeen。", bullet=True)
    para(doc, "自动存档时机：setInterval 每 10 秒一次（AUTOSAVE_MS = 10000）；"
              "document.hidden 变为 true 时（切后台）存一次；pagehide 事件存一次；点「导出」前先存一次；"
              "导入成功后立即存一次。", bullet=True)
    para(doc, "容错与重置：读档失败或 JSON 损坏时回到全新状态并提示「存档已损坏，已重新开始」，"
              "写入异常时提示「存档失败：浏览器存储不可用」；重置会清空 localStorage 中的该键并写入全新状态。",
         bullet=True)
    para(doc, "导入导出形式：整个 state 对象 → JSON.stringify → TextEncoder 转字节 → btoa，得到一段 base64 存档码；"
              "导入时先去掉所有空白字符再 atob 解码，然后走 parseSave：以 freshState() 为底合并，"
              "producers 逐项做 Number 转换、非法值归 0，upgrades 缺失则补空对象。"
              "存档码是明文 base64，不含加密。", bullet=True)

    h(doc, "7.2 离线收益", 2)
    para(doc, "结算公式：gain = getRate() × min(离开秒数, 8 × 3600) × 0.5；"
              "离开秒数 = (Date.now() − lastSeen) / 1000，不足 1 秒不结算。", bullet=True)
    para(doc, "触发点：冷启动 boot() 里调用一次 applyOffline()；"
              "从后台回到前台（visibilitychange）时再调用一次。结算后把 lastSeen 更新为当前时间。", bullet=True)
    para(doc, "提示：只有当被计入的时长 ≥ 60 秒时才弹「修行归来」窗，避免频繁开关弹窗打扰。", bullet=True)
    para(doc, "上限与效率：最多按 8 小时计，效率 50%。也就是说，离线收益永远低于一直开着游戏挂机，"
              "上限之外的时长直接作废。", bullet=True)
    rich(doc, [("为什么用时间戳而不是定时器累加：", True),
               ("手机浏览器在页面进入后台后会冻结或强节流 JS 定时器，锁屏时间长时页面甚至会被系统直接回收，"
                "定时器累加要么不执行、要么执行间隔完全不可信。用 Date.now() 记下 lastSeen，"
                "回到前台时按真实时间差一次性补算，结果与页面是否被冻结、被回收无关。"
                "同时主循环里的 dt 被限制在 1 秒以内，保证回到前台的那一帧只结算 1 秒，"
                "不会把离线时段重复计算一遍。")])

    # ------------------------------------------------------------ 8
    h(doc, "8. 界面结构")
    para(doc, "页面为单列竖屏布局，从上到下依次是：")
    table(doc, ["区块", "包含元素", "行为与说明"], [
        ("① 标题栏 header.top", "h1「叫我罗城主」、💾 存档按钮、#realm 境界徽章、#realm-next 下一境界文字、#realm-bar 进度条",
         "点存档按钮打开存档弹窗，不跳转页面；境界文字形如「下一境界：武者（1.23K / 100）」，"
         "已到最高境界时显示「已达当前版本最高境界」；进度条宽度 = 当前境界内进度百分比，保留 1 位小数"),
        ("② 主数值区 hero", "「基因能量」标签、#energy、#rate、#devour 按钮",
         "#rate 形如「+1.20K / 秒」；吞噬按钮显示「吞 噬」与「每次 +N」，每次点击调用 devour()"),
        ("③ 麾下战力 panel", "#producers 列表",
         "每行：图标 + 名称 + ×拥有数 + 设定说明 + 当前或基础产出 + 招募按钮（按钮内显示成本，买得起时高亮，买不起时禁用）"),
        ("④ 功法与秘宝 panel", "#upgrades 列表",
         "每行：图标 + 名称 + 等级或「已获得」+ 效果描述 + 获取/参悟按钮（含成本，满级后显示「已满级」并置灰）"),
        ("⑤ 底部 footer.foot", "阶段 0 原型、离线收益说明",
         "固定文案「离线收益：最多 8 小时，效率 50%」"),
        ("弹窗与浮层", "#offline-modal「修行归来」、#save-modal「存档」、#toast、.float",
         "离线窗显示离开时长与带回的基因能量，「收下」关闭；存档窗含导出 / 复制 / 导入 / 重置四个按钮、"
         "存档码文本框与状态提示；toast 1.8 秒后自动隐藏；飘字随机水平偏移，0.9 秒后从 DOM 移除"),
    ], widths=[3.2, 4.4, 9.4], size=8.5)

    # ------------------------------------------------------------ 9
    h(doc, "9. 技术选型与部署")
    h(doc, "9.1 为什么用纯前端 PWA", 2)
    table(doc, ["候选方案", "优点", "缺点", "结论"], [
        ("原生 Android（Kotlin/Java）", "性能最好，系统能力齐全",
         "要装 Android Studio 与 SDK、学 Gradle、会签名打包；改一行数值也要重新构建安装", "不选"),
        ("游戏引擎（Unity / Godot）", "现成 UI 组件、动画与音效系统",
         "安装包几十 MB，对纯数字文本界面是杀鸡用牛刀；构建链长，迭代一次要等很久", "不选"),
        ("纯前端 PWA（HTML/CSS/JS）", "零依赖、零构建，双击 index.html 就能预览；"
                                    "Service Worker 让断网可玩；Chrome「添加到主屏幕」即得全屏应用；"
                                    "改完拖到静态托管就完成更新",
         "没有原生能力，UI 组件全部手写；离线能力受浏览器缓存策略影响", "选中（阶段 0）"),
    ], widths=[3.2, 4.6, 6.6, 2.6], size=8.5)

    h(doc, "9.2 部署到 Android 手机", 2)
    steps = [
        "在电脑上双击 index.html 预览（file:// 协议下 Service Worker 不生效，但游戏本身正常运行）。",
        "打开 https://app.netlify.com/drop，把整个 luo-chengzhu 文件夹拖进去，无需注册命令行或使用 git。",
        "拿到形如 https://xxx.netlify.app 的网址。",
        "手机 Chrome 打开该网址，右上角菜单选择「安装应用」或「添加到主屏幕」。",
        "以后从桌面图标进入：无地址栏、竖屏全屏、断网也能玩。",
    ]
    for i, s in enumerate(steps, 1):
        para(doc, f"{i}. {s}")
    para(doc, "备选托管：也可以用 Cloudflare Drop——把整个文件夹拖进浏览器窗口即可，"
              "同样不需要注册账号，但生成的临时链接约 1 小时有效；点 Claim 登录后可永久保留。"
              "两种方式都只做静态托管，游戏的离线能力全部来自 Service Worker。")
    rich(doc, [("必须注意的坑：", True),
               ("sw.js 的缓存名为 CACHE = 'lcz-v1'，fetch 采用缓存优先（cache-first）。"
                "每次改完 index.html / style.css / game.js，都要手动把 sw.js 里的 CACHE 版本号 +1"
                "（lcz-v1 → lcz-v2 → lcz-v3……），否则手机会一直命中旧缓存、一直用旧版本，"
                "改了什么都不会生效。改完版本号后重新拖到静态托管覆盖，手机上重新打开一次"
                "（可能需要下拉刷新）才会更新；activate 阶段会顺带删除所有非当前版本的旧缓存。")])

    # ------------------------------------------------------------ 10
    h(doc, "10. 后续阶段规划")
    table(doc, ["阶段", "范围", "备注"], [
        ("阶段 1", "转生 / 飞升重置层（重置节点、永久倍率、二次确认）；在陨墨星舰队之后继续增加生产层级；"
                 "成就系统（基于 clicks、totalEnergy、单位总量解锁并给少量全局加成）",
         "转生层解决「后期只剩等数字」的问题，是增量的核心留存层；新单位直接往 PRODUCERS 里追加，"
         "成就需新增 ACHIEVEMENTS 配置与存档字段，注意存档版本号 v 的兼容处理"),
        ("阶段 2", "平衡性打磨：重排成本增长率与「产出 / 成本」比，控制各境界的到达时长；音效与动画特效",
         "平衡优先改配置区数值、不改逻辑；音效注意移动端自动播放限制，需用户首次交互后才能播放"),
        ("阶段 2", "大数库 break_infinity 的引入：把原生 number 换成大数对象",
         "触发时机约在数值接近 1e308 时；界主级(1e16)与不朽(1e20)远未触及，"
         "但加上转生倍率后需提前评估。引入时 fmt()、getRate()、成本计算等所有算术点都要同步替换"),
    ], widths=[1.8, 8.4, 6.8], size=8.5)

    # ------------------------------------------------------------ 11
    h(doc, "11. 风险与注意事项")
    para(doc, "浏览器可能清理 localStorage：存储压力、无痕模式、用户清理站点数据、系统清理都会让存档消失。"
              "已用 navigator.storage.persist() 申请持久化以降低概率，但这只是申请、不是保证；"
              "仍应定期点「导出」生成存档码备份。另外 SAVE_KEY（lcz_save_v1）一旦改名，等同于旧存档直接失效。",
         bullet=True)
    para(doc, "同人作品的版权归属：本作是个人学习用的同人练习作，题材取自《吞噬星空》，"
              "相关原作权利归原作者所有；不用于任何商业用途、不公开分发、不盈利，"
              "所有命名与设定仅为自用练习，不主张任何权利。", bullet=True)
    para(doc, "单一存档、无云端备份：全部进度只有手机本地一份，加上手动导出的 base64 存档码；"
              "手机丢失、系统重装、浏览器数据被清空都会直接丢档。存档码是明文 base64，"
              "体积很小但不要贴到公开渠道。", bullet=True)
    para(doc, "大数溢出的临界点：当前使用原生 number，超过约 1.8e308 会变成 Infinity，"
              "格式化函数会直接显示「∞」并从此失去意义。阶段 0 的最高境界不朽只需 1e20，"
              "距离临界点很远，风险主要来自后续阶段 1 的转生倍率叠加——届时应重新估算上限，"
              "必要时按阶段 2 的计划引入 break_infinity。", bullet=True)
    para(doc, "离线收益的两个硬边界：只在「冷启动」和「回到前台」结算，游戏开着时的中途切换不会补算；"
              "上限 8 小时意味着更久的离开会被浪费。这些都是阶段 0 的刻意限制——无成就、无音效、"
              "无重置层同样如此，留待阶段 1 / 2。", bullet=True)

    # ------------------------------------------------------------ 版权
    doc.add_paragraph()
    p = doc.add_paragraph()
    set_run(p.add_run("本作为个人学习用的同人作品，《吞噬星空》相关原作权利归原作者所有，"
                      "不用于任何商业用途、不公开分发。"), size=9, color=(0x66, 0x66, 0x66))

    doc.save(DOCX_PATH)
    print("saved:", DOCX_PATH)


if __name__ == "__main__":
    main()
