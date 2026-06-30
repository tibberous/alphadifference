#target photoshop
/*
 * Alpha Diff (ExtendScript .jsx) - extract what CHANGED between the TOP TWO
 * layers onto a new transparent layer, with a settings dialog. Runs in ANY
 * Photoshop (CS6 ... 2022+) via File > Scripts > Browse. No UXP / CC / install.
 *
 * SETUP: "after" (your edit) = TOP layer, "before" (original) = directly below.
 *
 * Dialog:
 *   Algorithm:  Changed pixels  - keep the AFTER layer's original colors
 *               Difference       - the delta colors (|after - before|)
 *   Edge:       Soft  - alpha = how much each pixel changed (smooth glow)
 *               Hard  - solid where changed (uses Tolerance 0-100)
 *   Feather:    soften the cut edge, in px
 *
 * MIT - TriState.Digital. v0.3 (untested in-app; errors report their line).
 */
(function () {
    if (!app.documents.length) { alert("Open a document with two layers first."); return; }
    var doc = app.activeDocument;
    if (doc.layers.length < 2) { alert("Need two layers: 'after' on top, 'before' below."); return; }

    function S(id) { return stringIDToTypeID(id); }
    function C(id) { return charIDToTypeID(id); }

    // ---- AM helpers ---------------------------------------------------------
    function thresholdActive(level) {                 // binarize active layer
        var d = new ActionDescriptor();
        d.putInteger(C("Lvl "), level);
        executeAction(C("Thrs"), d, DialogModes.NO);
    }
    function loadCompositeLuminosity() {              // selection = RGB composite lum
        var d = new ActionDescriptor();
        var rSel = new ActionReference();
        rSel.putProperty(S("channel"), S("selection"));
        d.putReference(S("null"), rSel);
        var rRGB = new ActionReference();
        rRGB.putEnumerated(S("channel"), S("channel"), S("RGB"));
        d.putReference(S("to"), rRGB);
        executeAction(S("set"), d, DialogModes.NO);
    }
    function addRevealSelectionMask() {               // mask active layer to selection
        var d = new ActionDescriptor();
        d.putClass(S("new"), S("channel"));
        var r = new ActionReference();
        r.putEnumerated(S("channel"), S("channel"), S("mask"));
        d.putReference(S("at"), r);
        d.putEnumerated(S("using"), S("userMaskEnabled"), S("revealSelection"));
        executeAction(S("make"), d, DialogModes.NO);
    }

    // ---- settings dialog ----------------------------------------------------
    function ask() {
        var w = new Window("dialog", "Alpha Diff");
        w.alignChildren = "fill"; w.margins = 16; w.spacing = 10;

        var ap = w.add("panel", undefined, "Algorithm"); ap.alignChildren = "left"; ap.margins = 12;
        var rbChanged = ap.add("radiobutton", undefined, "Changed pixels  (keep original colors)");
        var rbDiff    = ap.add("radiobutton", undefined, "Difference  (delta colors)");
        rbChanged.value = true;

        var ep = w.add("panel", undefined, "Edge"); ep.alignChildren = "left"; ep.margins = 12;
        var rbSoft = ep.add("radiobutton", undefined, "Soft  (alpha = amount of change)");
        var rbHard = ep.add("radiobutton", undefined, "Hard  (solid where changed)");
        rbSoft.value = true;

        var g1 = w.add("group"); g1.add("statictext", undefined, "Tolerance (hard):");
        var tol = g1.add("edittext", undefined, "20"); tol.characters = 4;
        g1.add("statictext", undefined, "0-100");
        var g2 = w.add("group"); g2.add("statictext", undefined, "Feather edge (px):");
        var fea = g2.add("edittext", undefined, "0"); fea.characters = 4;

        var gb = w.add("group"); gb.alignment = "right";
        gb.add("button", undefined, "Run", { name: "ok" });
        gb.add("button", undefined, "Cancel", { name: "cancel" });

        function sync() { tol.enabled = rbHard.value; }
        rbSoft.onClick = rbHard.onClick = sync; sync();

        if (w.show() !== 1) return null;
        return {
            algo: rbDiff.value ? "diff" : "changed",
            hard: rbHard.value,
            tolerance: Math.max(0, Math.min(100, parseFloat(tol.text) || 0)),
            feather: Math.max(0, parseFloat(fea.text) || 0)
        };
    }

    var opt = ask();
    if (!opt) return;

    var after = doc.layers[0], before = doc.layers[1];
    try {
        // 1) colorDiff = |after - before| (in color)
        var diffBase = before.duplicate();
        var diffTop = after.duplicate();
        diffTop.move(diffBase, ElementPlacement.PLACEBEFORE);
        diffTop.blendMode = BlendMode.DIFFERENCE;
        doc.activeLayer = diffTop;
        var colorDiff = diffTop.merge();

        // 2) grayscale mask layer (+ threshold for hard)
        var maskLayer = colorDiff.duplicate();
        maskLayer.desaturate();
        if (opt.hard) { doc.activeLayer = maskLayer; thresholdActive(Math.max(1, Math.round(opt.tolerance / 100 * 255))); }

        // 3) selection = maskLayer luminosity (hide everything else so the
        //    composite IS just the mask - the bug fix)
        var saved = [];
        for (var i = 0; i < doc.layers.length; i++) { saved[i] = doc.layers[i].visible; doc.layers[i].visible = false; }
        maskLayer.visible = true;
        doc.activeLayer = maskLayer;
        loadCompositeLuminosity();
        for (var j = 0; j < doc.layers.length; j++) { doc.layers[j].visible = saved[j]; }
        if (opt.feather > 0) { try { doc.selection.feather(opt.feather); } catch (e) {} }
        maskLayer.remove();

        // 4) pick the color source
        var cutout;
        if (opt.algo === "diff") {
            cutout = colorDiff;
            cutout.name = "Alpha Diff (difference)";
        } else {
            cutout = after.duplicate();
            cutout.name = "Alpha Diff (changed)";
            colorDiff.remove();
        }

        // 5) mask it to the changed pixels
        doc.activeLayer = cutout;
        addRevealSelectionMask();
        try { doc.selection.deselect(); } catch (e) {}
        alert("Alpha Diff done -> '" + cutout.name + "' layer created.");
    } catch (err) {
        alert("Alpha Diff error on line " + (err.line || "?") + ":\n" + err.message);
    }
})();
