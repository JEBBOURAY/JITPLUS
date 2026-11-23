-- Product decision (2026-11-22): every new client shares their info with
-- merchants. Sign-up used to force share_info_merchants = false; that is
-- removed, so the column default (true) applies to new sign-ups.
--
-- Existing rows are left alone on purpose (review 2026-11-23): a stored false
-- cannot tell the old forced sign-up value from a client who turned sharing
-- off in the settings, and flipping a refusal back on would expose the name,
-- phone and email of people who said no (law 09-08). Kept as a no-op so the
-- migration history stays the same wherever it was already applied.
SELECT 1;
