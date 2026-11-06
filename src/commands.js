/* RasmCAD command input helpers. Pure functions; no DOM or drawing mutation. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./precision.js'));
  else root.RasmCommands = factory(root.RasmPrecision);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (P) {
  'use strict';
  const LIMIT = 1e12;
  const numericSource = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[+-]?\\d+)?';
  const numericPattern = new RegExp('^' + numericSource + '$', 'i');
  const pointPattern = new RegExp('^(@)?\\s*(' + numericSource + ')\\s*([,<])\\s*(' + numericSource + ')$', 'i');

  // Call this for command/number input, not TEXT contents or file contents.
  function normalizeInput(value) {
    return String(value == null ? '' : value)
      .replace(/[\u0660-\u0669\u06f0-\u06f9]/g, digit => String(digit.charCodeAt(0) - (digit.charCodeAt(0) <= 0x669 ? 0x660 : 0x6f0)))
      .replace(/\u066b/g, '.')
      .replace(/\u066c/g, '')
      .replace(/\u060c/g, ',')
      .replace(/\u2212/g, '-')
      .replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '');
  }

  function number(input) {
    if (typeof input === 'number') return Number.isFinite(input) ? input : null;
    if (typeof input !== 'string') return null;
    const value = normalizeInput(input).trim();
    if (!numericPattern.test(value)) return null;
    const result = Number(value);
    return Number.isFinite(result) ? result : null;
  }

  function finitePoint(point) {
    return !!point && Number.isFinite(point.x) && Number.isFinite(point.y);
  }
  function checkedPoint(point, label) {
    if (!finitePoint(point) || Math.abs(point.x) > LIMIT || Math.abs(point.y) > LIMIT)
      throw new RangeError((label || 'Point') + ' must have finite coordinates between -1e12 and 1e12.');
    return { x: point.x, y: point.y };
  }
  function angleDirection(degrees) {
    const angle = degrees % 360;
    // Exact cardinal values avoid tiny unwanted offsets at large coordinates.
    if (angle === 0) return { x: 1, y: 0 };
    if (angle === 90 || angle === -270) return { x: 0, y: 1 };
    if (angle === 180 || angle === -180) return { x: -1, y: 0 };
    if (angle === 270 || angle === -90) return { x: 0, y: -1 };
    const radians = angle * Math.PI / 180;
    return { x: Math.cos(radians), y: Math.sin(radians) };
  }

  // Absolute x,y; relative @dx,dy; relative polar @distance<degrees.
  // Polar distances can be zero or signed; direct scalar lengths must be positive.
  // Bare distance<angle is deliberately not an absolute-point syntax.
  function parsePoint(input, base = null) {
    const match = normalizeInput(input).trim().match(pointPattern);
    if (!match || (match[3] === '<' && !match[1])) return null;
    const relative = !!match[1];
    if (relative && base == null) throw new Error('Specify a base point before relative coordinates.');
    const origin = relative ? checkedPoint(base, 'Base point') : { x: 0, y: 0 };
    const a = number(match[2]), b = number(match[4]);
    if (a === null || b === null) throw new RangeError('Coordinate values must be finite.');
    const direction = match[3] === '<' ? angleDirection(b) : null;
    const delta = direction ? { x: direction.x * a, y: direction.y * a } : { x: a, y: b };
    return checkedPoint({ x: origin.x + delta.x, y: origin.y + delta.y });
  }

  function unitVector(vector) {
    if (!finitePoint(vector)) return null;
    const scale = Math.max(Math.abs(vector.x), Math.abs(vector.y));
    if (!scale) return null;
    const x = vector.x / scale, y = vector.y / scale, length = Math.hypot(x, y);
    return { x: x / length, y: y / length };
  }

  // A scalar length follows the current cursor bearing, then the last bearing,
  // then +X. An explicit angle is measured CCW from +X and overrides Ortho.
  function distancePoint(base, length, cursor = null, options = {}) {
    const start = checkedPoint(base, 'Base point'), value = number(length);
    if (value === null || value <= 0) throw new RangeError('Length must be a positive finite number.');
    const settings = options && typeof options === 'object' ? options : {};
    let direction;
    if (settings.angleDegrees != null) {
      const angle = number(settings.angleDegrees);
      if (angle === null) throw new RangeError('Angle must be a finite number of degrees.');
      direction = angleDirection(angle);
    } else {
      direction = finitePoint(cursor) ? unitVector({ x: cursor.x - start.x, y: cursor.y - start.y }) : null;
      direction = direction || unitVector(settings.lastDirection) || { x: 1, y: 0 };
      if (settings.ortho) direction = Math.abs(direction.x) >= Math.abs(direction.y)
        ? { x: direction.x < 0 ? -1 : 1, y: 0 }
        : { x: 0, y: direction.y < 0 ? -1 : 1 };
    }
    return checkedPoint({ x: start.x + direction.x * value, y: start.y + direction.y * value });
  }

  function commandSplit(input) {
    const match = normalizeInput(input).trim().match(/^(\S+)(?:\s+([\s\S]*))?$/);
    return match ? { name: match[1].toUpperCase(), rest: match[2] || '' } : { name: '', rest: '' };
  }

  // This is completion/help vocabulary, not a feature-coverage score. Registered
  // aliases (L, CO, DLI, etc.) are intentionally omitted from this list.
  const descriptions = {
    LINE: 'Draw connected line segments; enter a length, point, U or C.',
    STRETCH: "Stretch vertices inside a crossing window.",
    BREAK: "Remove a picked interval from a line, path or arc.",
    LENGTHEN: "Change total length, delta or percentage near an endpoint.",
    ALIGN: "Align two source and destination point pairs; optional uniform scale.",
    PEDIT: "Convert, close, open, join, reverse and edit polyline vertices.",
    SPLINE: "Draw an editable interpolating spline.",
    SPLINEDIT: "Edit native spline control points, tension and closure.",
    OVERKILL: "Remove compatible duplicates and collinear overlaps.",
    HATCH: "Create a solid or patterned fill from boundaries or an interior pick.",
    HATCHEDIT: "Change a native hatch pattern, angle or spacing.",
    BOUNDARY: "Trace a closed planar boundary at an interior point.",
    REGION: "Create a planar polygonal region with holes.",
    BLOCK: "Create a reusable native named block definition.",
    INSERT: "Insert a named block with scale, rotation and attribute values.",
    WBLOCK: "Export a reusable block as a native project.",
    BEDIT: "Edit block definition geometry in an isolated session.",
    REFEDIT: "Open a selected block reference definition for editing.",
    BCLOSE: "Save or discard a staged block definition edit.",
    ATTDEF: "Add, update or remove attribute definitions.",
    ATTEDIT: "Edit a block insertion attribute values.",
    ATTSYNC: "Synchronize block reference attribute definitions.",
    DIMSTYLE: "Create, copy and preset named dimension styles; edit all supported rendered fields.",
    DIMCONTINUE: "Continue a dimension from the last measured endpoint.",
    DIMBASELINE: "Add dimensions from a shared reference datum.",
    DIMORDINATE: "Measure an X or Y coordinate from a chosen datum.",
    DIMEDIT: "Change dimension text, placement or restore measurement.",
    QLEADER: "Create a leader arrow and annotation.",
    MLEADER: "Create an editable multiarm leader annotation.",
    MLEADEREDIT: "Change leader text, placement, or add and remove arms.",
    OSNAPSET: "Configure endpoint, intersection, perpendicular, tangent and nearest snaps.",

    PLINE: 'Draw an open or closed polyline; C closes the path.',
    RECTANGLE: 'Draw opposite corners or enter Dimensions after the first corner.',
    CIRCLE: 'Center/radius, diameter, 2P, 3P or TTR on two nonparallel LINE supports.',
    ARC: 'Draw center/start/end-direction arcs or a three-point arc with 3P.',
    TEXT: 'Place plain text at an insertion point.',
    MOVE: 'Move selected objects by a base point and destination.',
    COPY: 'Single/Multiple copies or Array with count and Fit; U undoes the last operation.',
    MIRROR: 'Reflect across a two-point axis; KEEP or DELETE controls the source.',
    ROTATE: 'Rotate about a pivot, using an angle or a picked/numeric Reference.',
    SCALE: 'Scale about a base, using a factor or a picked/numeric Reference length.',
    TRIM: 'Trim supported geometry at visible or selected boundaries.',
    EXTEND: 'Extend supported open geometry to boundaries.',
    OFFSET: 'Offset by distance or Through; choose source/current layer and erase-source mode.',
    FILLET: 'Round two LINE objects with a tangent arc; Trim or NoTrim.',
    CHAMFER: 'Bevel two LINE objects by distances or Angle; Trim or NoTrim.',
    ARRAY: 'Make independent copies in rows and columns.',
    POLARARRAY: 'Make independent rotated copies about a center.',
    EXPLODE: 'Convert a polyline or native dimension into its components.',
    JOIN: 'Join connected open lines/polylines on one layer.',
    ERASE: 'Delete selected objects.',
    SELECT: 'Pick objects or drag a directional selection window.',
    SELECTALL: 'Select visible, unlocked objects.',
    DIST: 'Measure distance between two points.',
    ANGLE: 'Measure an angle from arm, vertex and arm points.',
    AREA: 'Measure a closed shape or point-defined polygon.',
    ID: 'Report coordinates of a picked point.',
    DIM: 'Place an aligned dimension between two points.',
    DIMLINEAR: 'Place a horizontal linear dimension.',
    DIMVERTICAL: 'Place a vertical linear dimension.',
    DIMANGULAR: 'Place an angular dimension from three points.',
    DIMRADIUS: 'Place a radius dimension on a circle or arc.',
    DIMDIAMETER: 'Place a diameter dimension on a circle or arc.',
    DIMTXT: 'Set default text height for new dimensions.',
    DIMSCALE: 'Set default overall annotation scale for new dimensions.',
    DIMASZ: 'Set default arrow size for new dimensions.',
    DIMEXO: 'Set default extension-line offset for new dimensions.',
    DIMEXE: 'Set default extension-line extension for new dimensions.',
    DIMGAP: 'Set default text gap for new dimensions.',
    DIMDEC: 'Set decimal places, 0 through 8, for new dimensions.',
    LAYER: 'Create a layer with the entered name.',
    ZOOM: 'Fit visible drawing extents into the viewport.',
    PAN: 'Pan the drawing view.',
    GRID: 'Toggle the drawing grid.',
    OSNAP: 'Toggle supported object snaps.',
    ORTHO: 'Toggle horizontal/vertical drawing constraints.',
    REGEN: 'Redraw the current view.',
    REDRAW: 'Redraw the current view.',
    UNDO: 'Undo the last document change.',
    REDO: 'Redo the last undone document change.',
    NEW: 'Start a new drawing after any save prompt.',
    OPEN: 'Open a RasmCAD project, supported DWG or ASCII DXF.',
    SAVE: 'Download an editable RasmCAD project.',
    SAVEAS: 'Choose a name, file location and native/DXF version; DWG encoding is unavailable.',
    PLOT: 'Preview vectors and plot extents, display, window or selection to PDF or printer.',
    APERTURE: 'Set the running snap aperture in screen pixels (1–50).',
    SNAPPRIORITY: 'Choose snap mode priority or restore DEFAULT.',
    POLAR: 'Enable or disable WCS angle tracking with an increment.',
    OTRACK: 'Enable or disable acquired x/y object snap tracking.',
    FROM: 'Choose a temporary reference base for relative point input.',
    TRACK: 'Acquire the currently hovered exact snap for object tracking.',
    DYNMODE: 'Show or hide distance, angle and typed input by the cursor.',
    EXPORT: 'Download supported geometry as ASCII DXF.',
    PRINT: 'Plot extents, display, mouse window or selected objects to vector PDF or a printer dialog.',
    LIST: 'Report selected objects as structured data.',
    PROPERTIES: 'Open the selected-object properties panel.',
    MATCHPROP: 'Select appearance fields in Settings and match one source to multiple compatible targets.',
    HELP: 'Show application instructions and supported workflows.'
  };
  const catalog = Object.freeze(Object.keys(descriptions).sort().map(name => Object.freeze({ name, description: descriptions[name] })));
  function suggest(input, max = 8) {
    const prefix = normalizeInput(input).trimStart().toUpperCase();
    if (!/^[A-Z]+$/.test(prefix)) return [];
    const requested = number(max), limit = requested === null ? 8 : Math.max(0, Math.floor(requested));
    return catalog.filter(entry => entry.name.startsWith(prefix)).slice(0, limit);
  }

  return Object.freeze({ normalizeInput, number, parsePoint, distancePoint, commandSplit, catalog, suggest, circleThrough3Points:P.circleThrough3Points });
});
