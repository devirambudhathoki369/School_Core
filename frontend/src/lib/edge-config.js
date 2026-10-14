import { get as edgeGet } from '@vercel/edge-config';

const isProd = process.env.NODE_ENV === 'production';

export async function getConfig(key) {
    // Only use Vercel Edge Config when its connection string is actually
    // present (i.e. running on Vercel). Anywhere else — local `next start`,
    // a self-hosted box, Cloudflare — fall back to the MAINTENANCE env var so
    // the middleware never throws for a missing EDGE_CONFIG.
    if (isProd && process.env.EDGE_CONFIG) {
        return await edgeGet(key);
    }

    const localConfig = {
        maintenance: process.env.MAINTENANCE ?? 'off',
    };

    return localConfig[key];
}