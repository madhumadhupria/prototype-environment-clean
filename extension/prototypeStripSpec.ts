import type { RenderingDetailLevel } from './viewerRenderingDetails';
import type { ViewerEnvironmentId } from './viewerEnvironments';

export type SectionPrototypeId = 'green-box' | 'outlines';

export interface EnvironmentPrototypeOption {
	id: ViewerEnvironmentId | 'background-texture';
	label: string;
	description: string;
	disabled?: boolean;
}

export const ENVIRONMENT_PROTOTYPES: EnvironmentPrototypeOption[] = [
	{ id: 'cad-bim-neutral', label: 'Neutral Gridlines', description: 'Gridlines option 1' },
	{ id: 'acc-default', label: 'Gridlines', description: 'Gridlines Option 2' },
	{ id: 'background-texture', label: 'Background', description: 'Background texture', disabled: true },
];

export interface SectionPrototypeOption {
	id: SectionPrototypeId;
	label: string;
	description: string;
	disabled?: boolean;
}

export const SECTION_PROTOTYPES: SectionPrototypeOption[] = [
	{ id: 'green-box', label: 'Section tool 1', description: 'Green Box' },
	{ id: 'outlines', label: 'Section tool 2', description: 'outlines' },
];

export interface RenderingDetailPrototypeOption {
	id: RenderingDetailLevel;
	label: string;
	description: string;
}

export const RENDERING_DETAIL_PROTOTYPES: RenderingDetailPrototypeOption[] = [
	{ id: 'low', label: 'Low detail', description: 'Shell view without furnishings' },
	{ id: 'high', label: 'High detail', description: 'Full model fidelity' },
];

export type PrototypeStripMenuId = 'environment' | 'section';
