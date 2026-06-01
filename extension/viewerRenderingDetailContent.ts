import { getPrimaryStructuralModel } from './viewerEnvironmentBounds';
import { isViewerModelReady } from './viewerEnvironmentLifecycle';
import type { RenderingDetailLevel } from './viewerRenderingDetails';

/** Node names that indicate furnishings / interior props (Revit + generic). */
const INTERIOR_NAME_PATTERN =
	/\b(furniture|furnishing|casework|cabinet|cabinetry|millwork|chair|chairs|table|tables|sofa|sectional|bed|desk|shelv|bookcase|dresser|nightstand|stool|bench|ottoman|armchair|recliner|credenza|vanity|mirror|lamp|rug|carpet|appliance|refrigerator|stove|oven|dishwasher|washer|dryer|fixture|fittings|sanitary|toilet|sink|tub|shower|urinal|bidet|interior|decor|accessory|accessories|equipment|furnish|wardrobe|closet\s*system|handrail|guardrail)\b/i;

/** Category strings from Revit property db (when available). */
const INTERIOR_CATEGORY_PATTERN =
	/\b(Revit\s+)?(Furniture|Furniture Systems|Casework|Plumbing Fixtures|Lighting Fixtures|Electrical Fixtures|Specialty Equipment|Food Service Equipment|Medical Equipment)\b/i;

/** Small generic props treated as interior clutter at low fidelity. */
const GENERIC_MODEL_PATTERN = /\b(generic\s+model|generic\s+models)\b/i;

const SMALL_GENERIC_VOLUME_RATIO = 0.008;

interface LowDetailVisibilityState {
	hiddenDbIds: number[];
}

const visibilityByViewer = new WeakMap<Autodesk.Viewing.GuiViewer3D, LowDetailVisibilityState>();

export const isInteriorDetailName = (name: string): boolean =>
	INTERIOR_NAME_PATTERN.test(name) ||
	INTERIOR_CATEGORY_PATTERN.test(name) ||
	GENERIC_MODEL_PATTERN.test(name);

export const isSmallInteriorGeneric = (name: string, volume: number, maxVolume: number): boolean => {
	if (!GENERIC_MODEL_PATTERN.test(name)) return false;
	if (maxVolume <= 0 || volume <= 0) return false;
	return volume / maxVolume < SMALL_GENERIC_VOLUME_RATIO;
};

export const shouldExcludeFromLowDetail = (
	name: string,
	volume: number,
	maxVolume: number
): boolean => isInteriorDetailName(name) || isSmallInteriorGeneric(name, volume, maxVolume);

/** Leaf dbIds to hide and skip theming when rendering detail is low. */
export const collectLowDetailExcludedDbIds = (viewer: Autodesk.Viewing.GuiViewer3D): number[] => {
	if (!isViewerModelReady(viewer)) return [];

	const model = getPrimaryStructuralModel(viewer) ?? viewer.model;
	if (!model) return [];

	const tree = model.getInstanceTree();
	if (!tree) return [];

	const leaves: { dbId: number; name: string; volume: number }[] = [];
	const fragList = model.getFragmentList();
	const THREE = window.THREE;
	if (!THREE) return [];

	const rootId = tree.getRootId();
	tree.enumNodeChildren(
		rootId,
		(dbId: number) => {
			if (tree.getChildCount(dbId) > 0) return;
			const fragBox = new THREE.Box3();
			const unionBox = new THREE.Box3();
			tree.enumNodeFragments(
				dbId,
				(fragId: number) => {
					fragList.getWorldBounds(fragId, fragBox);
					if (fragBox.isEmpty()) return;
					if (unionBox.isEmpty()) unionBox.copy(fragBox);
					else unionBox.union(fragBox);
				},
				true
			);
			const size = unionBox.getSize(new THREE.Vector3());
			const volume = Math.max(size.x * size.y * size.z, 0);
			leaves.push({ dbId, name: tree.getNodeName(dbId) ?? '', volume });
		},
		true
	);

	if (leaves.length === 0) return [];

	const maxVolume = Math.max(...leaves.map(l => l.volume), 1e-9);
	return leaves.filter(l => shouldExcludeFromLowDetail(l.name, l.volume, maxVolume)).map(l => l.dbId);
};

const setLowDetailVisibility = (
	viewer: Autodesk.Viewing.GuiViewer3D,
	model: Autodesk.Viewing.Model,
	dbIds: number[],
	hidden: boolean
): void => {
	if (dbIds.length === 0) return;
	if (hidden) {
		viewer.hide(dbIds, model);
	} else {
		viewer.show(dbIds, model);
	}
	viewer.impl?.invalidate(true, false, false);
};

/** Hide or restore furnishings / interior elements for low vs high rendering detail. */
export const applyLowDetailContentVisibility = (
	viewer: Autodesk.Viewing.GuiViewer3D,
	level: RenderingDetailLevel
): void => {
	const model = getPrimaryStructuralModel(viewer) ?? viewer.model;
	if (!model || model.is2d()) return;

	const existing = visibilityByViewer.get(viewer);

	if (level === 'high') {
		if (existing && existing.hiddenDbIds.length > 0) {
			setLowDetailVisibility(viewer, model, existing.hiddenDbIds, false);
		}
		visibilityByViewer.delete(viewer);
		return;
	}

	const toHide = collectLowDetailExcludedDbIds(viewer);
	if (existing && existing.hiddenDbIds.length > 0) {
		setLowDetailVisibility(viewer, model, existing.hiddenDbIds, false);
	}
	setLowDetailVisibility(viewer, model, toHide, true);
	visibilityByViewer.set(viewer, { hiddenDbIds: toHide });
};

export const clearLowDetailContentVisibility = (viewer: Autodesk.Viewing.GuiViewer3D): void => {
	applyLowDetailContentVisibility(viewer, 'high');
};
