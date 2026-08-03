TRUNCATE TABLE rappers;
INSERT INTO rappers (id, name, avatar_url, bio, sort_order) VALUES

ON DUPLICATE KEY UPDATE name=name;