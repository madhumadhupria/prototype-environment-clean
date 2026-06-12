import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '');
	// Root path locally; subpath on GitHub Pages (see deploy-pages.yml).
	const base =
		mode === 'development'
			? '/'
			: (env.VITE_BASE_PATH ?? '/prototype-environment-clean/');

	return {
		base,
		resolve: {
			alias: {
				'@extension': path.resolve(__dirname, 'extension'),
			},
		},
		server: {
			port: 5173,
			proxy:
				mode === 'development' || env.VITE_TOKEN_URL?.startsWith('/')
					? {
							'/api': {
								target: 'http://127.0.0.1:3001',
								changeOrigin: true,
							},
						}
					: undefined,
		},
	};
});
