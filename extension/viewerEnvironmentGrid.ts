import { getLmvThree } from './lmvThree';
import { getModelWorldBounds, getModelWorldUp } from './viewerEnvironmentBounds';
import { CAD_BIM_GRID, VIEWER_ENVIRONMENT_OVERLAY_SCENE } from './viewerEnvironmentSpec';

export interface GridPlacement {
	anchor: THREE.Vector3;
	axisU: THREE.Vector3;
	axisV: THREE.Vector3;
	halfExtent: number;
	divisions: number;
	step: number;
	footprintCorners: THREE.Vector3[];
}

const getHorizontalAxes = (
	up: THREE.Vector3,
	THREE: typeof window.THREE
): { axisU: THREE.Vector3; axisV: THREE.Vector3 } => {
	let ref = new THREE.Vector3(0, 1, 0);
	if (Math.abs(up.dot(ref)) > 0.9) {
		ref = new THREE.Vector3(1, 0, 0);
	}
	if (Math.abs(up.dot(ref)) > 0.9) {
		ref = new THREE.Vector3(0, 0, 1);
	}
	const axisU = new THREE.Vector3().crossVectors(up, ref).normalize();
	const axisV = new THREE.Vector3().crossVectors(up, axisU).normalize();
	return { axisU, axisV };
};

const getBoxCorners = (box: THREE.Box3): THREE.Vector3[] => {
	const { min, max } = box;
	return [
		new THREE.Vector3(min.x, min.y, min.z),
		new THREE.Vector3(max.x, min.y, min.z),
		new THREE.Vector3(max.x, min.y, max.z),
		new THREE.Vector3(min.x, min.y, max.z),
		new THREE.Vector3(min.x, max.y, min.z),
		new THREE.Vector3(max.x, max.y, min.z),
		new THREE.Vector3(max.x, max.y, max.z),
		new THREE.Vector3(min.x, max.y, max.z),
	];
};

const projectToFloor = (point: THREE.Vector3, up: THREE.Vector3, floorW: number, lift: number): THREE.Vector3 =>
	point.clone().add(up.clone().multiplyScalar(floorW + lift - point.dot(up)));

/** 1 at grid center → min opacity at outer edge (never fully zero). */
const gridEdgeFade = (u: number, v: number, halfExtent: number): number => {
	if (!Number.isFinite(halfExtent) || halfExtent <= 0) return 1;
	const du = Math.abs(u - halfExtent) / halfExtent;
	const dv = Math.abs(v - halfExtent) / halfExtent;
	const edge = Math.max(du, dv);
	if (edge <= CAD_BIM_GRID.fadeCoreRatio) return 1;
	if (edge >= 1) return CAD_BIM_GRID.fadeMinOpacity;
	const t = (edge - CAD_BIM_GRID.fadeCoreRatio) / (1 - CAD_BIM_GRID.fadeCoreRatio);
	const s = t * t * (3 - 2 * t);
	return CAD_BIM_GRID.fadeMinOpacity + (1 - CAD_BIM_GRID.fadeMinOpacity) * (1 - s);
};

const quantizeOpacity = (opacity: number): number => {
	const buckets = CAD_BIM_GRID.fadeOpacityBuckets;
	const step = 1 / buckets;
	return Math.max(step, Math.round(opacity / step) * step);
};

/** Square grid on the floor plane, centered on the model footprint. */
export const getGridPlacement = (viewer: Autodesk.Viewing.GuiViewer3D): GridPlacement | null => {
	const THREE = getLmvThree();
	if (!THREE) return null;

	const up = getModelWorldUp(viewer);
	const { axisU, axisV } = getHorizontalAxes(up, THREE);
	const box = getModelWorldBounds(viewer);
	const half = CAD_BIM_GRID.minHalfExtent;
	const total = half * 2;

	const buildFallback = (): GridPlacement => {
		const floorCenter = up.clone().multiplyScalar(CAD_BIM_GRID.floorLift);
		const anchor = floorCenter
			.clone()
			.sub(axisU.clone().multiplyScalar(half))
			.sub(axisV.clone().multiplyScalar(half));
		const lift = up.clone().multiplyScalar(CAD_BIM_GRID.floorLift + 0.02);
		const c0 = anchor.clone().add(lift);
		return {
			anchor,
			axisU: axisU.clone(),
			axisV: axisV.clone(),
			halfExtent: half,
			divisions: CAD_BIM_GRID.minDivisions,
			step: total / CAD_BIM_GRID.minDivisions,
			footprintCorners: [
				c0,
				c0.clone().add(axisU.clone().multiplyScalar(total)),
				c0.clone().add(axisU.clone().multiplyScalar(total)).add(axisV.clone().multiplyScalar(total)),
				c0.clone().add(axisV.clone().multiplyScalar(total)),
				c0.clone(),
			],
		};
	};

	if (box.isEmpty()) return buildFallback();

	const corners = getBoxCorners(box);
	let wMin = Number.POSITIVE_INFINITY;
	for (const c of corners) {
		wMin = Math.min(wMin, c.dot(up));
	}

	const floorEps = 1e-3;
	const floorCorners = corners.filter(c => c.dot(up) <= wMin + floorEps);
	const floorPoints = floorCorners.length > 0 ? floorCorners : corners;

	let uMin = Number.POSITIVE_INFINITY;
	let vMin = Number.POSITIVE_INFINITY;
	let uMax = Number.NEGATIVE_INFINITY;
	let vMax = Number.NEGATIVE_INFINITY;
	for (const c of floorPoints) {
		const u = c.dot(axisU);
		const v = c.dot(axisV);
		uMin = Math.min(uMin, u);
		vMin = Math.min(vMin, v);
		uMax = Math.max(uMax, u);
		vMax = Math.max(vMax, v);
	}

	const spanU = Math.max(uMax - uMin, 1);
	const spanV = Math.max(vMax - vMin, 1);
	const pad = CAD_BIM_GRID.footprintPadding;
	const totalSize = Math.max(total, spanU * pad, spanV * pad);
	const halfExtent = totalSize / 2;
	const divisions = Math.min(
		CAD_BIM_GRID.maxDivisions,
		Math.max(CAD_BIM_GRID.minDivisions, Math.round(totalSize / CAD_BIM_GRID.targetCellSize))
	);
	const step = totalSize / divisions;

	const uCenter = (uMin + uMax) / 2;
	const vCenter = (vMin + vMax) / 2;

	// Center on footprint (not world AABB center) so grid extends equally behind/in front.
	const floorRef = floorPoints[0];
	const refU = floorRef.dot(axisU);
	const refV = floorRef.dot(axisV);
	const floorCenter = projectToFloor(
		floorRef
			.clone()
			.add(axisU.clone().multiplyScalar(uCenter - refU))
			.add(axisV.clone().multiplyScalar(vCenter - refV)),
		up,
		wMin,
		CAD_BIM_GRID.floorLift
	);

	const anchor = floorCenter
		.clone()
		.sub(axisU.clone().multiplyScalar(halfExtent))
		.sub(axisV.clone().multiplyScalar(halfExtent));
	const cornerAt = (u: number, v: number): THREE.Vector3 =>
		floorCenter
			.clone()
			.add(up.clone().multiplyScalar(0.02))
			.add(axisU.clone().multiplyScalar(u - uCenter))
			.add(axisV.clone().multiplyScalar(v - vCenter));

	return {
		anchor,
		axisU,
		axisV,
		halfExtent,
		divisions,
		step,
		footprintCorners: [
			cornerAt(uMin, vMin),
			cornerAt(uMax, vMin),
			cornerAt(uMax, vMax),
			cornerAt(uMin, vMax),
			cornerAt(uMin, vMin),
		],
	};
};

const markLineGeometry = (geometry: THREE.BufferGeometry): void => {
	(geometry as THREE.BufferGeometry & { isLines?: boolean }).isLines = true;
};

const geometryFromPoints = (THREE: typeof window.THREE, points: THREE.Vector3[]): THREE.BufferGeometry => {
	const geometry = new THREE.BufferGeometry();
	const positions = new Float32Array(points.length * 3);
	for (let i = 0; i < points.length; i++) {
		positions[i * 3] = points[i].x;
		positions[i * 3 + 1] = points[i].y;
		positions[i * 3 + 2] = points[i].z;
	}
	const attribute = new THREE.BufferAttribute(positions, 3);
	const g = geometry as THREE.BufferGeometry & {
		setAttribute?: (name: string, attr: THREE.BufferAttribute) => void;
		addAttribute?: (name: string, attr: THREE.BufferAttribute) => void;
	};
	if (typeof g.setAttribute === 'function') {
		g.setAttribute('position', attribute);
	} else if (typeof g.addAttribute === 'function') {
		g.addAttribute('position', attribute);
	}
	return geometry;
};

const disableMeshRaycast = (object: THREE.Object3D): void => {
	object.raycast = (): void => {};
};

const createLineSegments = (
	points: THREE.Vector3[],
	color: number,
	opacity: number,
	THREE: typeof window.THREE,
	renderOrder: number
): THREE.LineSegments | null => {
	if (points.length < 2 || opacity <= 0) return null;
	const geometry = geometryFromPoints(THREE, points);
	markLineGeometry(geometry);
	const material = new THREE.LineBasicMaterial({
		color,
		transparent: true,
		opacity,
		depthWrite: false,
		depthTest: true,
	});
	const lines = new THREE.LineSegments(geometry, material);
	lines.frustumCulled = false;
	lines.renderOrder = renderOrder;
	disableMeshRaycast(lines);
	return lines;
};

const pointOnGrid = (
	anchor: THREE.Vector3,
	axisU: THREE.Vector3,
	axisV: THREE.Vector3,
	u: number,
	v: number
): THREE.Vector3 => anchor.clone().add(axisU.clone().multiplyScalar(u)).add(axisV.clone().multiplyScalar(v));

const createCadBimGrid = (placement: GridPlacement, THREE: typeof window.THREE): THREE.Group => {
	const group = new THREE.Group();
	group.name = 'priyam-cad-bim-grid';
	group.frustumCulled = false;
	group.renderOrder = 50;

	const { halfExtent, divisions, step, anchor, axisU, axisV } = placement;
	const totalSize = halfExtent * 2;
	const opacityBuckets = new Map<number, { minor: THREE.Vector3[]; major: THREE.Vector3[]; edge: THREE.Vector3[] }>();

	const addLine = (p0: THREE.Vector3, p1: THREE.Vector3, u: number, v: number, isMajor: boolean): void => {
		const fade = gridEdgeFade(u, v, halfExtent);
		const opacity = quantizeOpacity(CAD_BIM_GRID.lineOpacity * fade);
		if (opacity <= 0) return;
		let bucket = opacityBuckets.get(opacity);
		if (!bucket) {
			bucket = { minor: [], major: [], edge: [] };
			opacityBuckets.set(opacity, bucket);
		}
		const list = isMajor ? bucket.major : bucket.minor;
		list.push(p0, p1);
	};

	const addEdgeLine = (p0: THREE.Vector3, p1: THREE.Vector3, u: number, v: number): void => {
		const fade = gridEdgeFade(u, v, halfExtent);
		const opacity = quantizeOpacity(CAD_BIM_GRID.edgeOpacity * fade);
		if (opacity <= 0) return;
		let bucket = opacityBuckets.get(opacity);
		if (!bucket) {
			bucket = { minor: [], major: [], edge: [] };
			opacityBuckets.set(opacity, bucket);
		}
		bucket.edge.push(p0, p1);
	};

	const segments = Math.max(2, CAD_BIM_GRID.fadeSegmentsPerLine);

	const addFadedSpan = (
		fixedU: number | null,
		fixedV: number | null,
		spanStart: number,
		spanEnd: number,
		isMajor: boolean
	): void => {
		const span = spanEnd - spanStart;
		for (let s = 0; s < segments; s++) {
			const t0 = spanStart + (span * s) / segments;
			const t1 = spanStart + (span * (s + 1)) / segments;
			const mid = (t0 + t1) / 2;
			const u = fixedU ?? mid;
			const v = fixedV ?? mid;
			const p0 =
				fixedU !== null
					? pointOnGrid(anchor, axisU, axisV, fixedU, t0)
					: pointOnGrid(anchor, axisU, axisV, t0, fixedV as number);
			const p1 =
				fixedU !== null
					? pointOnGrid(anchor, axisU, axisV, fixedU, t1)
					: pointOnGrid(anchor, axisU, axisV, t1, fixedV as number);
			addLine(p0, p1, u, v, isMajor);
		}
	};

	for (let i = 0; i <= divisions; i++) {
		const u = i * step;
		const isMajor = i % CAD_BIM_GRID.majorStep === 0;
		addFadedSpan(u, null, 0, totalSize, isMajor);
	}
	for (let j = 0; j <= divisions; j++) {
		const v = j * step;
		const isMajor = j % CAD_BIM_GRID.majorStep === 0;
		addFadedSpan(null, v, 0, totalSize, isMajor);
	}

	if (placement.footprintCorners.length > 0) {
		const pts = placement.footprintCorners;
		const edgeSegments = Math.max(2, Math.floor(segments / 2));
		for (let i = 0; i < pts.length - 1; i++) {
			const p0 = pts[i];
			const p1 = pts[i + 1];
			for (let s = 0; s < edgeSegments; s++) {
				const t0 = s / edgeSegments;
				const t1 = (s + 1) / edgeSegments;
				const mid = new THREE.Vector3().lerpVectors(p0, p1, (t0 + t1) / 2);
				const u = mid.clone().sub(anchor).dot(axisU);
				const v = mid.clone().sub(anchor).dot(axisV);
				const seg0 = new THREE.Vector3().lerpVectors(p0, p1, t0);
				const seg1 = new THREE.Vector3().lerpVectors(p0, p1, t1);
				addEdgeLine(seg0, seg1, u, v);
			}
		}
	}

	for (const [opacity, bucket] of [...opacityBuckets.entries()].sort((a, b) => b[0] - a[0])) {
		const minor = createLineSegments(bucket.minor, CAD_BIM_GRID.minorColor, opacity, THREE, 50);
		const major = createLineSegments(bucket.major, CAD_BIM_GRID.majorColor, opacity, THREE, 51);
		const edge = createLineSegments(bucket.edge, CAD_BIM_GRID.edgeColor, opacity, THREE, 52);
		if (minor) group.add(minor);
		if (major) group.add(major);
		if (edge) group.add(edge);
	}

	return group;
};

export const ensureCadBimGrid = (viewer: Autodesk.Viewing.GuiViewer3D): void => {
	const THREE = getLmvThree();
	if (!THREE) return;

	try {
		const placement = getGridPlacement(viewer);
		if (!placement) return;

		const impl = viewer.impl;
		if (!impl.overlayScenes[VIEWER_ENVIRONMENT_OVERLAY_SCENE]) {
			impl.createOverlayScene(VIEWER_ENVIRONMENT_OVERLAY_SCENE);
		}
		impl.clearOverlay(VIEWER_ENVIRONMENT_OVERLAY_SCENE);
		impl.addOverlay(VIEWER_ENVIRONMENT_OVERLAY_SCENE, createCadBimGrid(placement, THREE));
		viewer.impl.invalidate(true, false, false);
	} catch (error) {
		console.error('ViewerEnvironment: floor grid failed', error);
	}
};

export const removeCadBimGrid = (viewer: Autodesk.Viewing.GuiViewer3D): void => {
	const impl = viewer.impl;
	if (!impl.overlayScenes[VIEWER_ENVIRONMENT_OVERLAY_SCENE]) return;
	impl.clearOverlay(VIEWER_ENVIRONMENT_OVERLAY_SCENE);
	impl.removeOverlayScene(VIEWER_ENVIRONMENT_OVERLAY_SCENE);
	viewer.impl.invalidate(true, false, false);
};
