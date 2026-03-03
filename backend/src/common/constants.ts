/**
 * Application-wide constants
 */

// Project name validation: alphanumeric, hyphens, underscores, 3-63 chars
export const PROJECT_NAME_REGEX = /^[a-z0-9][a-z0-9-_]{2,62}$/;

// Domain validation (domain, subdomain, or wildcard *.domain.tld)
export const DOMAIN_REGEX =
  /^(?:\*\.)?([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.[a-z]{2,}$/i;

// Internal port range (avoid privileged ports)
export const PORT_MIN = 10000;
export const PORT_MAX = 65535;

// Resource limits
export const MAX_MEMORY_MB = 4096;
export const MAX_CPU = 4;
export const DEFAULT_MEMORY_MB = 512;
export const DEFAULT_CPU = 1;

// Traefik network
export const TRAEFIK_NETWORK = process.env.TRAEFIK_NETWORK || 'hosting_network';
