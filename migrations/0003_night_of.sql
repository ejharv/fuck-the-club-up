-- Brief 05, part 1: backdated posts. night_of is the date the night happened
-- (YYYY-MM-DD); the feed sorts by it, falling back to the publish date.
ALTER TABLE posts ADD COLUMN night_of TEXT;
CREATE INDEX posts_by_night ON posts (COALESCE(night_of, substr(published_at, 1, 10)) DESC, published_at DESC);

-- Posts no longer show or store who wrote them.
UPDATE posts SET author_name = NULL;
