/*
 * Recomp v1.3.0 - After Effects script
 * Duplicate compositions with all nested comps and expression links,
 * and/or batch-change resolution and frame rate.
 *
 * Author: Denis Petriaev (https://www.behance.net/petryaev_art)
 * Repository: https://github.com/Petryaev-Art/Recomp
 * License: MIT
 *
 * Compatible with After Effects 2021 (v18) through the latest release.
 */

(function recomp(thisObj) {

    var SCRIPT_NAME = "Recomp";
    var VERSION = "1.3.0";
    var MIN_AE_VERSION = 18;
    var MIN_AE_YEAR = "2021";

    var compMap = [];
    var fullRenameCounter = 0;
    var ui = null;

    function padNum(n, size) {
        var s = "" + n;
        while (s.length < size) s = "0" + s;
        return s;
    }

    function clampInt(value, min, max) {
        var n = parseInt(value, 10);
        if (isNaN(n)) return -1;
        if (n < min) n = min;
        if (n > max) n = max;
        return n;
    }

    function clampFloat(value, min, max) {
        var n = parseFloat(value);
        if (isNaN(n)) return -1;
        if (n < min) n = min;
        if (n > max) n = max;
        return n;
    }

    function findDest(sourceComp) {
        for (var i = 0; i < compMap.length; i++) {
            if (compMap[i].source.id == sourceComp.id) return compMap[i].dest;
        }
        return null;
    }

    function makeName(originalName, isTopLevel) {
        var mode = ui.dup.modeDrp.selection.text;
        var txt = ui.dup.nameTxt.text;

        if (mode === "Suffix") {
            return originalName + (txt !== "" ? txt : " copy");
        }

        if (mode === "Increment number") {
            if (/\d+(?!.*\d)/.test(originalName)) {
                return originalName.replace(/\d+(?!.*\d)/, function (m) {
                    return padNum(parseInt(m, 10) + 1, m.length);
                });
            }
            return originalName + (txt !== "" ? txt : "_2");
        }

        if (isTopLevel) {
            return (txt !== "") ? txt : (originalName + " copy");
        }
        fullRenameCounter++;
        var base = (txt !== "") ? txt : (originalName + " copy");
        return base + " " + fullRenameCounter;
    }

    function duplicateComp(comp, depth) {
        var originalName = comp.name;
        var newComp = comp.duplicate();
        newComp.name = makeName(originalName, depth === 0);
        compMap.push({ source: comp, dest: newComp });

        for (var i = 1; i <= newComp.numLayers; i++) {
            var layer = newComp.layer(i);
            if (layer instanceof AVLayer && layer.source && layer.source instanceof CompItem) {
                var existing = findDest(layer.source);
                if (existing != null) {
                    layer.replaceSource(existing, true);
                } else {
                    var sub = duplicateComp(layer.source, depth + 1);
                    layer.replaceSource(sub, true);
                }
            }
        }
        return newComp;
    }

    var reCompRef = /comp\(\s*["'](.+?)["']\s*\)/;

    function fixExpressionString(expr) {
        for (var k = 0; k < compMap.length; k++) {
            var oldName = compMap[k].source.name;
            var newName = compMap[k].dest.name;
            if (oldName === newName) continue;

            var dq = 'comp("' + oldName + '")';
            var sq = "comp('" + oldName + "')";
            if (expr.indexOf(dq) !== -1) {
                expr = expr.split(dq).join('comp("' + newName + '")');
            }
            if (expr.indexOf(sq) !== -1) {
                expr = expr.split(sq).join("comp('" + newName + "')");
            }
        }
        return expr;
    }

    function processProperty(prop, errors) {
        if (prop.numProperties != undefined && prop.numProperties > 0) {
            for (var i = 1; i <= prop.numProperties; i++) {
                processProperty(prop.property(i), errors);
            }
            return;
        }
        if (!prop.canSetExpression) return;

        var orig;
        try {
            if (!prop.expressionEnabled) return;
            orig = prop.expression;
        } catch (eRead) {
            return;
        }
        if (!orig || orig === "") return;
        if (!reCompRef.test(orig)) return;

        var updated = fixExpressionString(orig);
        if (updated === orig) return;

        try {
            prop.expression = updated;
        } catch (e) {
            errors.push(prop.name + ": " + e.toString().replace(/[\r\n]+/g, " "));
        }
    }

    function updateAllExpressions() {
        var errors = [];
        for (var i = 0; i < compMap.length; i++) {
            var c = compMap[i].dest;
            for (var j = 1; j <= c.numLayers; j++) {
                var layer = c.layer(j);
                for (var p = 1; p <= layer.numProperties; p++) {
                    processProperty(layer.property(p), errors);
                }
            }
        }
        return errors;
    }

    function setStatic(prop, value) {
        if (!prop) return;
        try {
            if (prop.numKeys && prop.numKeys > 0) return;
            if (prop.expressionEnabled && prop.expression !== "") return;
            prop.setValue(value);
        } catch (e) {}
    }

    function isSolidLayer(L) {
        try { return (L.source && L.source.mainSource instanceof SolidSource); }
        catch (e) { return false; }
    }

    function applyFitTransform(L, cx, cy) {
        var is3D = false;
        try { is3D = L.threeDLayer; } catch (e3) {}
        setStatic(L.transform.anchorPoint, is3D ? [cx, cy, 0] : [cx, cy]);
        setStatic(L.transform.position, is3D ? [cx, cy, 0] : [cx, cy]);
        setStatic(L.transform.scale, is3D ? [100, 100, 100] : [100, 100]);
    }

    function fitAdjustmentLayers(comp, w, h) {
        var targets = [];
        for (var i = 1; i <= comp.numLayers; i++) {
            var L = comp.layer(i);
            var isAdj = false;
            try { isAdj = (L.adjustmentLayer === true); } catch (eA) {}
            if (isAdj && isSolidLayer(L)) targets.push(L);
        }
        if (targets.length === 0) return 0;

        var solidSrc = null;
        try {
            var tmp = comp.layers.addSolid([0, 0, 0], "ADJ " + w + "x" + h, w, h, comp.pixelAspect);
            solidSrc = tmp.source;
            tmp.remove();
        } catch (eSolid) {
            return 0;
        }
        if (!solidSrc) return 0;

        var cx = w / 2, cy = h / 2;
        var done = 0;
        for (var t = 0; t < targets.length; t++) {
            var A = targets[t];
            try {
                A.replaceSource(solidSrc, false);
                applyFitTransform(A, cx, cy);
                done++;
            } catch (e1) {}
        }
        return done;
    }

    function fitSolids(comp, w, h) {
        var targets = [];
        for (var i = 1; i <= comp.numLayers; i++) {
            var L = comp.layer(i);
            var isAdj = false, isNull = false;
            try { isAdj = (L.adjustmentLayer === true); } catch (eA) {}
            try { isNull = (L.nullLayer === true); } catch (eN) {}
            if (!isAdj && !isNull && isSolidLayer(L)) targets.push(L);
        }
        if (targets.length === 0) return 0;

        var cx = w / 2, cy = h / 2;
        var cache = {};
        var done = 0;
        for (var t = 0; t < targets.length; t++) {
            var L2 = targets[t];
            try {
                var col = [0, 0, 0];
                try { col = L2.source.mainSource.color; } catch (eC) {}
                var key = Math.round(col[0] * 255) + "_" + Math.round(col[1] * 255) + "_" + Math.round(col[2] * 255);
                var src = cache[key];
                if (!src) {
                    var tmp = comp.layers.addSolid(col, "Solid " + w + "x" + h, w, h, comp.pixelAspect);
                    src = tmp.source;
                    tmp.remove();
                    cache[key] = src;
                }
                if (src) {
                    L2.replaceSource(src, false);
                    applyFitTransform(L2, cx, cy);
                    done++;
                }
            } catch (e1) {}
        }
        return done;
    }

    function offsetScalar(prop, d) {
        if (!prop || d === 0) return;
        try {
            if (prop.expressionEnabled && prop.expression !== "") return;
        } catch (eExp) {}
        try {
            if (prop.numKeys && prop.numKeys > 0) {
                for (var k = 1; k <= prop.numKeys; k++) {
                    prop.setValueAtKey(k, prop.keyValue(k) + d);
                }
            } else {
                prop.setValue(prop.value + d);
            }
        } catch (eSet) {}
    }

    function offsetPosition(prop, dx, dy) {
        if (!prop) return;
        try {
            if (prop.expressionEnabled && prop.expression !== "") return;
        } catch (eExp) {}
        try {
            if (prop.dimensionsSeparated === true) {
                offsetScalar(prop.getSeparationFollower(0), dx);
                offsetScalar(prop.getSeparationFollower(1), dy);
                return;
            }
        } catch (eSep) {}
        try {
            if (prop.numKeys && prop.numKeys > 0) {
                for (var k = 1; k <= prop.numKeys; k++) {
                    var v = prop.keyValue(k);
                    v[0] = v[0] + dx;
                    v[1] = v[1] + dy;
                    prop.setValueAtKey(k, v);
                }
            } else {
                var val = prop.value;
                val[0] = val[0] + dx;
                val[1] = val[1] + dy;
                prop.setValue(val);
            }
        } catch (eSet) {}
    }

    function recenterContent(comp, dx, dy) {
        if (dx === 0 && dy === 0) return;
        for (var i = 1; i <= comp.numLayers; i++) {
            var L = comp.layer(i);
            var skip = false;
            try { if (L instanceof CameraLayer || L instanceof LightLayer) skip = true; } catch (eT) {}
            if (skip) continue;
            var hasParent = false;
            try { hasParent = (L.parent != null); } catch (eP) {}
            if (hasParent) continue;
            var pos = null;
            try { pos = L.transform.position; } catch (ePos) { continue; }
            if (!pos) continue;
            offsetPosition(pos, dx, dy);
        }
    }

    function fixNestedCompAnchors(targets, deltas) {
        for (var t = 0; t < targets.length; t++) {
            var comp = targets[t];
            for (var i = 1; i <= comp.numLayers; i++) {
                var L = comp.layer(i);
                if (!(L instanceof AVLayer)) continue;
                if (!L.source || !(L.source instanceof CompItem)) continue;
                var d = deltas["_" + L.source.id];
                if (!d) continue;
                if (d[0] === 0 && d[1] === 0) continue;
                try { offsetPosition(L.transform.anchorPoint, d[0], d[1]); } catch (eA) {}
            }
        }
    }

    function collectTree(comp, list, seen) {
        var key = "_" + comp.id;
        if (seen[key]) return;
        seen[key] = true;
        list.push(comp);
        for (var i = 1; i <= comp.numLayers; i++) {
            var L = comp.layer(i);
            if (L instanceof AVLayer && L.source && L.source instanceof CompItem) {
                collectTree(L.source, list, seen);
            }
        }
    }

    function run() {
        var proj = app.project;
        if (!proj) { alert("No project is open.", SCRIPT_NAME); return; }

        var aeMajor = parseInt(app.version, 10);
        if (!isNaN(aeMajor) && aeMajor < MIN_AE_VERSION) {
            if (!confirm(SCRIPT_NAME + " is built for After Effects " + MIN_AE_YEAR +
                         " (v" + MIN_AE_VERSION + ") and later.\nYour version is " + app.version +
                         ". It may not work correctly.\nContinue anyway?")) return;
        }

        var selected = proj.selection;
        var comps = [];
        var hadNonComp = false;
        for (var i = 0; i < selected.length; i++) {
            if (selected[i] instanceof CompItem) comps.push(selected[i]);
            else hadNonComp = true;
        }
        if (comps.length === 0) {
            alert("Select at least one composition in the Project panel.", SCRIPT_NAME);
            return;
        }

        var doDup = ui.dup.dupChk.value;
        var doRes = ui.res.resChk.value;
        var doFps = ui.res.fpsChk.value;
        var fitAdj = ui.res.fitAdjChk.value && doRes;
        var fitSol = ui.res.fitSolidChk.value && doRes;
        var doCenter = ui.res.centerChk.value && doRes;

        if (!doDup && !doRes && !doFps) {
            alert("Nothing to do. Enable duplication, resolution or frame rate.", SCRIPT_NAME);
            return;
        }

        var newW = 0, newH = 0, newFps = 0;
        if (doRes) {
            newW = clampInt(ui.res.wTxt.text, 1, 30000);
            newH = clampInt(ui.res.hTxt.text, 1, 30000);
            if (newW < 1 || newH < 1) {
                alert("Enter a valid Width and Height (1 - 30000 px).", SCRIPT_NAME);
                return;
            }
        }
        if (doFps) {
            newFps = clampFloat(ui.res.fpsTxt.text, 0.01, 999);
            if (newFps < 0.01) {
                alert("Enter a valid frame rate (0.01 - 999).", SCRIPT_NAME);
                return;
            }
        }

        if (doDup) {
            var mode = ui.dup.modeDrp.selection.text;
            if (mode === "Full rename" && comps.length > 1 && ui.dup.nameTxt.text !== "") {
                if (!confirm('"Full rename" mode with several selected comps\n' +
                             "will give all top-level copies the same base name.\nContinue?")) return;
            }
        }

        compMap = [];
        fullRenameCounter = 0;

        app.beginUndoGroup(SCRIPT_NAME);

        try {
            var targets = [];
            var topCopies = [];
            var expErrors = [];

            if (doDup) {
                for (var c = 0; c < comps.length; c++) {
                    topCopies.push(duplicateComp(comps[c], 0));
                }
                if (ui.dup.fixExpChk.value) {
                    expErrors = updateAllExpressions();
                }
                for (var m = 0; m < compMap.length; m++) {
                    targets.push(compMap[m].dest);
                }
            } else {
                var seen = {};
                for (var s = 0; s < comps.length; s++) {
                    collectTree(comps[s], targets, seen);
                }
            }

            var resizedCount = 0, adjCount = 0, solidCount = 0, fpsCount = 0;
            var compDeltas = {};
            for (var t = 0; t < targets.length; t++) {
                var tc = targets[t];
                if (doRes) {
                    var oldW = tc.width, oldH = tc.height;
                    try {
                        tc.width = newW;
                        tc.height = newH;
                        resizedCount++;
                    } catch (eRes) {}
                    var dxC = (newW - oldW) / 2, dyC = (newH - oldH) / 2;
                    if (doCenter) {
                        recenterContent(tc, dxC, dyC);
                        compDeltas["_" + tc.id] = [dxC, dyC];
                    }
                    if (fitAdj) adjCount += fitAdjustmentLayers(tc, newW, newH);
                    if (fitSol) solidCount += fitSolids(tc, newW, newH);
                }
                if (doFps) {
                    try {
                        tc.frameRate = newFps;
                        fpsCount++;
                    } catch (eFps) {}
                }
            }

            if (doRes && doCenter) fixNestedCompAnchors(targets, compDeltas);

            if (doDup) {
                try {
                    for (var q = 0; q < topCopies.length; q++) topCopies[q].selected = true;
                } catch (eSel) {}
            }

            var msg = "Done.";
            if (doDup) {
                msg += "\nComps duplicated (incl. nested): " + compMap.length;
                msg += "\nTop-level copies: " + topCopies.length;
            } else {
                msg += "\nComps affected (incl. nested): " + targets.length;
            }
            if (doRes) {
                msg += "\nResized to " + newW + " x " + newH + " px: " + resizedCount;
                if (fitAdj) msg += "\nAdjustment layers refit: " + adjCount;
                if (fitSol) msg += "\nSolids refit: " + solidCount;
                if (doCenter) msg += "\nContent kept centered.";
            }
            if (doFps) {
                msg += "\nFrame rate set to " + newFps + ": " + fpsCount;
            }
            if (hadNonComp) msg += "\n(Non-comp items in the selection were skipped.)";
            if (expErrors.length > 0) {
                msg += "\n\nExpression errors (" + expErrors.length + "):\n- " + expErrors.join("\n- ");
            }
            alert(msg, SCRIPT_NAME);

        } catch (err) {
            alert("Error: " + err.toString(), SCRIPT_NAME);
        } finally {
            app.endUndoGroup();
        }
    }

    function buildUI(host) {
        var pal = (host instanceof Panel)
            ? host
            : new Window("palette", SCRIPT_NAME + " v" + VERSION, undefined, { resizeable: true });

        pal.orientation = "column";
        pal.alignChildren = ["fill", "top"];
        pal.spacing = 8;
        pal.margins = 12;

        var dup = pal.add("panel", undefined, "Duplicate compositions");
        dup.orientation = "column";
        dup.alignChildren = ["fill", "top"];
        dup.spacing = 6;
        dup.margins = [10, 14, 10, 10];

        var dupChk = dup.add("checkbox", undefined, "Duplicate selected comps (with nested)");
        dupChk.value = true;

        var row1 = dup.add("group");
        var modeLbl = row1.add("statictext", undefined, "Mode:");
        var modeDrp = row1.add("dropdownlist", undefined, ["Suffix", "Increment number", "Full rename"]);
        modeDrp.selection = 0;
        modeDrp.preferredSize.width = 170;

        var row2 = dup.add("group");
        var nameLbl = row2.add("statictext", undefined, "Suffix:");
        nameLbl.preferredSize.width = 60;
        var nameTxt = row2.add("edittext", undefined, "_copy");
        nameTxt.characters = 22;

        var hint = dup.add("statictext", undefined, "", { multiline: true });
        hint.preferredSize.height = 30;

        var fixExpChk = dup.add("checkbox", undefined, "Update expressions (comp references)");
        fixExpChk.value = true;

        dup.dupChk = dupChk;
        dup.modeDrp = modeDrp;
        dup.nameTxt = nameTxt;
        dup.fixExpChk = fixExpChk;

        var res = pal.add("panel", undefined, "Resolution / Frame rate");
        res.orientation = "column";
        res.alignChildren = ["left", "top"];
        res.spacing = 6;
        res.margins = [10, 14, 10, 10];

        var resChk = res.add("checkbox", undefined, "Change resolution");
        resChk.value = false;

        var resRow = res.add("group");
        resRow.add("statictext", undefined, "Width:");
        var wTxt = resRow.add("edittext", undefined, "1920");
        wTxt.characters = 6;
        resRow.add("statictext", undefined, "Height:");
        var hTxt = resRow.add("edittext", undefined, "1080");
        hTxt.characters = 6;
        resRow.add("statictext", undefined, "px");

        var fitAdjChk = res.add("checkbox", undefined, "Fit adjustment layers to new size");
        fitAdjChk.value = true;

        var fitSolidChk = res.add("checkbox", undefined, "Fit solids to new size");
        fitSolidChk.value = false;

        var centerChk = res.add("checkbox", undefined, "Keep content centered");
        centerChk.value = true;

        var fpsChk = res.add("checkbox", undefined, "Change frame rate");
        fpsChk.value = false;

        var fpsRow = res.add("group");
        fpsRow.add("statictext", undefined, "FPS:");
        var fpsTxt = fpsRow.add("edittext", undefined, "25");
        fpsTxt.characters = 6;

        res.resChk = resChk;
        res.wTxt = wTxt;
        res.hTxt = hTxt;
        res.fitAdjChk = fitAdjChk;
        res.fitSolidChk = fitSolidChk;
        res.centerChk = centerChk;
        res.fpsChk = fpsChk;
        res.fpsTxt = fpsTxt;

        var applyBtn = pal.add("button", undefined, "Apply");

        function refreshDup() {
            var on = dupChk.value;
            modeLbl.enabled = on;
            modeDrp.enabled = on;
            nameLbl.enabled = on;
            nameTxt.enabled = on;
            fixExpChk.enabled = on;
            hint.enabled = on;
        }
        function refreshRes() {
            var on = resChk.value;
            wTxt.enabled = on;
            hTxt.enabled = on;
            fitAdjChk.enabled = on;
            fitSolidChk.enabled = on;
            centerChk.enabled = on;
        }
        function refreshFps() {
            fpsTxt.enabled = fpsChk.value;
        }
        function refreshHint() {
            var m = modeDrp.selection.text;
            if (m === "Suffix") {
                nameLbl.text = "Suffix:";
                hint.text = "Appended to every copy's name. e.g. Scene -> Scene_copy";
            } else if (m === "Increment number") {
                nameLbl.text = "Fallback:";
                hint.text = "Last digit group +1 (Scene_01 -> Scene_02). If no digit, this text is appended.";
            } else {
                nameLbl.text = "Name:";
                hint.text = "Top comp gets this name. Nested comps become \"Name 1\", \"Name 2\" ...";
            }
            dup.layout.layout(true);
        }

        dupChk.onClick = refreshDup;
        resChk.onClick = refreshRes;
        fpsChk.onClick = refreshFps;
        modeDrp.onChange = refreshHint;

        refreshHint();
        refreshDup();
        refreshRes();
        refreshFps();

        applyBtn.onClick = function () { run(); };

        ui = { dup: dup, res: res };

        pal.layout.layout(true);
        pal.onResizing = pal.onResize = function () { this.layout.resize(); };
        return pal;
    }

    var palette = buildUI(thisObj);
    if (palette instanceof Window) {
        palette.center();
        palette.show();
    } else {
        palette.layout.layout(true);
    }

})(this);
