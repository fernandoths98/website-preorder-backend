import sharp from 'sharp';
import { validatedImage } from './validated-image';
describe('uploaded images', () => {
  it('rejects executable/non-image bytes even when a caller labels them WebP', async () => {
    await expect(
      validatedImage(Buffer.from('<svg onload="alert(1)"></svg>')),
    ).rejects.toThrow();
    await expect(
      validatedImage(Buffer.from('<html>bad</html>')),
    ).rejects.toThrow();
  });
  it('checks decoded dimensions and rewrites accepted images to WebP', async () => {
    const data = await sharp({
      create: { width: 1600, height: 600, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer();
    const encoded = await validatedImage(data, { width: 1600, height: 600 });
    expect((await sharp(encoded).metadata()).format).toBe('webp');
    await expect(
      validatedImage(data, { width: 600, height: 1600 }),
    ).rejects.toThrow();
  });
});
