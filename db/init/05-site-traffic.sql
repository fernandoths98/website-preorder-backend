-- Run once against the configured application database before deploying traffic tracking.
CREATE TABLE IF NOT EXISTS site_page_views (
  event_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  visitor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  session_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  path VARCHAR(200) NOT NULL,
  source VARCHAR(16) NOT NULL,
  device VARCHAR(8) NOT NULL,
  viewed_at DATETIME NOT NULL,
  INDEX idx_site_views_time_visitor (viewed_at, visitor_id),
  INDEX idx_site_views_time_session (viewed_at, session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
