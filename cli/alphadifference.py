#!/usr/bin/env python3
"""image_difference_alpha_hook.py - extract / visualize what CHANGED between two
images. The "I edited a flattened image and forgot to put the edit on its own
layer" recovery tool. Thin wrapper over ImageMagick (auto-installs it if missing).

Two algorithms (+ a soft variant):
  changemask (default) - "changed pixels": keep AFTER's pixels (TRUE color) where
                         they differ; unchanged pixels become transparent (alpha).
  subtract             - "pixel subtraction": the per-pixel difference image
                         (PS "Difference" look), opaque. Black where identical.
  soft                 - changemask, but alpha = HOW MUCH each pixel changed
                         (smooth falloff; best for light/glow, e.g. torches).

Adjustables:
  --fuzz N      tolerance %% (0-100). Raise to kill JPEG/anti-alias speckle.
  --feather N   gaussian-blur the alpha edge by radius N px (soften the cut).
  --trim        crop the result to the changed bounding box.

CLI:
  python image_difference_alpha_hook.py AFTER BEFORE OUT \
         [--mode changemask|subtract|soft] [--fuzz 5] [--feather 0] [--trim]

  AFTER  = image WITH the edit (its pixels are kept on the cutout).
  BEFORE = original reference. MUST be same size / pixel-aligned.

Deps: ImageMagick (`magick`). If absent, this auto-installs it (winget -> choco
on Windows; prints brew/apt hints elsewhere). Pass --no-install to skip that.

Sibling: the in-app Photoshop UXP plugin at Desktop\alpha-diff does the same op.
First used on the ArcoMage quarry torches (2026-06-29).
"""
import os, sys, glob, shutil, subprocess, argparse


def _find_magick():
    """Return a usable magick path, scanning PATH then standard install dirs
    (winget/choco often don't refresh PATH for the current process)."""
    p = shutil.which("magick") or shutil.which("convert")
    if p:
        return p
    for pat in (r"C:\Program Files\ImageMagick*\magick.exe",
                r"C:\Program Files (x86)\ImageMagick*\magick.exe",
                "/usr/bin/magick", "/usr/local/bin/magick", "/opt/homebrew/bin/magick"):
        hits = sorted(glob.glob(pat))
        if hits:
            return hits[-1]
    return None


def ensure_magick(auto_install=True):
    """Make sure ImageMagick is available; try to install it if not."""
    m = _find_magick()
    if m:
        return m
    if not auto_install:
        sys.exit("ImageMagick not found. Install it, or drop --no-install.")
    print("ImageMagick not found - attempting install...")
    attempts = []
    if os.name == "nt":
        attempts = [
            ["winget", "install", "--id", "ImageMagick.ImageMagick", "-e", "--silent",
             "--accept-package-agreements", "--accept-source-agreements"],
            ["choco", "install", "imagemagick", "-y"],
        ]
    elif sys.platform == "darwin":
        attempts = [["brew", "install", "imagemagick"]]
    else:
        attempts = [["sudo", "apt-get", "install", "-y", "imagemagick"]]
    for cmd in attempts:
        if not shutil.which(cmd[0]):
            continue
        print("  via", cmd[0], "...")
        try:
            subprocess.run(cmd, check=False)
        except Exception as e:
            print("   ", e)
        m = _find_magick()
        if m:
            print("  installed ->", m)
            return m
    sys.exit("Could not auto-install ImageMagick. Get it from "
             "https://imagemagick.org/script/download.php and retry.")


def _feather(radius):
    return ["-channel", "A", "-gaussian-blur", "0x%g" % float(radius), "+channel"] if radius else []


def image_difference_alpha(after, before, out, mode="changemask",
                           fuzz=5, feather=0, trim=False, auto_install=True):
    """Run the diff; returns the output path. Raises on magick failure."""
    m = ensure_magick(auto_install)
    fz = "%d%%" % int(fuzz)
    if mode == "changemask":
        cmd = [m, after, before, "-fuzz", fz, "-compose", "ChangeMask", "-composite"]
        cmd += _feather(feather)
    elif mode == "soft":
        cmd = [m, after, "(", after, before, "-compose", "difference", "-composite",
               "-colorspace", "Gray", "-auto-level", ")",
               "-alpha", "off", "-compose", "CopyOpacity", "-composite"]
        cmd += _feather(feather)
    elif mode in ("subtract", "delta", "difference"):
        # the pixel-difference image (opaque). No alpha, so feather is a no-op.
        cmd = [m, after, before, "-compose", "difference", "-composite"]
    else:
        raise ValueError("mode must be changemask | subtract | soft")
    # trim only applies to the alpha cutout modes; subtract is full-frame by design
    if trim and mode not in ("subtract", "delta", "difference"):
        cmd += ["-trim", "+repage"]
    cmd += [out]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError("magick failed: " + (r.stderr or r.stdout).strip())
    return out


def main():
    ap = argparse.ArgumentParser(prog="image_difference_alpha_hook")
    ap.add_argument("after", help="image WITH the edit (kept on the cutout)")
    ap.add_argument("before", help="original reference (same size/aligned)")
    ap.add_argument("out", help="output image")
    ap.add_argument("--mode", default="changemask",
                    choices=["changemask", "subtract", "soft", "delta", "difference"])
    ap.add_argument("--fuzz", type=int, default=5, help="tolerance %% (0-100)")
    ap.add_argument("--feather", type=float, default=0, help="soften alpha edge, px radius")
    ap.add_argument("--trim", action="store_true", help="crop to the changed bbox")
    ap.add_argument("--no-install", action="store_true", help="don't auto-install ImageMagick")
    a = ap.parse_args()
    for f in (a.after, a.before):
        if not os.path.isfile(f):
            sys.exit("not found: " + f)
    out = image_difference_alpha(a.after, a.before, a.out, a.mode,
                                 a.fuzz, a.feather, a.trim, auto_install=not a.no_install)
    print("wrote", out)


if __name__ == "__main__":
    main()
