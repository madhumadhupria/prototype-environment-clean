import { getLmvThree } from './lmvThree';
import { applyRotateModelHighlight, clearRotateModelHighlight } from './rotateModelHighlight';
import {
	getBuildingRotatePivot,
	getModelHorizontalAxes,
	getModelWorldBounds,
	getModelWorldUp,
	getPrimaryStructuralModel,
} from './viewerEnvironmentBounds';
import { ROTATE_GIZMO_OVERLAY_SCENE, ROTATE_GIZMO_STYLE } from './viewerEnvironmentSpec';

const TOOL_NAME = 'PriyamRotateGizmoTool';
const ROTATE_TOOL_PRIORITY = 254;

export type RotateAxisId = 'horizontal' | 'axis-u' | 'axis-v';

interface LmvCanvasPointerEvent {
	canvasX: number;
	canvasY: number;
	normalizedX: number;
	normalizedY: number;
	button?: number;
}

interface AxisArc {
	id: RotateAxisId;
	visual: THREE.LineSegments;
	pickMeshes: THREE.Mesh[];
	color: number;
	startAngle: number;
	endAngle: number;
}

interface DragState {
	axis: RotateAxisId;
	startAngle: number;
	startQuat: THREE.Quaternion;
}

type RotateGizmoTool = Autodesk.Viewing.ToolInterface & {
	getName: () => string;
};

const controllers = new WeakMap<Autodesk.Viewing.GuiViewer3D, PriyamRotateGizmoController>();

const markLineGeometry = (geometry: THREE.BufferGeometry): void => {
	(geometry as THREE.BufferGeometry & { isLines?: boolean }).isLines = true;
};

const disableMeshRaycast = (object: THREE.Object3D): void => {
	object.raycast = (): void => {};
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

const arcPoints = (
	center: THREE.Vector3,
	axisX: THREE.Vector3,
	axisY: THREE.Vector3,
	radius: number,
	startAngle: number,
	endAngle: number,
	segments: number
): THREE.Vector3[] => {
	const points: THREE.Vector3[] = [];
	const span = endAngle - startAngle;
	for (let i = 0; i <= segments; i++) {
		const t = startAngle + (span * i) / segments;
		points.push(
			center
				.clone()
				.add(axisX.clone().multiplyScalar(Math.cos(t) * radius))
				.add(axisY.clone().multiplyScalar(Math.sin(t) * radius))
		);
	}
	return points;
};

const arcSegmentPoints = (
	center: THREE.Vector3,
	axisX: THREE.Vector3,
	axisY: THREE.Vector3,
	radius: number,
	startAngle: number,
	endAngle: number,
	segments: number
): THREE.Vector3[] => {
	const arc = arcPoints(center, axisX, axisY, radius, startAngle, endAngle, segments);
	const points: THREE.Vector3[] = [];
	for (let i = 0; i < arc.length - 1; i++) {
		points.push(arc[i], arc[i + 1]);
	}
	return points;
};

class PriyamRotateGizmoController {
	private readonly root = new THREE.Group();
	private readonly gizmoRoot = new THREE.Group();
	private readonly arcGroup = new THREE.Group();
	private sectorMesh: THREE.Mesh | undefined;
	private sectorMaterial: THREE.MeshBasicMaterial | undefined;

	private active = false;
	private toolRegistered = false;
	private rotateTool: RotateGizmoTool | undefined;
	private canvasPointerBound = false;
	private navigationLocked = false;
	private capturedPointerId: number | null = null;

	private readonly pivot = new THREE.Vector3();
	private readonly up = new THREE.Vector3();
	private readonly axisU = new THREE.Vector3();
	private readonly axisV = new THREE.Vector3();
	private readonly basePlacement = new THREE.Matrix4();
	private readonly rotationQuat = new THREE.Quaternion();
	private readonly tempMatrix = new THREE.Matrix4();
	private readonly tempMatrix2 = new THREE.Matrix4();
	private readonly tempVec = new THREE.Vector3();
	private readonly raycaster = new THREE.Raycaster();
	private readonly ndc = new THREE.Vector3();

	private ringRadius = 1;
	private gizmoScale = 1;
	private arcs: AxisArc[] = [];
	private drag: DragState | null = null;
	private hoveredAxis: RotateAxisId | null = null;

	private readonly boundPointerMove = (event: MouseEvent | PointerEvent): void => this.onPointerMove(event);
	private readonly boundPointerDown = (event: MouseEvent | PointerEvent): void => this.onPointerDown(event);
	private readonly boundPointerUp = (event: MouseEvent | PointerEvent): void => this.onPointerUp(event);
	private readonly boundCameraChange = (): void => this.syncGizmoToModel();

	constructor(private readonly viewer: Autodesk.Viewing.GuiViewer3D) {
		this.root.name = 'priyam-rotate-gizmo';
		this.gizmoRoot.name = 'priyam-rotate-gizmo-controls';
		this.arcGroup.name = 'priyam-rotate-gizmo-arc';
		this.root.add(this.gizmoRoot);
		this.root.add(this.arcGroup);
	}

	private ensureSectorMesh(THREE: typeof window.THREE): THREE.Mesh {
		if (this.sectorMesh) return this.sectorMesh;
		this.sectorMaterial = new THREE.MeshBasicMaterial({
			color: ROTATE_GIZMO_STYLE.horizontalColor,
			transparent: true,
			opacity: ROTATE_GIZMO_STYLE.sectorOpacity,
			side: THREE.DoubleSide,
			depthWrite: false,
			depthTest: false,
		});
		this.sectorMesh = new THREE.Mesh(new THREE.CircleGeometry(0.01, 24, 0, 0.01), this.sectorMaterial);
		this.sectorMesh.visible = false;
		this.sectorMesh.renderOrder = 64;
		disableMeshRaycast(this.sectorMesh);
		this.arcGroup.add(this.sectorMesh);
		return this.sectorMesh;
	}

	isActive(): boolean {
		return this.active;
	}

	activate(): boolean {
		const THREE = getLmvThree();
		const model = getPrimaryStructuralModel(this.viewer);
		if (!THREE || !model) return false;

		const pivot = getBuildingRotatePivot(this.viewer);
		if (!pivot) return false;

		this.captureBasePlacement(model);
		this.rotationQuat.set(0, 0, 0, 1);
		this.pivot.copy(pivot);
		this.up.copy(getModelWorldUp(this.viewer));
		const axes = getModelHorizontalAxes(this.up, THREE);
		this.axisU.copy(axes.axisU);
		this.axisV.copy(axes.axisV);

		this.rebuildVisuals(THREE);
		applyRotateModelHighlight(this.viewer);
		this.ensureOverlay();
		this.syncGizmoToModel();
		this.registerTool();
		this.bindPointerHandlers();
		this.viewer.addEventListener(Autodesk.Viewing.CAMERA_CHANGE_EVENT, this.boundCameraChange);
		this.active = true;
		this.viewer.impl.invalidate(true, false, true);
		return true;
	}

	deactivate(): void {
		if (!this.active) return;
		this.drag = null;
		this.hoveredAxis = null;
		this.setCanvasCursor('');
		this.unregisterTool();
		this.unbindPointerHandlers();
		this.viewer.removeEventListener(Autodesk.Viewing.CAMERA_CHANGE_EVENT, this.boundCameraChange);
		clearRotateModelHighlight(this.viewer);
		this.viewer.impl.clearOverlay(ROTATE_GIZMO_OVERLAY_SCENE);
		if (this.viewer.impl.overlayScenes[ROTATE_GIZMO_OVERLAY_SCENE]) {
			this.viewer.impl.removeOverlayScene(ROTATE_GIZMO_OVERLAY_SCENE);
		}
		this.disposeGroup(this.root);
		this.active = false;
		this.viewer.impl.invalidate(true, false, true);
	}

	private captureBasePlacement(model: Autodesk.Viewing.Model): void {
		const impl = this.viewer.impl as {
			getPlacementTransform?: (model: Autodesk.Viewing.Model) => THREE.Matrix4;
		};
		if (typeof impl.getPlacementTransform === 'function') {
			this.basePlacement.copy(impl.getPlacementTransform(model));
			return;
		}
		const data = model.getData() as { placementWithOffset?: THREE.Matrix4 };
		if (data.placementWithOffset) {
			this.basePlacement.copy(data.placementWithOffset);
			return;
		}
		this.basePlacement.identity();
	}

	private applyModelRotation(): void {
		const model = getPrimaryStructuralModel(this.viewer);
		if (!model) return;

		const impl = this.viewer.impl as {
			setPlacementTransform: (model: Autodesk.Viewing.Model, matrix: THREE.Matrix4) => void;
		};

		this.tempMatrix.makeTranslation(this.pivot.x, this.pivot.y, this.pivot.z);
		this.tempMatrix2.makeRotationFromQuaternion(this.rotationQuat);
		this.tempMatrix.multiply(this.tempMatrix2);
		this.tempMatrix2.makeTranslation(-this.pivot.x, -this.pivot.y, -this.pivot.z);
		this.tempMatrix.multiply(this.tempMatrix2);
		this.tempMatrix2.copy(this.basePlacement);
		this.tempMatrix.multiply(this.tempMatrix2);

		impl.setPlacementTransform(model, this.tempMatrix);
		this.viewer.impl.sceneUpdated(true);
	}

	private getRotationAxis(axis: RotateAxisId, target = new THREE.Vector3()): THREE.Vector3 {
		if (axis === 'horizontal') return target.copy(this.up);
		if (axis === 'axis-u') return target.copy(this.axisU);
		return target.copy(this.axisV);
	}

	private getRingPlaneAxes(axis: RotateAxisId): { axisX: THREE.Vector3; axisY: THREE.Vector3 } {
		if (axis === 'horizontal') {
			return { axisX: this.axisU.clone(), axisY: this.axisV.clone() };
		}
		if (axis === 'axis-u') {
			return { axisX: this.axisV.clone(), axisY: this.up.clone() };
		}
		return { axisX: this.axisU.clone(), axisY: this.up.clone() };
	}

	private computeGizmoScale(box: THREE.Box3): number {
		const xs = [box.min.x, box.max.x];
		const ys = [box.min.y, box.max.y];
		const zs = [box.min.z, box.max.z];
		let minU = Number.POSITIVE_INFINITY;
		let maxU = Number.NEGATIVE_INFINITY;
		let minV = Number.POSITIVE_INFINITY;
		let maxV = Number.NEGATIVE_INFINITY;

		for (const x of xs) {
			for (const y of ys) {
				for (const z of zs) {
					this.tempVec.set(x, y, z);
					const u = this.tempVec.dot(this.axisU);
					const v = this.tempVec.dot(this.axisV);
					minU = Math.min(minU, u);
					maxU = Math.max(maxU, u);
					minV = Math.min(minV, v);
					maxV = Math.max(maxV, v);
				}
			}
		}

		return Math.max(maxU - minU, maxV - minV, 1);
	}

	private clampRingRadius(raw: number): number {
		return Math.min(
			Math.max(raw, ROTATE_GIZMO_STYLE.minRingRadius),
			ROTATE_GIZMO_STYLE.maxRingRadius
		);
	}

	private gizmoCenter(target = new THREE.Vector3()): THREE.Vector3 {
		const lift = Math.max(this.ringRadius * 0.012, 0.015);
		return target.copy(this.pivot).add(this.up.clone().multiplyScalar(lift));
	}

	/** Blender-style: semi-circle on the outer edge facing the camera. */
	private getCameraFacingArcAngles(axis: RotateAxisId): { startAngle: number; endAngle: number } {
		const center = this.gizmoCenter(new THREE.Vector3());
		const camera = this.viewer.impl.camera as THREE.PerspectiveCamera | THREE.OrthographicCamera;
		const rotationAxis = this.getRotationAxis(axis, new THREE.Vector3());
		const { axisX, axisY } = this.getRingPlaneAxes(axis);

		this.tempVec.copy(camera.position).sub(center);
		const axial = rotationAxis.dot(this.tempVec);
		this.tempVec.add(rotationAxis.clone().multiplyScalar(-axial));

		if (this.tempVec.lengthSq() < 1e-8) {
			const half = ROTATE_GIZMO_STYLE.arcSpanRadians * 0.5;
			return { startAngle: -half, endAngle: half };
		}

		this.tempVec.normalize();
		const facing = Math.atan2(this.tempVec.dot(axisY), this.tempVec.dot(axisX));
		const half = ROTATE_GIZMO_STYLE.arcSpanRadians * 0.5;
		return { startAngle: facing - half, endAngle: facing + half };
	}

	private syncGizmoToModel(): void {
		const THREE = getLmvThree();
		if (!THREE || !this.active) return;

		const pivot = getBuildingRotatePivot(this.viewer);
		if (!pivot) return;
		this.pivot.copy(pivot);
		this.up.copy(getModelWorldUp(this.viewer));
		const axes = getModelHorizontalAxes(this.up, THREE);
		this.axisU.copy(axes.axisU);
		this.axisV.copy(axes.axisV);

		const box = getModelWorldBounds(this.viewer);
		this.gizmoScale = this.computeGizmoScale(box);
		this.ringRadius = this.clampRingRadius(this.gizmoScale * ROTATE_GIZMO_STYLE.ringRadiusRatio);
		this.updateArcGeometries(THREE);
		this.viewer.impl.invalidate(false, false, true);
	}

	private rebuildVisuals(THREE: typeof window.THREE): void {
		this.disposeGroup(this.gizmoRoot);
		this.disposeGroup(this.arcGroup);
		this.arcs = [];
		this.ensureSectorMesh(THREE);

		const box = getModelWorldBounds(this.viewer);
		this.gizmoScale = this.computeGizmoScale(box);
		this.ringRadius = this.clampRingRadius(this.gizmoScale * ROTATE_GIZMO_STYLE.ringRadiusRatio);

		this.buildArcs(THREE);
	}

	private createArcLine(
		THREE: typeof window.THREE,
		center: THREE.Vector3,
		axis: RotateAxisId,
		color: number,
		opacity: number,
		startAngle: number,
		endAngle: number
	): THREE.LineSegments {
		const { axisX, axisY } = this.getRingPlaneAxes(axis);
		const points = arcSegmentPoints(
			center,
			axisX,
			axisY,
			this.ringRadius,
			startAngle,
			endAngle,
			ROTATE_GIZMO_STYLE.arcSegments
		);
		const geometry = geometryFromPoints(THREE, points);
		markLineGeometry(geometry);
		const material = new THREE.LineBasicMaterial({
			color,
			transparent: true,
			opacity,
			depthWrite: false,
			depthTest: false,
		});
		const line = new THREE.LineSegments(geometry, material);
		line.frustumCulled = false;
		line.renderOrder = 62;
		line.userData.rotateAxis = axis;
		disableMeshRaycast(line);
		return line;
	}

	private createArcPickMeshes(
		THREE: typeof window.THREE,
		center: THREE.Vector3,
		axis: RotateAxisId,
		startAngle: number,
		endAngle: number
	): THREE.Mesh[] {
		const { axisX, axisY } = this.getRingPlaneAxes(axis);
		const samples = 14;
		const pickRadius = Math.max(this.ringRadius * 0.09, ROTATE_GIZMO_STYLE.arcPickThreshold * 0.45);
		const material = new THREE.MeshBasicMaterial({
			transparent: true,
			opacity: 0,
			depthWrite: false,
			depthTest: false,
		});
		const meshes: THREE.Mesh[] = [];

		for (let i = 0; i <= samples; i++) {
			const t = startAngle + ((endAngle - startAngle) * i) / samples;
			const point = center
				.clone()
				.add(axisX.clone().multiplyScalar(Math.cos(t) * this.ringRadius))
				.add(axisY.clone().multiplyScalar(Math.sin(t) * this.ringRadius));
			const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 6, 6), material.clone());
			mesh.position.copy(point);
			mesh.scale.set(pickRadius, pickRadius, pickRadius);
			mesh.renderOrder = 60;
			mesh.userData.rotateAxis = axis;
			meshes.push(mesh);
		}

		return meshes;
	}

	private buildArcs(THREE: typeof window.THREE): void {
		const specs: { id: RotateAxisId; color: number }[] = [
			{ id: 'axis-u', color: ROTATE_GIZMO_STYLE.axisUColor },
			{ id: 'axis-v', color: ROTATE_GIZMO_STYLE.axisVColor },
			{ id: 'horizontal', color: ROTATE_GIZMO_STYLE.horizontalColor },
		];

		const center = this.gizmoCenter(new THREE.Vector3());
		for (const spec of specs) {
			const { startAngle, endAngle } = this.getCameraFacingArcAngles(spec.id);
			const visual = this.createArcLine(
				THREE,
				center,
				spec.id,
				spec.color,
				ROTATE_GIZMO_STYLE.arcLineOpacity,
				startAngle,
				endAngle
			);
			const pickMeshes = this.createArcPickMeshes(THREE, center, spec.id, startAngle, endAngle);
			this.gizmoRoot.add(visual);
			for (const pickMesh of pickMeshes) {
				this.gizmoRoot.add(pickMesh);
			}
			this.arcs.push({
				id: spec.id,
				visual,
				pickMeshes,
				color: spec.color,
				startAngle,
				endAngle,
			});
		}

		const pivotRadius = Math.max(
			ROTATE_GIZMO_STYLE.pivotRadiusRatio * this.gizmoScale,
			this.ringRadius * 0.045
		);
		const borderRadius = pivotRadius * 1.5;
		const pivotBorder = new THREE.Mesh(
			new THREE.SphereGeometry(1, 12, 12),
			new THREE.MeshBasicMaterial({
				color: ROTATE_GIZMO_STYLE.pivotBorderColor,
				transparent: true,
				opacity: 0.55,
				depthWrite: false,
				depthTest: false,
			})
		);
		pivotBorder.position.copy(center);
		pivotBorder.scale.set(borderRadius, borderRadius, borderRadius);
		pivotBorder.renderOrder = 62;
		pivotBorder.name = 'priyam-rotate-pivot-border';
		disableMeshRaycast(pivotBorder);
		this.gizmoRoot.add(pivotBorder);

		const pivotMesh = new THREE.Mesh(
			new THREE.SphereGeometry(1, 12, 12),
			new THREE.MeshBasicMaterial({
				color: ROTATE_GIZMO_STYLE.pivotColor,
				depthWrite: false,
				depthTest: false,
			})
		);
		pivotMesh.position.copy(center);
		pivotMesh.scale.set(pivotRadius, pivotRadius, pivotRadius);
		pivotMesh.renderOrder = 63;
		pivotMesh.name = 'priyam-rotate-pivot';
		disableMeshRaycast(pivotMesh);
		this.gizmoRoot.add(pivotMesh);
	}

	private updateArcGeometries(THREE: typeof window.THREE): void {
		const center = this.gizmoCenter(new THREE.Vector3());
		for (const arc of this.arcs) {
			const { startAngle, endAngle } = this.getCameraFacingArcAngles(arc.id);
			arc.startAngle = startAngle;
			arc.endAngle = endAngle;

			const { axisX, axisY } = this.getRingPlaneAxes(arc.id);
			const points = arcSegmentPoints(
				center,
				axisX,
				axisY,
				this.ringRadius,
				startAngle,
				endAngle,
				ROTATE_GIZMO_STYLE.arcSegments
			);
			arc.visual.geometry.dispose();
			arc.visual.geometry = geometryFromPoints(THREE, points);
			markLineGeometry(arc.visual.geometry);

			const { axisX: pickAxisX, axisY: pickAxisY } = this.getRingPlaneAxes(arc.id);
			const samples = arc.pickMeshes.length - 1;
			for (let i = 0; i < arc.pickMeshes.length; i++) {
				const t = startAngle + ((endAngle - startAngle) * i) / Math.max(samples, 1);
				const point = center
					.clone()
					.add(pickAxisX.clone().multiplyScalar(Math.cos(t) * this.ringRadius))
					.add(pickAxisY.clone().multiplyScalar(Math.sin(t) * this.ringRadius));
				arc.pickMeshes[i].position.copy(point);
			}
		}

		const pivotRadius = Math.max(
			ROTATE_GIZMO_STYLE.pivotRadiusRatio * this.gizmoScale,
			this.ringRadius * 0.045
		);
		const borderRadius = pivotRadius * 1.5;
		const pivotMesh = this.gizmoRoot.getObjectByName('priyam-rotate-pivot') as THREE.Mesh | undefined;
		const pivotBorder = this.gizmoRoot.getObjectByName('priyam-rotate-pivot-border') as THREE.Mesh | undefined;
		if (pivotMesh) {
			pivotMesh.position.copy(center);
			pivotMesh.scale.set(pivotRadius, pivotRadius, pivotRadius);
		}
		if (pivotBorder) {
			pivotBorder.position.copy(center);
			pivotBorder.scale.set(borderRadius, borderRadius, borderRadius);
		}
	}

	private setArcHighlight(axis: RotateAxisId | null): void {
		if (this.hoveredAxis === axis) return;
		for (const arc of this.arcs) {
			const active = arc.id === axis || (this.drag !== null && this.drag.axis === arc.id);
			const material = arc.visual.material as THREE.LineBasicMaterial;
			material.opacity = active
				? ROTATE_GIZMO_STYLE.arcLineActiveOpacity
				: ROTATE_GIZMO_STYLE.arcLineOpacity;
			material.color.setHex(arc.color);
			material.needsUpdate = true;
		}
		this.hoveredAxis = axis;
		this.viewer.impl.invalidate(false, false, true);
	}

	private clearDragVisuals(): void {
		this.disposeGroup(this.arcGroup);
		if (this.sectorMesh) {
			this.arcGroup.add(this.sectorMesh);
			this.sectorMesh.visible = false;
		}
	}

	private updateDragVisuals(angle: number): void {
		const THREE = getLmvThree();
		if (!THREE || !this.drag) return;

		this.disposeGroup(this.arcGroup);
		const sectorMesh = this.ensureSectorMesh(THREE);
		this.arcGroup.add(sectorMesh);

		const center = this.gizmoCenter(new THREE.Vector3());
		const { axisX, axisY } = this.getRingPlaneAxes(this.drag.axis);
		const rotationAxis = this.getRotationAxis(this.drag.axis, new THREE.Vector3());
		const activeArc = this.arcs.find(arc => arc.id === this.drag?.axis);
		const dragColor = activeArc?.color ?? ROTATE_GIZMO_STYLE.arcColor;

		const arcList = arcPoints(center, axisX, axisY, this.ringRadius, 0, angle, 24);
		const arcSegments: THREE.Vector3[] = [];
		for (let i = 0; i < arcList.length - 1; i++) {
			arcSegments.push(arcList[i], arcList[i + 1]);
		}
		const arcGeometry = geometryFromPoints(THREE, arcSegments);
		markLineGeometry(arcGeometry);
		const arc = new THREE.LineSegments(
			arcGeometry,
			new THREE.LineBasicMaterial({
				color: dragColor,
				transparent: true,
				opacity: ROTATE_GIZMO_STYLE.arcOpacity,
				depthWrite: false,
				depthTest: false,
			})
		);
		arc.frustumCulled = false;
		arc.renderOrder = 65;
		disableMeshRaycast(arc);
		this.arcGroup.add(arc);

		if (Math.abs(angle) > 0.01) {
			sectorMesh.geometry.dispose();
			sectorMesh.geometry = new THREE.CircleGeometry(this.ringRadius, 32, 0, angle);
			sectorMesh.position.copy(center);
			sectorMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), rotationAxis);
			(sectorMesh.material as THREE.MeshBasicMaterial).color.setHex(dragColor);
			sectorMesh.visible = true;
		} else {
			sectorMesh.visible = false;
		}
	}

	private pickAxis(event: LmvCanvasPointerEvent): RotateAxisId | null {
		const camera = this.viewer.impl.camera as THREE.Camera;
		this.ndc.set(event.normalizedX, event.normalizedY, 0.5);
		this.raycaster.setFromCamera(this.ndc, camera);
		const pickTargets = this.arcs.flatMap(arc => arc.pickMeshes);
		const hits = this.raycaster.intersectObjects(pickTargets, false);
		if (hits.length === 0) return null;
		return (hits[0].object as THREE.Mesh).userData.rotateAxis as RotateAxisId | undefined ?? null;
	}

	private pointerAngleOnPlane(axis: RotateAxisId, event: LmvCanvasPointerEvent): number | null {
		const ray = this.viewer.impl.rayCastViewport(
			{ x: event.normalizedX, y: event.normalizedY },
			false,
			null,
			null
		) as { ray?: THREE.Ray } | null;
		if (!ray?.ray) return null;

		const center = this.gizmoCenter(new THREE.Vector3());
		const normal = this.getRotationAxis(axis, new THREE.Vector3());
		const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, center);
		const hit = new THREE.Vector3();
		if (!ray.ray.intersectPlane(plane, hit)) return null;

		const { axisX, axisY } = this.getRingPlaneAxes(axis);
		const offset = hit.sub(center);
		return Math.atan2(offset.dot(axisY), offset.dot(axisX));
	}

	private onMouseMove(event: LmvCanvasPointerEvent): boolean {
		if (this.drag) {
			const angle = this.pointerAngleOnPlane(this.drag.axis, event);
			if (angle === null) return true;
			const delta = angle - this.drag.startAngle;
			this.rotationQuat.copy(this.drag.startQuat);
			this.tempVec.copy(this.getRotationAxis(this.drag.axis, new THREE.Vector3()));
			this.tempMatrix.makeRotationAxis(this.tempVec, delta);
			const deltaQuat = new THREE.Quaternion().setFromRotationMatrix(this.tempMatrix);
			this.rotationQuat.multiplyQuaternions(deltaQuat, this.rotationQuat);
			this.applyModelRotation();
			this.updateDragVisuals(delta);
			this.syncGizmoToModel();
			return true;
		}

		const axis = this.pickAxis(event);
		this.setArcHighlight(axis);
		this.setCanvasCursor(axis ? 'grab' : '');
		return Boolean(axis);
	}

	private onMouseDown(event: LmvCanvasPointerEvent, button: number): boolean {
		if (button !== 0) return false;
		const axis = this.pickAxis(event);
		if (!axis) return false;

		const startAngle = this.pointerAngleOnPlane(axis, event);
		if (startAngle === null) return false;

		this.drag = {
			axis,
			startAngle,
			startQuat: this.rotationQuat.clone(),
		};
		this.setArcHighlight(axis);
		this.setCanvasCursor('grabbing');
		return true;
	}

	private onMouseUp(button: number): boolean {
		if (button !== 0 || !this.drag) return false;
		this.drag = null;
		this.clearDragVisuals();
		this.setCanvasCursor(this.hoveredAxis ? 'grab' : '');
		this.viewer.impl.invalidate(true, false, true);
		return true;
	}

	private ensureOverlay(): void {
		const impl = this.viewer.impl as Autodesk.Viewing.Viewer3DImpl & {
			overlayScenes: Record<
				string,
				{ needSeparateDepth?: boolean; scene: THREE.Scene }
			>;
			createOverlayScene: (
				name: string,
				materialPre?: THREE.Material | null,
				materialPost?: THREE.Material | null,
				camera?: THREE.Camera | null,
				needIdTarget?: boolean,
				needSeparateDepth?: boolean
			) => unknown;
		};

		const existing = impl.overlayScenes[ROTATE_GIZMO_OVERLAY_SCENE];
		if (existing && !existing.needSeparateDepth) {
			impl.removeOverlayScene(ROTATE_GIZMO_OVERLAY_SCENE);
		}
		if (!impl.overlayScenes[ROTATE_GIZMO_OVERLAY_SCENE]) {
			// Render after the building highlight overlay so arcs stay visible.
			impl.createOverlayScene(ROTATE_GIZMO_OVERLAY_SCENE, null, null, null, false, true);
		}

		impl.clearOverlay(ROTATE_GIZMO_OVERLAY_SCENE);
		impl.addOverlay(ROTATE_GIZMO_OVERLAY_SCENE, this.root);
	}

	private getToolController(): {
		registerTool: (tool: RotateGizmoTool) => void;
		deregisterTool: (tool: RotateGizmoTool) => void;
		activateTool: (name: string) => void;
		deactivateTool: (name: string) => void;
		isToolActivated?: (name: string) => boolean;
	} {
		return this.viewer.toolController as unknown as {
			registerTool: (tool: RotateGizmoTool) => void;
			deregisterTool: (tool: RotateGizmoTool) => void;
			activateTool: (name: string) => void;
			deactivateTool: (name: string) => void;
			isToolActivated?: (name: string) => boolean;
		};
	}

	private registerTool(): void {
		const tc = this.getToolController();
		if (!this.toolRegistered) {
			this.rotateTool = {
				getNames: (): string[] => [TOOL_NAME],
				getName: (): string => TOOL_NAME,
				getPriority: (): number => ROTATE_TOOL_PRIORITY,
				activate: (): void => {},
				deactivate: (): void => {},
				handleSingleClick: (): boolean => false,
				handleMouseMove: (event: LmvCanvasPointerEvent): boolean => this.onMouseMove(event),
				handleButtonDown: (event: LmvCanvasPointerEvent, button: number): boolean =>
					this.onMouseDown(event, button),
				handleButtonUp: (_event: LmvCanvasPointerEvent, button: number): boolean => this.onMouseUp(button),
				handleMouseLeave: (): boolean => {
					if (!this.active || this.drag) return Boolean(this.drag);
					this.setArcHighlight(null);
					this.setCanvasCursor('');
					return false;
				},
			};
			tc.registerTool(this.rotateTool);
			this.toolRegistered = true;
		}
		tc.activateTool(TOOL_NAME);
	}

	private unregisterTool(): void {
		if (!this.toolRegistered || !this.rotateTool) return;
		const tc = this.getToolController();
		if (tc.isToolActivated?.(TOOL_NAME)) {
			tc.deactivateTool(TOOL_NAME);
		}
		tc.deregisterTool(this.rotateTool);
		this.rotateTool = undefined;
		this.toolRegistered = false;
	}

	private bindPointerHandlers(): void {
		const target = this.viewer.container ?? this.viewer.canvas;
		if (!target || this.canvasPointerBound) return;
		target.addEventListener('mousemove', this.boundPointerMove, true);
		target.addEventListener('mousedown', this.boundPointerDown, true);
		target.addEventListener('mouseup', this.boundPointerUp, true);
		this.canvasPointerBound = true;
	}

	private unbindPointerHandlers(): void {
		const target = this.viewer.container ?? this.viewer.canvas;
		if (!target || !this.canvasPointerBound) return;
		target.removeEventListener('mousemove', this.boundPointerMove, true);
		target.removeEventListener('mousedown', this.boundPointerDown, true);
		target.removeEventListener('mouseup', this.boundPointerUp, true);
		this.unlockNavigationForDrag();
		this.canvasPointerBound = false;
	}

	private domToLmvEvent(event: MouseEvent | PointerEvent): LmvCanvasPointerEvent {
		const impl = this.viewer.impl as {
			getCanvasBoundingClientRect?: () => DOMRect;
			clientToViewport?: (clientX: number, clientY: number) => THREE.Vector3;
		};
		const rect =
			impl.getCanvasBoundingClientRect?.() ??
			(this.viewer.canvas as HTMLCanvasElement | undefined)?.getBoundingClientRect();
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

	private onPointerMove(event: MouseEvent | PointerEvent): void {
		if (!this.active) return;
		const handled = this.onMouseMove(this.domToLmvEvent(event));
		if (this.drag || handled) {
			event.preventDefault();
			event.stopPropagation();
		}
	}

	private onPointerDown(event: MouseEvent | PointerEvent): void {
		if (!this.active || event.button !== 0) return;
		if (!this.onMouseDown(this.domToLmvEvent(event), 0)) return;
		this.lockNavigationForDrag();
		event.preventDefault();
		event.stopPropagation();
		event.stopImmediatePropagation();
		const canvas = this.viewer.canvas as HTMLCanvasElement | undefined;
		if (canvas && 'pointerId' in event) {
			canvas.setPointerCapture(event.pointerId);
			this.capturedPointerId = event.pointerId;
		}
	}

	private onPointerUp(event: MouseEvent | PointerEvent): void {
		if (!this.active) return;
		this.onMouseUp(event.button);
		this.unlockNavigationForDrag();
		const canvas = this.viewer.canvas as HTMLCanvasElement | undefined;
		if (canvas && 'pointerId' in event && this.capturedPointerId === event.pointerId) {
			try {
				canvas.releasePointerCapture(event.pointerId);
			} catch {
				// Pointer may already be released.
			}
			this.capturedPointerId = null;
		}
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

	private setCanvasCursor(cursor: string): void {
		const canvas = this.viewer.canvas as HTMLCanvasElement | undefined;
		if (canvas) canvas.style.cursor = cursor;
	}

	private disposeGroup(group: THREE.Object3D): void {
		const children = [...group.children];
		for (const child of children) {
			if (this.sectorMesh && child === this.sectorMesh) continue;
			group.remove(child);
			this.disposeObject3D(child);
		}
	}

	private disposeObject3D(object: THREE.Object3D): void {
		object.traverse(child => {
			const mesh = child as THREE.Mesh;
			if (mesh.geometry) mesh.geometry.dispose();
			const mat = mesh.material;
			if (!mat) return;
			const mats = Array.isArray(mat) ? mat : [mat];
			for (const m of mats) {
				m.dispose();
			}
		});
	}
}

const getController = (viewer: Autodesk.Viewing.GuiViewer3D): PriyamRotateGizmoController => {
	let controller = controllers.get(viewer);
	if (!controller) {
		controller = new PriyamRotateGizmoController(viewer);
		controllers.set(viewer, controller);
	}
	return controller;
};

export const activatePriyamRotateGizmo = (viewer: Autodesk.Viewing.GuiViewer3D): boolean =>
	getController(viewer).activate();

export const deactivatePriyamRotateGizmo = (viewer: Autodesk.Viewing.GuiViewer3D): void => {
	getController(viewer).deactivate();
};

export const isPriyamRotateGizmoActive = (viewer: Autodesk.Viewing.GuiViewer3D): boolean =>
	getController(viewer).isActive();

export const togglePriyamRotateGizmo = (
	viewer: Autodesk.Viewing.GuiViewer3D,
	enable?: boolean
): boolean => {
	const controller = getController(viewer);
	const shouldEnable = enable ?? !controller.isActive();
	if (!shouldEnable) {
		controller.deactivate();
		return false;
	}
	return controller.activate();
};
