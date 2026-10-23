import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';
/** Decode and re-encode: MIME and client-provided dimensions are not trusted. */
export async function validatedImage(
  buffer: Buffer,
  dimensions?: { width: number; height: number },
): Promise<Buffer> {
  try {
    const input = sharp(buffer, {
      limitInputPixels: 16_000_000,
      failOn: 'warning',
      animated: false,
    });
    const meta = await input.metadata();
    if (
      !['jpeg', 'png', 'webp'].includes(meta.format ?? '') ||
      (meta.pages ?? 1) !== 1
    )
      throw new Error('format');
    if (
      dimensions &&
      (meta.width !== dimensions.width || meta.height !== dimensions.height)
    )
      throw new Error('dimensions');
    return await input.rotate().webp({ quality: 88 }).toBuffer();
  } catch {
    throw new BadRequestException(
      dimensions
        ? `Gambar tidak valid. Gunakan JPG/PNG/WebP ${dimensions.width}×${dimensions.height} px.`
        : 'Foto tidak valid. Gunakan gambar WebP yang dapat dibuka, maksimal 16 megapiksel.',
    );
  }
}
