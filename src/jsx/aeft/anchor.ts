import { getActiveComp } from "./aeft-utils";

function calcAnchorFromRect(
  position: string,
  rect: { top: number; left: number; width: number; height: number }
): [number, number] {
  var x = rect.left;
  var y = rect.top;

  // Column: L=left, C=center, R=right
  var col = position.charAt(1);
  if (col === "C") {
    x = rect.left + rect.width / 2;
  } else if (col === "R") {
    x = rect.left + rect.width;
  }

  // Row: T=top, M=middle, B=bottom
  var row = position.charAt(0);
  if (row === "M") {
    y = rect.top + rect.height / 2;
  } else if (row === "B") {
    y = rect.top + rect.height;
  }

  return [x, y];
}

export const moveAnchorPoint = (position: string) => {
  var comp = getActiveComp();
  if (!comp) return;

  var layers = comp.selectedLayers;
  if (!layers || layers.length === 0) return;

  app.beginUndoGroup("Pendulum: Move Anchor Point");

  for (var i = 0; i < layers.length; i++) {
    var layer = layers[i] as AVLayer;

    // Skip layers without sourceRectAtTime (cameras, lights)
    if (typeof (layer as any).sourceRectAtTime !== "function") continue;
    if (!layer.anchorPoint) continue;

    var rect = layer.sourceRectAtTime(comp.time, false);
    var target = calcAnchorFromRect(position, rect);

    var oldAnchor = layer.anchorPoint.value as number[];
    var is3D = layer.threeDLayer;

    // New anchor: keep z component if 3D
    var newAnchor: number[];
    if (is3D) {
      newAnchor = [target[0], target[1], oldAnchor[2]];
    } else {
      newAnchor = [target[0], target[1]];
    }

    var dx = newAnchor[0] - oldAnchor[0];
    var dy = newAnchor[1] - oldAnchor[1];

    // Unparent-move-reparent technique:
    // Temporarily remove parent so position is in comp space,
    // adjust anchor + position, then restore parent.
    // AE handles the coordinate conversions automatically.
    var parent = layer.parent;
    layer.parent = null;

    // Read position in comp space (after unparenting)
    var unparentedPos = layer.position.value as number[];

    // Set new anchor
    layer.anchorPoint.setValue(newAnchor);

    // Compensate position so layer doesn't shift
    if ((layer.position as any).dimensionsSeparated) {
      // Separated dimensions: set X and Y individually
      var xProp = layer.property("ADBE Position_0") as Property;
      var yProp = layer.property("ADBE Position_1") as Property;
      xProp.setValue(unparentedPos[0] + dx);
      yProp.setValue(unparentedPos[1] + dy);
    } else if (is3D) {
      layer.position.setValue([
        unparentedPos[0] + dx,
        unparentedPos[1] + dy,
        unparentedPos[2],
      ]);
    } else {
      layer.position.setValue([unparentedPos[0] + dx, unparentedPos[1] + dy]);
    }

    // Restore parent
    layer.parent = parent;
  }

  app.endUndoGroup();
};
