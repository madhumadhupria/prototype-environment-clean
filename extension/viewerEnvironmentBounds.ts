import { getLmvThree } from './lmvThree';

const isPrimaryStructural3DModel = (model: Autodesk.Viewing.Model): boolean => {
	if (!model.is3d()) return false;
	const data = model.getData() as { is2d?: boolean } | undefined;
	return !data?.is2d;
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
