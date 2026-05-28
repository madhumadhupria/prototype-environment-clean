export interface AppConfig {
	modelUrn: string;
	tokenUrl: string;
	apsEnv: string;
}

const configUrl = `${import.meta.env.BASE_URL}config.json`;

export const loadConfig = async (): Promise<AppConfig> => {
	const response = await fetch(configUrl, { cache: 'no-store' });
	if (!response.ok) {
		throw new Error(`Failed to load config (${response.status})`);
	}
	return (await response.json()) as AppConfig;
};
