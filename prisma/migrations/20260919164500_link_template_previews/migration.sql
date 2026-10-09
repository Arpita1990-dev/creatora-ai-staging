UPDATE "Template"
SET "previewUrl" = 'https://cdn.muapi.ai/outputs/generated/c086cfb12b5546629513bc79dca31705.mp4'
WHERE "slug" = 'gallery-preview' AND "previewUrl" IS NULL;

UPDATE "Template"
SET "previewUrl" = 'https://cdn.muapi.ai/outputs/generated/918470b50a404e329c92f3efaa62e7de.mp4'
WHERE "slug" = 'book-trailer' AND "previewUrl" IS NULL;
