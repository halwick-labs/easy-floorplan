import { describe, expect, it } from "vitest";
import { toggleRectAreaSide } from "./area-tools";
import { rectAreaSideWallSegments } from "./editor-geometry";
import type { Area } from "./types";

function rectangleArea(): Area {
  return {
    id: "room1",
    points: [
      { x: 100, y: 100 },
      { x: 300, y: 100 },
      { x: 300, y: 240 },
      { x: 100, y: 240 },
    ],
    showName: true,
  } as Area;
}

describe("toggleRectAreaSide interval targeting", () => {
  it("uses the full target interval for a fresh full-edge toggle", () => {
    const base = rectangleArea();

    const wall = toggleRectAreaSide(base, 2, 0.82, { start: 0, end: 1 });
    expect(wall).toBeDefined();
    expect(wall!.sideWalls?.bottom).toBe("wall");

    const divider = toggleRectAreaSide(wall!, 2, 0.82, { start: 0, end: 1 });
    expect(divider).toBeDefined();
    expect(divider!.sideWalls?.bottom).toBe("divider");

    const none = toggleRectAreaSide(divider!, 2, 0.82, { start: 0, end: 1 });
    expect(none).toBeDefined();
    expect(none!.sideWalls?.bottom).toBeUndefined();
  });

  it("fills the full interval when toggling an uncovered region on a segmented side", () => {
    const base = rectangleArea();
    base.sideWalls = {
      top: [{ start: 0.4, end: 0.6, state: "wall" }],
    };

    const updated = toggleRectAreaSide(base, 0, 0.1, { start: 0, end: 1 });
    expect(updated).toBeDefined();
    expect(updated!.sideWalls?.top).toBe("wall");
  });

  it("cycles the full interval when clicking inside an existing segment", () => {
    const base = rectangleArea();
    base.sideWalls = {
      top: [
        { start: 0.1, end: 0.3, state: "wall" },
        { start: 0.6, end: 0.8, state: "wall" },
      ],
    };

    const updated = toggleRectAreaSide(base, 0, 0.2, { start: 0, end: 1 });
    expect(updated).toBeDefined();
    expect(updated!.sideWalls?.top).toBe("wall");
  });
});
