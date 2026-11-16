import type { PreviewMode } from './settings';

export const DEVICE_PREVIEWS = {
  mobile: { label: '手机', aspect: 1470 / 3000 },
  pad: { label: 'iPad', aspect: 2300 / 3000 },
} satisfies Record<PreviewMode, { label: string; aspect: number }>;
