/**
 * @name Match Size
 * @tooltip Match sizes
 * @color #50e89f
 * @icon <svg viewBox="0 0 16 16" width="70%" height="70%" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="4" width="5" height="5" /><rect x="9" y="3" width="5" height="8" stroke-dasharray="2,1" /><path d="M9 7 L7 7" /><polyline points="8,6 7,7 8,8" /></svg>
 */
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

    var layers = comp.selectedLayers;
    if (layers.length < 2) {
        alert("Select at least two layers (first = reference).");
        return;
    }

    var refLayer = layers[0];
    var refRect = refLayer.sourceRectAtTime(comp.time, false);
    if (!refRect || refRect.width === 0 || refRect.height === 0) {
        alert("Reference layer has no visible bounds.");
        return;
    }

    app.beginUndoGroup("Pendulum: Match Size");

    var refScale = refLayer.scale.value;
    var refW = refRect.width * (refScale[0] / 100);
    var refH = refRect.height * (refScale[1] / 100);

    for (var i = 1; i < layers.length; i++) {
        var layer = layers[i];
        var rect = layer.sourceRectAtTime(comp.time, false);
        if (!rect || rect.width === 0 || rect.height === 0) continue;

        var curScale = layer.scale.value;
        var curW = rect.width * (curScale[0] / 100);
        var curH = rect.height * (curScale[1] / 100);

        var ratio = Math.min(refW / curW, refH / curH);

        var newX = curScale[0] * ratio;
        var newY = curScale[1] * ratio;

        if (curScale.length === 3) {
            layer.scale.setValue([newX, newY, curScale[2]]);
        } else {
            layer.scale.setValue([newX, newY]);
        }
    }

    app.endUndoGroup();
})();
