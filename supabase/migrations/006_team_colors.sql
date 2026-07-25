-- Add team customization colors
ALTER TABLE teams ADD COLUMN IF NOT EXISTS color_primary TEXT DEFAULT '#EAB308';
ALTER TABLE teams ADD COLUMN IF NOT EXISTS color_secondary TEXT DEFAULT '#1E40AF';
