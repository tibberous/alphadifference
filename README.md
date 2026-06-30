# AlphaDifference

**Extract what changed between two images onto transparency.** The one-click that
Photoshop never shipped - and ImageMagick has had for decades (`-compose ChangeMask`).

You edited a flattened image and forgot to put the edit on its own layer? Painted
some torches, retouched a photo? AlphaDifference recovers *just that edit* onto clean
alpha. Same op, **five ways** - pick whatever fits your setup:

| Form | File | Needs | Notes |
|---|---|---|---|
| **Web tool** | [alphadifference.tristate.digital](https://alphadifference.tristate.digital) | a browser | upload 2 images, tweak settings, download the diff. Runs 100% in your browser - images never leave your machine. |
| **PS plugin (UXP)** | `plugin/` | PS 23.5+, UXP DevTool | `Plugins ▸ Alpha Diff`. The clean, pixel-exact version. |
| **PS script (UXP)** | `alpha_diff.psjs` | PS 23.5+ | `File ▸ Scripts ▸ Browse`. No install. |
| **PS script (ExtendScript)** | `AlphaDiff.jsx` | **any** Photoshop (CS6+) | `File ▸ Scripts ▸ Browse`. Settings dialog. No UXP/CC. |
| **CLI (Python + ImageMagick)** | `cli/alphadifference.py` | ImageMagick | scriptable/batch; auto-installs ImageMagick. |

## Algorithms & settings (all forms)
- **Changed pixels** - keep the *after* image's original colors where they changed.
- **Difference** - the raw delta colors (`|after - before|`).
- **Soft** edge - alpha scales with how much each pixel changed (smooth; great for light/glow).
- **Hard** edge - solid where changed (uses a tolerance).
- **Tolerance** (0-100) and **Feather** (px).

Both inputs must be the same size and pixel-aligned (same base, differing only by the edit).

## CLI quickstart
```
python cli/alphadifference.py AFTER.png BEFORE.png OUT.png --mode soft --feather 2 --trim
# modes: changemask (changed pixels) | subtract (difference) | soft
```

## ExtendScript / UXP quickstart
Stack the **after** layer on top, the **before** below, select them (or just have them as
the top two layers for the .jsx), and run. A new "Alpha Diff" layer appears.

## License
MIT - see [LICENSE](./LICENSE). Built by [TriState.Digital](https://tristate.digital), given to the community. 🔥
