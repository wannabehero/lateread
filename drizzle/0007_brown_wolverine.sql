ALTER TABLE `articles` ADD `archived_at` integer;
UPDATE articles SET archived_at = updated_at WHERE archived = 1;