/** Shared class for custom SVG toolbar glyphs — matches native `.adsk-button-icon` layout. */
export const TOOLBAR_SVG_ICON_CLASS = 'priyam-viewer-env-svg-icon';

const ENVIRONMENT_ICON_SVG = `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
	<circle cx="10" cy="10" r="3.5" stroke="currentColor" stroke-width="1.5"/>
	<path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.93 4.93l1.41 1.41M13.66 13.66l1.41 1.41M4.93 15.07l1.41-1.41M13.66 6.34l1.41-1.41" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;

/** ACC DS IcSectionAnalysis (Figma ACC-DS | Basics, node 34232:15491) */
const SECTION_BOX_ICON_SVG = `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
	<path fill="currentColor" d="M1.5 19.5h2.887c.199 0 .39-.079.53-.22a.75.75 0 0 0 .22-.53.75.75 0 0 0-.22-.53.75.75 0 0 0-.53-.22h-.973l2.059-1.4 4.616 2.665a.75.75 0 0 0 .375 0l4.6-2.656 1.854 1.291h-.687a.75.75 0 0 0-.53.22.75.75 0 0 0-.22.53c0 .199.079.39.22.53a.75.75 0 0 0 .53.22h2.894a.75.75 0 0 0 .53-.22.75.75 0 0 0 .22-.53v-2.887a.75.75 0 0 0-.22-.53.75.75 0 0 0-.53-.22.75.75 0 0 0-.53.22.75.75 0 0 0-.22.53v1.324l-2.114-1.472a.75.75 0 0 0 .045-.146V8.9a.75.75 0 0 0-.375-.649L10.97 5.31V3.06l.764.764a.75.75 0 0 0 1.06-1.06L10.24.22a.75.75 0 0 0-1.06 0L7.136 2.264a.75.75 0 0 0 1.06 1.06l.764-.764v2.261l-5.074 2.93a.75.75 0 0 0-.375.649v6.3c.008.042.019.083.033.124l-2.045 1.388v-1.12a.75.75 0 0 0-.75-.75.75.75 0 0 0-.53.22.75.75 0 0 0-.22.53v2.89a.75.75 0 0 0 .75.75ZM10.97 7.313l3.964 2.288v5l-3.964-2.76v-4.528Zm-.692 5.872 3.564 2.481-3.615 2.087-3.611-2.085 3.662-2.483ZM5.513 9.601l3.949-2.28v4.6l-3.949 2.678v-4.998Z"/>
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

/** ACC DS IcSectionAnalysis — same glyph as LMV `adsk-icon-section-analysis`. */
export const setSectionBoxToolbarIcon = (button: Autodesk.Viewing.UI.Button): void => {
	const icon = (button as unknown as { icon?: HTMLElement }).icon;
	if (!icon) return;
	setToolbarSvgIcon(icon, SECTION_BOX_ICON_SVG);
};

export const setColorSchemeToolbarIcon = (icon: HTMLElement): void => {
	setToolbarSvgIcon(icon, COLOR_SCHEME_ICON_SVG);
};
