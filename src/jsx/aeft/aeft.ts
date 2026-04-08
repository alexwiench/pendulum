import { moveAnchorPoint } from "./anchor";
import { createNull } from "./nulls";
import { applyBezierEasing, getSelectedKeyframeEasing, getCompTime } from "./easing";

export const pickColor = (r: number, g: number, b: number): string => {
  var initial = (r << 16) | (g << 8) | b;
  var result = $.colorPicker(initial);
  if (result === -1) return "cancelled";
  var ro = (result >> 16) & 0xff;
  var go = (result >> 8) & 0xff;
  var bo = result & 0xff;
  return ro + "," + go + "," + bo;
};

export { moveAnchorPoint, createNull, applyBezierEasing, getSelectedKeyframeEasing, getCompTime };
