#!/usr/bin/env node
/** Writes public/config.json from env (local .env or GitHub Actions). */
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const loadEnv = () => {
	const envPath = resolve(process.cwd(), '.env');
	if (!existsSync(envPath)) return;
	for (const line of readFileSync(envPath, 'utf8').split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const eq = trimmed.indexOf('=');
		if (eq === -1) continue;
		const key = trimmed.slice(0, eq).trim();
		const value = trimmed.slice(eq + 1).trim();
		if (!process.env[key]) process.env[key] = value;
	}
};

loadEnv();

const config = {
	modelUrn: process.env.MODEL_URN ?? process.env.VITE_MODEL_URN ?? '',
	tokenUrl: process.env.TOKEN_URL ?? process.env.VITE_TOKEN_URL ?? '/api/token',
	apsEnv: process.env.APS_ENV ?? process.env.VITE_APS_ENV ?? 'AutodeskProduction',
};

writeFileSync(resolve(process.cwd(), 'public/config.json'), `${JSON.stringify(config, null, 2)}\n`);
console.info('Wrote public/config.json', config);
