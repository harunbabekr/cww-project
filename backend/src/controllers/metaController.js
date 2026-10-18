import { getFeatures } from '../utils/features.js';
import { getIceServers } from '../services/iceService.js';

export const features = (req, res) => res.json({ success: true, features: getFeatures() });
export const ice = async (req, res) => res.json({ success: true, iceServers: await getIceServers() });
