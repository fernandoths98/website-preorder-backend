-- Runtime-editable application settings.
-- Apply once. Do not rerun after it succeeds.

CREATE TABLE `app_settings` (
  `setting_key` VARCHAR(64) NOT NULL,
  `setting_value` VARCHAR(255) NOT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB;

INSERT INTO `app_settings` (`setting_key`, `setting_value`)
VALUES ('admin_whatsapp_phone', '085155202296');
