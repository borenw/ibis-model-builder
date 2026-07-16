#!/usr/bin/env python3
"""
build.py -- bundle the multi-file app into ONE self-contained HTML file.

Inlines css/style.css and every js/*.js referenced by index.html so the
result is a single .html you can download and double-click offline
(no server, no separate files). Output: dist/ibis-model-builder.html

Usage:  python3 build.py
"""
import os
import re

ROOT = os.path.dirname(os.path.abspath(__file__))

def read(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8") as f:
        return f.read()

html = read("index.html")

# Inline the stylesheet.
def inline_css(m):
    href = m.group(1)
    return "<style>\n" + read(href) + "\n</style>"
html = re.sub(r'<link[^>]*href="([^"]+\.css)"[^>]*>', inline_css, html)

# Inline every local script (skip anything with a protocol / //).
def inline_js(m):
    src = m.group(1)
    if "://" in src or src.startswith("//"):
        return m.group(0)
    return "<script>\n" + read(src) + "\n</script>"
html = re.sub(r'<script[^>]*src="([^"]+\.js)"[^>]*></script>', inline_js, html)

os.makedirs(os.path.join(ROOT, "dist"), exist_ok=True)
out = os.path.join(ROOT, "dist", "ibis-model-builder.html")
with open(out, "w", encoding="utf-8") as f:
    f.write(html)

size = os.path.getsize(out)
remaining = re.findall(r'(?:src|href)="([^"]+\.(?:js|css))"', html)
local_remaining = [r for r in remaining if "://" not in r]
print(f"Wrote {out}  ({size/1024:.1f} KB)")
print("Un-inlined local refs:", local_remaining if local_remaining else "none")
