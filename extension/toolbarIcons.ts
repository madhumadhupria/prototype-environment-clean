/** Shared class for custom SVG toolbar glyphs — matches native `.adsk-button-icon` layout. */
export const TOOLBAR_SVG_ICON_CLASS = 'priyam-viewer-env-svg-icon';

const ENVIRONMENT_ICON_SVG = `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
	<circle cx="10" cy="10" r="3.5" stroke="currentColor" stroke-width="1.5"/>
	<path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.93 4.93l1.41 1.41M13.66 13.66l1.41 1.41M4.93 15.07l1.41-1.41M13.66 6.34l1.41-1.41" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;

const SECTION_BOX_ICON_SVG = `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
	<path d="M4 7.5L10 4l6 3.5v5L10 16l-6-3.5v-5z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
	<path d="M4 7.5L10 11l6-3.5M10 11v5" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
</svg>`;

const COLOR_SCHEME_ICON_SVG = `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
	<circle cx="7" cy="10" r="4" stroke="currentColor" stroke-width="1.5"/>
	<circle cx="13" cy="7" r="4" stroke="currentColor" stroke-width="1.5"/>
	<circle cx="13" cy="13" r="4" stroke="currentColor" stroke-width="1.5"/>
</svg>`;

/** Inject a transparent SVG icon into an LMV button icon slot (no innerHTML on the button itself). */
export const setToolbarSvgIcon = (icon: HTMLElement, svgMarkup: string): void => {
	icon.classList.add(TOOLBAR_SVG_ICON_CLASS);
	icon.innerHTML = svgMarkup;
};

export const setEnvironmentToolbarIcon = (icon: HTMLElement): void => {
	setToolbarSvgIcon(icon, ENVIRONMENT_ICON_SVG);
};

export const setSectionBoxToolbarIcon = (icon: HTMLElement): void => {
	setToolbarSvgIcon(icon, SECTION_BOX_ICON_SVG);
};

export const setColorSchemeToolbarIcon = (icon: HTMLElement): void => {
	setToolbarSvgIcon(icon, COLOR_SCHEME_ICON_SVG);
};
