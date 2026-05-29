import { applyCadBimBackdrop, applyCadBimVisuals, applyViewerEnvironment } from './applyViewerEnvironment';
import { applyBuildingColorScheme, clearBuildingColorScheme, paletteSwatchColors } from './viewerBuildingColorScheme';
import {
	BUILDING_COLOR_SCHEMES,
	BuildingColorSchemeId,
	DEFAULT_BUILDING_COLOR_SCHEME_ID,
} from './viewerBuildingPalettes';
import { wireNativeSectionToolbar } from './lmvNativeSection';
import { deactivateSectionBox, isSectionBoxActive, toggleSectionBox } from './viewerEnvironmentSection';
import { setColorSchemeToolbarIcon, setEnvironmentToolbarIcon, setSectionBoxToolbarIcon } from './toolbarIcons';
import { ensureStylesInjected } from './styles';
import { isViewerModelReady } from './viewerEnvironmentLifecycle';
import { applyCadBimHomeView, captureCadBimHomeViewArray } from './viewerEnvironmentCamera';
import { executeAfterGeometryLoaded } from './viewerEnvironmentEvents';
import { DEFAULT_VIEWER_ENVIRONMENT_ID, VIEWER_ENVIRONMENTS, ViewerEnvironmentId } from './viewerEnvironments';

export const VIEWER_ENVIRONMENT_EXTENSION_ID = 'Autodesk.Priyam.ViewerEnvironment';

const TOOLBAR_BUTTON_ID = 'viewer-environment-button';
const SECTION_BOX_BUTTON_ID = 'viewer-environment-section-box-button';
const COLOR_SCHEME_BUTTON_ID = 'viewer-environment-color-scheme-button';
const FLYOUT_CLASS = 'priyam-viewer-env-flyout';
const VISUALS_DEBOUNCE_MS = 400;
const DEFAULT_COLOR_SCHEME_ID: BuildingColorSchemeId = 'none';

type ActiveColorSchemeId = Exclude<BuildingColorSchemeId, 'none'>;

class ViewerEnvironmentExtension extends Autodesk.Viewing.Extension {
	private button: Autodesk.Viewing.UI.Button | undefined;
	private sectionBoxButton: Autodesk.Viewing.UI.Button | undefined;
	private colorSchemeButton: Autodesk.Viewing.UI.Button | undefined;
	private sectionBoxActive = false;
	private toolbarControlsParent: Autodesk.Viewing.UI.ControlGroup | undefined;
	private flyout: HTMLDivElement | undefined;
	private colorSchemeFlyout: HTMLDivElement | undefined;
	private currentEnvironmentId: ViewerEnvironmentId = DEFAULT_VIEWER_ENVIRONMENT_ID;
	private currentColorSchemeId: BuildingColorSchemeId = DEFAULT_COLOR_SCHEME_ID;
	private objectColorsEnabled = false;
	private selectedColorSchemeId: ActiveColorSchemeId = DEFAULT_BUILDING_COLOR_SCHEME_ID;
	private hasAppliedPostLoadEnvironment = false;
	private visualsDebounceTimer: ReturnType<typeof setTimeout> | undefined;
	private documentClickHandler: ((event: MouseEvent) => void) | undefined;
	private colorSchemeDocumentClickHandler: ((event: MouseEvent) => void) | undefined;
	private geometryLoadedHandler: (() => void) | undefined;
	private extensionLoadedHandler: ((event: { extensionId?: string }) => void) | undefined;
	private unwireNativeSectionToolbar: (() => void) | undefined;
	private handleToolbarCreated = (): void => {
		this.viewer.removeEventListener(Autodesk.Viewing.TOOLBAR_CREATED_EVENT, this.handleToolbarCreated);
		this.buildUi();
	};

	public load(): boolean {
		ensureStylesInjected();
		this.sectionBoxActive = false;
		if (this.isCadBimEnvironmentActive()) {
			try {
				applyCadBimBackdrop(this.viewer);
			} catch (error) {
				console.error('ViewerEnvironment: backdrop apply failed', error);
			}
		}
		if (this.viewer.getToolbar?.(false)) {
			this.buildUi();
		} else {
			this.viewer.addEventListener(Autodesk.Viewing.TOOLBAR_CREATED_EVENT, this.handleToolbarCreated);
		}

		this.geometryLoadedHandler = (): void => this.scheduleVisualsRefresh();
		this.viewer.addEventListener(Autodesk.Viewing.GEOMETRY_LOADED_EVENT, this.geometryLoadedHandler);

		if (this.isCadBimEnvironmentActive()) {
			executeAfterGeometryLoaded(this.viewer, () => this.applyEnvironmentWhenModelReady());
		}
		executeAfterGeometryLoaded(this.viewer, () => this.reapplyColorSchemeIfActive());

		(
			window as unknown as {
				viewerEnvironmentCaptureHome?: () => number[];
			}
		).viewerEnvironmentCaptureHome = () => captureCadBimHomeViewArray(this.viewer);

		this.unwireNativeSectionToolbar = wireNativeSectionToolbar(
			this.viewer,
			() => {
				void this.onSectionBoxToggle();
			},
			() => isSectionBoxActive(this.viewer)
		);
		this.extensionLoadedHandler = (event: { extensionId?: string }): void => {
			if (event.extensionId === 'Autodesk.SmartSection' || event.extensionId === 'Autodesk.SmartSectionUI') {
				this.unwireNativeSectionToolbar?.();
				this.unwireNativeSectionToolbar = wireNativeSectionToolbar(
					this.viewer,
					() => {
						void this.onSectionBoxToggle();
					},
					() => isSectionBoxActive(this.viewer)
				);
			}
		};
		this.viewer.addEventListener(Autodesk.Viewing.EXTENSION_LOADED_EVENT, this.extensionLoadedHandler);

		return true;
	}

	public unload(): boolean {
		if (this.visualsDebounceTimer !== undefined) {
			clearTimeout(this.visualsDebounceTimer);
			this.visualsDebounceTimer = undefined;
		}
		this.viewer.removeEventListener(Autodesk.Viewing.TOOLBAR_CREATED_EVENT, this.handleToolbarCreated);
		if (this.geometryLoadedHandler) {
			this.viewer.removeEventListener(Autodesk.Viewing.GEOMETRY_LOADED_EVENT, this.geometryLoadedHandler);
			this.geometryLoadedHandler = undefined;
		}
		if (this.extensionLoadedHandler) {
			this.viewer.removeEventListener(Autodesk.Viewing.EXTENSION_LOADED_EVENT, this.extensionLoadedHandler);
			this.extensionLoadedHandler = undefined;
		}
		this.unwireNativeSectionToolbar?.();
		this.unwireNativeSectionToolbar = undefined;
		void deactivateSectionBox(this.viewer);
		this.sectionBoxActive = false;
		this.removeUi();
		this.closeFlyout();
		this.closeColorSchemeFlyout();
		clearBuildingColorScheme(this.viewer);
		applyViewerEnvironment(this.viewer, 'acc-default');
		this.currentEnvironmentId = DEFAULT_VIEWER_ENVIRONMENT_ID;
		this.currentColorSchemeId = DEFAULT_COLOR_SCHEME_ID;
		this.objectColorsEnabled = false;
		this.selectedColorSchemeId = DEFAULT_BUILDING_COLOR_SCHEME_ID;
		this.hasAppliedPostLoadEnvironment = false;
		(
			window as unknown as {
				viewerEnvironmentCaptureHome?: () => number[];
			}
		).viewerEnvironmentCaptureHome = undefined;
		return true;
	}

	private isCadBimEnvironmentActive(): boolean {
		return this.currentEnvironmentId === DEFAULT_VIEWER_ENVIRONMENT_ID;
	}

	private scheduleVisualsRefresh(): void {
		if (!this.isCadBimEnvironmentActive()) return;
		if (this.visualsDebounceTimer !== undefined) {
			clearTimeout(this.visualsDebounceTimer);
		}
		this.visualsDebounceTimer = setTimeout(() => {
			this.visualsDebounceTimer = undefined;
			if (!isViewerModelReady(this.viewer)) return;
			applyCadBimVisuals(this.viewer);
			this.reapplyColorSchemeIfActive();
		}, VISUALS_DEBOUNCE_MS);
	}

	private reapplyColorSchemeIfActive(): void {
		if (!this.objectColorsEnabled) return;
		try {
			applyBuildingColorScheme(this.viewer, this.selectedColorSchemeId);
		} catch (error) {
			console.error('ViewerEnvironment: color scheme re-apply failed', error);
		}
	}

	private applyEnvironmentWhenModelReady(): void {
		if (!this.isCadBimEnvironmentActive()) return;
		if (this.hasAppliedPostLoadEnvironment) {
			if (isViewerModelReady(this.viewer)) {
				applyCadBimVisuals(this.viewer);
			}
			return;
		}
		this.hasAppliedPostLoadEnvironment = true;
		try {
			applyViewerEnvironment(this.viewer, this.currentEnvironmentId);
			applyCadBimHomeView(this.viewer, { once: true, skipTransition: true });
			this.viewer.navigation.setRequestFitToView(true);
		} catch (error) {
			console.error('ViewerEnvironment: initial apply failed', error);
		}
	}

	private buildUi(): void {
		const toolbar = this.viewer.getToolbar(true);
		if (!toolbar) return;

		this.button = new Autodesk.Viewing.UI.Button(TOOLBAR_BUTTON_ID);
		this.button.setToolTip('Viewer environment');
		setEnvironmentToolbarIcon(this.button.icon);
		this.button.onClick = (): void => this.toggleFlyout();

		this.colorSchemeButton = new Autodesk.Viewing.UI.Button(COLOR_SCHEME_BUTTON_ID);
		this.colorSchemeButton.setToolTip('Building color scheme');
		setColorSchemeToolbarIcon(this.colorSchemeButton.icon);
		this.colorSchemeButton.onClick = (): void => this.toggleColorSchemeFlyout();

		this.sectionBoxButton = new Autodesk.Viewing.UI.Button(SECTION_BOX_BUTTON_ID);
		this.sectionBoxButton.setToolTip('Section box');
		setSectionBoxToolbarIcon(this.sectionBoxButton.icon);
		this.sectionBoxButton.onClick = (): void => {
			void this.onSectionBoxToggle();
		};

		const settingsTools = toolbar.getControl(
			Autodesk.Viewing.TOOLBAR.SETTINGSTOOLSID
		) as Autodesk.Viewing.UI.ControlGroup | null;
		const parent = (settingsTools ?? toolbar) as Autodesk.Viewing.UI.ControlGroup;
		this.toolbarControlsParent = parent;

		parent.addControl(this.button);
		parent.addControl(this.colorSchemeButton);
		parent.addControl(this.sectionBoxButton);
	}

	private async onSectionBoxToggle(): Promise<void> {
		try {
			const enabled = await toggleSectionBox(this.viewer);
			this.sectionBoxActive = enabled;
			this.updateSectionBoxButtonState();
			this.syncNativeSectionToolbarState();
		} catch (error) {
			console.error('ViewerEnvironment: section box toggle failed', error);
		}
	}

	private syncNativeSectionToolbarState(): void {
		const ui = this.viewer.getExtension('Autodesk.SmartSectionUI') as {
			sectionToolButton?: Autodesk.Viewing.UI.Button;
		} | null;
		const nativeButton = ui?.sectionToolButton;
		if (!nativeButton) return;
		const active = isSectionBoxActive(this.viewer);
		nativeButton.setState(
			active
				? Autodesk.Viewing.UI.Button.State.ACTIVE
				: Autodesk.Viewing.UI.Button.State.INACTIVE
		);
	}

	private updateSectionBoxButtonState(): void {
		if (!this.sectionBoxButton) return;
		if (this.sectionBoxActive) {
			this.sectionBoxButton.setState(Autodesk.Viewing.UI.Button.State.ACTIVE);
		} else {
			this.sectionBoxButton.setState(Autodesk.Viewing.UI.Button.State.INACTIVE);
		}
	}

	private removeUi(): void {
		const parent = this.toolbarControlsParent;
		if (parent) {
			parent.removeControl(TOOLBAR_BUTTON_ID);
			parent.removeControl(COLOR_SCHEME_BUTTON_ID);
			parent.removeControl(SECTION_BOX_BUTTON_ID);
		}
		this.toolbarControlsParent = undefined;
		this.button = undefined;
		this.sectionBoxButton = undefined;
		this.colorSchemeButton = undefined;
	}

	private toggleFlyout(): void {
		if (this.flyout) {
			this.closeFlyout();
		} else {
			this.closeColorSchemeFlyout();
			this.openFlyout();
		}
	}

	private toggleColorSchemeFlyout(): void {
		if (this.colorSchemeFlyout) {
			this.closeColorSchemeFlyout();
		} else {
			this.closeFlyout();
			this.openColorSchemeFlyout();
		}
	}

	private openFlyout(): void {
		if (!this.button) return;

		const flyout = document.createElement('div');
		flyout.className = FLYOUT_CLASS;
		flyout.setAttribute('role', 'menu');
		flyout.innerHTML = `
			<div class="${FLYOUT_CLASS}__title">Environment</div>
			${VIEWER_ENVIRONMENTS.map(
				option => `
				<button
					type="button"
					role="menuitemradio"
					class="${FLYOUT_CLASS}__option"
					data-environment="${option.id}"
					aria-checked="${option.id === this.currentEnvironmentId}"
				>
					<span class="${FLYOUT_CLASS}__option-radio" aria-hidden="true"></span>
					<span class="${FLYOUT_CLASS}__option-label">${option.label}</span>
				</button>
			`
			).join('')}
		`;

		flyout.addEventListener('click', this.onFlyoutClick);
		this.viewer.container.appendChild(flyout);
		this.flyout = flyout;

		this.positionFlyoutNearButton(this.button, this.flyout);

		this.documentClickHandler = (event: MouseEvent): void => {
			if (!this.flyout) return;
			const target = event.target as Node;
			const buttonEl = this.getButtonElement(this.button);
			if (this.flyout.contains(target) || (buttonEl && buttonEl.contains(target))) {
				return;
			}
			this.closeFlyout();
		};
		this.bindDocumentClickHandler(this.documentClickHandler);

		this.button.setState(Autodesk.Viewing.UI.Button.State.ACTIVE);
	}

	private openColorSchemeFlyout(): void {
		if (!this.colorSchemeButton) return;

		const flyout = document.createElement('div');
		flyout.className = FLYOUT_CLASS;
		flyout.setAttribute('role', 'menu');
		const schemeOptions = BUILDING_COLOR_SCHEMES.map(
			scheme => `
				<button
					type="button"
					role="menuitemradio"
					class="${FLYOUT_CLASS}__option ${FLYOUT_CLASS}__option--scheme"
					data-scheme="${scheme.id}"
					aria-label="${scheme.label}"
					aria-checked="${this.objectColorsEnabled && scheme.id === this.selectedColorSchemeId}"
					${this.objectColorsEnabled ? '' : 'disabled'}
				>
					<span class="${FLYOUT_CLASS}__swatches" aria-hidden="true">
						${paletteSwatchColors(scheme.colors)
							.map(hex => `<span class="${FLYOUT_CLASS}__swatch" style="background-color:${hex}"></span>`)
							.join('')}
					</span>
				</button>
			`
		).join('');

		flyout.innerHTML = `
			<button
				type="button"
				class="${FLYOUT_CLASS}__toggle"
				data-action="toggle-object-colors"
				aria-pressed="${this.objectColorsEnabled}"
			>
				<span class="${FLYOUT_CLASS}__toggle-switch" aria-hidden="true"></span>
				<span class="${FLYOUT_CLASS}__option-label">Turn on object colors</span>
			</button>
			<div class="${FLYOUT_CLASS}__palettes${this.objectColorsEnabled ? '' : ` ${FLYOUT_CLASS}__palettes--disabled`}">
				${schemeOptions}
			</div>
		`;

		flyout.addEventListener('click', this.onColorSchemeFlyoutClick);
		this.viewer.container.appendChild(flyout);
		this.colorSchemeFlyout = flyout;

		this.positionFlyoutNearButton(this.colorSchemeButton, flyout);

		this.colorSchemeDocumentClickHandler = (event: MouseEvent): void => {
			if (!this.colorSchemeFlyout) return;
			const target = event.target as Node;
			const buttonEl = this.getButtonElement(this.colorSchemeButton);
			if (this.colorSchemeFlyout.contains(target) || (buttonEl && buttonEl.contains(target))) {
				return;
			}
			this.closeColorSchemeFlyout();
		};
		this.bindDocumentClickHandler(this.colorSchemeDocumentClickHandler);

		this.colorSchemeButton.setState(Autodesk.Viewing.UI.Button.State.ACTIVE);
	}

	private closeColorSchemeFlyout(): void {
		if (this.colorSchemeFlyout) {
			this.colorSchemeFlyout.removeEventListener('click', this.onColorSchemeFlyoutClick);
			this.colorSchemeFlyout.remove();
			this.colorSchemeFlyout = undefined;
		}
		if (this.colorSchemeDocumentClickHandler) {
			document.removeEventListener('mousedown', this.colorSchemeDocumentClickHandler);
			this.colorSchemeDocumentClickHandler = undefined;
		}
		this.colorSchemeButton?.setState(Autodesk.Viewing.UI.Button.State.INACTIVE);
		this.updateColorSchemeButtonState();
	}

	private bindDocumentClickHandler(handler: (event: MouseEvent) => void): void {
		setTimeout(() => {
			document.addEventListener('mousedown', handler);
		}, 0);
	}

	private closeFlyout(): void {
		if (this.flyout) {
			this.flyout.removeEventListener('click', this.onFlyoutClick);
			this.flyout.remove();
			this.flyout = undefined;
		}
		if (this.documentClickHandler) {
			document.removeEventListener('mousedown', this.documentClickHandler);
			this.documentClickHandler = undefined;
		}
		this.button?.setState(Autodesk.Viewing.UI.Button.State.INACTIVE);
	}

	private positionFlyoutNearButton(button: Autodesk.Viewing.UI.Button, flyout: HTMLDivElement): void {
		const buttonEl = this.getButtonElement(button);
		if (!buttonEl) return;
		const buttonRect = buttonEl.getBoundingClientRect();
		const containerRect = this.viewer.container.getBoundingClientRect();
		const flyoutRect = flyout.getBoundingClientRect();

		const top = buttonRect.top - containerRect.top - flyoutRect.height - 8;
		let left = buttonRect.left - containerRect.left + buttonRect.width / 2 - flyoutRect.width / 2;
		const minLeft = 8;
		const maxLeft = containerRect.width - flyoutRect.width - 8;
		left = Math.max(minLeft, Math.min(maxLeft, left));

		flyout.style.top = `${top}px`;
		flyout.style.left = `${left}px`;
	}

	private onColorSchemeFlyoutClick = (event: MouseEvent): void => {
		const target = (event.target as HTMLElement).closest<HTMLElement>(
			`[data-action="toggle-object-colors"], .${FLYOUT_CLASS}__option--scheme`
		);
		if (!target) return;

		if (target.dataset.action === 'toggle-object-colors') {
			this.setObjectColorsEnabled(!this.objectColorsEnabled);
			this.refreshColorSchemeFlyout();
			return;
		}

		const schemeId = target.dataset.scheme as ActiveColorSchemeId | undefined;
		if (!schemeId || !this.objectColorsEnabled) return;

		this.selectedColorSchemeId = schemeId;
		this.applyObjectColors();
		this.refreshColorSchemeFlyout();
	};

	private refreshColorSchemeFlyout(): void {
		if (!this.colorSchemeFlyout) return;
		const wasOpen = true;
		this.closeColorSchemeFlyout();
		if (wasOpen) {
			this.openColorSchemeFlyout();
		}
	}

	private setObjectColorsEnabled(enabled: boolean): void {
		this.objectColorsEnabled = enabled;
		this.currentColorSchemeId = enabled ? this.selectedColorSchemeId : 'none';
		this.updateColorSchemeButtonState();
		if (enabled) {
			this.applyObjectColors();
		} else {
			try {
				clearBuildingColorScheme(this.viewer);
			} catch (error) {
				console.error('ViewerEnvironment: clear object colors failed', error);
			}
		}
	}

	private applyObjectColors(): void {
		this.currentColorSchemeId = this.selectedColorSchemeId;
		this.updateColorSchemeButtonState();
		try {
			if (!applyBuildingColorScheme(this.viewer, this.selectedColorSchemeId)) {
				console.warn('ViewerEnvironment: color scheme not applied', this.selectedColorSchemeId);
			}
		} catch (error) {
			console.error('ViewerEnvironment: color scheme apply failed', error);
		}
	}

	private updateColorSchemeButtonState(): void {
		if (!this.colorSchemeButton) return;
		if (this.objectColorsEnabled) {
			this.colorSchemeButton.setState(Autodesk.Viewing.UI.Button.State.ACTIVE);
		} else if (!this.colorSchemeFlyout) {
			this.colorSchemeButton.setState(Autodesk.Viewing.UI.Button.State.INACTIVE);
		}
	}

	private onFlyoutClick = (event: MouseEvent): void => {
		const target = (event.target as HTMLElement).closest<HTMLElement>(`.${FLYOUT_CLASS}__option`);
		if (!target) return;
		const environmentId = target.dataset.environment as ViewerEnvironmentId | undefined;
		if (!environmentId) return;
		this.closeFlyout();
		this.setEnvironment(environmentId);
	};

	private setEnvironment(environmentId: ViewerEnvironmentId): void {
		const unchanged = environmentId === this.currentEnvironmentId;
		this.currentEnvironmentId = environmentId;
		if (unchanged) {
			if (environmentId === 'cad-bim-neutral') {
				try {
					applyCadBimVisuals(this.viewer);
				} catch (error) {
					console.error('ViewerEnvironment: refresh visuals failed', error);
				}
			}
			return;
		}
		try {
			applyViewerEnvironment(this.viewer, environmentId);
			if (environmentId === 'cad-bim-neutral') {
				applyCadBimHomeView(this.viewer, { once: true, skipTransition: true });
			}
		} catch (error) {
			console.error('ViewerEnvironment: applyViewerEnvironment failed', error);
		}
	}

	private getButtonElement(button?: Autodesk.Viewing.UI.Button): HTMLElement | null {
		if (!button) return null;
		return (button as unknown as { container?: HTMLElement }).container ?? null;
	}
}

Autodesk.Viewing.theExtensionManager.registerExtension(VIEWER_ENVIRONMENT_EXTENSION_ID, ViewerEnvironmentExtension);

export default ViewerEnvironmentExtension;
