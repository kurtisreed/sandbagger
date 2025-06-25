const tournament_id = currentTourneyId;
let hasUnsavedChanges = false;

let tournamentData = null; // Will store the teams data

if (!tournament_id) {
  alert('Missing tournament_id in URL');
} else {
  fetch(`/sandbaggerv2/api/get_tournament_assignments.php?tournament_id=${tournament_id}`)
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        alert('Error: ' + data.error);
        return;
      }

      // Populate golfers into the correct zones
        // instead of looping over availableZone.children…
        const availableZone = document.getElementById('available');
        
      const teamAZone = document.getElementById('teamA');
      const teamBZone = document.getElementById('teamB');
      tournamentData = data;

        // Clear existing golfer cards but keep the titles
        Array.from(teamAZone.children).forEach(child => {
        if (!child.matches('h3')) child.remove(); // Remove everything except the <h3>
        });
        Array.from(teamBZone.children).forEach(child => {
        if (!child.matches('h3')) child.remove(); // Remove everything except the <h3>
        });
        Array.from(availableZone.children).forEach(child => {
        if (!child.matches('h3')) child.remove(); // Remove everything except the <h3>
        });

    // Dynamically assign team IDs, names, and colors to the zones
        if (data.teams.length > 0) {
        teamAZone.dataset.teamId = data.teams[0].id; // Assign the first team's ID
        const teamAHeader = teamAZone.querySelector('h3');
        if (teamAHeader) {
            teamAHeader.textContent = data.teams[0].name; // Update the team name
            teamAHeader.style.backgroundColor = data.teams[0].color; // Set the team color
            teamAHeader.style.color = '#fff'; // Ensure text is readable on colored background
        }

        if (data.teams.length > 1) {
            teamBZone.dataset.teamId = data.teams[1].id; // Assign the second team's ID
            const teamBHeader = teamBZone.querySelector('h3');
            if (teamBHeader) {
            teamBHeader.textContent = data.teams[1].name; // Update the team name
            teamBHeader.style.backgroundColor = data.teams[1].color; // Set the team color
            teamBHeader.style.color = '#fff'; // Ensure text is readable on colored background
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
        const zone = team.id === parseInt(teamAZone.dataset.teamId)
        ? teamAZone
        : team.id === parseInt(teamBZone.dataset.teamId)
        ? teamBZone
        : null;

        if (zone) {
        team.golfers.forEach(golfer => {
            const card = createGolferCard(golfer);
            zone.appendChild(card);
        });
        }
    });

    })
    .catch(err => {
      console.error('Error fetching tournament assignments:', err);
      alert('Failed to load tournament assignments.');
    });

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
    group: 'golfers', // same group — allows drag between all zones
    animation: 150, // smooth animation
    ghostClass: 'sortable-ghost',
    draggable: '.card', // Only .card elements are draggable

    onAdd: evt => {
      showSaveButton();
    },
    onRemove: evt => {
      showSaveButton();
    }
  });
});

// Add these helper functions
function showSaveButton() {
  hasUnsavedChanges = true;
  const saveBtn = document.getElementById('saveBtn');
  saveBtn.parentElement.hidden = false;
}

function hideSaveButton() {
  hasUnsavedChanges = false;
  const saveBtn = document.getElementById('saveBtn');
  saveBtn.parentElement.hidden = true;
}

// 4) Save button gathers IDs from each zone and POSTs them
// Replace the existing save button click handler with this:
document.getElementById('saveBtn').addEventListener('click', () => {
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
            team_id: parseInt(teamAId)  // This will be a valid team ID
        });
    });

    // Collect Team B assignments
    document.querySelectorAll('#teamB .card').forEach(card => {
        assignments.push({
            golfer_id: parseInt(card.dataset.id),
            team_id: parseInt(teamBId)  // This will be a valid team ID
        });
    });

    // Available golfers are not included in assignments array
    // since they don't have a team assignment

    const payload = {
        tournament_id: parseInt(tournament_id),
        assignments: assignments
    };

    fetch('/sandbaggerv2/api/save_tournament_assignments.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(r => r.json())
    .then(res => {
        if (res.success) {
            hideSaveButton();
        } else {
            alert('Error: ' + res.error);
        }
    })
    .catch(err => alert('Network error'));
});


window.addEventListener('beforeunload', (e) => {
  if (hasUnsavedChanges) {
    e.preventDefault();
    return e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
  }
});