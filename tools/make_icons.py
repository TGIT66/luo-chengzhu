# -*- coding: utf-8 -*-
"""生成 PWA 图标：192 / 512。深空底 + 金色圆环 + 「罗」字。"""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), 'icons')
os.makedirs(OUT, exist_ok=True)

FONT_CANDIDATES = [
    r'C:\Windows\Fonts\msyhbd.ttc',
    r'C:\Windows\Fonts\msyh.ttc',
    r'C:\Windows\Fonts\simhei.ttf',
]


def load_font(size):
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size, index=0)
            except Exception:
                continue
    return ImageFont.load_default()


def make(size, path):
    img = Image.new('RGB', (size, size), (5, 7, 13))
    d = ImageDraw.Draw(img)
    cx = cy = size / 2.0

    # 背景辉光（多层叠加的椭圆）
    glow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    steps = 48
    for i in range(steps, 0, -1):
        r = size * 0.60 * i / steps
        t = i / float(steps)
        a = int(52 * (1 - t) ** 1.6)
        gd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(36, 84, 186, a))
    img = Image.alpha_composite(img.convert('RGBA'), glow).convert('RGB')
    d = ImageDraw.Draw(img)

    # 金色外环 + 青色内环
    ring_w = max(2, int(size * 0.018))
    pad = size * 0.115
    d.ellipse([pad, pad, size - pad, size - pad], outline=(255, 204, 77), width=ring_w)
    pad2 = size * 0.175
    d.ellipse([pad2, pad2, size - pad2, size - pad2],
              outline=(79, 209, 255), width=max(1, int(size * 0.008)))

    # 「罗」字（约占画布 46%，maskable 裁切也安全）
    font = load_font(int(size * 0.46))
    try:
        d.text((cx, cy + size * 0.005), '罗', font=font, fill=(255, 214, 102), anchor='mm')
    except Exception:
        d.text((cx, cy), '罗', font=font, fill=(255, 214, 102))

    img.save(path, 'PNG', optimize=True)
    return path


for s in (192, 512):
    p = make(s, os.path.join(OUT, 'icon-%d.png' % s))
    print('written', p, os.path.getsize(p), 'bytes')
