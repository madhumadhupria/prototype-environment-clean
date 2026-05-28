export type BuildingColorPaletteId = 'stone' | 'mist' | 'sage';

export type BuildingColorRole = 'wall' | 'roof' | 'door' | 'window' | 'trim' | 'accent';

export interface BuildingColorPalette {
	id: BuildingColorPaletteId;
	label: string;
	colors: Record<BuildingColorRole, string>;
}

/** Curated palettes — larger geometry gets lighter roles; smaller gets darker. */
export const BUILDING_COLOR_PALETTES: BuildingColorPalette[] = [
	{
		id: 'stone',
		label: 'Stone',
		colors: {
			wall: '#E8E3DF',
			roof: '#8B837E',
			door: '#5A4F4A',
			window: '#B2BECB',
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
			window: '#B2BECB',
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
			window: '#B2BECB',
			trim: '#9BA991',
			accent: '#5B6655',
		},
	},
];

export const DEFAULT_BUILDING_COLOR_PALETTE_ID: BuildingColorPaletteId = 'stone';

export const getBuildingColorPalette = (id: BuildingColorPaletteId): BuildingColorPalette | undefined =>
	BUILDING_COLOR_PALETTES.find(palette => palette.id === id);
