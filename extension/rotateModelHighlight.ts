import { getLmvThree } from './lmvThree';
import { getPrimaryStructuralModel } from './viewerEnvironmentBounds';
import { ROTATE_GIZMO_STYLE, ROTATE_HIGHLIGHT_OVERLAY_SCENE } from './viewerEnvironmentSpec';

interface IdBufferSelectionState {
	hadIdBufferSelection: boolean;
}

interface HighlightState {
	savedSelection: ReadonlyArray<{ model: Autodesk.Viewing.Model; selection: number[] }>;
	overlayMesh?: THREE.Mesh;
	idBufferState?: IdBufferSelectionState;
}

const highlightState = new WeakMap<Autodesk.Viewing.GuiViewer3D, HighlightState>();

type RenderContextInternals = {
	_blendPass?: {
		material?: {
			defines?: Record<string, string>;
			needsUpdate?: boolean;
		};
	};
	settings?: { sao?: boolean; antialias?: boolean };
	initPostPipeline?: (useSAO: boolean, useFXAA: boolean) => void;
	setDbIdForEdgeDetection?: (objId: number, modelId: number) => void;
};

const setIdBufferSelectionEnabled = (
	viewer: Autodesk.Viewing.GuiViewer3D,
	enabled: boolean
): void => {
	const renderer = viewer.impl.renderer() as RenderContextInternals;
	const blendPass = renderer._blendPass;
	if (!blendPass?.material?.defines || typeof renderer.initPostPipeline !== 'function') return;

	if (enabled) {
		blendPass.material.defines.USE_IDBUFFER_SELECTION = '1';
	} else {
		delete blendPass.material.defines.USE_IDBUFFER_SELECTION;
	}
	blendPass.material.needsUpdate = true;
	renderer.initPostPipeline(Boolean(renderer.settings?.sao), Boolean(renderer.settings?.antialias));
};

const disableIdBufferSelectionForOutline = (
	viewer: Autodesk.Viewing.GuiViewer3D
): IdBufferSelectionState | undefined => {
	const renderer = viewer.impl.renderer() as RenderContextInternals;
	const defines = renderer._blendPass?.material?.defines;
	if (!defines) return undefined;

	const hadIdBufferSelection = Object.prototype.hasOwnProperty.call(defines, 'USE_IDBUFFER_SELECTION');
	if (hadIdBufferSelection) {
		setIdBufferSelectionEnabled(viewer, false);
	}
	return { hadIdBufferSelection };
};

const restoreIdBufferSelection = (
	viewer: Autodesk.Viewing.GuiViewer3D,
	state: IdBufferSelectionState | undefined
): void => {
	if (!state?.hadIdBufferSelection) return;
	setIdBufferSelectionEnabled(viewer, true);
};

/** Prefer the single structural child under the model root (whole building). */
const resolveBuildingHighlightRootDbId = (tree: Autodesk.Viewing.InstanceTree): number => {
	const rootId = tree.getRootId();
	const children: number[] = [];
	tree.enumNodeChildren(rootId, (dbId: number) => children.push(dbId), false);

	if (children.length === 1) return children[0];

	let bestId = rootId;
	let bestLeafCount = 0;
	for (const childId of children) {
		let leafCount = 0;
		tree.enumNodeChildren(
			childId,
			(dbId: number) => {
				if (tree.getChildCount(dbId) === 0) leafCount += 1;
			},
			true
		);
		if (leafCount > bestLeafCount) {
			bestLeafCount = leafCount;
			bestId = childId;
		}
	}
	return bestId;
};

const collectFragmentIdsUnderNode = (
	tree: Autodesk.Viewing.InstanceTree,
	rootDbId: number
): number[] => {
	const fragIds = new Set<number>();
	tree.enumNodeChildren(
		rootDbId,
		(dbId: number) => {
			tree.enumNodeFragments(
				dbId,
				(fragId: number) => {
					fragIds.add(fragId);
				},
				false
			);
		},
		true
	);
	return Array.from(fragIds);
};

const setGeometryAttribute = (
	geometry: THREE.BufferGeometry,
	name: string,
	attribute: THREE.BufferAttribute
): void => {
	const g = geometry as THREE.BufferGeometry & {
		setAttribute?: (key: string, attr: THREE.BufferAttribute) => void;
		addAttribute?: (key: string, attr: THREE.BufferAttribute) => void;
	};
	if (typeof g.setAttribute === 'function') {
		g.setAttribute(name, attribute);
		return;
	}
	if (typeof g.addAttribute === 'function') {
		g.addAttribute(name, attribute);
	}
};

const getIndexAt = (attribute: THREE.BufferAttribute, index: number): number => {
	const attr = attribute as THREE.BufferAttribute & { getX?: (i: number) => number };
	if (typeof attr.getX === 'function') return attr.getX(index);
	return attribute.array[index];
};

const buildMergedFragmentGeometry = (
	viewer: Autodesk.Viewing.GuiViewer3D,
	model: Autodesk.Viewing.Model,
	fragIds: number[],
	THREE: typeof window.THREE
): THREE.BufferGeometry | null => {
	viewer.impl.scene.updateMatrixWorld(true);

	const positions: number[] = [];
	const indices: number[] = [];
	const tempMatrix = new THREE.Matrix4();
	const tempVec = new THREE.Vector3();
	let vertexOffset = 0;

	for (const fragId of fragIds) {
		const mesh = viewer.impl.getRenderProxy(model, fragId) as THREE.Mesh | null;
		if (!mesh?.geometry) continue;

		const geometry = mesh.geometry as THREE.BufferGeometry;
		const positionAttr = geometry.attributes?.position as THREE.BufferAttribute | undefined;
		if (!positionAttr?.count) continue;

		tempMatrix.copy(mesh.matrixWorld);
		const base = vertexOffset;
		for (let i = 0; i < positionAttr.count; i += 1) {
			tempVec.fromBufferAttribute(positionAttr, i).applyMatrix4(tempMatrix);
			positions.push(tempVec.x, tempVec.y, tempVec.z);
		}

		const indexAttr = geometry.index as THREE.BufferAttribute | null | undefined;
		if (indexAttr?.count) {
			for (let i = 0; i < indexAttr.count; i += 1) {
				indices.push(getIndexAt(indexAttr, i) + base);
			}
		} else if (positionAttr.count >= 3) {
			for (let i = 0; i + 2 < positionAttr.count; i += 3) {
				indices.push(base + i, base + i + 1, base + i + 2);
			}
		}

		vertexOffset += positionAttr.count;
	}

	if (positions.length === 0 || indices.length === 0) return null;

	const merged = new THREE.BufferGeometry();
	setGeometryAttribute(merged, 'position', new THREE.BufferAttribute(new Float32Array(positions), 3));

	const IndexArray = indices.some(index => index > 65535) ? Uint32Array : Uint16Array;
	const indexAttr = new THREE.BufferAttribute(new IndexArray(indices), 1);
	const mergedWithIndex = merged as THREE.BufferGeometry & {
		setIndex?: (attr: THREE.BufferAttribute) => void;
	};
	if (typeof mergedWithIndex.setIndex === 'function') {
		mergedWithIndex.setIndex(indexAttr);
	} else {
		setGeometryAttribute(merged, 'index', indexAttr);
	}

	return merged;
};

/** Orange exterior outline on the building shell (not per-leaf interior fill). */
export const applyRotateModelHighlight = (viewer: Autodesk.Viewing.GuiViewer3D): void => {
	const THREE = getLmvThree();
	const model = getPrimaryStructuralModel(viewer);
	const tree = model?.getInstanceTree();
	if (!THREE || !model || !tree) return;

	const rootDbId = resolveBuildingHighlightRootDbId(tree);
	const fragIds = collectFragmentIdsUnderNode(tree, rootDbId);
	if (fragIds.length === 0) return;

	const mergedGeometry = buildMergedFragmentGeometry(viewer, model, fragIds, THREE);
	if (!mergedGeometry) return;

	const existing = highlightState.get(viewer);
	if (existing?.overlayMesh) {
		viewer.impl.removeOverlay('selection', existing.overlayMesh);
		existing.overlayMesh.geometry.dispose();
		restoreIdBufferSelection(viewer, existing.idBufferState);
	} else {
		highlightState.set(viewer, {
			savedSelection: viewer.getAggregateSelection(),
		});
	}

	viewer.clearSelection();
	viewer.setSelectionColor(
		new THREE.Color(ROTATE_GIZMO_STYLE.outlineColor),
		Autodesk.Viewing.SelectionType.OVERLAYED
	);

	const idBufferState = disableIdBufferSelectionForOutline(viewer);
	const overlayMesh = new THREE.Mesh(mergedGeometry, viewer.impl.selectionMaterialBase);
	overlayMesh.matrixAutoUpdate = false;
	overlayMesh.matrix.identity();
	overlayMesh.frustumCulled = false;
	(overlayMesh as THREE.Mesh & { _lmv_highlightCount?: number })._lmv_highlightCount = 1;

	viewer.impl.addOverlay('selection', overlayMesh);

	const state = highlightState.get(viewer);
	if (state) {
		state.overlayMesh = overlayMesh;
		state.idBufferState = idBufferState;
	}

	const renderer = viewer.impl.renderer() as RenderContextInternals;
	renderer.setDbIdForEdgeDetection?.(0, 0);
	viewer.impl.invalidate(false, false, true);
};

export const clearRotateModelHighlight = (viewer: Autodesk.Viewing.GuiViewer3D): void => {
	const state = highlightState.get(viewer);
	if (!state) return;

	if (state.overlayMesh) {
		viewer.impl.removeOverlay(ROTATE_HIGHLIGHT_OVERLAY_SCENE, state.overlayMesh);
		state.overlayMesh.geometry.dispose();
	}
	if (viewer.impl.overlayScenes[ROTATE_HIGHLIGHT_OVERLAY_SCENE]) {
		viewer.impl.removeOverlayScene(ROTATE_HIGHLIGHT_OVERLAY_SCENE);
	}

	restoreIdBufferSelection(viewer, state.idBufferState);

	const renderer = viewer.impl.renderer() as RenderContextInternals;
	renderer.setDbIdForEdgeDetection?.(0, 0);

	viewer.clearSelection();
	if (state.savedSelection.length) {
		for (const item of state.savedSelection) {
			viewer.select(item.selection, item.model);
		}
	}

	highlightState.delete(viewer);
	viewer.impl.invalidate(true, false, true);
};
