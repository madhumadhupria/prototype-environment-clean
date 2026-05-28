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
	edgeOpacity: 0.36,
	majorStep: 5,
	/** Tiny lift to reduce z-fighting; grid sits flush with the model base. */
	floorLift: 0.001,
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
	lightPresetIndex: 4,
	background: [220, 224, 229, 250, 250, 250] as const,
} as const;

export const VIEWER_ENVIRONMENT_OVERLAY_SCENE = 'priyam-viewer-environment-grid';
