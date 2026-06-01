// Inject a <style> tag once on module load. Avoids the SCSS/CSS pipeline,
// which is scoped to Alloy/Matrix dependency code in this repo's webpack
// config. For a designer prototype this is the lightest-weight option.

import { CHROME_ACCENT_HEX, FLYOUT_CHROME } from './viewerEnvironmentTokens';

const { accent: FLYOUT_ACCENT } = FLYOUT_CHROME;
import { SHEET_ALIGNMENT_ACTIVE_CLASS, VIEWER_ENV_ROOT_CLASS } from './viewerEnvironmentDom';

const STYLE_ELEMENT_ID = 'priyam-viewer-environment-styles';

const CSS = `
/* --- Flyout (environment + color scheme) --- */
.priyam-viewer-env-flyout {
	position: absolute;
	z-index: 1000;
	min-width: 220px;
	max-height: min(420px, 70vh);
	overflow-y: auto;
	padding: 8px;
	background-color: ${FLYOUT_CHROME.surface};
	border: 1px solid ${FLYOUT_CHROME.border};
	border-radius: 8px;
	box-shadow: ${FLYOUT_CHROME.toolbarShadow};
	color: ${FLYOUT_CHROME.text};
	font-family: 'Artifakt Element', 'ArtifaktElement', system-ui, sans-serif;
}
.priyam-viewer-env-flyout__title {
	padding: 4px 8px 8px 8px;
	color: ${FLYOUT_CHROME.textMuted};
	font-size: 11px;
	font-weight: 600;
	letter-spacing: 0.04em;
	text-transform: uppercase;
}
.priyam-viewer-env-flyout__option {
	display: flex;
	align-items: center;
	gap: 8px;
	width: 100%;
	padding: 8px;
	border: 0;
	border-radius: 4px;
	background: transparent;
	color: inherit;
	text-align: left;
	cursor: pointer;
	transition: background-color 120ms ease, color 120ms ease;
}
.priyam-viewer-env-flyout__option:hover {
	background-color: ${FLYOUT_CHROME.surfaceMuted};
}
.priyam-viewer-env-flyout__option:focus-visible {
	outline: 0;
	box-shadow: 0 0 0 1px ${FLYOUT_CHROME.surface}, 0 0 0 3px rgba(255, 255, 255, 0.35);
}
.priyam-viewer-env-flyout__option[aria-checked='true'] .priyam-viewer-env-flyout__option-radio {
	border-color: ${FLYOUT_ACCENT};
}
.priyam-viewer-env-flyout__option[aria-checked='true'] .priyam-viewer-env-flyout__option-radio::after {
	transform: scale(1);
}
.priyam-viewer-env-flyout__option[aria-checked='true'] .priyam-viewer-env-flyout__option-label {
	color: ${FLYOUT_CHROME.text};
}
.priyam-viewer-env-flyout__option-radio {
	flex: 0 0 auto;
	width: 16px;
	height: 16px;
	border: 1.5px solid ${FLYOUT_CHROME.border};
	border-radius: 50%;
	position: relative;
	transition: border-color 120ms ease;
}
.priyam-viewer-env-flyout__option-radio::after {
	content: '';
	position: absolute;
	inset: 3px;
	border-radius: 50%;
	background-color: ${FLYOUT_ACCENT};
	transform: scale(0);
	transition: transform 120ms ease;
}
.priyam-viewer-env-flyout__option-label {
	color: ${FLYOUT_CHROME.text};
	font-size: 13px;
	font-weight: 500;
	line-height: 18px;
}
.priyam-viewer-env-flyout__section {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 4px 0 8px;
	margin-bottom: 4px;
	border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
.priyam-viewer-env-flyout__section--solo {
	margin-bottom: 0;
	padding-bottom: 4px;
	border-bottom: none;
}
.priyam-viewer-env-flyout__section-label {
	flex: 1 1 auto;
	color: ${FLYOUT_CHROME.text};
	font-size: 13px;
	font-weight: 500;
	line-height: 18px;
	white-space: nowrap;
}
.priyam-viewer-env-flyout__fidelity-group {
	display: flex;
	flex: 0 0 auto;
	gap: 4px;
}
.priyam-viewer-env-flyout__fidelity-btn {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 32px;
	height: 32px;
	padding: 0;
	border: 1px solid rgba(255, 255, 255, 0.18);
	border-radius: 4px;
	background: transparent;
	color: ${FLYOUT_CHROME.text};
	cursor: pointer;
	transition: background-color 120ms ease, border-color 120ms ease;
}
.priyam-viewer-env-flyout__fidelity-btn:hover {
	background-color: ${FLYOUT_CHROME.surfaceMuted};
}
.priyam-viewer-env-flyout__fidelity-btn:focus-visible {
	outline: 0;
	box-shadow: 0 0 0 1px ${FLYOUT_CHROME.surface}, 0 0 0 3px rgba(255, 255, 255, 0.35);
}
.priyam-viewer-env-flyout__fidelity-btn[aria-checked='true'] {
	border-color: ${FLYOUT_ACCENT};
	background-color: rgba(0, 120, 212, 0.22);
}
.priyam-viewer-env-flyout__fidelity-icon {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 20px;
	height: 20px;
	pointer-events: none;
}
.priyam-viewer-env-flyout__fidelity-icon > svg {
	display: block;
	width: 20px;
	height: 20px;
}
.priyam-viewer-env-flyout__toggle {
	display: flex;
	align-items: center;
	gap: 10px;
	width: 100%;
	padding: 8px;
	border: 0;
	border-radius: 4px;
	background: transparent;
	color: inherit;
	text-align: left;
	cursor: pointer;
	transition: background-color 120ms ease;
}
.priyam-viewer-env-flyout__toggle:hover {
	background-color: ${FLYOUT_CHROME.surfaceMuted};
}
.priyam-viewer-env-flyout__toggle:focus-visible {
	outline: 0;
	box-shadow: 0 0 0 1px ${FLYOUT_CHROME.surface}, 0 0 0 3px rgba(255, 255, 255, 0.35);
}
.priyam-viewer-env-flyout__toggle-switch {
	flex: 0 0 auto;
	width: 32px;
	height: 18px;
	border-radius: 9px;
	background-color: rgba(255, 255, 255, 0.2);
	position: relative;
	transition: background-color 120ms ease;
}
.priyam-viewer-env-flyout__toggle-switch::after {
	content: '';
	position: absolute;
	top: 2px;
	left: 2px;
	width: 14px;
	height: 14px;
	border-radius: 50%;
	background-color: #ffffff;
	transition: transform 120ms ease;
}
.priyam-viewer-env-flyout__toggle[aria-pressed='true'] .priyam-viewer-env-flyout__toggle-switch {
	background-color: rgba(255, 255, 255, 0.45);
}
.priyam-viewer-env-flyout__toggle[aria-pressed='true'] .priyam-viewer-env-flyout__toggle-switch::after {
	transform: translateX(14px);
}
.priyam-viewer-env-flyout__palettes {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding-top: 4px;
}
.priyam-viewer-env-flyout__palettes--disabled .priyam-viewer-env-flyout__option--scheme {
	opacity: 0.45;
	pointer-events: none;
}
.priyam-viewer-env-flyout__option--scheme {
	align-items: center;
	justify-content: center;
}
.priyam-viewer-env-flyout__option--scheme[aria-checked='true'] {
	outline: 1px solid ${FLYOUT_ACCENT};
	outline-offset: -1px;
	background-color: ${FLYOUT_CHROME.surfaceMuted};
}
.priyam-viewer-env-flyout__swatches {
	display: flex;
	flex: 0 0 auto;
	gap: 3px;
}
.priyam-viewer-env-flyout__swatch {
	width: 10px;
	height: 10px;
	border-radius: 2px;
	border: 1px solid rgba(255, 255, 255, 0.22);
}

/* --- Toolbar SVG icons: same slot as native font icons (28×28 button, 24px glyph) --- */
.adsk-viewing-viewer .adsk-button-icon.priyam-viewer-env-svg-icon {
	display: flex;
	align-items: center;
	justify-content: center;
	background: none;
	background-image: none;
	background-color: transparent;
	color: inherit;
}
.adsk-viewing-viewer .adsk-button-icon.priyam-viewer-env-svg-icon::before {
	content: none;
	display: none;
}
.adsk-viewing-viewer .adsk-button-icon.priyam-viewer-env-svg-icon > svg {
	display: block;
	width: 1em;
	height: 1em;
	flex-shrink: 0;
	fill: none;
	pointer-events: none;
}

/* --- 2D/3D sheet alignment: subtle workflow emphasis (no global light-mode reskin) --- */
.${VIEWER_ENV_ROOT_CLASS}.${SHEET_ALIGNMENT_ACTIVE_CLASS}.adsk-viewing-viewer .adsk-toolbar {
	outline: 1px solid ${CHROME_ACCENT_HEX};
	outline-offset: -1px;
}

.${VIEWER_ENV_ROOT_CLASS}.${SHEET_ALIGNMENT_ACTIVE_CLASS}.adsk-viewing-viewer .adsk-control-group {
	border-color: rgba(0, 191, 255, 0.35);
}

/* --- Bottom prototype strip (In-Canvas work / ACC DS) --- */
#prototype-strip-root {
	position: fixed;
	left: 0;
	right: 0;
	bottom: 0;
	z-index: 1001;
	pointer-events: none;
}
.priyam-prototype-strip {
	position: relative;
	left: 0;
	right: 0;
	bottom: 0;
	z-index: 1;
	display: flex;
	align-items: center;
	gap: 12px;
	height: 58px;
	padding: 0 24px;
	background: #2e2e2e;
	box-sizing: border-box;
	font-family: 'Artifakt Element', 'ArtifaktElement', system-ui, sans-serif;
	pointer-events: auto;
	overflow: visible;
}
.adsk-viewing-viewer .adsk-toolbar {
	bottom: 72px !important;
}
.priyam-prototype-strip__trigger {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	height: 36px;
	padding: 0 14px;
	border: 1px solid rgba(255, 255, 255, 0.4);
	border-radius: 4px;
	background: transparent;
	color: #f5f5f5;
	font-size: 14px;
	font-weight: 500;
	line-height: 20px;
	cursor: pointer;
	transition:
		background-color 120ms ease,
		border-color 120ms ease,
		color 120ms ease;
}
.priyam-prototype-strip__trigger:hover {
	background: rgba(255, 255, 255, 0.08);
	border-color: rgba(255, 255, 255, 0.65);
	color: #ffffff;
}
.priyam-prototype-strip__trigger:focus-visible {
	outline: 2px solid #ffffff;
	outline-offset: 2px;
}
.priyam-prototype-strip__trigger--open {
	background: rgba(255, 255, 255, 0.12);
	border-color: rgba(255, 255, 255, 0.75);
	color: #ffffff;
}
.priyam-prototype-strip__toggle {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	height: 36px;
	padding: 0 14px;
	border: 1px solid rgba(255, 255, 255, 0.4);
	border-radius: 4px;
	background: transparent;
	color: #f5f5f5;
	font-size: 14px;
	font-weight: 500;
	line-height: 20px;
	cursor: pointer;
	transition:
		background-color 120ms ease,
		border-color 120ms ease,
		color 120ms ease;
}
.priyam-prototype-strip__toggle:hover {
	background: rgba(255, 255, 255, 0.08);
	border-color: rgba(255, 255, 255, 0.65);
	color: #ffffff;
}
.priyam-prototype-strip__toggle:focus-visible {
	outline: 2px solid #ffffff;
	outline-offset: 2px;
}
.priyam-prototype-strip__toggle--active {
	background: rgba(255, 138, 42, 0.18);
	border-color: #ff8a2a;
	color: #ffffff;
}
.priyam-prototype-strip__toggle-icon {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 16px;
	height: 16px;
}
.priyam-prototype-strip__chevron {
	width: 8px;
	height: 8px;
	border-right: 2px solid currentColor;
	border-bottom: 2px solid currentColor;
	transform: rotate(-135deg) translateY(2px);
	transition: transform 120ms ease;
}
.priyam-prototype-strip__trigger--open .priyam-prototype-strip__chevron {
	transform: rotate(45deg) translateY(-1px);
}
.priyam-prototype-strip__menus {
	position: absolute;
	inset: 0;
	pointer-events: none;
	overflow: visible;
}
.priyam-prototype-menu {
	position: absolute;
	z-index: 2;
	width: 213px;
	pointer-events: auto;
	background: ${FLYOUT_CHROME.surface};
	border: 1px solid ${FLYOUT_CHROME.border};
	border-radius: 4px;
	box-shadow: ${FLYOUT_CHROME.toolbarShadow};
	color: ${FLYOUT_CHROME.text};
	overflow: hidden;
}
.priyam-prototype-menu__section + .priyam-prototype-menu__section {
	border-top: 1px solid rgba(255, 255, 255, 0.1);
}
.priyam-prototype-menu__header {
	height: 32px;
	padding: 0 16px;
	display: flex;
	align-items: center;
	background: rgba(255, 255, 255, 0.06);
	border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	font-size: 14px;
	font-weight: 700;
	line-height: 20px;
	color: ${FLYOUT_CHROME.text};
}
.priyam-prototype-menu__item {
	display: flex;
	align-items: flex-start;
	gap: 8px;
	width: 100%;
	min-height: 40px;
	padding: 8px 16px;
	border: 0;
	border-bottom: 1px solid rgba(255, 255, 255, 0.06);
	background: transparent;
	color: inherit;
	text-align: left;
	cursor: pointer;
	transition: background-color 120ms ease;
}
.priyam-prototype-menu__item:last-child {
	border-bottom: 0;
}
.priyam-prototype-menu__item:hover:not(:disabled) {
	background: ${FLYOUT_CHROME.surfaceMuted};
}
.priyam-prototype-menu__item:focus-visible {
	outline: 0;
	box-shadow: inset 0 0 0 2px ${CHROME_ACCENT_HEX};
}
.priyam-prototype-menu__item[aria-checked='true'] .priyam-prototype-menu__radio {
	border-color: ${CHROME_ACCENT_HEX};
}
.priyam-prototype-menu__item[aria-checked='true'] .priyam-prototype-menu__radio::after {
	opacity: 1;
}
.priyam-prototype-menu__item[aria-checked='true'] .priyam-prototype-menu__fidelity-icon {
	border-color: ${CHROME_ACCENT_HEX};
	background: rgba(0, 191, 255, 0.18);
}
.priyam-prototype-menu__item--disabled,
.priyam-prototype-menu__item:disabled {
	opacity: 0.45;
	cursor: not-allowed;
}
.priyam-prototype-menu__radio {
	flex: 0 0 auto;
	width: 16px;
	height: 16px;
	margin-top: 2px;
	border: 2px solid rgba(255, 255, 255, 0.35);
	border-radius: 50%;
	position: relative;
}
.priyam-prototype-menu__radio::after {
	content: '';
	position: absolute;
	inset: 3px;
	border-radius: 50%;
	background: ${CHROME_ACCENT_HEX};
	opacity: 0;
}
.priyam-prototype-menu__fidelity-icon {
	flex: 0 0 auto;
	display: flex;
	align-items: center;
	justify-content: center;
	width: 28px;
	height: 28px;
	margin-top: 0;
	border: 1px solid rgba(255, 255, 255, 0.18);
	border-radius: 4px;
	color: ${FLYOUT_CHROME.text};
	transition:
		background-color 120ms ease,
		border-color 120ms ease;
}
.priyam-prototype-menu__fidelity-icon > svg {
	display: block;
	width: 20px;
	height: 20px;
}
.priyam-prototype-menu__text {
	display: flex;
	flex-direction: column;
	gap: 0;
	min-width: 0;
}
.priyam-prototype-menu__title {
	font-size: 14px;
	font-weight: 500;
	line-height: 20px;
	color: ${FLYOUT_CHROME.text};
}
.priyam-prototype-menu__description {
	font-size: 14px;
	font-weight: 500;
	line-height: 20px;
	color: ${FLYOUT_CHROME.textMuted};
}
.priyam-prototype-menu__footer {
	border-top: 1px solid rgba(255, 255, 255, 0.1);
	padding: 8px;
}
.priyam-prototype-menu__clear {
	display: block;
	width: 100%;
	height: 32px;
	padding: 0 12px;
	border: 1px solid rgba(255, 255, 255, 0.18);
	border-radius: 4px;
	background: transparent;
	color: ${FLYOUT_CHROME.text};
	font-size: 14px;
	font-weight: 500;
	line-height: 20px;
	text-align: center;
	cursor: pointer;
	transition:
		background-color 120ms ease,
		border-color 120ms ease,
		color 120ms ease;
}
.priyam-prototype-menu__clear:hover:not(:disabled) {
	background: ${FLYOUT_CHROME.surfaceMuted};
	border-color: rgba(255, 255, 255, 0.35);
}
.priyam-prototype-menu__clear:focus-visible {
	outline: 0;
	box-shadow: inset 0 0 0 2px ${CHROME_ACCENT_HEX};
}
.priyam-prototype-menu__clear:disabled {
	opacity: 0.45;
	cursor: not-allowed;
}
`;

export const ensureStylesInjected = (): void => {
	if (typeof document === 'undefined') return;
	const existing = document.getElementById(STYLE_ELEMENT_ID);
	if (existing) {
		existing.textContent = CSS;
		return;
	}
	const style = document.createElement('style');
	style.id = STYLE_ELEMENT_ID;
	style.textContent = CSS;
	document.head.appendChild(style);
};
