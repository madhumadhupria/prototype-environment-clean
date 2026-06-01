import { applyCadBimBackdrop, applyCadBimVisuals, applyViewerEnvironment } from './applyViewerEnvironment';
import { applyBuildingColorScheme, clearBuildingColorScheme } from './viewerBuildingColorScheme';
import {
	BuildingColorSchemeId,
	DEFAULT_BUILDING_COLOR_SCHEME_ID,
} from './viewerBuildingPalettes';
import { PrototypeStripUi, PROTOTYPE_STRIP_ROOT_ID } from './prototypeStripUi';
import type { SectionPrototypeId } from './prototypeStripSpec';
import { wireNativeSectionToolbar } from './lmvNativeSection';
import { deactivateSectionBox, activateSectionBox, isSectionBoxActive, toggleSectionBox } from './viewerEnvironmentSection';
import { deactivateRotateGizmo, isRotateGizmoActive, toggleRotateGizmo } from './viewerEnvironmentRotate';
import { ensureStylesInjected } from './styles';
import { isViewerModelReady } from './viewerEnvironmentLifecycle';
import { applyCadBimHomeView, captureCadBimHomeViewArray } from './viewerEnvironmentCamera';
import { executeAfterGeometryLoaded } from './viewerEnvironmentEvents';
import { collectLowDetailExcludedDbIds, clearLowDetailContentVisibility } from './viewerRenderingDetailContent';
import {
	applyRenderingDetailLevel,
	DEFAULT_RENDERING_DETAIL_LEVEL,
	RenderingDetailLevel,
} from './viewerRenderingDetails';
import { DEFAULT_VIEWER_ENVIRONMENT_ID, ViewerEnvironmentId } from './viewerEnvironments';

export const VIEWER_ENVIRONMENT_EXTENSION_ID = 'Autodesk.Priyam.ViewerEnvironment';

const VISUALS_DEBOUNCE_MS = 400;
const DEFAULT_COLOR_SCHEME_ID: BuildingColorSchemeId = 'none';

type ActiveColorSchemeId = Exclude<BuildingColorSchemeId, 'none'>;

class ViewerEnvironmentExtension extends Autodesk.Viewing.Extension {
	private prototypeStrip: PrototypeStripUi | undefined;
	private sectionBoxActive = false;
	private rotateGizmoActive = false;
	private currentEnvironmentId: ViewerEnvironmentId = DEFAULT_VIEWER_ENVIRONMENT_ID;
	private currentColorSchemeId: BuildingColorSchemeId = DEFAULT_COLOR_SCHEME_ID;
	private objectColorsEnabled = false;
	private selectedColorSchemeId: ActiveColorSchemeId = DEFAULT_BUILDING_COLOR_SCHEME_ID;
	private selectedRenderingDetailLevel: RenderingDetailLevel = DEFAULT_RENDERING_DETAIL_LEVEL;
	private selectedSectionPrototypeId: SectionPrototypeId | null = null;
	private hasAppliedPostLoadEnvironment = false;
	private visualsDebounceTimer: ReturnType<typeof setTimeout> | undefined;
	private geometryLoadedHandler: (() => void) | undefined;
	private extensionLoadedHandler: ((event: { extensionId?: string }) => void) | undefined;
	private unwireNativeSectionToolbar: (() => void) | undefined;

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
		this.buildPrototypeStrip();

		this.geometryLoadedHandler = (): void => this.scheduleVisualsRefresh();
		this.viewer.addEventListener(Autodesk.Viewing.GEOMETRY_LOADED_EVENT, this.geometryLoadedHandler);

		if (this.isCadBimEnvironmentActive()) {
			executeAfterGeometryLoaded(this.viewer, () => this.applyEnvironmentWhenModelReady());
		}
		executeAfterGeometryLoaded(this.viewer, () => this.reapplyColorSchemeIfActive());
		executeAfterGeometryLoaded(this.viewer, () => this.applyRenderingDetails());

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
		deactivateRotateGizmo(this.viewer);
		this.sectionBoxActive = false;
		this.rotateGizmoActive = false;
		this.removePrototypeStrip();
		clearBuildingColorScheme(this.viewer);
		clearLowDetailContentVisibility(this.viewer);
		applyViewerEnvironment(this.viewer, 'acc-default');
		this.currentEnvironmentId = DEFAULT_VIEWER_ENVIRONMENT_ID;
		this.currentColorSchemeId = DEFAULT_COLOR_SCHEME_ID;
		this.objectColorsEnabled = false;
		this.selectedColorSchemeId = DEFAULT_BUILDING_COLOR_SCHEME_ID;
		this.selectedRenderingDetailLevel = DEFAULT_RENDERING_DETAIL_LEVEL;
		this.selectedSectionPrototypeId = null;
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
		if (this.visualsDebounceTimer !== undefined) {
			clearTimeout(this.visualsDebounceTimer);
		}
		this.visualsDebounceTimer = setTimeout(() => {
			this.visualsDebounceTimer = undefined;
			if (!isViewerModelReady(this.viewer)) return;
			if (this.isCadBimEnvironmentActive()) {
				applyCadBimVisuals(this.viewer);
				this.reapplyColorSchemeIfActive();
				this.applyRenderingDetails();
				return;
			}
			if (this.currentEnvironmentId === 'acc-default') {
				applyViewerEnvironment(this.viewer, 'acc-default');
			}
		}, VISUALS_DEBOUNCE_MS);
	}

	private reapplyColorSchemeIfActive(): void {
		if (!this.objectColorsEnabled) return;
		try {
			applyBuildingColorScheme(this.viewer, this.selectedColorSchemeId, this.getColorSchemeApplyOptions());
		} catch (error) {
			console.error('ViewerEnvironment: color scheme re-apply failed', error);
		}
	}

	private getColorSchemeApplyOptions(): { excludeDbIds?: ReadonlySet<number> } {
		if (this.selectedRenderingDetailLevel !== 'low') {
			return {};
		}
		return { excludeDbIds: new Set(collectLowDetailExcludedDbIds(this.viewer)) };
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

	private buildPrototypeStrip(): void {
		if (this.prototypeStrip) return;

		const host =
			document.getElementById(PROTOTYPE_STRIP_ROOT_ID) ?? this.viewer.container;

		this.prototypeStrip = new PrototypeStripUi(
			host,
			{
				environmentId: this.currentEnvironmentId,
				sectionPrototypeId: this.selectedSectionPrototypeId,
				renderingDetailLevel: this.selectedRenderingDetailLevel,
				sectionActive: this.sectionBoxActive,
				rotateActive: this.rotateGizmoActive,
			},
			{
				onEnvironmentSelect: (environmentId): void => {
					this.setEnvironment(environmentId);
					this.syncPrototypeStripState();
				},
				onSectionSelect: (sectionId): void => {
					void this.onSectionPrototypeSelect(sectionId);
				},
				onSectionClear: (): void => {
					void this.onSectionClearAll();
				},
				onRenderingDetailSelect: (level): void => {
					this.selectedRenderingDetailLevel = level;
					this.applyRenderingDetails();
					this.syncPrototypeStripState();
				},
				onRotateToggle: (): void => {
					void this.onRotateToggle();
				},
			}
		);
	}

	private removePrototypeStrip(): void {
		this.prototypeStrip?.destroy();
		this.prototypeStrip = undefined;
		const root = document.getElementById(PROTOTYPE_STRIP_ROOT_ID);
		root?.replaceChildren();
	}

	private syncPrototypeStripState(): void {
		this.prototypeStrip?.updateState({
			environmentId: this.currentEnvironmentId,
			sectionPrototypeId: this.selectedSectionPrototypeId,
			renderingDetailLevel: this.selectedRenderingDetailLevel,
			sectionActive: this.sectionBoxActive,
			rotateActive: this.rotateGizmoActive,
		});
	}

	private async onRotateToggle(): Promise<void> {
		try {
			const enabling = !isRotateGizmoActive(this.viewer);
			if (enabling && this.sectionBoxActive) {
				await this.onSectionClearAll();
			}

			const enabled = toggleRotateGizmo(this.viewer, enabling);
			this.rotateGizmoActive = enabled;
			this.syncPrototypeStripState();
		} catch (error) {
			console.error('ViewerEnvironment: rotate gizmo toggle failed', error);
		}
	}

	private async onSectionPrototypeSelect(sectionId: SectionPrototypeId): Promise<void> {
		if (this.rotateGizmoActive) {
			deactivateRotateGizmo(this.viewer);
			this.rotateGizmoActive = false;
		}
		const switchingTool =
			this.sectionBoxActive &&
			this.selectedSectionPrototypeId !== null &&
			this.selectedSectionPrototypeId !== sectionId;

		this.selectedSectionPrototypeId = sectionId;

		if (switchingTool) {
			await deactivateSectionBox(this.viewer);
			this.sectionBoxActive = false;
		}

		if (!this.sectionBoxActive) {
			const enabled = await activateSectionBox(this.viewer, sectionId);
			this.sectionBoxActive = enabled;
		}

		this.syncPrototypeStripState();
		this.syncNativeSectionToolbarState();
	}

	private async onSectionClearAll(): Promise<void> {
		if (!this.sectionBoxActive) return;

		try {
			await deactivateSectionBox(this.viewer);
			this.sectionBoxActive = false;
			this.selectedSectionPrototypeId = null;
			this.syncPrototypeStripState();
			this.syncNativeSectionToolbarState();
		} catch (error) {
			console.error('ViewerEnvironment: section clear failed', error);
		}
	}

	private async onSectionBoxToggle(): Promise<void> {
		try {
			if (this.rotateGizmoActive) {
				deactivateRotateGizmo(this.viewer);
				this.rotateGizmoActive = false;
			}
			const mode = this.selectedSectionPrototypeId ?? 'green-box';
			const enabled = await toggleSectionBox(this.viewer, undefined, mode);
			this.sectionBoxActive = enabled;
			if (enabled) {
				if (!this.selectedSectionPrototypeId) {
					this.selectedSectionPrototypeId = 'green-box';
				}
			} else {
				this.selectedSectionPrototypeId = null;
			}
			this.syncPrototypeStripState();
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

	private applyRenderingDetails(): void {
		try {
			applyRenderingDetailLevel(this.viewer, this.selectedRenderingDetailLevel);
			if (this.objectColorsEnabled) {
				this.applyObjectColors();
			}
		} catch (error) {
			console.error('ViewerEnvironment: rendering details apply failed', error);
		}
	}

	private applyObjectColors(): void {
		this.currentColorSchemeId = this.selectedColorSchemeId;
		try {
			if (!applyBuildingColorScheme(this.viewer, this.selectedColorSchemeId, this.getColorSchemeApplyOptions())) {
				console.warn('ViewerEnvironment: color scheme not applied', this.selectedColorSchemeId);
			}
		} catch (error) {
			console.error('ViewerEnvironment: color scheme apply failed', error);
		}
	}

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
}

Autodesk.Viewing.theExtensionManager.registerExtension(VIEWER_ENVIRONMENT_EXTENSION_ID, ViewerEnvironmentExtension);

export default ViewerEnvironmentExtension;
