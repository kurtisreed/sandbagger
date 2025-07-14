if ('serviceWorker' in navigator) {
  // Wait for the page to fully load
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('service-worker.js')
      .then(reg => console.log('Service Worker registered:', reg.scope))
      .catch(err => console.error('SW registration failed:', err));
  });
}


let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();     // Prevent automatic prompt
  deferredPrompt = e;      // Save for later
  document.getElementById('btnInstall').style.display = 'block';
});

document.getElementById('btnInstall').addEventListener('click', () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  deferredPrompt.userChoice.then(choice => {
    if (choice.outcome === 'accepted') {
      console.log('User installed the app');
    }
    deferredPrompt = null;
    document.getElementById('btnInstall').style.display = 'none';
  });
});




const tabs = document.querySelectorAll('.tabs button');
const content = document.getElementById('content');

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const currentlyActive = document.querySelector('.tabs button.active');
    if (currentlyActive) {
      currentlyActive.classList.remove('active');
    }

    tab.classList.add('active');
    const page = tab.dataset.page;
    loadPage(page);
  });
});


function loadPage(page) {
  content.innerHTML = '';
  
  if (page === 'my-match') {
    const container = document.createElement("div");
    container.id = "score-entry-content";
    content.appendChild(container);
    loadTodaysMatch();
  } else if (page === 'today') {
    const container = document.createElement("div");
    container.id = "today-summary";
    content.appendChild(container);
    loadTodaySummary();
  } else if (page === 'tournament') {
      const container = document.createElement("div");
      container.id = "tournament";
      content.appendChild(container);
      loadTournamentPage(container);
  }
}




let allGolfers = []; // Save the full golfer list globally
let currentMatchId = null;
let golfers = [];
let strokeMaps = {};
let holeInfo = [];
let courses = {};
let tournamentHandicapPct = null;
let primaryTeamName, primaryTeamColor, secondaryTeamName, secondaryTeamColor, primaryTeamId, secondaryTeamId;
let sessionHeartbeatInterval = null;

// Function to start the heartbeat
function startSessionHeartbeat() {
  // If an interval already exists, clear it first
  if (sessionHeartbeatInterval) {
    clearInterval(sessionHeartbeatInterval);
  }

  // Set the interval to run every 5 minutes (300,000 milliseconds)
  // This is well within the default 24-minute PHP timeout.
  sessionHeartbeatInterval = setInterval(() => {
    console.log("Sending session heartbeat...");
    fetch('keep_alive.php', { credentials: 'include' })
      .then(res => {
        if (!res.ok) {
          // If we get a 401 error from our PHP script, the session is dead.
          // We should log the user out gracefully.
          console.warn("Session has expired on the server. Logging out.");
          logoutUser(); // You would create this function to force a page reload.
        }
        return res.json();
      })
      .then(data => {
        console.log("Heartbeat response:", data.message);
      })
      .catch(err => {
        console.error("Heartbeat fetch failed:", err);
      });
  }, 300000); 
}

// Function to stop the heartbeat
function stopSessionHeartbeat() {
  if (sessionHeartbeatInterval) {
    clearInterval(sessionHeartbeatInterval);
    sessionHeartbeatInterval = null;
    console.log("Session heartbeat stopped.");
  }
}



//checks session state
fetch('check_session.php', {
  credentials: 'include'
})
  .then(res => res.json())
  .then(data => {
    if (data.authenticated) {
      startSessionHeartbeat();
      sessionStorage.setItem('golfer_id', data.golfer_id);
      sessionStorage.setItem('selected_round_id', data.round_id);
      sessionStorage.setItem('selected_round_name', data.round_name);
      sessionStorage.setItem('selected_round_date', data.round_date);
      sessionStorage.setItem('selected_tournament_id', data.tournament_id);
      sessionStorage.setItem('selected_tournament_name', data.tournament_name);
      sessionStorage.setItem('golfer_name', data.golfer_name);
      sessionStorage.setItem('tournament_handicap_pct', data.tournament_handicap_pct);
      sessionStorage.setItem('team_id', data.team_id);
      teamId = data.team_id;
      tournamentId = 1;
      tournamentHandicapPct = data.tournament_handicap_pct;
      fetch(`/api/tournament_teams.php?tournament_id=${tournamentId}&_=${Date.now()}`, {
              method: 'GET',
              credentials: 'include'
            })
            .then(res => res.json())
            .then(data => {
              if (data.error) {
                console.error("Error loading teams:", data.error);
                return;
              }
              
              

              data.forEach(team => {
                if (team.team_id === parseInt(teamId)) {
                  primaryTeamName = team.name;
                  primaryTeamColor = team.color_hex;
                  primaryTeamId = team.team_id;
                } else {
                  secondaryTeamName = team.name;
                  secondaryTeamColor = team.color_hex;
                  secondaryTeamId = team.team_id;
                }
              });
              assignCSSColors(primaryTeamColor, secondaryTeamColor);
              sessionStorage.setItem('primary_team_name', primaryTeamName);
              sessionStorage.setItem('primary_team_color', primaryTeamColor);
              sessionStorage.setItem('secondary_team_name', secondaryTeamName);
              sessionStorage.setItem('secondary_team_color', secondaryTeamColor);
              sessionStorage.setItem('primary_team_id', primaryTeamId);
              sessionStorage.setItem('secondary_team_id', secondaryTeamId);
              
              showUserBar(primaryTeamName, primaryTeamColor);

              // Remove active class from all tabs
              document.querySelectorAll('.tabs button').forEach(btn => btn.classList.remove('active'));

              // Find the my-match button
              const myMatchBtn = document.querySelector('button[data-page="my-match"]');
              if (myMatchBtn) {
                myMatchBtn.classList.add('active');
              }

              // Load the my-match page content
              loadPage('my-match');
            })



      document.getElementById('auth-container').style.display = 'none';
      document.getElementById('app-content').style.display = 'block';

      showTournamentBar(data);
    
    fetch(`get_match_by_round.php`, { credentials: 'include' })
        .then(res => res.json())
        .then(data => {
          holeInfo = data.holes;
          if (Array.isArray(data.match) && data.match.length > 0) {
            const first = data.match[0];
            courses = {
              course_name: first.course_name,
              par_total: first.par_total,
              tees: first.tees,
              slope: first.slope,
              rating: first.rating
            };
          }
    });
    }
  });



document.addEventListener("DOMContentLoaded", function () {
    const tournamentSelect = document.getElementById('selectTournament');
    const playerSelect     = document.getElementById('chooseUser');
    const roundSelect      = document.getElementById('selectRound');

    fetch("get_golfers.php")
        .then(response => response.json())
        .then(golfers => {
          allGolfers = golfers; // Save for later lookup
    

        })
        .catch(err => {
          console.error("Error fetching golfers:", err);
        });
    

    const tid = 1;
    fetch(`get_rounds_and_players.php?tournament_id=${tid}`, {
        credentials: 'include'
      })
      .then(res => res.json())
      .then(data => {
        // === players ===
        playerSelect.innerHTML = '<option value="">-- Choose Golfer --</option>';
        data.players.forEach(p => {
          const opt = document.createElement('option');
          opt.value   = p.golfer_id;
          opt.text    = p.name;
          playerSelect.appendChild(opt);
        });
    
        // === rounds ===
        roundSelect.innerHTML = '<option value="">-- Choose Round --</option>';
        data.rounds.forEach(r => {
          const opt = document.createElement('option');
          opt.value   = r.round_id;
          opt.text    = `${r.round_name}`;
          roundSelect.appendChild(opt);
        });
      })
      .catch(err => {
        console.error('Error loading tournament data:', err);
    });



  playerSelect.addEventListener("change", function () {
    const selectedId = this.value;
    const selectedGolfer = allGolfers.find(g => g.golfer_id == selectedId);


    if (selectedGolfer) {
      const fullName = `${selectedGolfer.first_name} ${selectedGolfer.last_name}`;
      sessionStorage.setItem("golfer_id", selectedGolfer.golfer_id);
      sessionStorage.setItem("golfer_name", fullName);
      sessionStorage.setItem("team_name", selectedGolfer.team);
    }
  });
  
});


//Shows the user bar with user name and team name
function showUserBar(teamName = null, teamColor = null) {
  const name = sessionStorage.getItem("golfer_name");

  // Fallback to sessionStorage if teamName or teamColor is not provided
  teamName = teamName || sessionStorage.getItem("primary_team_name");
  teamColor = teamColor || sessionStorage.getItem("primary_team_color");

  

  const userBar = document.getElementById("user-bar");
  const nameSpan = document.getElementById("user-name");

  let info = `${name} – Team ${teamName}`;

  userBar.style.backgroundColor = teamColor || "#ddd"; 
  nameSpan.textContent = info;

  const textColor = pickContrastColorFromHex(teamColor);
  nameSpan.style.color = textColor; // Set text color for contrast
  userBar.style.display = "block";
}

function showTournamentBar(data = null) {
    const tournamentName = data?.tournament_name || sessionStorage.getItem("tournament_name");
    const team = data?.team_name || sessionStorage.getItem("team_name");
    const roundName = data?.round_name || sesionStorage.getItem("round_name");
    
    const tournamentBar = document.getElementById("tournament-bar");
    const tournamentSpan = document.getElementById("tournament-name");
    
    let info = `${tournamentName}<br>${roundName}`;
    
    tournamentSpan.innerHTML = info;

    
      tournamentBar.style.display = "block";
}



//data for the Score Entry tab
function loadTodaysMatch() {
   
    
  fetch(`get_match_by_round.php`, { credentials: 'include' })
    .then(res => res.json())
    .then(data => {
      const matchGolfers = data.match;
      holeInfo = data.holes;
      if (data.error || data.length === 0) {
        const container = document.getElementById("score-entry-content");
        container.innerHTML = "<p>No match found for today. Try logging out and reloading the app.</p>";
        return;
      }

      // Check if finalized
      const match = data.match && data.match[0];
      if (match && match.finalized && parseInt(match.finalized) === 1) {
        loadMatchScorecard(match.match_id, "score-entry-content");
        return;
      }
      const container = document.getElementById("score-entry-content");  
      currentMatchId = data.match[0].match_id;
      
      // Build golfer list
        golfers = [...new Set(matchGolfers.map(row => ({
          id: row.golfer_id,
          name: row.first_name,
          team: row.team_name,
          handicap: calculatePlayingHandicap(row.handicap),
        })))];


      
      strokeMaps = {};
        matchGolfers.forEach(g => {
          strokeMaps[g.golfer_id] = buildStrokeMapForGolfer(calculatePlayingHandicap(g.handicap), holeInfo);
        });





      // ✅ Create table element
      const table = document.createElement("table");
      table.classList.add("score-table");

      // Build header row
      const header = document.createElement("tr");
      header.innerHTML = `<th></th><th>#</th><th>P</th><th>HI</th>` + golfers.map(golfer => {

          let bg, textColor;

          if (golfer.team === primaryTeamName) {
            bg = primaryTeamColor;
            textColor = pickContrastColorFromHex(bg);
          } else if (golfer.team === secondaryTeamName) {
            bg = secondaryTeamColor;
            textColor = pickContrastColorFromHex(bg);
          } else {
            bg = "#ddd"; // Default background for unmatched teams
            textColor = "#000"; // Default text color for unmatched teams
          }
        return `<th style="background-color: ${bg}; color: ${textColor};">${golfer.name} (${parseFloat(golfer.handicap).toFixed(1)})</th>`;
      }).join("");
      table.appendChild(header);

      // Build score rows
      for (let i = 1; i <= 18; i++) {
        const row = document.createElement("tr");
        const par = holeInfo.find(h => h.hole_number === i)?.par || "-";
        const index = holeInfo.find(h => h.hole_number === i)?.handicap_index || "-";

        row.innerHTML = `<td></td><td>${i}</td><td>${par}</td><td>${index}</td>` + golfers.map(golfer => {
            const strokeCount = strokeMaps[golfer.id]?.[i] || 0;
            const select = `
              <select data-hole="${i}" data-golfer="${golfer.id}">
                <option value="">–</option>
                ${[...Array(8).keys()].map(n => `<option value="${n + 1}">${n + 1}</option>`).join("")}
              </select>
            `;

            let dots = '';
            if (strokeCount === 1) {
              dots = '<span class="corner-dot"></span>';
            } else if (strokeCount === 2) {
              dots = '<span class="corner-dot"></span><span class="corner-dot second-dot"></span>';
            }
            return `<td>${dots}${select}</td>`;
        }).join("");
        table.appendChild(row);
      }
      
      const totalsRow = document.createElement("tr");
        totalsRow.id = "totals-row";
        totalsRow.innerHTML = `<td></td><td></td><td></td><td></td>` + golfers.map(g => {
          return `<td class="totals-cell" data-golfer="${g.id}">–</td>`;
        }).join("");
        table.appendChild(totalsRow);


      // ✅ Append table to DOM
      container.appendChild(table);

      let finalizeButton = document.getElementById("finalize-results-btn");
      if (!finalizeButton) {
        finalizeButton = document.createElement("button");
        finalizeButton.id = "finalize-results-btn";
        finalizeButton.textContent = "Finalize Match Results";
        finalizeButton.style.display = "none";
        container.appendChild(finalizeButton);
      }

      document.getElementById("finalize-results-btn").onclick = function() {
        // Calculate points for each team
        // Example: 1 for win, 0.5 for tie, 0 for loss (replace with your logic)
        const points = calculateMatchPoints(); // You need to implement this based on your match logic
        console.log("Calculated points:", points);
        // Send to backend
        fetch('finalize_match_result.php', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            match_id: currentMatchId,
            points // {team_id: points, ...}
          })
        })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            alert("Results finalized!");
            document.getElementById("finalize-results-btn").style.display = "none";
            loadTodaysMatch();
          } else {
            alert("Error finalizing results: " + (data.error || "Unknown error"));
          }
        });
      };
      
      fetch(`get_scores.php?match_id=${data.match[0].match_id}`, {
          credentials: 'include'
        })
        .then(res => res.json())
        .then(scores => {
          scores.forEach(score => {
            const selector = `select[data-hole="${score.hole_number}"][data-golfer="${score.golfer_id}"]`;
            const selectEl = document.querySelector(selector);
            if (selectEl) {
              selectEl.value = score.strokes;

              // Remove previous classes from the parent cell
              const cell = selectEl.closest('td');
              if (cell) {
                cell.classList.remove("score-birdie", "score-bogey", "score-par");
                const par = holeInfo.find(h => h.hole_number == score.hole_number)?.par;
                const strokes = parseInt(score.strokes);
                if (!isNaN(par) && !isNaN(strokes)) {
                  if (strokes < par) cell.classList.add("score-birdie");
                  else if (strokes > par) cell.classList.add("score-bogey");
                  else cell.classList.add("score-par");
                }
              }
            }
          });
          calculateBestBallStatus();
          updateTotalScores();
          updateFinalizeButtonVisibility();
        })
        .catch(err => console.error("Error loading scores:", err));
        
        



      // ✅ NOW it's safe to query selects inside the table
      table.querySelectorAll("select").forEach(select => {
        select.addEventListener("change", function () {
          const strokes = this.value;
          const hole = this.dataset.hole;
          const golfer_id = this.dataset.golfer;

          if (!strokes || !golfer_id || !hole) return;

          const payload = {
            match_id: data.match[0].match_id,
            golfer_id: parseInt(golfer_id),
            hole: parseInt(hole),
            strokes: parseInt(strokes)
          };

          fetch("save_score.php", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          })
          .then(res => res.json())
          .then(data => {
            if (data.success) {
              
              refreshScores(); // 🔁 fetch latest after save
              calculateBestBallStatus();
              updateTotalScores();
              updateFinalizeButtonVisibility();
              updateScoreCellClasses();

            } else {
              console.error("❌ Save failed:", data.message);
            }
          })
          .catch(err => console.error("Fetch error:", err));
        });
      });
    })
    .catch(err => {
      console.error("Error loading match:", err);
    });
}

// updates birdie/bogey/par status
function updateScoreCellClasses() {
  document.querySelectorAll('select[data-hole][data-golfer]').forEach(selectEl => {
    const cell = selectEl.closest('td');
    if (!cell) return;
    cell.classList.remove("score-birdie", "score-bogey", "score-par");
    const hole = parseInt(selectEl.dataset.hole);
    const strokes = parseInt(selectEl.value);
    const par = holeInfo.find(h => h.hole_number == hole)?.par;
    if (!isNaN(par) && !isNaN(strokes)) {
      if (strokes < par) cell.classList.add("score-birdie");
      else if (strokes > par) cell.classList.add("score-bogey");
      else cell.classList.add("score-par");
    }
  });
}

function checkAllScoresEntered() {
  const selects = document.querySelectorAll('select[data-hole][data-golfer]');
  return Array.from(selects).every(sel => sel.value && sel.value !== "");
}

function updateFinalizeButtonVisibility() {
  const btn = document.getElementById("finalize-results-btn");
  if (!btn) return;
  btn.style.display = checkAllScoresEntered() ? "block" : "none";
}

function calculateMatchPoints() {
  // Build stroke maps for all golfers
  const allGolfers = golfers;
  const localStrokeMaps = {};
  allGolfers.forEach(golfer => {
    localStrokeMaps[golfer.id] = buildStrokeMapForGolfer(golfer.handicap, holeInfo);
  });


  // Organize scores by hole and team
  const scoresByHole = {};
  document.querySelectorAll("select[data-hole][data-golfer]").forEach(select => {
    const strokes = parseInt(select.value);
    const holeNum = parseInt(select.dataset.hole);
    const golferId = parseInt(select.dataset.golfer);
    const golfer = allGolfers.find(g => g.id == golferId);
    if (!golfer || isNaN(strokes)) return;

    const strokesReceived = localStrokeMaps[golfer.id][holeNum] || 0;
    const netScore = strokes - strokesReceived;

    if (!scoresByHole[holeNum]) {
      scoresByHole[holeNum] = { [primaryTeamName]: [], [secondaryTeamName]: [] };
    }
    if (!scoresByHole[holeNum][golfer.team]) {
      scoresByHole[holeNum][golfer.team] = [];
    }
    scoresByHole[holeNum][golfer.team].push(netScore);
  });

  // Calculate the differential for each hole
  let differential = 0;
  let holesPlayed = 0;
  for (let i = 1; i <= 18; i++) {
    const hole = scoresByHole[i];
    if (!hole || hole[primaryTeamName].length === 0 || hole[secondaryTeamName].length === 0) continue;

    const primaryBest = Math.min(...hole[primaryTeamName]);
    const secondaryBest = Math.min(...hole[secondaryTeamName]);
    if (!isFinite(primaryBest) || !isFinite(secondaryBest)) continue;

    holesPlayed++;
    if (primaryBest < secondaryBest) differential++;
    else if (secondaryBest < primaryBest) differential--;
  }

  // Decide points
  let points = {};
  if (holesPlayed === 0) {
    points[primaryTeamId] = 0;
    points[secondaryTeamId] = 0;
  } else if (differential > 0) {
    points[primaryTeamId] = 1;
    points[secondaryTeamId] = 0;
  } else if (differential < 0) {
    points[primaryTeamId] = 0;
    points[secondaryTeamId] = 1;
  } else {
    points[primaryTeamId] = 0.5;
    points[secondaryTeamId] = 0.5;
  }
  return points;
}

//calculate golfer total scores
function updateTotalScores() {
  const totals = {}; // golfer_id -> { strokes: 0, toPar: 0 }

  golfers.forEach(golfer => {
    totals[golfer.id] = { strokes: 0, toPar: 0 };
  });

  document.querySelectorAll("select[data-hole][data-golfer]").forEach(select => {
    const strokes = parseInt(select.value);
    const hole = parseInt(select.dataset.hole);
    const golferId = parseInt(select.dataset.golfer);

    const par = holeInfo.find(h => h.hole_number === hole)?.par || 0;

    if (!isNaN(strokes)) {
      totals[golferId].strokes += strokes;
      totals[golferId].toPar += (strokes - par);
    }
  });

  for (let golferId in totals) {
    const cell = document.querySelector(`.totals-cell[data-golfer="${golferId}"]`);
    if (!cell) continue;

    const { strokes, toPar } = totals[golferId];

    const display = toPar === 0
      ? `${strokes} (E)`
      : `${strokes} (${toPar > 0 ? "+" : ""}${toPar})`;

    cell.textContent = display;
  }
}




// functionality for Today Tab
function loadTodaySummary() {
    
  fetch('get_round_matches.php', { credentials: 'include' })
    .then(res => res.json())
    .then(matches => {
      const container = document.getElementById("today-summary");
      container.innerHTML = "";

      if (!Array.isArray(matches) || matches.length === 0) {
        container.textContent = "No matches found. Try logging out and reloading the app.";
        return;
      }
      
      container.innerHTML = "<h3>Matches</h3>";
      assignCSSColors(primaryTeamColor, secondaryTeamColor);
      matches.forEach(match => {
        const div = document.createElement("div");
        div.className = "match-summary";

        // Dynamically filter golfers by team names
        const primaryTeamGolfers = match.golfers.filter(g => g.team_name === primaryTeamName);
        const secondaryTeamGolfers = match.golfers.filter(g => g.team_name === secondaryTeamName);

        const primaryTeamNames = primaryTeamGolfers.map(g => g.first_name).join(" & ");
        const secondaryTeamNames = secondaryTeamGolfers.map(g => g.first_name).join(" & ");

        // Header with names
        const header = `
          <div class="teams-row">
            <div class="team-box primary-team">${primaryTeamNames}</div>
            <div class="vs">vs</div>
            <div class="team-box secondary-team">${secondaryTeamNames}</div>
          </div>`;

        // Get status

        const status = calculateMatchStatus(primaryTeamGolfers, secondaryTeamGolfers, match.scores);
        const statusClass = getMatchStatusClass(status);
        const statusDisplay = `<div class="${statusClass}">${status}</div>`;
        div.innerHTML = header + statusDisplay;

        // Add click event to load match scorecard
        div.addEventListener("click", () => {
          loadMatchScorecard(match.match_id);
        });

        container.appendChild(div);
      });
      // Add placeholder div for skins
            const skinsContainer = document.createElement("div");
            skinsContainer.id = "skins-summary";
            skinsContainer.innerHTML = "<h3>Individual Skins (handicap counts for 0.5)</h3>";
            container.appendChild(skinsContainer);
            
            // Fetch and render skins
            fetch('get_individual_skins.php', { credentials: 'include' })
              .then(res => res.json())
              .then(skins => {
                if (!Array.isArray(skins) || skins.length === 0) {
                  skinsContainer.innerHTML += "<p>No skins awarded yet.</p>";
                  return;
                }
            
                const table = document.createElement("table");
                table.classList.add("skins-table");
            
                const header = document.createElement("tr");
                header.innerHTML = "<th>Hole</th><th>Player</th><th>Team</th><th>Net Score</th>";
                table.appendChild(header);
            
                skins.forEach(skin => {
                  let bgColor = skin.team_color || ""; // Use dynamic team color
                  let txtColor = pickContrastColorFromHex(bgColor);
                  const row = document.createElement("tr");
                  row.innerHTML = `
                    <td>${skin.hole}</td>
                    <td>${skin.golfer_name}</td>
                    <td style="
                      ${bgColor  ? `background-color: ${bgColor};` : ""}
                      ${txtColor ? `color:            ${txtColor};` : ""}
                    ">
                      ${skin.team}
                    </td>
                    <td>${skin.net_score}</td>
                  `;
                  table.appendChild(row);
                });
            
                skinsContainer.innerHTML = "<h3>Individual Skins (handicap counts for 0.5)</h3>";
                skinsContainer.appendChild(table);
              })
              .catch(err => {
                console.error("Error loading skins:", err);
                skinsContainer.innerHTML += "<p>Error loading skins.</p>";
              });
              
        fetch('get_gross_leaderboard.php', { credentials: 'include' })
        .then(res => res.json())
        .then(golfers => {
          if (!Array.isArray(golfers) || golfers.length === 0) return;

          const leaderboardDiv = document.createElement("div");
          leaderboardDiv.className = "gross-leaderboard";
          leaderboardDiv.innerHTML = "<h3>Individual Round Leaderboard - Gross</h3>";

          const table = document.createElement("table");
          table.classList.add("leaderboard-table");

          // Sort golfers by score to par
          golfers.sort((a, b) => (a.strokes - a.par) - (b.strokes - b.par));

          const header = `<tr><th>Rank</th><th>Name</th><th>Team</th><th>To Par</th><th>Thru</th></tr>`;
          table.innerHTML = header;

          golfers.forEach((g, i) => {
            const toPar = g.strokes - g.par;
            const toParStr = toPar === 0 ? "E" : (toPar > 0 ? `+${toPar}` : `${toPar}`);
            
              let bgColor = g.team_color || ""; // Use dynamic team color
              let txtColor = pickContrastColorFromHex(bgColor);
              
              let thruNum;
              if (g.holes_played == 18) {
                  thruNum = "F";
              } else {
                  thruNum = g.holes_played;
              }
              const row = document.createElement("tr");
              row.innerHTML = `
                <td>${i + 1}</td>
                <td>${g.name}</td>
                <td style="
                  ${bgColor  ? `background-color: ${bgColor};` : ""}
                  ${txtColor ? `color:            ${txtColor};` : ""}
                ">
                  ${g.team_name}
                </td>
                <td>${toParStr}</td>
                <td>${thruNum}</td>
              `;
              table.appendChild(row);
          });

          leaderboardDiv.appendChild(table);
          document.getElementById("today-summary").appendChild(leaderboardDiv);
        })
        .catch(err => console.error("Leaderboard error:", err));
    
    // Net leaderboard
        fetch('get_net_leaderboard.php', { credentials: 'include' })
          .then(res => res.json())
          .then(players => {
            if (!Array.isArray(players) || players.length === 0) return;
        
            const netDiv = document.createElement("div");
            netDiv.className = "net-leaderboard";
            netDiv.innerHTML = "<h3>Individual Round Leaderboard - Net</h3>";
        
            const table = document.createElement("table");
            table.classList.add("leaderboard-table");
            table.innerHTML = `<tr>
              <th>Rank</th><th>Name</th><th>Team</th>
              <th>To Par</th><th>Thru</th>
            </tr>`;
        
            // compute To Par and sort by net-to-par
            players.forEach(p => {
              p.toPar = p.net_strokes - p.par;
            });
            players.sort((a,b) => a.toPar - b.toPar);
        
            players.forEach((p,i) => {
              const toPar = p.toPar === 0 ? "E"
                           : (p.toPar > 0 ? `+${p.toPar}` : `${p.toPar}`);
              let bgColor = p.team_color || ""; // Use dynamic team color
              let txtColor = pickContrastColorFromHex(bgColor);
              let thruNum;
              if (p.holes_played == 18) {
                  thruNum = "F";
              } else {
                  thruNum = p.holes_played;
              }
            
              const row = document.createElement("tr");
              row.innerHTML = `
                <td>${i + 1}</td>
                <td>${p.name}</td>
                <td style="
                  ${bgColor  ? `background-color: ${bgColor};` : ""}
                  ${txtColor ? `color:            ${txtColor};` : ""}
                ">
                  ${p.team_name}
                </td>
                <td>${toPar}</td>
                <td>${thruNum}</td>
              `;
              table.appendChild(row);
            });
        
            netDiv.appendChild(table);
            document.getElementById("today-summary").appendChild(netDiv);
          })
          .catch(err => console.error("Net leaderboard error:", err));
    


    
    })
    .catch(err => {
      console.error("Error loading matches:", err);
    });
    
}






//used to show status of matches in today tab
function calculateMatchStatus(primaryTeamGolfers, secondaryTeamGolfers, scores) {


  const allGolfers = primaryTeamGolfers.concat(secondaryTeamGolfers);




  strokeMaps = {}; // golfer_id -> [0,1,...]

  // Build stroke maps for all golfers
  allGolfers.forEach(golfer => {
    strokeMaps[golfer.golfer_id] = buildStrokeMapForGolfer(calculatePlayingHandicap(golfer.handicap), holeInfo);
  });




  const scoresByHole = {}; // hole_number: { primaryTeamName: [net], secondaryTeamName: [net] }

  // Organize scores by hole and team
  scores.forEach(s => {
    const holeNum = parseInt(s.hole_number);
    const golfer = allGolfers.find(g => g.golfer_id == s.golfer_id);
    if (!golfer || !strokeMaps[golfer.golfer_id]) {
      return;
    }

    const strokesReceived = strokeMaps[golfer.golfer_id][holeNum] || 0;
    const netScore = parseInt(s.strokes) - strokesReceived;

    if (!scoresByHole[holeNum]) {
      scoresByHole[holeNum] = { [primaryTeamName]: [], [secondaryTeamName]: [] };
    }

    if (!scoresByHole[holeNum][golfer.team_name]) {
      scoresByHole[holeNum][golfer.team_name] = [];
    }

    scoresByHole[holeNum][golfer.team_name].push(netScore);
  });


  let differential = 0;
  let holesPlayed = 0;

  // Calculate the differential for each hole
  for (let i = 1; i <= 18; i++) {
    const hole = scoresByHole[i];
    if (!hole || hole[primaryTeamName].length === 0 || hole[secondaryTeamName].length === 0) continue;

    const primaryBest = Math.min(...hole[primaryTeamName]);
    const secondaryBest = Math.min(...hole[secondaryTeamName]);

    if (!isFinite(primaryBest) || !isFinite(secondaryBest)) continue;

    holesPlayed++;

    if (primaryBest < secondaryBest) differential++;
    else if (secondaryBest < primaryBest) differential--;

  }

 

  if (holesPlayed === 0) return "No scores yet";

  const holesRemaining = 18 - holesPlayed;

  // Determine match status
  if (Math.abs(differential) > holesRemaining) {
    const margin = Math.abs(differential);
    const closedOut = holesRemaining;
    const winner = differential > 0 ? primaryTeamName : secondaryTeamName;
    return `Team ${winner} wins ${margin}&${closedOut}`;
  }

  if (differential === 0) {
    if (holesPlayed === 18) {
      return "Match Halved";
    } else {
      return `Tied – Thru ${holesPlayed}`;
    }
  }

  if (differential > 0) return `Team ${primaryTeamName} up ${differential} – Thru ${holesPlayed}`;
  return `Team ${secondaryTeamName} up ${Math.abs(differential)} – Thru ${holesPlayed}`;
}


function getMatchStatusClass(statusText) {

  const s = statusText.toLowerCase();

  // 1) Nothing scored yet
  if (s.includes("no scores yet")) {
    return "match-status no-score-status";
  }

  // 2) “Up” (leading)
  if (s.includes(" up ")) {
    // figure out which team is leading
    if (s.includes(primaryTeamName.toLowerCase())) {
      return "match-status primary-team-status";
    } else if (s.includes(secondaryTeamName.toLowerCase())) {
      return "match-status secondary-team-status";
    } else {
      return "match-status";
    }
  }

  // 3) “Down” (trailing)
  if (s.includes(" down ")) {
    if (s.includes(primaryTeamName.toLowerCase())) {
      return "match-status primary-team-status";
    } else if (s.includes(secondaryTeamName.toLowerCase())) {
      return "match-status secondary-team-status";
    } else {
      return "match-status primary-team-status";
    }
  }

  // 4) Win-by-X
  if (s.includes(`${primaryTeamName.toLowerCase()} win`)) {
    return "match-status primary-team-status";
  }
  if (s.includes(`${secondaryTeamName.toLowerCase()} win`)) {
    return "match-status secondary-team-status";
  }

  // 5) Halved / Tied
  if (s.includes("halved") || s.startsWith("tied")) {
    return "match-status halved-status";
  }

  // 6) Fallback — still give it the base
  return "match-status";
}



function getStrokeMap(golfer) {
  const strokes = new Array(18).fill(0);
  if (!holeInfo || holeInfo.length !== 18) return strokes;

  const sortedHoles = [...holeInfo].sort((a, b) => a.handicap_index - b.handicap_index);
  const fullStrokes = Math.floor(golfer.handicap / 18);
  const extraStrokes = golfer.handicap % 18;

  // Apply full strokes to all holes
  for (let i = 0; i < 18; i++) {
    strokes[sortedHoles[i].hole_number - 1] = fullStrokes;
  }

  // Apply remaining strokes to hardest holes
  for (let i = 0; i < extraStrokes; i++) {
    strokes[sortedHoles[i].hole_number - 1] += 1;
  }

  return strokes;
}



//stroke maps for golfers
function buildStrokeMapForGolfer(golferHandicap, holeData) {

  const strokeMap = {};


  for (let hole of holeData) {
    const index = hole.handicap_index;
    const holeNum = hole.hole_number;

    let strokes = 0;
    if (golferHandicap >= index) strokes = 1;
    if (golferHandicap > 18 && golferHandicap - 18 >= index) strokes = 2;

    strokeMap[holeNum] = strokes;
  }

  return strokeMap;
}


// Add these helpers somewhere in your file

/**
 * Creates a standard container for a widget on the page.
 * @param {string} title The title to display in an h3 tag.
 * @param {string} className A CSS class for the main container div.
 * @returns {{container: HTMLElement, body: HTMLElement}} The main container and the body where content should be added.
 */
function createWidgetContainer(title, className) {
    const container = document.createElement('div');
    container.className = className;
    container.innerHTML = `<h3>${title}</h3>`;
    
    const body = document.createElement('div');
    container.appendChild(body);
    
    return { container, body };
}

/**
 * Renders an error message for a failed widget.
 * @param {HTMLElement} parentContainer The main page container.
 * @param {string} widgetName The name of the widget that failed.
 */
function renderErrorWidget(parentContainer, widgetName) {
    const { container, body } = createWidgetContainer(`${widgetName} - Error`, 'error-widget');
    body.textContent = 'Could not load this section.';
    parentContainer.appendChild(container);
}

// Renders the main team scoreboard
function renderScoreboard(parentContainer, scoreboard) {

    const totalScore = document.createElement("div");
    totalScore.className = "scoreboard";
    totalScore.innerHTML = `
        <div id="teamA"><div class="team-name"></div><div class="team-score"></div></div>
        <div id="teamB"><div class="team-name"></div><div class="team-score"></div></div>
    `;
    // Find the two teams from the scoreboard data
    let teamA = scoreboard.find(t => t.team_name === primaryTeamName);
    let teamB = scoreboard.find(t => t.team_name === secondaryTeamName);

    // Fallback: if not found, just use the first two teams
    if (!teamA) teamA = scoreboard[0];
    if (!teamB) teamB = scoreboard[1];

    // Update team A
    const teamADiv = totalScore.querySelector("#teamA"); // <-- FIXED
    if (teamADiv && teamA) {
        const nameDiv = teamADiv.querySelector(".team-name");
        const scoreDiv = teamADiv.querySelector(".team-score");
        nameDiv.textContent = teamA.team_name;
        teamADiv.style.backgroundColor = teamA.color_hex || primaryTeamColor || "#eee";
        nameDiv.style.color = pickContrastColorFromHex(teamA.color_hex || primaryTeamColor || "#eee");
        scoreDiv.textContent = teamA.total_points || 0;
        scoreDiv.style.color = pickContrastColorFromHex(teamA.color_hex || primaryTeamColor || "#eee");
    }

    // Update team B
    const teamBDiv = totalScore.querySelector("#teamB"); // <-- FIXED
    if (teamBDiv && teamB) {
        const nameDiv = teamBDiv.querySelector(".team-name");
        const scoreDiv = teamBDiv.querySelector(".team-score");
        nameDiv.textContent = teamB.team_name;
        teamBDiv.style.backgroundColor = teamB.color_hex || secondaryTeamColor || "#eee";
        nameDiv.style.color = pickContrastColorFromHex(teamB.color_hex || secondaryTeamColor || "#eee");
        scoreDiv.textContent = teamB.total_points || 0;
        scoreDiv.style.color = pickContrastColorFromHex(teamB.color_hex || secondaryTeamColor || "#eee"); 
    }

    // Remove any existing golfer lists
    const oldLists = parentContainer.querySelectorAll('.team-golfer-list');
    oldLists.forEach(el => el.remove());

      // Team A golfer table (under teamA)
      if (teamA && Array.isArray(teamA.golfers)) {
        const tableA = document.createElement("table");
        tableA.className = "team-golfer-table";
        tableA.style.margin = "0";
        tableA.style.width = "100%";
        tableA.style.background = teamA.color_hex || primaryTeamColor || "#eee";
        tableA.innerHTML = teamA.golfers.map(g => 
          `<tr>
            <td class="golfer-name-cell" style="color:${pickContrastColorFromHex(teamA.color_hex || primaryTeamColor || "#eee")}; cursor:pointer;" data-golfer-id="${g.golfer_id}">
              ${g.first_name}
            </td>
          </tr>`
        ).join("");
        const teamADiv = totalScore.querySelector("#teamA");
        if (teamADiv) teamADiv.appendChild(tableA);


      }

      if (teamB && Array.isArray(teamB.golfers)) {
        const tableB = document.createElement("table");
        tableB.className = "team-golfer-table";
        tableB.style.margin = "0";
        tableB.style.width = "100%";
        tableB.style.background = teamB.color_hex || secondaryTeamColor || "#eee";
        tableB.innerHTML = teamB.golfers.map(g => 
          `<tr>
            <td class="golfer-name-cell" style="color:${pickContrastColorFromHex(teamB.color_hex || secondaryTeamColor || "#eee")}; cursor:pointer;" data-golfer-id="${g.golfer_id}">
              ${g.first_name}
            </td>
          </tr>`
        ).join("");
        const teamBDiv = totalScore.querySelector("#teamB");
        if (teamBDiv) teamBDiv.appendChild(tableB);


      }
    parentContainer.appendChild(totalScore);
}

// Renders the Gross Leaderboard
function renderGrossLeaderboard(parentContainer, golfers) {
    if (!Array.isArray(golfers) || golfers.length === 0) return;
    const { container, body } = createWidgetContainer('Individual Tournament Leaderboard - Gross', 'gross-leaderboard');
    if (!Array.isArray(golfers) || golfers.length === 0) return;

      const leaderboardDiv = document.createElement("div");
      leaderboardDiv.className = "gross-leaderboard";
      const table = document.createElement("table");
      table.classList.add("leaderboard-table");

      // Sort golfers by score to par
      golfers.sort((a, b) => (a.strokes - a.par) - (b.strokes - b.par));

      const header = `<tr><th>Rank</th><th>Name</th><th>Team</th><th>To Par</th><th>Thru</th></tr>`;
      table.innerHTML = header;

      golfers.forEach((g, i) => {
        const toPar = g.strokes - g.par;
        const toParStr = toPar === 0 ? "E" : (toPar > 0 ? `+${toPar}` : `${toPar}`);
        let bgColor = g.team_color || "";
        let txtColor = pickContrastColorFromHex(bgColor);
        let thruNum = g.holes_played;

        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${i + 1}</td>
          <td>${g.name}</td>
          <td style="
            ${bgColor  ? `background-color: ${bgColor};` : ""}
            ${txtColor ? `color:            ${txtColor};` : ""}
          ">
            ${g.team_name}
          </td>
          <td>${toParStr}</td>
          <td>${thruNum}</td>
        `;
        table.appendChild(row);
      });

      leaderboardDiv.appendChild(table);
      container.appendChild(leaderboardDiv);
    parentContainer.appendChild(container);
}

// Renders the Net Leaderboard
function renderNetLeaderboard(parentContainer, players) {
    if (!Array.isArray(players) || players.length === 0) return;
    const { container, body } = createWidgetContainer('Individual Tournament Leaderboard - Net', 'net-leaderboard');
          if (!Array.isArray(players) || players.length === 0) return;

      const netDiv = document.createElement("div");
      netDiv.className = "net-leaderboard";
      const table = document.createElement("table");
      table.classList.add("leaderboard-table");
      table.innerHTML = `<tr>
        <th>Rank</th><th>Name</th><th>Team</th>
        <th>To Par</th><th>Thru</th>
      </tr>`;

      // compute To Par and sort by net-to-par
      players.forEach(p => {
        p.toPar = p.net_strokes - p.par;
      });
      players.sort((a,b) => a.toPar - b.toPar);

      players.forEach((p,i) => {
        const toPar = p.toPar === 0 ? "E"
                      : (p.toPar > 0 ? `+${p.toPar}` : `${p.toPar}`);
        let bgColor = p.team_color || ""; // Use dynamic team color
        let txtColor = pickContrastColorFromHex(bgColor);


        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${i + 1}</td>
          <td>${p.name}</td>
          <td style="
            ${bgColor  ? `background-color: ${bgColor};` : ""}
            ${txtColor ? `color:            ${txtColor};` : ""}
          ">
            ${p.team_name}
          </td>
          <td>${toPar}</td>
          <td>${p.holes_played}</td>
        `;
        table.appendChild(row);
      });

      netDiv.appendChild(table);
      container.appendChild(netDiv);
    parentContainer.appendChild(container);
}

// Renders the Rounds and Matchups table
function renderRoundsAndMatchups(parentContainer, rounds) {
  if (!Array.isArray(rounds) || rounds.length === 0) return;
  const { container, body } = createWidgetContainer('Matchups and Tee Times', 'tournament-rounds-table-container');
  if (!Array.isArray(rounds) || rounds.length === 0) return;

  const roundsDiv = document.createElement("div");
  roundsDiv.className = "tournament-rounds-table-container";

  rounds.forEach(round => {
    // Heading for round name and date
    const heading = document.createElement("h4");
    const [year, month, day] = round.round_date.split('-');
    const dateObj = new Date(year, month - 1, day);
    const monthDay = dateObj.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
    heading.innerHTML = `${round.round_name} <br>${monthDay}`;
    heading.style.textAlign = "center";
    roundsDiv.appendChild(heading);

    const table = document.createElement("table");
    table.className = "leaderboard-table matchup-table";


    if (round.tee_times.length === 0) {
      // No tee times for this round
      const row = document.createElement("tr");
      row.innerHTML = `<td colspan="3" style="text-align:center;">No tee times</td>`;
      table.appendChild(row);
    } else {
      round.tee_times.forEach(teeTime => {
        if (teeTime.matches.length === 0) {
          const row = document.createElement("tr");
          const formattedTime = formatTeeTime(teeTime.time);
          row.innerHTML = `<td>${formattedTime}</td><td colspan="2" style="text-align:center;">Matchups not yet assigned</td>`;
          table.appendChild(row);
        } else {
          // Group matches by tee time (if multiple teeTimes have the same time)
          // If your data already groups matches under teeTime, you can use this directly:
          teeTime.matches.forEach((match, idx) => {
            const team1Golfers = match.golfers.filter(g => g.team_name === primaryTeamName);
            const team2Golfers = match.golfers.filter(g => g.team_name === secondaryTeamName);

            const team1Color = team1Golfers[0]?.team_color || primaryTeamColor || "#eee";
            const team2Color = team2Golfers[0]?.team_color || secondaryTeamColor || "#eee";
            const team1TextColor = pickContrastColorFromHex(team1Color);
            const team2TextColor = pickContrastColorFromHex(team2Color);

            const team1Names = team1Golfers.map(g => g.name).join(' & ');
            const team2Names = team2Golfers.map(g => g.name).join(' & ');

            // --- NEW: Calculate match result cell ---
            let resultCell = `<td></td>`; // default blank

            if (Array.isArray(match.results) && match.results.length === 2) {
              const t1 = match.results.find(r => r.team_id == primaryTeamId);
              const t2 = match.results.find(r => r.team_id == secondaryTeamId);

              if (t1 && t2) {
                if (t1.points === 1 && t2.points === 0) {
                  resultCell = `<td style="background:${team1Color};color:${team1TextColor};text-align:center;">1</td>`;
                } else if (t2.points === 1 && t1.points === 0) {
                  resultCell = `<td style="background:${team2Color};color:${team2TextColor};text-align:center;">1</td>`;
                } else if (t1.points === 0.5 && t2.points === 0.5) {
                  resultCell = `<td style="background:#000;color:#fff;text-align:center;">1/2</td>`;
                }
              }
            }

            const row = document.createElement("tr");
            const formattedTime = formatTeeTime(teeTime.time);
            if (idx === 0) {
              row.innerHTML = `
                <td rowspan="${teeTime.matches.length}">${formattedTime}</td>
                <td style="background:${team1Color};color:${team1TextColor};">${team1Names}</td>
                <td style="background:${team2Color};color:${team2TextColor};">${team2Names}</td>
                ${resultCell}
              `;
            } else {
              row.innerHTML = `
                <td style="background:${team1Color};color:${team1TextColor};">${team1Names}</td>
                <td style="background:${team2Color};color:${team2TextColor};">${team2Names}</td>
                ${resultCell}
              `;
            }
            table.appendChild(row);
          });
        }
      });
    }

    roundsDiv.appendChild(table);
  });

  container.appendChild(roundsDiv);
  parentContainer.appendChild(container);
}

function formatTeeTime(timeStr) {
  // timeStr is "HH:MM"
  let [hour, minute] = timeStr.split(':').map(Number);
  hour = hour % 12 || 12; // Convert 0/12/13+ to 12-hour format
  return `${hour}:${minute.toString().padStart(2, '0')}`;
}

// Renders the Playing Handicap table
function renderHandicapTable(parentContainer, courses, golfers) {
    if (!Array.isArray(courses) || !Array.isArray(golfers) || courses.length === 0 || golfers.length === 0) return;
    const { container, body } = createWidgetContainer('Playing Handicaps by Course', 'handicap-table-container');
            if (!Array.isArray(courses) || !Array.isArray(golfers) || courses.length === 0 || golfers.length === 0) return;

        // Table setup
        const tableDiv = document.createElement("div");
        tableDiv.className = "handicap-table-container";

        let html = `<table class="handicap-table"><tr><th>Golfer</th><th>Hcp</th>`;
        courses.forEach(course => {
          if (course.pdf_url) {
            html += `<th>${course.course_name} (${course.tee_name})</th>`;
          } else {
            html += `<th>${course.course_name} (${course.tee_name})</th>`;
          }
        });
        html += `</tr>`;

        golfers.forEach(golfer => {
          html += `<tr><td>${golfer.first_name}</td><td>${parseFloat(golfer.handicap).toFixed(1)}</td>`;
          courses.forEach(course => {
            // Calculate playing handicap for this golfer/course
            const slope = parseFloat(course.slope);
            const rating = parseFloat(course.rating);
            const pct = parseFloat(course.handicap_pct || tournamentHandicapPct || 80); // fallback to 80 if not present
            const hcp = parseFloat(golfer.handicap);
            const playingHandicap = ((hcp * (slope / 113)) + (rating - 72)) * (pct / 100);
            html += `<td>${playingHandicap ? playingHandicap.toFixed(1) : '-'}</td>`;
          });
          html += `</tr>`;
        });

        html += `</table>`;
        tableDiv.innerHTML = html;
        container.appendChild(tableDiv);
        const explanation = document.createElement("div");
        explanation.className = "handicap-explanation";
        explanation.innerHTML = `
          <strong>How Playing Handicap is Calculated:</strong><br>
          Each golfer's <b>course handicap</b> is calculated according to USGA guidelines using the formula:<br>
          <code>(Handicap &times; (Slope / 113) + (Rating - 72))</code><br>
          For this tournament, we chose to use 80% of the course handicap to calculate the <b>playing handicap</b> to minimize the effect of handicaps overall.<br>
        `;
        container.appendChild(explanation);
    parentContainer.appendChild(container);


    // ... (Your logic for the explanation div also goes here) ...
}

function renderCoursePDFLinks(parentContainer, courses) {

  if (!Array.isArray(courses) || courses.length === 0) return;
  const { container, body } = createWidgetContainer('Course Scorecards', 'scorecard-table-container');
  if (!Array.isArray(courses) || courses.length === 0) return;

  // Filter to unique courses by course_id
  const uniqueCourses = [];
  const seen = new Set();
  courses.forEach(course => {
    if (!seen.has(course.course_id)) {
      uniqueCourses.push(course);
      seen.add(course.course_id);
    }
  });

  const pdfDiv = document.createElement("div");
  pdfDiv.className = "scorecard-table-container";

  let html = `<table class="scorecard-table"><tr><th>Course</th></tr>`;
  uniqueCourses.forEach(course => {
    if (course.pdf_url) {
      html += `<tr><td><a href="${course.pdf_url}" target="_blank">${course.course_name}</a></td></tr>`;
    } else {
      html += `<tr><td>${course.course_name}</td></tr>`;
    }
  });
  html += `</table>`;
  pdfDiv.innerHTML = html;
  container.appendChild(pdfDiv);
  parentContainer.appendChild(container);
}


async function loadTournamentPage(container) {
    // 1. Clear the container and show a loading message
    container.innerHTML = '<h2>Loading Tournament Data...</h2>';
    
    const tournamentId = sessionStorage.getItem('selected_tournament_id');
    if (!tournamentId) {
        container.innerHTML = '<h2>Error: No tournament selected.</h2>';
        return;
    }

    try {
        // 2. Start ALL data fetches at the same time.
        const promises = [
            fetch('get_tournament_scoreboard.php', { credentials: 'include' }).then(res => res.json()),
            fetch('get_gross_leaderboard_all.php', { credentials: 'include' }).then(res => res.json()),
            fetch('get_net_leaderboard_all.php', { credentials: 'include' }).then(res => res.json()),
            fetch(`get_tournament_rounds.php?tournament_id=${tournamentId}`, { credentials: 'include' }).then(res => res.json()),
            // The handicap table needs two fetches, so we wrap them in their own Promise.all
            Promise.all([
                fetch(`get_tournament_courses.php?tournament_id=${tournamentId}`, { credentials: 'include' }).then(res => res.json()),
                fetch(`get_tournament_golfers.php?tournament_id=${tournamentId}`, { credentials: 'include' }).then(res => res.json())
            ])
        ];

        // 3. Wait for all promises to finish, regardless of success or failure.
        const results = await Promise.allSettled(promises);

        // 4. Now that all data is fetched, clear the loading message and render the page.
        container.innerHTML = '';

        // 5. Destructure results for clarity and process each one.
        const [
            scoreboardResult,
            grossLeaderboardResult,
            netLeaderboardResult,
            roundsResult,
            handicapResult
        ] = results;

        // Render Scoreboard
        if (scoreboardResult.status === 'fulfilled') {
            renderScoreboard(container, scoreboardResult.value);
        } else {
            console.error("Scoreboard Error:", scoreboardResult.reason);
            renderErrorWidget(container, 'Team Scoreboard');
        }

                // Render Rounds & Matchups
        if (roundsResult.status === 'fulfilled') {
            renderRoundsAndMatchups(container, roundsResult.value);
        } else {
            console.error("Rounds/Matchups Error:", roundsResult.reason);
            renderErrorWidget(container, 'Rounds & Matchups');
        }

        // Render Gross Leaderboard
        if (grossLeaderboardResult.status === 'fulfilled') {
            renderGrossLeaderboard(container, grossLeaderboardResult.value);
        } else {
            console.error("Gross Leaderboard Error:", grossLeaderboardResult.reason);
            renderErrorWidget(container, 'Gross Leaderboard');
        }

        // Render Net Leaderboard
        if (netLeaderboardResult.status === 'fulfilled') {
            renderNetLeaderboard(container, netLeaderboardResult.value);
        } else {
            console.error("Net Leaderboard Error:", netLeaderboardResult.reason);
            renderErrorWidget(container, 'Net Leaderboard');
        }
        


        // Render Handicap Table
        if (handicapResult.status === 'fulfilled') {
            const [courses, golfers] = handicapResult.value; // Destructure the resolved array
            renderHandicapTable(container, courses, golfers);
            renderCoursePDFLinks(container, courses); // Assuming this function exists to render course PDFs
        } else {
            console.error("Handicap Table Error:", handicapResult.reason);
            renderErrorWidget(container, 'Handicap Table');
        }

    } catch (error) {
        // This would catch a fundamental error, e.g., if Promise.allSettled itself failed.
        container.innerHTML = '<h2>A critical error occurred while loading the page.</h2>';
        console.error("Fatal error in loadTournamentPage:", error);
    }
}




function loadMatchScorecard(match_id, container_id = "today-summary") {
  fetch(`get_match_by_id.php?match_id=${match_id}`, { credentials: 'include' })
    .then(res => res.json())
    .then(data => {
      
      const matchGolfers = data.match;
      holeInfo = data.holes;
      const container = document.getElementById(container_id);
      container.innerHTML = ""; // Replace match list



        const golferMap = new Map();
        
        matchGolfers.forEach(row => {
          if (!golferMap.has(row.golfer_id)) {
            golferMap.set(row.golfer_id, {
              id: row.golfer_id,
              name: row.first_name,
              team: row.team_name,
              team_color: row.team_color,
              handicap: calculatePlayingHandicap(parseFloat(row.handicap))
            });
          }
        });
        

        
        const golfers = Array.from(golferMap.values());
        



      strokeMaps = {};
      golfers.forEach(g => {
        strokeMaps[g.id] = buildStrokeMapForGolfer(g.handicap, holeInfo);
      });

      

      const table = document.createElement("table");
      table.classList.add("score-table");

      // Header
      const header = document.createElement("tr");
      header.innerHTML = `<th></th><th>#</th><th>P</th><th>HI</th>` + golfers.map(golfer => {
        let bgColor = golfer.team_color || ""; // Use dynamic team color
        let txtColor = pickContrastColorFromHex(bgColor);
        return `<th style="background-color: ${bgColor}; color: ${txtColor};">${golfer.name} (${parseFloat(golfer.handicap).toFixed(1)})</th>`;
      }).join("");
      table.appendChild(header);

      // Score rows
      for (let i = 1; i <= 18; i++) {
        const row = document.createElement("tr");
        const par = holeInfo.find(h => h.hole_number === i)?.par || "-";
        const index = holeInfo.find(h => h.hole_number === i)?.handicap_index || "-";
        row.innerHTML = `<td></td><td>${i}</td><td>${par}</td><td>${index}</td>` + golfers.map(golfer => {
          const stroke = strokeMaps[golfer.id]?.[i] || 0;
            let dots = '';
            if (stroke === 1) {
              dots = '<span class="corner-dot"></span>';
            } else if (stroke === 2) {
              dots = '<span class="corner-dot"></span><span class="corner-dot second-dot"></span>';
            }
            return `<td class="readonly-score-cell" data-hole="${i}" data-golfer="${golfer.id}" style="position:relative;">${dots}</td>`;

        }).join("");
        table.appendChild(row);
      }

      // Totals row
      const totalsRow = document.createElement("tr");
      totalsRow.innerHTML = `<td></td><td></td><td></td><td></td>` + golfers.map(g => {
        return `<td class="totals-cell" data-golfer="${g.id}">–</td>`;
      }).join("");
      table.appendChild(totalsRow);

      container.appendChild(table);
    
      // Fetch scores
      fetch(`get_scores.php?match_id=${match_id}`, { credentials: 'include' })
        .then(res => res.json())
        .then(scores => {
          scores.forEach(score => {
            const cell = document.querySelector(`td[data-hole="${score.hole_number}"][data-golfer="${score.golfer_id}"]`);
            if (cell) {
              // Remove previous classes
              cell.classList.remove("score-birdie", "score-bogey", "score-par");
              const par = holeInfo.find(h => h.hole_number == score.hole_number)?.par;
              const strokes = parseInt(score.strokes);
              if (!isNaN(par) && !isNaN(strokes)) {
                if (strokes < par) cell.classList.add("score-birdie");
                else if (strokes > par) cell.classList.add("score-bogey");
                else cell.classList.add("score-par");
              }
              // Set the cell content (with or without the dot)
                const stroke = strokeMaps[score.golfer_id]?.[score.hole_number] || 0;
                let dots = '';
                if (stroke === 1) {
                  dots = '<span class="corner-dot"></span>';
                } else if (stroke === 2) {
                  dots = '<span class="corner-dot"></span><span class="corner-dot second-dot"></span>';
                }
                cell.innerHTML = `${dots}${strokes}`;
            }
          });

          updateTotalScoresReadOnly(golfers, holeInfo);
          calculateBestBallStatusReadOnly(golfers, strokeMaps);
        });
    });
}




function updateTotalScoresReadOnly(golfers, holeInfo) {
  const totals = {};     // golfer_id => total strokes
  const parTotals = {};  // golfer_id => total par for holes they've played

  // Initialize
  golfers.forEach(g => {
    totals[g.id] = 0;
    parTotals[g.id] = 0;
  });

  // Loop through all score cells
  document.querySelectorAll("td.readonly-score-cell").forEach(cell => {
    const strokesText = cell.textContent.replace(/[^0-9]/g, '');
    const strokes = parseInt(strokesText);
    const golferId = cell.dataset.golfer;
    const hole = parseInt(cell.dataset.hole);

    if (golferId && hole && !isNaN(strokes)) {
      totals[golferId] += strokes;

      const par = holeInfo.find(h => h.hole_number == hole)?.par;
      parTotals[golferId] += parseInt(par) || 0;
    }
  });

  // Update totals row
  Object.entries(totals).forEach(([golferId, total]) => {
    const td = document.querySelector(`.totals-cell[data-golfer="${golferId}"]`);
    const currentPar = parTotals[golferId];
    const toPar = total - currentPar;
    const toParText = isNaN(toPar) ? "" : (toPar === 0 ? "E" : (toPar > 0 ? `+${toPar}` : `${toPar}`));
    if (td) {
      td.textContent = `${total} (${toParText})`;
    }
  });
}


function calculateBestBallStatusReadOnly(golfers, strokeMaps) {
  const scoreMap = {}; // { holeNumber: { primaryTeamName: [net], secondaryTeamName: [net] } }
  
  // Step 1: Loop through all read-only score cells
  document.querySelectorAll("td.readonly-score-cell").forEach(cell => {
    const hole = parseInt(cell.dataset.hole);
    const golferId = parseInt(cell.dataset.golfer);
    const golfer = golfers.find(g => g.id === golferId);
    if (!golfer) return;

    const strokesText = cell.textContent.replace(/[^0-9]/g, '');
    const score = parseInt(strokesText);
    if (!score || isNaN(score)) return;

    // Initialize scoreMap for the hole if it doesn't exist
    if (!scoreMap[hole]) {
      scoreMap[hole] = { [primaryTeamName]: [], [secondaryTeamName]: [] };
    }

    // Initialize the team array if it doesn't exist
    if (!scoreMap[hole][golfer.team]) {
      scoreMap[hole][golfer.team] = [];
    }

    // ✅ Subtract strokes for this golfer on this hole
    const strokes = strokeMaps[golferId]?.[hole] || 0;
    
    const netScore = score - strokes;

    scoreMap[hole][golfer.team].push(netScore);
  });

  

  // Step 2: Walk through each hole and determine the score differential
  let differential = 0;

  for (let hole = 1; hole <= 18; hole++) {
    const holeCell = document.querySelector(`.score-table tr:nth-child(${hole + 1}) td:first-child`);
    if (!holeCell || !scoreMap[hole]) continue;

    const primaryBest = Math.min(...scoreMap[hole][primaryTeamName]);
    const secondaryBest = Math.min(...scoreMap[hole][secondaryTeamName]);

    if (!isFinite(primaryBest) || !isFinite(secondaryBest)) continue; // not all scores in

    if (primaryBest < secondaryBest) {
      differential += 1;
    } else if (secondaryBest < primaryBest) {
      differential -= 1;
    }

    // Step 3: Update UI
    holeCell.textContent = Math.abs(differential); // display the score margin

    if (differential === 0) {
      holeCell.style.backgroundColor = "#000"; // tie = black
      holeCell.style.color = "#fff";
    } else if (differential > 0) {
      holeCell.style.backgroundColor = primaryTeamColor; // Primary team lead
      holeCell.style.color = pickContrastColorFromHex(primaryTeamColor);
    } else {
      holeCell.style.backgroundColor = secondaryTeamColor; // Secondary team lead
      holeCell.style.color = pickContrastColorFromHex(secondaryTeamColor);
    }
  }
}





//refresh scores function
function refreshScores() {
  fetch(`get_scores.php?match_id=${currentMatchId}`, {
    credentials: 'include'
  })
  .then(res => res.json())
  .then(scores => {
    scores.forEach(score => {
      const selector = `select[data-hole="${score.hole_number}"][data-golfer="${score.golfer_id}"]`;
      const selectEl = document.querySelector(selector);
      if (selectEl && selectEl.value !== String(score.strokes)) {
        selectEl.value = score.strokes;
        selectEl.classList.add("score-updated");
        setTimeout(() => selectEl.classList.remove("score-updated"), 500);
      }
    });
    calculateBestBallStatus();
    updateTotalScores();
    
  })
  .catch(err => console.error("Error refreshing scores:", err));
}


//function to calculate best ball status and update UI
function calculateBestBallStatus() {
  const scoreMap = {}; // { holeNumber: { primaryTeamName: [scores], secondaryTeamName: [scores] } }

  // Step 1: Organize NET scores by team and hole
  document.querySelectorAll("select[data-hole][data-golfer]").forEach(select => {
    const hole = parseInt(select.dataset.hole);
    const golferId = parseInt(select.dataset.golfer);
    const score = parseInt(select.value);
    if (!score || isNaN(score)) return;

    const golfer = golfers.find(g => g.id === golferId);
    if (!golfer) return;

    // Initialize scoreMap for the hole if it doesn't exist
    if (!scoreMap[hole]) {
      scoreMap[hole] = { [primaryTeamName]: [], [secondaryTeamName]: [] };
    }

    // Initialize the team array if it doesn't exist
    if (!scoreMap[hole][golfer.team]) {
      scoreMap[hole][golfer.team] = [];
    }

    // ✅ Subtract strokes for this golfer on this hole
    const strokes = strokeMaps[golferId]?.[hole] || 0;
    const netScore = score - strokes;

    scoreMap[hole][golfer.team].push(netScore);
  });

  

  // Step 2: Walk through each hole and determine the score differential
  let differential = 0;

  for (let hole = 1; hole <= 18; hole++) {
    const holeCell = document.querySelector(`td:first-child:nth-child(1):nth-of-type(${hole})`) ||
                     document.querySelector(`.score-table tr:nth-child(${hole + 1}) td:first-child`);
    if (!holeCell || !scoreMap[hole]) continue;

    const primaryBest = Math.min(...scoreMap[hole][primaryTeamName]);
    const secondaryBest = Math.min(...scoreMap[hole][secondaryTeamName]);

    if (!isFinite(primaryBest) || !isFinite(secondaryBest)) continue; // not all scores in

    if (primaryBest < secondaryBest) {
      differential += 1;
    } else if (secondaryBest < primaryBest) {
      differential -= 1;
    }

    // Step 3: Update UI
    holeCell.textContent = Math.abs(differential); // show lead magnitude
    if (differential === 0) {
      holeCell.style.backgroundColor = "#000"; // tie = black
      holeCell.style.color = "#fff";
    } else if (differential > 0) {
      holeCell.style.backgroundColor = primaryTeamColor; // Primary team lead
      holeCell.style.color = pickContrastColorFromHex(primaryTeamColor);
    } else {
      holeCell.style.backgroundColor = secondaryTeamColor; // Secondary team lead
      holeCell.style.color = pickContrastColorFromHex(secondaryTeamColor);
    }
  }
}


function calculatePlayingHandicap(handicap) {
  if (!courses || !courses.slope || !courses.rating || !tournamentHandicapPct) return 0;
  const slope = parseFloat(courses.slope);
  const rating = parseFloat(courses.rating);
  const pct = parseFloat(tournamentHandicapPct);

  const courseHandicap = (handicap * (slope / 113)) + (rating - 72);
  const playingHandicap = courseHandicap * pct / 100;
  return Math.round(playingHandicap * 10) / 10;
}



/**
 * Convert a hex color string to an [R, G, B] array.
 * Supports "#abc", "abc", "#aabbcc", or "aabbcc".
 */
function hexToRgb(hex) {
  hex = hex.replace(/^#/, '');
  if (hex.length === 3) {
    // e.g. "fb0" → "ffbb00"
    hex = hex.split('').map(ch => ch + ch).join('');
  }
  const intVal = parseInt(hex, 16);
  return [
    (intVal >> 16) & 0xFF,  // red
    (intVal >>  8) & 0xFF,  // green
     intVal        & 0xFF   // blue
  ];
}

/**
 * Given an [R, G, B] array, return the brightness (0–255).
 * Uses the same weighted formula:
 *    (R×299 + G×587 + B×114)/1000
 */
function getBrightness([r, g, b]) {
  return (r * 299 + g * 587 + b * 114) / 1000;
}

/**
 * Pick black or white based on brightness threshold.
 * If brightness > threshold ⇒ light background ⇒ return "#000"
 * else ⇒ dark background ⇒ return "#fff"
 */
function pickContrastColorFromHex(hex, threshold = 155) {
  const rgb = hexToRgb(hex);
  return getBrightness(rgb) > threshold ? '#000' : '#fff';
}


// Authentication handling
document.addEventListener('DOMContentLoaded', () => {
  const authForm = document.getElementById('auth-form');
  const appContent = document.getElementById('app-content');
  const authMessage = document.getElementById('auth-message');
  

    authForm.addEventListener('submit', (event) => {
      event.preventDefault();
    
      const golferId = document.getElementById('chooseUser').value;
      const roundId = document.getElementById('selectRound').value;
      const roundSelect = document.getElementById('selectRound');

      const tournamentId = 1;
      sessionStorage.setItem('selected_tournament_id', tournamentId);


      if (!golferId || !roundId || !tournamentId) {
        authMessage.textContent = 'Please select a user, tournament, and round.';
        return;
      }
    
      const formData = new FormData();
      formData.append('golfer_id', golferId);
      formData.append('round_id', roundId);
      formData.append('tournament_id', tournamentId);

    
      fetch('authenticate.php', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          startSessionHeartbeat();
          appContent.style.display = 'block';
          document.getElementById('auth-container').style.display = 'none';
          tournamentName = data.tournament_name;
          roundName = data.round_name;
          teamId = data.team_id;
          tournamentHandicapPct = data.tournament_handicap_pct;
          
          const topBarInfo = tournamentName + '<br>' + roundName;
          document.getElementById('tournament-name').innerHTML = topBarInfo;
          fetch(`get_match_by_round.php`, { credentials: 'include' })
            .then(res => res.json())
            .then(data => {
              holeInfo = data.holes;
              if (Array.isArray(data.match) && data.match.length > 0) {
                const first = data.match[0];
                courses = {
                  course_name: first.course_name,
                  par_total: first.par_total,
                  tees: first.tees,
                  slope: first.slope,
                  rating: first.rating
                };
              }
            });
          fetch(`/api/tournament_teams.php?tournament_id=${tournamentId}&_=${Date.now()}`, {
              method: 'GET',
              credentials: 'include'
            })
            .then(res => res.json())
            .then(data => {
              if (data.error) {
                console.error("Error loading teams:", data.error);
                return;
              }
              


              data.forEach(team => {
                if (team.team_id === parseInt(teamId)) {
                  primaryTeamName = team.name;
                  primaryTeamColor = team.color_hex;
                  primaryTeamId = team.team_id;
                } else {
                  secondaryTeamName = team.name;
                  secondaryTeamColor = team.color_hex;
                  secondaryTeamId = team.team_id;
                }
              });

              assignCSSColors(primaryTeamColor, secondaryTeamColor);
              sessionStorage.setItem('primary_team_name', primaryTeamName);
              sessionStorage.setItem('primary_team_color', primaryTeamColor);
              sessionStorage.setItem('secondary_team_name', secondaryTeamName);
              sessionStorage.setItem('secondary_team_color', secondaryTeamColor);
              sessionStorage.setItem('primary_team_id', primaryTeamId);
              sessionStorage.setItem('secondary_team_id', secondaryTeamId);

              showUserBar(primaryTeamName, primaryTeamColor);

              // Remove active class from all tabs
              document.querySelectorAll('.tabs button').forEach(btn => btn.classList.remove('active'));

              // Find the my-match button
              const myMatchBtn = document.querySelector('button[data-page="my-match"]');
              if (myMatchBtn) {
                myMatchBtn.classList.add('active');
              }

              // Load the my-match page content
              loadPage('my-match');
            })

        } else {
          authMessage.textContent = 'Invalid PIN or missing info.';
        }
        document.addEventListener("DOMContentLoaded", function() {
          // Remove active class from all tabs
          document.querySelectorAll('.tabs button').forEach(btn => btn.classList.remove('active'));

          // Find the my-match button
          const myMatchBtn = document.querySelector('button[data-page="my-match"]');
          if (myMatchBtn) {
            myMatchBtn.classList.add('active');
          }

          // Load the my-match page content
          loadPage('my-match');
        });
      });

    });

});

function assignCSSColors(primaryColor, secondaryColor) {
  document.documentElement.style.setProperty('--primary-team-color', primaryColor);
  document.documentElement.style.setProperty('--secondary-team-color', secondaryColor);

  const primaryContrastColor = pickContrastColorFromHex(primaryTeamColor);
  const secondaryContrastColor = pickContrastColorFromHex(secondaryTeamColor);

  document.documentElement.style.setProperty('--secondary-text-color', secondaryContrastColor);
  document.documentElement.style.setProperty('--primary-text-color', primaryContrastColor);
  
  return;
}



//logout button
document.getElementById('logout-button').addEventListener('click', () => {
  stopSessionHeartbeat();
  fetch('logout.php', {
    method: 'POST',
    credentials: 'include'
  }).then(() => {
    sessionStorage.clear();
    location.reload();
  });
});




