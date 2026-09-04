## Required icon files

This extension expects the following PNGs to exist for local loading and Chrome Web Store packaging:

- `icons/icon16.png` (16x16)
- `icons/icon32.png` (32x32)
- `icons/icon48.png` (48x48)
- `icons/icon128.png` (128x128)

### Notes

- Use **PNG** (not SVG) for best compatibility with the Chrome Web Store pipeline.
- Keep the artwork high-contrast; small sizes should remain readable.

### Source

Rasterized from swissdev.tools' own favicon
(`assets/favicon.svg` in the swissdev.tools repo — code brackets + Swiss
cross on red, `#E63946`) at 512×512, then downscaled to each required
size. Regenerate with:

```
qlmanage -t -s 512 -o . assets/favicon.svg   # -> favicon.svg.png
sips -z <N> <N> favicon.svg.png --out icon<N>.png   # for N in 16 32 48 128
```
