import { diskStorage, FileFilterCallback } from 'multer';
import { extname } from 'path';
import { Request } from 'express';

export const multerConfig = {
  storage: diskStorage({
    destination: process.env.UPLOAD_DIR || '/tmp/uploads',
    filename: (_req: Request, file: Express.Multer.File, cb: (err: Error | null, filename: string) => void) => {
      const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      cb(null, `${unique}${extname(file.originalname) || '.zip'}`);
    },
  }),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    const ok = /\.(zip|tar\.gz)$/i.test(file.originalname) || file.mimetype === 'application/zip';
    cb(null, !!ok);
  },
};
