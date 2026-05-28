import { getLmvThree } from './lmvThree';
import {
	BUILDING_COLOR_PALETTES,
	BuildingColorPaletteId,
	BuildingColorRole,
	getBuildingColorPalette,
} from './buildingColorPalettes';
import { isViewerModelReady } from './viewerEnvironmentLifecycle';

const WINDOW_NAME_PATTERN = /\b(window|glaz|glass|fenestr|curtain\s*wall|skylight)\b/i;

/** Volume share thresholds (largest → smallest): wall, roof, trim, accent, door. */
const ROLE_THRESHOLDS: { role: BuildingColorRole; cumulative: number }[] = [
	{ role: 'wall', cumulative: 0.42 },
	{ role: 'roof', cumulative: 0.62 },
	{ role: 'trim', cumulative: 0.77 },
	{ role: 'accent', cumulative: 0.9 },
	{ role: 'door', cumulative: 1 },
];

const hexToVector4 = (hex: string): THREE.Vector4 => {
	const normalized = hex.replace('#', '');
	const r = parseInt(normalized.slice(0, 2), 16) / 255;
	const g = parseInt(normalized.slice(2, 4), 16) / 255;
	const b = parseInt(normalized.slice(4, 6), 16) / 255;
	return new THREE.Vector4(r, g, b, 1);
};

const getBoxDimensions = (box: THREE.Box3): [number, number, number] => {
	const size = box.getSize(new THREE.Vector3());
	return [size.x, size.y, size.z];
};

const isWindowLike = (nodeName: string, dimensions: [number, number, number]): boolean => {
	if (WINDOW_NAME_PATTERN.test(nodeName)) return true;
	const sorted = [...dimensions].sort((a, b) => a - b);
	const max = sorted[2];
	if (max <= 0) return false;
	return sorted[0] / max < 0.06 && sorted[1] / max < 0.35;
};

const roleForVolumeRank = (rank: number, total: number): BuildingColorRole => {
	if (total <= 1) return 'wall';
	const t = rank / (total - 1);
	for (const threshold of ROLE_THRESHOLDS) {
		if (t <= threshold.cumulative) return threshold.role;
	}
	return 'door';
};

const getDbIdWorldBounds = (
	model: Autodesk.Viewing.Model,
	instanceTree: InstanceTree,
	fragList: FragmentList,
	dbId: number,
	THREE: typeof window.THREE
): THREE.Box3 | null => {
	const box = new THREE.Box3();
	const fragBox = new THREE.Box3();
	let hasBounds = false;

	instanceTree.enumNodeFragments(
		dbId,
		(fragId: number) => {
			fragList.getWorldBounds(fragId, fragBox);
			if (fragBox.isEmpty()) return;
			if (!hasBounds) {
				box.copy(fragBox);
				hasBounds = true;
			} else {
				box.union(fragBox);
			}
		},
		true
	);

	return hasBounds ? box : null;
};

type InstanceTree = {
	getRootId: () => number;
	getChildCount: (dbId: number) => number;
	getNodeName: (dbId: number) => string;
	enumNodeChildren: (dbId: number, callback: (childId: number) => void, recursive?: boolean) => void;
	enumNodeFragments: (dbId: number, callback: (fragId: number) => void, recursive?: boolean) => void;
};

type FragmentList = {
	getWorldBounds: (fragId: number, box: THREE.Box3) => void;
};

const collectLeafDbIds = (instanceTree: InstanceTree): number[] => {
	const leaves: number[] = [];
	instanceTree.enumNodeChildren(
		instanceTree.getRootId(),
		(childId: number) => {
			if (instanceTree.getChildCount(childId) === 0) {
				leaves.push(childId);
			}
		},
		true
	);
	return leaves;
};

const classifyLeaves = (
	model: Autodesk.Viewing.Model,
	instanceTree: InstanceTree,
	THREE: typeof window.THREE
): Map<number, BuildingColorRole> => {
	const fragList = model.getFragmentList() as FragmentList | null;
	if (!fragList?.getWorldBounds) return new Map();

	const leaves = collectLeafDbIds(instanceTree);
	const sized: { dbId: number; volume: number; isWindow: boolean }[] = [];

	for (const dbId of leaves) {
		const bounds = getDbIdWorldBounds(model, instanceTree, fragList, dbId, THREE);
		if (!bounds) continue;
		const dims = getBoxDimensions(bounds);
		const volume = dims[0] * dims[1] * dims[2];
		if (!Number.isFinite(volume) || volume <= 0) continue;
		const name = instanceTree.getNodeName(dbId) ?? '';
		sized.push({ dbId, volume, isWindow: isWindowLike(name, dims) });
	}

	if (sized.length === 0) return new Map();

	const nonWindow = sized.filter(entry => !entry.isWindow).sort((a, b) => b.volume - a.volume);
	const roleByDbId = new Map<number, BuildingColorRole>();

	for (const entry of sized) {
		if (entry.isWindow) {
			roleByDbId.set(entry.dbId, 'window');
		}
	}

	nonWindow.forEach((entry, index) => {
		roleByDbId.set(entry.dbId, roleForVolumeRank(index, nonWindow.length));
	});

	return roleByDbId;
};

export const clearBuildingColorScheme = (viewer: Autodesk.Viewing.GuiViewer3D): void => {
	if (!viewer.model) return;
	try {
		viewer.clearThemingColors(viewer.model);
		viewer.impl.invalidate(true, true, true);
	} catch (error) {
		console.warn('ViewerEnvironment: clear building colors failed', error);
	}
};

export const applyBuildingColorScheme = (
	viewer: Autodesk.Viewing.GuiViewer3D,
	paletteId: BuildingColorPaletteId
): void => {
	if (!isViewerModelReady(viewer) || !viewer.model) return;

	const THREE = getLmvThree();
	if (!THREE) return;

	const palette = getBuildingColorPalette(paletteId);
	if (!palette) return;

	const instanceTree = viewer.model.getInstanceTree() as InstanceTree | null;
	if (!instanceTree) return;

	try {
		const roleByDbId = classifyLeaves(viewer.model, instanceTree, THREE);
		if (roleByDbId.size === 0) return;

		const colorVectors = Object.fromEntries(
			(Object.keys(palette.colors) as BuildingColorRole[]).map(role => [role, hexToVector4(palette.colors[role])])
		) as Record<BuildingColorRole, THREE.Vector4>;

		viewer.clearThemingColors(viewer.model);

		for (const [dbId, role] of roleByDbId) {
			const color = colorVectors[role];
			if (!color) continue;
			viewer.setThemingColor(dbId, color);
		}

		viewer.impl.invalidate(true, true, true);
	} catch (error) {
		console.error('ViewerEnvironment: building color scheme failed', error);
	}
};

export const getBuildingColorPaletteOptions = (): typeof BUILDING_COLOR_PALETTES => BUILDING_COLOR_PALETTES;
