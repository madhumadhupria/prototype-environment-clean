import { getLmvThree } from './lmvThree';

const isPrimaryStructural3DModel = (model: Autodesk.Viewing.Model): boolean => {
	if (!model.is3d()) return false;
	const data = model.getData() as { is2d?: boolean } | undefined;
	return !data?.is2d;
};

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

const extentAlongUp = (box: THREE.Box3, up: THREE.Vector3): number => {
	const corners = getBoxCorners(box);
	let wMin = Number.POSITIVE_INFINITY;
	let wMax = Number.NEGATIVE_INFINITY;
	for (const corner of corners) {
		const w = corner.dot(up);
		wMin = Math.min(wMin, w);
		wMax = Math.max(wMax, w);
	}
	return wMax - wMin;
};

const horizontalSpan = (box: THREE.Box3, axisU: THREE.Vector3, axisV: THREE.Vector3): number => {
	const corners = getBoxCorners(box);
	let uMin = Number.POSITIVE_INFINITY;
	let vMin = Number.POSITIVE_INFINITY;
	let uMax = Number.NEGATIVE_INFINITY;
	let vMax = Number.NEGATIVE_INFINITY;
	for (const corner of corners) {
		const u = corner.dot(axisU);
		const v = corner.dot(axisV);
		uMin = Math.min(uMin, u);
		vMin = Math.min(vMin, v);
		uMax = Math.max(uMax, u);
		vMax = Math.max(vMax, v);
	}
	return Math.max(uMax - uMin, vMax - vMin);
};

const isThinSiteSlab = (
	fragBox: THREE.Box3,
	up: THREE.Vector3,
	axisU: THREE.Vector3,
	axisV: THREE.Vector3,
	footprintSpan: number
): boolean => {
	const vertical = extentAlongUp(fragBox, up);
	const horizontal = horizontalSpan(fragBox, axisU, axisV);
	if (horizontal <= footprintSpan * 0.55) return false;
	return vertical <= Math.max(footprintSpan * 0.02, 0.05);
};

/**
 * Floor level for grid alignment — same as the building base used for model placement.
 * @deprecated Use getModelFloorWorldLevel — grid now shares the building-base plane.
 */
export const getGridFloorWorldLevel = (
	viewer: Autodesk.Viewing.GuiViewer3D,
	up: THREE.Vector3,
	aabbFloorW: number
): number => getModelFloorWorldLevel(viewer, up, aabbFloorW);

/**
 * World-space floor level (dot with model up) at the building base.
 * Ignores thin site/grade slabs below the main structure.
 */
export const getModelFloorWorldLevel = (
	viewer: Autodesk.Viewing.GuiViewer3D,
	up: THREE.Vector3,
	aabbFloorW: number
): number => {
	const THREE = getLmvThree();
	const model = getPrimaryStructuralModel(viewer);
	if (!THREE || !model) return aabbFloorW;

	const box = getModelWorldBounds(viewer);
	if (box.isEmpty()) return aabbFloorW;

	const { axisU, axisV } = getHorizontalAxes(up, THREE);
	const corners = getBoxCorners(box);
	let uMin = Number.POSITIVE_INFINITY;
	let vMin = Number.POSITIVE_INFINITY;
	let uMax = Number.NEGATIVE_INFINITY;
	let vMax = Number.NEGATIVE_INFINITY;
	for (const corner of corners) {
		const u = corner.dot(axisU);
		const v = corner.dot(axisV);
		uMin = Math.min(uMin, u);
		vMin = Math.min(vMin, v);
		uMax = Math.max(uMax, u);
		vMax = Math.max(vMax, v);
	}

	const footprintSpan = Math.max(uMax - uMin, vMax - vMin, 1);

	const fragList = model.getFragmentList();
	const fragCount = fragList.nextAvailableFragID ?? fragList.fragments?.length ?? 0;
	if (!fragCount) return aabbFloorW;

	const fragBox = new THREE.Box3();
	let floorW = Number.POSITIVE_INFINITY;
	let hasSample = false;

	for (let fragId = 0; fragId < fragCount; fragId++) {
		fragList.getWorldBounds(fragId, fragBox);
		if (fragBox.isEmpty()) continue;
		if (isThinSiteSlab(fragBox, up, axisU, axisV, footprintSpan)) continue;

		let fragWMin = Number.POSITIVE_INFINITY;
		for (const corner of getBoxCorners(fragBox)) {
			fragWMin = Math.min(fragWMin, corner.dot(up));
		}
		if (!Number.isFinite(fragWMin)) continue;

		floorW = Math.min(floorW, fragWMin);
		hasSample = true;
	}

	return hasSample ? floorW : aabbFloorW;
};

/**
 * Bounds for the main 3D building model only.
 * Excludes 2D sheets / hypermodel overlays so the floor grid aligns to the building base,
 * not a sheet plane sitting under the model.
 */
export const getPrimaryStructuralModel = (viewer: Autodesk.Viewing.GuiViewer3D): Autodesk.Viewing.Model | undefined => {
	const models3d = viewer.getAllModels().filter(isPrimaryStructural3DModel);
	if (viewer.model && isPrimaryStructural3DModel(viewer.model)) {
		return viewer.model;
	}
	return models3d[0];
};

/** World-space up for the primary model (Revit Z-up → horizontal grid on XY, not XZ). */
export const getModelWorldUp = (viewer: Autodesk.Viewing.GuiViewer3D): THREE.Vector3 => {
	const THREE = getLmvThree();
	if (!THREE) return new (window as unknown as { THREE: typeof THREE }).THREE.Vector3(0, 1, 0);

	const primary = getPrimaryStructuralModel(viewer);
	const aligned = (
		primary as (Autodesk.Viewing.Model & { _getAlignedUpVector?: () => THREE.Vector3 }) | undefined
	)?._getAlignedUpVector?.();
	if (aligned && aligned.lengthSq() > 1e-12) {
		return aligned.normalize();
	}

	const nav = viewer.navigation as { getWorldUpVector?: () => THREE.Vector3 };
	const navUp = nav.getWorldUpVector?.();
	if (navUp && navUp.lengthSq() > 1e-12) {
		return navUp.clone().normalize();
	}

	const cam = viewer.impl.camera as { worldup?: THREE.Vector3 };
	if (cam?.worldup && cam.worldup.lengthSq() > 1e-12) {
		return cam.worldup.clone().normalize();
	}

	return new THREE.Vector3(0, 1, 0);
};

export const getModelWorldBounds = (viewer: Autodesk.Viewing.GuiViewer3D): THREE.Box3 => {
	const THREE = getLmvThree();
	if (!THREE) return new (window as unknown as { THREE: typeof THREE }).THREE.Box3();
	const box = new THREE.Box3();

	const primary = getPrimaryStructuralModel(viewer);

	if (primary) {
		const primaryBox = primary.getBoundingBox(false, true);
		if (primaryBox && !primaryBox.isEmpty()) {
			box.copy(primaryBox);
			return box;
		}
	}

	const models3d = viewer.getAllModels().filter(isPrimaryStructural3DModel);
	for (const model of models3d) {
		const modelBox = model.getBoundingBox(false, true);
		if (!modelBox || modelBox.isEmpty()) continue;
		if (box.isEmpty()) {
			box.copy(modelBox);
		} else {
			box.union(modelBox);
		}
	}

	return box;
};
