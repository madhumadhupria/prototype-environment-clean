import { clearBuildingColorScheme } from './viewerBuildingColorScheme';
import { applyCadBimGroundAndEnvFlags, getLmvImplWithLights } from './lmvImplInternals';
import { ensureCadBimGrid, ensureUnityGrid } from './viewerEnvironmentGrid';
import { isViewerModelReady } from './viewerEnvironmentLifecycle';
import {
	ACC_DEFAULT,
	CAD_BIM_BACKGROUND,
	CAD_BIM_LIGHTING,
	UNITY_BACKGROUND,
} from './viewerEnvironmentSpec';
import { setViewerEnvironmentDomState } from './viewerEnvironmentDom';
import { DEFAULT_VIEWER_ENVIRONMENT_ID, ViewerEnvironmentId } from './viewerEnvironments';

export interface ViewerEnvironmentApplyOptions {
	/** When true, adds sheet-alignment chrome modifiers (2D/3D workflow). */
	sheetAlignmentActive?: boolean;
}

/** Delays to re-apply backdrop after AEC Boardwalk preset (post-load only). */
const CAD_BIM_REAPPLY_DELAYS_MS = [500, 2000] as const;

let cadBimReapplyGeneration = 0;
let unityGridReapplyGeneration = 0;

const cancelScheduledCadBimReapply = (): void => {
	cadBimReapplyGeneration += 1;
};

const cancelScheduledUnityGridReapply = (): void => {
	unityGridReapplyGeneration += 1;
};

/** Delays to re-apply Unity grid after model geometry settles. */
const UNITY_GRID_REAPPLY_DELAYS_MS = [500, 2000] as const;

const applyCadBimBackground = (viewer: Autodesk.Viewing.GuiViewer3D): void => {
	try {
		const { r, g, b } = CAD_BIM_BACKGROUND;
		const impl = viewer.impl as {
			setClearColors?: (r1: number, g1: number, b1: number, r2: number, g2: number, b2: number) => void;
		};
		impl.setClearColors?.(r, g, b, r, g, b);
		viewer.setBackgroundColor(r, g, b, r, g, b);
	} catch (error) {
		console.warn('ViewerEnvironment: background apply failed', error);
	}
};

const applyCadBimAmbient = (viewer: Autodesk.Viewing.GuiViewer3D): void => {
	const impl = getLmvImplWithLights(viewer);
	if (!impl.amb_light) return;
	const intensity = CAD_BIM_LIGHTING.ambient.intensity;
	if ('intensity' in impl.amb_light) {
		impl.amb_light.color.setRGB(1, 1, 1);
		(impl.amb_light as THREE.AmbientLight).intensity = intensity;
	} else {
		impl.amb_light.color.setRGB(intensity, intensity, intensity);
	}
};

/** Post-load only — Boardwalk/AEC must own env-map + ground prefs during progressive load. */
const applyCadBimLighting = (viewer: Autodesk.Viewing.GuiViewer3D): void => {
	applyCadBimGroundAndEnvFlags(viewer);
	applyCadBimAmbient(viewer);
};

const applyCadBimVisualsNow = (viewer: Autodesk.Viewing.GuiViewer3D): void => {
	cancelScheduledUnityGridReapply();
	applyCadBimLighting(viewer);
	applyCadBimBackground(viewer);
	ensureCadBimGrid(viewer);
};

const scheduleCadBimBackdropReapply = (viewer: Autodesk.Viewing.GuiViewer3D): void => {
	const generation = cadBimReapplyGeneration;
	for (const delayMs of CAD_BIM_REAPPLY_DELAYS_MS) {
		window.setTimeout(() => {
			if (generation !== cadBimReapplyGeneration) return;
			if (!isViewerModelReady(viewer)) return;
			applyCadBimGroundAndEnvFlags(viewer);
			applyCadBimBackground(viewer);
			applyCadBimAmbient(viewer);
			ensureCadBimGrid(viewer);
			viewer.impl.invalidate(true, false, false);
		}, delayMs);
	}
};

const scheduleUnityGridReapply = (viewer: Autodesk.Viewing.GuiViewer3D): void => {
	const generation = unityGridReapplyGeneration;
	for (const delayMs of UNITY_GRID_REAPPLY_DELAYS_MS) {
		window.setTimeout(() => {
			if (generation !== unityGridReapplyGeneration) return;
			if (!isViewerModelReady(viewer)) return;
			applyCadBimGroundAndEnvFlags(viewer);
			applyAccDefaultBackground(viewer);
			ensureUnityGrid(viewer);
			viewer.impl.invalidate(true, false, false);
		}, delayMs);
	}
};

const applyAccDefaultBackground = (viewer: Autodesk.Viewing.GuiViewer3D): void => {
	try {
		const { r, g, b } = UNITY_BACKGROUND;
		if (typeof viewer.setEnvMapBackground === 'function') {
			viewer.setEnvMapBackground(false);
		}
		const impl = viewer.impl as {
			setClearColors?: (r1: number, g1: number, b1: number, r2: number, g2: number, b2: number) => void;
			toggleEnvMapBackground?: (value: boolean) => void;
		};
		impl.toggleEnvMapBackground?.(false);
		impl.setClearColors?.(r, g, b, r, g, b);
		viewer.setBackgroundColor(r, g, b, r, g, b);
	} catch (error) {
		console.warn('ViewerEnvironment: acc-default background apply failed', error);
	}
};

const applyAccDefault = (viewer: Autodesk.Viewing.GuiViewer3D): void => {
	cancelScheduledCadBimReapply();
	cancelScheduledUnityGridReapply();
	clearBuildingColorScheme(viewer);

	viewer.setLightPreset(ACC_DEFAULT.lightPresetIndex);
	// Avalon re-enables LMV ground reflection (white outer ruler ticks) — keep our overlay only.
	applyCadBimGroundAndEnvFlags(viewer);
	applyAccDefaultBackground(viewer);
	ensureUnityGrid(viewer);
	// Re-assert after grid — Avalon can reset clear colors to solid black.
	applyAccDefaultBackground(viewer);
	if (isViewerModelReady(viewer)) {
		scheduleUnityGridReapply(viewer);
	}
	viewer.impl.invalidate(true, false, false);
};

/** Canvas color only — safe before the model finishes loading. */
export const applyCadBimBackdrop = (viewer: Autodesk.Viewing.GuiViewer3D): void => {
	applyCadBimBackground(viewer);
};

/** Background, lighting, and floor grid (keeps user camera). Skips work while model is loading. */
export const applyCadBimVisuals = (viewer: Autodesk.Viewing.GuiViewer3D): void => {
	applyCadBimVisualsNow(viewer);
	viewer.impl.invalidate(true, false, false);
	if (isViewerModelReady(viewer)) {
		scheduleCadBimBackdropReapply(viewer);
	}
};

export const applyViewerEnvironment = (
	viewer: Autodesk.Viewing.GuiViewer3D,
	environmentId: ViewerEnvironmentId = DEFAULT_VIEWER_ENVIRONMENT_ID,
	options: ViewerEnvironmentApplyOptions = {}
): void => {
	const sheetAlignmentActive = options.sheetAlignmentActive ?? false;

	switch (environmentId) {
		case 'cad-bim-neutral':
		case 'sheet-2d-3d-alignment':
			applyCadBimVisuals(viewer);
			setViewerEnvironmentDomState(
				viewer,
				'cad-bim-neutral',
				sheetAlignmentActive || environmentId === 'sheet-2d-3d-alignment'
			);
			return;
		case 'acc-default':
			applyAccDefault(viewer);
			setViewerEnvironmentDomState(viewer, environmentId, sheetAlignmentActive);
			return;
		default:
			console.warn('ViewerEnvironment: unknown environment id', environmentId);
	}
};
