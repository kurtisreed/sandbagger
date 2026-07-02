-- reset-demo.sql — removes the guide's demo group so capture-guide.js
-- can re-register it from scratch. Run against the local sandbagger DB:
--   /Applications/XAMPP/xamppfiles/bin/mysql -uroot sandbagger < tools/reset-demo.sql
SET @uid := (SELECT user_id FROM users WHERE email='demo@sandbaggerscoring.com');
SET @oid := (SELECT org_id FROM organizations WHERE name='Saturday Golf Club' ORDER BY org_id DESC LIMIT 1);
DELETE FROM org_invites WHERE org_id=@oid;
DELETE FROM user_organizations WHERE user_id=@uid OR org_id=@oid;
DELETE hs FROM hole_scores hs JOIN matches m ON hs.match_id=m.match_id JOIN rounds r ON m.round_id=r.round_id WHERE r.tournament_id IN (SELECT tournament_id FROM tournaments WHERE org_id=@oid);
DELETE mg FROM match_golfers mg JOIN matches m ON mg.match_id=m.match_id JOIN rounds r ON m.round_id=r.round_id WHERE r.tournament_id IN (SELECT tournament_id FROM tournaments WHERE org_id=@oid);
DELETE m FROM matches m JOIN rounds r ON m.round_id=r.round_id WHERE r.tournament_id IN (SELECT tournament_id FROM tournaments WHERE org_id=@oid);
DELETE FROM tournament_golfers WHERE tournament_id IN (SELECT tournament_id FROM tournaments WHERE org_id=@oid);
DELETE FROM rounds WHERE tournament_id IN (SELECT tournament_id FROM tournaments WHERE org_id=@oid);
DELETE FROM tournaments WHERE org_id=@oid;
DELETE FROM holes WHERE course_id IN (SELECT course_id FROM courses WHERE org_id=@oid);
DELETE FROM course_tees WHERE course_id IN (SELECT course_id FROM courses WHERE org_id=@oid);
DELETE FROM courses WHERE org_id=@oid;
DELETE FROM golfers WHERE org_id=@oid OR user_id=@uid;
-- second demo member created by the join scene
SET @uid2 := (SELECT user_id FROM users WHERE email='pat.murphy@example.com');
DELETE FROM user_organizations WHERE user_id=@uid2;
DELETE FROM golfers WHERE user_id=@uid2;
DELETE FROM users WHERE user_id IN (@uid, @uid2);
DELETE FROM organizations WHERE org_id=@oid;
SELECT 'demo reset done' AS status;
