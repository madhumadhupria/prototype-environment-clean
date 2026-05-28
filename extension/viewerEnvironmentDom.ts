import { ViewerEnvironmentId } from './viewerEnvironments';

/** Root class toggled on the LMV viewer container for environment-scoped CSS. */
export const VIEWER_ENV_ROOT_CLASS = 'priyam-viewer-env';

/** Active when 2D/3D sheet alignment workflow is running. */
export const SHEET_ALIGNMENT_ACTIVE_CLASS = 'priyam-viewer-env--sheet-alignment';

const environmentClassFor = (id: ViewerEnvironmentId): string => `${VIEWER_ENV_ROOT_CLASS}--${id}`;

const allEnvironmentClasses = (): string[] =>
	(['cad-bim-neutral', 'sheet-2d-3d-alignment', 'acc-default'] as const).map(environmentClassFor);

export const setViewerEnvironmentDomState = (
	viewer: Autodesk.Viewing.GuiViewer3D,
	environmentId: ViewerEnvironmentId,
	sheetAlignmentActive = false
): void => {
	const root = viewer.container;
	if (!root) return;

	root.classList.add(VIEWER_ENV_ROOT_CLASS);
	for (const cls of allEnvironmentClasses()) {
		root.classList.toggle(cls, cls === environmentClassFor(environmentId));
	}
	root.classList.toggle(SHEET_ALIGNMENT_ACTIVE_CLASS, sheetAlignmentActive);
};
