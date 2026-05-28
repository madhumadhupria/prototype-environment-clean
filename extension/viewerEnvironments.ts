// Viewer environment presets for the prototype flyout.

export type ViewerEnvironmentId = 'cad-bim-neutral' | 'acc-default' | 'sheet-2d-3d-alignment';

export interface ViewerEnvironmentOption {
	id: ViewerEnvironmentId;
	label: string;
}

export const VIEWER_ENVIRONMENTS: ViewerEnvironmentOption[] = [
	{ id: 'cad-bim-neutral', label: 'CAD/BIM' },
	{ id: 'acc-default', label: 'Default' },
];

export const DEFAULT_VIEWER_ENVIRONMENT_ID: ViewerEnvironmentId = 'cad-bim-neutral';

export const getViewerEnvironment = (id: ViewerEnvironmentId): ViewerEnvironmentOption | undefined =>
	VIEWER_ENVIRONMENTS.find(env => env.id === id);
