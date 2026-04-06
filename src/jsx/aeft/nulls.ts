import { getActiveComp } from "./aeft-utils";

function getNextCtrlName(comp: CompItem): string {
  var max = 0;
  for (var i = 1; i <= comp.numLayers; i++) {
    var match = comp.layers[i].name.match(/^Ctrl_(\d+)$/);
    if (match) {
      var num = parseInt(match[1], 10);
      if (num > max) max = num;
    }
  }
  var next = max + 1;
  return "Ctrl_" + (next < 10 ? "0" : "") + next;
}

/**
 * Get the visual center of a layer's content bounds in comp space.
 * Accounts for anchor offset, scale, rotation, and parent chains.
 */
function getLayerCenterInComp(
  layer: AVLayer,
  comp: CompItem
): [number, number] {
  // sourceRect gives content bounds in layer space (origin at layer top-left, not anchor)
  var rect = (layer as any).sourceRectAtTime(comp.time, false);
  if (!rect) {
    // Fallback for layers without sourceRect — use position as-is
    var fallbackPos = layer.position.value as number[];
    return [fallbackPos[0], fallbackPos[1]];
  }

  // Content center in layer space
  var contentCenterX = rect.left + rect.width / 2;
  var contentCenterY = rect.top + rect.height / 2;

  // Offset from anchor point to content center (in layer space)
  var anchorVal = layer.anchorPoint.value as number[];
  var offsetX = contentCenterX - anchorVal[0];
  var offsetY = contentCenterY - anchorVal[1];

  // Apply layer's own scale
  var scale = layer.scale.value as number[];
  offsetX *= scale[0] / 100;
  offsetY *= scale[1] / 100;

  // Apply layer's own rotation
  var rotation = (layer.rotation as Property).value as number;
  if (rotation !== 0) {
    var rad = rotation * Math.PI / 180;
    var cosR = Math.cos(rad);
    var sinR = Math.sin(rad);
    var rotX = offsetX * cosR - offsetY * sinR;
    var rotY = offsetX * sinR + offsetY * cosR;
    offsetX = rotX;
    offsetY = rotY;
  }

  // Get anchor position in comp space via unparent trick
  // (temporarily remove parent so position is in comp coords)
  var parent = layer.parent;
  layer.parent = null;
  var compPos = layer.position.value as number[];
  layer.parent = parent;

  return [compPos[0] + offsetX, compPos[1] + offsetY];
}

export const createNull = () => {
  var comp = getActiveComp();
  if (!comp) return;

  // Snapshot selection before adding the null (addNull creates at top of stack)
  var selected: Layer[] = [];
  for (var i = 0; i < comp.selectedLayers.length; i++) {
    selected[selected.length] = comp.selectedLayers[i];
  }

  app.beginUndoGroup("Pendulum: Create Null");

  var nullLayer = comp.layers.addNull();
  nullLayer.name = getNextCtrlName(comp);

  // Ensure null's anchor point is at its center (100x100 null)
  nullLayer.anchorPoint.setValue([50, 50]);

  if (selected.length === 0) {
    // No selection: center of comp
    nullLayer.position.setValue([comp.width / 2, comp.height / 2]);
  } else {
    // Compute the average visual center of all selected layers in comp space
    var sumX = 0;
    var sumY = 0;
    for (var i = 0; i < selected.length; i++) {
      var center = getLayerCenterInComp(selected[i] as AVLayer, comp);
      sumX += center[0];
      sumY += center[1];
    }
    nullLayer.position.setValue([
      sumX / selected.length,
      sumY / selected.length,
    ]);

    // Parent selected layers to the null
    for (var i = 0; i < selected.length; i++) {
      selected[i].parent = nullLayer;
    }
  }

  app.endUndoGroup();
};
