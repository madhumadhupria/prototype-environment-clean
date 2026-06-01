/** Rendering fidelity presets — Forma-style low / high mapped to LMV viewer settings. */

import { applyLowDetailContentVisibility } from './viewerRenderingDetailContent';

export type RenderingDetailLevel = 'low' | 'high';

export interface RenderingDetailOption {
	id: RenderingDetailLevel;
	label: string;
}

export const RENDERING_DETAIL_OPTIONS: RenderingDetailOption[] = [
	{ id: 'low', label: 'Low' },
	{ id: 'high', label: 'High' },
];

export const DEFAULT_RENDERING_DETAIL_LEVEL: RenderingDetailLevel = 'high';

interface RenderingDetailPreset {
	/** Progressive FPS target — lower values draw more geometry per frame (higher fidelity). */
	progressiveFpsTarget: number;
	useSAO: boolean;
	useFXAA: boolean;
	optimizeNavigation: boolean;
	displayEdges: boolean;
}

const getFpsModes = (): typeof Autodesk.Viewing.Private.FPS_TARGET_MODES | undefined =>
	Autodesk.Viewing.Private?.FPS_TARGET_MODES;

const buildPresets = (): Record<RenderingDetailLevel, RenderingDetailPreset> => {
	const fps = getFpsModes();
	const lowFps = fps?.LOW ?? 6;
	const highFps = fps?.HIGH ?? 60;

	return {
		low: {
			progressiveFpsTarget: highFps,
			useSAO: false,
			useFXAA: false,
			optimizeNavigation: true,
			displayEdges: false,
		},
		high: {
			progressiveFpsTarget: lowFps,
			useSAO: true,
			useFXAA: true,
			optimizeNavigation: false,
			displayEdges: true,
		},
	};
};

let cachedPresets: Record<RenderingDetailLevel, RenderingDetailPreset> | undefined;

const presets = (): Record<RenderingDetailLevel, RenderingDetailPreset> => {
	if (!cachedPresets) {
		cachedPresets = buildPresets();
	}
	return cachedPresets;
};

const FIDELITY_ICON_SVGS: Record<RenderingDetailLevel, string> = {
	low: `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="4" y="4" width="12" height="12" stroke="currentColor" stroke-width="1.5"/></svg>`,
	high: `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="4" y="4" width="12" height="12" stroke="currentColor" stroke-width="1.5"/><path d="M7 6v8M10 6v8M13 6v8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>`,
};

export const renderingDetailIconMarkup = (level: RenderingDetailLevel): string => FIDELITY_ICON_SVGS[level];

/** Apply rendering fidelity for the active 3D view. */
export const applyRenderingDetailLevel = (
	viewer: Autodesk.Viewing.GuiViewer3D,
	level: RenderingDetailLevel
): void => {
	const model = viewer.model;
	if (!model || model.is2d()) {
		return;
	}

	const preset = presets()[level];

	viewer.setProgressiveRendering(true);
	const viewer3d = viewer as Autodesk.Viewing.Viewer3D & {
		setProgressiveFpsTarget?: (value: number) => void;
	};
	viewer3d.setProgressiveFpsTarget?.(preset.progressiveFpsTarget);
	viewer.prefs?.set('progressiveFpsTarget', preset.progressiveFpsTarget);
	viewer.setQualityLevel(preset.useSAO, preset.useFXAA);
	viewer.setOptimizeNavigation(preset.optimizeNavigation);
	viewer.setDisplayEdges(preset.displayEdges);

	applyLowDetailContentVisibility(viewer, level);

	viewer.impl?.invalidate(true, true, true);
};
