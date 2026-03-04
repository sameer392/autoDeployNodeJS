-- Migration: Add resource_stats table for Per Minute/Hour/Day graphs
-- Run this manually if your database was created before this table was added:
--   docker exec -i hosting-mysql mysql -u hosting -p hosting_panel < infra/mysql/migrations/add_resource_stats.sql

CREATE TABLE IF NOT EXISTS `resource_stats` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `project_id` INT UNSIGNED NOT NULL,
  `container_id` VARCHAR(64) NOT NULL,
  `role` VARCHAR(64) NOT NULL,
  `cpu` DECIMAL(8,2) NOT NULL DEFAULT 0,
  `memory_mb` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `recorded_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_resource_stats_project_recorded` (`project_id`, `recorded_at`, `role`),
  KEY `idx_resource_stats_recorded` (`recorded_at`),
  CONSTRAINT `fk_resource_stats_project` FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
