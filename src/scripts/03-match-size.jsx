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
        alert("Select at least two layers.");
        return;
    }

    // Pass 1: measure each selected layer's rendered width/height and sum.
    var items = [];
    var totalW = 0;
    var totalH = 0;
    for (var i = 0; i < layers.length; i++) {
        var layer = layers[i];
        var rect = layer.sourceRectAtTime(comp.time, false);
        if (!rect || rect.width === 0 || rect.height === 0) continue;
        var scale = layer.scale.value;
        var w = rect.width * (scale[0] / 100);
        var h = rect.height * (scale[1] / 100);
        items.push({ layer: layer, w: w, h: h, scale: scale });
        totalW += w;
        totalH += h;
    }

    if (items.length < 2) {
        alert("Select at least two layers with visible bounds.");
        return;
    }

    var avgW = totalW / items.length;
    var avgH = totalH / items.length;

    app.beginUndoGroup("Pendulum: Match Size");

    // Pass 2: resize every layer toward the average using min-ratio to preserve aspect.
    for (var k = 0; k < items.length; k++) {
        var it = items[k];
        var ratio = Math.min(avgW / it.w, avgH / it.h);
        var newX = it.scale[0] * ratio;
        var newY = it.scale[1] * ratio;
        if (it.scale.length === 3) {
            it.layer.scale.setValue([newX, newY, it.scale[2]]);
        } else {
            it.layer.scale.setValue([newX, newY]);
        }
    }

    app.endUndoGroup();
})();
