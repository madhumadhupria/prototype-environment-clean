/** True when the primary model finished progressive loading (safe to add overlays). */
export const isViewerModelReady = (viewer: Autodesk.Viewing.GuiViewer3D): boolean => {
	const model = viewer.model;
	return !!model && typeof model.isLoadDone === 'function' && model.isLoadDone();
};
