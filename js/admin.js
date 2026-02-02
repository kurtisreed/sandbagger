// public/js/admin.js

const BASE = '';
let pendingTourneyId = null;
let pendingRoundCount = null;

document.addEventListener('DOMContentLoaded', () => {
  // Section navigation
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn')
              .forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      document.querySelectorAll('.admin-section')
              .forEach(sec => sec.hidden = true);
      document.getElementById('section-' + btn.dataset.section)
              .hidden = false;

      // Load the appropriate data
      switch (btn.dataset.section) {
        case 'tournaments': loadTournaments(); break;
        case 'golfers':    loadGolfers();    break;
        case 'courses':    loadCourses();    break;
        // future: case 'rounds': loadRounds(); break;
      }
    });
  });

  // Initial load
  loadTournaments();

  // Form handlers
//  document.getElementById('tourney-create-form')
//          .addEventListener('submit', e => {
//    e.preventDefault(); createTournament();
//  });

  document.getElementById('golfer-create-form')
          .addEventListener('submit', e => {
    e.preventDefault(); createGolfer();
  });

  document.getElementById('course-create-form')
          .addEventListener('submit', e => {
    e.preventDefault(); createCourse();
    courseModal.classList.add('hidden');
  });
});

// ─── Tournaments ─────────────────────────────────────────────────────────────
function loadTournaments() {
  fetch(BASE + '/api/tournaments.php', { credentials: 'include' })
    .then(r => r.json())
    .then(data => {
      const tbody = document.querySelector('#tourney-list tbody');
      tbody.innerHTML = '';
      data.forEach(t => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${t.tournament_id}</td>
          <td>${t.name}</td>
          <td>${t.start_date} – ${t.end_date}</td>
          <td>${t.handicap_pct}</td>
          <td>${t.format_name}</td>
          <td>${t.round_count}</td>
          <td>${t.golfer_count}</td>
          <td>
            <button class="edit-tourney btn-secondary" data-id="${t.tournament_id}">Edit</button>
            <button class="delete-btn btn-danger" data-id="${t.tournament_id}">Delete</button>
          </td>
        `;
        tbody.appendChild(tr);
      });
      tbody.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.id;
          if (!confirm('Delete this tournament?')) return;
          fetch(BASE + '/api/tournaments.php?tournament_id=' + id, {
            method: 'DELETE', credentials: 'include'
          }).then(() => loadTournaments());
        });
      });
      tbody.querySelectorAll('.edit-tourney').forEach(btn => {
          btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            showTournamentDashboard(id);
          });
        });

    })
    .catch(err => console.error('Error loading tournaments:', err));
}

function createTournament() {
  const form = document.getElementById('tourney-create-form');
  const payload = {
    name:        form['t-name'].value,
    start_date:  form['t-start'].value,
    end_date:    form['t-end'].value,
    handicap_pct: parseFloat(form['t-hcp-pct'].value)
  };
  fetch(BASE + '/api/tournaments.php', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  .then(() => { form.reset(); loadTournaments(); })
  .catch(err => console.error('Error creating tournament:', err));
}

let currentTourneyId = null;
let currentTourneyFormatId = null;

function showTournamentDashboard(id) {
  currentTourneyId = id;

  // Fetch tournament data first to determine format
  fetch(BASE + `/api/tournaments.php?tournament_id=${id}`, {credentials:'include'})
    .then(r => r.json())
    .then(t => {
      currentTourneyFormatId = t.format_id;

      // Parse dates for title
      const start = new Date(t.start_date);
      const end   = new Date(t.end_date);
      const opts = { month: 'long', day: 'numeric', year: 'numeric' };
      const formattedStart = start.toLocaleDateString('en-US', opts);
      const formattedEnd   = end.toLocaleDateString('en-US', opts);
      const titleText = `Tournament: ${t.name} (${formattedStart} – ${formattedEnd}) ${t.format_name}`;

      // Hide all sections
      document.querySelectorAll('.admin-section').forEach(sec => sec.hidden = true);

      // Route based on format_id
      if (t.format_id === 4) {
        // Guys Trip format
        showGuysTrip(titleText);
      } else {
        // Default: Ryder Cup format (format_id=3 and others)
        showRyderCup(titleText);
      }
    });
}

// Show Ryder Cup style tournament detail
function showRyderCup(titleText) {
  document.getElementById('section-tourney-detail').hidden = false;
  document.getElementById('detail-title').textContent = titleText;

  // Reset sub-nav to first tab
  document.querySelectorAll('#section-tourney-detail .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('[data-tab="teams"]').classList.add('active');
  document.querySelectorAll('#section-tourney-detail .tab-content').forEach(c => c.hidden = true);
  document.getElementById('tab-teams').hidden = false;

  // Load each area
  loadTeams();
  loadTourneyRoster();
  loadTourneyRounds();
}

// Show Guys Trip style tournament detail
function showGuysTrip(titleText) {
  document.getElementById('section-tourney-detail-guys-trip').hidden = false;
  document.getElementById('guys-trip-detail-title').textContent = titleText;

  // Reset sub-nav to first tab
  document.querySelectorAll('.guys-trip-nav .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('[data-tab="gt-players"]').classList.add('active');
  document.querySelectorAll('#section-tourney-detail-guys-trip .tab-content').forEach(c => c.hidden = true);
  document.getElementById('tab-gt-players').hidden = false;

  // Load Guys Trip data
  loadGuysTrip_Players();
  loadGuysTrip_Rounds();
}

// Sub-nav click handlers for Ryder Cup section
document.querySelectorAll('#section-tourney-detail .sub-nav .tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#section-tourney-detail .sub-nav .tab-btn')
            .forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('#section-tourney-detail .tab-content').forEach(c => c.hidden = true);
    document.getElementById('tab-' + btn.dataset.tab).hidden = false;
    loadTeams();
    loadTourneyRoster();
    loadTourneyRounds();
  });
});

// Sub-nav click handlers for Guys Trip section
document.querySelectorAll('.guys-trip-nav .tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.guys-trip-nav .tab-btn')
            .forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('#section-tourney-detail-guys-trip .tab-content').forEach(c => c.hidden = true);
    document.getElementById('tab-' + btn.dataset.tab).hidden = false;
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GUYS TRIP FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

// Load players for Guys Trip (no teams, just available vs selected)
function loadGuysTrip_Players() {
  console.log('loadGuysTrip_Players called, tourneyId:', currentTourneyId);

  // Fetch all golfers
  fetch(BASE + '/api/golfers.php', { credentials: 'include' })
    .then(r => r.json())
    .then(allGolfers => {
      console.log('Loaded all golfers:', allGolfers.length);

      // Fetch golfers already assigned to this tournament
      fetch(BASE + `/api/tournament_golfers.php?tournament_id=${currentTourneyId}`, { credentials: 'include' })
        .then(r => r.json())
        .then(assignedGolfers => {
          console.log('Loaded assigned golfers:', assignedGolfers.length);

          const assignedIds = new Set(assignedGolfers.map(g => parseInt(g.golfer_id)));

          const availableContainer = document.querySelector('#gt-available .cards-container');
          const selectedContainer = document.querySelector('#gt-selected .cards-container');

          if (!availableContainer || !selectedContainer) {
            console.error('Containers not found!', { availableContainer, selectedContainer });
            return;
          }

          availableContainer.innerHTML = '';
          selectedContainer.innerHTML = '';

          allGolfers.forEach(g => {
            const card = document.createElement('div');
            card.className = 'card';
            card.dataset.golferId = g.golfer_id;
            card.innerHTML = `<span class="name">${g.first_name} ${g.last_name}</span>
                              <span class="handicap">${g.handicap}</span>`;

            if (assignedIds.has(parseInt(g.golfer_id))) {
              selectedContainer.appendChild(card);
            } else {
              availableContainer.appendChild(card);
            }
          });

          console.log('Cards created, initializing Sortable...');
          // Initialize drag-and-drop
          initGuysTrip_PlayerSortable();
        })
        .catch(err => console.error('Error loading assigned golfers:', err));
    })
    .catch(err => console.error('Error loading all golfers:', err));
}

// Initialize Sortable for Guys Trip player selection
function initGuysTrip_PlayerSortable() {
  const zones = ['gt-available', 'gt-selected'];

  zones.forEach(zoneId => {
    const container = document.querySelector(`#${zoneId} .cards-container`);
    if (!container) {
      console.error(`Container not found for ${zoneId}`);
      return;
    }

    // Destroy existing sortable if present
    if (container._sortable) {
      container._sortable.destroy();
    }

    container._sortable = Sortable.create(container, {
      group: 'gt-players',
      animation: 150,
      ghostClass: 'sortable-ghost',
      draggable: '.card',
      onEnd: function(evt) {
        console.log('Card moved:', evt.item.dataset.golferId, 'to', evt.to.parentElement.id);
      }
    });
  });
}

// Save Guys Trip player list
document.getElementById('gt-save-players-btn')?.addEventListener('click', () => {
  const selectedCards = document.querySelectorAll('#gt-selected .card');
  const golferIds = Array.from(selectedCards).map(c => parseInt(c.dataset.golferId));

  fetch(BASE + '/api/tournament_golfers.php', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tournament_id: currentTourneyId,
      golfer_ids: golferIds
    })
  })
  .then(r => r.json())
  .then(result => {
    alert('Player list saved!');
  })
  .catch(err => {
    console.error('Error saving players:', err);
    alert('Error saving player list');
  });
});

// Load rounds for Guys Trip
function loadGuysTrip_Rounds() {
  fetch(BASE + `/api/rounds.php?tournament_id=${currentTourneyId}`, { credentials: 'include' })
    .then(r => r.json())
    .then(rounds => {
      const tbody = document.querySelector('#gt-rounds-table tbody');
      tbody.innerHTML = '';

      rounds.forEach(round => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${round.round_date}</td>
          <td>${round.round_name || 'Round'}</td>
          <td>${round.course_name || ''}</td>
          <td>
            <button class="btn-secondary gt-edit-matches" data-round-id="${round.round_id}">Matches</button>
            <button class="btn-secondary gt-edit-tee-times" data-round-id="${round.round_id}">Tee Times</button>
            <button class="btn-danger gt-delete-round" data-round-id="${round.round_id}">Delete</button>
          </td>
        `;
        tbody.appendChild(tr);
      });

      // Attach event listeners
      tbody.querySelectorAll('.gt-edit-matches').forEach(btn => {
        btn.addEventListener('click', () => showGuysTrip_Matches(btn.dataset.roundId));
      });
      tbody.querySelectorAll('.gt-edit-tee-times').forEach(btn => {
        btn.addEventListener('click', () => showGuysTrip_TeeTimes(btn.dataset.roundId));
      });
      tbody.querySelectorAll('.gt-delete-round').forEach(btn => {
        btn.addEventListener('click', () => {
          if (confirm('Delete this round?')) {
            deleteGuysTrip_Round(btn.dataset.roundId);
          }
        });
      });
    });
}

// Store current Guys Trip round ID and match data
let currentGuysTrip_RoundId = null;
let guysTrip_Matches = [];
let guysTrip_Players = [];
let guysTrip_RoundName = '';

// Show matches editor for a Guys Trip round
function showGuysTrip_Matches(roundId) {
  currentGuysTrip_RoundId = roundId;

  // Hide other tabs, show matches tab
  document.querySelectorAll('#section-tourney-detail-guys-trip .tab-content').forEach(c => c.hidden = true);
  document.getElementById('tab-gt-matches').hidden = false;

  // Fetch round details and players
  Promise.all([
    fetch(BASE + `/api/rounds.php?round_id=${roundId}`, { credentials: 'include' }).then(r => r.json()),
    fetch(BASE + `/api/tournament_golfers.php?tournament_id=${currentTourneyId}`, { credentials: 'include' }).then(r => r.json()),
    fetch(BASE + `/api/matches.php?round_id=${roundId}`, { credentials: 'include' }).then(r => r.json())
  ])
  .then(([round, players, matches]) => {
    guysTrip_RoundName = round.round_name;
    guysTrip_Players = players;
    guysTrip_Matches = matches || [];

    document.getElementById('gt-matches-round-title').textContent = round.round_name;

    // Render the match board
    renderGuysTrip_MatchBoard();
  });
}

// Render the Guys Trip match board
function renderGuysTrip_MatchBoard() {
  const poolEl = document.getElementById('gt-player-pool');
  const boardEl = document.getElementById('gt-matches-board');

  // Find which players are already assigned to matches
  const assignedPlayerIds = new Set();
  guysTrip_Matches.forEach(match => {
    if (match.golfers) {
      match.golfers.forEach(g => assignedPlayerIds.add(parseInt(g.golfer_id)));
    }
  });

  // Render available players pool
  poolEl.innerHTML = '';
  const poolZone = document.createElement('div');
  poolZone.className = 'zone';
  poolZone.id = 'gt-pool';
  poolZone.innerHTML = '<h3>Available Players</h3>';

  guysTrip_Players.forEach(p => {
    if (!assignedPlayerIds.has(parseInt(p.golfer_id))) {
      const card = document.createElement('div');
      card.className = 'card';
      card.dataset.golferId = p.golfer_id;
      card.dataset.handicap = p.handicap;
      card.textContent = `${p.first_name} ${p.last_name} (${p.handicap})`;
      poolZone.appendChild(card);
    }
  });
  poolEl.appendChild(poolZone);

  // Render matches
  boardEl.innerHTML = '';
  guysTrip_Matches.forEach((match, idx) => {
    boardEl.appendChild(createGuysTrip_MatchElement(match, idx));
  });

  // Initialize drag-drop
  initGuysTrip_MatchDragDrop();
}

// Create a match element for Guys Trip
function createGuysTrip_MatchElement(match, index) {
  const matchEl = document.createElement('div');
  matchEl.className = 'match';
  matchEl.dataset.matchId = match.match_id || `new-${index}`;

  // Match title
  const title = document.createElement('h2');
  title.textContent = match.match_name || `Match ${index + 1}`;
  matchEl.appendChild(title);

  // Delete button
  const delBtn = document.createElement('button');
  delBtn.className = 'delete-match-btn';
  delBtn.textContent = '×';
  delBtn.addEventListener('click', () => deleteGuysTrip_Match(match.match_id || `new-${index}`));
  matchEl.appendChild(delBtn);

  // Teams container
  const teamsRow = document.createElement('div');
  teamsRow.className = 'container';

  // Team 1 zone
  const team1Zone = document.createElement('div');
  team1Zone.className = 'zone';
  team1Zone.id = `gt-team1-${match.match_id || `new-${index}`}`;
  team1Zone.innerHTML = '<h3 style="background:#007bff;color:#fff;padding:4px;border-radius:4px;">Team 1</h3>';

  // Team 2 zone
  const team2Zone = document.createElement('div');
  team2Zone.className = 'zone';
  team2Zone.id = `gt-team2-${match.match_id || `new-${index}`}`;
  team2Zone.innerHTML = '<h3 style="background:#28a745;color:#fff;padding:4px;border-radius:4px;">Team 2</h3>';

  // Add existing golfers to teams
  if (match.golfers) {
    match.golfers.forEach(g => {
      const card = document.createElement('div');
      card.className = 'card';
      card.dataset.golferId = g.golfer_id;
      card.dataset.handicap = g.handicap;
      card.textContent = `${g.first_name} ${g.last_name} (${g.handicap})`;

      // team_position 1,2 = Team 1; 3,4 = Team 2
      if (g.team_position <= 2) {
        team1Zone.appendChild(card);
      } else {
        team2Zone.appendChild(card);
      }
    });
  }

  teamsRow.appendChild(team1Zone);
  teamsRow.appendChild(team2Zone);
  matchEl.appendChild(teamsRow);

  return matchEl;
}

// Initialize drag-drop for Guys Trip matches
function initGuysTrip_MatchDragDrop() {
  // Pool zone
  const poolZone = document.getElementById('gt-pool');
  if (poolZone) {
    Sortable.create(poolZone, {
      group: 'gt-match-players',
      animation: 150,
      draggable: '.card',
      ghostClass: 'sortable-ghost'
    });
  }

  // Team zones for each match
  document.querySelectorAll('#gt-matches-board .match').forEach(matchEl => {
    const matchId = matchEl.dataset.matchId;

    ['gt-team1-', 'gt-team2-'].forEach(prefix => {
      const zone = document.getElementById(prefix + matchId);
      if (zone) {
        Sortable.create(zone, {
          group: 'gt-match-players',
          animation: 150,
          draggable: '.card',
          ghostClass: 'sortable-ghost',
          onAdd: (evt) => {
            // Limit to 2 players per team
            const cards = evt.to.querySelectorAll('.card');
            if (cards.length > 2) {
              alert('Maximum 2 players per team!');
              evt.from.appendChild(evt.item);
            }
          }
        });
      }
    });
  });
}

// Add new match for Guys Trip
document.getElementById('gt-new-match-btn')?.addEventListener('click', () => {
  const newMatchIndex = guysTrip_Matches.length;
  const newMatch = {
    match_id: `new-${Date.now()}`,
    match_name: `Match ${newMatchIndex + 1} in ${guysTrip_RoundName}`,
    golfers: []
  };
  guysTrip_Matches.push(newMatch);
  renderGuysTrip_MatchBoard();
});

// Delete a match
function deleteGuysTrip_Match(matchId) {
  if (!confirm('Delete this match?')) return;
  guysTrip_Matches = guysTrip_Matches.filter(m => (m.match_id || `new-${guysTrip_Matches.indexOf(m)}`) !== matchId);
  renderGuysTrip_MatchBoard();
}

// Save all matches for Guys Trip
document.getElementById('gt-save-matches-btn')?.addEventListener('click', () => {
  const matchData = [];

  document.querySelectorAll('#gt-matches-board .match').forEach((matchEl, idx) => {
    const matchId = matchEl.dataset.matchId;
    const team1Cards = matchEl.querySelectorAll('[id^="gt-team1-"] .card');
    const team2Cards = matchEl.querySelectorAll('[id^="gt-team2-"] .card');

    const golfers = [];

    // Team 1 players get positions 1, 2
    team1Cards.forEach((card, i) => {
      golfers.push({
        golfer_id: parseInt(card.dataset.golferId),
        team_position: i + 1
      });
    });

    // Team 2 players get positions 3, 4
    team2Cards.forEach((card, i) => {
      golfers.push({
        golfer_id: parseInt(card.dataset.golferId),
        team_position: i + 3
      });
    });

    matchData.push({
      match_id: matchId.startsWith('new-') ? null : parseInt(matchId),
      match_name: `Match ${idx + 1} in ${guysTrip_RoundName}`,
      golfers: golfers
    });
  });

  console.log('Saving Guys Trip matches:', matchData);

  fetch(BASE + '/api/save_guys_trip_matches.php', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      round_id: currentGuysTrip_RoundId,
      tournament_id: currentTourneyId,
      matches: matchData
    })
  })
  .then(r => r.json())
  .then(result => {
    if (result.success) {
      alert('Matches saved!');
      // Reload to get server-assigned IDs
      showGuysTrip_Matches(currentGuysTrip_RoundId);
    } else {
      alert('Error saving matches: ' + (result.error || 'Unknown error'));
    }
  })
  .catch(err => {
    console.error('Error saving matches:', err);
    alert('Error saving matches');
  });
});

// Show tee times editor for a Guys Trip round
function showGuysTrip_TeeTimes(roundId) {
  currentGuysTrip_RoundId = roundId;

  // Hide other tabs, show tee times tab
  document.querySelectorAll('#section-tourney-detail-guys-trip .tab-content').forEach(c => c.hidden = true);
  document.getElementById('tab-gt-tee-times').hidden = false;

  // Fetch tee time assignments data
  fetch(BASE + `/api/get_tee_time_assignments.php?round_id=${roundId}`, { credentials: 'include' })
    .then(r => r.json())
    .then(data => {
      document.getElementById('gt-tee-times-round-title').textContent = data.round_name;
      renderGuysTrip_TeeTimeWorkspace(data);
    })
    .catch(err => console.error('Error loading tee times:', err));
}

// Render the tee time workspace for Guys Trip
function renderGuysTrip_TeeTimeWorkspace(data) {
  const pool = document.getElementById('gt-unassigned-matches-pool');
  const list = document.getElementById('gt-tee-times-list');

  pool.innerHTML = '';
  list.innerHTML = '';

  // Render unassigned matches
  data.matches.forEach(match => {
    const card = createGuysTrip_TeeTimeMatchCard(match);
    if (match.tee_time_id) {
      // Will be placed in tee time slot below
    } else {
      pool.appendChild(card);
    }
  });

  // Render tee time slots
  data.tee_times.forEach(tt => {
    const slot = document.createElement('div');
    slot.className = 'tee-time-slot';
    slot.dataset.teeTimeId = tt.tee_time_id;

    const header = document.createElement('div');
    header.className = 'tee-time-header';
    header.innerHTML = `
      <span class="tee-time-label">${tt.time}</span>
      <button class="delete-tee-time-btn btn-danger" data-tee-time-id="${tt.tee_time_id}">×</button>
    `;
    slot.appendChild(header);

    const matchesContainer = document.createElement('div');
    matchesContainer.className = 'tee-time-slot-matches';

    // Add matches assigned to this tee time
    data.matches.filter(m => m.tee_time_id === tt.tee_time_id).forEach(match => {
      matchesContainer.appendChild(createGuysTrip_TeeTimeMatchCard(match));
    });

    slot.appendChild(matchesContainer);
    list.appendChild(slot);
  });

  // Initialize drag-drop for tee times
  initGuysTrip_TeeTimeSortable();

  // Add delete handlers for tee time slots
  list.querySelectorAll('.delete-tee-time-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('Delete this tee time?')) {
        deleteGuysTrip_TeeTime(btn.dataset.teeTimeId);
      }
    });
  });
}

// Create a match card for tee time assignment
function createGuysTrip_TeeTimeMatchCard(match) {
  const card = document.createElement('div');
  card.className = 'match-card';
  card.dataset.matchId = match.match_id;
  card.dataset.golferCount = match.golfers ? match.golfers.length : 0;

  // Split golfers into Team 1 (positions 1,2) and Team 2 (positions 3,4)
  let team1 = [];
  let team2 = [];

  if (match.golfers && match.golfers.length > 0) {
    match.golfers.forEach(g => {
      const pos = parseInt(g.team_position) || parseInt(g.player_order) || 1;
      if (pos <= 2) {
        team1.push(`${g.first_name} ${g.last_name}`);
      } else {
        team2.push(`${g.first_name} ${g.last_name}`);
      }
    });
  }

  const team1Names = team1.join(' & ') || 'TBD';
  const team2Names = team2.join(' & ') || 'TBD';

  card.innerHTML = `
    <div class="match-card-title">${match.match_name || 'Match'}</div>
    <div class="match-card-teams">
      <div class="match-card-team team1">
        <span class="team-label">Team 1:</span>
        <span class="team-players">${team1Names}</span>
      </div>
      <div class="match-card-vs">vs</div>
      <div class="match-card-team team2">
        <span class="team-label">Team 2:</span>
        <span class="team-players">${team2Names}</span>
      </div>
    </div>
  `;

  return card;
}

// Initialize Sortable for Guys Trip tee times
function initGuysTrip_TeeTimeSortable() {
  const pool = document.getElementById('gt-unassigned-matches-pool');

  // Unassigned matches pool
  Sortable.create(pool, {
    group: 'gt-tee-times',
    animation: 150,
    ghostClass: 'sortable-ghost'
  });

  // Each tee time slot
  document.querySelectorAll('#gt-tee-times-list .tee-time-slot-matches').forEach(slot => {
    Sortable.create(slot, {
      group: 'gt-tee-times',
      animation: 150,
      ghostClass: 'sortable-ghost'
    });
  });
}

// Delete a tee time
function deleteGuysTrip_TeeTime(teeTimeId) {
  fetch(BASE + `/api/tee_times.php?tee_time_id=${teeTimeId}`, {
    method: 'DELETE',
    credentials: 'include'
  })
  .then(r => r.json())
  .then(() => showGuysTrip_TeeTimes(currentGuysTrip_RoundId))
  .catch(err => console.error('Error deleting tee time:', err));
}

// New Tee Time button for Guys Trip
document.getElementById('gt-new-tee-time-btn')?.addEventListener('click', () => {
  document.getElementById('gt-tee-time-modal').classList.remove('hidden');
});

// Submit new tee time for Guys Trip
document.getElementById('gt-tee-time-create-form')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const time = document.getElementById('gt-tt-time').value;

  fetch(BASE + '/api/tee_times.php', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ round_id: currentGuysTrip_RoundId, time: time })
  })
  .then(r => r.json())
  .then(response => {
    if (response.success) {
      document.getElementById('gt-tee-time-modal').classList.add('hidden');
      document.getElementById('gt-tee-time-create-form').reset();
      showGuysTrip_TeeTimes(currentGuysTrip_RoundId);
    } else {
      alert('Error creating tee time: ' + (response.error || 'Unknown error'));
    }
  })
  .catch(err => {
    console.error('Error creating tee time:', err);
    alert('Error creating tee time');
  });
});

// Save tee time assignments for Guys Trip
document.getElementById('gt-save-tee-times-btn')?.addEventListener('click', () => {
  const assignments = [];

  document.querySelectorAll('#gt-tee-times-list .tee-time-slot').forEach(slot => {
    const teeTimeId = slot.dataset.teeTimeId;
    slot.querySelectorAll('.match-card').forEach(card => {
      assignments.push({
        match_id: parseInt(card.dataset.matchId),
        tee_time_id: parseInt(teeTimeId)
      });
    });
  });

  // Also handle unassigned matches (set tee_time_id to null)
  document.querySelectorAll('#gt-unassigned-matches-pool .match-card').forEach(card => {
    assignments.push({
      match_id: parseInt(card.dataset.matchId),
      tee_time_id: null
    });
  });

  fetch(BASE + '/api/save_tee_time_assignments.php', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      round_id: currentGuysTrip_RoundId,
      assignments: assignments
    })
  })
  .then(r => r.json())
  .then(response => {
    if (response.success) {
      alert('Tee time assignments saved!');
    } else {
      alert('Error saving: ' + (response.error || 'Unknown error'));
    }
  })
  .catch(err => {
    console.error('Error saving tee times:', err);
    alert('Error saving tee time assignments');
  });
});

// Delete a Guys Trip round
function deleteGuysTrip_Round(roundId) {
  fetch(BASE + `/api/rounds.php?round_id=${roundId}`, {
    method: 'DELETE',
    credentials: 'include'
  })
  .then(() => loadGuysTrip_Rounds())
  .catch(err => console.error('Error deleting round:', err));
}

// Back to rounds buttons
document.getElementById('gt-back-to-rounds-btn')?.addEventListener('click', () => {
  document.querySelectorAll('#section-tourney-detail-guys-trip .tab-content').forEach(c => c.hidden = true);
  document.getElementById('tab-gt-rounds').hidden = false;
});
document.getElementById('gt-back-to-rounds-btn-tt')?.addEventListener('click', () => {
  document.querySelectorAll('#section-tourney-detail-guys-trip .tab-content').forEach(c => c.hidden = true);
  document.getElementById('tab-gt-rounds').hidden = false;
});

// New Round button for Guys Trip
document.getElementById('gt-new-round-btn')?.addEventListener('click', () => {
  document.getElementById('gt-round-modal').classList.remove('hidden');
  loadCoursesForGuysTrip_RoundModal();
});

// Load courses into the Guys Trip round modal
function loadCoursesForGuysTrip_RoundModal() {
  fetch(BASE + '/api/courses.php', { credentials: 'include' })
    .then(r => r.json())
    .then(courses => {
      const select = document.getElementById('gt-r-course');
      select.innerHTML = '<option value="">-- Select Course --</option>';
      courses.forEach(c => {
        select.insertAdjacentHTML('beforeend',
          `<option value="${c.course_id}">${c.name}</option>`
        );
      });
    });
}

// Course change handler for Guys Trip - load tees
document.getElementById('gt-r-course')?.addEventListener('change', (e) => {
  const courseId = e.target.value;
  const teeSelect = document.getElementById('gt-r-tees');
  teeSelect.innerHTML = '<option value="">-- Select Tees --</option>';

  if (courseId) {
    fetch(BASE + `/api/get_course_tees.php?course_id=${courseId}`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        // API returns { tees: [...], holes: [...] }
        data.tees.forEach(t => {
          teeSelect.insertAdjacentHTML('beforeend',
            `<option value="${t.tee_id}">${t.tee_name} (${t.slope}/${t.rating}/${t.yardage})</option>`
          );
        });
      });
  }
});

// Submit new round form for Guys Trip
document.getElementById('gt-round-create-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const roundDate = document.getElementById('gt-r-date').value;
  const courseSelect = document.getElementById('gt-r-course');
  const teeSelect = document.getElementById('gt-r-tees');

  const courseId = courseSelect.value;
  const teeId = teeSelect.value;
  const courseName = courseSelect.options[courseSelect.selectedIndex].text;
  const teeName = teeSelect.options[teeSelect.selectedIndex].text.split(' (')[0]; // Get just tee name before the slope/rating

  // Get next round number
  const nextRoundNum = await getNextRoundNumber(currentTourneyId);

  // Generate round name following existing convention
  const roundName = `Round ${nextRoundNum} at ${courseName} (${teeName} tees)`;

  fetch(BASE + '/api/rounds.php', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tournament_id: currentTourneyId,
      course_id: courseId,
      tee_id: teeId,
      round_name: roundName,
      round_date: roundDate
    })
  })
  .then(r => r.json())
  .then(result => {
    document.getElementById('gt-round-modal').classList.add('hidden');
    document.getElementById('gt-round-create-form').reset();
    loadGuysTrip_Rounds();
  })
  .catch(err => console.error('Error creating round:', err));
});

// Close modal handlers for Guys Trip modals
document.querySelectorAll('#gt-round-modal .modal-close, #gt-round-modal .modal-backdrop').forEach(el => {
  el.addEventListener('click', () => {
    document.getElementById('gt-round-modal').classList.add('hidden');
  });
});
document.querySelectorAll('#gt-tee-time-modal .modal-close, #gt-tee-time-modal .modal-backdrop').forEach(el => {
  el.addEventListener('click', () => {
    document.getElementById('gt-tee-time-modal').classList.add('hidden');
  });
});


// ─── Golfers ────────────────────────────────────────────────────────────────
function loadGolfers() {
  fetch(BASE + '/api/golfers.php', { credentials: 'include' })
    .then(r => r.json())
    .then(list => {
      const tbody = document.querySelector('#golfer-list tbody');
      tbody.innerHTML = '';
      list.forEach(g => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${g.golfer_id}</td>
          <td class="editable" data-field="first_name">${g.first_name}</td>
          <td class="editable" data-field="last_name">${g.last_name}</td>
          <td class="editable" data-field="handicap">${g.handicap}</td>
          <td>
            <button class="edit-golfer btn-secondary" data-id="${g.golfer_id}">Edit</button>
            <button class="delete-golfer btn-danger" data-id="${g.golfer_id}">Delete</button>
          </td>`;
        tbody.appendChild(tr);
      });
      // Add event listeners for Edit buttons
      tbody.querySelectorAll('.edit-golfer').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.id;
          const row = btn.closest('tr');
          enableEditing(row, id);
        });
      });

      // Add event listeners for Delete buttons
      tbody.querySelectorAll('.delete-golfer').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.id;
          if (!confirm('Remove this golfer?')) return;
          fetch(BASE + '/api/golfers.php?golfer_id=' + id, {
            method: 'DELETE', credentials: 'include'
          }).then(() => loadGolfers());
        });
      });
    })
    .catch(err => console.error('Error loading golfers:', err));
}

function createGolfer() {
  const first = document.getElementById('g-first-name').value.trim(),
        last  = document.getElementById('g-last-name').value.trim(),
        hcp   = parseFloat(document.getElementById('g-handicap').value);

  fetch(BASE + '/api/golfers.php', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ first_name:first, last_name:last, handicap:hcp })
  })
  .then(() => {
    document.getElementById('golfer-create-form').reset();
    golferModal.classList.add('hidden');
    loadGolfers();
  })
  .catch(err => console.error('Error creating golfer:', err));
}

function enableEditing(row, golferId) {
  // Replace static content with input fields
  row.querySelectorAll('.editable').forEach(cell => {
    const field = cell.dataset.field;
    const value = cell.textContent.trim();
    cell.innerHTML = `<input type="text" class="edit-input" data-field="${field}" value="${value}">`;
  });

  // Replace Edit button with Save and Cancel buttons
  const actionCell = row.querySelector('td:last-child');
  actionCell.innerHTML = `
    <button class="save-golfer btn-secondary" data-id="${golferId}">Save</button>
    <button class="cancel-edit btn-danger">Cancel</button>
  `;

  // Add event listeners for Save and Cancel buttons
  actionCell.querySelector('.save-golfer').addEventListener('click', () => saveGolfer(row, golferId));
  actionCell.querySelector('.cancel-edit').addEventListener('click', () => loadGolfers());
}

function saveGolfer(row, golferId) {
  // Collect updated data from input fields
  const updatedData = {};
  row.querySelectorAll('.edit-input').forEach(input => {
    updatedData[input.dataset.field] = input.value.trim();
  });

  // Send updated data to the server
  fetch(BASE + '/api/golfers.php?golfer_id=' + golferId, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(updatedData).toString()
  })
  .then(() => loadGolfers())
  .catch(err => console.error('Error saving golfer:', err));
}

// ─── Courses ────────────────────────────────────────────────────────────────
function loadCourses() {
  fetch(BASE + '/api/courses.php', { credentials: 'include' })
    .then(r => r.json())
    .then(list => {
      const tbody = document.querySelector('#course-list tbody');
      tbody.innerHTML = '';
      list.forEach(c => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${c.course_id}</td>
          <td class="editable" data-field="name">${c.name}</td>

          <td>
            <button class="edit-course btn-secondary" data-id="${c.course_id}">View and Edit</button>
            <button class="delete-course btn-danger" data-id="${c.course_id}">Delete</button>
          </td>`;
        tbody.appendChild(tr);
      });

      // Add event listeners for Edit buttons
      tbody.querySelectorAll('.edit-course').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.id;
          const row = btn.closest('tr');
          showCourseDetailPage(row, id);
        });
      });

      // Add event listeners for Delete buttons
      tbody.querySelectorAll('.delete-course').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.id;
          if (!confirm('Delete this course?')) return;
          fetch(BASE + '/api/courses.php?course_id=' + id, {
            method: 'DELETE', credentials: 'include'
          }).then(() => loadCourses());
        });
      });
    })
    .catch(err => console.error('Error loading courses:', err));
}

function createCourse() {
  const name     = document.getElementById('c-name').value.trim(),
        parTotal = parseInt(document.getElementById('c-par-total').value, 10),
        tees     = document.getElementById('c-tees').value.trim(),
        slope    = parseInt(document.getElementById('c-slope').value, 10),
        rating   = parseFloat(document.getElementById('c-rating').value),
        yardage  = parseInt(document.getElementById('c-yardage').value, 10);

  fetch(BASE + '/api/courses.php', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: name,
      par_total: parTotal,
      tees: tees,
      slope: slope,
      rating: rating,
      total_yardage: yardage
    })
  })
  .then(() => {
    document.getElementById('course-create-form').reset();
    loadCourses();
  })
  .catch(err => console.error('Error creating course:', err));
}

function showCourseDetailPage(row, courseId) {
  // Hide other sections and show the course detail section
  document.querySelectorAll('.admin-section').forEach(sec => sec.hidden = true);
  document.getElementById('section-course-detail').hidden = false;

  // Set course name at the top
  const courseName = row.querySelector('.editable[data-field="name"]').textContent.trim();
  document.getElementById('course-detail-title').textContent = courseName;

  // Fetch and render tees table
  fetch(`/api/get_course_tees.php?course_id=${courseId}`)
    .then(r => r.json())
    .then(data => {
      const tees = data.tees;
      const holes = data.holes;
      const tbody = document.getElementById('course-tees-table-body');
      tbody.innerHTML = '';


      // Add the tees rows
      tees.forEach(tee => {
        let holesHtml = '';
        for (let i = 1; i <= 18; i++) {
          holesHtml += `<td>${tee[`hole_${i}_distance`] || ''}</td>`;
        }
        tbody.innerHTML += `
          <tr>
            <td>${tee.tee_name}</td>
            <td>${tee.slope}</td>
            <td>${tee.rating}</td>
            <td>${tee.par}</td>
            <td>${tee.yardage}</td>
            ${holesHtml}
          </tr>
        `;
      });
            // Add a row for Par
      let parRow = '<tr><td colspan="5" style="font-weight:bold;text-align:right;border-top:2px solid #333">Par</td>';
      for (let i = 1; i <= 18; i++) {
        const hole = holes.find(h => h.hole_number == i);
        parRow += `<td style="border-top:2px solid #333;">${hole ? hole.par : ''}</td>`;
      }
      parRow += '</tr>';
      tbody.innerHTML += parRow;

      // Add a row for Handicap Index
      let hcpRow = '<tr><td colspan="5" style="font-weight:bold;text-align:right;">Handicap</td>';
      for (let i = 1; i <= 18; i++) {
        const hole = holes.find(h => h.hole_number == i);
        hcpRow += `<td>${hole ? hole.handicap_index : ''}</td>`;
      }
      hcpRow += '</tr>';
      tbody.innerHTML += hcpRow;


    });
  document.getElementById('back-to-courses').addEventListener('click', () => {
    document.getElementById('section-course-detail').hidden = true;
    document.getElementById('section-courses').hidden = false;
  });
}

function saveCourse(row, courseId) {
  // Collect updated data from input fields
  const updatedData = {};
  row.querySelectorAll('.edit-input').forEach(input => {
    updatedData[input.dataset.field] = input.value.trim();
  });

  // Send updated data to the server
  fetch(BASE + '/api/courses.php?course_id=' + courseId, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(updatedData).toString()
  })
  .then(() => loadCourses())
  .catch(err => console.error('Error saving course:', err));
}

//--------------Tournament Details Page-----------------------------------------

//----------------Team Sub Detail Page---------------------------

// Add this function in your admin.js file
function loadTeams() {
  if (!currentTourneyId) {
    console.error('No tournament ID set');
    return;
  }

  fetch(BASE + `/api/tournament_teams.php?tournament_id=${currentTourneyId}`, {
    credentials: 'include'
  })
  .then(r => r.json())
  .then(teams => {
    const tbody = document.querySelector('#teams-table tbody');
    tbody.innerHTML = ''; // Clear existing rows

    teams.forEach(team => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <input type="text" class="team-name" value="${team.name}" data-team-id="${team.team_id}" disabled>
        </td>
        <td>
          <input type="color" class="team-color" value="${team.color_hex || '#000000'}" data-team-id="${team.team_id}" disabled>
        </td>
        <td>
          <button class="edit-team btn-secondary" data-team-id="${team.team_id}">Edit</button>
          <button class="delete-team btn-danger" data-team-id="${team.team_id}">Delete</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    // Move these event listeners inside the .then() block
    // Add event listeners for edit buttons
    tbody.querySelectorAll('.edit-team').forEach(btn => {
      btn.addEventListener('click', () => {
        const tr = btn.closest('tr');
        const teamId = btn.dataset.teamId;
        const nameInput = tr.querySelector('.team-name');
        const colorInput = tr.querySelector('.team-color');

        // Store original values in case of cancel
        const originalName = nameInput.value;
        const originalColor = colorInput.value;

        // Enable inputs
        nameInput.disabled = false;
        colorInput.disabled = false;

        // Replace Edit/Delete buttons with Save/Cancel buttons
        const tdActions = btn.parentElement;
        tdActions.innerHTML = `
          <button class="save-edit-team btn-secondary">Save</button>
          <button class="cancel-edit-team btn-danger">Cancel</button>
        `;

        // Add event listener for Save button
        tdActions.querySelector('.save-edit-team').addEventListener('click', () => {
          fetch(BASE + `/api/tournament_teams.php?team_id=${teamId}`, {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: nameInput.value,
              color: colorInput.value
            })
          })
          .then(r => r.json())
          .then(res => {
            if (res.success) {
              loadTeams(); // Reload the table
            } else {
              alert('Error saving team: ' + res.error);
            }
          });
        });

        // Add event listener for Cancel button
        tdActions.querySelector('.cancel-edit-team').addEventListener('click', () => {
          // Restore original values
          nameInput.value = originalName;
          colorInput.value = originalColor;
          loadTeams(); // Reload the table to reset the buttons
        });
      });
    });

    // Add event listeners for delete buttons
    tbody.querySelectorAll('.delete-team').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!confirm('Are you sure you want to delete this team?')) return;
        
        const teamId = btn.dataset.teamId;
        fetch(BASE + `/api/tournament_teams.php?tournament_id=${currentTourneyId}&team_id=${teamId}`, {
          method: 'DELETE',
          credentials: 'include'
        })
        .then(r => r.json())
        .then(res => {
          if (res.success) {
            loadTeams(); // Reload the table
          } else {
            alert('Error deleting team: ' + res.error);
          }
        });
      });
    });
  })
  .catch(err => console.error('Error loading teams:', err));
}


// Add event handler for the "New Team" button
document.getElementById('newTeamBtn').addEventListener('click', () => {
  const tbody = document.querySelector('#teams-table tbody');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" class="team-name" value="New Team"></td>
    <td><input type="color" class="team-color" value="#000000"></td>
    <td><button class="save-new-team btn-primary">Save</button></td>
  `;
  tbody.appendChild(tr);

  tr.querySelector('.save-new-team').addEventListener('click', () => {
    const name = tr.querySelector('.team-name').value;
    const color = tr.querySelector('.team-color').value;

    fetch(BASE + `/api/tournament_teams.php`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tournament_id: currentTourneyId,
        name: name,
        color: color
      })
    })
    .then(r => r.json())
    .then(res => {
      if (res.success) {
        loadTeams(); // Reload the table
      } else {
        alert('Error creating team: ' + res.error);
      }
    });
  });
});





function loadTourneyRoster() {
  const tournament_id = currentTourneyId;
  let tournamentData = null; // Will store the teams data

  if (!tournament_id) {
    alert('Missing tournament_id in URL');
  } else {
    fetch(BASE + `/api/get_tournament_assignments.php?tournament_id=${tournament_id}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          alert('Error: ' + data.error);
          return;
        }
        
        // Populate golfers into the correct zones
        const availableZone = document.getElementById('available');
        const teamAZone = document.getElementById('teamA');
        const teamBZone = document.getElementById('teamB');
        tournamentData = data;

        // Clear existing golfer cards but keep the titles
        Array.from(teamAZone.children).forEach(child => {
          if (!child.matches('h3')) child.remove(); // Remove everything except the <h3>
        });
        Array.from(teamBZone.children).forEach(child => {
          if (!child.matches('h3')) child.remove();
        });
        Array.from(availableZone.children).forEach(child => {
          if (!child.matches('h3')) child.remove();
        });

        // Dynamically assign team IDs, names, and colors to the zones
        if (data.teams.length > 0) {
          teamAZone.dataset.teamId = data.teams[0].id; // Assign the first team's ID
          const teamAHeader = teamAZone.querySelector('h3');
          if (teamAHeader) {
            teamAHeader.textContent = data.teams[0].name; // Update the team name
            teamAHeader.style.backgroundColor = data.teams[0].color; // Set the team color
            teamAHeader.style.color = '#fff'; // Ensure text is readable
          }


          if (data.teams.length > 1) {
            teamBZone.dataset.teamId = data.teams[1].id; // Assign the second team's ID
            const teamBHeader = teamBZone.querySelector('h3');
            if (teamBHeader) {
              teamBHeader.textContent = data.teams[1].name;
              teamBHeader.style.backgroundColor = data.teams[1].color;
              teamBHeader.style.color = '#fff';
            }
          }
        }

        // Add unassigned golfers to the "available" zone
        data.unassigned.forEach(golfer => {
          const card = createGolferCard(golfer);
          availableZone.appendChild(card);
        });

        // Add golfers to their respective teams
        data.teams.forEach(team => {
          let zone = null;
          if (team.id === parseInt(teamAZone.dataset.teamId)) {
            zone = teamAZone;
          } else if (team.id === parseInt(teamBZone.dataset.teamId)) {
            zone = teamBZone;
          }
          if (zone) {
            team.golfers.forEach(golfer => {
              const card = createGolferCard(golfer);
              zone.appendChild(card);
            });
          }
        });

        // Rebind the Save button to avoid duplicate event handlers
        const saveBtn = document.getElementById('saveBtn');
        const newSaveBtn = saveBtn.cloneNode(true);
        saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);

        newSaveBtn.addEventListener('click', () => {
          if (!tournamentData) {
            alert('Tournament data not loaded yet');
            return;
          }

          const assignments = [];
          // Get team IDs stored in the zone data attributes
          const teamAId = document.getElementById('teamA').dataset.teamId;
          const teamBId = document.getElementById('teamB').dataset.teamId;

          // Collect Team A assignments
          document.querySelectorAll('#teamA .card').forEach(card => {
            assignments.push({
              golfer_id: parseInt(card.dataset.id),
              team_id: parseInt(teamAId)
            });
          });
          // Collect Team B assignments
          document.querySelectorAll('#teamB .card').forEach(card => {
            assignments.push({
              golfer_id: parseInt(card.dataset.id),
              team_id: parseInt(teamBId)
            });
          });

          // Build payload
          const payload = {
            tournament_id: parseInt(tournament_id),
            assignments: assignments
          };
          


          fetch('/api/save_tournament_assignments.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          })
            .then(r => r.json())
            .then(res => {
              if (res.success) {
                alert('Assignments saved successfully!');
              } else {
                alert('Error: ' + res.error);
              }
            })
            .catch(err => alert('Network error'));
        });
      })
      .catch(err => {
        console.error('Error fetching tournament assignments:', err);
        alert('Failed to load tournament assignments.');
      });
  }
}

// 2) Helper function to create a golfer card
function createGolferCard(golfer) {
  const card = document.createElement('div');
  card.className = 'card';
  card.textContent = `${golfer.name} (${golfer.handicap})`;
  card.dataset.id = golfer.id;
  return card;
}

// 3) Initialize SortableJS for all zones
const zones = ['available', 'teamA', 'teamB'];
zones.forEach(zoneId => {
  Sortable.create(document.getElementById(zoneId), {
    group: 'golfers', // allow drag between all zones
    animation: 150, // smooth animation
    ghostClass: 'sortable-ghost',
    draggable: '.card',
    onAdd: evt => {
      // Optional: add code to handle onAdd events
    },
    onRemove: evt => {
      // Optional: add code to handle onRemove events
    }
  });
});

// Add these helper functions






// Tournament creation Modal open/close
const tourneyModal = document.getElementById('tourney-modal');

// Open modal and load formats
document.getElementById('open-tourney-modal')
  .addEventListener('click', () => {
    tourneyModal.classList.remove('hidden');
    // Populate the format select
    fetch(BASE + '/api/formats.php', { credentials:'include' })
      .then(res => res.json())
      .then(formats => {
        const fmtSelect = document.getElementById('m-t-format');
        fmtSelect.innerHTML = '<option value="">-- Choose Format --</option>';
        formats.forEach(f => {
          fmtSelect.insertAdjacentHTML('beforeend',
            `<option value="${f.format_id}">${f.name}</option>`
          );
        });
      })
      .catch(err => console.error('Error loading formats:', err));
  });

// Close modal
tourneyModal.querySelectorAll('.modal-close')
  .forEach(btn => btn.addEventListener('click', () => {
    tourneyModal.classList.add('hidden');
  }));


// Handle submit in tourney modal (single listener)
const tourneyForm = document.getElementById('tourney-create-modal-form');
tourneyForm.addEventListener('submit', e => {
  e.preventDefault();

  const name     = document.getElementById('m-t-name').value.trim();
  const start    = document.getElementById('m-t-start').value;
  const end      = document.getElementById('m-t-end').value;
  const hcpPct   = parseFloat(document.getElementById('m-t-hcp').value);
  const fmtId    = parseInt(document.getElementById('m-t-format').value, 10);

  // 1) Create tournament
  fetch(BASE + '/api/tournaments.php', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      start_date:   start,
      end_date:     end,
      handicap_pct: hcpPct,
      format_id:    fmtId
    })
  })
  .then(res => res.json())
  .then(() => {
    // 4) Close, reset, refresh, then open the next modal
    document.getElementById('tourney-modal').classList.add('hidden');
    tourneyForm.reset();
    loadTournaments();

    // Now that we have the ID and roundCount, open next modal
   // openRoundsModal();
  })
  .catch(err => console.error('Error creating tournament:', err));
});

// Open create golfer modal

const golferModal = document.getElementById('golfer-modal');
document.getElementById('open-golfer-modal')
  .addEventListener('click', () => {
    golferModal.classList.remove('hidden');

  });

// Close golfer modal
golferModal.querySelectorAll('.modal-close')
  .forEach(btn => btn.addEventListener('click', () => {
    golferModal.classList.add('hidden');
  }));  

// Open create course modal

const courseModal = document.getElementById('course-modal');
document.getElementById('open-course-modal')
  .addEventListener('click', () => {
    courseModal.classList.remove('hidden');

  });

// Close course modal
courseModal.querySelectorAll('.modal-close')
  .forEach(btn => btn.addEventListener('click', () => {
    courseModal.classList.add('hidden');
  }));    



// Rounds
function loadTourneyRounds() {
  Promise.all([
    fetch(BASE + '/api/rounds.php?tournament_id=' + currentTourneyId, { credentials: 'include' }).then(r => r.json()),
    fetch(BASE + '/api/rounds.php', { credentials: 'include' }).then(r => r.json())
  ]).then(([assigned, all]) => {
    const tbody = document.querySelector('#rounds-table tbody');
    tbody.innerHTML = '';

    // Populate the table with assigned rounds
    assigned.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="round-date">${r.round_date}</td>
        <td class="round-name">${r.round_name}</td>
        <td>
          <button data-id="${r.round_id}" class="assign-matches btn-primary">Assign Matches</button>
          <button data-id="${r.round_id}" class="tee-times btn-primary">Tee Times</button>
          <button data-id="${r.round_id}" class="edit-round btn-secondary">Edit Round</button>
          <button data-id="${r.round_id}" class="rounds-remove btn-danger">Delete</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

      // Add event listeners for Edit buttons
    tbody.querySelectorAll('.edit-round').forEach(btn => {
      btn.addEventListener('click', () => {
        const roundId = btn.dataset.id;
        const tr = btn.closest('tr');
        
        // Store original values
        const originalDate = tr.querySelector('.round-date').textContent;
        const originalName = tr.querySelector('.round-name').textContent;

        // Replace with editable fields
        tr.querySelector('.round-date').innerHTML = `
          <input type="date" class="edit-round-date" value="${originalDate}">
        `;
        tr.querySelector('.round-name').innerHTML = `
          <input type="text" class="edit-round-name" value="${originalName}">
        `;

        // Replace action buttons
        const tdActions = btn.parentElement;
        tdActions.innerHTML = `
          <button class="save-round btn-secondary" data-id="${roundId}">Save</button>
          <button class="cancel-round btn-danger">Cancel</button>
        `;

              // Add save handler
        tdActions.querySelector('.save-round').addEventListener('click', () => {
          const newDate = tr.querySelector('.edit-round-date').value;
          const newName = tr.querySelector('.edit-round-name').value;

          fetch(BASE + `/api/update_round.php?round_id=${roundId}`, {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              round_date: newDate,
              round_name: newName
            })
          })
          .then(r => r.json())
          .then(res => {
            if (res.success) {
              loadTourneyRounds(); // Reload the table
            } else {
              alert('Error saving round: ' + res.error);
            }
          });
        });

        // Add cancel handler
        tdActions.querySelector('.cancel-round').addEventListener('click', () => {
          loadTourneyRounds(); // Reload the table to reset the view
        });
      });
    });  



    // Add event listeners for Assign Matches buttons
    tbody.querySelectorAll('.assign-matches').forEach(btn => {
      btn.addEventListener('click', () => {
        const roundId = btn.dataset.id;
        showMatchesSubtab(roundId);
      });
    });

    //add event listeners for Tee Times buttons
    tbody.querySelectorAll('.tee-times').forEach(btn => {
      btn.addEventListener('click', () => {
        const roundId = btn.dataset.id;
        showTeeTimesSubtab(roundId);
      });
    });


    // Add event listeners for Delete buttons
    tbody.querySelectorAll('.rounds-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const rid = btn.dataset.id;
        if (!confirm('Are you sure you want to delete this round?')) return;
        fetch(BASE + `/api/rounds.php?tournament_id=${currentTourneyId}&round_id=${rid}`, {
          method: 'DELETE',
          credentials: 'include'
        }).then(() => loadTourneyRounds());
      });
    });
  });
}

//new round functions


function loadCourseSelect() {
  fetch(BASE + '/api/courses.php', {
    credentials: 'include'
  })
  .then(r => r.json())
  .then(courses => {
    const select = document.getElementById('r-course');
    select.innerHTML = '<option value="">-- Select Course --</option>';
    courses.forEach(course => {
      select.innerHTML += `
        <option value="${course.course_id}">${course.name}</option>
      `;
    });

  });
}

document.getElementById('r-course').addEventListener('change', function() {
  const courseId = this.value;
  const teesSelect = document.getElementById('r-tees');
  teesSelect.innerHTML = '<option value="">-- Select Tees (slope,rating,yards) --</option>';

  if (!courseId) return;

  fetch(`/api/get_course_tees.php?course_id=${courseId}`)
    .then(r => r.json())
    .then(data => {
      const tees = data.tees || data; // support both array and {tees:[]} response
      tees.forEach(tee => {
        teesSelect.innerHTML += `<option data-tee-name="${tee.tee_name}" value="${tee.tee_id}">${tee.tee_name} (${tee.slope},${tee.rating},${tee.yardage})</option>`;
      });
    })
    .catch(() => {
      teesSelect.innerHTML = '<option value="">No tees found</option>';
    });
});

function getNextRoundNumber(tournamentId) {
  return fetch(BASE + `/api/rounds.php?tournament_id=${tournamentId}`, {
    credentials: 'include'
  })
  .then(r => r.json())
  .then(rounds => rounds.length + 1);
}

// Add event listener for new round button
document.getElementById('newRoundBtn').addEventListener('click', () => {
  const modal = document.getElementById('round-modal');
  modal.classList.remove('hidden');
  loadCourseSelect();
});

// Add form submit handler
document.getElementById('round-create-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const date = document.getElementById('r-date').value;
  const courseId = document.getElementById('r-course').value;
  const courseName = document.getElementById('r-course').selectedOptions[0].text;
  const teeName = document.getElementById('r-tees').selectedOptions[0].dataset.teeName;
  const teeId = document.getElementById('r-tees').value;
  
  // Get next round number
  const nextRoundNum = await getNextRoundNumber(currentTourneyId);
  
  // Generate round name
  const roundName = `Round ${nextRoundNum} at ${courseName} (${teeName} tees)`;
  
  // Create the round
  fetch(BASE + '/api/rounds.php', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tournament_id: currentTourneyId,
      course_id: courseId,
      tee_id: teeId,
      round_name: roundName,
      round_date: date
    })
  })
  .then(r => r.json())
  .then(res => {
    if (res.inserted_id) {
      // Close modal and reload rounds
      document.getElementById('round-modal').classList.add('hidden');
      loadTourneyRounds();
    } else {
      alert('Error creating round');
    }
  });
});

// Add event listeners for modal close buttons
document.querySelectorAll('#round-modal .modal-close').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById('round-modal').classList.add('hidden');
  });
});





//matches subtab off of rounds page
let currentRoundId = null;

function showMatchesSubtab(roundId) {
  currentRoundId = roundId; // Store the round_id globally

  // Hide other tabs and show the Matches tab
  document.querySelectorAll('.tab-content').forEach(tab => tab.hidden = true);
  const matchesTab = document.getElementById('tab-matches');
  matchesTab.hidden = false;

  // Update the round title
  fetch(`/api/get_match_data.php?round_id=${roundId}`)
    .then(res => res.json())
    .then(data => {


      // Initialize the drag-and-drop module
      MatchBoard.loadFromServer({
        containers: { pools: 'pools', board: 'board' },
        teamConfig: {},
        maxTeamSize: 2,
        roundId
      }).then(b => { board = b; });

    })
    .catch(err => console.error('Error loading match data:', err));
}

// Function to show the Tee Times subtab

function showTeeTimesSubtab(roundId) {
    currentRoundId = roundId; // Make sure this is still set

    // Hide other tabs and show the Tee Times tab
    document.querySelectorAll('.tab-content').forEach(tab => tab.hidden = true);
    const teeTimesTab = document.getElementById('tab-tee-times');
    teeTimesTab.hidden = false;

    // Fetch all data needed for the assignment view
    fetch(`/api/get_tee_time_assignments.php?round_id=${roundId}`)
        .then(res => res.json())
        .then(data => {
            const newRoundTitle = data.round_name + " " + data.round_date;
            document.getElementById('tee-times-round-title').textContent = newRoundTitle;
            renderTeeTimeWorkspace(data);
        })
        .catch(err => console.error('Error loading tee time assignments:', err));
}

function renderTeeTimeWorkspace(data) {
    const pool = document.getElementById('unassigned-matches-pool');
    const list = document.getElementById('tee-times-list');
    pool.innerHTML = '';
    list.innerHTML = '';

    // Create and populate the tee time slots first
    data.tee_times.forEach(tt => {
        const slot = document.createElement('div');
        slot.className = 'tee-time-slot';
        slot.dataset.teeTimeId = tt.tee_time_id;

        slot.innerHTML = `
          <button class="delete-tee-time" data-tee-time-id="${tt.tee_time_id}" title="Delete this tee time">×</button>
          <h5>${tt.time.substring(0,5)}</h5>
          <div class="tee-time-slot-matches"></div>
        `;
        list.appendChild(slot);
    });

    // Create match cards and place them in the correct location (pool or tee time)
    data.matches.forEach(match => {
        const card = createMatchCard(match);
        if (match.tee_time_id) {
            const targetSlot = list.querySelector(`.tee-time-slot[data-tee-time-id="${match.tee_time_id}"] .tee-time-slot-matches`);
            if (targetSlot) {
                targetSlot.appendChild(card);
            } else {
                pool.appendChild(card); // Fallback to pool if slot not found
            }
        } else {
            pool.appendChild(card);
        }
    });
    
    // Now, initialize SortableJS
    initTeeTimeSortable();
}

function createMatchCard(match) {
    const card = document.createElement('div');
    card.className = 'match-card';
    card.dataset.matchId = match.match_id;
    card.dataset.golferCount = match.golfers.length;

    // First, group golfers by team. This makes rendering much easier.
    const teamsInMatch = {};
    match.golfers.forEach(golfer => {
        // If this is the first time we've seen this team, create an entry for it.
        if (!teamsInMatch[golfer.team_name]) {
            teamsInMatch[golfer.team_name] = {
                color: golfer.team_color,
                players: []
            };
        }
        // Add the golfer's name to their team's list of players.
        teamsInMatch[golfer.team_name].players.push(golfer.name);
    });

    // Now, build the HTML from our structured groups.
    let cardHtml = '';
    for (const teamName in teamsInMatch) {
        const teamData = teamsInMatch[teamName];
        
        // Add a header for the team.
        cardHtml += `<h6 class="match-card-team-header" style="background-color:${teamData.color};">${teamName}</h6>`;
        
        // Add a div to hold the player names for this team.
        cardHtml += '<div class="match-card-players">';
        teamData.players.forEach(playerName => {
            cardHtml += `<span class="player-name">${playerName}</span>`;
        });
        cardHtml += '</div>';
    }

    card.innerHTML = cardHtml;
    return card;
}

function initTeeTimeSortable() {
    const pool = document.getElementById('unassigned-matches-pool');
    const teeTimeSlots = document.querySelectorAll('.tee-time-slot-matches');
    
    // The pool of unassigned matches
    Sortable.create(pool, {
        group: 'tee-times',
        animation: 150,
    });

    // Each of the tee time slots
    teeTimeSlots.forEach(slot => {
        Sortable.create(slot, {
            group: 'tee-times',
            animation: 150,
            onAdd: function (evt) {
                const receivingSlot = evt.to;
                const droppedCard = evt.item;

                let currentGolfersInSlot = 0;
                receivingSlot.childNodes.forEach(card => {
                    currentGolfersInSlot += parseInt(card.dataset.golferCount, 10);
                });

                // Check capacity (max 4 golfers)
                if (currentGolfersInSlot > 4) {
                    // Move the item back to where it came from
                    evt.from.appendChild(droppedCard);
                    alert("Tee time cannot exceed 4 golfers!");
                }
            }
        });
    });
}

// ---- Event Listeners for Buttons and Modals ----

// Event listener for opening the create tee time modal
document.getElementById('newTeeTimeBtn').addEventListener('click', () => {
  document.getElementById('tee-time-modal').classList.remove('hidden');
});

// Close modal
document.querySelectorAll('#tee-time-modal .modal-close').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById('tee-time-modal').classList.add('hidden');
  });
});

// Handle form submission for new tee time
document.getElementById('tee-time-create-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const time = document.getElementById('tt-time').value;

    fetch('/api/tee_times.php', { // You'll need to create this simple API endpoint
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ round_id: currentRoundId, time: time })
    })
    .then(res => res.json())
    .then(response => {
        if (response.success) {
            document.getElementById('tee-time-modal').classList.add('hidden');
            document.getElementById('tee-time-create-form').reset();
            showTeeTimesSubtab(currentRoundId); // Refresh the view
        } else {
            alert('Error creating tee time: ' + response.error);
        }
    });
});

// Handle saving the assignments
document.getElementById('saveTeeTimesBtn').addEventListener('click', () => {
    const assignments = [];
    document.querySelectorAll('.tee-time-slot').forEach(slot => {
        const teeTimeId = slot.dataset.teeTimeId;
        slot.querySelectorAll('.match-card').forEach(card => {
            assignments.push({
                match_id: parseInt(card.dataset.matchId, 10),
                tee_time_id: parseInt(teeTimeId, 10)
            });
        });
    });

    const payload = {
        round_id: currentRoundId,
        assignments: assignments
    };

    fetch('/api/save_tee_time_assignments.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(response => {
        if (response.success) {
            alert('Tee time assignments saved successfully!');
        } else {
            alert('Error saving assignments: ' + response.error);
        }
    });
});

// delete tee time functionality
document.getElementById('tee-times-list').addEventListener('click', (e) => {
    // Check if the clicked element is a delete button
    if (e.target.matches('.delete-tee-time')) {
        const button = e.target;
        const teeTimeId = button.dataset.teeTimeId;
        const slotElement = button.closest('.tee-time-slot');
        
        if (!teeTimeId || !slotElement) return;

        // Warn the user and get confirmation
        const confirmationMessage = 'Are you sure you want to delete this tee time? Any assigned matches will be moved back to the "Unassigned" pool.';
        if (!confirm(confirmationMessage)) {
            return; // User clicked "Cancel"
        }

        // Send the DELETE request to the server
        fetch(`/api/delete_tee_time.php?tee_time_id=${teeTimeId}`, {
            method: 'DELETE',
            credentials: 'include'
        })
        .then(res => res.json())
        .then(response => {
            if (response.success) {
                // The most important part: update the UI without a page reload.

                // 1. Find any match cards inside the slot being deleted.
                const matchCards = slotElement.querySelectorAll('.match-card');
                
                // 2. Move them back to the unassigned pool.
                const pool = document.getElementById('unassigned-matches-pool');
                matchCards.forEach(card => {
                    pool.appendChild(card);
                });

                // 3. Remove the now-empty tee time slot element from the DOM.
                slotElement.remove();

            } else {
                alert('Error: ' + (response.error || 'Could not delete tee time.'));
            }
        })
        .catch(err => {
            console.error('Error deleting tee time:', err);
            alert('A network error occurred. Please try again.');
        });
    }
});





