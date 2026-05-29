import { getLmvThree } from './lmvThree';
import { getPrimaryStructuralModel } from './viewerEnvironmentBounds';
import { SECTION_BOX_ENVELOPE } from './viewerEnvironmentSpec';

const SYNTHETIC_ROOT = 1;

const boxesIntersect = (a: THREE.Box3, bMin: THREE.Vector3, bMax: THREE.Vector3): boolean =>
	!(
		a.max.x < bMin.x ||
		a.min.x > bMax.x ||
		a.max.y < bMin.y ||
		a.min.y > bMax.y ||
		a.max.z < bMin.z ||
		a.min.z > bMax.z
	);

/** Leaf dbIds with any fragment bounds intersecting the section box. */
export const getDbIdsInsideSectionBox = (
	model: Autodesk.Viewing.Model,
	min: THREE.Vector3,
	max: THREE.Vector3
): number[] => {
	const tree = model.getInstanceTree();
	const THREE = getLmvThree();
	if (!tree || !THREE) return [];

	const fragList = model.getFragmentList();
	const fragBox = new THREE.Box3();
	const inside: number[] = [];

	tree.enumNodeChildren(
		tree.getRootId(),
		(dbId: number) => {
			if (tree.getChildCount(dbId) > 0) return;

			let intersects = false;
			tree.enumNodeFragments(
				dbId,
				(fragId: number) => {
					if (intersects) return;
					fragList.getWorldBounds(fragId, fragBox);
					if (!fragBox.isEmpty() && boxesIntersect(fragBox, min, max)) {
						intersects = true;
					}
				},
				true
			);

			if (intersects) inside.push(dbId);
		},
		true
	);

	return inside;
};

export interface SectionVisibilityState {
	ghostingEnabled: boolean | undefined;
	hadIsolation: boolean;
}

export const applySectionBoxVisibility = (
	viewer: Autodesk.Viewing.GuiViewer3D,
	min: THREE.Vector3,
	max: THREE.Vector3
): void => {
	const model = getPrimaryStructuralModel(viewer) ?? viewer.model;
	if (!model) return;

	const insideIds = getDbIdsInsideSectionBox(model, min, max);
	if (insideIds.length === 0) {
		viewer.isolate([SYNTHETIC_ROOT], model);
		return;
	}
	viewer.isolate(insideIds, model);
	viewer.impl.invalidate(false, false, true);
};

export const enableSectionBoxVisibilityMode = (viewer: Autodesk.Viewing.GuiViewer3D): SectionVisibilityState => {
	const prefs = viewer.prefs as { get?: (key: string) => boolean; set?: (key: string, value: boolean) => void };
	const ghostingEnabled = prefs.get?.('ghosting');

	if (!ghostingEnabled) {
		viewer.setGhosting(true);
	}

	return { ghostingEnabled, hadIsolation: false };
};

export const restoreSectionBoxVisibilityMode = (
	viewer: Autodesk.Viewing.GuiViewer3D,
	state: SectionVisibilityState | undefined
): void => {
	viewer.showAll();
	if (state && state.ghostingEnabled === false) {
		viewer.setGhosting(false);
	} else if (state?.ghostingEnabled === true) {
		viewer.setGhosting(true);
	}
	viewer.impl.invalidate(true, false, true);
};

/** Model bounds inflated by a small padding — the maximum section box size. */
export const getSectionBoxEnvelopeBounds = (
	fullBox: THREE.Box3,
	paddingRatio = SECTION_BOX_ENVELOPE.paddingRatio,
	paddingMin = SECTION_BOX_ENVELOPE.paddingMin
): THREE.Box3 => {
	const THREE = getLmvThree();
	if (!THREE || fullBox.isEmpty()) return fullBox.clone();

	const size = new THREE.Vector3().subVectors(fullBox.max, fullBox.min);
	const pad = Math.max(paddingMin, Math.max(size.x, size.y, size.z) * paddingRatio);
	const padding = new THREE.Vector3(pad, pad, pad);

	return new THREE.Box3(fullBox.min.clone().sub(padding), fullBox.max.clone().add(padding));
};

/** @deprecated Use getSectionBoxEnvelopeBounds. */
export const getSectionBoxStartBounds = (envelopeBox: THREE.Box3): THREE.Box3 => envelopeBox.clone();

/** @deprecated Use getSectionBoxEnvelopeBounds. */
export const getSectionBoxInitialBounds = (
	_viewer: Autodesk.Viewing.GuiViewer3D,
	fullBox: THREE.Box3,
	_heightFraction = 0.55
): THREE.Box3 => getSectionBoxEnvelopeBounds(fullBox);
