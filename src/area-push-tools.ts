import type { Area, AreaPoint, RectAreaSide } from "./types";
import {
  RECT_AREA_EPSILON,
  isRectArea,
  rectAreaHasMinimumSize,
  rectAreaSharedEdgeCouple,
} from "./editor-geometry";

export function rectAreasOverlap(a: Area, b: Area): boolean {
  const aXs = a.points.map((p) => p.x);
  const aYs = a.points.map((p) => p.y);
  const bXs = b.points.map((p) => p.x);
  const bYs = b.points.map((p) => p.y);
  return (
    Math.max(...aXs) > Math.min(...bXs) &&
    Math.min(...aXs) < Math.max(...bXs) &&
    Math.max(...aYs) > Math.min(...bYs) &&
    Math.min(...aYs) < Math.max(...bYs)
  );
}

export function moveAreaBoundary(
  points: readonly AreaPoint[],
  delta: { dx: number; dy: number },
  movingSide?: RectAreaSide,
  movingBoundary?: number
): AreaPoint[] | undefined {
  if (!movingSide) return undefined;
  const isVertical = movingSide === "left" || movingSide === "right";
  const bounds = {
    minX: Math.min(...points.map((p) => p.x)),
    maxX: Math.max(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxY: Math.max(...points.map((p) => p.y)),
  };
  const boundary = movingBoundary ?? (
    isVertical
      ? (movingSide === "right" ? bounds.maxX : bounds.minX)
      : (movingSide === "bottom" ? bounds.maxY : bounds.minY)
  );
  const next = points.map((point) => {
    if (isVertical) {
      if (Math.abs(point.x - boundary) > RECT_AREA_EPSILON) return { ...point };
      return { ...point, x: boundary + delta.dx };
    }
    if (Math.abs(point.y - boundary) > RECT_AREA_EPSILON) return { ...point };
    return { ...point, y: boundary + delta.dy };
  });
  return next;
}

export function coupleSharedBoundarySegment(
  points: readonly AreaPoint[],
  other: readonly AreaPoint[],
  delta: { dx: number; dy: number },
  movingSide?: RectAreaSide,
  movingBoundary?: number
): AreaPoint[] | undefined {
  if (!movingSide) return undefined;
  if (Math.abs(delta.dx) < RECT_AREA_EPSILON && Math.abs(delta.dy) < RECT_AREA_EPSILON) return undefined;

  const bounds = {
    minX: Math.min(...points.map((p) => p.x)),
    maxX: Math.max(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxY: Math.max(...points.map((p) => p.y)),
  };

  const isVertical = movingSide === "left" || movingSide === "right";
  const primaryBoundary = movingBoundary ?? (
    isVertical
      ? (movingSide === "right" ? bounds.maxX : bounds.minX)
      : (movingSide === "bottom" ? bounds.maxY : bounds.minY)
  );
  const otherBoundary = primaryBoundary;
  const boundaryIntervals = (
    poly: readonly AreaPoint[],
    boundary: number
  ): Array<{ start: number; end: number }> => {
    const intervals: Array<{ start: number; end: number }> = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!;
      const b = poly[(i + 1) % poly.length]!;
      if (isVertical) {
        if (Math.abs(a.x - boundary) > RECT_AREA_EPSILON || Math.abs(b.x - boundary) > RECT_AREA_EPSILON) continue;
        const start = Math.min(a.y, b.y);
        const end = Math.max(a.y, b.y);
        if (end - start > RECT_AREA_EPSILON) intervals.push({ start, end });
        continue;
      }
      if (Math.abs(a.y - boundary) > RECT_AREA_EPSILON || Math.abs(b.y - boundary) > RECT_AREA_EPSILON) continue;
      const start = Math.min(a.x, b.x);
      const end = Math.max(a.x, b.x);
      if (end - start > RECT_AREA_EPSILON) intervals.push({ start, end });
    }
    return intervals;
  };

  const primaryIntervals = boundaryIntervals(points, primaryBoundary);
  const otherIntervals = boundaryIntervals(other, otherBoundary);
  if (!primaryIntervals.length || !otherIntervals.length) return undefined;

  const overlapIntervals: Array<{ start: number; end: number }> = [];
  for (const a of primaryIntervals) {
    for (const b of otherIntervals) {
      const start = Math.max(a.start, b.start);
      const end = Math.min(a.end, b.end);
      if (end - start > RECT_AREA_EPSILON) {
        overlapIntervals.push({ start, end });
      }
    }
  }
  if (!overlapIntervals.length) return undefined;

  const coupled = other.map((point) => ({ ...point }));
  const moveVertex = new Array<boolean>(other.length).fill(false);

  for (let i = 0; i < other.length; i++) {
    const j = (i + 1) % other.length;
    const a = other[i]!;
    const b = other[j]!;
    const edgeOnBoundary = isVertical
      ? Math.abs(a.x - otherBoundary) <= RECT_AREA_EPSILON && Math.abs(b.x - otherBoundary) <= RECT_AREA_EPSILON
      : Math.abs(a.y - otherBoundary) <= RECT_AREA_EPSILON && Math.abs(b.y - otherBoundary) <= RECT_AREA_EPSILON;
    if (!edgeOnBoundary) continue;

    const edgeStart = isVertical ? Math.min(a.y, b.y) : Math.min(a.x, b.x);
    const edgeEnd = isVertical ? Math.max(a.y, b.y) : Math.max(a.x, b.x);
    const overlaps = overlapIntervals.some((interval) => {
      const start = Math.max(interval.start, edgeStart);
      const end = Math.min(interval.end, edgeEnd);
      return end - start > RECT_AREA_EPSILON;
    });
    if (!overlaps) continue;

    moveVertex[i] = true;
    moveVertex[j] = true;
  }

  let moved = false;
  for (let i = 0; i < coupled.length; i++) {
    if (!moveVertex[i]) continue;
    if (isVertical) {
      coupled[i] = { ...coupled[i]!, x: primaryBoundary + delta.dx };
    } else {
      coupled[i] = { ...coupled[i]!, y: primaryBoundary + delta.dy };
    }
    moved = true;
  }

  return moved ? coupled : undefined;
}

export function coupleRectAreaSharedEdges(
  primaryId: string,
  points: AreaPoint[],
  delta: { dx: number; dy: number },
  areas: readonly Area[],
  movingSide?: RectAreaSide,
  movingBoundary?: number
): { areas: Area[]; coupledIds: Set<string> } {
  let primaryPoints = points;
  const sharedReference = points;
  const updated = new Map<string, AreaPoint[]>();
  const coupledIds = new Set<string>();

  for (const other of areas) {
    if (other.id === primaryId) continue;
    const otherPoints = updated.get(other.id) ?? other.points;
    if (other.locked) continue;
    const coupled = rectAreaSharedEdgeCouple(sharedReference, otherPoints, delta, movingSide);
    if (!coupled) {
      const polygonCoupled = coupleSharedBoundarySegment(
        sharedReference,
        otherPoints,
        delta,
        movingSide,
        movingBoundary
      );
      if (!polygonCoupled) continue;
      primaryPoints = moveAreaBoundary(
        sharedReference,
        delta,
        movingSide,
        movingBoundary
      ) ?? primaryPoints;
      updated.set(other.id, polygonCoupled);
      coupledIds.add(other.id);
      continue;
    }
    primaryPoints = coupled.points;
    updated.set(other.id, coupled.other);
    coupledIds.add(other.id);
  }

  return {
    areas: areas.map((a) => {
      if (a.id === primaryId) return { ...a, points: primaryPoints };
      const next = updated.get(a.id);
      return next ? { ...a, points: next } : a;
    }),
    coupledIds,
  };
}

export function coupledEdgeResize(
  primaryId: string,
  moving: Area,
  delta: { dx: number; dy: number },
  areas: readonly Area[],
  movingSide: RectAreaSide,
  movingBoundary?: number
): { areas: Area[]; coupledIds: Set<string>; delta: { dx: number; dy: number } } {
  const requested = coupleRectAreaSharedEdges(
    primaryId,
    moving.points,
    delta,
    areas,
    movingSide,
    movingBoundary
  );
  if (!requested.coupledIds.size) return { ...requested, delta };

  const componentIds = new Set([primaryId, ...requested.coupledIds]);
  const obstacles = areas.filter((a) => !componentIds.has(a.id));
  const collides = (candidate: { areas: Area[] }): boolean =>
    candidate.areas.some(
      (a) =>
        componentIds.has(a.id) &&
        ((isRectArea(a.points) && !rectAreaHasMinimumSize(a.points)) || obstacles.some((other) => rectAreasOverlap(a, other)))
    );

  if (!collides(requested)) return { ...requested, delta };

  let low = 0;
  let high = 1;
  for (let i = 0; i < 18; i++) {
    const scale = (low + high) / 2;
    const candidateDelta = { dx: delta.dx * scale, dy: delta.dy * scale };
    const candidate = coupleRectAreaSharedEdges(
      primaryId,
      moving.points,
      candidateDelta,
      areas,
      movingSide,
      movingBoundary
    );
    if (collides(candidate)) high = scale;
    else low = scale;
  }

  const safeDelta = { dx: delta.dx * low, dy: delta.dy * low };
  return {
    ...coupleRectAreaSharedEdges(primaryId, moving.points, safeDelta, areas, movingSide, movingBoundary),
    delta: safeDelta,
  };
}
