import { applyCadBimVisuals } from '../extension/applyViewerEnvironment';
import { applyCadBimHomeView } from '../extension/viewerEnvironmentCamera';
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

const hideToolbar = (viewer: Autodesk.Viewing.GuiViewer3D): void => {
	viewer.addEventListener(Autodesk.Viewing.TOOLBAR_CREATED_EVENT, () => {
		const toolbar = viewer.getToolbar(false);
		const container = toolbar?.container as HTMLElement | undefined;
		if (container) container.style.display = 'none';
	});
};

const applyEnvironment = (viewer: Autodesk.Viewing.GuiViewer3D): void => {
	applyCadBimVisuals(viewer);
	applyCadBimHomeView(viewer, { once: true, skipTransition: true });
	setStatus('');
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
				disabledExtensions: { measure: true, section: true },
			});
			hideToolbar(viewer);
			viewer.start();
			(window as unknown as { viewer?: Autodesk.Viewing.GuiViewer3D }).viewer = viewer;

			setStatus('Loading model…');

			Autodesk.Viewing.Document.load(
				`urn:${config.modelUrn}`,
				(doc) => {
					const defaultViewable = doc.getRoot().getDefaultGeometry(true);
					if (!defaultViewable) {
						setStatus('No default 3D view in document.');
						return;
					}

					viewer
						.loadDocumentNode(doc, defaultViewable)
						.then(() => {
							const onReady = (): void => applyEnvironment(viewer);
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
