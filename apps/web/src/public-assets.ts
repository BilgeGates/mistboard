const DEV_PUBLIC_ARTIFACT_DIRS = new Set([
  'bakeoff',
  'belief-replays',
  'pixel-lab',
  'pixel-lab-assets',
]);

export const INCLUDE_DEV_PUBLIC_ARTIFACTS_ENV = 'MISTBOARD_INCLUDE_DEV_PUBLIC_ARTIFACTS';

export function shouldCopyPublicAsset(
  relativePath: string,
  includeDevPublicArtifacts = false,
): boolean {
  if (includeDevPublicArtifacts) return true;

  const firstSegment = relativePath.replaceAll('\\', '/').split('/').filter(Boolean)[0];

  if (!firstSegment) return true;
  if (DEV_PUBLIC_ARTIFACT_DIRS.has(firstSegment)) return false;
  return !firstSegment.startsWith('bakeoff-');
}
