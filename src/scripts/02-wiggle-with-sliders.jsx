/**
 * @name Wiggle with Sliders
 * @tooltip Adds Frequency and Amplitude sliders with wiggle expression to Position
 * @icon <svg viewBox="0 0 16 16" width="70%" height="70%" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 8 Q4 4, 6 8 Q8 12, 10 8 Q12 4, 14 8"/></svg>
 */
(function() {
    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem)) {
        alert("Open a composition first.");
        return;
    }

    var layers = comp.selectedLayers;
    if (layers.length === 0) {
        alert("Select at least one layer.");
        return;
    }

    app.beginUndoGroup("Pendulum: Wiggle with Sliders");

    for (var i = 0; i < layers.length; i++) {
        var layer = layers[i];

        var freqEffect = layer.Effects.addProperty("ADBE Slider Control");
        freqEffect.name = "Frequency";
        freqEffect.property("Slider").setValue(3);

        var ampEffect = layer.Effects.addProperty("ADBE Slider Control");
        ampEffect.name = "Amplitude";
        ampEffect.property("Slider").setValue(50);

        var transform = layer.property("ADBE Transform Group");
        var pos = transform.property("Position");
        var expr = 'wiggle(effect("Frequency")("Slider"), effect("Amplitude")("Slider"))';
        if (pos.dimensionsSeparated) {
            transform.property("ADBE Position_0").expression = expr;
            transform.property("ADBE Position_1").expression = expr;
            if (layer.threeDLayer) {
                transform.property("ADBE Position_2").expression = expr;
            }
        } else {
            pos.expression = expr;
        }
    }

    app.endUndoGroup();
})();
