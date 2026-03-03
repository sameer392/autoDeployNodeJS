-- AutoDeploy Hosting Panel - MySQL Schema
-- Clean architecture with relational design

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================
-- ADMINS
-- ============================================
CREATE TABLE IF NOT EXISTS `admins` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `email` VARCHAR(255) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `name` VARCHAR(255) NOT NULL DEFAULT '',
  `role` ENUM('admin', 'super_admin') NOT NULL DEFAULT 'admin',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `last_login_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_admins_email` (`email`),
  KEY `idx_admins_is_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- PROJECTS
-- ============================================
CREATE TABLE IF NOT EXISTS `projects` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `admin_id` INT UNSIGNED NOT NULL,
  `name` VARCHAR(63) NOT NULL,
  `slug` VARCHAR(63) NOT NULL,
  `description` TEXT NULL,
  `source_type` ENUM('zip', 'git') NOT NULL DEFAULT 'zip',
  `source_url` VARCHAR(512) NULL COMMENT 'Git URL or path to uploaded ZIP',
  `dockerfile_path` VARCHAR(255) NOT NULL DEFAULT 'Dockerfile',
  `build_context` VARCHAR(512) NOT NULL DEFAULT '.',
  `image_name` VARCHAR(255) NULL,
  `image_tag` VARCHAR(63) NULL DEFAULT 'latest',
  `container_id` VARCHAR(64) NULL,
  `internal_port` INT UNSIGNED NOT NULL,
  `memory_limit_mb` INT UNSIGNED NOT NULL DEFAULT 512,
  `cpu_limit` DECIMAL(5,2) NOT NULL DEFAULT 1.00,
  `status` ENUM('pending', 'building', 'running', 'stopped', 'error', 'deleted') NOT NULL DEFAULT 'pending',
  `error_message` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_projects_slug` (`slug`),
  KEY `idx_projects_internal_port` (`internal_port`),
  KEY `idx_projects_admin_id` (`admin_id`),
  KEY `idx_projects_status` (`status`),
  KEY `idx_projects_container_id` (`container_id`),
  CONSTRAINT `fk_projects_admin` FOREIGN KEY (`admin_id`) REFERENCES `admins` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- DOMAINS (subdomain, domain, or wildcard)
-- ============================================
CREATE TABLE IF NOT EXISTS `domains` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `project_id` INT UNSIGNED NOT NULL,
  `domain` VARCHAR(255) NOT NULL,
  `type` ENUM('domain', 'subdomain', 'wildcard') NOT NULL DEFAULT 'domain',
  `is_primary` TINYINT(1) NOT NULL DEFAULT 0,
  `ssl_enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `ssl_status` ENUM('pending', 'active', 'failed', 'disabled') NULL DEFAULT 'pending',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_domains_domain` (`domain`),
  KEY `idx_domains_project_id` (`project_id`),
  KEY `idx_domains_type` (`type`),
  CONSTRAINT `fk_domains_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- PROJECT ENVIRONMENT VARIABLES
-- ============================================
CREATE TABLE IF NOT EXISTS `project_env_vars` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `project_id` INT UNSIGNED NOT NULL,
  `key` VARCHAR(255) NOT NULL,
  `value` TEXT NOT NULL,
  `is_secret` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_project_env_project_key` (`project_id`, `key`),
  KEY `idx_project_env_project_id` (`project_id`),
  CONSTRAINT `fk_project_env_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- LOGS (optional - container events, build logs)
-- ============================================
CREATE TABLE IF NOT EXISTS `logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `project_id` INT UNSIGNED NULL,
  `type` ENUM('build', 'deploy', 'container', 'system', 'auth') NOT NULL,
  `level` ENUM('debug', 'info', 'warn', 'error') NOT NULL DEFAULT 'info',
  `message` TEXT NOT NULL,
  `metadata` JSON NULL,
  `admin_id` INT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_logs_project_id` (`project_id`),
  KEY `idx_logs_type` (`type`),
  KEY `idx_logs_created_at` (`created_at`),
  KEY `idx_logs_admin_id` (`admin_id`),
  CONSTRAINT `fk_logs_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_logs_admin` FOREIGN KEY (`admin_id`) REFERENCES `admins` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- PORT ALLOCATION TRACKER
-- ============================================
CREATE TABLE IF NOT EXISTS `port_allocations` (
  `port` INT UNSIGNED NOT NULL,
  `project_id` INT UNSIGNED NOT NULL,
  `allocated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`port`),
  KEY `idx_port_allocations_project` (`project_id`),
  CONSTRAINT `fk_port_allocations_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- Default admin (password: Admin123!) - created automatically on fresh install
INSERT INTO `admins` (`email`, `password_hash`, `name`, `role`) VALUES
('admin@localhost', '$2b$10$/cUrcOc3RFatqEnjkCHf4udOY82FBtTXTfwhNhf/ffK7oP9/JyERm', 'Admin', 'super_admin')
ON DUPLICATE KEY UPDATE `email` = `email`;
