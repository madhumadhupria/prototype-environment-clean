import { getLmvThree } from './lmvThree';
import { getPrimaryStructuralModel } from './viewerEnvironmentBounds';
import {
	BuildingColorSchemeId,
	BuildingMaterialRole,
	BuildingPaletteColors,
	getBuildingColorScheme,
} from './viewerBuildingPalettes';
import { isViewerModelReady } from './viewerEnvironmentLifecycle';

const WINDOW_NAME_PATTERN = /glass|glaz|window|fenestr|pane|curtain\s*wall/i;

const hexToVector4 = (hex: string, THREE: typeof window.THREE): THREE.Vector4 => {
	const normalized = hex.replace('#', '');
	const r = parseInt(normalized.slice(0, 2), 16) / 255;
	const g = parseInt(normalized.slice(2, 4), 16) / 255;
	const b = parseInt(normalized.slice(4, 6), 16) / 255;
	return new THREE.Vector4(r, g, b, 1);
};

const getDbIdBounds = (
	model: Autodesk.Viewing.Model,
	tree: Autodesk.Viewing.InstanceTree,
	dbId: number,
	THREE: typeof window.THREE
): THREE.Box3 => {
	const fragList = model.getFragmentList();
	const unionBox = new THREE.Box3();
	const fragBox = new THREE.Box3();

	tree.enumNodeFragments(
		dbId,
		(fragId: number) => {
			fragList.getWorldBounds(fragId, fragBox);
			if (fragBox.isEmpty()) return;
			if (unionBox.isEmpty()) {
				unionBox.copy(fragBox);
			} else {
				unionBox.union(fragBox);
			}
		},
		true
	);

	return unionBox;
};

const getDbIdVolume = (
	model: Autodesk.Viewing.Model,
	tree: Autodesk.Viewing.InstanceTree,
	dbId: number,
	THREE: typeof window.THREE
): number => {
	const box = getDbIdBounds(model, tree, dbId, THREE);
	if (box.isEmpty()) return 0;
	const size = box.getSize(new THREE.Vector3());
	return Math.max(size.x * size.y * size.z, 0);
};

const isWindowLike = (
	name: string,
	volume: number,
	maxModelVolume: number,
	model: Autodesk.Viewing.Model,
	tree: Autodesk.Viewing.InstanceTree,
	dbId: number,
	THREE: typeof window.THREE
): boolean => {
	if (WINDOW_NAME_PATTERN.test(name)) return true;
	if (volume <= 0 || maxModelVolume <= 0) return false;

	const box = getDbIdBounds(model, tree, dbId, THREE);
	if (box.isEmpty()) return false;

	const size = box.getSize(new THREE.Vector3());
	const dims = [size.x, size.y, size.z].sort((a, b) => a - b);
	const minDim = dims[0];
	const maxDim = dims[2];
	if (maxDim <= 0) return false;

	const aspect = minDim / maxDim;
	const relativeSize = volume / maxModelVolume;
	return aspect < 0.06 && relativeSize < 0.02;
};

const roleForVolumeRank = (rank: number, count: number): BuildingMaterialRole => {
	if (count <= 1) return 'wall';
	const t = rank / (count - 1);
	if (t <= 0.42) return 'wall';
	if (t <= 0.6) return 'roof';
	if (t <= 0.75) return 'trim';
	if (t <= 0.88) return 'accent';
	return 'door';
};

const applyColorToDbId = (
	viewer: Autodesk.Viewing.GuiViewer3D,
	model: Autodesk.Viewing.Model,
	dbId: number,
	color: THREE.Vector4,
	tree: Autodesk.Viewing.InstanceTree | null
): void => {
	if (!tree) {
		viewer.setThemingColor(dbId, color);
		return;
	}
	tree.enumNodeChildren(
		dbId,
		(childDbId: number) => {
			viewer.setThemingColor(childDbId, color);
		},
		true
	);
};

export const clearBuildingColorScheme = (viewer: Autodesk.Viewing.GuiViewer3D): void => {
	const model = getPrimaryStructuralModel(viewer) ?? viewer.model;
	if (!model) return;
	viewer.clearThemingColors(model);
	viewer.impl.invalidate(true, false, false);
};

export interface BuildingColorSchemeApplyOptions {
	/** Leaf dbIds to skip (e.g. furnishings hidden at low rendering detail). */
	excludeDbIds?: ReadonlySet<number>;
}

export const applyBuildingColorScheme = (
	viewer: Autodesk.Viewing.GuiViewer3D,
	schemeId: BuildingColorSchemeId,
	options?: BuildingColorSchemeApplyOptions
): boolean => {
	if (schemeId === 'none') {
		clearBuildingColorScheme(viewer);
		return true;
	}

	if (!isViewerModelReady(viewer)) {
		console.warn('ViewerEnvironment: model not ready for color scheme');
		return false;
	}

	const scheme = getBuildingColorScheme(schemeId);
	if (!scheme) return false;

	const THREE = getLmvThree();
	if (!THREE) return false;

	const model = getPrimaryStructuralModel(viewer) ?? viewer.model;
	if (!model) return false;

	const tree = model.getInstanceTree();
	if (!tree) return false;

	const palette = scheme.colors;
	const roleColors: Record<BuildingMaterialRole, THREE.Vector4> = {
		wall: hexToVector4(palette.wall, THREE),
		roof: hexToVector4(palette.roof, THREE),
		door: hexToVector4(palette.door, THREE),
		window: hexToVector4(palette.window, THREE),
		trim: hexToVector4(palette.trim, THREE),
		accent: hexToVector4(palette.accent, THREE),
	};

	const leaves: { dbId: number; name: string; volume: number }[] = [];
	const rootId = tree.getRootId();

	tree.enumNodeChildren(
		rootId,
		(dbId: number) => {
			if (tree.getChildCount(dbId) > 0) return;
			if (options?.excludeDbIds?.has(dbId)) return;
			leaves.push({
				dbId,
				name: tree.getNodeName(dbId) ?? '',
				volume: getDbIdVolume(model, tree, dbId, THREE),
			});
		},
		true
	);

	if (leaves.length === 0) return false;

	const maxVolume = Math.max(...leaves.map(l => l.volume), 1e-9);
	const solids = leaves.filter(l => !isWindowLike(l.name, l.volume, maxVolume, model, tree, l.dbId, THREE));
	const sortedSolids = [...solids].sort((a, b) => b.volume - a.volume);

	const roleByDbId = new Map<number, BuildingMaterialRole>();
	for (const leaf of leaves) {
		if (isWindowLike(leaf.name, leaf.volume, maxVolume, model, tree, leaf.dbId, THREE)) {
			roleByDbId.set(leaf.dbId, 'window');
		}
	}
	sortedSolids.forEach((leaf, index) => {
		roleByDbId.set(leaf.dbId, roleForVolumeRank(index, sortedSolids.length));
	});

	viewer.clearThemingColors(model);
	for (const leaf of leaves) {
		const role = roleByDbId.get(leaf.dbId) ?? 'wall';
		applyColorToDbId(viewer, model, leaf.dbId, roleColors[role], tree);
	}

	viewer.impl.invalidate(true, false, false);
	return true;
};

/** Swatch order for flyout preview (light → dark). */
export const paletteSwatchColors = (colors: BuildingPaletteColors): string[] => [
	colors.wall,
	colors.window,
	colors.trim,
	colors.roof,
	colors.accent,
	colors.door,
];
