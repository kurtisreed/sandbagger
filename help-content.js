// help-content.js — single source of truth for all in-app help content.
// Each topic: { category, title, body }. Bodies are trusted static HTML
// authored here (never user input). Rendered by openHelpModal() and the
// Help page in script.js via elements carrying data-help="<topic-key>".

window.HELP_CATEGORIES = ['Game Formats', 'Handicaps & Scoring', 'Setting Up & Admin'];

window.HELP_TOPICS = {

  /* ═══ GAME FORMATS ═══ */

  'formats-overview': {
    category: 'Game Formats',
    title: 'Choosing a Format',
    body: `<p><strong>Ryder Cup</strong> — two teams battle across one or more rounds; every match is worth a point.</p>
<p><strong>Guys Trip</strong> — multi-day trip with rotating 2-vs-2 team matches plus individual leaderboards.</p>
<p><strong>Best Ball</strong> — 2-vs-2 match where each team counts its best score on every hole.</p>
<p><strong>Stroke Play, Skins, and Scramble</strong> — regular stroke play scoring. This format can also be used to track skins and manage a Scramble.</p>
<p><strong>Rabbit</strong> — catch and hold the Rabbit by winning holes outright.</p>
<p><strong>Wolf</strong> — the Wolf rotates each hole and picks a partner (or goes it alone) for points.</p>
<p>Pick a format from the dropdown, then tap this icon again for the full rules.</p>`
  },

  'format-best-ball': {
    category: 'Game Formats',
    title: 'Best Ball',
    body: `<p>Two teams of two, and everyone plays their own ball the whole way around. On each hole, a team's score is the single <em>lowest net score</em> between its two players — your partner's blow-up hole can't hurt you.</p>
<p>It's scored as match play: win a hole and your team goes "1 UP," lose one and you drop back. If both teams' best balls tie, the hole is halved and nothing changes.</p>
<p>Handicap strokes are applied hole-by-hole using each player's playing handicap, so the net scores keep things fair. The match ends when one team is up by more holes than remain (a "3&2" win), or finishes all square after 18.</p>`
  },

  'format-rabbit': {
    category: 'Game Formats',
    title: 'Rabbit',
    body: `<p>The Rabbit starts the round running free. Win a hole <em>outright</em> — lowest net score, no ties — and you catch it.</p>
<p>Once you hold the Rabbit, you keep it as long as nobody else wins a hole outright; tied holes change nothing. When another player does win a hole, the Rabbit is set <em>free</em>, and it takes another outright win for someone to catch it again.</p>
<p>Points are awarded every 3 holes (6 segments per round): whoever holds the Rabbit at the end of each segment wins that segment. Tip: a tied hole helps whoever is holding the Rabbit — sometimes a safe par is all you need.</p>`
  },

  'format-wolf': {
    category: 'Game Formats',
    title: 'Wolf',
    body: `<p>A four-player points game. The Wolf rotates each hole and tees off <em>last</em>, watching everyone else's drives before deciding: pick one of the other three as a partner, or go it alone as the <strong>Lone Wolf</strong>.</p>
<p>The hole is then played as best ball with net scores — the Wolf's side against the rest. If a partnership wins, the Wolf and partner earn <strong>1 point each</strong>; lose and they get nothing.</p>
<p>Going Lone Wolf is 1-vs-3: win the hole and the Wolf earns <strong>3 points</strong>; lose and each of the other three players gets <strong>1 point</strong>. Tied holes score nothing for anyone. Highest total after 18 wins.</p>`
  },

  'format-skins': {
    category: 'Game Formats',
    title: 'Stroke Play, Skins, and Scramble',
    body: `<p>The all-purpose format: everyone plays their own ball and posts a regular stroke play score, with gross and net leaderboards for the group.</p>
<p>It also tracks <strong>skins</strong> automatically. Every hole is worth a "skin" — win one by posting the outright lowest <em>net</em> score on the hole. Beat everyone, not just tie them; if two or more players tie for low score, nobody wins that hole's skin. The skins table on the round page shows exactly who won which holes.</p>
<p>Running a <strong>Scramble</strong>? Use this format too — enter the team's score and the leaderboards handle the rest.</p>`
  },

  'format-ryder-cup': {
    category: 'Game Formats',
    title: 'Ryder Cup',
    body: `<p>Your group splits into two teams — pick names and colors — and battles across one or more rounds, just like the pros.</p>
<p>Each round is made up of matches (typically 2-vs-2 best ball). On every hole, each side's best net score counts; win more holes than the other side and your team wins the match.</p>
<p>A match win is worth <strong>1 point</strong> for your team; a tied match is halved at <strong>½ point each</strong>. All match points roll up to the tournament scoreboard, and the team with the most points when the dust settles takes the cup.</p>`
  },

  'format-guys-trip': {
    category: 'Game Formats',
    title: 'Guys Trip',
    body: `<p>The format for a multi-day buddies trip: everyone plays their own ball every round, with team matches and individual leaderboards running at the same time.</p>
<p>Each round, players are paired into 2-vs-2 partnerships for best-ball matches — partners rotate between rounds, so you're not stuck with (or against) the same guy all weekend.</p>
<p>Alongside the matches, the app keeps trip-long <strong>Gross</strong> and <strong>Net</strong> leaderboards across all rounds, so there's an individual title on the line too. Bragging rights on three fronts: your matches, your net score, and your raw gross.</p>`
  },

  /* ═══ HANDICAPS & SCORING ═══ */

  'handicap-index': {
    category: 'Handicaps & Scoring',
    title: 'Handicap Index',
    body: `<p>Your Handicap Index is a single number (like 12.4) that says how many strokes over par you typically shoot on a course of standard difficulty. Lower is better; a scratch golfer is 0.</p>
<p>If you keep an official GHIN/WHS handicap, enter that. If not, an honest estimate of your average score minus 72 is close enough for a friendly game.</p>
<p>The app uses it to calculate your playing handicap for each course and round, so players of different abilities can compete fairly.</p>`
  },

  'handicap-pct': {
    category: 'Handicaps & Scoring',
    title: 'Handicap %',
    body: `<p>This sets what percentage of each player's full handicap is used in the tournament. At 100%, everyone gets their complete allowance; at 80% (the usual choice for team events), everyone plays off slightly less.</p>
<p>Reduced allowances are standard in better-ball formats because teams only count their best score — full handicaps tend to favor the higher-handicap side.</p>
<p>Not sure? Leave it at 80. Think of it as a fairness dial: lower favors the better players, higher favors the higher handicaps.</p>`
  },

  'playing-handicap': {
    category: 'Handicaps & Scoring',
    title: 'Playing Handicap',
    body: `<p>Your playing handicap is the number of strokes you actually receive in a given round — your Handicap Index adjusted for the tees you're playing and the event's Handicap %.</p>
<p>The formula: <code>(Handicap Index × (Slope ÷ 113) + (Rating − 72)) × Handicap %</code>, rounded to a whole number. Harder tees mean more strokes.</p>
<p>The app calculates this automatically for every player when a round is created — you never have to do the math.</p>`
  },

  'stroke-index': {
    category: 'Handicaps & Scoring',
    title: 'HI — Hole Handicap',
    body: `<p>The HI column ranks the holes by difficulty, 1 through 18: HI 1 is the hardest hole on the course, HI 18 the easiest.</p>
<p>It controls where your handicap strokes land. If your playing handicap is 9, you get one stroke on each of the 9 hardest holes (HI 1–9). With 20, you'd get a stroke on every hole plus a second stroke on HI 1 and 2.</p>
<p>On the scorecard, a marked or shaded cell shows holes where a player receives a stroke.</p>`
  },

  'slope-rating': {
    category: 'Handicaps & Scoring',
    title: 'Slope & Rating',
    body: `<p>Every set of tees has two difficulty numbers. <strong>Course Rating</strong> is what a scratch golfer would be expected to shoot (e.g. 71.8). <strong>Slope</strong> measures how much harder the course plays for an average golfer than a scratch golfer — 113 is standard, 155 is the max.</p>
<p>Both are printed on the scorecard at the course, usually right next to each tee's yardage.</p>
<p>The app uses them to convert each player's Handicap Index into the right number of strokes for the tees being played.</p>`
  },

  'gross-vs-net': {
    category: 'Handicaps & Scoring',
    title: 'Gross vs. Net',
    body: `<p><strong>Gross</strong> is your actual score — every stroke counted, no adjustments. <strong>Net</strong> is your gross score minus your playing handicap.</p>
<p>Net scoring is what lets a 20-handicapper and a 5-handicapper have a real match: if both play to their usual level, they'll post similar net scores.</p>
<p>The leaderboards show both, so the purists and the sandbaggers each get a board to argue over.</p>`
  },

  'to-par': {
    category: 'Handicaps & Scoring',
    title: '"To Par" Scores',
    body: `<p>Scores on leaderboards are shown relative to par for the holes completed: <strong>−2</strong> means two under par, <strong>+5</strong> means five over, and <strong>E</strong> means even.</p>
<p>"Thru" shows how many holes a player has finished, so you can compare players mid-round even if they're on different holes.</p>`
  },

  'match-status': {
    category: 'Handicaps & Scoring',
    title: 'Match Status (2 UP, AS, 3&2)',
    body: `<p>Match play is scored in holes, not strokes. <strong>"2 UP"</strong> means that side has won two more holes than the other. <strong>"AS"</strong> (all square) means the match is tied.</p>
<p>A final result like <strong>"3&2"</strong> means the winners were 3 holes up with only 2 left to play — the match ended right there, since it could no longer be tied.</p>
<p>A hole where both sides score the same is "halved" — nobody gains ground.</p>`
  },

  /* ═══ SETTING UP & ADMIN ═══ */

  'invite-code': {
    category: 'Setting Up & Admin',
    title: 'Invite Code & Link',
    body: `<p>Both get new members into your group — they're two doors to the same place. The <strong>invite link</strong> is easiest: text or email it, and tapping it takes them straight to your group's sign-up.</p>
<p>The <strong>invite code</strong> (e.g. ABC12345) is for anyone who already has the app or an account — they enter it on the join screen, or under My Account → Join an existing group.</p>
<p>Codes don't expire on their own, but an admin can generate a new one at any time, which immediately invalidates the old code and link.</p>`
  },

  'team-setup': {
    category: 'Setting Up & Admin',
    title: 'Team Setup',
    body: `<p>Name your two teams (USA vs. Europe is the classic) and pick a color for each. The colors carry through the whole app — scorecards, leaderboards, and match results all use them — so make them easy to tell apart.</p>
<p>You can change names and colors later by editing the tournament.</p>`
  },

  'assign-players': {
    category: 'Setting Up & Admin',
    title: 'Assigning Players',
    body: `<p>Place each golfer on a team. Teams don't have to be equal in number, but matches work best when they are.</p>
<p>A common approach for fairness: rank players by handicap and alternate picks, or put the two best players on opposite teams and build out from there.</p>
<p>Anyone left unassigned won't appear in this tournament's matches — you can edit the tournament later if someone joins after the draft.</p>`
  },

  'add-round-flow': {
    category: 'Setting Up & Admin',
    title: 'Save Round vs. Continue to Matches',
    body: `<p>After picking the date, course, and tees, you have two ways to finish. <strong>Continue to Matches</strong> walks you through setting up the round's matchups (and optionally tee times) right now.</p>
<p><strong>Save Round</strong> creates the round and stops there — handy when the course is booked but the pairings aren't settled. You can come back any time and add matches by tapping the round.</p>
<p>Nothing is locked in: matches and tee times can be added, edited, or removed later.</p>`
  },

  'matches-setup': {
    category: 'Setting Up & Admin',
    title: 'Setting Up Matches',
    body: `<p>A match is a head-to-head pairing within the round — typically two players from each team for best ball. Add as many matches as you have groups.</p>
<p>Each player should appear in only one match per round. Players left out of all matches can still post scores for the leaderboards.</p>`
  },

  'tee-times': {
    category: 'Setting Up & Admin',
    title: 'Tee Times',
    body: `<p>Tee times are optional — they're a convenience so everyone can see when and with whom they're off, right in the app.</p>
<p>Skipping them changes nothing about scoring or matches. You can add or edit them later by reopening the round.</p>`
  },

  'score-entry': {
    category: 'Setting Up & Admin',
    title: 'Entering Scores',
    body: `<p>Tap a cell on the scorecard and pick the number of strokes. Scores save automatically the moment you select them — there's no Save button to forget.</p>
<p>Anyone in the match can enter scores, and everyone sees updates as they post. Made a mistake? Just tap the cell and choose the right number.</p>
<p>If you lose signal mid-round, keep scoring — the app stores entries on your phone and syncs them when you're back online.</p>`
  },

  'course-search': {
    category: 'Setting Up & Admin',
    title: 'Course Search (Auto-Fill)',
    body: `<p>Start typing a course or club name and pick a result — the app pulls in the tees, slope, rating, par, and hole handicaps automatically from a course database.</p>
<p>Give the imported numbers a quick glance against the course's actual scorecard; databases occasionally lag behind re-ratings or renovations.</p>
<p>If your course isn't found, no problem — fill in the name, holes, and tees manually below.</p>`
  },

  'password-reset-link': {
    category: 'Setting Up & Admin',
    title: 'Password Reset Links',
    body: `<p>If a member is locked out, generate a one-time reset link here and send it to them however you like — text, email, carrier pigeon.</p>
<p>The link lets them set a new password and expires after 24 hours. Generating a new link invalidates any previous one.</p>
<p>Only share it with the member it's for — anyone with the link can set that account's password.</p>`
  },

  'delete-account': {
    category: 'Setting Up & Admin',
    title: 'Deleting Your Account',
    body: `<p>Deleting your account deactivates it — you won't be able to sign in, and you'll disappear from group rosters for future events.</p>
<p>Your scoring history is preserved, so past rounds, matches, and tournaments stay intact for everyone else. If you change your mind, a group admin can help restore access.</p>`
  },
};
