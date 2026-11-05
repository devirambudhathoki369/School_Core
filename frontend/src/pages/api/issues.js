// Compatibility acknowledgement for older clients. Diagnostics are collected
// by Sentry; an anonymous endpoint must not expose a credentialed Redis writer.
export const config = { api: { bodyParser: { sizeLimit: '8kb' } } };

export default function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method not allowed' });
    }
    return res.status(200).json({});
}
