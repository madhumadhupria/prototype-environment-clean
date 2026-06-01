import {
	activatePriyamRotateGizmo,
	deactivatePriyamRotateGizmo,
	isPriyamRotateGizmoActive,
	togglePriyamRotateGizmo,
} from './priyamRotateGizmo';

export const activateRotateGizmo = (viewer: Autodesk.Viewing.GuiViewer3D): boolean =>
	activatePriyamRotateGizmo(viewer);

export const deactivateRotateGizmo = (viewer: Autodesk.Viewing.GuiViewer3D): void => {
	deactivatePriyamRotateGizmo(viewer);
};

export const isRotateGizmoActive = (viewer: Autodesk.Viewing.GuiViewer3D): boolean =>
	isPriyamRotateGizmoActive(viewer);

export const toggleRotateGizmo = (
	viewer: Autodesk.Viewing.GuiViewer3D,
	enable?: boolean
): boolean => togglePriyamRotateGizmo(viewer, enable);
