// Design tokens shared between runtime scene setup and injected CSS.

import { CAD_BIM_BACKGROUND, CAD_BIM_GRID } from './viewerEnvironmentSpec';

const toHex = (n: number): string => n.toString(16).padStart(2, '0');

export const CAD_BIM_BACKGROUND_HEX = `#${toHex(CAD_BIM_BACKGROUND.r)}${toHex(CAD_BIM_BACKGROUND.g)}${toHex(CAD_BIM_BACKGROUND.b)}`;

export const CAD_BIM_GRID_MINOR_HEX = `#${toHex((CAD_BIM_GRID.minorColor >> 16) & 0xff)}${toHex(
	(CAD_BIM_GRID.minorColor >> 8) & 0xff
)}${toHex(CAD_BIM_GRID.minorColor & 0xff)}`;

export const CAD_BIM_GRID_MAJOR_HEX = `#${toHex((CAD_BIM_GRID.majorColor >> 16) & 0xff)}${toHex(
	(CAD_BIM_GRID.majorColor >> 8) & 0xff
)}${toHex(CAD_BIM_GRID.majorColor & 0xff)}`;

/** LMV toolbar accent — matches LightTheme.css / DarkTheme.css `.adsk-button` hover & active. */
export const CHROME_ACCENT_HEX = '#00bfff';

/** @deprecated Use CHROME_ACCENT_HEX */
export const ALIGNMENT_ACCENT_HEX = CHROME_ACCENT_HEX;

/** Flyout panel chrome — matches ACS toolbar (dark surface, light type). */
export const FLYOUT_CHROME = {
	surface: 'rgba(0, 0, 0, 0.92)',
	surfaceMuted: 'rgba(255, 255, 255, 0.08)',
	border: 'rgba(255, 255, 255, 0.14)',
	text: '#f4f4f4',
	textMuted: 'rgba(244, 244, 244, 0.65)',
	accent: '#f4f4f4',
	toolbarShadow: '1px 3px 10px 0 rgba(0, 0, 0, 0.5)',
} as const;

/** @deprecated Use FLYOUT_CHROME */
export const LMV_LIGHT_CHROME = FLYOUT_CHROME;

/** @deprecated Use FLYOUT_CHROME */
export const CAD_BIM_CHROME = FLYOUT_CHROME;
