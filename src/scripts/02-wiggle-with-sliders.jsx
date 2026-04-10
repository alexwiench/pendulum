/**
 * @name Wiggle with Sliders
 * @tooltip Add wiggle
 * @color #4a9df8
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

    var FREQ_NAME = "Frequency";
    var AMP_NAME = "Amplitude";
    var EXPR = 'wiggle(effect("' + FREQ_NAME + '")("Slider"), effect("' + AMP_NAME + '")("Slider"))';

    function isWiggleable(prop) {
        if (!prop || prop.propertyType !== PropertyType.PROPERTY) return false;
        if (!prop.canSetExpression) return false;
        var t = prop.propertyValueType;
        return t === PropertyValueType.OneD
            || t === PropertyValueType.TwoD
            || t === PropertyValueType.TwoD_SPATIAL
            || t === PropertyValueType.ThreeD
            || t === PropertyValueType.ThreeD_SPATIAL
            || t === PropertyValueType.COLOR;
    }

    // Collect eligible selected properties per layer before mutating anything.
    var targets = []; // { layer, props: [Property, ...] }
    for (var i = 0; i < layers.length; i++) {
        var layer = layers[i];
        var selProps = layer.selectedProperties;
        var eligible = [];
        for (var j = 0; j < selProps.length; j++) {
            if (isWiggleable(selProps[j])) eligible.push(selProps[j]);
        }
        if (eligible.length > 0) targets.push({ layer: layer, props: eligible });
    }

    if (targets.length === 0) {
        alert("Select a property in the timeline first.");
        return;
    }

    app.beginUndoGroup("Pendulum: Wiggle with Sliders");

    for (var k = 0; k < targets.length; k++) {
        var t = targets[k];

        var freqEffect = t.layer.Effects.addProperty("ADBE Slider Control");
        freqEffect.name = FREQ_NAME;
        freqEffect.property("Slider").setValue(3);

        var ampEffect = t.layer.Effects.addProperty("ADBE Slider Control");
        ampEffect.name = AMP_NAME;
        ampEffect.property("Slider").setValue(50);

        for (var p = 0; p < t.props.length; p++) {
            t.props[p].expression = EXPR;
        }
    }

    app.endUndoGroup();
})();
