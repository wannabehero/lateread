ALTER TABLE `articles` ADD `rating` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `articles_rating_idx` ON `articles` (`rating`);