const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/compressed', express.static('compressed'));

// Multer config — store in memory for direct Sharp processing
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and WebP images are supported.'));
    }
  }
});

app.post('/compress', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded.' });

    const quality = parseInt(req.body.quality) || 75;
    const format = req.body.format || 'jpeg';
    const maxWidth = parseInt(req.body.maxWidth) || 0;

    const originalSize = req.file.size;
    const originalName = path.parse(req.file.originalname).name;
    const outputFilename = `${originalName}_compressed_${Date.now()}.${format}`;
    const outputPath = path.join(__dirname, 'compressed', outputFilename);

    let pipeline = sharp(req.file.buffer);

    if (maxWidth > 0) {
      pipeline = pipeline.resize({ width: maxWidth, withoutEnlargement: true });
    }

    if (format === 'jpeg') {
      pipeline = pipeline.jpeg({ quality, mozjpeg: true });
    } else if (format === 'png') {
      pipeline = pipeline.png({ quality, compressionLevel: 9 });
    } else if (format === 'webp') {
      pipeline = pipeline.webp({ quality });
    }

    const outputBuffer = await pipeline.toBuffer();
    fs.writeFileSync(outputPath, outputBuffer);

    const compressedSize = outputBuffer.length;
    const savings = (((originalSize - compressedSize) / originalSize) * 100).toFixed(1);

    const meta = await sharp(outputBuffer).metadata();

    res.json({
      success: true,
      originalSize,
      compressedSize,
      savings: parseFloat(savings),
      width: meta.width,
      height: meta.height,
      format: meta.format,
      downloadUrl: `/compressed/${outputFilename}`,
      filename: outputFilename
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Compression failed.' });
  }
});

function cleanOldFiles() {
  const dir = path.join(__dirname, 'compressed');
  const now = Date.now();
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (now - stat.mtimeMs > 3600000) fs.unlinkSync(filePath);
  });
}
cleanOldFiles();
setInterval(cleanOldFiles, 1800000);

app.listen(PORT, () => {
  console.log(`🚀 Image Compressor running at http://localhost:${PORT}`);
});
