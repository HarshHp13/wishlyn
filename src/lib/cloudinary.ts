const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

/**
 * Build an optimized Cloudinary delivery URL from a public ID.
 *
 * If no cloud name is configured, or the src already looks like a local path / full URL,
 * returns the src unchanged so local images keep working.
 */
export function cloudinaryUrl(
  publicId: string,
  options: { width?: number; height?: number; quality?: string; format?: string } = {}
): string {
  // Pass through local paths and full URLs
  if (!cloudName || publicId.startsWith('/') || publicId.startsWith('http')) {
    return publicId;
  }

  const { width, height, quality = 'auto', format = 'auto' } = options;

  const transforms: string[] = [`f_${format}`, `q_${quality}`];
  if (width) transforms.push(`w_${width}`);
  if (height) transforms.push(`h_${height}`);
  transforms.push('c_fill');

  return `https://res.cloudinary.com/${cloudName}/image/upload/${transforms.join(',')}/${publicId}`;
}
