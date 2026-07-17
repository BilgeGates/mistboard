-- 106_correspondence_seek_neutral_color.sql
-- Make a seek's color preference variant-neutral so correspondence can leave chess.
--
-- 043 wrote preferred_color as chess literals ('white','black','random'), which pins the
-- whole seek path to one family: standard/Fortress Xiangqi seat 'red'|'black', and every
-- other tenant declares its own pair (VariantTenant.colors is `readonly [C, C]`). The
-- tenant layer was already generic — only the seek row and its CHECK were not, so a
-- red/black seek could not even be inserted.
--
-- The neutral axis is MOVE ORDER, which every two-player variant has: 'first' is whoever
-- moves first (chess white, xiangqi red), 'second' is the responder. The accept path maps
-- first/second onto the tenant's own colors[0]/colors[1], so no variant literal survives
-- in the seek.
--
-- Rewrite in place rather than adding a column: the values are a pure relabelling of the
-- same axis (dark chess is the only eligible spec today, and there white == first), so a
-- parallel column would leave two sources of truth for one fact. Open seeks are transient
-- (7-day expiry, 077) and low-volume, so the UPDATE is small.

ALTER TABLE correspondence_seeks
  DROP CONSTRAINT IF EXISTS correspondence_seeks_preferred_color_check;

UPDATE correspondence_seeks SET preferred_color = 'first' WHERE preferred_color = 'white';
UPDATE correspondence_seeks SET preferred_color = 'second' WHERE preferred_color = 'black';

ALTER TABLE correspondence_seeks
  ADD CONSTRAINT correspondence_seeks_preferred_color_check
    CHECK (preferred_color IN ('first', 'second', 'random'));
