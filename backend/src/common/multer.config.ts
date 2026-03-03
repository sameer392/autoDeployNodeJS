import { diskStorage } from 'multer';
import { extname } from 'path';

export const multerConfig = {
  storage: diskStorage({
    destination: process.env.UPLOAD_DIR || '/tmp/uploads',
    filename: (req, file, cb) => {
      const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      cb(null, `${unique}${extname(file.originalname) || '.zip'}`);
    },
  }),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (req, file, cb) => {
    const ok = /\.(zip|tar\.gz)$/i.test(file.originalname) || file.mimetype === 'application/zip';
    cb(null, !!ok);
  },
};
