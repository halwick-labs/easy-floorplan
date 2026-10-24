# Spatial Lighting host adapter

Forked from nicosandller/easy-floorplan at 7a571c175dea9a58c0a8ec8a321565ce264236be.
The original MIT license and copyright remain in LICENSE.

This fork adds a `<spatial-floorplan-editor>` custom element. A Home Assistant
host supplies `hass` and a `layout` property and listens for `layout-changed`
and `layout-error`. The editor owns local drawing interactions only. The host
owns room persistence, permissions, motion settings and lighting playback.

The layout has a name, width, length and height in metres; lights retain their
stable IDs, entity bindings and scanned XYZ point arrays. An additive
`floorplan` holds the drawing config, a metric origin and `units_per_meter`.
The drawing uses centimetres by default. Its downward Y axis is converted at
the boundary; changing a wall never shifts lamp coordinates. Marker movement
translates every endpoint together and preserves height and gradient ordering.
Mapped lights cannot be silently removed or rebound from the drawing.

Use Area to draw arbitrary polygons, including several recesses and angled
walls. The numeric corner editor adds/removes corners and accepts metre
coordinates, sharing the upstream undo stack through `applyConfigEdit`.
Multiple areas, walls, doors, windows and furniture remain available. Curved
boundaries can be approximated with short straight segments. Outlines with
holes are not represented as one polygon by this adapter.

The spatial subclass hides the upstream dashboard Apply action and floor
selector; a host Save room action persists the whole room together. Full-screen
drawing must be exited to use the host footer. The original HACS editor tag is
registered conditionally so an existing upstream resource can coexist.

Pure geometry utilities are exported from `./geometry`: seedFloorplan,
syncFloorplan, applyFloorplan, canvasPoint, metricPoint, floorplanShapes and
alignScan. The custom element is exported from `./spatial`. The normal card
entry also registers the adapter.

The home-automation workspace uses this adapter in its Spatial Lighting card
and stores the data through the existing `spatial_lighting.save_room` action,
with expected revisions. There is no additional bridge connection. Existing
recipes and motion opt-in settings remain owned by that backend. Areas are
visual context; this adapter does not implement colour-path or zone algorithms.

Validation: build, typecheck and unit tests; the host additionally tests room
preservation, rejected lamp removal, corner edits and undo, and Home Assistant
save/reload behavior. Installation-specific scans and room documents must stay
out of public source control.
