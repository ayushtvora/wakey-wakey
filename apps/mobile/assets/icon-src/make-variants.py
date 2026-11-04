# Writes the icon variant SVGs (icon, icon-dark, icon-tinted, icon-dev) into OUT_DIR.
# Usage: python make-variants.py OUT_DIR
# Then render each SVG to a 1024x1024 PNG (e.g. headless Edge/Chrome --screenshot with
# --default-background-color=00000000) and copy the PNGs into ../
import sys, pathlib
out = pathlib.Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
src = (pathlib.Path(__file__).parent / 'icon.svg').read_text()
ORANGE = ('#ffb347', '#ff7a1a')
variants = {
  'icon':        dict(bg=True,  glow=True,  metal=ORANGE,                 face='#12162b'),
  'icon-dark':   dict(bg=False, glow=True,  metal=ORANGE,                 face='#12162b'),
  'icon-tinted': dict(bg=False, glow=False, metal=('#ffffff', '#cfcfcf'), face='#000000'),
  'icon-dev':    dict(bg=True,  glow=True,  metal=('#8fd0ff', '#2f7bff'), face='#12162b'),
}
for name, v in variants.items():
    s = src
    if not v['bg']:
        s = s.replace('<rect width="1024" height="1024" fill="url(#bg)"/>', '')
    if not v['glow']:
        s = s.replace('<circle cx="512" cy="560" r="420" fill="url(#glow)"/>', '')
    if v['metal'] != ORANGE:
        top, bottom = v['metal']
        s = s.replace('#ffb347', top).replace('#ff7a1a', bottom).replace('#ff9a35', top)
        glow = '#5aa8ff' if name == 'icon-dev' else top
        s = s.replace('#ff8a2a', glow)
    s = s.replace('fill="#12162b"', f'fill="{v["face"]}"')
    (out / f'{name}.svg').write_text(s)
    print(name)
