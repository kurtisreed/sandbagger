-- seed-demo.sql — populates the guide's demo group (created by the "auth"
-- capture scene) with a complete course, golfers, and an invite code.
--   /Applications/XAMPP/xamppfiles/bin/mysql -uroot sandbagger < tools/seed-demo.sql
SET @oid := (SELECT org_id FROM organizations WHERE name='Saturday Golf Club' ORDER BY org_id DESC LIMIT 1);

-- Clone Payne's Valley (course_id 9, complete 18-hole + tee data) into the demo org
INSERT INTO courses (org_id, course_name) SELECT @oid, course_name FROM courses WHERE course_id=9;
SET @cid := LAST_INSERT_ID();
INSERT INTO course_tees (course_id, tee_name, slope, rating, par, yardage,
  hole_1_distance,hole_2_distance,hole_3_distance,hole_4_distance,hole_5_distance,hole_6_distance,
  hole_7_distance,hole_8_distance,hole_9_distance,hole_10_distance,hole_11_distance,hole_12_distance,
  hole_13_distance,hole_14_distance,hole_15_distance,hole_16_distance,hole_17_distance,hole_18_distance)
SELECT @cid, tee_name, slope, rating, par, yardage,
  hole_1_distance,hole_2_distance,hole_3_distance,hole_4_distance,hole_5_distance,hole_6_distance,
  hole_7_distance,hole_8_distance,hole_9_distance,hole_10_distance,hole_11_distance,hole_12_distance,
  hole_13_distance,hole_14_distance,hole_15_distance,hole_16_distance,hole_17_distance,hole_18_distance
FROM course_tees WHERE course_id=9;
INSERT INTO holes (course_id, hole_number, handicap_index, par)
SELECT @cid, hole_number, handicap_index, par FROM holes WHERE course_id=9;

-- Demo golfers (Chris Parker already exists as the registered admin)
INSERT INTO golfers (first_name, last_name, handicap, active, org_id) VALUES
('Mike','Reynolds', 8.3, 1, @oid),
('Dave','Kowalski', 15.1, 1, @oid),
('Tom','Beckett',   4.7, 1, @oid),
('Steve','Nakamura',22.0, 1, @oid),
('Joe','Castellano',10.9, 1, @oid),
('Randy','Whitfield',17.6, 1, @oid),
('Bill','Okafor',   6.2, 1, @oid);

-- Invite code shown on the join screen in the guide
INSERT INTO org_invites (org_id, code, created_by)
SELECT @oid, 'GOLF2026', user_id FROM users WHERE email='demo@sandbaggerscoring.com';

SELECT @oid AS org_id, @cid AS course_id,
  (SELECT COUNT(*) FROM golfers WHERE org_id=@oid) AS golfers,
  (SELECT COUNT(*) FROM holes WHERE course_id=@cid) AS holes;
