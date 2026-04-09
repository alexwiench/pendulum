/**
 * @name Create Null
 * @tooltip Creates a null at the center of selected layers and parents them
 * @icon <svg viewBox="0 0 16 16" width="70%" height="70%" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="10" height="10" stroke-dasharray="3,4" /><line x1="8" y1="5.5" x2="8" y2="10.5" /><line x1="5.5" y1="8" x2="10.5" y2="8" /></svg>
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

    var selected = [];
    for (var i = 0; i < comp.selectedLayers.length; i++) {
        selected[selected.length] = comp.selectedLayers[i];
    }

    app.beginUndoGroup("Pendulum: Create Null");

    var nullLayer = comp.layers.addNull();
    nullLayer.name = getNextCtrlName(comp);
    nullLayer.anchorPoint.setValue([50, 50]);

    if (selected.length === 0) {
        nullLayer.position.setValue([comp.width / 2, comp.height / 2]);
    } else {
        var sumX = 0;
        var sumY = 0;
        for (var i = 0; i < selected.length; i++) {
            var center = getLayerCenterInComp(selected[i], comp);
            sumX += center[0];
            sumY += center[1];
        }
        nullLayer.position.setValue([sumX / selected.length, sumY / selected.length]);

        for (var i = 0; i < selected.length; i++) {
            selected[i].parent = nullLayer;
        }
    }

    app.endUndoGroup();

    function getNextCtrlName(comp) {
        var max = 0;
        for (var i = 1; i <= comp.numLayers; i++) {
            var m = comp.layers[i].name.match(/^Ctrl_(\d+)$/);
            if (m) {
                var num = parseInt(m[1], 10);
                if (num > max) max = num;
            }
        }
        var next = max + 1;
        return "Ctrl_" + (next < 10 ? "0" : "") + next;
    }

    function getLayerCenterInComp(layer, comp) {
        var rect = layer.sourceRectAtTime(comp.time, false);
        if (!rect) {
            var pos = layer.position.value;
            return [pos[0], pos[1]];
        }

        var contentCenterX = rect.left + rect.width / 2;
        var contentCenterY = rect.top + rect.height / 2;

        var anchorVal = layer.anchorPoint.value;
        var offsetX = contentCenterX - anchorVal[0];
        var offsetY = contentCenterY - anchorVal[1];

        var scale = layer.scale.value;
        offsetX *= scale[0] / 100;
        offsetY *= scale[1] / 100;

        var rotation = layer.rotation.value;
        if (rotation !== 0) {
            var rad = rotation * Math.PI / 180;
            var cosR = Math.cos(rad);
            var sinR = Math.sin(rad);
            var rotX = offsetX * cosR - offsetY * sinR;
            var rotY = offsetX * sinR + offsetY * cosR;
            offsetX = rotX;
            offsetY = rotY;
        }

        var parent = layer.parent;
        layer.parent = null;
        var compPos = layer.position.value;
        layer.parent = parent;

        return [compPos[0] + offsetX, compPos[1] + offsetY];
    }
})();
