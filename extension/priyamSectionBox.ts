import { getLmvThree } from './lmvThree';
import { suppressNativeSectionGizmos } from './lmvNativeSection';
import {
	applySectionBoxVisibility,
	enableSectionBoxVisibilityMode,
	getSectionBoxEnvelopeBounds,
	restoreSectionBoxVisibilityMode,
	type SectionVisibilityState,
} from './sectionBoxVisibility';
import { getModelWorldBounds } from './viewerEnvironmentBounds';
import { SECTION_BOX_CUT_PLANE_SET, SECTION_BOX_OVERLAY_SCENE, SECTION_BOX_STYLE } from './viewerEnvironmentSpec';

const TOOL_NAME = 'PriyamSectionBoxTool';
/** Above GGMarkupsTool (200) and pen compat (210) while the section box is active. */
const SECTION_TOOL_PRIORITY = 255;
const MIN_BOX_SIZE = 0.5;
const FACE_PICK_EPS = 0.001;

type Axis = 'x' | 'y' | 'z';

interface LmvCanvasPointerEvent {
	canvasX: number;
	canvasY: number;
	normalizedX: number;
	normalizedY: number;
	button?: number;
}

interface BoxFace {
	mesh: THREE.Mesh;
	pickMesh: THREE.Mesh;
	axis: Axis;
	sign: 1 | -1;
	rotation: THREE.Euler;
}

interface FaceLayout {
	axis: Axis;
	sign: 1 | -1;
	rotation: THREE.Euler;
	position: THREE.Vector3;
	width: number;
	height: number;
}

interface AxisSign {
	axis: Axis;
	sign: 1 | -1;
}

interface DragState {
	axes: AxisSign[];
	hitPlanes: THREE.Plane[];
	faceNormal: THREE.Vector3;
	startMin: THREE.Vector3;
	startMax: THREE.Vector3;
	startHit: THREE.Vector3;
}

type SectionBoxTool = Autodesk.Viewing.ToolInterface & {
	getName: () => string;
};

const controllers = new WeakMap<Autodesk.Viewing.GuiViewer3D, PriyamSectionBoxController>();

const disableMeshRaycast = (mesh: THREE.Object3D): void => {
	mesh.raycast = (): void => {};
};

const geometryFromPoints = (THREE: typeof window.THREE, points: THREE.Vector3[]): THREE.BufferGeometry => {
	const geometry = new THREE.BufferGeometry();
	const positions = new Float32Array(points.length * 3);
	for (let i = 0; i < points.length; i++) {
		positions[i * 3] = points[i].x;
		positions[i * 3 + 1] = points[i].y;
		positions[i * 3 + 2] = points[i].z;
	}
	const attribute = new THREE.BufferAttribute(positions, 3);
	const g = geometry as THREE.BufferGeometry & {
		setAttribute?: (name: string, attr: THREE.BufferAttribute) => void;
		addAttribute?: (name: string, attr: THREE.BufferAttribute) => void;
	};
	if (typeof g.setAttribute === 'function') {
		g.setAttribute('position', attribute);
	} else if (typeof g.addAttribute === 'function') {
		g.addAttribute('position', attribute);
	}
	return geometry;
};

/** LMV uses UnifiedCamera — THREE.Raycaster.setFromCamera is unreliable; match SmartSection. */
const updateRaycasterFromNdc = (
	camera: THREE.Camera,
	raycaster: THREE.Raycaster,
	ndcX: number,
	ndcY: number
): void => {
	const pointerVector = new THREE.Vector3();
	const pointerDir = new THREE.Vector3();
	const unified = camera as THREE.Camera & { isPerspective?: boolean };

	if (unified.isPerspective) {
		pointerVector.copy(camera.position);
		pointerDir.set(ndcX, ndcY, 0.5).unproject(camera).sub(camera.position).normalize();
		raycaster.set(pointerVector, pointerDir);
		return;
	}

	pointerVector.set(ndcX, ndcY, -1);
	pointerVector.unproject(camera);
	pointerDir.set(0, 0, -1);
	pointerDir.transformDirection(camera.matrixWorld);
	raycaster.set(pointerVector, pointerDir);
};

const updateRaycasterFromLmvEvent = (
	viewer: Autodesk.Viewing.GuiViewer3D,
	raycaster: THREE.Raycaster,
	event: LmvCanvasPointerEvent
): void => {
	updateRaycasterFromNdc(viewer.getCamera(), raycaster, event.normalizedX, event.normalizedY);
};

const updateCutPlanes = (viewer: Autodesk.Viewing.GuiViewer3D): void => {
	(viewer.impl as { updateCutPlanes?: () => void }).updateCutPlanes?.();
};

class PriyamSectionBoxController {
	private readonly viewer: Autodesk.Viewing.GuiViewer3D;
	private readonly root: THREE.Group;
	private readonly raycaster = new THREE.Raycaster();
	private readonly min = new THREE.Vector3();
	private readonly max = new THREE.Vector3();
	private readonly faces: BoxFace[] = [];
	private edges: THREE.LineSegments | null = null;
	private hoveredFace: BoxFace | null = null;
	private drag: DragState | null = null;
	private toolRegistered = false;
	private sectionTool: SectionBoxTool | undefined;
	private active = false;
	private visibilityState: SectionVisibilityState | undefined;
	private canvasPointerBound = false;
	private capturedPointerId: number | null = null;
	private navigationLocked = false;
	private nativeGizmoGuardBound = false;
	private readonly boundNativeGizmoGuard = (): void => {
		if (!this.active) return;
		if (this.nativeGizmoGuardTimer !== undefined) {
			window.clearTimeout(this.nativeGizmoGuardTimer);
		}
		this.nativeGizmoGuardTimer = window.setTimeout(() => {
			suppressNativeSectionGizmos(this.viewer);
			this.nativeGizmoGuardTimer = undefined;
		}, 300);
	};
	private readonly hitPoint = new THREE.Vector3();
	private readonly faceAnchor = new THREE.Vector3();
	private readonly faceWorldNormal = new THREE.Vector3();
	private readonly pickMeshPosition = new THREE.Vector3();
	private readonly cutPlanes: THREE.Vector4[];
	private nativeGizmoGuardTimer: ReturnType<typeof setTimeout> | undefined;
	private readonly envelopeMin = new THREE.Vector3();
	private readonly envelopeMax = new THREE.Vector3();
	private hasEnvelopeBounds = false;
	private sectioningActive = false;
	private readonly dragIntersect = new THREE.Vector3();
	private readonly dragCameraRay = new THREE.Vector3();
	private readonly dragDeltaVec = new THREE.Vector3();
	private readonly boundMouseMove = (event: MouseEvent): void => {
		this.onPointerMove(event);
	};
	private readonly boundMouseDown = (event: MouseEvent): void => {
		this.onPointerDown(event);
	};
	private readonly boundMouseUp = (event: MouseEvent): void => {
		this.onPointerUp(event);
	};

	constructor(viewer: Autodesk.Viewing.GuiViewer3D) {
		this.viewer = viewer;
		const THREE = getLmvThree();
		if (!THREE) {
			throw new Error('ViewerEnvironment: LMV THREE is not available');
		}
		this.root = new THREE.Group();
		this.root.name = 'priyam-section-box';
		this.cutPlanes = [
			new THREE.Vector4(1, 0, 0, 0),
			new THREE.Vector4(-1, 0, 0, 0),
			new THREE.Vector4(0, 1, 0, 0),
			new THREE.Vector4(0, -1, 0, 0),
			new THREE.Vector4(0, 0, 1, 0),
			new THREE.Vector4(0, 0, -1, 0),
		];
	}

	isActive(): boolean {
		return this.active;
	}

	activateFromModelBounds(): boolean {
		const fullBox = getModelWorldBounds(this.viewer);
		if (fullBox.isEmpty()) return false;
		const envelope = getSectionBoxEnvelopeBounds(fullBox);
		this.envelopeMin.copy(envelope.min);
		this.envelopeMax.copy(envelope.max);
		this.hasEnvelopeBounds = true;
		this.activate(envelope);
		return true;
	}

	activate(box: THREE.Box3): void {
		const THREE = getLmvThree();
		if (!THREE) {
			console.error('ViewerEnvironment: THREE is not available — cannot show section box');
			return;
		}

		this.visibilityState = enableSectionBoxVisibilityMode(this.viewer);

		this.min.copy(box.min);
		this.max.copy(box.max);
		this.rebuildVisuals(THREE);
		this.ensureOverlay();
		suppressNativeSectionGizmos(this.viewer);
		this.registerTool();
		this.bindCanvasPointerHandlers();
		this.bindNativeGizmoGuard();
		this.sectioningActive = false;
		this.active = true;
		this.viewer.impl.invalidate(true, false, true);
	}

	deactivate(): void {
		if (!this.active) return;
		this.hasEnvelopeBounds = false;
		this.sectioningActive = false;
		this.unlockNavigationForDrag();
		this.unbindCanvasPointerHandlers();
		this.unbindNativeGizmoGuard();
		this.drag = null;
		this.hoveredFace = null;
		this.edges = null;
		this.setCanvasCursor('');
		this.unregisterTool();
		this.viewer.impl.clearOverlay(SECTION_BOX_OVERLAY_SCENE);
		if (this.viewer.impl.overlayScenes[SECTION_BOX_OVERLAY_SCENE]) {
			this.viewer.impl.removeOverlayScene(SECTION_BOX_OVERLAY_SCENE);
		}
		this.viewer.impl.setCutPlaneSet(SECTION_BOX_CUT_PLANE_SET, undefined);
		updateCutPlanes(this.viewer);
		restoreSectionBoxVisibilityMode(this.viewer, this.visibilityState);
		this.visibilityState = undefined;
		this.active = false;
		this.viewer.impl.invalidate(true, false, true);
	}

	private ensureOverlay(): void {
		if (!this.viewer.impl.overlayScenes[SECTION_BOX_OVERLAY_SCENE]) {
			this.viewer.impl.createOverlayScene(SECTION_BOX_OVERLAY_SCENE);
		}
		this.viewer.impl.clearOverlay(SECTION_BOX_OVERLAY_SCENE);
		this.viewer.impl.addOverlay(SECTION_BOX_OVERLAY_SCENE, this.root);
	}

	private getToolController(): {
		registerTool: (tool: SectionBoxTool) => void;
		deregisterTool: (tool: SectionBoxTool) => void;
		activateTool: (name: string) => void;
		deactivateTool: (name: string) => void;
		isToolActivated?: (name: string) => boolean;
	} {
		return this.viewer.toolController as unknown as {
			registerTool: (tool: SectionBoxTool) => void;
			deregisterTool: (tool: SectionBoxTool) => void;
			activateTool: (name: string) => void;
			deactivateTool: (name: string) => void;
			isToolActivated?: (name: string) => boolean;
		};
	}

	private registerTool(): void {
		const tc = this.getToolController();
		if (!this.toolRegistered) {
			this.sectionTool = {
				getNames: (): string[] => [TOOL_NAME],
				getName: (): string => TOOL_NAME,
				getPriority: (): number => SECTION_TOOL_PRIORITY,
				activate: (): void => {},
				deactivate: (): void => {},
				handleSingleClick: (): boolean => false,
				handleMouseMove: (event: LmvCanvasPointerEvent): boolean => this.onMouseMove(event),
				handleButtonDown: (event: LmvCanvasPointerEvent, button: number): boolean => {
					if (!this.active) return false;
					const handled = this.onMouseDown(event, button);
					if (handled) return true;
					return false;
				},
				handleButtonUp: (_event: LmvCanvasPointerEvent, button: number): boolean => this.onMouseUp(button),
				handleMouseLeave: (): boolean => {
					if (!this.active || this.drag) return Boolean(this.drag);
					this.setFaceHover(null);
					return false;
				},
			};
			tc.registerTool(this.sectionTool);
			this.toolRegistered = true;
		}
		tc.activateTool(TOOL_NAME);
	}

	private unregisterTool(): void {
		if (!this.toolRegistered || !this.sectionTool) return;
		const tc = this.getToolController();
		if (tc.isToolActivated?.(TOOL_NAME)) {
			tc.deactivateTool(TOOL_NAME);
		}
		tc.deregisterTool(this.sectionTool);
		this.sectionTool = undefined;
		this.toolRegistered = false;
	}

	private disposeObject3D(object: THREE.Object3D): void {
		object.traverse(child => {
			const mesh = child as THREE.Mesh;
			if (mesh.geometry) {
				mesh.geometry.dispose();
			}
			const mat = mesh.material;
			if (mat) {
				const mats = Array.isArray(mat) ? mat : [mat];
				for (const m of mats) {
					m.dispose();
				}
			}
		});
	}

	private pickOutwardOffset(): number {
		const dx = this.max.x - this.min.x;
		const dy = this.max.y - this.min.y;
		const dz = this.max.z - this.min.z;
		return Math.max(0.05, Math.max(dx, dy, dz) * 0.004);
	}

	/** Outward normal in world space (from pick mesh orientation, not raw axis). */
	private getFaceWorldNormal(face: BoxFace, target = this.faceWorldNormal): THREE.Vector3 {
		face.pickMesh.updateMatrixWorld(true);
		target.set(0, 0, 1).transformDirection(face.pickMesh.matrixWorld);
		const center = this.dragDeltaVec
			.set(
				(this.min.x + this.max.x) * 0.5,
				(this.min.y + this.max.y) * 0.5,
				(this.min.z + this.max.z) * 0.5
			);
		const outward = this.dragIntersect.copy(this.getFaceAnchor(face)).sub(center);
		if (outward.lengthSq() > 1e-12 && target.dot(outward) < 0) {
			target.negate();
		}
		return target;
	}

	/** True when the camera can see this face (grazing / silhouette sides included). */
	private isFaceVisibleToCamera(face: BoxFace): boolean {
		const camera = this.viewer.getCamera().position;
		const anchor = this.getFaceAnchor(face);
		this.getFaceWorldNormal(face);
		return this.faceWorldNormal.dot(this.dragIntersect.copy(camera).sub(anchor)) > 0;
	}

	private setPickMeshPosition(face: BoxFace, layout: FaceLayout): void {
		const offset = this.pickOutwardOffset();
		this.pickMeshPosition.copy(layout.position);
		this.pickMeshPosition[layout.axis] += layout.sign * offset;
		face.pickMesh.position.copy(this.pickMeshPosition);
	}

	private getFaceLayouts(): FaceLayout[] {
		const size = new THREE.Vector3().subVectors(this.max, this.min);
		const center = new THREE.Vector3().addVectors(this.min, this.max).multiplyScalar(0.5);

		return [
			{
				axis: 'x',
				sign: 1,
				rotation: new THREE.Euler(0, Math.PI / 2, 0),
				position: new THREE.Vector3(this.max.x, center.y, center.z),
				width: size.z,
				height: size.y,
			},
			{
				axis: 'x',
				sign: -1,
				rotation: new THREE.Euler(0, -Math.PI / 2, 0),
				position: new THREE.Vector3(this.min.x, center.y, center.z),
				width: size.z,
				height: size.y,
			},
			{
				axis: 'y',
				sign: 1,
				rotation: new THREE.Euler(-Math.PI / 2, 0, 0),
				position: new THREE.Vector3(center.x, this.max.y, center.z),
				width: size.x,
				height: size.z,
			},
			{
				axis: 'y',
				sign: -1,
				rotation: new THREE.Euler(Math.PI / 2, 0, 0),
				position: new THREE.Vector3(center.x, this.min.y, center.z),
				width: size.x,
				height: size.z,
			},
			{
				axis: 'z',
				sign: 1,
				rotation: new THREE.Euler(0, 0, 0),
				position: new THREE.Vector3(center.x, center.y, this.max.z),
				width: size.x,
				height: size.y,
			},
			{
				axis: 'z',
				sign: -1,
				rotation: new THREE.Euler(0, Math.PI, 0),
				position: new THREE.Vector3(center.x, center.y, this.min.z),
				width: size.x,
				height: size.y,
			},
		];
	}

	private resizePlaneMesh(mesh: THREE.Mesh, width: number, height: number): void {
		mesh.scale.set(Math.max(width, 0.01), Math.max(height, 0.01), 1);
	}

	private updateEdgePositions(): void {
		if (!this.edges) return;
		const corners = [
			[this.min.x, this.min.y, this.min.z],
			[this.max.x, this.min.y, this.min.z],
			[this.max.x, this.min.y, this.max.z],
			[this.min.x, this.min.y, this.max.z],
			[this.min.x, this.max.y, this.min.z],
			[this.max.x, this.max.y, this.min.z],
			[this.max.x, this.max.y, this.max.z],
			[this.min.x, this.max.y, this.max.z],
		];
		const pairs: Array<[number, number]> = [
			[0, 1],
			[1, 2],
			[2, 3],
			[3, 0],
			[4, 5],
			[5, 6],
			[6, 7],
			[7, 4],
			[0, 4],
			[1, 5],
			[2, 6],
			[3, 7],
		];
		const attr = this.edges.geometry.getAttribute('position') as THREE.BufferAttribute;
		let index = 0;
		for (const [a, b] of pairs) {
			attr.setXYZ(index++, corners[a][0], corners[a][1], corners[a][2]);
			attr.setXYZ(index++, corners[b][0], corners[b][1], corners[b][2]);
		}
		attr.needsUpdate = true;
	}

	private updateBoxTransforms(): void {
		const layouts = this.getFaceLayouts();
		for (const face of this.faces) {
			const layout = layouts.find(item => item.axis === face.axis && item.sign === face.sign);
			if (!layout) continue;

			face.mesh.position.copy(layout.position);
			this.setPickMeshPosition(face, layout);
			face.mesh.setRotationFromEuler(layout.rotation);
			face.pickMesh.setRotationFromEuler(layout.rotation);
			const pickW = layout.width * SECTION_BOX_STYLE.facePickScale;
			const pickH = layout.height * SECTION_BOX_STYLE.facePickScale;
			this.resizePlaneMesh(face.mesh, layout.width, layout.height);
			this.resizePlaneMesh(face.pickMesh, pickW, pickH);
		}

		this.updateEdgePositions();
		this.root.updateMatrixWorld(true);
	}

	private rebuildVisuals(THREE: typeof window.THREE): void {
		while (this.root.children.length > 0) {
			const child = this.root.children[0];
			this.root.remove(child);
			this.disposeObject3D(child);
		}
		this.faces.length = 0;
		this.edges = null;

		for (const layout of this.getFaceLayouts()) {
			const w = Math.max(layout.width, 0.01);
			const h = Math.max(layout.height, 0.01);
			const pickW = w * SECTION_BOX_STYLE.facePickScale;
			const pickH = h * SECTION_BOX_STYLE.facePickScale;

			const material = new THREE.MeshBasicMaterial({
				color: SECTION_BOX_STYLE.faceColor,
				transparent: true,
				opacity: SECTION_BOX_STYLE.faceOpacity,
				side: THREE.DoubleSide,
				depthWrite: false,
				depthTest: false,
			});
			const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
			mesh.position.copy(layout.position);
			mesh.setRotationFromEuler(layout.rotation);
			mesh.renderOrder = 50;
			disableMeshRaycast(mesh);
			this.resizePlaneMesh(mesh, w, h);

			const pickMaterial = new THREE.MeshBasicMaterial({
				transparent: true,
				opacity: 0,
				side: THREE.DoubleSide,
				depthWrite: false,
				depthTest: false,
			});
			const pickMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), pickMaterial);
			pickMesh.setRotationFromEuler(layout.rotation);
			pickMesh.renderOrder = 49;
			pickMesh.userData.isSectionBoxPick = true;
			this.resizePlaneMesh(pickMesh, pickW, pickH);
			const pickFace: BoxFace = {
				mesh,
				pickMesh,
				axis: layout.axis,
				sign: layout.sign,
				rotation: layout.rotation,
			};
			this.setPickMeshPosition(pickFace, layout);

			this.root.add(pickMesh);
			this.root.add(mesh);
			this.faces.push(pickFace);
		}

		this.addEdges(THREE);
		this.root.updateMatrixWorld(true);
	}

	private addEdges(THREE: typeof window.THREE): void {
		const corners = [
			new THREE.Vector3(this.min.x, this.min.y, this.min.z),
			new THREE.Vector3(this.max.x, this.min.y, this.min.z),
			new THREE.Vector3(this.max.x, this.min.y, this.max.z),
			new THREE.Vector3(this.min.x, this.min.y, this.max.z),
			new THREE.Vector3(this.min.x, this.max.y, this.min.z),
			new THREE.Vector3(this.max.x, this.max.y, this.min.z),
			new THREE.Vector3(this.max.x, this.max.y, this.max.z),
			new THREE.Vector3(this.min.x, this.max.y, this.max.z),
		];
		const edgePairs: Array<[number, number]> = [
			[0, 1],
			[1, 2],
			[2, 3],
			[3, 0],
			[4, 5],
			[5, 6],
			[6, 7],
			[7, 4],
			[0, 4],
			[1, 5],
			[2, 6],
			[3, 7],
		];
		const points: THREE.Vector3[] = [];
		for (const [a, b] of edgePairs) {
			points.push(corners[a].clone(), corners[b].clone());
		}
		const geometry = geometryFromPoints(THREE, points);
		(geometry as THREE.BufferGeometry & { isLines?: boolean }).isLines = true;
		const material = new THREE.LineBasicMaterial({
			color: SECTION_BOX_STYLE.edgeColor,
			transparent: true,
			opacity: SECTION_BOX_STYLE.edgeOpacity,
			depthWrite: false,
			depthTest: false,
		});
		const edges = new THREE.LineSegments(geometry, material);
		edges.renderOrder = 51;
		disableMeshRaycast(edges);
		this.edges = edges;
		this.root.add(edges);
	}

	private resetFaceMaterial(face: BoxFace): void {
		const mat = face.mesh.material as THREE.MeshBasicMaterial;
		mat.color.setHex(SECTION_BOX_STYLE.faceColor);
		mat.opacity = SECTION_BOX_STYLE.faceOpacity;
		mat.needsUpdate = true;
	}

	private getCursorForAxes(axes: AxisSign[]): string {
		const axis = axes[0]?.axis;
		switch (axis) {
			case 'x':
				return 'ew-resize';
			case 'y':
				return 'ns-resize';
			case 'z':
				return 'nwse-resize';
			default:
				return 'pointer';
		}
	}

	private getCursorForFace(face: Pick<BoxFace, 'axis'>): string {
		return this.getCursorForAxes([{ axis: face.axis, sign: face.sign }]);
	}

	private findFace(axis: Axis, sign: 1 | -1): BoxFace | undefined {
		return this.faces.find(f => f.axis === axis && f.sign === sign);
	}

	private setCanvasCursor(cursor: string): void {
		const canvas = this.viewer.canvas as HTMLCanvasElement | undefined;
		if (canvas) canvas.style.cursor = cursor;
	}

	private getCanvasElement(): HTMLCanvasElement | null {
		return (this.viewer.canvas as HTMLCanvasElement | undefined) ?? null;
	}

	private getPointerEventTarget(): HTMLElement | null {
		return this.viewer.container ?? this.getCanvasElement();
	}

	private domToLmvEvent(event: MouseEvent | PointerEvent): LmvCanvasPointerEvent {
		const impl = this.viewer.impl as {
			getCanvasBoundingClientRect?: () => DOMRect;
			clientToViewport?: (clientX: number, clientY: number) => THREE.Vector3;
		};
		const rect = impl.getCanvasBoundingClientRect?.() ?? this.getCanvasElement()?.getBoundingClientRect();
		const width = rect?.width ?? 1;
		const height = rect?.height ?? 1;
		const canvasX = rect ? event.clientX - rect.left : event.clientX;
		const canvasY = rect ? event.clientY - rect.top : event.clientY;

		if (impl.clientToViewport) {
			const vp = impl.clientToViewport(event.clientX, event.clientY);
			return {
				canvasX,
				canvasY,
				normalizedX: vp.x,
				normalizedY: vp.y,
				button: event.button,
			};
		}

		return {
			canvasX,
			canvasY,
			normalizedX: (canvasX / width) * 2 - 1,
			normalizedY: ((height - canvasY) / height) * 2 - 1,
			button: event.button,
		};
	}

	private lockNavigationForDrag(): void {
		if (this.navigationLocked) return;
		(this.viewer.toolController as { setIsLocked?: (locked: boolean) => void }).setIsLocked?.(true);
		this.navigationLocked = true;
	}

	private unlockNavigationForDrag(): void {
		if (!this.navigationLocked) return;
		(this.viewer.toolController as { setIsLocked?: (locked: boolean) => void }).setIsLocked?.(false);
		this.navigationLocked = false;
	}

	private bindCanvasPointerHandlers(): void {
		const target = this.getPointerEventTarget();
		if (!target || this.canvasPointerBound) return;

		target.addEventListener('mousemove', this.boundMouseMove, true);
		target.addEventListener('mousedown', this.boundMouseDown, true);
		target.addEventListener('mouseup', this.boundMouseUp, true);
		this.canvasPointerBound = true;
	}

	private bindNativeGizmoGuard(): void {
		if (this.nativeGizmoGuardBound) return;
		this.viewer.addEventListener(Autodesk.Viewing.CAMERA_CHANGE_EVENT, this.boundNativeGizmoGuard);
		this.nativeGizmoGuardBound = true;
	}

	private unbindNativeGizmoGuard(): void {
		if (!this.nativeGizmoGuardBound) return;
		this.viewer.removeEventListener(Autodesk.Viewing.CAMERA_CHANGE_EVENT, this.boundNativeGizmoGuard);
		if (this.nativeGizmoGuardTimer !== undefined) {
			window.clearTimeout(this.nativeGizmoGuardTimer);
			this.nativeGizmoGuardTimer = undefined;
		}
		this.nativeGizmoGuardBound = false;
	}

	private unbindCanvasPointerHandlers(): void {
		const target = this.getPointerEventTarget();
		const canvas = this.getCanvasElement();
		if (!target || !this.canvasPointerBound) return;

		target.removeEventListener('mousemove', this.boundMouseMove, true);
		target.removeEventListener('mousedown', this.boundMouseDown, true);
		target.removeEventListener('mouseup', this.boundMouseUp, true);
		if (canvas && this.capturedPointerId !== null) {
			try {
				canvas.releasePointerCapture(this.capturedPointerId);
			} catch {
				// Pointer may already be released.
			}
			this.capturedPointerId = null;
		}
		this.unlockNavigationForDrag();
		this.canvasPointerBound = false;
	}

	private onPointerMove(event: MouseEvent | PointerEvent): void {
		if (!this.active) return;
		const handled = this.onMouseMove(this.domToLmvEvent(event));
		if (this.drag) {
			event.preventDefault();
			event.stopPropagation();
		} else if (handled) {
			event.stopPropagation();
		}
	}

	private onPointerDown(event: MouseEvent | PointerEvent): void {
		if (!this.active || event.button !== 0) return;
		const lmvEvent = this.domToLmvEvent(event);
		if (!this.onMouseDown(lmvEvent, 0)) return;

		const canvas = this.getCanvasElement();
		if (!canvas) return;

		this.lockNavigationForDrag();
		event.preventDefault();
		event.stopPropagation();
		event.stopImmediatePropagation();
		if ('pointerId' in event) {
			canvas.setPointerCapture(event.pointerId);
			this.capturedPointerId = event.pointerId;
		}
	}

	private onPointerUp(event: MouseEvent | PointerEvent): void {
		if (!this.active) return;
		this.onMouseUp(event.button);
		this.unlockNavigationForDrag();
		const canvas = this.getCanvasElement();
		if (canvas && 'pointerId' in event && this.capturedPointerId === event.pointerId) {
			try {
				canvas.releasePointerCapture(event.pointerId);
			} catch {
				// Pointer may already be released.
			}
			this.capturedPointerId = null;
		}
	}

	private applyCutPlanes(): void {
		this.cutPlanes[0].set(1, 0, 0, -this.max.x);
		this.cutPlanes[1].set(-1, 0, 0, this.min.x);
		this.cutPlanes[2].set(0, 1, 0, -this.max.y);
		this.cutPlanes[3].set(0, -1, 0, this.min.y);
		this.cutPlanes[4].set(0, 0, 1, -this.max.z);
		this.cutPlanes[5].set(0, 0, -1, this.min.z);
		const impl = this.viewer.impl as {
			setCutPlaneSet: (name: string, planes: THREE.Vector4[] | undefined) => void;
			setCutplanesHideInterior?: (enabled: boolean) => void;
		};
		impl.setCutplanesHideInterior?.(false);
		impl.setCutPlaneSet(SECTION_BOX_CUT_PLANE_SET, this.cutPlanes);
		updateCutPlanes(this.viewer);
	}

	private applySectioning(): void {
		if (!this.sectioningActive) return;
		this.applyCutPlanes();
		applySectionBoxVisibility(this.viewer, this.min, this.max);
	}

	private setFaceHover(face: BoxFace | null): void {
		if (this.hoveredFace === face) return;
		if (this.hoveredFace) {
			this.resetFaceMaterial(this.hoveredFace);
		}
		this.hoveredFace = face;
		if (face) {
			const mat = face.mesh.material as THREE.MeshBasicMaterial;
			mat.color.setHex(SECTION_BOX_STYLE.faceHoverColor);
			mat.opacity = SECTION_BOX_STYLE.faceHoverOpacity;
			mat.needsUpdate = true;
			this.setCanvasCursor(this.getCursorForFace(face));
		} else if (!this.drag) {
			this.setCanvasCursor('');
		}
		this.viewer.impl.invalidate(false, false, true);
	}

	private getFacePlane(face: BoxFace): THREE.Plane {
		const normal = new THREE.Vector3();
		normal[face.axis] = face.sign;
		const point = new THREE.Vector3(
			(this.min.x + this.max.x) * 0.5,
			(this.min.y + this.max.y) * 0.5,
			(this.min.z + this.max.z) * 0.5
		);
		point[face.axis] = face.sign > 0 ? this.max[face.axis] : this.min[face.axis];
		return new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point);
	}

	private facePickEpsilon(): number {
		const dx = this.max.x - this.min.x;
		const dy = this.max.y - this.min.y;
		const dz = this.max.z - this.min.z;
		const sizeLen = Math.sqrt(dx * dx + dy * dy + dz * dz);
		return Math.max(FACE_PICK_EPS, sizeLen * 1e-4);
	}

	private isPointOnFace(point: THREE.Vector3, face: BoxFace): boolean {
		const eps = this.facePickEpsilon();
		const pickScale = SECTION_BOX_STYLE.facePickScale;
		const expand = (a: number, b: number): { min: number; max: number } => {
			const center = (a + b) * 0.5;
			const half = ((b - a) * 0.5) * pickScale;
			return { min: center - half, max: center + half };
		};

		if (face.axis === 'x') {
			const planeX = face.sign > 0 ? this.max.x : this.min.x;
			if (Math.abs(point.x - planeX) > eps) return false;
			const y = expand(this.min.y, this.max.y);
			const z = expand(this.min.z, this.max.z);
			return point.y >= y.min - eps && point.y <= y.max + eps && point.z >= z.min - eps && point.z <= z.max + eps;
		}
		if (face.axis === 'y') {
			const planeY = face.sign > 0 ? this.max.y : this.min.y;
			if (Math.abs(point.y - planeY) > eps) return false;
			const x = expand(this.min.x, this.max.x);
			const z = expand(this.min.z, this.max.z);
			return point.x >= x.min - eps && point.x <= x.max + eps && point.z >= z.min - eps && point.z <= z.max + eps;
		}
		const planeZ = face.sign > 0 ? this.max.z : this.min.z;
		if (Math.abs(point.z - planeZ) > eps) return false;
		const x = expand(this.min.x, this.max.x);
		const y = expand(this.min.y, this.max.y);
		return point.x >= x.min - eps && point.x <= x.max + eps && point.y >= y.min - eps && point.y <= y.max + eps;
	}

	private pickFace(event: LmvCanvasPointerEvent): { face: BoxFace; point: THREE.Vector3 } | null {
		this.root.updateMatrixWorld(true);
		updateRaycasterFromLmvEvent(this.viewer, this.raycaster, event);

		const hits = this.raycaster.intersectObjects(
			this.faces.map(f => f.pickMesh),
			false
		);
		for (const hit of hits) {
			const face = this.faces.find(f => f.pickMesh === hit.object);
			if (!face || !this.isFaceVisibleToCamera(face)) continue;
			if (!this.isPointOnFace(hit.point, face)) continue;
			return { face, point: hit.point.clone() };
		}

		let closest: { face: BoxFace; point: THREE.Vector3; distanceAlongRay: number } | null = null;
		for (const face of this.faces) {
			if (!this.isFaceVisibleToCamera(face)) continue;

			const plane = this.getFacePlane(face);
			if (!this.raycaster.ray.intersectPlane(plane, this.hitPoint)) continue;
			if (!this.isPointOnFace(this.hitPoint, face)) continue;

			const distanceAlongRay = this.dragCameraRay.copy(this.hitPoint).sub(this.raycaster.ray.origin).dot(this.raycaster.ray.direction);
			if (distanceAlongRay < 0) continue;
			if (!closest || distanceAlongRay < closest.distanceAlongRay) {
				closest = { face, point: this.hitPoint.clone(), distanceAlongRay };
			}
		}

		return closest ? { face: closest.face, point: closest.point } : null;
	}

	private getFaceAnchor(face: BoxFace): THREE.Vector3 {
		this.faceAnchor.set(
			(this.min.x + this.max.x) * 0.5,
			(this.min.y + this.max.y) * 0.5,
			(this.min.z + this.max.z) * 0.5
		);
		this.faceAnchor[face.axis] = face.sign > 0 ? this.max[face.axis] : this.min[face.axis];
		return this.faceAnchor;
	}

	/**
	 * Two auxiliary planes through the grab point (SmartSection OneDGizmo pattern)
	 * so pointer motion tracks the face extrusion axis at shallow camera angles.
	 */
	private buildDragHitPlanes(face: BoxFace, anchor: THREE.Vector3): THREE.Plane[] {
		const aux1 = new THREE.Vector3();
		const aux2 = new THREE.Vector3();
		if (face.axis === 'x') {
			aux1.set(0, 1, 0);
			aux2.set(0, 0, 1);
		} else if (face.axis === 'y') {
			aux1.set(1, 0, 0);
			aux2.set(0, 0, 1);
		} else {
			aux1.set(1, 0, 0);
			aux2.set(0, 0, 1);
		}
		return [
			new THREE.Plane().setFromNormalAndCoplanarPoint(aux1, anchor),
			new THREE.Plane().setFromNormalAndCoplanarPoint(aux2, anchor),
		];
	}

	private intersectDragPlanes(): THREE.Vector3 | null {
		if (!this.drag) return null;

		const camera = this.viewer.getCamera();
		let best: THREE.Vector3 | null = null;
		let bestDistSq = Infinity;

		for (const plane of this.drag.hitPlanes) {
			if (!this.raycaster.ray.intersectPlane(plane, this.dragIntersect)) continue;

			this.dragCameraRay.copy(this.dragIntersect).sub(camera.position).normalize();
			if (Math.abs(this.dragCameraRay.dot(plane.normal)) <= 0.15) continue;

			const distSq = camera.position.distanceToSquared(this.dragIntersect);
			if (distSq < bestDistSq) {
				bestDistSq = distSq;
				best = this.dragIntersect.clone();
			}
		}

		return best;
	}

	/** Move faces relative to grab point; clamp to envelope and minimum box size. */
	private applyDragFromHit(drag: DragState, hitPoint: THREE.Vector3): void {
		const delta = this.dragDeltaVec.copy(hitPoint).sub(drag.startHit).dot(drag.faceNormal);
		for (const { axis, sign } of drag.axes) {
			if (sign > 0) {
				let next = drag.startMax[axis] + delta;
				next = Math.max(drag.startMin[axis] + MIN_BOX_SIZE, next);
				if (this.hasEnvelopeBounds) {
					next = Math.min(this.envelopeMax[axis], next);
				}
				this.max[axis] = next;
			} else {
				let next = drag.startMin[axis] + delta;
				next = Math.min(drag.startMax[axis] - MIN_BOX_SIZE, next);
				if (this.hasEnvelopeBounds) {
					next = Math.max(this.envelopeMin[axis], next);
				}
				this.min[axis] = next;
			}
		}
	}

	private primaryFaceForAxes(axes: AxisSign[]): BoxFace | null {
		const first = axes[0];
		if (!first) return null;
		return this.faces.find(f => f.axis === first.axis && f.sign === first.sign) ?? null;
	}

	public onMouseMove(event: LmvCanvasPointerEvent): boolean {
		if (!this.active) return false;

		if (this.drag) {
			this.setCanvasCursor(this.getCursorForAxes(this.drag.axes));

			updateRaycasterFromLmvEvent(this.viewer, this.raycaster, event);
			const hit = this.intersectDragPlanes();
			if (!hit) {
				return true;
			}

			this.applyDragFromHit(this.drag, hit);
			this.updateBoxTransforms();
			this.applySectioning();

			const draggingFace = this.primaryFaceForAxes(this.drag.axes);
			if (draggingFace) {
				this.setFaceHover(draggingFace);
			}
			this.viewer.impl.invalidate(false, false, true);
			return true;
		}

		const pick = this.pickFace(event);
		if (pick) {
			this.setFaceHover(pick.face);
			return true;
		}

		this.setFaceHover(null);
		return false;
	}

	public onMouseDown(event: LmvCanvasPointerEvent, button = 0): boolean {
		if (!this.active) return false;
		if (button !== 0) return false;

		const pick = this.pickFace(event);
		if (pick) {
			const { face } = pick;
			const anchor = pick.point.clone();
			const faceNormal = this.getFaceWorldNormal(face, new THREE.Vector3());
			const hitPlanes = this.buildDragHitPlanes(face, anchor);
			updateRaycasterFromLmvEvent(this.viewer, this.raycaster, event);
			this.drag = {
				axes: [{ axis: face.axis, sign: face.sign }],
				hitPlanes,
				faceNormal,
				startMin: this.min.clone(),
				startMax: this.max.clone(),
				startHit: anchor,
			};
			const startHit = this.intersectDragPlanes();
			if (startHit) {
				this.drag.startHit.copy(startHit);
			}
			this.sectioningActive = true;
			this.applySectioning();
			this.setFaceHover(face);
			this.setCanvasCursor(this.getCursorForFace(face));
			return true;
		}

		return false;
	}

	public onMouseUp(button = 0): boolean {
		if (!this.active) return false;
		if (button !== 0) return false;

		const wasDragging = Boolean(this.drag);
		if (this.drag) {
			const face = this.primaryFaceForAxes(this.drag.axes);
			if (face) {
				this.setFaceHover(face);
			}
		}
		this.drag = null;
		if (wasDragging && this.sectioningActive) {
			this.applySectioning();
			this.viewer.impl.invalidate(true, false, true);
		}
		if (!this.hoveredFace) {
			this.setCanvasCursor('');
		}
		return Boolean(this.hoveredFace);
	}
}

const getController = (viewer: Autodesk.Viewing.GuiViewer3D): PriyamSectionBoxController => {
	let controller = controllers.get(viewer);
	if (!controller) {
		controller = new PriyamSectionBoxController(viewer);
		controllers.set(viewer, controller);
	}
	return controller;
};

export const activatePriyamSectionBox = (viewer: Autodesk.Viewing.GuiViewer3D): boolean =>
	getController(viewer).activateFromModelBounds();

export const deactivatePriyamSectionBox = (viewer: Autodesk.Viewing.GuiViewer3D): void => {
	getController(viewer).deactivate();
};

export const togglePriyamSectionBox = (viewer: Autodesk.Viewing.GuiViewer3D, enable?: boolean): boolean => {
	const controller = getController(viewer);
	const shouldEnable = enable ?? !controller.isActive();
	if (!shouldEnable) {
		controller.deactivate();
		return false;
	}
	return controller.activateFromModelBounds();
};

export const isPriyamSectionBoxActive = (viewer: Autodesk.Viewing.GuiViewer3D): boolean =>
	getController(viewer).isActive();
