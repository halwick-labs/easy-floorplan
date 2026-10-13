import { describe, expect, it } from "vitest";
import { rectAreaUnionPoints, toggleRectAreaSide } from "./area-tools";
import { rectAreaSideWallSegments } from "./editor-geometry";
import { signedArea } from "./dead-space";
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

describe("toggleRectAreaSide without a target interval", () => {
  it("cycles the clicked segment's state when current is a segment array", () => {
    const base = rectangleArea();
    base.sideWalls = {
      top: [{ start: 0.1, end: 0.3, state: "wall" }],
    };

    const divider = toggleRectAreaSide(base, 0, 0.2);
    expect(divider).toBeDefined();
    expect(rectAreaSideWallSegments(divider!.sideWalls?.top)).toEqual([
      { start: 0.1, end: 0.3, state: "divider" },
    ]);

    const none = toggleRectAreaSide(divider!, 0, 0.2);
    expect(none).toBeDefined();
    expect(rectAreaSideWallSegments(none!.sideWalls?.top)).toEqual([]);
  });

  it("adds a new windowed segment when the click misses every existing segment", () => {
    const base = rectangleArea();
    base.sideWalls = {
      top: [{ start: 0.1, end: 0.3, state: "wall" }],
    };

    const updated = toggleRectAreaSide(base, 0, 0.7);
    expect(updated).toBeDefined();
    const segments = rectAreaSideWallSegments(updated!.sideWalls?.top);
    expect(segments).toHaveLength(2);
    expect(segments[1]!.state).toBe("wall");
    expect(segments[1]!.start).toBeCloseTo(0.55);
    expect(segments[1]!.end).toBeCloseTo(0.85);
  });

  it("cycles none -> wall -> divider -> none when current is a plain string", () => {
    const base = rectangleArea();

    const wall = toggleRectAreaSide(base, 2, 0.5);
    expect(wall).toBeDefined();
    expect(wall!.sideWalls?.bottom).toBe("wall");

    const divider = toggleRectAreaSide(wall!, 2, 0.5);
    expect(divider).toBeDefined();
    expect(divider!.sideWalls?.bottom).toBe("divider");

    const none = toggleRectAreaSide(divider!, 2, 0.5);
    expect(none).toBeDefined();
    expect(none!.sideWalls?.bottom).toBeUndefined();
  });
});

describe("rectAreaUnionPoints", () => {
  it("merges two edge-adjacent rectangles into their bounding rectangle", () => {
    const a = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 }];
    const b = [{ x: 20, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 10 }, { x: 20, y: 10 }];

    const merged = rectAreaUnionPoints(a, b);
    expect(merged).toBeDefined();
    expect(merged).toHaveLength(4);
    expect(Math.abs(signedArea(merged!))).toBeCloseTo(400);
    const xs = merged!.map((p) => p.x);
    const ys = merged!.map((p) => p.y);
    expect(Math.min(...xs)).toBe(0);
    expect(Math.max(...xs)).toBe(40);
    expect(Math.min(...ys)).toBe(0);
    expect(Math.max(...ys)).toBe(10);
  });

  it("returns undefined when the combined points don't span at least two x or y values", () => {
    const point = [
      { x: 5, y: 5 },
      { x: 5, y: 5 },
      { x: 5, y: 5 },
      { x: 5, y: 5 },
    ];
    expect(rectAreaUnionPoints(point, point)).toBeUndefined();
  });
});
