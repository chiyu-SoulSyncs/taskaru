-- Temporary codes for securely linking LINE accounts to web users
CREATE TABLE `line_linking_codes` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `appUserId` int NOT NULL,
  `code` varchar(16) NOT NULL UNIQUE,
  `expiresAt` timestamp NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX `idx_linking_codes_appUserId` ON `line_linking_codes` (`appUserId`);
CREATE INDEX `idx_linking_codes_code` ON `line_linking_codes` (`code`);
