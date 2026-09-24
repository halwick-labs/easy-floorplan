import type {
  Area,
  AreaPoint,
  RectAreaSide,
  RectAreaSideWallSegment,
  RectAreaSideWallValue,
} from "./types";
import { RECT_AREA_SIDES } from "./types";
import {
  RECT_AREA_EPSILON,
  rectAreaClamp,
  rectAreaPoints,
  rectAreaSharedSides,
  rectAreaSideWallNext,
  rectAreaSideWallSegments,
} from "./editor-geometry";
import { coupleSharedBoundarySegment } from "./area-push-tools";
import { signedArea, traceFaces } from "./dead-space";
import { pointInPolygon } from "./render";

export function updateAreaRectangleDraft(
  start: AreaPoint,
  target: AreaPoint,
  areas: readonly Area[],
  snap: (value: number) => number
): { points: AreaPoint[] } {
  const snapped = { x: snap(target.x), y: snap(target.y) };
  return {
    points: rectAreaClamp(
      rectAreaPoints({ x0: start.x, y0: start.y, x1: snapped.x, y1: snapped.y }),
      areas,
      { dx: snapped.x - start.x, dy: snapped.y - start.y }
    ),
  };
}

export function segmentWindowAt(t: number, span = 0.3): { start: number; end: number } {
  const half = span / 2;
  let start = Math.max(0, t - half);
  let end = Math.min(1, t + half);
  if (end - start < 0.08) {
    start = Math.max(0, t - 0.04);
    end = Math.min(1, t + 0.04);
  }
  return { start, end };
}

export function normalizeRectAreaSideSegments(
  segments: RectAreaSideWallSegment[]
): RectAreaSideWallSegment[] {
  const filtered = segments
    .map((segment) => ({
      start: Math.max(0, Math.min(1, segment.start)),
      end: Math.max(0, Math.min(1, segment.end)),
      state: segment.state,
    }))
    .filter(
      (segment) =>
        segment.end - segment.start > RECT_AREA_EPSILON &&
        (segment.state === "wall" || segment.state === "divider")
    )
    .sort((a, b) => a.start - b.start);

  const out: RectAreaSideWallSegment[] = [];
  for (const segment of filtered) {
    const last = out[out.length - 1];
    if (!last) {
      out.push({ ...segment });
      continue;
    }
    if (segment.start < last.end - RECT_AREA_EPSILON && segment.state === last.state) {
      last.end = Math.max(last.end, segment.end);
      continue;
    }
    const start = segment.start < last.end - RECT_AREA_EPSILON ? Math.max(last.end, segment.start) : segment.start;
    if (segment.end - start <= RECT_AREA_EPSILON) continue;
    out.push({ ...segment, start });
  }
  return out;
}

export function rectAreaEdgeFraction(
  area: Area,
  edgeIndex: number,
  point?: { x: number; y: number }
): number {
  if (!point) return 0.5;
  if (point.x === 0 && point.y === 0) return 0.5;
  const p = area.points[edgeIndex];
  const next = area.points[(edgeIndex + 1) % area.points.length];
  if (!p || !next) return 0.5;
  const dx = next.x - p.x;
  const dy = next.y - p.y;
  const t = Math.abs(dx) >= Math.abs(dy)
    ? (Math.abs(dx) < RECT_AREA_EPSILON ? 0.5 : (point.x - p.x) / dx)
    : (Math.abs(dy) < RECT_AREA_EPSILON ? 0.5 : (point.y - p.y) / dy);
  return Math.min(1, Math.max(0, t));
}

export function rectAreaOppositeSide(side: RectAreaSide): RectAreaSide {
  switch (side) {
    case "top":
      return "bottom";
    case "bottom":
      return "top";
    case "left":
      return "right";
    case "right":
      return "left";
  }
}

export function rectAreaEdgeSide(area: Area, edgeIndex: number): RectAreaSide {
  const p = area.points[edgeIndex];
  const next = area.points[(edgeIndex + 1) % area.points.length];
  if (!p || !next) return RECT_AREA_SIDES[edgeIndex % RECT_AREA_SIDES.length];
  const bounds = {
    minX: Math.min(...area.points.map((point) => point.x)),
    maxX: Math.max(...area.points.map((point) => point.x)),
    minY: Math.min(...area.points.map((point) => point.y)),
    maxY: Math.max(...area.points.map((point) => point.y)),
  };
  const horizontal = Math.abs(p.y - next.y) < RECT_AREA_EPSILON;
  if (horizontal) {
    return Math.abs(p.y - bounds.minY) < RECT_AREA_EPSILON ? "top" : "bottom";
  }
  return Math.abs(p.x - bounds.minX) < RECT_AREA_EPSILON ? "left" : "right";
}

export function toggleRectAreaSide(a: Area, edgeIndex: number, clickT = 0.5): Area | undefined {
  if (a.locked) return undefined;
  const side = rectAreaEdgeSide(a, edgeIndex);
  const current = a.sideWalls?.[side];

  if (Array.isArray(current)) {
    const nextSegments = rectAreaSideWallSegments(current).map((segment) => ({ ...segment }));
    const hit = nextSegments.findIndex(
      (segment) => clickT >= segment.start - RECT_AREA_EPSILON && clickT <= segment.end + RECT_AREA_EPSILON
    );

    if (hit >= 0) {
      const seg = nextSegments[hit]!;
      const next = rectAreaSideWallNext(seg.state);
      if (next === "none") nextSegments.splice(hit, 1);
      else nextSegments[hit] = { ...seg, state: next };
    } else {
      const w = segmentWindowAt(clickT);
      nextSegments.push({ start: w.start, end: w.end, state: "wall" });
    }

    const normalized = normalizeRectAreaSideSegments(nextSegments);
    const sideWalls = { ...(a.sideWalls ?? {}) };
    if (!normalized.length) delete sideWalls[side];
    else if (normalized.length === 1 && normalized[0]!.start <= RECT_AREA_EPSILON && normalized[0]!.end >= 1 - RECT_AREA_EPSILON)
      sideWalls[side] = normalized[0]!.state;
    else sideWalls[side] = normalized;
    return { ...a, sideWalls: Object.keys(sideWalls).length ? sideWalls : undefined };
  }

  const state = Array.isArray(current)
    ? (current.length ? current[0]!.state : "none")
    : (current ?? "none");
  const next = rectAreaSideWallNext(state);
  const sideWalls = { ...(a.sideWalls ?? {}) };
  if (next === "none") delete sideWalls[side];
  else sideWalls[side] = next;
  return { ...a, sideWalls: Object.keys(sideWalls).length ? sideWalls : undefined };
}

export function splitRectAreaSide(
  a: Area,
  edgeIndex: number,
  clickT: number,
  hasPointerCoords = true
): Area | undefined {
  if (a.locked) return undefined;
  const side = rectAreaEdgeSide(a, edgeIndex);
  const sideWalls = { ...(a.sideWalls ?? {}) };
  const prev = sideWalls[side] as RectAreaSideWallValue | undefined;
  const window = segmentWindowAt(clickT);

  if (typeof prev === "string" && prev !== "none") {
    const segmentWindow = window;
    sideWalls[side] = [{ start: segmentWindow.start, end: segmentWindow.end, state: prev }];
    return { ...a, sideWalls };
  }

  const segments = rectAreaSideWallSegments(prev).map((segment) => ({ ...segment }));
  if (!hasPointerCoords) {
    const tail = segments.length ? Math.max(...segments.map((segment) => segment.end)) : 0;
    const state = segments.length ? segments[segments.length - 1]!.state : "wall";
    if (tail < 1 - RECT_AREA_EPSILON) {
      segments.push({ start: tail, end: 1, state });
    }
  } else {
    const existing = segments.find(
      (segment) => clickT > segment.start + RECT_AREA_EPSILON && clickT < segment.end - RECT_AREA_EPSILON
    );
    const state = existing?.state ?? "wall";
    const segmentWindow = window;
    segments.push({ start: segmentWindow.start, end: segmentWindow.end, state });
  }

  const normalized = normalizeRectAreaSideSegments(segments);
  if (!normalized.length) delete sideWalls[side];
  else if (normalized.length === 1 && normalized[0]!.start <= RECT_AREA_EPSILON && normalized[0]!.end >= 1 - RECT_AREA_EPSILON)
    sideWalls[side] = normalized[0]!.state;
  else sideWalls[side] = normalized;
  return { ...a, sideWalls: Object.keys(sideWalls).length ? sideWalls : undefined };
}

export function rectAreaUnionPoints(a: AreaPoint[], other: AreaPoint[]): AreaPoint[] | undefined {
  const xs = [...new Set([...a, ...other].map((point) => point.x))].sort((left, right) => left - right);
  const ys = [...new Set([...a, ...other].map((point) => point.y))].sort((left, right) => left - right);
  if (xs.length < 2 || ys.length < 2) return undefined;

  const occupied = Array.from({ length: xs.length - 1 }, () =>
    Array.from({ length: ys.length - 1 }, () => false)
  );
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < ys.length - 1; j++) {
      const cx = (xs[i]! + xs[i + 1]!) / 2;
      const cy = (ys[j]! + ys[j + 1]!) / 2;
      occupied[i]![j] = pointInPolygon(a, cx, cy) || pointInPolygon(other, cx, cy);
    }
  }

  const boundary: Array<{ a: AreaPoint; b: AreaPoint }> = [];
  const addSegment = (a: AreaPoint, b: AreaPoint): void => {
    if (Math.abs(a.x - b.x) < RECT_AREA_EPSILON && Math.abs(a.y - b.y) < RECT_AREA_EPSILON) return;
    boundary.push({ a, b });
  };

  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < ys.length - 1; j++) {
      if (!occupied[i]?.[j]) continue;
      const x0 = xs[i]!;
      const x1 = xs[i + 1]!;
      const y0 = ys[j]!;
      const y1 = ys[j + 1]!;
      const left = i > 0 && occupied[i - 1]?.[j];
      const right = i < xs.length - 2 && occupied[i + 1]?.[j];
      const below = j > 0 && occupied[i]?.[j - 1];
      const above = j < ys.length - 2 && occupied[i]?.[j + 1];
      if (!left) addSegment({ x: x0, y: y0 }, { x: x0, y: y1 });
      if (!right) addSegment({ x: x1, y: y0 }, { x: x1, y: y1 });
      if (!below) addSegment({ x: x0, y: y0 }, { x: x1, y: y0 });
      if (!above) addSegment({ x: x0, y: y1 }, { x: x1, y: y1 });
    }
  }

  const combine = [...a, ...other];
  const centroid = {
    x: combine.reduce((sum, point) => sum + point.x, 0) / combine.length,
    y: combine.reduce((sum, point) => sum + point.y, 0) / combine.length,
  };
  const ring = traceFaces(boundary, 1e-6)
    .filter((face) => face.length >= 3)
    .filter((face) => pointInPolygon(face, centroid.x, centroid.y))
    .sort((left, right) => Math.abs(signedArea(right)) - Math.abs(signedArea(left)))[0];
  if (!ring) return undefined;

  const collapseCollinear = (points: AreaPoint[]): AreaPoint[] => {
    const out: AreaPoint[] = [];
    for (let i = 0; i < points.length; i++) {
      const prev = points[(i - 1 + points.length) % points.length]!;
      const current = points[i]!;
      const next = points[(i + 1) % points.length]!;
      const dx1 = current.x - prev.x;
      const dy1 = current.y - prev.y;
      const dx2 = next.x - current.x;
      const dy2 = next.y - current.y;
      const cross = Math.abs(dx1 * dy2 - dy1 * dx2);
      const onLine = cross < RECT_AREA_EPSILON && (
        (Math.abs(current.x - prev.x) < RECT_AREA_EPSILON &&
          Math.abs(current.x - next.x) < RECT_AREA_EPSILON &&
          current.y >= Math.min(prev.y, next.y) - RECT_AREA_EPSILON &&
          current.y <= Math.max(prev.y, next.y) + RECT_AREA_EPSILON) ||
        (Math.abs(current.y - prev.y) < RECT_AREA_EPSILON &&
          Math.abs(current.y - next.y) < RECT_AREA_EPSILON &&
          current.x >= Math.min(prev.x, next.x) - RECT_AREA_EPSILON &&
          current.x <= Math.max(prev.x, next.x) + RECT_AREA_EPSILON)
      );
      if (!onLine) out.push(current);
    }
    return out.length >= 3 ? out : points;
  };

  const simplified = collapseCollinear(ring.map((point) => ({ ...point })));
  if (signedArea(simplified) < 0) simplified.reverse();
  return simplified;
}

export function mergeRectAreaSide(
  a: Area,
  edgeIndex: number,
  areas: readonly Area[]
): Area[] | undefined {
  const clickedSide = rectAreaEdgeSide(a, edgeIndex);
  const candidates = areas.filter(
    (candidate) =>
      candidate.id !== a.id &&
      !!a.haArea &&
      a.haArea === candidate.haArea &&
      rectAreaSharedSides(a.points, candidate.points).length > 0
  );
  const other = candidates.find((candidate) => {
    const sharedSides = rectAreaSharedSides(a.points, candidate.points);
    return sharedSides.includes(clickedSide) || sharedSides.includes(rectAreaOppositeSide(clickedSide));
  }) ?? candidates[0];
  if (!other) return undefined;

  const sharedSides = rectAreaSharedSides(a.points, other.points);
  const side = sharedSides.includes(clickedSide)
    ? clickedSide
    : sharedSides.includes(rectAreaOppositeSide(clickedSide))
      ? rectAreaOppositeSide(clickedSide)
      : sharedSides[0];
  if (!side) return undefined;

  const merged = rectAreaUnionPoints(a.points, other.points);
  if (!merged) return undefined;

  const beforeArea = Math.abs(signedArea(a.points)) + Math.abs(signedArea(other.points));
  const afterArea = Math.abs(signedArea(merged));
  const valid = Math.abs(afterArea - beforeArea) < 0.01;

  if (!valid) return undefined;

  return [
    ...areas.filter((candidate) => candidate.id !== a.id && candidate.id !== other.id),
    { ...a, points: merged, sideWalls: a.sideWalls ?? {} },
  ];
}

export function rectAreaEdgeModifierClass(
  area: Area,
  edgeIndex: number,
  areas: readonly Area[],
  areaEdgeModifier: string
): string {
  if (areaEdgeModifier === "join") {
    const side = rectAreaEdgeSide(area, edgeIndex);
    const delta = side === "left" || side === "right" ? { dx: 1, dy: 0 } : { dx: 0, dy: 1 };
    const shared = areas.map((candidate) => {
      if (candidate.id === area.id || !area.haArea || area.haArea !== candidate.haArea) return false;
      const rectShared = rectAreaSharedSides(area.points, candidate.points);
      if (rectShared.includes(side) || rectShared.includes(rectAreaOppositeSide(side))) return {
        id: candidate.id,
        rectShared,
        polygonShared: true,
      };
      return {
        id: candidate.id,
        rectShared,
        polygonShared: coupleSharedBoundarySegment(area.points, candidate.points, delta, side) !== undefined,
      };
    });
    const hasMatch = shared.some((candidate) => !!candidate && candidate.polygonShared);
    return hasMatch ? "modifier-ready" : "modifier-invalid";
  }
  if (areaEdgeModifier === "split") return "modifier-split";
  return "";
}

export function rectAreaEdgeCursor(area: Area, edgeIndex: number, modifierClass: string): string {
  if (modifierClass === "modifier-ready") return "copy";
  if (modifierClass === "modifier-invalid") return "not-allowed";
  const side = rectAreaEdgeSide(area, edgeIndex);
  return side === "top" || side === "bottom" ? "ns-resize" : "ew-resize";
}

