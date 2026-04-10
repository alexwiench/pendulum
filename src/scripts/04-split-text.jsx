/**
 * @name Split Text to Layers
 * @tooltip Split multi-line text into layers
 * @color #b985ff
 * @icon <svg viewBox="0 0 16 16" width="70%" height="70%" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="2" y1="4" x2="14" y2="4"/><line x1="2" y1="8" x2="14" y2="8"/><line x1="2" y1="12" x2="14" y2="12"/></svg>
 */
// v1 limitations:
// - Uniform per-layer styling only — per-character animators and mixed styles
//   collapse to the layer's base TextDocument style.
// - Animated Source Text layers are skipped with a warning.
// - 3D layers are skipped with a warning.
// - Lines are split on explicit line breaks only (\r, \n). Box text that
//   soft-wraps within a single paragraph will keep that wrapping in each split
//   duplicate (so the box travels with each line and still wraps identically).
// - Line height uses TextDocument.leading, falling back to fontSize * 1.2.
(function() {
    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) {
        if (app.activeViewer) app.activeViewer.setActive();
        comp = app.project.activeItem;
    }
    if (!(comp instanceof CompItem)) {
        alert("Open a composition first.");
        return;
    }

    var selected = comp.selectedLayers;
    if (selected.length === 0) {
        alert("Select at least one text layer.");
        return;
    }

    var skipped = [];
    var processed = 0;
    var undoOpen = false;

    for (var i = 0; i < selected.length; i++) {
        var layer = selected[i];

        if (!(layer instanceof TextLayer)) {
            skipped.push(layer.name + " (not a text layer)");
            continue;
        }
        if (layer.threeDLayer) {
            skipped.push(layer.name + " (3D layer)");
            continue;
        }

        var srcProp = layer.property("Source Text");
        if (srcProp.numKeys > 0) {
            skipped.push(layer.name + " (animated text)");
            continue;
        }

        var doc = srcProp.value;
        var raw = doc.text;
        var lines = raw.split(/\r\n|\r|\n/);
        if (lines.length < 2) {
            skipped.push(layer.name + " (single line)");
            continue;
        }

        var leading = (doc.leading && doc.leading > 0) ? doc.leading : doc.fontSize * 1.2;
        var origPos = layer.position.value;
        var origRot = layer.rotation.value; // degrees
        var scaleY = layer.scale.value[1] / 100;
        var rad = origRot * Math.PI / 180;
        // Local +Y vector (length = leading * scaleY) rotated into parent space.
        var dx = -Math.sin(rad) * leading * scaleY;
        var dy =  Math.cos(rad) * leading * scaleY;

        if (!undoOpen) {
            app.beginUndoGroup("Pendulum: Split Text to Layers");
            undoOpen = true;
        }

        for (var j = 0; j < lines.length; j++) {
            var dup = layer.duplicate();
            var newDoc = dup.property("Source Text").value;
            newDoc.text = lines[j];
            dup.property("Source Text").setValue(newDoc);
            if (j > 0) {
                dup.position.setValue([
                    origPos[0] + dx * j,
                    origPos[1] + dy * j
                ]);
            }
            dup.name = layer.name + " — " + (j + 1);
        }

        layer.remove();
        processed++;
    }

    if (undoOpen) app.endUndoGroup();

    if (processed === 0 && skipped.length > 0) {
        alert("Nothing to split.\n\nSkipped:\n" + skipped.join("\n"));
    } else if (skipped.length > 0) {
        alert("Split " + processed + " layer(s).\n\nSkipped:\n" + skipped.join("\n"));
    }
})();
