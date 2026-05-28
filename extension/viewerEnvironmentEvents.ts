export const executeAfterGeometryLoaded = (
	viewer: Autodesk.Viewing.Viewer3D,
	callback: () => void
): void => {
	if (viewer.model?.isLoadDone?.()) {
		callback();
	} else {
		viewer.addEventListener(Autodesk.Viewing.GEOMETRY_LOADED_EVENT, callback, { once: true });
	}
};
