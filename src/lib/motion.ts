export type MotionProfile = 'soft' | 'expressive' | 'reduced';
export const cameraEase = (progress: number) => progress < .5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
export const reflowEase = (progress: number) => 1 - (1 - Math.max(0, Math.min(1, progress))) ** 3;

export const motionProfiles: { id: MotionProfile; label: string; description: string }[] = [
  { id: 'soft', label: 'Suave', description: 'Transições leves e foco tranquilo' },
  { id: 'expressive', label: 'Expressivo', description: 'Ramos desenhados e entradas com presença' },
  { id: 'reduced', label: 'Reduzido', description: 'Sem deslocamentos ou animações de entrada' },
];

export function motionTiming(profile: MotionProfile) {
  return profile === 'expressive'
    ? { node: 480, line: 340, branchGap: 24, depthGap: 18, camera: 650, reflow: 520 }
    : profile === 'soft'
      ? { node: 320, line: 240, branchGap: 14, depthGap: 10, camera: 450, reflow: 350 }
      : { node: 0, line: 0, branchGap: 0, depthGap: 0, camera: 0, reflow: 0 };
}
