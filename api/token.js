/** Vercel serverless — issues 2-legged APS tokens. Set APS_CLIENT_ID and APS_CLIENT_SECRET in Vercel env. */

const ALLOWED_ORIGINS = [
	'https://madhumadhupria.github.io',
	'http://localhost:5173',
	'http://127.0.0.1:5173',
];

export default async function handler(req, res) {
	const origin = req.headers.origin;
	if (origin && ALLOWED_ORIGINS.includes(origin)) {
		res.setHeader('Access-Control-Allow-Origin', origin);
	}
	res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

	if (req.method === 'OPTIONS') {
		res.status(204).end();
		return;
	}

	if (req.method !== 'GET') {
		res.status(405).json({ error: 'Method not allowed' });
		return;
	}

	const clientId = process.env.APS_CLIENT_ID;
	const clientSecret = process.env.APS_CLIENT_SECRET;
	if (!clientId || !clientSecret) {
		res.status(500).json({ error: 'APS credentials not configured' });
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
	if (!tokenResponse.ok) {
		res.status(tokenResponse.status).json({ error: data });
		return;
	}

	res.status(200).json({
		access_token: data.access_token,
		expires_in: data.expires_in,
	});
}
