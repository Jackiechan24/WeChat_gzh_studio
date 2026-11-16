import type { PreviewMode } from './settings';
import phoneFrame from '../assets/phone-frame.png';
import ipadFrame from '../assets/ipad-frame.png';

export const DEVICE_PREVIEWS = {
  mobile: { label: '手机', frame: phoneFrame, aspect: 1470 / 3000 },
  pad: { label: 'iPad', frame: ipadFrame, aspect: 2300 / 3000 },
} satisfies Record<PreviewMode, { label: string; frame: string; aspect: number }>;
