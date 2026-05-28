#!/usr/bin/env node
/**
 * Local token server for `npm run dev`.
 * Loads APS_CLIENT_ID / APS_CLIENT_SECRET from .env (KEY=value lines).
 */
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
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

const clientId = process.env.APS_CLIENT_ID;
const clientSecret = process.env.APS_CLIENT_SECRET;
const port = Number(process.env.TOKEN_SERVER_PORT ?? 3001);

if (!clientId || !clientSecret) {
	console.error('Set APS_CLIENT_ID and APS_CLIENT_SECRET in .env');
	process.exit(1);
}

const server = http.createServer(async (req, res) => {
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
	if (req.method === 'OPTIONS') {
		res.writeHead(204);
		res.end();
		return;
	}
	if (req.url !== '/api/token') {
		res.writeHead(404);
		res.end('Not found');
		return;
	}

	const body = new URLSearchParams({
		client_id: clientId,
		client_secret: clientSecret,
		grant_type: 'client_credentials',
		scope: 'data:read viewables:read',
	});

	const tokenResponse = await fetch('https://developer.api.autodesk.com/authentication/v2/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body,
	});
	const data = await tokenResponse.json();
	res.writeHead(tokenResponse.status, { 'Content-Type': 'application/json' });
	res.end(JSON.stringify(data));
});

server.listen(port, () => {
	console.info(`Token server http://127.0.0.1:${port}/api/token`);
});
