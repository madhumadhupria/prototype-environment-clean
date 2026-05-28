/** Material role — larger geometry maps to lighter roles (wall), smaller to darker (door). */
export type BuildingMaterialRole = 'wall' | 'roof' | 'trim' | 'window' | 'accent' | 'door';

export type BuildingColorSchemeId = 'none' | 'stone' | 'mist' | 'sage';

export interface BuildingPaletteColors {
	wall: string;
	roof: string;
	door: string;
	window: string;
	trim: string;
	accent: string;
}

export interface BuildingColorScheme {
	id: Exclude<BuildingColorSchemeId, 'none'>;
	label: string;
	colors: BuildingPaletteColors;
}

/** Shared glass tone across all palettes. */
export const BUILDING_WINDOW_HEX = '#B2BECB';

export const BUILDING_COLOR_SCHEMES: BuildingColorScheme[] = [
	{
		id: 'stone',
		label: 'Stone',
		colors: {
			wall: '#E8E3DF',
			roof: '#8B837E',
			door: '#5A4F4A',
			window: BUILDING_WINDOW_HEX,
			trim: '#A39A94',
			accent: '#6B625D',
		},
	},
	{
		id: 'mist',
		label: 'Mist',
		colors: {
			wall: '#E9EDEF',
			roof: '#7F8E8F',
			door: '#4F5D5E',
			window: BUILDING_WINDOW_HEX,
			trim: '#A4ADB3',
			accent: '#606C6E',
		},
	},
	{
		id: 'sage',
		label: 'Sage',
		colors: {
			wall: '#EDF1EF',
			roof: '#7A8477',
			door: '#4A5445',
			window: BUILDING_WINDOW_HEX,
			trim: '#9BA991',
			accent: '#5B6655',
		},
	},
];

export const DEFAULT_BUILDING_COLOR_SCHEME_ID: Exclude<BuildingColorSchemeId, 'none'> = 'stone';

export const getBuildingColorScheme = (id: BuildingColorSchemeId): BuildingColorScheme | undefined =>
	BUILDING_COLOR_SCHEMES.find(s => s.id === id);
