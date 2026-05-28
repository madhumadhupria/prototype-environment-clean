import { getLmvThree } from './lmvThree';
import { getModelWorldBounds, getModelWorldUp } from './viewerEnvironmentBounds';
import { CAD_BIM_HOME_VIEW } from './viewerEnvironmentSpec';

type ViewerWithAutocam = Autodesk.Viewing.GuiViewer3D & {
	autocam?: AutocamLike;
};

type AutocamLike = {
	calculateCubeTransform: (faceString: string) => void;
	setHomeViewFrom: (camera: THREE.Camera) => void;
	getView: () => THREE.Vector3;
	sceneUpDirection: THREE.Vector3;
	sceneFrontDirection: THREE.Vector3;
	center: THREE.Vector3;
	pivot: THREE.Vector3;
	cube?: { currentFace: string };
	_camParamsFinal: {
		position: THREE.Vector3;
		up: THREE.Vector3;
		center: THREE.Vector3;
		pivot: THREE.Vector3;
		fov: number;
	};
};

const hasAppliedHomeView = new WeakMap<Autodesk.Viewing.GuiViewer3D, boolean>();

const getAutocam = (viewer: Autodesk.Viewing.GuiViewer3D): AutocamLike | undefined => {
	const withAutocam = viewer as ViewerWithAutocam;
	return withAutocam.autocam ?? (viewer.impl as { autocam?: AutocamLike }).autocam;
};

const MIN_VALUE = 1e-6;

/** Same offset logic as Autocam.calculateCubeTransform (ViewCube corner clicks). */
const buildViewCubeOffset = (
	corner: string,
	worldUp: THREE.Vector3,
	worldFront: THREE.Vector3,
	worldRight: THREE.Vector3
): THREE.Vector3 => {
	const offset = new THREE.Vector3(0, 0, 0);
	if (corner.includes('back')) offset.add(worldFront);
	if (corner.includes('front')) offset.sub(worldFront);
	if (corner.includes('top')) offset.add(worldUp);
	if (corner.includes('bottom')) offset.sub(worldUp);
	if (corner.includes('right')) offset.add(worldRight);
	if (corner.includes('left')) offset.sub(worldRight);
	return offset;
};

const resolveViewCubeUp = (
	corner: string,
	offset: THREE.Vector3,
	worldUp: THREE.Vector3,
	worldFront: THREE.Vector3,
	worldRight: THREE.Vector3,
	autocam: AutocamLike,
	camera: THREE.Camera
): THREE.Vector3 => {
	const test = offset.clone().normalize();
	if (1.0 - Math.abs(test.dot(worldUp)) >= MIN_VALUE) {
		return worldUp.clone();
	}

	const viewDir = autocam.getView().normalize();
	const optUpDir = [
		worldFront.clone(),
		worldFront.clone().negate(),
		worldRight.clone(),
		worldRight.clone().negate(),
	];
	const sign = test.dot(worldUp) > 0.0 ? 1.0 : -1.0;
	const testDir = viewDir.clone().add(camera.up.clone().multiplyScalar(sign)).normalize();

	let upDir = worldUp.clone();
	let optValue = -2.0;
	for (const candidate of optUpDir) {
		const value = testDir.dot(candidate);
		if (value > optValue) {
			optValue = value;
			upDir = candidate.multiplyScalar(sign);
		}
	}
	return upDir;
};

const seedAutocamCenter = (viewer: Autodesk.Viewing.GuiViewer3D, autocam: AutocamLike): THREE.Vector3 => {
	const box = getModelWorldBounds(viewer);
	const center = box.getCenter(new THREE.Vector3());
	autocam.center.copy(center);
	autocam.pivot.copy(center);
	return center;
};

/** ViewCube corner (e.g. front,top,left) — matches TOP + FRONT + LEFT on the compass. */
const applyViewCubeCornerHomeView = (
	viewer: Autodesk.Viewing.GuiViewer3D,
	corner: string,
	skipTransition: boolean
): boolean => {
	const autocam = getAutocam(viewer);
	if (!autocam?.calculateCubeTransform) return false;

	const center = seedAutocamCenter(viewer, autocam);
	const worldUp = autocam.sceneUpDirection.clone();
	const worldFront = autocam.sceneFrontDirection.clone();
	const worldRight = worldFront.clone().cross(worldUp).normalize();

	const offset = buildViewCubeOffset(corner, worldUp, worldFront, worldRight);
	if (offset.lengthSq() < MIN_VALUE) return false;

	const box = getModelWorldBounds(viewer);
	const size = box.getSize(new THREE.Vector3());
	let distance = autocam.getView().length();
	if (distance < 1e-3) {
		distance = Math.max(size.x, size.y, size.z) * CAD_BIM_HOME_VIEW.distanceScale;
	} else {
		distance = Math.max(distance, Math.max(size.x, size.y, size.z) * 0.5);
	}

	const camera = viewer.impl.camera;
	const up = resolveViewCubeUp(corner, offset, worldUp, worldFront, worldRight, autocam, camera);
	const position = center.clone().add(offset.clone().normalize().multiplyScalar(distance));

	viewer.impl.setViewFromCamera(
		{
			position,
			target: center.clone(),
			up,
			fov: CAD_BIM_HOME_VIEW.fov,
			isPerspective: true,
		},
		skipTransition,
		true
	);

	autocam.calculateCubeTransform(corner);
	if (autocam.cube) {
		autocam.cube.currentFace = corner;
	}

	autocam.setHomeViewFrom(viewer.impl.camera);
	return true;
};

const buildOrbitCamera = (viewer: Autodesk.Viewing.GuiViewer3D): {
	position: THREE.Vector3;
	target: THREE.Vector3;
	up: THREE.Vector3;
	fov: number;
	isPerspective: boolean;
} | null => {
	const THREE = getLmvThree();
	if (!THREE) return null;

	const box = getModelWorldBounds(viewer);
	if (box.isEmpty()) return null;

	const center = box.getCenter(new THREE.Vector3());
	const size = box.getSize(new THREE.Vector3());
	const radius = Math.max(size.x, size.y, size.z) * 0.5;
	const worldUp = getModelWorldUp(viewer);

	const ref = Math.abs(worldUp.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
	const axisA = new THREE.Vector3().crossVectors(worldUp, ref).normalize();
	const axisB = new THREE.Vector3().crossVectors(axisA, worldUp).normalize();

	const { azimuthRadians, elevationRadians, distanceScale } = CAD_BIM_HOME_VIEW.orbit;
	const horizontal = axisA
		.clone()
		.multiplyScalar(Math.cos(azimuthRadians))
		.add(axisB.clone().multiplyScalar(Math.sin(azimuthRadians)));
	const eyeDir = horizontal
		.multiplyScalar(Math.cos(elevationRadians))
		.add(worldUp.clone().multiplyScalar(Math.sin(elevationRadians)))
		.normalize();

	const distance = Math.max(radius * distanceScale, 1);
	const position = center.clone().add(eyeDir.multiplyScalar(distance));

	return {
		position,
		target: center.clone(),
		up: worldUp.clone(),
		fov: CAD_BIM_HOME_VIEW.fov,
		isPerspective: true,
	};
};

/** Logs a 13-element view array suitable for CAD_BIM_HOME_VIEW.viewArray in viewerEnvironmentSpec.ts */
export const captureCadBimHomeViewArray = (viewer: Autodesk.Viewing.GuiViewer3D): number[] => {
	const viewArray = viewer.getViewArrayFromCamera();
	console.info('[ViewerEnvironment] Paste into CAD_BIM_HOME_VIEW.viewArray:', JSON.stringify(viewArray));
	return viewArray;
};

export interface ApplyCadBimHomeViewOptions {
	/** When true, only applies once per viewer instance. Default true. */
	once?: boolean;
	skipTransition?: boolean;
	updateHome?: boolean;
}

/** Applies CAD/BIM default view (ViewCube front,top,left) and sets ViewCube home to match. */
export const applyCadBimHomeView = (
	viewer: Autodesk.Viewing.GuiViewer3D,
	options: ApplyCadBimHomeViewOptions = {}
): boolean => {
	const once = options.once ?? true;
	const skipTransition = options.skipTransition ?? true;
	const updateHome = options.updateHome ?? true;

	if (once && hasAppliedHomeView.get(viewer)) {
		return false;
	}

	const viewArray = CAD_BIM_HOME_VIEW.viewArray;
	let applied = false;

	if (viewArray && viewArray.length >= 11) {
		const camera = viewer.getCameraFromViewArray([...viewArray]);
		if (camera) {
			viewer.impl.setViewFromCamera(camera, skipTransition, true);
			applied = true;
		}
	} else if (CAD_BIM_HOME_VIEW.viewCubeCorner) {
		applied = applyViewCubeCornerHomeView(viewer, CAD_BIM_HOME_VIEW.viewCubeCorner, skipTransition);
	} else {
		const camera = buildOrbitCamera(viewer);
		if (camera) {
			viewer.impl.setViewFromCamera(camera, skipTransition, true);
			applied = true;
		}
	}

	if (!applied) {
		return false;
	}

	if (updateHome) {
		getAutocam(viewer)?.setHomeViewFrom(viewer.impl.camera);
	}

	if (once) {
		hasAppliedHomeView.set(viewer, true);
	}

	viewer.impl.invalidate(true, true, true);
	return true;
};

export const resetCadBimHomeViewState = (viewer: Autodesk.Viewing.GuiViewer3D): void => {
	hasAppliedHomeView.delete(viewer);
};
