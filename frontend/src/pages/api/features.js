import { promises as fs } from 'fs';
import path from 'path';

export default async function handler(req, res) {
    try {
        const filePath = path.join(process.cwd(), 'src', 'data', 'features.json');
        const jsonData = await fs.readFile(filePath, 'utf8');
        const data = JSON.parse(jsonData);
        res.status(200).json(data);
    } catch (error) {
        // console.error('Error reading features data:', error);
        res.status(500).json({ error: 'Error reading features data' });
    }
}