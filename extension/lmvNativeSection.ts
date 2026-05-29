/**
 * ACC ships SmartSection and legacy section tools. Our custom Priyam section box
 * must own cut planes and pointer handling — clear native state before activating.
 */

const SMART_SECTION_EXTENSION_ID = 'Autodesk.SmartSection';
const SMART_SECTION_UI_EXTENSION_ID = 'Autodesk.SmartSectionUI';
const LEGACY_SECTION_TOOL_SET = 'Autodesk.Viewing.Extension.Section.SectionTool';
const SMART_SECTION_BOX_TOOL = 'SectionBoxTool';
const SMART_SECTION_TOOL = 'SmartSectionTool';
const SMART_SECTION_OVERLAY_KEY = 'smartGizmo';
const NATIVE_SECTION_TOOLBAR_ID = 'toolbar-sectionTool';
const SMART_SECTION_ACTIVATED_EVENT = 'SmartSection.Activated';
import { SECTION_BOX_OVERLAY_SCENE } from './viewerEnvironmentSpec';

const PRIYAM_SECTION_ROOT_NAME = 'priyam-section-box';

interface SmartSectionExtension {
	resetState?: (resetAllSectionPlanes?: boolean) => void;
	deactivate?: (analyticsFrom?: string) => void;
	isActive?: () => boolean;
	setGizmoEnabled?: (enabled: boolean) => void;
	activate?: (restoreSession?: boolean) => void;
	addSectionBox?: (...args: unknown[]) => unknown;
	setSectionBox?: (...args: unknown[]) => unknown;
	events?: {
		addEventListener: (type: string, listener: () => void) => void;
		removeEventListener: (type: string, listener: () => void) => void;
	};
	__priyamGreenSectionPatched?: boolean;
}

type SectionToggleHandler = () => void;

/** True for the Priyam section box root and all of its descendants. */
const isUnderPriyamSectionBox = (object: THREE.Object3D): boolean => {
	let node: THREE.Object3D | null = object;
	while (node) {
		if (node.name === PRIYAM_SECTION_ROOT_NAME) return true;
		node = node.parent;
	}
	return false;
};

const isNativeSectionVisual = (object: THREE.Object3D): boolean => {
	const ctor = object.constructor?.name ?? '';
	if (ctor === 'OneDGizmo' || ctor.includes('TransformControls')) return true;
	const name = (object.name ?? '').toLowerCase();
	if (!name) return false;
	if (name.includes('priyam')) return false;
	return (
		name.includes('section') ||
		name === 'controlledobject' ||
		name.includes('gizmo') ||
		name.includes('hitbox')
	);
};

/** Remove native section arrows, hitboxes, and cap meshes from scene + overlays. */
const stripNativeSectionVisuals = (viewer: Autodesk.Viewing.GuiViewer3D): void => {
	const scenes: THREE.Object3D[] = [viewer.impl.scene];
	for (const [overlayName, entry] of Object.entries(viewer.impl.overlayScenes)) {
		if (overlayName === SECTION_BOX_OVERLAY_SCENE) continue;
		const overlayScene = (entry as { scene?: THREE.Object3D })?.scene;
		if (overlayScene) scenes.push(overlayScene);
	}

	for (const scene of scenes) {
		const toRemove: THREE.Object3D[] = [];
		scene.traverse(child => {
			if (isUnderPriyamSectionBox(child)) return;
			if (isNativeSectionVisual(child)) toRemove.push(child);
		});
		for (const child of toRemove) {
			child.visible = false;
			child.parent?.remove(child);
		}
	}
};

/** SmartSection cap meshes live on impl.scene as "section3D" — can appear as a grey slab. */
const removeSmartSectionCapMeshes = (viewer: Autodesk.Viewing.GuiViewer3D): void => {
	const mainScene = viewer.impl.scene;
	const cap3d = mainScene.getObjectByName('section3D');
	if (cap3d) mainScene.remove(cap3d);
	const sceneAfter = (viewer.impl as { sceneAfter?: THREE.Scene }).sceneAfter;
	const cap2d = sceneAfter?.getObjectByName('section2D');
	if (cap2d && sceneAfter) sceneAfter.remove(cap2d);
};

const hideOverlaySceneContents = (viewer: Autodesk.Viewing.GuiViewer3D, sceneName: string): void => {
	const scene = viewer.impl.overlayScenes[sceneName];
	if (!scene) return;
	scene.traverse(child => {
		child.visible = false;
	});
	viewer.impl.clearOverlay(sceneName);
};

const deactivateNativeSectionTools = (viewer: Autodesk.Viewing.GuiViewer3D): void => {
	const toolController = viewer.toolController as {
		isToolActivated?: (name: string) => boolean;
		deactivateTool?: (name: string) => void;
	};
	for (const toolName of [SMART_SECTION_BOX_TOOL, SMART_SECTION_TOOL]) {
		if (toolController.isToolActivated?.(toolName)) {
			toolController.deactivateTool?.(toolName);
		}
	}
};

/** Hide SmartSection arrow gizmos (TransformControls) and related overlay meshes. */
export const suppressNativeSectionGizmos = (viewer: Autodesk.Viewing.GuiViewer3D): void => {
	try {
		const smart = viewer.getExtension(SMART_SECTION_EXTENSION_ID) as SmartSectionExtension | null;
		if (smart) {
			smart.setGizmoEnabled?.(false);
			if (smart.isActive?.()) {
				smart.deactivate?.();
			}
			smart.resetState?.(true);
		}

		removeSmartSectionCapMeshes(viewer);
		hideOverlaySceneContents(viewer, SMART_SECTION_OVERLAY_KEY);
		stripNativeSectionVisuals(viewer);

		const impl = viewer.impl;
		impl.setCutPlaneSet(LEGACY_SECTION_TOOL_SET, undefined, false);
		impl.setCutPlaneSet('__set_view', undefined, false);
		(impl as { updateCutPlanes?: () => void }).updateCutPlanes?.();

		deactivateNativeSectionTools(viewer);

		const ui = viewer.getExtension(SMART_SECTION_UI_EXTENSION_ID) as {
			sectionToolButton?: Autodesk.Viewing.UI.Button;
		} | null;
		ui?.sectionToolButton?.setState(Autodesk.Viewing.UI.Button.State.INACTIVE);
	} catch (error) {
		console.warn('ViewerEnvironment: suppress native section gizmos failed', error);
	}
};

/** @deprecated Use suppressNativeSectionGizmos */
export const suspendNativeSectioning = suppressNativeSectionGizmos;

const hijackNativeSectionButton = (
	viewer: Autodesk.Viewing.GuiViewer3D,
	onToggle: SectionToggleHandler
): (() => void) | undefined => {
	const toolbar = viewer.getToolbar?.(true);
	const modelTools = toolbar?.getControl(
		Autodesk.Viewing.TOOLBAR.MODELTOOLSID
	) as Autodesk.Viewing.UI.ControlGroup | null;
	const nativeButton = modelTools?.getControl(
		NATIVE_SECTION_TOOLBAR_ID
	) as Autodesk.Viewing.UI.Button | undefined;
	if (!nativeButton) return undefined;

	const previousOnClick = nativeButton.onClick;
	nativeButton.onClick = (): void => {
		suppressNativeSectionGizmos(viewer);
		onToggle();
	};
	nativeButton.setToolTip('Section box');

	return () => {
		nativeButton.onClick = previousOnClick;
	};
};

const hijackSmartSectionUiButton = (
	viewer: Autodesk.Viewing.GuiViewer3D,
	onToggle: SectionToggleHandler
): (() => void) | undefined => {
	const ui = viewer.getExtension(SMART_SECTION_UI_EXTENSION_ID) as {
		sectionToolButton?: Autodesk.Viewing.UI.Button;
	} | null;
	const nativeButton = ui?.sectionToolButton;
	if (!nativeButton) return undefined;

	const previousOnClick = nativeButton.onClick;
	nativeButton.onClick = (): void => {
		suppressNativeSectionGizmos(viewer);
		onToggle();
	};
	nativeButton.setToolTip('Section box');

	return () => {
		nativeButton.onClick = previousOnClick;
	};
};

/** Block SmartSection.activate / addSectionBox — route to the green Priyam box instead. */
const patchSmartSectionExtension = (
	viewer: Autodesk.Viewing.GuiViewer3D,
	onToggle: SectionToggleHandler
): (() => void) | undefined => {
	const smart = viewer.getExtension(SMART_SECTION_EXTENSION_ID) as SmartSectionExtension | null;
	if (!smart || smart.__priyamGreenSectionPatched) return undefined;

	const originalActivate = smart.activate?.bind(smart);
	const originalAddSectionBox = smart.addSectionBox?.bind(smart);
	const originalSetSectionBox = smart.setSectionBox?.bind(smart);

	const routeToGreenBox = (): void => {
		suppressNativeSectionGizmos(viewer);
		onToggle();
	};

	smart.activate = (): void => {
		routeToGreenBox();
	};
	smart.addSectionBox = (): unknown => {
		routeToGreenBox();
		return undefined;
	};
	smart.setSectionBox = (): void => {
		routeToGreenBox();
	};

	smart.__priyamGreenSectionPatched = true;

	return () => {
		if (originalActivate) smart.activate = originalActivate;
		if (originalAddSectionBox) smart.addSectionBox = originalAddSectionBox;
		if (originalSetSectionBox) smart.setSectionBox = originalSetSectionBox;
		delete smart.__priyamGreenSectionPatched;
	};
};

/**
 * Route the default ACC "Section" toolbar button to the custom green section box
 * instead of SmartSection arrow gizmos. Re-applies when SmartSection UI loads
 * (it overwrites toolbar handlers after us).
 */
export const wireNativeSectionToolbar = (
	viewer: Autodesk.Viewing.GuiViewer3D,
	onToggle: SectionToggleHandler,
	isCustomSectionActive?: () => boolean
): (() => void) => {
	const cleanups: Array<() => void> = [];
	let toolbarCleanup: (() => void) | undefined;
	let uiCleanup: (() => void) | undefined;
	let patchCleanup: (() => void) | undefined;

	const rewire = (): void => {
		toolbarCleanup?.();
		uiCleanup?.();
		patchCleanup?.();
		toolbarCleanup = hijackNativeSectionButton(viewer, onToggle);
		uiCleanup = hijackSmartSectionUiButton(viewer, onToggle);
		patchCleanup = patchSmartSectionExtension(viewer, onToggle);
	};

	rewire();
	cleanups.push(() => {
		toolbarCleanup?.();
		uiCleanup?.();
		patchCleanup?.();
	});

	if (!viewer.getToolbar?.(true)?.getControl?.(Autodesk.Viewing.TOOLBAR.MODELTOOLSID)) {
		const onToolbarCreated = (): void => {
			viewer.removeEventListener(Autodesk.Viewing.TOOLBAR_CREATED_EVENT, onToolbarCreated);
			rewire();
		};
		viewer.addEventListener(Autodesk.Viewing.TOOLBAR_CREATED_EVENT, onToolbarCreated);
		cleanups.push(() => {
			viewer.removeEventListener(Autodesk.Viewing.TOOLBAR_CREATED_EVENT, onToolbarCreated);
		});
	}

	const onExtensionLoaded = (event: { extensionId?: string }): void => {
		if (
			event.extensionId === SMART_SECTION_EXTENSION_ID ||
			event.extensionId === SMART_SECTION_UI_EXTENSION_ID
		) {
			rewire();
		}
	};
	viewer.addEventListener(Autodesk.Viewing.EXTENSION_LOADED_EVENT, onExtensionLoaded);
	cleanups.push(() => {
		viewer.removeEventListener(Autodesk.Viewing.EXTENSION_LOADED_EVENT, onExtensionLoaded);
	});

	const smart = viewer.getExtension(SMART_SECTION_EXTENSION_ID) as SmartSectionExtension | null;
	const onSmartSectionActivated = (): void => {
		suppressNativeSectionGizmos(viewer);
		if (isCustomSectionActive?.()) return;
		onToggle();
	};
	if (smart?.events) {
		smart.events.addEventListener(SMART_SECTION_ACTIVATED_EVENT, onSmartSectionActivated);
		cleanups.push(() => {
			smart.events?.removeEventListener(SMART_SECTION_ACTIVATED_EVENT, onSmartSectionActivated);
		});
	}

	// SmartSectionUI often loads after ViewerEnvironment — retry hijack.
	const retryDelays = [0, 250, 750, 2000, 5000];
	for (const delay of retryDelays) {
		const timer = window.setTimeout(() => rewire(), delay);
		cleanups.push(() => window.clearTimeout(timer));
	}

	return () => {
		for (const cleanup of cleanups) cleanup();
	};
};
