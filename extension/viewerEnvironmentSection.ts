import { suppressNativeSectionGizmos } from './lmvNativeSection';
import {
	activatePriyamSectionBox,
	deactivatePriyamSectionBox,
	isPriyamSectionBoxActive,
	togglePriyamSectionBox,
} from './priyamSectionBox';

export const deactivateSectionBox = async (viewer: Autodesk.Viewing.GuiViewer3D): Promise<void> => {
	deactivatePriyamSectionBox(viewer);
};

export const activateSectionBox = async (viewer: Autodesk.Viewing.GuiViewer3D): Promise<boolean> => {
	suppressNativeSectionGizmos(viewer);
	const enabled = activatePriyamSectionBox(viewer);
	if (enabled) {
		suppressNativeSectionGizmos(viewer);
		window.requestAnimationFrame(() => suppressNativeSectionGizmos(viewer));
	}
	return enabled;
};

export const toggleSectionBox = async (viewer: Autodesk.Viewing.GuiViewer3D, enable?: boolean): Promise<boolean> => {
	suppressNativeSectionGizmos(viewer);
	const enabled = togglePriyamSectionBox(viewer, enable);
	if (enabled) {
		suppressNativeSectionGizmos(viewer);
		window.requestAnimationFrame(() => suppressNativeSectionGizmos(viewer));
	}
	return enabled;
};

export const isSectionBoxActive = (viewer: Autodesk.Viewing.GuiViewer3D): boolean => isPriyamSectionBoxActive(viewer);
