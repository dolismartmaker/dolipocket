-- Copyright (C) 2026 Eric Seigne <eric.seigne@cap-rel.fr>
--
-- This program is free software: you can redistribute it and/or modify
-- it under the terms of the GNU Affero General Public License as
-- published by the Free Software Foundation, either version 3 of the
-- License, or (at your option) any later version.

CREATE TABLE llx_dolipocket_tenant (
	rowid           INTEGER AUTO_INCREMENT PRIMARY KEY,
	email           VARCHAR(255) NOT NULL,
	company         VARCHAR(255) NOT NULL,
	entity          INTEGER DEFAULT 0,
	fk_user_admin   INTEGER DEFAULT 0,
	status          VARCHAR(32) NOT NULL DEFAULT 'pending_otp',
	plan            VARCHAR(32) DEFAULT 'free',
	otp_hash        VARCHAR(255) DEFAULT NULL,
	otp_expires     DATETIME DEFAULT NULL,
	reset_token     VARCHAR(128) DEFAULT NULL,
	reset_expires   DATETIME DEFAULT NULL,
	date_creation   DATETIME NOT NULL,
	date_activation DATETIME DEFAULT NULL,
	tms             TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=innodb;
