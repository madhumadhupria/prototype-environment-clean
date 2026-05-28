// LMV impl lighting APIs are runtime-public but omitted from forge-viewer typings.

export interface LmvImplWithLights {
	initLights?: () => void;
	amb_light?: THREE.AmbientLight;
	dir_light1?: THREE.DirectionalLight & { target: THREE.Object3D };
	scene: THREE.Scene;
	camera: THREE.Camera;
	setClearColors(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): void;
	toggleEnvMapBackground(value: boolean): void;
	toggleGroundShadow?(value: boolean): void;
	toggleGroundReflection?(value: boolean): void;
}

/** Pref keys — Boardwalk/AEC presets must not re-enable env-map background or ground effects. */
const getPrefs3D = (): {
	ENV_MAP_BACKGROUND: string;
	GROUND_REFLECTION: string;
	GROUND_SHADOW: string;
} => {
	const Prefs3D = (
		window as Window & {
			Autodesk?: { Viewing?: { Private?: { Prefs3D?: Record<string, string> } } };
		}
	).Autodesk?.Viewing?.Private?.Prefs3D;
	return {
		ENV_MAP_BACKGROUND: Prefs3D?.ENV_MAP_BACKGROUND ?? 'envMapBackground',
		GROUND_REFLECTION: Prefs3D?.GROUND_REFLECTION ?? 'groundReflection',
		GROUND_SHADOW: Prefs3D?.GROUND_SHADOW ?? 'groundShadow',
	};
};

let cadBimRenderPrefsLocked = false;

/** Prevent AEC Boardwalk / model metadata from turning env-map background or ground FX back on. */
export const lockCadBimRenderPrefs = (viewer: Autodesk.Viewing.GuiViewer3D): void => {
	if (cadBimRenderPrefsLocked) return;
	const prefs = viewer.prefs as Autodesk.Viewing.Private.Preferences & {
		tag?: (tag: string, name: string) => void;
	};
	if (!prefs?.tag) return;
	const keys = getPrefs3D();
	prefs.tag('ignore-producer', keys.ENV_MAP_BACKGROUND);
	prefs.tag('ignore-producer', keys.GROUND_REFLECTION);
	prefs.tag('ignore-producer', keys.GROUND_SHADOW);
	cadBimRenderPrefsLocked = true;
};

export const applyCadBimGroundAndEnvFlags = (viewer: Autodesk.Viewing.GuiViewer3D): void => {
	// Lock prefs only after the model has finished loading (see applyCadBimVisuals).
	if (viewer.model && typeof viewer.model.isLoadDone === 'function' && viewer.model.isLoadDone()) {
		lockCadBimRenderPrefs(viewer);
	}

	viewer.setGroundShadow(false);
	viewer.setGroundReflection(false);
	if (typeof viewer.setEnvMapBackground === 'function') {
		viewer.setEnvMapBackground(false);
	}

	const impl = getLmvImplWithLights(viewer);
	impl.toggleGroundShadow?.(false);
	impl.toggleGroundReflection?.(false);
	impl.toggleEnvMapBackground(false);
};

export interface LmvNavigationWithPivot {
	setPivotSetFlag(state: boolean): void;
}

export const getLmvImplWithLights = (viewer: Autodesk.Viewing.GuiViewer3D): LmvImplWithLights =>
	viewer.impl as unknown as LmvImplWithLights;

export const getLmvNavigation = (viewer: Autodesk.Viewing.GuiViewer3D): LmvNavigationWithPivot =>
	viewer.navigation as unknown as LmvNavigationWithPivot;
