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

    // Collect all keyframed properties on this layer
    var props: Property[] = [];
    collectKeyframedProperties(layer as PropertyGroup, props);

    for (var p = 0; p < props.length; p++) {
      var prop = props[p];
      var easeDims = getEaseDimensions(prop);
      var multiDim = isMultiDimValue(prop);

      // Determine which keys to process:
      // Use selectedKeys if available, otherwise apply to all keyframes
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
