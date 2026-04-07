import { getActiveComp } from "./aeft-utils";

/**
 * Returns the number of KeyframeEase elements required for setTemporalEaseAtKey.
 * Spatial properties (Position) use 1 element (combined speed along motion path).
 * Non-spatial multi-dim properties (Scale) use 2 or 3 elements.
 */
function getEaseDimensions(prop: Property): number {
  var vt = prop.propertyValueType;
  if (vt === PropertyValueType.TwoD) return 2;
  if (vt === PropertyValueType.ThreeD) return 3;
  // Spatial properties (TwoD_SPATIAL, ThreeD_SPATIAL) and OneD all use 1
  return 1;
}

/**
 * Returns whether the property value is multi-dimensional (for value access).
 */
function isMultiDimValue(prop: Property): boolean {
  var vt = prop.propertyValueType;
  return (
    vt === PropertyValueType.TwoD ||
    vt === PropertyValueType.ThreeD ||
    vt === PropertyValueType.TwoD_SPATIAL ||
    vt === PropertyValueType.ThreeD_SPATIAL
  );
}

/**
 * Check if a property value type supports temporal easing.
 */
function isNumericProperty(prop: Property): boolean {
  var vt = prop.propertyValueType;
  return (
    vt === PropertyValueType.OneD ||
    vt === PropertyValueType.TwoD ||
    vt === PropertyValueType.ThreeD ||
    vt === PropertyValueType.TwoD_SPATIAL ||
    vt === PropertyValueType.ThreeD_SPATIAL
  );
}

/**
 * Recursively collects all keyframed properties from a property group.
 */
function collectKeyframedProperties(
  root: PropertyGroup,
  result: Property[]
): void {
  for (var i = 1; i <= root.numProperties; i++) {
    var prop = root.property(i) as PropertyBase;
    if (prop.propertyType === PropertyType.PROPERTY) {
      var p = prop as Property;
      if (p.numKeys > 0 && isNumericProperty(p)) {
        result.push(p);
      }
    } else if (
      prop.propertyType === PropertyType.INDEXED_GROUP ||
      prop.propertyType === PropertyType.NAMED_GROUP
    ) {
      collectKeyframedProperties(prop as PropertyGroup, result);
    }
  }
}

/**
 * Collects keyframed properties from a layer, preferring those with selected keyframes.
 */
function getTargetProperties(layer: Layer): Property[] {
  var allProps: Property[] = [];
  collectKeyframedProperties(layer as PropertyGroup, allProps);
  var selectedProps: Property[] = [];
  for (var sp = 0; sp < allProps.length; sp++) {
    if (allProps[sp].selectedKeys && allProps[sp].selectedKeys.length > 0) {
      selectedProps.push(allProps[sp]);
    }
  }
  return selectedProps.length > 0 ? selectedProps : allProps;
}

/**
 * Collects key indices for a property, preferring selected keys.
 */
function getTargetKeys(prop: Property): number[] {
  var keys: number[] = [];
  if (prop.selectedKeys && prop.selectedKeys.length > 0) {
    for (var s = 0; s < prop.selectedKeys.length; s++) {
      keys.push(prop.selectedKeys[s]);
    }
  } else {
    for (var ki = 1; ki <= prop.numKeys; ki++) {
      keys.push(ki);
    }
  }
  return keys;
}

/**
 * Applies a cubic-bezier easing curve to all keyframes on selected
 * properties of selected layers in the active composition.
 *
 * The bezier is defined as cubic-bezier(x1, y1, x2, y2) where:
 *   (0,0) → (x1,y1) → (x2,y2) → (1,1)
 *
 * Conversion to AE KeyframeEase:
 *   outInfluence = x1 * 100
 *   outSpeed     = (y1 / x1) * averageSpeed
 *   inInfluence  = (1 - x2) * 100
 *   inSpeed      = ((1 - y2) / (1 - x2)) * averageSpeed
 */
export const applyBezierEasing = (
  x1: number,
  y1: number,
  x2: number,
  y2: number
) => {
  var comp = getActiveComp();
  if (!comp) return "No active composition";

  var layers = comp.selectedLayers;
  if (!layers || layers.length === 0) return "No layers selected";

  app.beginUndoGroup("Pendulum: Apply Easing");

  var totalKeysModified = 0;

  for (var i = 0; i < layers.length; i++) {
    var layer = layers[i];

    var props = getTargetProperties(layer);

    for (var p = 0; p < props.length; p++) {
      var prop = props[p];
      var easeDims = getEaseDimensions(prop);
      var multiDim = isMultiDimValue(prop);

      var keys = getTargetKeys(prop);

      for (var k = 0; k < keys.length; k++) {
        var keyIndex = keys[k];

        if (
          prop.keyInInterpolationType(keyIndex) ===
            KeyframeInterpolationType.HOLD ||
          prop.keyOutInterpolationType(keyIndex) ===
            KeyframeInterpolationType.HOLD
        ) {
          continue;
        }

        // --- Outgoing ease (toward next keyframe) ---
        var outEase: KeyframeEase[];
        if (keyIndex < prop.numKeys) {
          var nextTime = prop.keyTime(keyIndex + 1);
          var curTime = prop.keyTime(keyIndex);
          var dt = nextTime - curTime;

          if (dt > 0) {
            var curVal = prop.keyValue(keyIndex);
            var nextVal = prop.keyValue(keyIndex + 1);
            var outInfluence = Math.max(0.1, Math.min(100, x1 * 100));

            outEase = [];
            for (var d = 0; d < easeDims; d++) {
              var avgSpeed: number;
              if (easeDims === 1 && multiDim) {
                // Spatial property: compute Euclidean distance for combined speed
                var sum = 0;
                var cv = curVal as number[];
                var nv = nextVal as number[];
                for (var di = 0; di < cv.length; di++) {
                  sum += (nv[di] - cv[di]) * (nv[di] - cv[di]);
                }
                avgSpeed = Math.sqrt(sum) / dt;
              } else if (multiDim) {
                // Non-spatial multi-dim (Scale): per-dimension speed
                var dv = (nextVal as number[])[d] - (curVal as number[])[d];
                avgSpeed = Math.abs(dv / dt);
              } else {
                // 1D property
                avgSpeed = Math.abs(
                  ((nextVal as number) - (curVal as number)) / dt
                );
              }
              var outSpeed = x1 > 0 ? (y1 / x1) * avgSpeed : 0;
              outEase.push(new KeyframeEase(outSpeed, outInfluence));
            }
          } else {
            outEase = prop.keyOutTemporalEase(keyIndex);
          }
        } else {
          outEase = prop.keyOutTemporalEase(keyIndex);
        }

        // --- Incoming ease (from previous keyframe) ---
        var inEase: KeyframeEase[];
        if (keyIndex > 1) {
          var prevTime = prop.keyTime(keyIndex - 1);
          var curTime2 = prop.keyTime(keyIndex);
          var dt2 = curTime2 - prevTime;

          if (dt2 > 0) {
            var prevVal = prop.keyValue(keyIndex - 1);
            var curVal2 = prop.keyValue(keyIndex);
            var dx2 = 1 - x2;
            var inInfluence = Math.max(0.1, Math.min(100, dx2 * 100));

            inEase = [];
            for (var d2 = 0; d2 < easeDims; d2++) {
              var avgSpeed2: number;
              if (easeDims === 1 && multiDim) {
                var sum2 = 0;
                var pv = prevVal as number[];
                var cv2 = curVal2 as number[];
                for (var di2 = 0; di2 < cv2.length; di2++) {
                  sum2 += (cv2[di2] - pv[di2]) * (cv2[di2] - pv[di2]);
                }
                avgSpeed2 = Math.sqrt(sum2) / dt2;
              } else if (multiDim) {
                var dv2 = (curVal2 as number[])[d2] - (prevVal as number[])[d2];
                avgSpeed2 = Math.abs(dv2 / dt2);
              } else {
                avgSpeed2 = Math.abs(
                  ((curVal2 as number) - (prevVal as number)) / dt2
                );
              }
              var dy2 = 1 - y2;
              var inSpeed = dx2 > 0 ? (dy2 / dx2) * avgSpeed2 : 0;
              inEase.push(new KeyframeEase(inSpeed, inInfluence));
            }
          } else {
            inEase = prop.keyInTemporalEase(keyIndex);
          }
        } else {
          inEase = prop.keyInTemporalEase(keyIndex);
        }

        prop.setTemporalEaseAtKey(keyIndex, inEase, outEase);
        totalKeysModified++;
      }
    }
  }

  app.endUndoGroup();
  return "Modified " + totalKeysModified + " keyframes";
};

/**
 * Reads the easing of all selected keyframe pairs and returns
 * an array of bezier control points, one per property.
 */
export const getSelectedKeyframeEasing = () => {
  var comp = getActiveComp();
  if (!comp) return { curves: [], playhead: null };

  var layers = comp.selectedLayers;
  if (!layers || layers.length === 0) return { curves: [], playhead: null };

  var results: Array<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    fps: number;
    duration: number;
    name: string;
  }> = [];
  var playhead: number | null = null;
  var spanStart: number | null = null;
  var spanEnd: number | null = null;

  for (var i = 0; i < layers.length; i++) {
    var layer = layers[i];
    var props = getTargetProperties(layer);

    for (var p = 0; p < props.length; p++) {
      var prop = props[p];
      var multiDim = isMultiDimValue(prop);

      var keys = getTargetKeys(prop);

      // Find first pair of adjacent keyframes for this property
      for (var k = 0; k < keys.length - 1; k++) {
        var k1 = keys[k];
        var k2 = keys[k + 1];

        if (
          prop.keyOutInterpolationType(k1) ===
            KeyframeInterpolationType.HOLD ||
          prop.keyInInterpolationType(k2) === KeyframeInterpolationType.HOLD
        ) {
          continue;
        }

        var t1 = prop.keyTime(k1);
        var t2 = prop.keyTime(k2);
        var dt = t2 - t1;
        if (dt <= 0) continue;

        var v1 = prop.keyValue(k1);
        var v2 = prop.keyValue(k2);

        var avgSpeed: number;
        if (multiDim) {
          var sum = 0;
          var a = v1 as number[];
          var b = v2 as number[];
          for (var di = 0; di < a.length; di++) {
            sum += (b[di] - a[di]) * (b[di] - a[di]);
          }
          avgSpeed = Math.sqrt(sum) / dt;
        } else {
          avgSpeed = Math.abs(((v2 as number) - (v1 as number)) / dt);
        }

        var outEase = prop.keyOutTemporalEase(k1);
        var inEase = prop.keyInTemporalEase(k2);

        var outInfl = outEase[0].influence / 100;
        var outSpd = outEase[0].speed;
        var inInfl = inEase[0].influence / 100;
        var inSpd = inEase[0].speed;

        var bx1 = outInfl;
        var by1 = avgSpeed > 0 ? (outSpd / avgSpeed) * bx1 : 0;
        var bx2 = 1 - inInfl;
        var by2 = avgSpeed > 0 ? 1 - (inSpd / avgSpeed) * inInfl : 1;

        // Compute playhead position for exactly 2 selected keys
        if (playhead === null && keys.length === 2) {
          spanStart = t1;
          spanEnd = t2;
          var normalized = (comp.time - t1) / dt;
          if (normalized >= 0 && normalized <= 1) {
            playhead = normalized;
          }
        }

        results.push({
          x1: bx1,
          y1: by1,
          x2: bx2,
          y2: by2,
          fps: comp.frameRate,
          duration: dt,
          name: prop.name,
        });
        break; // only first pair per property
      }
    }
  }

  return { curves: results, playhead: playhead, spanStart: spanStart, spanEnd: spanEnd };
};

/**
 * Lightweight function that only returns the comp's current time.
 * Used for high-frequency playhead polling.
 */
export const getCompTime = () => {
  var comp = getActiveComp();
  if (!comp) return null;
  return comp.time;
};
