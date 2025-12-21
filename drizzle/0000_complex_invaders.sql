CREATE TABLE `article_summaries` (
	`id` text PRIMARY KEY NOT NULL,
	`article_id` text NOT NULL,
	`one_sentence` text NOT NULL,
	`one_paragraph` text NOT NULL,
	`long` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `article_summaries_article_id_unique` ON `article_summaries` (`article_id`);--> statement-breakpoint
CREATE INDEX `article_summaries_article_id_idx` ON `article_summaries` (`article_id`);--> statement-breakpoint
CREATE TABLE `article_tags` (
	`article_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `article_tags_article_id_idx` ON `article_tags` (`article_id`);--> statement-breakpoint
CREATE INDEX `article_tags_tag_id_idx` ON `article_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `articles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`url` text NOT NULL,
	`title` text,
	`description` text,
	`image_url` text,
	`site_name` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`processing_attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`processed_at` integer,
	`read_at` integer,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `articles_user_id_idx` ON `articles` (`user_id`);--> statement-breakpoint
CREATE INDEX `articles_status_idx` ON `articles` (`status`);--> statement-breakpoint
CREATE INDEX `articles_archived_idx` ON `articles` (`archived`);--> statement-breakpoint
CREATE INDEX `articles_created_at_idx` ON `articles` (`created_at`);--> statement-breakpoint
CREATE TABLE `auth_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`user_id` text,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_tokens_token_unique` ON `auth_tokens` (`token`);--> statement-breakpoint
CREATE INDEX `auth_tokens_token_idx` ON `auth_tokens` (`token`);--> statement-breakpoint
CREATE INDEX `auth_tokens_expires_at_idx` ON `auth_tokens` (`expires_at`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`auto_generated` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tags_user_id_idx` ON `tags` (`user_id`);--> statement-breakpoint
CREATE INDEX `tags_user_id_name_idx` ON `tags` (`user_id`,`name`);--> statement-breakpoint
CREATE TABLE `telegram_users` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`telegram_id` text NOT NULL,
	`username` text,
	`first_name` text,
	`last_name` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `telegram_users_telegram_id_unique` ON `telegram_users` (`telegram_id`);--> statement-breakpoint
CREATE INDEX `telegram_users_user_id_idx` ON `telegram_users` (`user_id`);--> statement-breakpoint
CREATE INDEX `telegram_users_telegram_id_idx` ON `telegram_users` (`telegram_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
