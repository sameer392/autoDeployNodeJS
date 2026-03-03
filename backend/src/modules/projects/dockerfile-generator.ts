import * as path from 'path';
import * as fs from 'fs/promises';

export type ProjectType = 'nextjs' | 'nestjs' | 'vite' | 'cra' | 'express' | 'unknown';

export interface ProjectInfo {
  rootPath: string;
  projectType: ProjectType;
  internalPort: number;
  hasDockerfile: boolean;
  hasStartScript?: boolean;
}

interface PackageJson {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const DOCKERFILE_NEXTJS = `# Auto-generated for Next.js
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
`;

const DOCKERFILE_NEXTJS_NO_STANDALONE = `# Auto-generated for Next.js (non-standalone)
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
EXPOSE 3000
ENV PORT=3000
CMD ["npm", "start"]
`;

const DOCKERFILE_NESTJS = `# Auto-generated for NestJS
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
EXPOSE 3000
ENV PORT=3000
CMD ["node", "dist/main.js"]
`;

const DOCKERFILE_VITE = `# Auto-generated for Vite (React, Vue, Svelte)
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine AS runner
COPY --from=builder /app/dist /usr/share/nginx/html
RUN echo 'server { listen 80; root /usr/share/nginx/html; index index.html; location / { try_files $uri $uri/ /index.html; } }' > /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
`;

const DOCKERFILE_CRA = `# Auto-generated for Create React App
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine AS runner
COPY --from=builder /app/build /usr/share/nginx/html
RUN echo 'server { listen 80; root /usr/share/nginx/html; index index.html; location / { try_files $uri $uri/ /index.html; } }' > /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
`;

function getExpressDockerfile(hasStartScript: boolean): string {
  const cmd = hasStartScript ? 'CMD ["npm", "start"]' : 'CMD ["node", "index.js"]';
  return `# Auto-generated for Node.js / Express
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 3000
ENV PORT=3000
${cmd}
`;
}

/**
 * Finds the project root (directory containing package.json).
 * Handles ZIPs that extract to a single top-level folder.
 */
export async function findProjectRoot(buildDir: string): Promise<string> {
  const entries = await fs.readdir(buildDir, { withFileTypes: true });
  const pkgPath = path.join(buildDir, 'package.json');
  const hasPkgHere = await fs
    .access(pkgPath)
    .then(() => true)
    .catch(() => false);
  if (hasPkgHere) return buildDir;

  // Single subdirectory (e.g. user zipped "my-app" folder)
  if (entries.length === 1 && entries[0].isDirectory()) {
    const subPath = path.join(buildDir, entries[0].name);
    const subPkg = path.join(subPath, 'package.json');
    const hasSubPkg = await fs
      .access(subPkg)
      .then(() => true)
      .catch(() => false);
    if (hasSubPkg) return subPath;
  }

  throw new Error(
    'No package.json found. Please upload a ZIP containing your Node.js project (React, Next.js, NestJS, etc.).',
  );
}

/**
 * Detects project type from package.json and returns build info.
 */
export async function detectProject(rootPath: string): Promise<ProjectInfo> {
  const pkgPath = path.join(rootPath, 'package.json');
  const pkgRaw = await fs.readFile(pkgPath, 'utf-8');
  let pkg: PackageJson;
  try {
    pkg = JSON.parse(pkgRaw);
  } catch {
    throw new Error('Invalid package.json');
  }

  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const has = (name: string) => !!deps[name];

  const dockerfilePath = path.join(rootPath, 'Dockerfile');
  const hasDockerfile = await fs
    .access(dockerfilePath)
    .then(() => true)
    .catch(() => false);

  // Next.js
  if (has('next')) {
    return {
      rootPath,
      projectType: 'nextjs',
      internalPort: 3000,
      hasDockerfile,
    };
  }

  // NestJS
  if (has('@nestjs/core')) {
    return {
      rootPath,
      projectType: 'nestjs',
      internalPort: 3000,
      hasDockerfile,
    };
  }

  // Vite (React, Vue, Svelte)
  if (has('vite')) {
    return {
      rootPath,
      projectType: 'vite',
      internalPort: 80,
      hasDockerfile,
    };
  }

  // Create React App
  if (has('react-scripts')) {
    return {
      rootPath,
      projectType: 'cra',
      internalPort: 80,
      hasDockerfile,
    };
  }

  // Express or generic Node
  if (has('express') || pkg.scripts?.start) {
    return {
      rootPath,
      projectType: 'express',
      internalPort: 3000,
      hasDockerfile,
      hasStartScript: !!pkg.scripts?.start,
    };
  }

  throw new Error(
    'Could not detect project type. Supported: React (Vite/CRA), Next.js, NestJS, Express. Ensure package.json has proper dependencies.',
  );
}

async function hasNextStandalone(rootPath: string): Promise<boolean> {
  for (const name of ['next.config.js', 'next.config.mjs', 'next.config.ts']) {
    try {
      const content = await fs.readFile(path.join(rootPath, name), 'utf-8');
      if (content.includes('output:') && content.includes('standalone'))
        return true;
    } catch {
      /* file not found */
    }
  }
  return false;
}

/**
 * Generates and writes Dockerfile if not present.
 * Returns the Dockerfile content used (for logging).
 */
export async function ensureDockerfile(info: ProjectInfo): Promise<string> {
  if (info.hasDockerfile) {
    return '(using existing Dockerfile)';
  }

  const dockerfilePath = path.join(info.rootPath, 'Dockerfile');
  let content: string;

  switch (info.projectType) {
    case 'nextjs':
      content = (await hasNextStandalone(info.rootPath))
        ? DOCKERFILE_NEXTJS
        : DOCKERFILE_NEXTJS_NO_STANDALONE;
      break;
    case 'nestjs':
      content = DOCKERFILE_NESTJS;
      break;
    case 'vite':
      content = DOCKERFILE_VITE;
      break;
    case 'cra':
      content = DOCKERFILE_CRA;
      break;
    case 'express':
      content = getExpressDockerfile(info.hasStartScript ?? true);
      break;
    default:
      throw new Error(`No Dockerfile template for project type: ${info.projectType}`);
  }

  await fs.writeFile(dockerfilePath, content, 'utf-8');
  return content;
}
