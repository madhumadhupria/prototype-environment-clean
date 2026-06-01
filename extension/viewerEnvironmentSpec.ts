// CAD/BIM neutral viewer environment — Spline-inspired cool grey + floor grid.

/** Clear color / canvas background (#E9ECF1). */
export const CAD_BIM_BACKGROUND = {
	r: 233,
	g: 236,
	b: 241,
} as const;

export const CAD_BIM_GRID = {
	minHalfExtent: 12,
	/** Padding applied per footprint axis (grid square covers max(spanU, spanV) × padding). */
	footprintPadding: 2.6,
	targetCellSize: 1,
	minDivisions: 20,
	maxDivisions: 64,
	minorColor: 0x4a6fa5,
	majorColor: 0x355f8a,
	edgeColor: 0x254a6e,
	lineOpacity: 0.52,
	majorLineOpacity: 0.52,
	edgeOpacity: 0.36,
	majorStep: 5,
	showFootprintEdge: true,
	showAxisLines: false,
	/** Tiny lift to reduce z-fighting; keep at 0 so the grid meets the model base. */
	floorLift: 0,
	/** Hide grid when the camera drops below this offset from the floor plane. */
	belowCameraEpsilon: 0.15,
	/** Back-face ground cap — blocks seeing through the floor from underneath. */
	groundOccluderScale: 1.35,
	/** Full-opacity core (0–1 of half-extent); fades toward transparent at the edge. */
	fadeCoreRatio: 0.42,
	fadeMinOpacity: 0,
	/** Sub-segments per grid line for smooth opacity falloff toward the boundary. */
	fadeSegmentsPerLine: 12,
	fadeOpacityBuckets: 16,
	/** Segments below this opacity are omitted (prevents white halos at the edge). */
	fadeCutoffOpacity: 0.04,
} as const;

/** Gridlines option 2 — dark workspace + Unity-style floor grid. */
export const UNITY_GRID = {
	minHalfExtent: 12,
	footprintPadding: 3.8,
	/** Aim for uniform cube-like cells across the padded footprint. */
	targetCellsAcross: 48,
	targetCellSize: 1,
	minDivisions: 20,
	maxDivisions: 120,
	minorColor: 0x5c6678,
	majorColor: 0x5c6678,
	lineOpacity: 0.22,
	majorLineOpacity: 0.22,
	majorStep: 10,
	showMajorLines: false,
	showFootprintEdge: false,
	showAxisLines: true,
	/** Center axis along U — red (X). */
	axisUColor: 0xff4d4d,
	/** Center axis along V — blue (Z). */
	axisVColor: 0x4d9fff,
	axisOpacity: 0.72,
	floorLift: 0,
	/** Slight lift for line geometry only — avoids z-fighting with the model base. */
	gridSurfaceLift: 0.003,
	/** Hide grid only when the camera drops below the floor plane. */
	belowCameraEpsilon: 0.15,
	groundOccluderScale: 1.6,
	groundLocked: true,
	/** Fade outer ring sooner so edge lines do not read as bright white. */
	fadeCoreRatio: 0.68,
	fadeMinOpacity: 0,
	fadeSegmentsPerLine: 8,
	fadeOpacityBuckets: 12,
	fadeCutoffOpacity: 0.03,
} as const;

export type EnvironmentGridConfig = typeof CAD_BIM_GRID | typeof UNITY_GRID;

/** Dark bluish-grey workspace for Gridlines option 2 (#1a2433). */
export const UNITY_BACKGROUND = {
	r: 26,
	g: 36,
	b: 51,
} as const;

/** Translucent green section box — light faces, darker green on hover. */
export const SECTION_BOX_STYLE = {
	faceColor: 0x4ade80,
	faceOpacity: 0.1,
	faceHoverColor: 0x22c55e,
	faceHoverOpacity: 0.42,
	edgeColor: 0x166534,
	edgeOpacity: 0.85,
	facePickScale: 1.04,
} as const;

/** Section tool 2 — Unity-style outline box with corner/edge resize handles. */
export const OUTLINE_SECTION_BOX_STYLE = {
	faceColor: 0xf2f2f2,
	faceOpacity: 0.14,
	faceHoverColor: 0xffffff,
	faceHoverOpacity: 0.2,
	edgeColor: 0x4a4a4a,
	edgeOpacity: 0.92,
	facePickScale: 1.04,
	handleColor: 0x3a3a3a,
	handleOpacity: 1,
	handleSizeRatio: 0.014,
	handleMinSize: 0.1,
} as const;

/** Padding around model bounds — section box cannot expand beyond this envelope. */
export const SECTION_BOX_ENVELOPE = {
	paddingRatio: 0.035,
	paddingMin: 0.75,
} as const;

export const CAD_BIM_LIGHTING = {
	ambient: { color: 0xffffff, intensity: 0.72 },
	directional: {
		color: 0xffffff,
		intensity: 0.48,
		position: [15, 30, 20] as const,
		target: [0, 3, 0] as const,
	},
} as const;

/** @deprecated Use CAD_BIM_HOME_VIEW — kept for exports. */
export const CAD_BIM_CAMERA = {
	fov: 45,
	position: [18, 14, 22] as const,
	target: [0, 3, 0] as const,
	minDistance: 10,
	maxDistance: 60,
} as const;

/**
 * Default camera when CAD/BIM neutral loads (and ViewCube "home").
 * Matches ViewCube TOP + FRONT + LEFT (compass W under left, S under front).
 */
export const CAD_BIM_HOME_VIEW = {
	/** LMV ViewCube corner id — same as clicking front+top+left on the ViewCube. */
	viewCubeCorner: 'front,top,left' as const,
	/** Optional exact override from viewerEnvironmentCaptureHome() in the console. */
	viewArray: null as readonly number[] | null,
	/** Fallback if ViewCube/autocam is unavailable. */
	orbit: {
		azimuthRadians: 0.75 * Math.PI,
		elevationRadians: 0.32,
		distanceScale: 2.4,
	},
	fov: 45,
	distanceScale: 2.4,
} as const;

export const ACC_DEFAULT = {
	/** Grey Room — canvas color comes from UNITY_BACKGROUND, not the preset gradient. */
	lightPresetIndex: 3,
	background: [
		UNITY_BACKGROUND.r,
		UNITY_BACKGROUND.g,
		UNITY_BACKGROUND.b,
		UNITY_BACKGROUND.r,
		UNITY_BACKGROUND.g,
		UNITY_BACKGROUND.b,
	] as const,
} as const;

export const VIEWER_ENVIRONMENT_OVERLAY_SCENE = 'priyam-viewer-environment-grid';
export const SECTION_BOX_OVERLAY_SCENE = 'priyam-viewer-environment-section-box';
export const SECTION_BOX_CUT_PLANE_SET = 'priyam-viewer-environment-section-cut';
export const ROTATE_GIZMO_OVERLAY_SCENE = 'priyam-viewer-environment-rotate-gizmo';
export const ROTATE_HIGHLIGHT_OVERLAY_SCENE = 'priyam-viewer-environment-rotate-highlight';

/** Rotate gizmo — Blender-style orbit arcs at building corner pivot. */
export const ROTATE_GIZMO_STYLE = {
	outlineColor: 0xff8a2a,
	outlineOpacity: 0.45,
	pivotColor: 0xffffff,
	pivotBorderColor: 0x1c2430,
	pivotRadiusRatio: 0.006,
	/** Arc radius as a fraction of horizontal footprint span. */
	ringRadiusRatio: 0.08,
	maxRingRadius: 2,
	minRingRadius: 0.28,
	/** Visible arc span (π = semi-circle on outer edge). */
	arcSpanRadians: Math.PI,
	arcSegments: 36,
	arcLineOpacity: 0.72,
	arcLineActiveOpacity: 0.95,
	/** World-space line pick tolerance for thin arcs. */
	arcPickThreshold: 0.14,
	axisUColor: 0xff4d4d,
	axisVColor: 0x5fd35f,
	horizontalColor: 0x4d9fff,
	arcColor: 0xffffff,
	arcOpacity: 0.55,
	sectorOpacity: 0.14,
} as const;
