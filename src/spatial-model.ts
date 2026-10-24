import { emptyConfig, type FloorplanCardConfig, getFloors, makeFloor } from "./types";

export interface SpatialPoint {
  x: number;
  y: number;
  z: number;
}
export interface SpatialLamp {
  id: string;
  entity_id: string;
  name: string;
  points: SpatialPoint[];
}
export interface FloorplanDocument {
  schema_version: 1;
  units_per_meter: number;
  origin: { x: number; y: number };
  config: FloorplanCardConfig;
}
export interface SpatialLayout {
  name: string;
  width: number;
  length: number;
  height: number;
  lights: SpatialLamp[];
  floorplan?: FloorplanDocument;
}
const itemId = (id: string) => `spatial_${id}`;
const midpoint = (lamp: SpatialLamp) => ({
  x: lamp.points.reduce((sum, p) => sum + p.x, 0) / lamp.points.length,
  y: lamp.points.reduce((sum, p) => sum + p.y, 0) / lamp.points.length,
});

/** Stable metric origin; changing a wall/canvas never shifts the scanned lights. */
export function canvasPoint(point: Pick<SpatialPoint, "x" | "y">, plan: FloorplanDocument) {
  return {
    x: plan.origin.x + point.x * plan.units_per_meter,
    y: plan.origin.y - point.y * plan.units_per_meter,
  };
}
export function metricPoint(point: { x: number; y: number }, plan: FloorplanDocument) {
  return {
    x: (point.x - plan.origin.x) / plan.units_per_meter,
    y: (plan.origin.y - point.y) / plan.units_per_meter,
  };
}

export function seedFloorplan(layout: SpatialLayout): FloorplanDocument {
  const units = 100;
  const config = emptyConfig("custom:spatial-floorplan-editor");
  config.title = layout.name;
  config.width = (layout.width + 2) * units;
  config.height = (layout.length + 2) * units;
  config.grid = 50;
  config.snap = 5;
  config.overlayScale = "plan";
  const plan: FloorplanDocument = {
    schema_version: 1,
    units_per_meter: units,
    origin: { x: units, y: (layout.length + 1) * units },
    config,
  };
  const floor = makeFloor(layout.name);
  floor.id = "spatial_room";
  floor.areas = [
    {
      id: "spatial_outline",
      name: layout.name,
      points: [
        { x: 0, y: 0 },
        { x: layout.width, y: 0 },
        { x: layout.width, y: layout.length },
        { x: 0, y: layout.length },
      ].map((p) => canvasPoint(p, plan)),
      borderColor: "#8fabb9",
      borderWidth: 4,
      opacity: 0.12,
    },
  ];
  config.floors = [floor];
  return syncFloorplan({ ...layout, floorplan: plan }).floorplan as FloorplanDocument;
}

/** Refresh bindings/positions after numeric edits, scan import or entity renames. */
export function syncFloorplan<T extends SpatialLayout>(layout: T): T {
  if (!layout.floorplan) return layout;
  const plan = structuredClone(layout.floorplan);
  const floors = getFloors(plan.config);
  if (floors.length !== 1) throw new Error("Use a separate Spatial Lighting room for each floor.");
  const floor = floors[0];
  const old = new Map(floor.items.map((item) => [item.id, item]));
  floor.items = [
    ...floor.items.filter((item) => !item.id.startsWith("spatial_")),
    ...layout.lights.map((lamp) => ({
      ...old.get(itemId(lamp.id)),
      id: itemId(lamp.id),
      entity: lamp.entity_id,
      name: lamp.name,
      kind: "light" as const,
      ...canvasPoint(midpoint(lamp), plan),
      size: 30,
      showName: true,
    })),
  ];
  plan.config.floors = floors;
  return { ...layout, floorplan: plan };
}

/** Apply only explicit marker deltas; never replace a fixture's scanned endpoints. */
export function applyFloorplan<T extends SpatialLayout>(layout: T, plan: FloorplanDocument): T {
  if (!Number.isFinite(plan.units_per_meter) || plan.units_per_meter <= 0)
    throw new Error("Choose a positive drawing scale.");
  const floors = getFloors(plan.config);
  if (floors.length !== 1) throw new Error("Use a separate Spatial Lighting room for each floor.");
  const previous = layout.floorplan ?? seedFloorplan(layout);
  const previousItems = new Map(getFloors(previous.config)[0].items.map((item) => [item.id, item]));
  const lights = layout.lights.map((lamp) => {
    const items = floors[0].items.filter((item) => item.id === itemId(lamp.id));
    if (items.length !== 1 || items[0].entity !== lamp.entity_id)
      throw new Error("Keep mapped lamp bindings. Add or remove lamps in the Lamps tab.");
    const item = items[0];
    if (!Number.isFinite(item.x) || !Number.isFinite(item.y))
      throw new Error("Lamp coordinates must be finite.");
    const before = previousItems.get(item.id) ?? canvasPoint(midpoint(lamp), previous);
    const from = metricPoint(before, previous),
      to = metricPoint(item, plan);
    const dx = Math.abs(to.x - from.x) < 1e-9 ? 0 : to.x - from.x;
    const dy = Math.abs(to.y - from.y) < 1e-9 ? 0 : to.y - from.y;
    return {
      ...lamp,
      points: lamp.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })),
    };
  }) as T["lights"];
  return { ...layout, lights, floorplan: structuredClone(plan) };
}

export function floorplanShapes(layout: SpatialLayout) {
  if (!layout.floorplan) return [];
  const plan = layout.floorplan;
  return getFloors(plan.config).flatMap((floor) =>
    (floor.areas ?? []).map((area) => ({
      id: area.id,
      name: area.name ?? "",
      points: area.points.map((p) => metricPoint(p, plan)),
    })),
  );
}

/** Rigid movement of a scan; height and every gradient endpoint are retained. */
export function alignScan<T extends SpatialLayout>(
  layout: T,
  x: number,
  y: number,
  angle: number,
): T {
  if (![x, y, angle].every(Number.isFinite)) throw new Error("Choose finite alignment values.");
  const radians = (angle * Math.PI) / 180;
  const lights = layout.lights.map((lamp) => ({
    ...lamp,
    points: lamp.points.map((p) => ({
      ...p,
      x: p.x * Math.cos(radians) - p.y * Math.sin(radians) + x,
      y: p.x * Math.sin(radians) + p.y * Math.cos(radians) + y,
    })),
  })) as T["lights"];
  return syncFloorplan({ ...layout, lights });
}
