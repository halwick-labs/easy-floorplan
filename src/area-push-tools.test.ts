import { describe, expect, it } from "vitest";
import { rectAreasOverlap } from "./area-push-tools";
import type { Area } from "./types";

function area(id: string, points: Array<{ x: number; y: number }>): Area {
  return { id, points } as Area;
}

describe("rectAreasOverlap", () => {
  it("does not treat pure shared boundaries as overlap", () => {
    const left = area("left", [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 },
      { x: 0, y: 20 },
    ]);
    const right = area("right", [
      { x: 20, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 20 },
      { x: 20, y: 20 },
    ]);
    expect(rectAreasOverlap(left, right)).toBe(false);
  });

  it("does not treat an L-shape notch occupant as overlapping", () => {
    const lShape = area("l", [
      { x: 500, y: 100 },
      { x: 620, y: 100 },
      { x: 620, y: 160 },
      { x: 560, y: 160 },
      { x: 560, y: 300 },
      { x: 500, y: 300 },
    ]);
    const notchOccupant = area("notch", [
      { x: 580, y: 210 },
      { x: 610, y: 210 },
      { x: 610, y: 260 },
      { x: 580, y: 260 },
    ]);
    expect(rectAreasOverlap(lShape, notchOccupant)).toBe(false);
  });

  it("still detects true interior overlap for concave polygons", () => {
    const lShape = area("l", [
      { x: 500, y: 100 },
      { x: 620, y: 100 },
      { x: 620, y: 160 },
      { x: 560, y: 160 },
      { x: 560, y: 300 },
      { x: 500, y: 300 },
    ]);
    const intruding = area("intruding", [
      { x: 520, y: 240 },
      { x: 550, y: 240 },
      { x: 550, y: 280 },
      { x: 520, y: 280 },
    ]);
    expect(rectAreasOverlap(lShape, intruding)).toBe(true);
  });

  it("detects overlap when a rectangle intersects only part of an L arm", () => {
    const movedL = area("l", [
      { x: 544.5, y: 120 },
      { x: 744.5, y: 120 },
      { x: 744.5, y: 180 },
      { x: 624.5, y: 180 },
      { x: 624.5, y: 340 },
      { x: 544.5, y: 340 },
    ]);
    const blocker = area("blocker", [
      { x: 590, y: 220 },
      { x: 630, y: 220 },
      { x: 630, y: 300 },
      { x: 590, y: 300 },
    ]);
    expect(rectAreasOverlap(movedL, blocker)).toBe(true);
  });
});
