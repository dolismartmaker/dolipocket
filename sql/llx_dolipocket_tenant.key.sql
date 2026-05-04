-- Copyright (C) 2026 Eric Seigne <eric.seigne@cap-rel.fr>
--
-- This program is free software: you can redistribute it and/or modify
-- it under the terms of the GNU Affero General Public License as
-- published by the Free Software Foundation, either version 3 of the
-- License, or (at your option) any later version.

ALTER TABLE llx_dolipocket_tenant ADD UNIQUE INDEX uk_dolipocket_tenant_email (email);
ALTER TABLE llx_dolipocket_tenant ADD INDEX idx_dolipocket_tenant_entity (entity);
ALTER TABLE llx_dolipocket_tenant ADD INDEX idx_dolipocket_tenant_status (status);
ALTER TABLE llx_dolipocket_tenant ADD INDEX idx_dolipocket_tenant_reset (reset_token);
