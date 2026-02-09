import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

async function extractFavicon() {
  const logoPath = path.join(rootDir, 'apps/extension/assets/kaizen-logo.png');

  // Get image metadata
  const metadata = await sharp(logoPath).metadata();
  console.log('Logo dimensions:', metadata.width, 'x', metadata.height);

  // The "k" is on the left side, extract it
  // Based on the logo proportions, the "k" takes roughly 400px of 2498px width
  const kWidth = Math.round(metadata.height * 0.7); // Make it roughly square-ish crop

  // Extract the "k" portion (left side of logo)
  const kCrop = await sharp(logoPath)
    .extract({
      left: 0,
      top: 0,
      width: kWidth,
      height: metadata.height
    })
    .toBuffer();

  // Create a square version by padding or fitting into a square
  const squareSize = metadata.height;
  const squareK = await sharp(kCrop)
    .resize(squareSize, squareSize, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .toBuffer();

  // Save favicon sizes for extension
  const extensionAssetsDir = path.join(rootDir, 'apps/extension/assets');

  // Main icon.png for extension (512x512)
  await sharp(squareK)
    .resize(512, 512)
    .png()
    .toFile(path.join(extensionAssetsDir, 'icon.png'));
  console.log('Created: apps/extension/assets/icon.png (512x512)');

  // Save favicon for web
  const webPublicDir = path.join(rootDir, 'apps/web/public');

  // favicon.ico equivalent as PNG (browsers support PNG favicons)
  await sharp(squareK)
    .resize(32, 32)
    .png()
    .toFile(path.join(webPublicDir, 'favicon.png'));
  console.log('Created: apps/web/public/favicon.png (32x32)');

  // Larger favicon for modern browsers
  await sharp(squareK)
    .resize(192, 192)
    .png()
    .toFile(path.join(webPublicDir, 'favicon-192.png'));
  console.log('Created: apps/web/public/favicon-192.png (192x192)');

  await sharp(squareK)
    .resize(512, 512)
    .png()
    .toFile(path.join(webPublicDir, 'favicon-512.png'));
  console.log('Created: apps/web/public/favicon-512.png (512x512)');

  // Apple touch icon
  await sharp(squareK)
    .resize(180, 180)
    .png()
    .toFile(path.join(webPublicDir, 'apple-touch-icon.png'));
  console.log('Created: apps/web/public/apple-touch-icon.png (180x180)');

  console.log('\nDone! Favicon extracted from the "k" in the logo.');
}

extractFavicon().catch(console.error);
