import { describe, expect, it } from "vitest";
import { getFloors } from "./types";

function required<T>(value: T | null | undefined): T {
  if (value == null) throw new Error("Expected fixture value");
  return value;
}

import {
  alignScan,
  applyFloorplan,
  canvasPoint,
  floorplanShapes,
  metricPoint,
  type SpatialLayout,
  seedFloorplan,
  syncFloorplan,
} from "./spatial-model";

const layout = (): SpatialLayout => ({
  name: "Room",
  width: 7,
  length: 5,
  height: 2.5,
  lights: [
    {
      id: "gradient",
      entity_id: "light.gradient",
      name: "Gradient",
      points: [
        { x: 1.234567890123, y: 2.1, z: 0.1 },
        { x: 1.234567890123, y: 2.1, z: 1.5 },
      ],
    },
    { id: "up", entity_id: "light.up", name: "Pendant up", points: [{ x: 4, y: 3, z: 1.6 }] },
    {
      id: "down",
      entity_id: "light.down",
      name: "Pendant down",
      points: [{ x: 4, y: 3, z: 1.55 }],
    },
  ],
});

describe("metric bridge to the existing Spatial Lighting document", () => {
  it("retains the complete scan exactly when an outline or canvas changes", () => {
    const room = layout(),
      plan = seedFloorplan(room);
    plan.config.width += 200;
    required(getFloors(plan.config)[0].areas?.[0]).points = [
      { x: 100, y: 100 },
      { x: 500, y: 100 },
      { x: 500, y: 300 },
      { x: 300, y: 300 },
      { x: 300, y: 600 },
      { x: 100, y: 600 },
    ];
    const edited = applyFloorplan(room, plan);
    expect(edited.lights).toEqual(room.lights);
    expect(floorplanShapes(edited)[0].points).toHaveLength(6);
    expect(edited.floorplan?.config.width).toBe(1100);
    expect(room.floorplan).toBeUndefined();
  });
  it("moves all gradient points together and keeps colocated outputs independent", () => {
    const room = layout(),
      plan = seedFloorplan(room);
    const marker = getFloors(plan.config)[0].items[0];
    marker.x += 125;
    marker.y -= 25;
    const edited = applyFloorplan(room, plan);
    for (const [i, point] of edited.lights[0].points.entries()) {
      expect(point.x - room.lights[0].points[i].x).toBeCloseTo(1.25, 12);
      expect(point.y - room.lights[0].points[i].y).toBeCloseTo(0.25, 12);
      expect(point.z).toBe(room.lights[0].points[i].z);
    }
    expect(edited.lights.slice(1)).toEqual(room.lights.slice(1));
    expect(edited.lights.map((l) => l.id)).toEqual(["gradient", "up", "down"]);
  });
  it("rejects missing, duplicated or rebound mapped outputs instead of dropping recipes", () => {
    const room = layout();
    for (const change of [
      (plan: ReturnType<typeof seedFloorplan>) => getFloors(plan.config)[0].items.pop(),
      (plan: ReturnType<typeof seedFloorplan>) => {
        getFloors(plan.config)[0].items[0].entity = "light.other";
      },
      (plan: ReturnType<typeof seedFloorplan>) => {
        getFloors(plan.config)[0].items.push(getFloors(plan.config)[0].items[0]);
      },
    ]) {
      const plan = seedFloorplan(room);
      change(plan);
      expect(() => applyFloorplan(room, plan)).toThrow("Keep mapped lamp bindings");
    }
    const plan = seedFloorplan(room);
    plan.units_per_meter = 0;
    expect(() => applyFloorplan(room, plan)).toThrow("positive drawing scale");
    plan.units_per_meter = 100;
    required(plan.config.floors).push(structuredClone(getFloors(plan.config)[0]));
    expect(() => applyFloorplan(room, plan)).toThrow("separate Spatial Lighting room");
  });
  it("refreshes renamed entities and numeric positions without losing furniture or wall edits", () => {
    let room = layout();
    room.floorplan = seedFloorplan(room);
    getFloors(required(room.floorplan).config)[0].texts.push({
      id: "note",
      x: 500,
      y: 500,
      text: "Sofa",
    });
    room.lights[0].entity_id = "light.renamed";
    room.lights[0].points = [
      { x: 2, y: 3, z: 0.2 },
      { x: 2, y: 3, z: 1.6 },
    ];
    room = syncFloorplan(room);
    const item = getFloors(required(room.floorplan).config)[0].items[0];
    expect(item.entity).toBe("light.renamed");
    expect(metricPoint(item, required(room.floorplan))).toEqual({ x: 2, y: 3 });
    expect(getFloors(required(room.floorplan).config)[0].texts[0].text).toBe("Sofa");
    expect(item).toMatchObject(canvasPoint({ x: 2, y: 3 }, required(room.floorplan)));
  });
  it("aligns a complete scan rigidly without changing heights or endpoint spacing", () => {
    const room = layout();
    room.floorplan = seedFloorplan(room);
    const edited = alignScan(room, 3, 1, 90);
    expect(edited.lights[1].points[0].x).toBeCloseTo(0);
    expect(edited.lights[1].points[0].y).toBeCloseTo(5);
    expect(edited.lights[0].points.map((p) => p.z)).toEqual([0.1, 1.5]);
    expect(getFloors(required(edited.floorplan).config)[0].areas).toEqual(
      getFloors(required(room.floorplan).config)[0].areas,
    );
    expect(() => alignScan(room, Number.NaN, 0, 0)).toThrow("finite");
  });
});
