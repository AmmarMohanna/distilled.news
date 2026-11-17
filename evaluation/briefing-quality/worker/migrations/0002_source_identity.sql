-- Durable source identity must not be stored in a mutable error field.
ALTER TABLE eval_jobs ADD COLUMN edition_id TEXT;
