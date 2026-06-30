/*
 * Alpha Diff - extract the pixels that changed between two layers onto a new
 * transparent layer. The one-click Photoshop never shipped (ImageMagick's
 * `-compose ChangeMask`). MIT - TriState.Digital.
 *
 * Usage: select exactly TWO layers - the "after" (with your edit) ABOVE the
 * "before" (original) - then run Plugins > Alpha Diff. A new "Alpha Diff" layer
 * appears holding only the changed pixels (true color); unchanged = transparent.
 *
 * Two commands:
 *   Alpha Diff             - hard alpha (changed = opaque, unchanged = clear)
 *   Alpha Diff - Soft Glow - alpha scales with how much changed (smooth light)
 *
 * v0.1 - written against UXP Imaging API. If a call name differs in your PS
 * build, the console (UXP Developer Tool > Debug) will say which line; ping me.
 */
const { entrypoints } = require("uxp");
const { app, core, imaging, action } = require("photoshop");

const FUZZ = 0.02; // per-channel tolerance, 0..1 (2%). Below this = "unchanged".

entrypoints.setup({
  commands: {
    alphaDiff:     () => guard(() => run(false)),
    alphaDiffSoft: () => guard(() => run(true)),
  },
});

function guard(fn) {
  return core.executeAsModal(fn, { commandName: "Alpha Diff" })
    .catch((e) => app.showAlert("Alpha Diff: " + (e && e.message ? e.message : e)));
}

async function run(soft) {
  const doc = app.activeDocument;
  if (!doc) { app.showAlert("Open a document first."); return; }

  const sel = doc.activeLayers;
  if (!sel || sel.length !== 2) {
    app.showAlert("Select exactly TWO layers: the 'after' (with the edit) on top, the 'before' below.");
    return;
  }
  // Topmost selected layer (highest itemIndex) = "after" - we keep its pixels.
  const ordered = [...sel].sort((a, b) => b.itemIndex - a.itemIndex);
  const after = ordered[0], before = ordered[1];

  const W = doc.width, H = doc.height;
  const bounds = { left: 0, top: 0, right: W, bottom: H };
  const getOpts = (id) => ({
    documentID: doc.id, layerID: id, applyAlpha: false,
    colorSpace: "RGB", sourceBounds: bounds,
  });

  const aImg = await imaging.getPixels(getOpts(after.id));
  const bImg = await imaging.getPixels(getOpts(before.id));
  const ca = aImg.imageData.components;   // 3 (RGB) or 4 (RGBA)
  const cb = bImg.imageData.components;
  const A = await aImg.imageData.getData({ chunky: true });
  const B = await bImg.imageData.getData({ chunky: true });

  const n = W * H;
  const out = new Uint8Array(n * 4);
  const fz = Math.round(FUZZ * 255);
  for (let i = 0; i < n; i++) {
    const ai = i * ca, bi = i * cb, oi = i * 4;
    const d = Math.max(
      Math.abs(A[ai]     - B[bi]),
      Math.abs(A[ai + 1] - B[bi + 1]),
      Math.abs(A[ai + 2] - B[bi + 2]),
    );
    out[oi]     = A[ai];
    out[oi + 1] = A[ai + 1];
    out[oi + 2] = A[ai + 2];
    out[oi + 3] = d <= fz ? 0 : (soft ? Math.min(255, d) : 255);
  }

  // free the source buffers
  aImg.imageData.dispose && aImg.imageData.dispose();
  bImg.imageData.dispose && bImg.imageData.dispose();

  // new transparent pixel layer on top, then write the cutout into it
  await action.batchPlay([{
    _obj: "make",
    _target: [{ _ref: "layer" }],
    using: { _obj: "layer", name: soft ? "Alpha Diff (soft)" : "Alpha Diff" },
  }], {});
  const newLayer = app.activeDocument.activeLayers[0];

  const outData = imaging.createImageDataFromBuffer(out, {
    width: W, height: H, components: 4, chunky: true, colorSpace: "RGB",
  });
  await imaging.putPixels({
    documentID: doc.id, layerID: newLayer.id, imageData: outData, replace: true,
  });
  outData.dispose && outData.dispose();
}
