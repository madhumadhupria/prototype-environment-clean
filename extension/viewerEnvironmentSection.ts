import { suppressNativeSectionGizmos } from './lmvNativeSection';
import type { SectionPrototypeId } from './prototypeStripSpec';
import {
	activatePriyamSectionBox,
	deactivatePriyamSectionBox,
	isPriyamSectionBoxActive,
	togglePriyamSectionBox,
} from './priyamSectionBox';

export type SectionBoxMode = SectionPrototypeId;

export const deactivateSectionBox = async (viewer: Autodesk.Viewing.GuiViewer3D): Promise<void> => {
	deactivatePriyamSectionBox(viewer);
};

export const activateSectionBox = async (
	viewer: Autodesk.Viewing.GuiViewer3D,
	mode: SectionBoxMode = 'green-box'
): Promise<boolean> => {
	suppressNativeSectionGizmos(viewer);
	const enabled = activatePriyamSectionBox(viewer, mode);
	if (enabled) {
		suppressNativeSectionGizmos(viewer);
		window.requestAnimationFrame(() => suppressNativeSectionGizmos(viewer));
	}
	return enabled;
};

export const toggleSectionBox = async (
	viewer: Autodesk.Viewing.GuiViewer3D,
	enable?: boolean,
	mode: SectionBoxMode = 'green-box'
): Promise<boolean> => {
	suppressNativeSectionGizmos(viewer);
	const enabled = togglePriyamSectionBox(viewer, enable, mode);
	if (enabled) {
		suppressNativeSectionGizmos(viewer);
		window.requestAnimationFrame(() => suppressNativeSectionGizmos(viewer));
	}
	return enabled;
};

export const isSectionBoxActive = (viewer: Autodesk.Viewing.GuiViewer3D): boolean => isPriyamSectionBoxActive(viewer);
