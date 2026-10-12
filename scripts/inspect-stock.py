"""Offline inspection sheets and technical measurements. Requires Pillow and imageio-ffmpeg.
Does not classify or approve assets. Example: --catalog src/stock/catalog.json --root scratch --out artifacts/stock/inspection
"""
import argparse, hashlib, json, pathlib, subprocess
from PIL import Image, ImageDraw, ImageOps
import imageio_ffmpeg

p = argparse.ArgumentParser()
p.add_argument('--catalog', required=True); p.add_argument('--root', required=True); p.add_argument('--out', required=True)
a = p.parse_args(); out = pathlib.Path(a.out); out.mkdir(parents=True, exist_ok=True)
catalog = json.loads(pathlib.Path(a.catalog).read_text(encoding='utf-8'))
tiles = []; measurements = {}; ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
for item in catalog['items']:
    file = pathlib.Path(a.root) / item['src'].lstrip('/')
    thumb = pathlib.Path(a.root) / item['thumb'].lstrip('/')
    data = file.read_bytes(); m = dict(sha256=hashlib.sha256(data).hexdigest(), bytes=len(data), thumbSha256=hashlib.sha256(thumb.read_bytes()).hexdigest(), thumbBytes=thumb.stat().st_size)
    frames = []
    if item['kind'] == 'image':
        with Image.open(file) as im:
            m.update(width=im.width, height=im.height)
            gray=im.convert("L").resize((9,8)); px=list(gray.getdata()); m["perceptualHash"]="%016x" % sum((px[y*9+x] > px[y*9+x+1]) << (y*8+x) for y in range(8) for x in range(8))
            frames.append((ImageOps.exif_transpose(im).convert('RGB').copy(), ''))
    else:
        reader = imageio_ffmpeg.read_frames(str(file)); meta = next(reader); reader.close()
        m.update(width=meta['size'][0], height=meta['size'][1], duration=meta['duration'])
        for fraction in [0.1, 0.5, 0.9]:
            seconds = meta['duration'] * fraction; dest = out / f"{item['id']}-{fraction}.jpg"
            subprocess.run([ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-ss', str(seconds), '-i', str(file), '-frames:v', '1', str(dest)], check=True)
            frames.append((Image.open(dest).convert('RGB'), f'{seconds:.1f}s'))
    measurements[item['id']] = m
    for frame, timestamp in frames:
        tile = Image.new('RGB', (400, 310), 'white'); frame.thumbnail((390, 260)); tile.paste(frame, ((400-frame.width)//2, 0))
        ImageDraw.Draw(tile).text((5, 266), f"{item['id']} {timestamp}\n{m['width']}x{m['height']}", fill='black'); tiles.append(tile)
for start in range(0, len(tiles), 12):
    batch = tiles[start:start+12]; sheet=Image.new('RGB',(1600,310*((len(batch)+3)//4)), '#ddd')
    for n,tile in enumerate(batch): sheet.paste(tile, ((n%4)*400,(n//4)*310))
    sheet.save(out / f'sheet-{start//12+1}.jpg', quality=90)
(out/'measurements.json').write_text(json.dumps(measurements,indent=2)+'\n')
print(f"Measured {len(measurements)} assets; {len(tiles)} inspection tiles at {out}")

near=[]
entries=[(k,v["perceptualHash"]) for k,v in measurements.items() if "perceptualHash" in v]
for n,(ident,ph) in enumerate(entries):
    for other,oh in entries[n+1:]:
        distance=(int(ph,16)^int(oh,16)).bit_count()
        if distance<=6: near.append(dict(first=ident,second=other,distance=distance,decision="needs inspection; do not auto-delete"))
(out/"near-duplicates.json").write_text(json.dumps(near,indent=2)+"\n")
