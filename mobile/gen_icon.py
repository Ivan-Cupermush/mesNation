from PIL import Image, ImageDraw
import os

RES = "/home/ivan/Projects/mesNation/mobile/android/app/src/main/res"
TOP = (47, 181, 121)      # светлый изумруд (верх)
BOT = (18, 92, 60)        # тёмный изумруд (низ)
WHITE = (255, 255, 255, 255)
DOT = (31, 122, 82, 255)  # фирменный акцент #1F7A52
HI = 1024                 # базовое разрешение

def rrect(draw, box, radius, fill):
    try:
        draw.rounded_rectangle(box, radius=radius, fill=fill)
    except AttributeError:
        x0, y0, x1, y1 = box
        draw.rectangle([x0+radius, y0, x1-radius, y1], fill=fill)
        draw.rectangle([x0, y0+radius, x1, y1-radius], fill=fill)
        draw.pieslice([x0, y0, x0+2*radius, y0+2*radius], 180, 270, fill=fill)
        draw.pieslice([x1-2*radius, y0, x1, y0+2*radius], 270, 360, fill=fill)
        draw.pieslice([x0, y1-2*radius, x0+2*radius, y1], 90, 180, fill=fill)
        draw.pieslice([x1-2*radius, y1-2*radius, x1, y1], 0, 90, fill=fill)

def gradient(size):
    img = Image.new('RGBA', (size, size), (0,0,0,0))
    d = ImageDraw.Draw(img)
    for y in range(size):
        t = y / max(size-1, 1)
        r = int(TOP[0]+(BOT[0]-TOP[0])*t)
        g = int(TOP[1]+(BOT[1]-TOP[1])*t)
        b = int(TOP[2]+(BOT[2]-TOP[2])*t)
        d.line([(0, y), (size, y)], fill=(r, g, b, 255))
    return img

def bubble(draw, size, scale):
    s = size/1024.0*scale
    cx = cy = size/2.0
    bw, bh = 560*s, 430*s
    l, t = cx-bw/2, cy-bh/2
    rr, bo = cx+bw/2, cy+bh/2
    rrect(draw, [l, t, rr, bo], 130*s, WHITE)               # тело баббла
    draw.polygon([(l+95*s, bo-2*s), (l+235*s, bo-2*s),      # хвостик
                  (l+55*s, bo+100*s)], fill=WHITE)
    dr = 34*s                                               # три точки (печатает...)
    for dx in (-140*s, 0, 140*s):
        draw.ellipse([cx+dx-dr, cy-dr, cx+dx+dr, cy+dr], fill=DOT)

def icon_full(shape):
    bg = gradient(HI)
    mask = Image.new('L', (HI, HI), 0)
    md = ImageDraw.Draw(mask)
    if shape == 'circle':
        md.ellipse([0, 0, HI-1, HI-1], fill=255)
    else:
        rrect(md, [0, 0, HI-1, HI-1], int(HI*0.22), 255)
    img = Image.new('RGBA', (HI, HI), (0,0,0,0))
    img.paste(bg, (0, 0), mask)
    bubble(ImageDraw.Draw(img), HI, 1.0)
    return img

def icon_fg():
    img = Image.new('RGBA', (HI, HI), (0,0,0,0))
    bubble(ImageDraw.Draw(img), HI, 0.8)
    return img

DENS = {'mdpi':48, 'hdpi':72, 'xhdpi':96, 'xxhdpi':144, 'xxxhdpi':192}
ADAP = {'mdpi':108, 'hdpi':162, 'xhdpi':216, 'xxhdpi':324, 'xxxhdpi':432}

sq = icon_full('squircle')
ci = icon_full('circle')
fg = icon_fg()
bgc = gradient(HI)

for d, px in DENS.items():
    dp = os.path.join(RES, 'mipmap-'+d)
    os.makedirs(dp, exist_ok=True)
    sq.resize((px, px), Image.LANCZOS).save(dp+'/ic_launcher.png')
    ci.resize((px, px), Image.LANCZOS).save(dp+'/ic_launcher_round.png')
    fg.resize((ADAP[d], ADAP[d]), Image.LANCZOS).save(dp+'/ic_launcher_foreground.png')
    bgc.resize((ADAP[d], ADAP[d]), Image.LANCZOS).save(dp+'/ic_launcher_background.png')
    print('OK', d, '->', px, 'px')

ad = os.path.join(RES, 'mipmap-anydpi-v26')
os.makedirs(ad, exist_ok=True)
xml = ('<?xml version="1.0" encoding="utf-8"?>\n'
       '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
       '    <background android:drawable="@mipmap/ic_launcher_background"/>\n'
       '    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n'
       '</adaptive-icon>\n')
open(ad+'/ic_launcher.xml', 'w').write(xml)
open(ad+'/ic_launcher_round.xml', 'w').write(xml)
print('Adaptive icon XML готов')
print('ГОТОВО! Иконки сгенерированы.')
