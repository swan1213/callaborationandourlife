# Converts the captured PNGs to the WebP files the Help guide loads. Usage: python to-webp.py <png dir> <out dir>
import os
import sys

from PIL import Image

src, out = sys.argv[1], sys.argv[2]
for name in sorted(os.listdir(src)):
    if name.endswith(".png"):
        Image.open(os.path.join(src, name)).convert("RGB").save(os.path.join(out, name[:-4] + ".webp"), "WEBP", quality=82, method=6)
        print(name[:-4] + ".webp")
