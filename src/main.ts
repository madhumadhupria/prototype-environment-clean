import '../extension/ViewerEnvironmentExtension';
import { VIEWER_ENVIRONMENT_EXTENSION_ID } from '../extension/ViewerEnvironmentExtension';
import { applyCadBimBackdrop } from '../extension/applyViewerEnvironment';
import { loadConfig } from './config';

const statusEl = document.getElementById('status');

const setStatus = (message: string): void => {
	if (statusEl) statusEl.textContent = message;
};

const fetchAccessToken = async (
	tokenUrl: string,
	onTokenReady: (token: string, expiresIn: number) => void
): Promise<void> => {
	const response = await fetch(tokenUrl);
	if (!response.ok) {
		throw new Error(`Token request failed (${response.status})`);
	}
	const payload = (await response.json()) as { access_token?: string; expires_in?: number };
	if (!payload.access_token) {
		throw new Error('Token response missing access_token');
	}
	onTokenReady(payload.access_token, payload.expires_in ?? 3600);
};

/** Prefer an explicit 3D geometry view — avoids site/2D defaults that can look like a flat map. */
const getPrimary3dViewable = (doc: Autodesk.Viewing.Document): Autodesk.Viewing.BubbleNode | null => {
	const root = doc.getRoot();
	const threeD = root.search({ type: 'geometry', role: '3d' }) as Autodesk.Viewing.BubbleNode[];
	if (threeD.length > 0) {
		return threeD[0];
	}
	return root.getDefaultGeometry(true);
};

const init = async (): Promise<void> => {
	if (!window.Autodesk?.Viewing) {
		setStatus('APS Viewer failed to load.');
		return;
	}

	let config;
	try {
		config = await loadConfig();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		setStatus(message);
		return;
	}

	if (!config.modelUrn) {
		setStatus('Set modelUrn in public/config.json (see README).');
		return;
	}

	Autodesk.Viewing.Initializer(
		{
			env: config.apsEnv,
			api: 'streamingV2',
			getAccessToken: (callback: (accessToken: string, expires: number) => void) => {
				void fetchAccessToken(config.tokenUrl, callback).catch((error: unknown) => {
					const message = error instanceof Error ? error.message : String(error);
					setStatus(`Auth failed: ${message}`);
				});
			},
		},
		() => {
			const container = document.getElementById('viewer');
			if (!container) {
				setStatus('Viewer container not found.');
				return;
			}

			const viewer = new Autodesk.Viewing.GuiViewer3D(container, {
				disabledExtensions: {
					measure: true,
					section: true,
					'Autodesk.Geolocation': true,
				},
			});
			viewer.start();
			applyCadBimBackdrop(viewer);
			(window as unknown as { viewer?: Autodesk.Viewing.GuiViewer3D }).viewer = viewer;

			void viewer.loadExtension(VIEWER_ENVIRONMENT_EXTENSION_ID).catch((error: unknown) => {
				const message = error instanceof Error ? error.message : String(error);
				setStatus(`Extension failed: ${message}`);
			});

			setStatus('Loading model…');

			Autodesk.Viewing.Document.load(
				`urn:${config.modelUrn}`,
				(doc) => {
					const viewable = getPrimary3dViewable(doc);
					if (!viewable) {
						setStatus('No 3D view in document.');
						return;
					}

					viewer
						.loadDocumentNode(doc, viewable)
						.then(() => {
							const onReady = (): void => setStatus('');
							if (viewer.model?.isLoadDone?.()) {
								onReady();
							} else {
								viewer.addEventListener(Autodesk.Viewing.GEOMETRY_LOADED_EVENT, onReady, { once: true });
							}
						})
						.catch((error: unknown) => {
							const message = error instanceof Error ? error.message : String(error);
							setStatus(`Model load failed: ${message}`);
						});
				},
				(_code, message) => {
					setStatus(`Document failed: ${message}`);
				}
			);
		}
	);
};

void init();
