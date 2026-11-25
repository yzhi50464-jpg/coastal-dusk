"""Size/re-encode official maps without any ICC, gamma or tone conversion.
Normal and ARM channels are numerical data, so RGB values are resized directly.
Pillow is a build-time dependency only; runtime textures are embedded in JS.
"""
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageFile, ImageStat

ROOT = Path(__file__).resolve().parent
ImageFile.MAXBLOCK = 8 * 1024 * 1024
OUT = ROOT / 'processed'
OUT.mkdir(exist_ok=True)
manifest = json.loads((ROOT / 'sources.json').read_text(encoding='utf-8-sig'))
for record in manifest['files']:
    source = (ROOT / record['path']).read_bytes()
    assert hashlib.md5(source).hexdigest() == record['officialMD5']
    assert hashlib.sha256(source).hexdigest() == record['sha256']

summary = {}
for key, suffix, size, quality in [('diffuse', 'diff', 1024, 88), ('normal', 'nor_gl', 512, 97), ('arm', 'arm', 512, 93)]:
    source = ROOT / 'original' / 'textures' / f'coast_rocks_05_{suffix}_1k.jpg'
    image = Image.open(source).convert('RGB')
    original_size = list(image.size)
    resized = image.resize((size, size), Image.Resampling.LANCZOS)
    target = OUT / f'{key}-{size}.jpg'
    # No ImageCms, view transform, exposure adjustment or color grade.
    resized.save(target, 'JPEG', quality=quality, subsampling=0, optimize=True)
    decoded = Image.open(target).convert('RGB')
    mae = ImageStat.Stat(ImageChops.difference(resized, decoded)).mean
    if key in ('normal', 'arm') and max(mae) > 5:
        raise RuntimeError('Numerical-map compression error is unexpectedly large')
    summary[key] = {
        'source': source.relative_to(ROOT).as_posix(), 'sourceSize': original_size,
        'path': target.relative_to(ROOT).as_posix(), 'size': [size, size], 'quality': quality,
        'jpegChromaSubsampling': '4:4:4', 'colorTransform': 'none; direct RGB channel resampling',
        'meanAbsoluteCompressionErrorPerChannel255': mae,
        'bytes': target.stat().st_size, 'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
    }
(ROOT / 'texture-build.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
print('COAST_TEXTURES', json.dumps(summary), flush=True)
