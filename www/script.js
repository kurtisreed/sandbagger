// Configure API base URL for mobile vs web
let API_BASE_URL = '';

function initializeApiUrl() {
  const isCapacitorApp = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
  API_BASE_URL = isCapacitorApp ? 'http://10.0.2.2' : '';
  console.log('API_BASE_URL set to:', API_BASE_URL, 'isCapacitorApp:', isCapacitorApp);
}

// Initialize immediately and also when DOM is ready
initializeApiUrl();
document.addEventListener('DOMContentLoaded', initializeApiUrl);

if ('serviceWorker' in navigator && !API_BASE_URL) {
  // Only register service worker in web, not in native app
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

// Best Ball setup
let bestBallTeam1 = { player1: null, player2: null };
let bestBallTeam2 = { player1: null, player2: null };
let currentSelectId = null; // Track which dropdown triggered new/edit player
let newPlayerId = null; // Track newly created player ID
let allCourses = []; // Store available courses

function loadBestBallSetup(preserveSelections = false) {
  const setupContainer = document.getElementById('best-ball-setup');
  const setupContent = document.getElementById('best-ball-setup-content');

  // Save current selections if we're preserving them
  let savedSelections = {};
  if (preserveSelections) {
    const selects = ['team1-player1', 'team1-player2', 'team2-player1', 'team2-player2', 'select-course', 'select-tee'];
    selects.forEach(id => {
      const select = document.getElementById(id);
      if (select && select.value && select.value !== 'new-player') {
        savedSelections[id] = select.value;
      }
    });

    // Save handicap slider value
    const handicapSlider = document.getElementById('handicap-slider');
    if (handicapSlider) {
      savedSelections['handicap-slider'] = handicapSlider.value;
    }
  }

  setupContainer.style.display = 'block';

  // Fetch both golfers and courses in parallel
  Promise.all([
    fetch(`${API_BASE_URL}/get_golfers.php`).then(res => res.json()),
    fetch(`${API_BASE_URL}/api/courses.php`).then(res => res.json())
  ])
  .then(([golfers, courses]) => {
    allGolfers = golfers;
    allCourses = courses;

      const golferOptions = golfers.map(g => `<option value="${g.golfer_id}">${g.first_name} ${g.last_name} (${g.handicap})</option>`).join('');
      const courseOptions = courses.map(c => `<option value="${c.course_id}">${c.name}</option>`).join('');

      setupContent.innerHTML = `
        <div style="max-width: 600px; margin: 2rem auto; padding: 2rem; background: white; border-radius: 8px;">
          <h2 style="text-align: center; margin-bottom: 2rem;">Best Ball Setup</h2>

          <div style="margin-bottom: 2rem; padding: 1rem; background: #f0f0f0; border-radius: 8px;">
            <h3 style="margin-top: 0;">Team 1</h3>
            <div style="margin-bottom: 1rem;">
              <label style="display: block; margin-bottom: 0.5rem;">Player 1:</label>
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <select id="team1-player1" class="player-select" style="flex: 1; padding: 0.5rem; font-size: 1rem; border-radius: 4px; border: 1px solid #ccc;">
                  <option value="">-- Select Player --</option>
                  ${golferOptions}
                  <option value="new-player">+ New Player</option>
                </select>
                <button class="edit-player-btn" data-select="team1-player1" style="padding: 0.5rem 0.75rem; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 1rem;">✏️</button>
              </div>
            </div>
            <div>
              <label style="display: block; margin-bottom: 0.5rem;">Player 2:</label>
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <select id="team1-player2" class="player-select" style="flex: 1; padding: 0.5rem; font-size: 1rem; border-radius: 4px; border: 1px solid #ccc;">
                  <option value="">-- Select Player --</option>
                  ${golferOptions}
                  <option value="new-player">+ New Player</option>
                </select>
                <button class="edit-player-btn" data-select="team1-player2" style="padding: 0.5rem 0.75rem; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 1rem;">✏️</button>
              </div>
            </div>
          </div>

          <div style="margin-bottom: 2rem; padding: 1rem; background: #f0f0f0; border-radius: 8px;">
            <h3 style="margin-top: 0;">Team 2</h3>
            <div style="margin-bottom: 1rem;">
              <label style="display: block; margin-bottom: 0.5rem;">Player 1:</label>
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <select id="team2-player1" class="player-select" style="flex: 1; padding: 0.5rem; font-size: 1rem; border-radius: 4px; border: 1px solid #ccc;">
                  <option value="">-- Select Player --</option>
                  ${golferOptions}
                  <option value="new-player">+ New Player</option>
                </select>
                <button class="edit-player-btn" data-select="team2-player1" style="padding: 0.5rem 0.75rem; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 1rem;">✏️</button>
              </div>
            </div>
            <div>
              <label style="display: block; margin-bottom: 0.5rem;">Player 2:</label>
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <select id="team2-player2" class="player-select" style="flex: 1; padding: 0.5rem; font-size: 1rem; border-radius: 4px; border: 1px solid #ccc;">
                  <option value="">-- Select Player --</option>
                  ${golferOptions}
                  <option value="new-player">+ New Player</option>
                </select>
                <button class="edit-player-btn" data-select="team2-player2" style="padding: 0.5rem 0.75rem; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 1rem;">✏️</button>
              </div>
            </div>
          </div>

          <div style="margin-bottom: 2rem; padding: 1rem; background: #f0f0f0; border-radius: 8px;">
            <h3 style="margin-top: 0;">Course</h3>
            <div style="margin-bottom: 1rem;">
              <label style="display: block; margin-bottom: 0.5rem;">Select Course:</label>
              <select id="select-course" style="width: 100%; padding: 0.5rem; font-size: 1rem; border-radius: 4px; border: 1px solid #ccc;">
                <option value="">-- Select Course --</option>
                ${courseOptions}
              </select>
            </div>
            <div id="tee-selection" style="display: none;">
              <label style="display: block; margin-bottom: 0.5rem;">Select Tees:</label>
              <select id="select-tee" style="width: 100%; padding: 0.5rem; font-size: 1rem; border-radius: 4px; border: 1px solid #ccc;">
                <option value="">-- Select Tees --</option>
              </select>
            </div>
          </div>

          <div style="margin-bottom: 2rem; padding: 1rem; background: #f0f0f0; border-radius: 8px;">
            <h3 style="margin-top: 0;">Handicap Adjustment</h3>
            <div>
              <label style="display: block; margin-bottom: 0.5rem;">Handicap Percentage: <span id="handicap-value" style="font-weight: bold;">100%</span></label>
              <input type="range" id="handicap-slider" min="10" max="100" step="10" value="100" style="width: 100%; height: 8px; border-radius: 5px; background: #ddd; outline: none; cursor: pointer;">
            </div>
          </div>

          <div style="text-align: center;">
            <button id="start-best-ball" style="padding: 1rem 2rem; font-size: 1.2rem; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">
              Start Round
            </button>
            <button id="cancel-best-ball" style="padding: 1rem 2rem; font-size: 1rem; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer; margin-left: 1rem;">
              Cancel
            </button>
          </div>
          <div id="setup-message" style="margin-top: 1rem; text-align: center; color: red;"></div>
        </div>

        <!-- New Player Modal -->
        <div id="new-player-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1000; align-items: center; justify-content: center;">
          <div style="background: white; padding: 2rem; border-radius: 8px; max-width: 400px; width: 90%;">
            <h3 id="player-modal-title" style="margin-top: 0;">Add New Player</h3>
            <input type="hidden" id="edit-player-id" value="">
            <div style="margin-bottom: 1rem;">
              <label style="display: block; margin-bottom: 0.5rem;">First Name:</label>
              <input type="text" id="new-player-first-name" style="width: 100%; padding: 0.5rem; font-size: 1rem; border-radius: 4px; border: 1px solid #ccc; box-sizing: border-box;">
            </div>
            <div style="margin-bottom: 1rem;">
              <label style="display: block; margin-bottom: 0.5rem;">Last Name:</label>
              <input type="text" id="new-player-last-name" style="width: 100%; padding: 0.5rem; font-size: 1rem; border-radius: 4px; border: 1px solid #ccc; box-sizing: border-box;">
            </div>
            <div style="margin-bottom: 1rem;">
              <label style="display: block; margin-bottom: 0.5rem;">Handicap:</label>
              <input type="number" id="new-player-handicap" step="0.1" style="width: 100%; padding: 0.5rem; font-size: 1rem; border-radius: 4px; border: 1px solid #ccc; box-sizing: border-box;">
            </div>
            <div id="new-player-message" style="margin-bottom: 1rem; color: red; text-align: center;"></div>
            <div style="text-align: center;">
              <button id="save-new-player" style="padding: 0.7rem 1.5rem; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; margin-right: 0.5rem;">
                Save
              </button>
              <button id="cancel-new-player" style="padding: 0.7rem 1.5rem; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer;">
                Cancel
              </button>
            </div>
          </div>
        </div>
      `;

      // Add event listeners
      document.getElementById('start-best-ball').addEventListener('click', startBestBallRound);
      document.getElementById('cancel-best-ball').addEventListener('click', () => {
        setupContainer.style.display = 'none';
        document.getElementById('auth-container').style.display = 'block';
      });

      // Add listeners for "New Player" option
      const playerSelects = document.querySelectorAll('.player-select');

      playerSelects.forEach(select => {
        select.addEventListener('change', function() {
          if (this.value === 'new-player') {
            showNewPlayerModal(this.id);
          }
        });
      });

      // Modal event listeners
      document.getElementById('cancel-new-player').addEventListener('click', closeNewPlayerModal);
      document.getElementById('save-new-player').addEventListener('click', saveNewPlayer);

      // Add listeners for edit buttons
      const editButtons = document.querySelectorAll('.edit-player-btn');
      editButtons.forEach(btn => {
        btn.addEventListener('click', function() {
          const selectId = this.getAttribute('data-select');
          const select = document.getElementById(selectId);
          const golferId = select.value;

          if (!golferId || golferId === 'new-player' || golferId === '') {
            return; // No player selected, do nothing
          }

          // Find the golfer in allGolfers
          const golfer = allGolfers.find(g => g.golfer_id == golferId);
          if (golfer) {
            showEditPlayerModal(golfer);
          }
        });
      });

      // Add listener for handicap slider
      const handicapSlider = document.getElementById('handicap-slider');
      const handicapValue = document.getElementById('handicap-value');
      handicapSlider.addEventListener('input', function() {
        handicapValue.textContent = this.value + '%';
      });

      // Add listener for course selection to load tees
      const courseSelect = document.getElementById('select-course');
      courseSelect.addEventListener('change', function() {
        const courseId = this.value;
        const teeSelection = document.getElementById('tee-selection');
        const teeSelect = document.getElementById('select-tee');

        if (!courseId) {
          teeSelection.style.display = 'none';
          teeSelect.innerHTML = '<option value="">-- Select Tees --</option>';
          return;
        }

        // Fetch tees for selected course
        fetch(`${API_BASE_URL}/api/get_course_tees.php?course_id=${courseId}`)
          .then(res => res.json())
          .then(data => {
            if (data.tees && data.tees.length > 0) {
              teeSelect.innerHTML = '<option value="">-- Select Tees --</option>' +
                data.tees.map(tee =>
                  `<option value="${tee.tee_id}">${tee.tee_name} (${tee.slope}, ${tee.rating}, ${tee.yardage})</option>`
                ).join('');
              teeSelection.style.display = 'block';
            } else {
              teeSelect.innerHTML = '<option value="">No tees available</option>';
              teeSelection.style.display = 'block';
            }
          })
          .catch(err => {
            console.error('Error loading tees:', err);
            teeSelect.innerHTML = '<option value="">Error loading tees</option>';
          });
      });

      // Restore saved selections if preserving
      if (preserveSelections && Object.keys(savedSelections).length > 0) {
        // Restore player selections first
        ['team1-player1', 'team1-player2', 'team2-player1', 'team2-player2'].forEach(id => {
          if (savedSelections[id]) {
            const select = document.getElementById(id);
            if (select) {
              select.value = savedSelections[id];
            }
          }
        });

        // Restore course selection and trigger change event to load tees
        if (savedSelections['select-course']) {
          const courseSelect = document.getElementById('select-course');
          if (courseSelect) {
            courseSelect.value = savedSelections['select-course'];
            // Trigger change event to load tees
            const event = new Event('change');
            courseSelect.dispatchEvent(event);

            // After tees are loaded, restore tee selection
            if (savedSelections['select-tee']) {
              setTimeout(() => {
                const teeSelect = document.getElementById('select-tee');
                if (teeSelect) {
                  teeSelect.value = savedSelections['select-tee'];
                }
              }, 500); // Wait for tees to load
            }
          }
        }

        // Restore handicap slider value
        if (savedSelections['handicap-slider']) {
          const handicapSlider = document.getElementById('handicap-slider');
          const handicapValue = document.getElementById('handicap-value');
          if (handicapSlider && handicapValue) {
            handicapSlider.value = savedSelections['handicap-slider'];
            handicapValue.textContent = savedSelections['handicap-slider'] + '%';
          }
        }
      }

      // If a new player was just created, select them in the dropdown that triggered it
      if (newPlayerId && currentSelectId) {
        const select = document.getElementById(currentSelectId);
        if (select) {
          select.value = newPlayerId;
        }
        newPlayerId = null; // Clear after using
        currentSelectId = null;
      }
    })
    .catch(err => {
      console.error('Error loading golfers:', err);
      setupContent.innerHTML = '<p style="color: red; text-align: center;">Error loading golfers. Please try again.</p>';
    });
}

function showNewPlayerModal(selectId) {
  currentSelectId = selectId; // Store which dropdown triggered this
  const modal = document.getElementById('new-player-modal');
  modal.style.display = 'flex';
  // Clear previous values
  document.getElementById('player-modal-title').textContent = 'Add New Player';
  document.getElementById('edit-player-id').value = '';
  document.getElementById('new-player-first-name').value = '';
  document.getElementById('new-player-last-name').value = '';
  document.getElementById('new-player-handicap').value = '';
  document.getElementById('new-player-message').textContent = '';
}

function showEditPlayerModal(golfer) {
  const modal = document.getElementById('new-player-modal');
  modal.style.display = 'flex';
  // Prefill with existing values
  document.getElementById('player-modal-title').textContent = 'Edit Player';
  document.getElementById('edit-player-id').value = golfer.golfer_id;
  document.getElementById('new-player-first-name').value = golfer.first_name;
  document.getElementById('new-player-last-name').value = golfer.last_name;
  document.getElementById('new-player-handicap').value = golfer.handicap;
  document.getElementById('new-player-message').textContent = '';
}

function closeNewPlayerModal() {
  const modal = document.getElementById('new-player-modal');
  modal.style.display = 'none';

  // Reset the select that triggered the modal
  const playerSelects = document.querySelectorAll('.player-select');
  playerSelects.forEach(select => {
    if (select.value === 'new-player') {
      select.value = '';
    }
  });
}

function saveNewPlayer() {
  const firstName = document.getElementById('new-player-first-name').value.trim();
  const lastName = document.getElementById('new-player-last-name').value.trim();
  const handicap = document.getElementById('new-player-handicap').value;
  const golferId = document.getElementById('edit-player-id').value;
  const message = document.getElementById('new-player-message');

  // Validation
  if (!firstName || !lastName) {
    message.textContent = 'Please enter first and last name.';
    return;
  }

  if (handicap === '' || isNaN(handicap)) {
    message.textContent = 'Please enter a valid handicap.';
    return;
  }

  // Send to backend
  const formData = new FormData();
  formData.append('first_name', firstName);
  formData.append('last_name', lastName);
  formData.append('handicap', handicap);

  // Determine if we're editing or adding
  const isEditing = golferId !== '';
  if (isEditing) {
    formData.append('golfer_id', golferId);
  }

  const endpoint = isEditing ? '/update_golfer.php' : '/add_golfer.php';

  fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'POST',
    body: formData
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      message.style.color = 'green';
      message.textContent = isEditing ? 'Player updated successfully!' : 'Player added successfully!';

      // Store the new player ID if we're adding (not editing)
      if (!isEditing && data.golfer_id) {
        newPlayerId = data.golfer_id;
      }

      // Reload the best ball setup to refresh dropdowns, preserving existing selections
      setTimeout(() => {
        closeNewPlayerModal();
        loadBestBallSetup(true);
      }, 1000);
    } else {
      message.style.color = 'red';
      message.textContent = data.message || 'Error saving player.';
    }
  })
  .catch(err => {
    console.error('Error saving player:', err);
    message.style.color = 'red';
    message.textContent = 'Error saving player. Please try again.';
  });
}

function loadRabbitSetup(preserveSelections = false) {
  const setupContainer = document.getElementById('best-ball-setup');
  const setupContent = document.getElementById('best-ball-setup-content');

  // Save current selections if we're preserving them
  let savedSelections = {};
  if (preserveSelections) {
    const selects = ['rabbit-player1', 'rabbit-player2', 'rabbit-player3', 'rabbit-player4', 'select-course', 'select-tee'];
    selects.forEach(id => {
      const select = document.getElementById(id);
      if (select && select.value && select.value !== 'new-player') {
        savedSelections[id] = select.value;
      }
    });

    // Save handicap slider value
    const handicapSlider = document.getElementById('handicap-slider');
    if (handicapSlider) {
      savedSelections['handicap-slider'] = handicapSlider.value;
    }
  }

  setupContainer.style.display = 'block';

  // Fetch both golfers and courses in parallel
  Promise.all([
    fetch(`${API_BASE_URL}/get_golfers.php`).then(res => res.json()),
    fetch(`${API_BASE_URL}/api/courses.php`).then(res => res.json())
  ])
  .then(([golfers, courses]) => {
    allGolfers = golfers;
    allCourses = courses;

    const golferOptions = golfers.map(g => `<option value="${g.golfer_id}">${g.first_name} ${g.last_name} (${g.handicap})</option>`).join('');
    const courseOptions = courses.map(c => `<option value="${c.course_id}">${c.name}</option>`).join('');

    setupContent.innerHTML = `
      <div style="max-width: 600px; margin: 2rem auto; padding: 2rem; background: white; border-radius: 8px;">
        <h2 style="text-align: center; margin-bottom: 2rem;">Rabbit Setup</h2>

        <div style="margin-bottom: 2rem; padding: 1rem; background: #f0f0f0; border-radius: 8px;">
          <h3 style="margin-top: 0;">Players</h3>

          <div style="margin-bottom: 1rem;">
            <label style="display: block; margin-bottom: 0.5rem;">Player 1:</label>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <select id="rabbit-player1" class="player-select" style="flex: 1; padding: 0.5rem; font-size: 1rem; border-radius: 4px; border: 1px solid #ccc;">
                <option value="">-- Select Player --</option>
                ${golferOptions}
                <option value="new-player">+ New Player</option>
              </select>
              <button class="edit-player-btn" data-select="rabbit-player1" style="padding: 0.5rem 0.75rem; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 1rem;">✏️</button>
            </div>
          </div>

          <div style="margin-bottom: 1rem;">
            <label style="display: block; margin-bottom: 0.5rem;">Player 2:</label>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <select id="rabbit-player2" class="player-select" style="flex: 1; padding: 0.5rem; font-size: 1rem; border-radius: 4px; border: 1px solid #ccc;">
                <option value="">-- Select Player --</option>
                ${golferOptions}
                <option value="new-player">+ New Player</option>
              </select>
              <button class="edit-player-btn" data-select="rabbit-player2" style="padding: 0.5rem 0.75rem; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 1rem;">✏️</button>
            </div>
          </div>

          <div style="margin-bottom: 1rem;">
            <label style="display: block; margin-bottom: 0.5rem;">Player 3:</label>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <select id="rabbit-player3" class="player-select" style="flex: 1; padding: 0.5rem; font-size: 1rem; border-radius: 4px; border: 1px solid #ccc;">
                <option value="">-- Select Player --</option>
                ${golferOptions}
                <option value="new-player">+ New Player</option>
              </select>
              <button class="edit-player-btn" data-select="rabbit-player3" style="padding: 0.5rem 0.75rem; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 1rem;">✏️</button>
            </div>
          </div>

          <div style="margin-bottom: 1rem;">
            <label style="display: block; margin-bottom: 0.5rem;">Player 4:</label>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <select id="rabbit-player4" class="player-select" style="flex: 1; padding: 0.5rem; font-size: 1rem; border-radius: 4px; border: 1px solid #ccc;">
                <option value="">-- Select Player --</option>
                ${golferOptions}
                <option value="new-player">+ New Player</option>
              </select>
              <button class="edit-player-btn" data-select="rabbit-player4" style="padding: 0.5rem 0.75rem; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 1rem;">✏️</button>
            </div>
          </div>
        </div>

        <div style="margin-bottom: 2rem; padding: 1rem; background: #f0f0f0; border-radius: 8px;">
          <h3 style="margin-top: 0;">Course</h3>
          <div style="margin-bottom: 1rem;">
            <label style="display: block; margin-bottom: 0.5rem;">Select Course:</label>
            <select id="select-course" style="width: 100%; padding: 0.5rem; font-size: 1rem; border-radius: 4px; border: 1px solid #ccc;">
              <option value="">-- Select Course --</option>
              ${courseOptions}
            </select>
          </div>
          <div id="tee-selection" style="display: none;">
            <label style="display: block; margin-bottom: 0.5rem;">Select Tees:</label>
            <select id="select-tee" style="width: 100%; padding: 0.5rem; font-size: 1rem; border-radius: 4px; border: 1px solid #ccc;">
              <option value="">-- Select Tees --</option>
            </select>
          </div>
        </div>

        <div style="margin-bottom: 2rem; padding: 1rem; background: #f0f0f0; border-radius: 8px;">
          <h3 style="margin-top: 0;">Handicap Adjustment</h3>
          <div>
            <label style="display: block; margin-bottom: 0.5rem;">Handicap Percentage: <span id="handicap-value" style="font-weight: bold;">100%</span></label>
            <input type="range" id="handicap-slider" min="10" max="100" step="10" value="100" style="width: 100%; height: 8px; border-radius: 5px; background: #ddd; outline: none; cursor: pointer;">
          </div>
        </div>

        <div style="text-align: center;">
          <button id="start-rabbit" style="padding: 1rem 2rem; font-size: 1.2rem; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">
            Start Round
          </button>
          <button id="cancel-rabbit" style="padding: 1rem 2rem; font-size: 1rem; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer; margin-left: 1rem;">
            Cancel
          </button>
        </div>
        <div id="setup-message" style="margin-top: 1rem; text-align: center; color: red;"></div>
      </div>

      <!-- New Player Modal (reused) -->
      <div id="new-player-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1000; align-items: center; justify-content: center;">
        <div style="background: white; padding: 2rem; border-radius: 8px; max-width: 400px; width: 90%;">
          <h3 id="player-modal-title" style="margin-top: 0;">Add New Player</h3>
          <input type="hidden" id="edit-player-id" value="">
          <div style="margin-bottom: 1rem;">
            <label style="display: block; margin-bottom: 0.5rem;">First Name:</label>
            <input type="text" id="new-player-first-name" style="width: 100%; padding: 0.5rem; font-size: 1rem; border-radius: 4px; border: 1px solid #ccc; box-sizing: border-box;">
          </div>
          <div style="margin-bottom: 1rem;">
            <label style="display: block; margin-bottom: 0.5rem;">Last Name:</label>
            <input type="text" id="new-player-last-name" style="width: 100%; padding: 0.5rem; font-size: 1rem; border-radius: 4px; border: 1px solid #ccc; box-sizing: border-box;">
          </div>
          <div style="margin-bottom: 1rem;">
            <label style="display: block; margin-bottom: 0.5rem;">Handicap:</label>
            <input type="number" id="new-player-handicap" step="0.1" style="width: 100%; padding: 0.5rem; font-size: 1rem; border-radius: 4px; border: 1px solid #ccc; box-sizing: border-box;">
          </div>
          <div id="new-player-message" style="margin-bottom: 1rem; color: red; text-align: center;"></div>
          <div style="text-align: center;">
            <button id="save-new-player" style="padding: 0.7rem 1.5rem; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; margin-right: 0.5rem;">
              Save
            </button>
            <button id="cancel-new-player" style="padding: 0.7rem 1.5rem; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer;">
              Cancel
            </button>
          </div>
        </div>
      </div>
    `;

    // Restore saved selections if preserving
    if (preserveSelections) {
      Object.keys(savedSelections).forEach(id => {
        const element = document.getElementById(id);
        if (element) {
          element.value = savedSelections[id];
          if (id === 'select-course') {
            // Trigger course change to load tees
            element.dispatchEvent(new Event('change'));
          }
        }
      });
    }

    // Add event listeners
    document.getElementById('start-rabbit').addEventListener('click', startRabbitRound);
    document.getElementById('cancel-rabbit').addEventListener('click', () => {
      setupContainer.style.display = 'none';
      document.getElementById('auth-container').style.display = 'block';
    });

    // Add listeners for "New Player" option
    const playerSelects = document.querySelectorAll('.player-select');
    playerSelects.forEach(select => {
      select.addEventListener('change', function() {
        if (this.value === 'new-player') {
          showNewPlayerModal(this.id);
        }
      });
    });

    // Modal event listeners
    document.getElementById('cancel-new-player').addEventListener('click', closeNewPlayerModal);
    document.getElementById('save-new-player').addEventListener('click', saveNewPlayer);

    // Add listeners for edit buttons
    const editButtons = document.querySelectorAll('.edit-player-btn');
    editButtons.forEach(btn => {
      btn.addEventListener('click', function() {
        const selectId = this.getAttribute('data-select');
        const select = document.getElementById(selectId);
        const golferId = select.value;

        if (!golferId || golferId === 'new-player' || golferId === '') {
          return;
        }

        const golfer = allGolfers.find(g => g.golfer_id == golferId);
        if (golfer) {
          showEditPlayerModal(golfer);
        }
      });
    });

    // Add listener for handicap slider
    const handicapSlider = document.getElementById('handicap-slider');
    const handicapValue = document.getElementById('handicap-value');
    handicapSlider.addEventListener('input', function() {
      handicapValue.textContent = this.value + '%';
    });

    // Add listener for course selection to load tees
    const courseSelect = document.getElementById('select-course');
    courseSelect.addEventListener('change', function() {
      const courseId = this.value;
      const teeSelection = document.getElementById('tee-selection');
      const teeSelect = document.getElementById('select-tee');

      if (!courseId) {
        teeSelection.style.display = 'none';
        teeSelect.innerHTML = '<option value="">-- Select Tees --</option>';
        return;
      }

      // Fetch tees for selected course
      fetch(`${API_BASE_URL}/api/get_course_tees.php?course_id=${courseId}`)
        .then(res => res.json())
        .then(data => {
          if (data.tees && data.tees.length > 0) {
            teeSelect.innerHTML = '<option value="">-- Select Tees --</option>' +
              data.tees.map(tee =>
                `<option value="${tee.tee_id}">${tee.tee_name} (${tee.slope}, ${tee.rating}, ${tee.yardage})</option>`
              ).join('');
            teeSelection.style.display = 'block';

            // Restore tee selection if preserving
            if (preserveSelections && savedSelections['select-tee']) {
              setTimeout(() => {
                teeSelect.value = savedSelections['select-tee'];
              }, 100);
            }
          } else {
            teeSelect.innerHTML = '<option value="">No tees available</option>';
            teeSelection.style.display = 'block';
          }
        })
        .catch(err => {
          console.error('Error loading tees:', err);
        });
    });
  })
  .catch(err => {
    console.error('Error loading setup data:', err);
    setupContent.innerHTML = '<p style="color: red; text-align: center;">Error loading golfers. Please try again.</p>';
  });
}

function loadWolfSetup(preserveSelections = false) {
  const setupContainer = document.getElementById('best-ball-setup');
  const setupContent = document.getElementById('best-ball-setup-content');

  // Save current selections if we're preserving them
  let savedSelections = {};
  if (preserveSelections) {
    const selects = ['wolf-player1', 'wolf-player2', 'wolf-player3', 'wolf-player4', 'select-course', 'select-tee'];
    selects.forEach(id => {
      const select = document.getElementById(id);
      if (select && select.value && select.value !== 'new-player') {
        savedSelections[id] = select.value;
      }
    });

    // Save handicap slider value
    const handicapSlider = document.getElementById('handicap-slider');
    if (handicapSlider) {
      savedSelections['handicap-slider'] = handicapSlider.value;
    }
  }

  setupContainer.style.display = 'block';

  // Fetch both golfers and courses in parallel
  Promise.all([
    fetch(`${API_BASE_URL}/get_golfers.php`).then(res => res.json()),
    fetch(`${API_BASE_URL}/api/courses.php`).then(res => res.json())
  ])
  .then(([golfers, courses]) => {
    allGolfers = golfers;
    allCourses = courses;

    const golferOptions = golfers.map(g => `<option value="${g.golfer_id}">${g.first_name} ${g.last_name} (${g.handicap})</option>`).join('');
    const courseOptions = courses.map(c => `<option value="${c.course_id}">${c.name}</option>`).join('');

    setupContent.innerHTML = `
      <div style="max-width: 600px; margin: 2rem auto; padding: 2rem; background: white; border-radius: 8px;">
        <h2 style="text-align: center; margin-bottom: 2rem;">Wolf Setup</h2>

        <div style="margin-bottom: 2rem; padding: 1rem; background: #f0f0f0; border-radius: 8px;">
          <h3 style="margin-top: 0;">Playing Order (4 Players Required)</h3>
          <p style="font-size: 0.9rem; color: #666; margin-bottom: 1rem;">The Wolf rotates each hole. Player 4 is the Wolf on Hole 1.</p>

          <div style="margin-bottom: 1rem;">
            <label style="display: block; margin-bottom: 0.5rem;">Player 1: <span style="color: red;">*</span></label>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <select id="wolf-player1" class="player-select" style="flex: 1; padding: 0.5rem; font-size: 1rem; border-radius: 4px; border: 1px solid #ccc;">
                <option value="">-- Select Player --</option>
                ${golferOptions}
                <option value="new-player">+ New Player</option>
              </select>
              <button class="edit-player-btn" data-select="wolf-player1" style="padding: 0.5rem 0.75rem; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 1rem;">✏️</button>
            </div>
          </div>

          <div style="margin-bottom: 1rem;">
            <label style="display: block; margin-bottom: 0.5rem;">Player 2: <span style="color: red;">*</span></label>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <select id="wolf-player2" class="player-select" style="flex: 1; padding: 0.5rem; font-size: 1rem; border-radius: 4px; border: 1px solid #ccc;">
                <option value="">-- Select Player --</option>
                ${golferOptions}
                <option value="new-player">+ New Player</option>
              </select>
              <button class="edit-player-btn" data-select="wolf-player2" style="padding: 0.5rem 0.75rem; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 1rem;">✏️</button>
            </div>
          </div>

          <div style="margin-bottom: 1rem;">
            <label style="display: block; margin-bottom: 0.5rem;">Player 3: <span style="color: red;">*</span></label>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <select id="wolf-player3" class="player-select" style="flex: 1; padding: 0.5rem; font-size: 1rem; border-radius: 4px; border: 1px solid #ccc;">
                <option value="">-- Select Player --</option>
                ${golferOptions}
                <option value="new-player">+ New Player</option>
              </select>
              <button class="edit-player-btn" data-select="wolf-player3" style="padding: 0.5rem 0.75rem; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 1rem;">✏️</button>
            </div>
          </div>

          <div style="margin-bottom: 1rem;">
            <label style="display: block; margin-bottom: 0.5rem;">Player 4 🐺: <span style="color: red;">*</span></label>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <select id="wolf-player4" class="player-select" style="flex: 1; padding: 0.5rem; font-size: 1rem; border-radius: 4px; border: 1px solid #ccc;">
                <option value="">-- Select Player --</option>
                ${golferOptions}
                <option value="new-player">+ New Player</option>
              </select>
              <button class="edit-player-btn" data-select="wolf-player4" style="padding: 0.5rem 0.75rem; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 1rem;">✏️</button>
            </div>
          </div>
        </div>

        <div style="margin-bottom: 2rem; padding: 1rem; background: #f0f0f0; border-radius: 8px;">
          <h3 style="margin-top: 0;">Course</h3>
          <div style="margin-bottom: 1rem;">
            <label style="display: block; margin-bottom: 0.5rem;">Select Course:</label>
            <select id="select-course" style="width: 100%; padding: 0.5rem; font-size: 1rem; border-radius: 4px; border: 1px solid #ccc;">
              <option value="">-- Select Course --</option>
              ${courseOptions}
            </select>
          </div>
          <div id="tee-selection" style="display: none;">
            <label style="display: block; margin-bottom: 0.5rem;">Select Tees:</label>
            <select id="select-tee" style="width: 100%; padding: 0.5rem; font-size: 1rem; border-radius: 4px; border: 1px solid #ccc;">
              <option value="">-- Select Tees --</option>
            </select>
          </div>
        </div>

        <div style="margin-bottom: 2rem; padding: 1rem; background: #f0f0f0; border-radius: 8px;">
          <h3 style="margin-top: 0;">Handicap Adjustment</h3>
          <div>
            <label style="display: block; margin-bottom: 0.5rem;">Handicap Percentage: <span id="handicap-value" style="font-weight: bold;">100%</span></label>
            <input type="range" id="handicap-slider" min="10" max="100" step="10" value="100" style="width: 100%; height: 8px; border-radius: 5px; background: #ddd; outline: none; cursor: pointer;">
          </div>
        </div>

        <div style="text-align: center;">
          <button id="start-wolf" style="padding: 1rem 2rem; font-size: 1.2rem; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">
            Start Round
          </button>
          <button id="cancel-wolf" style="padding: 1rem 2rem; font-size: 1rem; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer; margin-left: 1rem;">
            Cancel
          </button>
        </div>
        <div id="setup-message" style="margin-top: 1rem; text-align: center; color: red;"></div>
      </div>

      <!-- New Player Modal (reused) -->
      <div id="new-player-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1000; align-items: center; justify-content: center;">
        <div style="background: white; padding: 2rem; border-radius: 8px; max-width: 400px; width: 90%;">
          <h3 id="player-modal-title" style="margin-top: 0;">Add New Player</h3>
          <input type="hidden" id="edit-player-id" value="">
          <div style="margin-bottom: 1rem;">
            <label style="display: block; margin-bottom: 0.5rem;">First Name:</label>
            <input type="text" id="new-player-first-name" style="width: 100%; padding: 0.5rem; font-size: 1rem; border-radius: 4px; border: 1px solid #ccc; box-sizing: border-box;">
          </div>
          <div style="margin-bottom: 1rem;">
            <label style="display: block; margin-bottom: 0.5rem;">Last Name:</label>
            <input type="text" id="new-player-last-name" style="width: 100%; padding: 0.5rem; font-size: 1rem; border-radius: 4px; border: 1px solid #ccc; box-sizing: border-box;">
          </div>
          <div style="margin-bottom: 1rem;">
            <label style="display: block; margin-bottom: 0.5rem;">Handicap:</label>
            <input type="number" id="new-player-handicap" step="0.1" style="width: 100%; padding: 0.5rem; font-size: 1rem; border-radius: 4px; border: 1px solid #ccc; box-sizing: border-box;">
          </div>
          <div id="new-player-message" style="margin-bottom: 1rem; color: red; text-align: center;"></div>
          <div style="text-align: center;">
            <button id="save-new-player" style="padding: 0.7rem 1.5rem; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; margin-right: 0.5rem;">
              Save
            </button>
            <button id="cancel-new-player" style="padding: 0.7rem 1.5rem; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer;">
              Cancel
            </button>
          </div>
        </div>
      </div>
    `;

    // Restore saved selections if preserving
    if (preserveSelections) {
      Object.keys(savedSelections).forEach(id => {
        const element = document.getElementById(id);
        if (element) {
          element.value = savedSelections[id];
          if (id === 'select-course') {
            // Trigger course change to load tees
            element.dispatchEvent(new Event('change'));
          }
        }
      });
    }

    // Add event listeners
    document.getElementById('start-wolf').addEventListener('click', startWolfRound);
    document.getElementById('cancel-wolf').addEventListener('click', () => {
      setupContainer.style.display = 'none';
      document.getElementById('auth-container').style.display = 'block';
    });

    // Add listeners for "New Player" option
    const playerSelects = document.querySelectorAll('.player-select');
    playerSelects.forEach(select => {
      select.addEventListener('change', function() {
        if (this.value === 'new-player') {
          showNewPlayerModal(this.id);
        }
      });
    });

    // Modal event listeners
    document.getElementById('cancel-new-player').addEventListener('click', closeNewPlayerModal);
    document.getElementById('save-new-player').addEventListener('click', saveNewPlayer);

    // Add listeners for edit buttons
    const editButtons = document.querySelectorAll('.edit-player-btn');
    editButtons.forEach(btn => {
      btn.addEventListener('click', function() {
        const selectId = this.getAttribute('data-select');
        const select = document.getElementById(selectId);
        const golferId = select.value;

        if (!golferId || golferId === 'new-player' || golferId === '') {
          return;
        }

        const golfer = allGolfers.find(g => g.golfer_id == golferId);
        if (golfer) {
          showEditPlayerModal(golfer);
        }
      });
    });

    // Add listener for handicap slider
    const handicapSlider = document.getElementById('handicap-slider');
    const handicapValue = document.getElementById('handicap-value');
    handicapSlider.addEventListener('input', function() {
      handicapValue.textContent = this.value + '%';
    });

    // Add listener for course selection to load tees
    const courseSelect = document.getElementById('select-course');
    courseSelect.addEventListener('change', function() {
      const courseId = this.value;
      const teeSelection = document.getElementById('tee-selection');
      const teeSelect = document.getElementById('select-tee');

      if (!courseId) {
        teeSelection.style.display = 'none';
        teeSelect.innerHTML = '<option value="">-- Select Tees --</option>';
        return;
      }

      // Fetch tees for selected course
      fetch(`${API_BASE_URL}/api/get_course_tees.php?course_id=${courseId}`)
        .then(res => res.json())
        .then(data => {
          if (data.tees && data.tees.length > 0) {
            teeSelect.innerHTML = '<option value="">-- Select Tees --</option>' +
              data.tees.map(tee =>
                `<option value="${tee.tee_id}">${tee.tee_name} (${tee.slope}, ${tee.rating}, ${tee.yardage})</option>`
              ).join('');
            teeSelection.style.display = 'block';

            // Restore tee selection if preserving
            if (preserveSelections && savedSelections['select-tee']) {
              setTimeout(() => {
                teeSelect.value = savedSelections['select-tee'];
              }, 100);
            }
          } else {
            teeSelect.innerHTML = '<option value="">No tees available</option>';
            teeSelection.style.display = 'block';
          }
        })
        .catch(err => {
          console.error('Error loading tees:', err);
        });
    });
  })
  .catch(err => {
    console.error('Error loading setup data:', err);
    setupContent.innerHTML = '<p style="color: red; text-align: center;">Error loading golfers. Please try again.</p>';
  });
}

function startWolfRound() {
  const player1 = document.getElementById('wolf-player1').value;
  const player2 = document.getElementById('wolf-player2').value;
  const player3 = document.getElementById('wolf-player3').value;
  const player4 = document.getElementById('wolf-player4').value;
  const courseId = document.getElementById('select-course').value;
  const teeId = document.getElementById('select-tee').value;
  const handicapPct = document.getElementById('handicap-slider').value;

  const message = document.getElementById('setup-message');

  // Validation - all 4 players required
  if (!player1 || !player2 || !player3 || !player4) {
    message.style.color = 'red';
    message.textContent = 'All 4 players are required for Wolf.';
    return;
  }

  if (!courseId || !teeId) {
    message.style.color = 'red';
    message.textContent = 'Please select a course and tees.';
    return;
  }

  // Check for duplicate players
  const players = [player1, player2, player3, player4];
  const uniquePlayers = new Set(players);
  if (uniquePlayers.size !== 4) {
    message.style.color = 'red';
    message.textContent = 'Please select 4 different players.';
    return;
  }

  message.style.color = 'blue';
  message.textContent = 'Creating round...';

  const wolfRoundData = {
    players: players.map(p => parseInt(p)),
    course_id: parseInt(courseId),
    tee_id: parseInt(teeId),
    handicap_pct: parseFloat(handicapPct)
  };

  fetch(`${API_BASE_URL}/api/create_wolf_round.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(wolfRoundData),
    credentials: 'include'
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      message.style.color = 'green';
      message.textContent = 'Round created! Loading scorecard...';

      // Store round info in sessionStorage
      sessionStorage.setItem('wolf_match_id', data.match_id);
      sessionStorage.setItem('wolf_tournament_id', data.tournament_id);
      sessionStorage.setItem('wolf_round_id', data.round_id);
      sessionStorage.setItem('wolf_match_code', data.match_code);

      // Load Wolf scoring interface
      setTimeout(() => {
        loadWolfScoring();
      }, 1000);
    } else {
      message.style.color = 'red';
      message.textContent = 'Error creating round: ' + (data.error || 'Unknown error');
    }
  })
  .catch(err => {
    console.error('Error creating wolf round:', err);
    message.style.color = 'red';
    message.textContent = 'Error creating round. Please try again.';
  });
}

function loadWolfScoring() {
  const matchId = sessionStorage.getItem('wolf_match_id');
  const matchCode = sessionStorage.getItem('wolf_match_code');

  if (!matchId) {
    console.error('No match ID found');
    return;
  }

  // Hide setup container and show scoring interface
  const setupContainer = document.getElementById('best-ball-setup');
  setupContainer.style.display = 'none';

  const appContent = document.getElementById('app-content');
  appContent.style.display = 'block';

  // Hide the navigation tabs
  const navElement = appContent.querySelector('nav');
  if (navElement) {
    navElement.style.display = 'none';
  }

  // Show the header with logout button
  const headerElement = appContent.querySelector('header');
  if (headerElement) {
    headerElement.style.display = 'block';

    const tournamentBar = headerElement.querySelector('#tournament-bar');
    if (tournamentBar) {
      tournamentBar.style.display = 'none';
    }

    const userBar = headerElement.querySelector('#user-bar');
    if (userBar) {
      userBar.style.display = 'flex';
      const userName = userBar.querySelector('#user-name');
      if (userName) {
        userName.textContent = matchCode ? `Match Code: ${matchCode}` : 'Wolf Round';
      }
    }
  }

  const container = document.getElementById('score-entry-content');
  container.innerHTML = '';

  // Fetch match data
  fetch(`${API_BASE_URL}/api/get_wolf_match.php?match_id=${matchId}`)
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        container.innerHTML = `<p>Error loading match: ${data.error}</p>`;
        return;
      }

      const matchGolfers = data.match;
      holeInfo = data.holes;
      const wolfPartners = data.partners || [];
      const match = matchGolfers[0];
      currentMatchId = match.match_id;
      tournamentHandicapPct = parseFloat(match.tournament_handicap_pct || 100);

      // Show match header
      const headerDiv = document.createElement('div');
      headerDiv.style.cssText = 'background: #4F2185; padding: 1rem; margin-bottom: 1rem; border-radius: 4px; text-align: center; color: white;';
      headerDiv.innerHTML = `
        <h2 style="margin: 0; color: white;">${match.match_name}</h2>
      `;
      container.appendChild(headerDiv);

      courses = {
        course_name: match.course_name,
        slope: match.slope,
        rating: match.rating,
        par: match.par
      };

      // Build golfer list in order (player_order field from database)
      const golferMap = new Map();
      matchGolfers.forEach(row => {
        if (!golferMap.has(row.golfer_id)) {
          golferMap.set(row.golfer_id, {
            id: row.golfer_id,
            name: row.first_name,
            lastName: row.last_name,
            handicap: calculatePlayingHandicap(row.handicap),
            order: row.player_order || 0
          });
        }
      });
      golfers = Array.from(golferMap.values()).sort((a, b) => a.order - b.order);

      // Build stroke maps
      strokeMaps = {};
      golfers.forEach(g => {
        strokeMaps[g.id] = buildStrokeMapForGolfer(g.handicap, holeInfo);
      });

      // Build table
      const table = document.createElement("table");
      table.classList.add("score-table");

      // Header
      const header = document.createElement("tr");
      header.innerHTML = `<th>#</th><th>P</th><th>HI</th><th>Partner</th>` + golfers.map(golfer => {
        return `<th style="background-color: #2196F3; color: white;">${golfer.name} (${parseFloat(golfer.handicap).toFixed(1)})</th>`;
      }).join("");
      table.appendChild(header);

      // Score rows
      for (let i = 1; i <= 18; i++) {
        const row = document.createElement("tr");
        const par = holeInfo.find(h => h.hole_number === i)?.par || "-";
        const index = holeInfo.find(h => h.hole_number === i)?.handicap_index || "-";

        // Determine who is the Wolf for this hole (cycles: 4, 3, 2, 1, 4, 3, 2, 1...)
        const wolfIndex = (4 - (i % 4)) % 4;
        const wolfGolfer = golfers[wolfIndex];

        // Partner selection dropdown - exclude the Wolf and add "Lone Wolf" option
        const partnerOptions = golfers
          .filter(g => g.id !== wolfGolfer.id)
          .map(g => `<option value="${g.id}">${g.name}</option>`)
          .join('');

        row.innerHTML = `<td>${i}</td><td>${par}</td><td>${index}</td>` +
          `<td>
            <select class="partner-select" data-hole="${i}" data-wolf="${wolfGolfer.id}" style="width: 100%; padding: 0.3rem; font-size: 0.9rem; border: 1px solid #ccc; border-radius: 3px;">
              <option value="">-- Select --</option>
              <option value="lone">Lone Wolf</option>
              ${partnerOptions}
            </select>
          </td>` +
          golfers.map((golfer, idx) => {
            const stroke = strokeMaps[golfer.id]?.[i] || 0;
            let dots = '';
            if (stroke === 1) {
              dots = '<span class="corner-dot"></span>';
            } else if (stroke === 2) {
              dots = '<span class="corner-dot"></span><span class="corner-dot second-dot"></span>';
            }

            // Add wolf emoji if this player is the Wolf for this hole
            const wolfEmoji = (idx === wolfIndex) ? '<span style="position: absolute; top: 2px; left: 2px; font-size: 0.7rem;">🐺</span>' : '';

            return `<td style="position:relative;">
              ${dots}
              ${wolfEmoji}
              <select class="score-input" data-hole="${i}" data-golfer="${golfer.id}" style="width: 100%; padding: 0.3rem; font-size: 1rem; border: 1px solid #ccc; border-radius: 3px; box-sizing: border-box;">
                <option value="">–</option>
                ${[1,2,3,4,5,6,7,8,9,10].map(n => `<option value="${n}">${n}</option>`).join('')}
              </select>
            </td>`;
          }).join("");
        table.appendChild(row);
      }

      // Points row
      const pointsRow = document.createElement("tr");
      pointsRow.id = "points-row";
      pointsRow.innerHTML = `<td></td><td></td><td></td><td>Points:</td>` + golfers.map(g => {
        return `<td class="points-cell" data-golfer="${g.id}" style="font-weight: bold;">0</td>`;
      }).join("");
      table.appendChild(pointsRow);

      // Score totals row
      const scoreTotalsRow = document.createElement("tr");
      scoreTotalsRow.id = "score-totals-row";
      scoreTotalsRow.innerHTML = `<td></td><td></td><td></td><td>Score:</td>` + golfers.map(g => {
        return `<td class="score-totals-cell" data-golfer="${g.id}">–</td>`;
      }).join("");
      table.appendChild(scoreTotalsRow);

      container.appendChild(table);

      // Add explanation
      const explanation = document.createElement("div");
      explanation.style.cssText = "margin-top: 2rem; padding: 1rem; background: #f5f5f5; border-radius: 4px; font-size: 0.9rem;";
      explanation.innerHTML = `
        <strong>How Wolf Works:</strong><br>
        The Wolf rotates each hole, and tees off last. The Wolf chooses a partner or goes Lone.<br>
        <strong>Scoring:</strong> Lone Wolf win = 3 pts (loss = 0 pts, others get 1 pt each). Partnership win = 1 pt each (loss = 0 pts each).<br><br>
        <strong>How Playing Handicap is Calculated:</strong><br>
        Each golfer's course handicap is calculated according to USGA guidelines using the formula:<br>
        <code>(Handicap × (Slope / 113) + (Rating - 72)) * Round %</code><br>
      `;
      container.appendChild(explanation);

      // Load existing scores and partner selections
      fetch(`${API_BASE_URL}/get_scores.php?match_id=${matchId}`, {
        credentials: 'include'
      })
      .then(res => res.json())
      .then(scores => {
        scores.forEach(score => {
          const select = document.querySelector(`select.score-input[data-hole="${score.hole_number}"][data-golfer="${score.golfer_id}"]`);
          if (select) {
            select.value = score.strokes;
            updateScoreCellClasses();
          }
        });

        // Load partner selections
        wolfPartners.forEach(partner => {
          const partnerSelect = document.querySelector(`select.partner-select[data-hole="${partner.hole_number}"]`);
          if (partnerSelect) {
            if (partner.partner_golfer_id === null) {
              partnerSelect.value = 'lone';
            } else {
              partnerSelect.value = partner.partner_golfer_id;
            }
          }
        });

        updateTotalScores();
        calculateWolfPoints();
      });

      // Add score change listeners
      table.querySelectorAll("select.score-input").forEach(select => {
        select.addEventListener("change", function () {
          const strokes = this.value;
          const hole = this.dataset.hole;
          const golfer_id = this.dataset.golfer;

          if (!strokes || !golfer_id || !hole) return;

          const payload = {
            match_id: matchId,
            golfer_id: parseInt(golfer_id),
            hole: parseInt(hole),
            strokes: parseInt(strokes)
          };

          fetch(`${API_BASE_URL}/save_score.php`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            credentials: 'include'
          })
          .then(res => res.json())
          .then(data => {
            if (data.success) {
              updateTotalScores();
              updateScoreCellClasses();
              calculateWolfPoints();
            } else {
              console.error("Save failed:", data.message);
            }
          })
          .catch(err => console.error("Fetch error:", err));
        });
      });

      // Add partner selection change listeners
      table.querySelectorAll("select.partner-select").forEach(select => {
        select.addEventListener("change", function() {
          const hole = this.dataset.hole;
          const wolfId = this.dataset.wolf;
          const partnerChoice = this.value;

          // Save partner selection to database
          const payload = {
            match_id: matchId,
            hole_number: parseInt(hole),
            wolf_golfer_id: parseInt(wolfId),
            partner_choice: partnerChoice
          };

          fetch(`${API_BASE_URL}/api/save_wolf_partner.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            credentials: 'include'
          })
          .then(res => res.json())
          .then(data => {
            if (data.success) {
              calculateWolfPoints();
            } else {
              console.error("Save partner failed:", data.error);
            }
          })
          .catch(err => console.error("Save partner error:", err));
        });
      });
    })
    .catch(err => {
      console.error("Error loading Wolf match:", err);
      container.innerHTML = '<p>Error loading match data. Please try again.</p>';
    });
}

function calculateWolfPoints() {
  // Calculate Wolf points based on partner selection and net scores
  const points = {};
  golfers.forEach(g => points[g.id] = 0);

  for (let hole = 1; hole <= 18; hole++) {
    // Get the Wolf for this hole
    const wolfIndex = (4 - (hole % 4)) % 4;
    const wolfGolfer = golfers[wolfIndex];

    // Get partner selection
    const partnerSelect = document.querySelector(`select.partner-select[data-hole="${hole}"]`);
    const partnerId = partnerSelect ? partnerSelect.value : '';

    // Get all scores for this hole
    const holeScores = [];
    let allScored = true;
    golfers.forEach(golfer => {
      const select = document.querySelector(`select.score-input[data-hole="${hole}"][data-golfer="${golfer.id}"]`);
      if (select && select.value) {
        const gross = parseInt(select.value);
        const strokes = strokeMaps[golfer.id]?.[hole] || 0;
        const net = gross - strokes;
        holeScores.push({ golfer: golfer, gross: gross, net: net });
      } else {
        allScored = false;
      }
    });

    // Clear previous highlights
    golfers.forEach(golfer => {
      const cell = document.querySelector(`td[data-hole="${hole}"][data-golfer="${golfer.id}"]`);
      if (cell) {
        cell.style.backgroundColor = '';
      }
    });

    // Only calculate if all players have scored and partner is selected
    if (allScored && partnerId && holeScores.length === 4) {
      let winners = [];
      let resultText = '';

      if (partnerId === 'lone') {
        // Lone Wolf vs the other 3 (best ball)
        const wolfScore = holeScores.find(s => s.golfer.id == wolfGolfer.id);
        const othersScores = holeScores.filter(s => s.golfer.id != wolfGolfer.id);
        const bestOtherNet = Math.min(...othersScores.map(s => s.net));

        if (wolfScore.net < bestOtherNet) {
          // Lone Wolf wins - gets 3 points
          points[wolfGolfer.id] += 3;
          winners = [wolfGolfer];
          resultText = '🐺 Lone Wolf Wins! (+3)';
        } else if (wolfScore.net > bestOtherNet) {
          // Others win - each gets 1 point
          othersScores.forEach(s => {
            points[s.golfer.id] += 1;
          });
          winners = othersScores.map(s => s.golfer);
          resultText = 'Others Win (+1 each)';
        } else {
          // Tie - no points
          resultText = 'Tie (no points)';
        }
      } else {
        // Partnership: Wolf + Partner vs Other 2 (best ball)
        const wolfTeam = holeScores.filter(s => s.golfer.id == wolfGolfer.id || s.golfer.id == partnerId);
        const otherTeam = holeScores.filter(s => s.golfer.id != wolfGolfer.id && s.golfer.id != partnerId);

        const wolfTeamBestNet = Math.min(...wolfTeam.map(s => s.net));
        const otherTeamBestNet = Math.min(...otherTeam.map(s => s.net));

        if (wolfTeamBestNet < otherTeamBestNet) {
          // Wolf partnership wins - each gets 1 point
          wolfTeam.forEach(s => {
            points[s.golfer.id] += 1;
          });
          winners = wolfTeam.map(s => s.golfer);
          const partnerGolfer = golfers.find(g => g.id == partnerId);
          resultText = `🐺 + ${partnerGolfer.name} Win (+1 each)`;
        } else if (otherTeamBestNet < wolfTeamBestNet) {
          // Other team wins - each gets 1 point
          otherTeam.forEach(s => {
            points[s.golfer.id] += 1;
          });
          winners = otherTeam.map(s => s.golfer);
          resultText = 'Others Win (+1 each)';
        } else {
          // Tie - no points
          resultText = 'Tie (no points)';
        }
      }

      // Highlight winning players
      winners.forEach(winner => {
        const cell = document.querySelector(`select.score-input[data-hole="${hole}"][data-golfer="${winner.id}"]`);
        if (cell && cell.parentElement && cell.parentElement.parentElement) {
          cell.parentElement.parentElement.style.backgroundColor = '#90EE90'; // Light green
        }
      });

      // Update partner cell with result
      const partnerCell = partnerSelect.parentElement;
      if (partnerCell) {
        const resultSpan = partnerCell.querySelector('.result-text') || document.createElement('div');
        resultSpan.className = 'result-text';
        resultSpan.style.cssText = 'font-size: 0.8rem; color: #333; margin-top: 0.2rem; font-weight: bold;';
        resultSpan.textContent = resultText;
        if (!partnerCell.querySelector('.result-text')) {
          partnerCell.appendChild(resultSpan);
        }
      }
    } else {
      // Clear result text if incomplete
      const partnerCell = partnerSelect ? partnerSelect.parentElement : null;
      if (partnerCell) {
        const resultSpan = partnerCell.querySelector('.result-text');
        if (resultSpan) {
          resultSpan.textContent = '';
        }
      }
    }
  }

  // Update points row
  golfers.forEach(golfer => {
    const pointsCell = document.querySelector(`td.points-cell[data-golfer="${golfer.id}"]`);
    if (pointsCell) {
      pointsCell.textContent = points[golfer.id];
    }
  });

  // Update score totals row
  golfers.forEach(golfer => {
    let total = 0;
    let totalPar = 0;
    let count = 0;
    for (let hole = 1; hole <= 18; hole++) {
      const select = document.querySelector(`select.score-input[data-hole="${hole}"][data-golfer="${golfer.id}"]`);
      if (select && select.value) {
        total += parseInt(select.value);
        const par = holeInfo.find(h => h.hole_number === hole)?.par || 0;
        totalPar += par;
        count++;
      }
    }
    const scoreTotalCell = document.querySelector(`td.score-totals-cell[data-golfer="${golfer.id}"]`);
    if (scoreTotalCell) {
      if (count > 0) {
        const differential = total - totalPar;
        let diffText = '';
        if (differential > 0) {
          diffText = ` (+${differential})`;
        } else if (differential < 0) {
          diffText = ` (${differential})`;
        } else {
          diffText = ' (E)';
        }
        scoreTotalCell.textContent = total + diffText;
      } else {
        scoreTotalCell.textContent = '–';
      }
    }
  });
}

function startRabbitRound() {
  const player1 = document.getElementById('rabbit-player1').value;
  const player2 = document.getElementById('rabbit-player2').value;
  const player3 = document.getElementById('rabbit-player3').value;
  const player4 = document.getElementById('rabbit-player4').value;
  const courseId = document.getElementById('select-course').value;
  const teeId = document.getElementById('select-tee').value;
  const handicapPct = document.getElementById('handicap-slider').value;

  const message = document.getElementById('setup-message');

  // Validation
  if (!player1 || !player2) {
    message.style.color = 'red';
    message.textContent = 'Please select at least 2 players.';
    return;
  }

  if (!courseId || !teeId) {
    message.style.color = 'red';
    message.textContent = 'Please select a course and tees.';
    return;
  }

  // Collect selected players (only non-empty values)
  const players = [player1, player2, player3, player4].filter(p => p);

  // Check for duplicate players
  const uniquePlayers = new Set(players);
  if (uniquePlayers.size !== players.length) {
    message.style.color = 'red';
    message.textContent = 'Please select different players.';
    return;
  }

  message.style.color = 'blue';
  message.textContent = 'Creating round...';

  const rabbitRoundData = {
    players: players.map(p => parseInt(p)),
    course_id: parseInt(courseId),
    tee_id: parseInt(teeId),
    handicap_pct: parseFloat(handicapPct)
  };

  fetch(`${API_BASE_URL}/api/create_rabbit_round.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rabbitRoundData),
    credentials: 'include'
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      message.style.color = 'green';
      message.textContent = 'Round created! Loading scorecard...';

      // Store round info in sessionStorage
      sessionStorage.setItem('rabbit_match_id', data.match_id);
      sessionStorage.setItem('rabbit_tournament_id', data.tournament_id);
      sessionStorage.setItem('rabbit_round_id', data.round_id);
      sessionStorage.setItem('rabbit_match_code', data.match_code);

      // Load Rabbit scoring interface
      setTimeout(() => {
        loadRabbitScoring();
      }, 1000);
    } else {
      message.style.color = 'red';
      message.textContent = 'Error creating round: ' + (data.error || 'Unknown error');
    }
  })
  .catch(err => {
    console.error('Error creating rabbit round:', err);
    message.style.color = 'red';
    message.textContent = 'Error creating round. Please try again.';
  });
}

function loadRabbitScoring() {
  const matchId = sessionStorage.getItem('rabbit_match_id');
  const matchCode = sessionStorage.getItem('rabbit_match_code');

  if (!matchId) {
    console.error('No match ID found');
    return;
  }

  // Hide setup container and show scoring interface
  const setupContainer = document.getElementById('best-ball-setup');
  setupContainer.style.display = 'none';

  const appContent = document.getElementById('app-content');
  appContent.style.display = 'block';

  // Hide the navigation tabs
  const navElement = appContent.querySelector('nav');
  if (navElement) {
    navElement.style.display = 'none';
  }

  // Show the header with logout button
  const headerElement = appContent.querySelector('header');
  if (headerElement) {
    headerElement.style.display = 'block';

    const tournamentBar = headerElement.querySelector('#tournament-bar');
    if (tournamentBar) {
      tournamentBar.style.display = 'none';
    }

    const userBar = headerElement.querySelector('#user-bar');
    if (userBar) {
      userBar.style.display = 'flex';
      const userName = userBar.querySelector('#user-name');
      if (userName) {
        userName.textContent = matchCode ? `Match Code: ${matchCode}` : 'Rabbit Round';
      }
    }
  }

  const container = document.getElementById('score-entry-content');
  container.innerHTML = '';

  // Fetch match data
  fetch(`${API_BASE_URL}/api/get_rabbit_match.php?match_id=${matchId}`)
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        container.innerHTML = `<p>Error loading match: ${data.error}</p>`;
        return;
      }

      const matchGolfers = data.match;
      holeInfo = data.holes;
      const match = matchGolfers[0];
      currentMatchId = match.match_id;
      tournamentHandicapPct = parseFloat(match.tournament_handicap_pct || 100);

      // Show match header
      const headerDiv = document.createElement('div');
      headerDiv.style.cssText = 'background: #4F2185; padding: 1rem; margin-bottom: 1rem; border-radius: 4px; text-align: center; color: white;';
      headerDiv.innerHTML = `
        <h2 style="margin: 0; color: white;">${match.match_name}</h2>
      `;
      container.appendChild(headerDiv);

      courses = {
        course_name: match.course_name,
        slope: match.slope,
        rating: match.rating,
        par: match.par
      };

      // Build golfer list (deduplicate by golfer_id)
      const golferMap = new Map();
      matchGolfers.forEach(row => {
        if (!golferMap.has(row.golfer_id)) {
          golferMap.set(row.golfer_id, {
            id: row.golfer_id,
            name: row.first_name,
            lastName: row.last_name,
            handicap: calculatePlayingHandicap(row.handicap),
          });
        }
      });
      golfers = Array.from(golferMap.values());

      // Build stroke maps
      strokeMaps = {};
      golfers.forEach(g => {
        strokeMaps[g.id] = buildStrokeMapForGolfer(g.handicap, holeInfo);
      });

      // Build table
      const table = document.createElement("table");
      table.classList.add("score-table");

      // Header
      const header = document.createElement("tr");
      header.innerHTML = `<th>#</th><th>P</th><th>HI</th>` + golfers.map(golfer => {
        return `<th style="background-color: #2196F3; color: white;">${golfer.name} (${parseFloat(golfer.handicap).toFixed(1)})</th>`;
      }).join("");
      table.appendChild(header);

      // Score rows
      for (let i = 1; i <= 18; i++) {
        const row = document.createElement("tr");
        const par = holeInfo.find(h => h.hole_number === i)?.par || "-";
        const index = holeInfo.find(h => h.hole_number === i)?.handicap_index || "-";
        row.innerHTML = `<td>${i}</td><td>${par}</td><td>${index}</td>` + golfers.map(golfer => {
          const stroke = strokeMaps[golfer.id]?.[i] || 0;
          let dots = '';
          if (stroke === 1) {
            dots = '<span class="corner-dot"></span>';
          } else if (stroke === 2) {
            dots = '<span class="corner-dot"></span><span class="corner-dot second-dot"></span>';
          }
          return `<td style="position:relative;">
            ${dots}
            <select class="score-input" data-hole="${i}" data-golfer="${golfer.id}" style="width: 100%; padding: 0.3rem; font-size: 1rem; border: 1px solid #ccc; border-radius: 3px; box-sizing: border-box;">
              <option value="">–</option>
              ${[1,2,3,4,5,6,7,8,9,10].map(n => `<option value="${n}">${n}</option>`).join('')}
            </select>
          </td>`;
        }).join("");
        table.appendChild(row);

        // Add Rabbit winner row after every 3rd hole
        if (i % 3 === 0) {
          const rabbitRow = document.createElement("tr");
          rabbitRow.classList.add("rabbit-row");
          rabbitRow.style.cssText = "background: #FFC62F; font-weight: bold;";
          rabbitRow.innerHTML = `<td colspan="${3 + golfers.length}" style="text-align: center; padding: 0.5rem;" id="rabbit-${i}">Rabbit Winner (Holes ${i-2}-${i}): –</td>`;
          table.appendChild(rabbitRow);
        }
      }

      // Totals row
      const totalsRow = document.createElement("tr");
      totalsRow.id = "totals-row";
      totalsRow.innerHTML = `<td></td><td></td><td></td>` + golfers.map(g => {
        return `<td class="totals-cell" data-golfer="${g.id}">–</td>`;
      }).join("");
      table.appendChild(totalsRow);

      container.appendChild(table);

      // Add handicap calculation explanation
      const handicapExplanation = document.createElement("div");
      handicapExplanation.style.cssText = "margin-top: 2rem; padding: 1rem; background: #f5f5f5; border-radius: 4px; font-size: 0.9rem;";
      handicapExplanation.innerHTML = `
        <strong>How Rabbit Works:</strong><br>
        Win a hole outright to own the Rabbit. If the next hole is tied, you keep the Rabbit.
        Another player must win a hole to set the Rabbit free. Points awarded every 3 holes (6 total).<br><br>
        <strong>How Playing Handicap is Calculated:</strong><br>
        Each golfer's course handicap is calculated according to USGA guidelines using the formula:<br>
        <code>(Handicap × (Slope / 113) + (Rating - 72)) * Round %</code><br>
      `;
      container.appendChild(handicapExplanation);

      // Load existing scores
      fetch(`${API_BASE_URL}/get_scores.php?match_id=${matchId}`, {
        credentials: 'include'
      })
      .then(res => res.json())
      .then(scores => {
        scores.forEach(score => {
          const select = document.querySelector(`select[data-hole="${score.hole_number}"][data-golfer="${score.golfer_id}"]`);
          if (select) {
            select.value = score.strokes;
            updateScoreCellClasses();
          }
        });
        updateTotalScores();
        calculateRabbitWinners();
      });

      // Add score change listeners
      table.querySelectorAll("select").forEach(select => {
        select.addEventListener("change", function () {
          const strokes = this.value;
          const hole = this.dataset.hole;
          const golfer_id = this.dataset.golfer;

          if (!strokes || !golfer_id || !hole) return;

          const payload = {
            match_id: matchId,
            golfer_id: parseInt(golfer_id),
            hole: parseInt(hole),
            strokes: parseInt(strokes)
          };

          fetch(`${API_BASE_URL}/save_score.php`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            credentials: 'include'
          })
          .then(res => res.json())
          .then(data => {
            if (data.success) {
              updateTotalScores();
              updateScoreCellClasses();
              calculateRabbitWinners();
            } else {
              console.error("Save failed:", data.message);
            }
          })
          .catch(err => console.error("Fetch error:", err));
        });
      });
    })
    .catch(err => {
      console.error("Error loading Rabbit match:", err);
      container.innerHTML = '<p>Error loading match data. Please try again.</p>';
    });
}

function loadWolfScorecardReadOnly() {
  const matchId = sessionStorage.getItem('wolf_match_id');
  const matchCode = sessionStorage.getItem('wolf_match_code');

  if (!matchId) {
    console.error('No match ID found');
    return;
  }

  // Hide all other containers
  document.getElementById('best-ball-setup').style.display = 'none';
  document.getElementById('round-history-container').style.display = 'none';
  document.getElementById('auth-container').style.display = 'none';

  const appContent = document.getElementById('app-content');
  appContent.style.display = 'block';

  // Hide the navigation tabs
  const navElement = appContent.querySelector('nav');
  if (navElement) {
    navElement.style.display = 'none';
  }

  // Show the header with logout button
  const headerElement = appContent.querySelector('header');
  if (headerElement) {
    headerElement.style.display = 'block';
    const tournamentBar = headerElement.querySelector('#tournament-bar');
    if (tournamentBar) tournamentBar.style.display = 'none';
    const userBar = headerElement.querySelector('#user-bar');
    if (userBar) {
      userBar.style.display = 'flex';
      const userName = userBar.querySelector('#user-name');
      if (userName) {
        userName.textContent = matchCode ? `Match Code: ${matchCode}` : 'Wolf Round';
      }
    }
  }

  const container = document.getElementById('score-entry-content');
  container.innerHTML = '';

  // Fetch match data
  fetch(`${API_BASE_URL}/api/get_wolf_match.php?match_id=${matchId}`)
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        container.innerHTML = `<p>Error loading match: ${data.error}</p>`;
        return;
      }

      const matchGolfers = data.match;
      holeInfo = data.holes;
      const wolfPartners = data.partners || [];
      const match = matchGolfers[0];
      currentMatchId = match.match_id;
      tournamentHandicapPct = parseFloat(match.tournament_handicap_pct || 100);

      // Show match header
      const headerDiv = document.createElement('div');
      headerDiv.style.cssText = 'background: #4F2185; padding: 1rem; margin-bottom: 1rem; border-radius: 4px; text-align: center; color: white;';
      headerDiv.innerHTML = `
        <h2 style="margin: 0; color: white;">${match.match_name}</h2>
        <p style="margin: 0.5rem 0 0 0; color: white; font-size: 1.1rem;">Match Finalized</p>
      `;
      container.appendChild(headerDiv);

      courses = {
        course_name: match.course_name,
        slope: match.slope,
        rating: match.rating,
        par: match.par
      };

      // Build golfer list in order
      const golferMap = new Map();
      matchGolfers.forEach(row => {
        if (!golferMap.has(row.golfer_id)) {
          golferMap.set(row.golfer_id, {
            id: row.golfer_id,
            name: row.first_name,
            lastName: row.last_name,
            handicap: calculatePlayingHandicap(row.handicap),
            order: row.player_order || 0
          });
        }
      });
      golfers = Array.from(golferMap.values()).sort((a, b) => a.order - b.order);

      // Build stroke maps
      strokeMaps = {};
      golfers.forEach(g => {
        strokeMaps[g.id] = buildStrokeMapForGolfer(g.handicap, holeInfo);
      });

      // Build table
      const table = document.createElement("table");
      table.classList.add("score-table");

      // Header
      const header = document.createElement("tr");
      header.innerHTML = `<th>#</th><th>P</th><th>HI</th><th>Partner</th>` + golfers.map(golfer => {
        return `<th style="background-color: #2196F3; color: white;">${golfer.name} (${parseFloat(golfer.handicap).toFixed(1)})</th>`;
      }).join("");
      table.appendChild(header);

      // Load scores first
      fetch(`${API_BASE_URL}/get_scores.php?match_id=${matchId}`, {
        credentials: 'include'
      })
      .then(res => res.json())
      .then(scores => {
        const scoreMap = {};
        scores.forEach(score => {
          if (!scoreMap[score.hole_number]) scoreMap[score.hole_number] = {};
          scoreMap[score.hole_number][score.golfer_id] = score.strokes;
        });

        // Create partner map
        const partnerMap = {};
        wolfPartners.forEach(partner => {
          partnerMap[partner.hole_number] = {
            partnerId: partner.partner_golfer_id,
            wolfId: partner.wolf_golfer_id
          };
        });

        // Score rows
        for (let i = 1; i <= 18; i++) {
          const row = document.createElement("tr");
          const par = holeInfo.find(h => h.hole_number === i)?.par || "-";
          const index = holeInfo.find(h => h.hole_number === i)?.handicap_index || "-";

          const wolfIndex = (4 - (i % 4)) % 4;
          const wolfGolfer = golfers[wolfIndex];

          // Display partner selection
          let partnerText = '–';
          if (partnerMap[i]) {
            if (partnerMap[i].partnerId === null) {
              partnerText = 'Lone Wolf';
            } else {
              const partner = golfers.find(g => g.id == partnerMap[i].partnerId);
              if (partner) partnerText = partner.name;
            }
          }

          row.innerHTML = `<td>${i}</td><td>${par}</td><td>${index}</td>` +
            `<td style="text-align: center; padding: 0.5rem;">${partnerText}</td>` +
            golfers.map((golfer, idx) => {
              const stroke = strokeMaps[golfer.id]?.[i] || 0;
              let dots = '';
              if (stroke === 1) {
                dots = '<span class="corner-dot"></span>';
              } else if (stroke === 2) {
                dots = '<span class="corner-dot"></span><span class="corner-dot second-dot"></span>';
              }

              const wolfEmoji = (idx === wolfIndex) ? '<span style="position: absolute; top: 2px; left: 2px; font-size: 0.7rem;">🐺</span>' : '';
              const scoreValue = scoreMap[i] && scoreMap[i][golfer.id] ? scoreMap[i][golfer.id] : '–';

              return `<td style="position:relative; text-align: center; padding: 0.5rem;">
                ${dots}
                ${wolfEmoji}
                ${scoreValue}
              </td>`;
            }).join("");
          table.appendChild(row);
        }

        // Calculate and display points
        const points = {};
        golfers.forEach(g => points[g.id] = 0);

        for (let hole = 1; hole <= 18; hole++) {
          const wolfIndex = (4 - (hole % 4)) % 4;
          const wolfGolfer = golfers[wolfIndex];
          const partnerInfo = partnerMap[hole];
          const partnerId = partnerInfo ? partnerInfo.partnerId : null;

          const holeScores = [];
          let allScored = true;
          golfers.forEach(golfer => {
            const gross = scoreMap[hole] && scoreMap[hole][golfer.id] ? parseInt(scoreMap[hole][golfer.id]) : null;
            if (gross !== null) {
              const strokes = strokeMaps[golfer.id]?.[hole] || 0;
              const net = gross - strokes;
              holeScores.push({ golfer: golfer, gross: gross, net: net });
            } else {
              allScored = false;
            }
          });

          if (allScored && partnerId !== undefined && holeScores.length === 4) {
            if (partnerId === null) {
              // Lone Wolf
              const wolfScore = holeScores.find(s => s.golfer.id == wolfGolfer.id);
              const othersScores = holeScores.filter(s => s.golfer.id != wolfGolfer.id);
              const bestOtherNet = Math.min(...othersScores.map(s => s.net));
              if (wolfScore.net < bestOtherNet) {
                points[wolfGolfer.id] += 3;
              } else if (wolfScore.net > bestOtherNet) {
                othersScores.forEach(s => points[s.golfer.id] += 1);
              }
            } else {
              // Partnership
              const wolfScore = holeScores.find(s => s.golfer.id == wolfGolfer.id);
              const partnerScore = holeScores.find(s => s.golfer.id == partnerId);
              const othersScores = holeScores.filter(s => s.golfer.id != wolfGolfer.id && s.golfer.id != partnerId);
              const teamBest = Math.min(wolfScore.net, partnerScore.net);
              const othersBest = Math.min(...othersScores.map(s => s.net));
              if (teamBest < othersBest) {
                points[wolfGolfer.id] += 1;
                points[partnerId] += 1;
              } else if (teamBest > othersBest) {
                othersScores.forEach(s => points[s.golfer.id] += 1);
              }
            }
          }
        }

        // Points row
        const pointsRow = document.createElement("tr");
        pointsRow.innerHTML = `<td></td><td></td><td></td><td>Points:</td>` + golfers.map(g => {
          return `<td style="font-weight: bold; text-align: center;">${points[g.id] || 0}</td>`;
        }).join("");
        table.appendChild(pointsRow);

        // Score totals row
        const scoreTotalsRow = document.createElement("tr");
        scoreTotalsRow.innerHTML = `<td></td><td></td><td></td><td>Score:</td>` + golfers.map(g => {
          let total = 0;
          for (let hole = 1; hole <= 18; hole++) {
            if (scoreMap[hole] && scoreMap[hole][g.id]) {
              total += parseInt(scoreMap[hole][g.id]);
            }
          }
          return `<td style="text-align: center;">${total > 0 ? total : '–'}</td>`;
        }).join("");
        table.appendChild(scoreTotalsRow);

        container.appendChild(table);

        // Add explanation
        const explanation = document.createElement("div");
        explanation.style.cssText = "margin-top: 2rem; padding: 1rem; background: #f5f5f5; border-radius: 4px; font-size: 0.9rem;";
        explanation.innerHTML = `
          <strong>How Wolf Works:</strong><br>
          The Wolf rotates each hole, and tees off last. The Wolf chooses a partner or goes Lone.<br>
          <strong>Scoring:</strong> Lone Wolf win = 3 pts (loss = 0 pts, others get 1 pt each). Partnership win = 1 pt each (loss = 0 pts each).
        `;
        container.appendChild(explanation);
      });
    })
    .catch(err => {
      console.error("Error loading Wolf match:", err);
      container.innerHTML = '<p>Error loading match data. Please try again.</p>';
    });
}

function loadRabbitScorecardReadOnly() {
  const matchId = sessionStorage.getItem('rabbit_match_id');
  const matchCode = sessionStorage.getItem('rabbit_match_code');

  if (!matchId) {
    console.error('No match ID found');
    return;
  }

  // Hide all other containers
  document.getElementById('best-ball-setup').style.display = 'none';
  document.getElementById('round-history-container').style.display = 'none';
  document.getElementById('auth-container').style.display = 'none';

  const appContent = document.getElementById('app-content');
  appContent.style.display = 'block';

  // Hide the navigation tabs
  const navElement = appContent.querySelector('nav');
  if (navElement) {
    navElement.style.display = 'none';
  }

  // Show the header with logout button
  const headerElement = appContent.querySelector('header');
  if (headerElement) {
    headerElement.style.display = 'block';
    const tournamentBar = headerElement.querySelector('#tournament-bar');
    if (tournamentBar) tournamentBar.style.display = 'none';
    const userBar = headerElement.querySelector('#user-bar');
    if (userBar) {
      userBar.style.display = 'flex';
      const userName = userBar.querySelector('#user-name');
      if (userName) {
        userName.textContent = matchCode ? `Match Code: ${matchCode}` : 'Rabbit Round';
      }
    }
  }

  const container = document.getElementById('score-entry-content');
  container.innerHTML = '';

  // Fetch match data
  fetch(`${API_BASE_URL}/api/get_rabbit_match.php?match_id=${matchId}`)
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        container.innerHTML = `<p>Error loading match: ${data.error}</p>`;
        return;
      }

      const matchGolfers = data.match;
      holeInfo = data.holes;
      const match = matchGolfers[0];
      currentMatchId = match.match_id;
      tournamentHandicapPct = parseFloat(match.tournament_handicap_pct || 100);

      // Show match header
      const headerDiv = document.createElement('div');
      headerDiv.style.cssText = 'background: #4F2185; padding: 1rem; margin-bottom: 1rem; border-radius: 4px; text-align: center; color: white;';
      headerDiv.innerHTML = `
        <h2 style="margin: 0; color: white;">${match.match_name}</h2>
        <p style="margin: 0.5rem 0 0 0; color: white; font-size: 1.1rem;">Match Finalized</p>
      `;
      container.appendChild(headerDiv);

      courses = {
        course_name: match.course_name,
        slope: match.slope,
        rating: match.rating,
        par: match.par
      };

      // Build golfer list
      const golferMap = new Map();
      matchGolfers.forEach(row => {
        if (!golferMap.has(row.golfer_id)) {
          golferMap.set(row.golfer_id, {
            id: row.golfer_id,
            name: row.first_name,
            lastName: row.last_name,
            handicap: calculatePlayingHandicap(row.handicap),
          });
        }
      });
      golfers = Array.from(golferMap.values());

      // Build stroke maps
      strokeMaps = {};
      golfers.forEach(g => {
        strokeMaps[g.id] = buildStrokeMapForGolfer(g.handicap, holeInfo);
      });

      // Build table
      const table = document.createElement("table");
      table.classList.add("score-table");

      // Header
      const header = document.createElement("tr");
      header.innerHTML = `<th>#</th><th>P</th><th>HI</th>` + golfers.map(golfer => {
        return `<th style="background-color: #2196F3; color: white;">${golfer.name} (${parseFloat(golfer.handicap).toFixed(1)})</th>`;
      }).join("");
      table.appendChild(header);

      // Load scores first
      fetch(`${API_BASE_URL}/get_scores.php?match_id=${matchId}`, {
        credentials: 'include'
      })
      .then(res => res.json())
      .then(scores => {
        const scoreMap = {};
        scores.forEach(score => {
          if (!scoreMap[score.hole_number]) scoreMap[score.hole_number] = {};
          scoreMap[score.hole_number][score.golfer_id] = score.strokes;
        });

        // Score rows
        for (let i = 1; i <= 18; i++) {
          const row = document.createElement("tr");
          const par = holeInfo.find(h => h.hole_number === i)?.par || "-";
          const index = holeInfo.find(h => h.hole_number === i)?.handicap_index || "-";
          row.innerHTML = `<td>${i}</td><td>${par}</td><td>${index}</td>` + golfers.map(golfer => {
            const stroke = strokeMaps[golfer.id]?.[i] || 0;
            let dots = '';
            if (stroke === 1) {
              dots = '<span class="corner-dot"></span>';
            } else if (stroke === 2) {
              dots = '<span class="corner-dot"></span><span class="corner-dot second-dot"></span>';
            }
            const scoreValue = scoreMap[i] && scoreMap[i][golfer.id] ? scoreMap[i][golfer.id] : '–';
            return `<td style="position:relative; text-align: center; padding: 0.5rem;">
              ${dots}
              ${scoreValue}
            </td>`;
          }).join("");
          table.appendChild(row);

          // Add Rabbit winner row after every 3rd hole
          if (i % 3 === 0) {
            // Calculate rabbit winner for this segment
            const startHole = i - 2;
            const endHole = i;
            let rabbitOwner = null;
            let rabbitFree = true;

            for (let hole = startHole; hole <= endHole; hole++) {
              const holeScores = [];
              let allScored = true;

              golfers.forEach(golfer => {
                const gross = scoreMap[hole] && scoreMap[hole][golfer.id] ? parseInt(scoreMap[hole][golfer.id]) : null;
                if (gross !== null) {
                  const strokes = strokeMaps[golfer.id]?.[hole] || 0;
                  const net = gross - strokes;
                  holeScores.push({ golfer: golfer, net: net });
                } else {
                  allScored = false;
                }
              });

              if (allScored && holeScores.length === golfers.length) {
                const lowestNet = Math.min(...holeScores.map(s => s.net));
                const winners = holeScores.filter(s => s.net === lowestNet);

                if (winners.length === 1) {
                  // Clear winner
                  const winner = winners[0].golfer;
                  if (rabbitFree) {
                    rabbitOwner = winner;
                    rabbitFree = false;
                  } else if (rabbitOwner && rabbitOwner.id !== winner.id) {
                    rabbitOwner = null;
                    rabbitFree = true;
                  }
                }
                // Tie: rabbit stays where it is
              }
            }

            const rabbitRow = document.createElement("tr");
            rabbitRow.classList.add("rabbit-row");
            rabbitRow.style.cssText = "background: #FFC62F; font-weight: bold;";
            const rabbitText = rabbitOwner ? `${rabbitOwner.name}` : (rabbitFree ? 'Free' : '–');
            rabbitRow.innerHTML = `<td colspan="${3 + golfers.length}" style="text-align: center; padding: 0.5rem;">Rabbit Winner (Holes ${startHole}-${endHole}): ${rabbitText}</td>`;
            table.appendChild(rabbitRow);
          }
        }

        // Totals row
        const totalsRow = document.createElement("tr");
        totalsRow.innerHTML = `<td></td><td></td><td></td>` + golfers.map(g => {
          let total = 0;
          for (let hole = 1; hole <= 18; hole++) {
            if (scoreMap[hole] && scoreMap[hole][g.id]) {
              total += parseInt(scoreMap[hole][g.id]);
            }
          }
          return `<td style="text-align: center;">${total > 0 ? total : '–'}</td>`;
        }).join("");
        table.appendChild(totalsRow);

        container.appendChild(table);

        // Add explanation
        const explanation = document.createElement("div");
        explanation.style.cssText = "margin-top: 2rem; padding: 1rem; background: #f5f5f5; border-radius: 4px; font-size: 0.9rem;";
        explanation.innerHTML = `
          <strong>How Rabbit Works:</strong><br>
          Win a hole outright to own the Rabbit. If the next hole is tied, you keep the Rabbit.
          Another player must win a hole to set the Rabbit free. Points awarded every 3 holes (6 total).
        `;
        container.appendChild(explanation);
      });
    })
    .catch(err => {
      console.error("Error loading Rabbit match:", err);
      container.innerHTML = '<p>Error loading match data. Please try again.</p>';
    });
}

function calculateRabbitWinners() {
  // Calculate who owns the rabbit after every 3 holes
  let rabbitOwner = null;
  let rabbitFree = true;

  for (let segment = 1; segment <= 6; segment++) {
    const startHole = (segment - 1) * 3 + 1;
    const endHole = segment * 3;

    rabbitOwner = null;
    rabbitFree = true;

    // Check each hole in this segment
    for (let hole = startHole; hole <= endHole; hole++) {
      const holeScores = [];

      golfers.forEach(golfer => {
        const select = document.querySelector(`select[data-hole="${hole}"][data-golfer="${golfer.id}"]`);
        if (select && select.value) {
          const gross = parseInt(select.value);
          const strokes = strokeMaps[golfer.id]?.[hole] || 0;
          const net = gross - strokes;
          holeScores.push({ golfer: golfer, net: net });
        }
      });

      // Check if all players have scored this hole
      if (holeScores.length === golfers.length) {
        // Find lowest net score
        const lowestNet = Math.min(...holeScores.map(s => s.net));
        const winners = holeScores.filter(s => s.net === lowestNet);

        // If one player won outright
        if (winners.length === 1) {
          if (rabbitFree) {
            // Rabbit was free, this player now owns it
            rabbitOwner = winners[0].golfer;
            rabbitFree = false;
          } else if (rabbitOwner && rabbitOwner.id !== winners[0].golfer.id) {
            // Different player won, rabbit is set free
            rabbitFree = true;
            rabbitOwner = null;
          } else if (!rabbitOwner) {
            // No one owned it, this player now owns it
            rabbitOwner = winners[0].golfer;
            rabbitFree = false;
          }
          // If the same player wins again, they keep the rabbit
        }
        // If tied, rabbit status doesn't change
      }
    }

    // Update the rabbit winner display for this segment
    const rabbitCell = document.getElementById(`rabbit-${endHole}`);
    if (rabbitCell) {
      if (rabbitOwner) {
        rabbitCell.textContent = `🐰 ${rabbitOwner.name} 🐰`;
        rabbitCell.style.cssText = "text-align: center; padding: 0.5rem; background: #4F2185; color: white; font-weight: bold; font-size: 1.2rem;";
      } else {
        rabbitCell.textContent = '🐰 Rabbit is Free! 🐰';
        rabbitCell.style.cssText = "text-align: center; padding: 0.5rem; background: #FFC62F; color: black; font-weight: bold; font-size: 1.2rem;";
      }
    }
  }
}

function startBestBallRound() {
  const team1p1 = document.getElementById('team1-player1').value;
  const team1p2 = document.getElementById('team1-player2').value;
  const team2p1 = document.getElementById('team2-player1').value;
  const team2p2 = document.getElementById('team2-player2').value;
  const courseId = document.getElementById('select-course').value;
  const teeId = document.getElementById('select-tee').value;
  const handicapPct = document.getElementById('handicap-slider').value;
  const message = document.getElementById('setup-message');

  // Validation
  if (!team1p1 || !team1p2 || !team2p1 || !team2p2) {
    message.textContent = 'Please select all players for both teams.';
    return;
  }

  if (!courseId) {
    message.textContent = 'Please select a course.';
    return;
  }

  if (!teeId) {
    message.textContent = 'Please select tees.';
    return;
  }

  // Check for duplicate players
  const players = [team1p1, team1p2, team2p1, team2p2];
  const uniquePlayers = new Set(players);
  if (uniquePlayers.size !== players.length) {
    message.textContent = 'Each player can only be selected once.';
    return;
  }

  message.style.color = '#2196F3';
  message.textContent = 'Creating round...';

  // Create the quick round in the database
  const quickRoundData = {
    team1_player1: parseInt(team1p1),
    team1_player2: parseInt(team1p2),
    team2_player1: parseInt(team2p1),
    team2_player2: parseInt(team2p2),
    course_id: parseInt(courseId),
    tee_id: parseInt(teeId),
    handicap_pct: parseFloat(handicapPct)
  };

  fetch(`${API_BASE_URL}/api/create_quick_round.php`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(quickRoundData),
    credentials: 'include'
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      message.style.color = 'green';
      message.innerHTML = `Round created! <strong>Share Code: ${data.match_code}</strong><br>Loading scorecard...`;

      // Store team info for display
      bestBallTeam1.player1 = allGolfers.find(g => g.golfer_id == team1p1);
      bestBallTeam1.player2 = allGolfers.find(g => g.golfer_id == team1p2);
      bestBallTeam2.player1 = allGolfers.find(g => g.golfer_id == team2p1);
      bestBallTeam2.player2 = allGolfers.find(g => g.golfer_id == team2p2);

      const selectedCourse = allCourses.find(c => c.course_id == courseId);
      const teeSelect = document.getElementById('select-tee');
      const selectedTeeOption = teeSelect.options[teeSelect.selectedIndex];
      const teeText = selectedTeeOption.text;

      // Store all data in sessionStorage
      sessionStorage.setItem('best_ball_tournament_id', data.tournament_id);
      sessionStorage.setItem('best_ball_round_id', data.round_id);
      sessionStorage.setItem('best_ball_match_id', data.match_id);
      sessionStorage.setItem('best_ball_match_code', data.match_code);
      sessionStorage.setItem('best_ball_team1', JSON.stringify(bestBallTeam1));
      sessionStorage.setItem('best_ball_team2', JSON.stringify(bestBallTeam2));
      sessionStorage.setItem('best_ball_course', JSON.stringify(selectedCourse));
      sessionStorage.setItem('best_ball_tee_id', teeId);
      sessionStorage.setItem('best_ball_tee_text', teeText);
      sessionStorage.setItem('best_ball_handicap_pct', handicapPct);

      // Load the scoring interface
      setTimeout(() => {
        loadBestBallScoring();
      }, 2000);
    } else {
      message.style.color = 'red';
      message.textContent = 'Error creating round: ' + (data.error || 'Unknown error');
    }
  })
  .catch(err => {
    console.error('Error creating quick round:', err);
    message.style.color = 'red';
    message.textContent = 'Error creating round. Please try again.';
  });
}

function loadBestBallScoring() {
  const matchId = sessionStorage.getItem('best_ball_match_id');
  const matchCode = sessionStorage.getItem('best_ball_match_code');

  if (!matchId) {
    console.error('No match ID found');
    return;
  }

  // Hide setup container and show scoring interface
  const setupContainer = document.getElementById('best-ball-setup');
  setupContainer.style.display = 'none';

  const appContent = document.getElementById('app-content');
  appContent.style.display = 'block';

  // Hide the navigation tabs for quick rounds
  const navElement = appContent.querySelector('nav');
  if (navElement) {
    navElement.style.display = 'none';
  }

  // Show the header with logout button for quick rounds
  const headerElement = appContent.querySelector('header');
  if (headerElement) {
    headerElement.style.display = 'block';

    // Hide tournament bar
    const tournamentBar = headerElement.querySelector('#tournament-bar');
    if (tournamentBar) {
      tournamentBar.style.display = 'none';
    }

    // Show user bar with match code
    const userBar = headerElement.querySelector('#user-bar');
    if (userBar) {
      userBar.style.display = 'flex';
      const userName = userBar.querySelector('#user-name');
      if (userName) {
        userName.textContent = matchCode ? `Match Code: ${matchCode}` : 'Quick Round';
      }
    }
  }

  const container = document.getElementById('score-entry-content');
  container.innerHTML = ''; // Clear any existing content

  // Fetch match data
  fetch(`${API_BASE_URL}/api/get_best_ball_match.php?match_id=${matchId}`)
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        container.innerHTML = `<p>Error loading match: ${data.error}</p>`;
        return;
      }

      const matchGolfers = data.match;
      holeInfo = data.holes;
      const match = matchGolfers[0];
      currentMatchId = match.match_id;
      tournamentHandicapPct = parseFloat(match.tournament_handicap_pct || 100);

      // Show match header with name
      const headerDiv = document.createElement('div');
      headerDiv.style.cssText = 'background: #4F2185; padding: 1rem; margin-bottom: 1rem; border-radius: 4px; text-align: center; color: white;';
      headerDiv.innerHTML = `
        <h2 style="margin: 0; color: white;">${match.match_name}</h2>
      `;
      container.appendChild(headerDiv);

      // Check if finalized
      if (match.finalized && parseInt(match.finalized) === 1) {
        loadBestBallScorecardReadOnly();
        return;
      }

      // Set up team colors and names for Best Ball calculation
      primaryTeamName = 'Team 1';
      secondaryTeamName = 'Team 2';
      primaryTeamColor = '#4F2185'; // Purple
      secondaryTeamColor = '#FFC62F'; // Gold
      primaryTeamId = 1;
      secondaryTeamId = 2;

      // Set up course data for handicap calculations
      courses = {
        course_name: match.course_name,
        slope: match.slope,
        rating: match.rating,
        par: match.par
      };

      // Calculate playing handicaps for all golfers
      const playingHandicaps = matchGolfers.map(row => ({
        golfer_id: row.golfer_id,
        playingHandicap: calculatePlayingHandicap(row.handicap)
      }));

      // Find the lowest playing handicap (for adjusted handicap calculation)
      const lowestHandicap = Math.min(...playingHandicaps.map(ph => ph.playingHandicap));

      // Build golfer list with adjusted handicaps (lowest player = 0, others adjusted down)
      golfers = [...new Set(matchGolfers.map(row => {
        const playingHandicap = playingHandicaps.find(ph => ph.golfer_id === row.golfer_id).playingHandicap;
        const adjustedHandicap = playingHandicap - lowestHandicap;
        return {
          id: row.golfer_id,
          name: row.first_name,
          lastName: row.last_name,
          team_id: row.team_id,
          team: row.team_id === 1 ? 'Team 1' : 'Team 2', // Add team name for calculateBestBallStatus
          handicap: adjustedHandicap,
        };
      }))];

      // Build stroke maps using adjusted handicaps
      strokeMaps = {};
      golfers.forEach(g => {
        strokeMaps[g.id] = buildStrokeMapForGolfer(g.handicap, holeInfo);
      });

      // Create score table
      const table = document.createElement("table");
      table.classList.add("score-table");

      // Build header row
      const header = document.createElement("tr");
      header.innerHTML = `<th></th><th>#</th><th>P</th><th>HI</th>` + golfers.map(golfer => {
        const bg = golfer.team_id === 1 ? '#4F2185' : '#FFC62F';
        const textColor = golfer.team_id === 1 ? '#fff' : '#000';
        const teamLabel = golfer.team_id === 1 ? 'Team 1' : 'Team 2';
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
              ${[...Array(12).keys()].map(n => `<option value="${n + 1}">${n + 1}</option>`).join("")}
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

        // Add Out subtotal row after hole 9
        if (i === 9) {
          const outRow = document.createElement("tr");
          outRow.classList.add("subtotal-row");
          const frontNinePar = holeInfo.filter(h => h.hole_number >= 1 && h.hole_number <= 9)
            .reduce((sum, hole) => sum + (hole.par || 0), 0);
          outRow.innerHTML = `<td></td><td>Out</td><td>${frontNinePar}</td><td></td>` + golfers.map(golfer => {
            return `<td class="out-subtotal-cell" data-golfer="${golfer.id}">–</td>`;
          }).join("");
          table.appendChild(outRow);
        }

        // Add In subtotal row after hole 18
        if (i === 18) {
          const inRow = document.createElement("tr");
          inRow.classList.add("subtotal-row");
          const backNinePar = holeInfo.filter(h => h.hole_number >= 10 && h.hole_number <= 18)
            .reduce((sum, hole) => sum + (hole.par || 0), 0);
          inRow.innerHTML = `<td></td><td>In</td><td>${backNinePar}</td><td></td>` + golfers.map(golfer => {
            return `<td class="in-subtotal-cell" data-golfer="${golfer.id}">–</td>`;
          }).join("");
          table.appendChild(inRow);
        }
      }

      // Add totals row
      const totalsRow = document.createElement("tr");
      totalsRow.id = "totals-row";
      totalsRow.innerHTML = `<td></td><td></td><td></td><td></td>` + golfers.map(g => {
        return `<td class="totals-cell" data-golfer="${g.id}">–</td>`;
      }).join("");
      table.appendChild(totalsRow);

      container.appendChild(table);

      // Add finalize button
      let finalizeButton = document.getElementById("finalize-results-btn");
      if (!finalizeButton) {
        finalizeButton = document.createElement("button");
        finalizeButton.id = "finalize-results-btn";
        finalizeButton.textContent = "Finalize Match Results";
        finalizeButton.style.display = "none";
        container.appendChild(finalizeButton);

        // Add click handler for finalize button
        finalizeButton.onclick = function() {
          const points = calculateMatchPoints();
          fetch(`${API_BASE_URL}/finalize_match_result.php`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              match_id: currentMatchId,
              points
            })
          })
          .then(res => res.json())
          .then(data => {
            if (data.success) {
              alert("Results finalized!");
              loadBestBallScoring(); // Reload to show read-only version
            } else {
              alert("Error finalizing results: " + (data.error || "Unknown error"));
            }
          });
        };
      }

      // Add handicap calculation explanation
      const handicapExplanation = document.createElement("div");
      handicapExplanation.style.cssText = "margin-top: 2rem; padding: 1rem; background: #f5f5f5; border-radius: 4px; font-size: 0.9rem;";
      handicapExplanation.innerHTML = `
        <strong>How Playing Handicap is Calculated:</strong><br>
        Each golfer's <b>playing handicap</b> is calculated according to USGA guidelines using the formula:<br>
        <code>(Handicap × (Slope / 113) + (Rating - 72)) * Round %</code><br>
      `;
      container.appendChild(handicapExplanation);

      // Load existing scores
      fetch(`${API_BASE_URL}/get_scores.php?match_id=${matchId}`, {
        credentials: 'include'
      })
      .then(res => res.json())
      .then(scores => {
        scores.forEach(score => {
          const selector = `select[data-hole="${score.hole_number}"][data-golfer="${score.golfer_id}"]`;
          const selectEl = document.querySelector(selector);
          if (selectEl) {
            selectEl.value = score.strokes;
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
        updateTotalScores();
        updateFinalizeButtonVisibility();
        calculateBestBallStatus(); // Calculate best ball results after loading scores
      });

      // Add score change listeners
      table.querySelectorAll("select").forEach(select => {
        select.addEventListener("change", function () {
          const strokes = this.value;
          const hole = this.dataset.hole;
          const golfer_id = this.dataset.golfer;

          if (!strokes || !golfer_id || !hole) return;

          const payload = {
            match_id: matchId,
            golfer_id: parseInt(golfer_id),
            hole: parseInt(hole),
            strokes: parseInt(strokes)
          };

          fetch(`${API_BASE_URL}/save_score.php`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            credentials: 'include'
          })
          .then(res => res.json())
          .then(data => {
            if (data.success) {
              updateTotalScores();
              updateFinalizeButtonVisibility();
              updateScoreCellClasses();
              calculateBestBallStatus(); // Update best ball results after score change
            } else {
              console.error("Save failed:", data.message);
            }
          })
          .catch(err => console.error("Fetch error:", err));
        });
      });
    })
    .catch(err => {
      console.error("Error loading Best Ball match:", err);
      container.innerHTML = '<p>Error loading match data. Please try again.</p>';
    });
}

function loadBestBallScorecardReadOnly() {
  const matchId = sessionStorage.getItem('best_ball_match_id');
  const matchCode = sessionStorage.getItem('best_ball_match_code');

  if (!matchId) {
    console.error('No match ID found');
    return;
  }

  // Hide setup container and show scoring interface
  const setupContainer = document.getElementById('best-ball-setup');
  setupContainer.style.display = 'none';

  const appContent = document.getElementById('app-content');
  appContent.style.display = 'block';

  // Hide the navigation tabs for quick rounds
  const navElement = appContent.querySelector('nav');
  if (navElement) {
    navElement.style.display = 'none';
  }

  // Show the header with logout button for quick rounds
  const headerElement = appContent.querySelector('header');
  if (headerElement) {
    headerElement.style.display = 'block';

    // Hide tournament bar
    const tournamentBar = headerElement.querySelector('#tournament-bar');
    if (tournamentBar) {
      tournamentBar.style.display = 'none';
    }

    // Show user bar with match code
    const userBar = headerElement.querySelector('#user-bar');
    if (userBar) {
      userBar.style.display = 'flex';
      const userName = userBar.querySelector('#user-name');
      if (userName) {
        userName.textContent = matchCode ? `Match Code: ${matchCode}` : 'Quick Round';
      }
    }
  }

  const container = document.getElementById('score-entry-content');
  container.innerHTML = ''; // Clear any existing content

  // Fetch match data
  fetch(`${API_BASE_URL}/api/get_best_ball_match.php?match_id=${matchId}`)
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        container.innerHTML = `<p>Error loading match: ${data.error}</p>`;
        return;
      }

      const matchGolfers = data.match;
      holeInfo = data.holes;
      const match = matchGolfers[0];
      currentMatchId = match.match_id;
      tournamentHandicapPct = parseFloat(match.tournament_handicap_pct || 100);

      // Show match header with name
      const headerDiv = document.createElement('div');
      headerDiv.style.cssText = 'background: #4F2185; padding: 1rem; margin-bottom: 1rem; border-radius: 4px; text-align: center; color: white;';
      headerDiv.innerHTML = `
        <h2 style="margin: 0; color: white;">${match.match_name}</h2>
        <p style="margin: 0.5rem 0 0 0; color: white; font-size: 1.1rem;">Match Finalized</p>
      `;
      container.appendChild(headerDiv);

      // Set up team colors and names for Best Ball calculation
      primaryTeamName = 'Team 1';
      secondaryTeamName = 'Team 2';
      primaryTeamColor = '#4F2185'; // Purple
      secondaryTeamColor = '#FFC62F'; // Gold
      primaryTeamId = 1;
      secondaryTeamId = 2;

      courses = {
        course_name: match.course_name,
        slope: match.slope,
        rating: match.rating,
        par: match.par
      };

      // Calculate playing handicaps for all golfers
      const playingHandicaps = matchGolfers.map(row => ({
        golfer_id: row.golfer_id,
        playingHandicap: calculatePlayingHandicap(row.handicap)
      }));

      // Find the lowest playing handicap (for adjusted handicap calculation)
      const lowestHandicap = Math.min(...playingHandicaps.map(ph => ph.playingHandicap));

      // Build golfer list with adjusted handicaps (lowest player = 0, others adjusted down)
      golfers = [...new Set(matchGolfers.map(row => {
        const playingHandicap = playingHandicaps.find(ph => ph.golfer_id === row.golfer_id).playingHandicap;
        const adjustedHandicap = playingHandicap - lowestHandicap;
        return {
          id: row.golfer_id,
          name: row.first_name,
          lastName: row.last_name,
          team_id: row.team_id,
          team: row.team_id === 1 ? 'Team 1' : 'Team 2',
          handicap: adjustedHandicap,
        };
      }))];

      // Build stroke maps using adjusted handicaps
      strokeMaps = {};
      golfers.forEach(g => {
        strokeMaps[g.id] = buildStrokeMapForGolfer(g.handicap, holeInfo);
      });

      // Build table
      const table = document.createElement("table");
      table.classList.add("score-table");

      // Header
      const header = document.createElement("tr");
      header.innerHTML = `<th></th><th>#</th><th>P</th><th>HI</th>` + golfers.map(golfer => {
        let bgColor = golfer.team_id === 1 ? primaryTeamColor : secondaryTeamColor;
        let txtColor = golfer.team_id === 1 ? '#fff' : '#000';
        return `<th style="background-color: ${bgColor}; color: ${txtColor};">${golfer.name} (${parseFloat(golfer.handicap).toFixed(1)})</th>`;
      }).join("");
      table.appendChild(header);

      // Score rows
      for (let i = 1; i <= 18; i++) {
        const row = document.createElement("tr");
        const par = holeInfo.find(h => h.hole_number === i)?.par || "-";
        const index = holeInfo.find(h => h.hole_number === i)?.handicap_index || "-";
        row.innerHTML = `<td class="match-result-cell" data-hole="${i}"></td><td>${i}</td><td>${par}</td><td>${index}</td>` + golfers.map(golfer => {
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

        // Add Out subtotal row after hole 9
        if (i === 9) {
          const outRow = document.createElement("tr");
          outRow.classList.add("subtotal-row");
          const frontNinePar = holeInfo.filter(h => h.hole_number >= 1 && h.hole_number <= 9)
            .reduce((sum, hole) => sum + (hole.par || 0), 0);
          outRow.innerHTML = `<td></td><td>Out</td><td>${frontNinePar}</td><td></td>` + golfers.map(golfer => {
            return `<td class="out-subtotal-cell-readonly" data-golfer="${golfer.id}">–</td>`;
          }).join("");
          table.appendChild(outRow);
        }

        // Add In subtotal row after hole 18
        if (i === 18) {
          const inRow = document.createElement("tr");
          inRow.classList.add("subtotal-row");
          const backNinePar = holeInfo.filter(h => h.hole_number >= 10 && h.hole_number <= 18)
            .reduce((sum, hole) => sum + (hole.par || 0), 0);
          inRow.innerHTML = `<td></td><td>In</td><td>${backNinePar}</td><td></td>` + golfers.map(golfer => {
            return `<td class="in-subtotal-cell-readonly" data-golfer="${golfer.id}">–</td>`;
          }).join("");
          table.appendChild(inRow);
        }
      }

      // Totals row
      const totalsRow = document.createElement("tr");
      totalsRow.id = "totals-row";
      totalsRow.innerHTML = `<td></td><td></td><td></td><td></td>` + golfers.map(g => {
        return `<td class="totals-cell" data-golfer="${g.id}">–</td>`;
      }).join("");
      table.appendChild(totalsRow);

      container.appendChild(table);

      // Add handicap calculation explanation
      const handicapExplanation = document.createElement("div");
      handicapExplanation.style.cssText = "margin-top: 2rem; padding: 1rem; background: #f5f5f5; border-radius: 4px; font-size: 0.9rem;";
      handicapExplanation.innerHTML = `
        <strong>How Playing Handicap is Calculated:</strong><br>
        Each golfer's <b>course handicap</b> is calculated according to USGA guidelines using the formula:<br>
        <code>(Handicap × (Slope / 113) + (Rating - 72))</code><br>
      `;
      container.appendChild(handicapExplanation);

      // Fetch scores
      fetch(`${API_BASE_URL}/get_scores.php?match_id=${matchId}`, { credentials: 'include' })
        .then(res => res.json())
        .then(scores => {
          scores.forEach(score => {
            const cell = document.querySelector(`td.readonly-score-cell[data-hole="${score.hole_number}"][data-golfer="${score.golfer_id}"]`);
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
    })
    .catch(err => {
      console.error("Error loading Best Ball match:", err);
      container.innerHTML = '<p>Error loading match data. Please try again.</p>';
    });
}

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
    fetch(`${API_BASE_URL}/keep_alive.php`, { credentials: 'include' })
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
fetch(`${API_BASE_URL}/check_session.php`, {
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
      fetch(`${API_BASE_URL}/api/tournament_teams.php?tournament_id=${tournamentId}&_=${Date.now()}`, {
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
    
    fetch(`${API_BASE_URL}/get_match_by_round.php`, { credentials: 'include' })
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
    const modeSelect       = document.getElementById('selectMode');
    const roundTypeSelect  = document.getElementById('selectRoundType');

    // Handle mode selection
    const quickRoundOptions = document.getElementById('quick-round-options');
    const joinCodeSection = document.getElementById('join-code-section');
    const quickRoundOptionSelect = document.getElementById('selectQuickRoundOption');
    const roundHistoryBtn = document.getElementById('round-history-btn');

    modeSelect.addEventListener('change', function() {
      const selectedMode = this.value;

      if (selectedMode === 'tournament') {
        // Show tournament mode fields
        playerSelect.style.display = 'block';
        roundSelect.style.display = 'block';
        roundSelect.required = true;
        quickRoundOptions.style.display = 'none';
        joinCodeSection.style.display = 'none';
        roundTypeSelect.style.display = 'none';
        roundTypeSelect.required = false;
        roundHistoryBtn.style.display = 'none';
      } else if (selectedMode === 'quick') {
        // Show quick round options, hide tournament fields
        playerSelect.style.display = 'none';
        roundSelect.style.display = 'none';
        roundSelect.required = false;
        quickRoundOptions.style.display = 'block';
        joinCodeSection.style.display = 'none';
        roundTypeSelect.style.display = 'none';
        roundTypeSelect.required = false;
        roundHistoryBtn.style.display = 'block';
      } else {
        // No mode selected, hide everything
        playerSelect.style.display = 'none';
        roundSelect.style.display = 'none';
        roundSelect.required = false;
        quickRoundOptions.style.display = 'none';
        joinCodeSection.style.display = 'none';
        roundTypeSelect.style.display = 'none';
        roundTypeSelect.required = false;
        roundHistoryBtn.style.display = 'none';
      }
    });

    // Handle quick round option selection (Create New vs Join Existing)
    quickRoundOptionSelect.addEventListener('change', function() {
      const selectedOption = this.value;

      if (selectedOption === 'create') {
        roundTypeSelect.style.display = 'block';
        roundTypeSelect.required = true;
        joinCodeSection.style.display = 'none';
      } else if (selectedOption === 'join') {
        roundTypeSelect.style.display = 'none';
        roundTypeSelect.required = false;
        joinCodeSection.style.display = 'block';
      } else {
        roundTypeSelect.style.display = 'none';
        roundTypeSelect.required = false;
        joinCodeSection.style.display = 'none';
      }
    });

    console.log('About to fetch golfers from:', `${API_BASE_URL}/get_golfers.php`);
    fetch(`${API_BASE_URL}/get_golfers.php`)
        .then(response => {
          console.log('Golfers response status:', response.status);
          console.log('Golfers response headers:', response.headers.get('content-type'));
          return response.json();
        })
        .then(golfers => {
          console.log('Golfers data received:', golfers);
          allGolfers = golfers; // Save for later lookup
          // Populate the dropdown
          const playerSelect = document.getElementById('chooseUser');
          playerSelect.innerHTML = '<option value="">-- Choose Golfer --</option>';
          golfers.forEach(golfer => {
            const option = document.createElement('option');
            option.value = golfer.golfer_id;
            option.text = `${golfer.first_name} ${golfer.last_name}`;
            playerSelect.appendChild(option);
          });
        })
        .catch(err => {
          console.error("Error fetching golfers:", err);
          console.error("Error details:", err.message);
        });
    

    const tid = 1;
    console.log('About to fetch rounds from:', `${API_BASE_URL}/get_rounds_and_players.php?tournament_id=${tid}`);
    fetch(`${API_BASE_URL}/get_rounds_and_players.php?tournament_id=${tid}`, {
        credentials: 'include'
      })
      .then(res => {
        console.log('Rounds response status:', res.status);
        return res.json();
      })
      .then(data => {
        console.log('Rounds data received:', data);
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
   
    
  fetch(`${API_BASE_URL}/get_match_by_round.php`, { credentials: 'include' })
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
                ${[...Array(12).keys()].map(n => `<option value="${n + 1}">${n + 1}</option>`).join("")}
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
        
        // Add Out subtotal row after hole 9
        if (i === 9) {
          const outRow = document.createElement("tr");
          outRow.classList.add("subtotal-row");
          
          // Calculate front 9 par total
          const frontNinePar = holeInfo.filter(h => h.hole_number >= 1 && h.hole_number <= 9)
            .reduce((sum, hole) => sum + (hole.par || 0), 0);
          
          outRow.innerHTML = `<td></td><td>Out</td><td>${frontNinePar}</td><td></td>` + golfers.map(golfer => {
            return `<td class="out-subtotal-cell" data-golfer="${golfer.id}">–</td>`;
          }).join("");
          table.appendChild(outRow);
        }
        
        // Add In subtotal row after hole 18
        if (i === 18) {
          const inRow = document.createElement("tr");
          inRow.classList.add("subtotal-row");
          
          // Calculate back 9 par total
          const backNinePar = holeInfo.filter(h => h.hole_number >= 10 && h.hole_number <= 18)
            .reduce((sum, hole) => sum + (hole.par || 0), 0);
          
          inRow.innerHTML = `<td></td><td>In</td><td>${backNinePar}</td><td></td>` + golfers.map(golfer => {
            return `<td class="in-subtotal-cell" data-golfer="${golfer.id}">–</td>`;
          }).join("");
          table.appendChild(inRow);
        }
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
        fetch(`${API_BASE_URL}/finalize_match_result.php`, {
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
      
      fetch(`${API_BASE_URL}/get_scores.php?match_id=${data.match[0].match_id}`, {
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
  const totals = {}; // golfer_id -> { strokes: 0, toPar: 0, outStrokes: 0, outToPar: 0, inStrokes: 0, inToPar: 0 }

  golfers.forEach(golfer => {
    totals[golfer.id] = { strokes: 0, toPar: 0, outStrokes: 0, outToPar: 0, inStrokes: 0, inToPar: 0 };
  });

  document.querySelectorAll("select[data-hole][data-golfer]").forEach(select => {
    const strokes = parseInt(select.value);
    const hole = parseInt(select.dataset.hole);
    const golferId = parseInt(select.dataset.golfer);

    const par = holeInfo.find(h => h.hole_number === hole)?.par || 0;

    if (!isNaN(strokes)) {
      totals[golferId].strokes += strokes;
      totals[golferId].toPar += (strokes - par);
      
      // Front 9 (Out)
      if (hole >= 1 && hole <= 9) {
        totals[golferId].outStrokes += strokes;
        totals[golferId].outToPar += (strokes - par);
      }
      // Back 9 (In)
      else if (hole >= 10 && hole <= 18) {
        totals[golferId].inStrokes += strokes;
        totals[golferId].inToPar += (strokes - par);
      }
    }
  });

  for (let golferId in totals) {
    const { strokes, toPar, outStrokes, outToPar, inStrokes, inToPar } = totals[golferId];

    // Update total scores
    const totalCell = document.querySelector(`.totals-cell[data-golfer="${golferId}"]`);
    if (totalCell) {
      const display = toPar === 0
        ? `${strokes} (E)`
        : `${strokes} (${toPar > 0 ? "+" : ""}${toPar})`;
      totalCell.textContent = display;
    }

    // Update Out subtotal
    const outCell = document.querySelector(`.out-subtotal-cell[data-golfer="${golferId}"]`);
    if (outCell && outStrokes > 0) {
      const outDisplay = outToPar === 0
        ? `${outStrokes} (E)`
        : `${outStrokes} (${outToPar > 0 ? "+" : ""}${outToPar})`;
      outCell.textContent = outDisplay;
    }

    // Update In subtotal
    const inCell = document.querySelector(`.in-subtotal-cell[data-golfer="${golferId}"]`);
    if (inCell && inStrokes > 0) {
      const inDisplay = inToPar === 0
        ? `${inStrokes} (E)`
        : `${inStrokes} (${inToPar > 0 ? "+" : ""}${inToPar})`;
      inCell.textContent = inDisplay;
    }
  }
}




// functionality for Today Tab
function loadTodaySummary() {
    
  fetch(`${API_BASE_URL}/get_round_matches.php`, { credentials: 'include' })
    .then(res => res.json())
    .then(matches => {
      const container = document.getElementById("today-summary");
      container.innerHTML = "";

      if (!Array.isArray(matches) || matches.length === 0) {
        container.textContent = "No matches found. Try logging out and reloading the app.";
        return;
      }
      
      container.innerHTML = "<h3>Matches (click match to see scorecard)</h3>";
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
            
            // Fetch and render skins - the API now returns both skins data and skins_total
            fetch(`${API_BASE_URL}/get_individual_skins.php`, { credentials: 'include' })
              .then(res => res.json())
              .then(data => {
                // Handle both new format (object with skins and skins_total) and old format (array)
                const skins = Array.isArray(data) ? data : (data.skins || []);
                const skinsTotal = data.skins_total || 450; // fallback to 450 if not set
                
                skinsContainer.innerHTML = `<h3>Individual Skins (handicap counts for 0.5, total purse $${skinsTotal})</h3>`;
                
                if (!Array.isArray(skins) || skins.length === 0) {
                  skinsContainer.innerHTML += "<p>No skins awarded yet.</p>";
                  return;
                }
            
                const table = document.createElement("table");
                table.classList.add("skins-table");
            
                const header = document.createElement("tr");
                header.innerHTML = "<th>Hole</th><th>Player</th><th>Team</th><th>Net Score</th><th>$</th>";
                table.appendChild(header);
            
                // Calculate skin value using dynamic skins total
                const skinValue = skins.length > 0 ? (skinsTotal / skins.length).toFixed(2) : "0.00";
            
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
                    <td>$${skinValue}</td>
                  `;
                  table.appendChild(row);
                });
            
                skinsContainer.innerHTML = `<h3>Individual Skins (handicap counts for 0.5, total purse $${skinsTotal})</h3>`;
                skinsContainer.appendChild(table);
              })
              .catch(err => {
                console.error("Error loading skins:", err);
                skinsContainer.innerHTML += "<p>Error loading skins.</p>";
              });
              
        fetch(`${API_BASE_URL}/get_gross_leaderboard.php`, { credentials: 'include' })
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
        fetch(`${API_BASE_URL}/get_net_leaderboard.php`, { credentials: 'include' })
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

    // Check if match is already decided after each hole
    const holesRemaining = 18 - holesPlayed;
    if (Math.abs(differential) > holesRemaining) {
      const margin = Math.abs(differential);
      const closedOut = holesRemaining;
      const winner = differential > 0 ? primaryTeamName : secondaryTeamName;
      return `Team ${winner} wins ${margin}&${closedOut}`;
    }
  }

  if (holesPlayed === 0) return "No scores yet";

  // If we get here, no team has won yet
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
    
    // Check if scoreboard is an array, if not, create an empty array or handle the error
    if (!Array.isArray(scoreboard)) {
        console.error("Scoreboard data is not an array:", scoreboard);
        totalScore.innerHTML = '<div>No scoreboard data available</div>';
        parentContainer.appendChild(totalScore);
        return;
    }
    
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
  const { container, body } = createWidgetContainer('Matchups and Tee Times (click row to see scorecard)', 'tournament-rounds-table-container');
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
            
            // Make the row clickable if there's a match_id
            if (match.match_id) {
                row.dataset.matchId = match.match_id;
                row.style.cursor = 'pointer';
                row.title = "Click to view scorecard";
                
                // The parentContainer is the div#tournament
                row.addEventListener('click', () => {
                    parentContainer.innerHTML = '<h2>Loading Scorecard...</h2>';
                    // Pass the container's ID to loadMatchScorecard
                    loadMatchScorecard(match.match_id, parentContainer.id); 
                });
            }

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
            fetch(`${API_BASE_URL}/get_tournament_scoreboard.php`, { credentials: 'include' }).then(res => res.json()),
            fetch(`${API_BASE_URL}/get_gross_leaderboard_all.php`, { credentials: 'include' }).then(res => res.json()),
            fetch(`${API_BASE_URL}/get_net_leaderboard_all.php`, { credentials: 'include' }).then(res => res.json()),
            fetch(`${API_BASE_URL}/get_tournament_rounds.php?tournament_id=${tournamentId}`, { credentials: 'include' }).then(res => res.json()),
            // The handicap table needs two fetches, so we wrap them in their own Promise.all
            Promise.all([
                fetch(`${API_BASE_URL}/get_tournament_courses.php?tournament_id=${tournamentId}`, { credentials: 'include' }).then(res => res.json()),
                fetch(`${API_BASE_URL}/get_tournament_golfers.php?tournament_id=${tournamentId}`, { credentials: 'include' }).then(res => res.json())
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
  fetch(`${API_BASE_URL}/get_match_by_id.php?match_id=${match_id}`, { credentials: 'include' })
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
        
        // Add Out subtotal row after hole 9
        if (i === 9) {
          const outRow = document.createElement("tr");
          outRow.classList.add("subtotal-row");
          
          // Calculate front 9 par total
          const frontNinePar = holeInfo.filter(h => h.hole_number >= 1 && h.hole_number <= 9)
            .reduce((sum, hole) => sum + (hole.par || 0), 0);
          
          outRow.innerHTML = `<td></td><td>Out</td><td>${frontNinePar}</td><td></td>` + golfers.map(golfer => {
            return `<td class="out-subtotal-cell-readonly" data-golfer="${golfer.id}">–</td>`;
          }).join("");
          table.appendChild(outRow);
        }
        
        // Add In subtotal row after hole 18
        if (i === 18) {
          const inRow = document.createElement("tr");
          inRow.classList.add("subtotal-row");
          
          // Calculate back 9 par total
          const backNinePar = holeInfo.filter(h => h.hole_number >= 10 && h.hole_number <= 18)
            .reduce((sum, hole) => sum + (hole.par || 0), 0);
          
          inRow.innerHTML = `<td></td><td>In</td><td>${backNinePar}</td><td></td>` + golfers.map(golfer => {
            return `<td class="in-subtotal-cell-readonly" data-golfer="${golfer.id}">–</td>`;
          }).join("");
          table.appendChild(inRow);
        }
      }

      // Totals row
      const totalsRow = document.createElement("tr");
      totalsRow.innerHTML = `<td></td><td></td><td></td><td></td>` + golfers.map(g => {
        return `<td class="totals-cell" data-golfer="${g.id}">–</td>`;
      }).join("");
      table.appendChild(totalsRow);

      container.appendChild(table);
    
      // Fetch scores
      fetch(`${API_BASE_URL}/get_scores.php?match_id=${match_id}`, { credentials: 'include' })
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
  const outTotals = {};  // golfer_id => front 9 total strokes
  const outParTotals = {}; // golfer_id => front 9 total par
  const inTotals = {};   // golfer_id => back 9 total strokes
  const inParTotals = {}; // golfer_id => back 9 total par

  // Initialize
  golfers.forEach(g => {
    totals[g.id] = 0;
    parTotals[g.id] = 0;
    outTotals[g.id] = 0;
    outParTotals[g.id] = 0;
    inTotals[g.id] = 0;
    inParTotals[g.id] = 0;
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
      const parValue = parseInt(par) || 0;
      parTotals[golferId] += parValue;

      // Front 9 (Out)
      if (hole >= 1 && hole <= 9) {
        outTotals[golferId] += strokes;
        outParTotals[golferId] += parValue;
      }
      // Back 9 (In)
      else if (hole >= 10 && hole <= 18) {
        inTotals[golferId] += strokes;
        inParTotals[golferId] += parValue;
      }
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

    // Update Out subtotal
    const outCell = document.querySelector(`.out-subtotal-cell-readonly[data-golfer="${golferId}"]`);
    if (outCell && outTotals[golferId] > 0) {
      const outToPar = outTotals[golferId] - outParTotals[golferId];
      const outToParText = outToPar === 0 ? "E" : (outToPar > 0 ? `+${outToPar}` : `${outToPar}`);
      outCell.textContent = `${outTotals[golferId]} (${outToParText})`;
    }

    // Update In subtotal
    const inCell = document.querySelector(`.in-subtotal-cell-readonly[data-golfer="${golferId}"]`);
    if (inCell && inTotals[golferId] > 0) {
      const inToPar = inTotals[golferId] - inParTotals[golferId];
      const inToParText = inToPar === 0 ? "E" : (inToPar > 0 ? `+${inToPar}` : `${inToPar}`);
      inCell.textContent = `${inTotals[golferId]} (${inToParText})`;
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
    // Account for subtotal rows: hole 10+ need to skip the Out row, hole 1+ need to account for header
    let rowIndex = hole + 1; // +1 for header row
    if (hole >= 10) rowIndex += 1; // +1 for Out subtotal row after hole 9
    
    const holeCell = document.querySelector(`.score-table tr:nth-child(${rowIndex}) td:first-child`);
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
  fetch(`${API_BASE_URL}/get_scores.php?match_id=${currentMatchId}`, {
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
    // Account for subtotal rows: hole 10+ need to skip the Out row, hole 1+ need to account for header
    let rowIndex = hole + 1; // +1 for header row
    if (hole >= 10) rowIndex += 1; // +1 for Out subtotal row after hole 9
    
    const holeCell = document.querySelector(`.score-table tr:nth-child(${rowIndex}) td:first-child`);
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


// Load quick round history
function loadQuickRoundHistory() {
  const historyContainer = document.getElementById('round-history-container');
  const historyContent = document.getElementById('round-history-content');
  const authContainer = document.getElementById('auth-container');

  // Hide auth container, show history container
  authContainer.style.display = 'none';
  historyContainer.style.display = 'block';
  historyContent.innerHTML = '<p>Loading...</p>';

  fetch(`${API_BASE_URL}/api/get_quick_round_history.php`, {
    credentials: 'include'
  })
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        historyContent.innerHTML = `<p>Error: ${data.error}</p>`;
        return;
      }

      if (!data.matches || data.matches.length === 0) {
        historyContent.innerHTML = '<p>No quick rounds found.</p>';
        return;
      }

      // Build the match list
      let html = '<div style="display: flex; flex-direction: column; gap: 1rem;">';

      data.matches.forEach(match => {
        const statusBadge = match.finalized === '1' ?
          '<span style="background: #4CAF50; color: white; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.85rem;">Finalized</span>' :
          '<span style="background: #FFC107; color: black; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.85rem;">In Progress</span>';

        const roundTypeColor = match.round_name === 'Best Ball' ? '#4F2185' :
                               match.round_name === 'Rabbit' ? '#FF5722' :
                               match.round_name === 'Wolf' ? '#2196F3' : '#666';

        html += `
          <div class="match-history-card" data-match-id="${match.match_id}" data-round-name="${match.round_name}"
               style="border: 1px solid #ddd; padding: 1rem; border-radius: 8px; cursor: pointer; background: white; transition: all 0.2s;"
               onmouseover="this.style.boxShadow='0 4px 8px rgba(0,0,0,0.1)'; this.style.transform='translateY(-2px)';"
               onmouseout="this.style.boxShadow='none'; this.style.transform='translateY(0)';">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
              <h3 style="margin: 0; font-size: 1.1rem;">${match.match_name}</h3>
              ${statusBadge}
            </div>
            <div style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem;">
              <span style="background: ${roundTypeColor}; color: white; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.85rem;">${match.round_name}</span>
              <span style="background: #666; color: white; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.85rem; font-family: monospace;">Code: ${match.match_code}</span>
            </div>
            <p style="margin: 0.5rem 0; color: #666; font-size: 0.9rem;">${match.participants}</p>
          </div>
        `;
      });

      html += '</div>';
      historyContent.innerHTML = html;

      // Add click event listeners to each card
      document.querySelectorAll('.match-history-card').forEach(card => {
        card.addEventListener('click', () => {
          const matchId = card.dataset.matchId;
          const roundName = card.dataset.roundName;
          loadQuickRoundFromHistory(matchId, roundName);
        });
      });
    })
    .catch(err => {
      console.error('Error loading quick round history:', err);
      historyContent.innerHTML = '<p>Error loading history. Please try again.</p>';
    });
}

// Load a specific quick round match from history (read-only)
function loadQuickRoundFromHistory(matchId, roundName) {
  // Hide history container
  document.getElementById('round-history-container').style.display = 'none';

  // Store the match info in sessionStorage
  if (roundName === 'Best Ball') {
    sessionStorage.setItem('best_ball_match_id', matchId);
    loadBestBallScorecardReadOnly();
  } else if (roundName === 'Rabbit') {
    sessionStorage.setItem('rabbit_match_id', matchId);
    loadRabbitScorecardReadOnly();
  } else if (roundName === 'Wolf') {
    sessionStorage.setItem('wolf_match_id', matchId);
    loadWolfScorecardReadOnly();
  }
}

// Go back from history to auth screen
function goBackFromHistory() {
  // Clear any session storage from viewing historical matches
  sessionStorage.removeItem('best_ball_match_id');
  sessionStorage.removeItem('rabbit_match_id');
  sessionStorage.removeItem('wolf_match_id');

  document.getElementById('round-history-container').style.display = 'none';
  document.getElementById('auth-container').style.display = 'flex';
}

// Authentication handling
document.addEventListener('DOMContentLoaded', () => {
  const authForm = document.getElementById('auth-form');
  const appContent = document.getElementById('app-content');
  const authMessage = document.getElementById('auth-message');

  // Check for existing Best Ball, Rabbit, or Wolf session
  const existingBestBallMatchId = sessionStorage.getItem('best_ball_match_id');
  const existingRabbitMatchId = sessionStorage.getItem('rabbit_match_id');
  const existingWolfMatchId = sessionStorage.getItem('wolf_match_id');

  if (existingBestBallMatchId) {
    // Restore Best Ball session
    document.getElementById('auth-container').style.display = 'none';
    loadBestBallScoring();
    return; // Exit early, skip form setup
  }

  if (existingRabbitMatchId) {
    // Restore Rabbit session
    document.getElementById('auth-container').style.display = 'none';
    loadRabbitScoring();
    return; // Exit early, skip form setup
  }

  if (existingWolfMatchId) {
    // Restore Wolf session
    document.getElementById('auth-container').style.display = 'none';
    loadWolfScoring();
    return; // Exit early, skip form setup
  }

    // Add event listeners for Round History functionality
    const roundHistoryBtn = document.getElementById('round-history-btn');
    const backFromHistoryBtn = document.getElementById('back-from-history-btn');

    if (roundHistoryBtn) {
      roundHistoryBtn.addEventListener('click', () => {
        loadQuickRoundHistory();
      });
    }

    if (backFromHistoryBtn) {
      backFromHistoryBtn.addEventListener('click', () => {
        goBackFromHistory();
      });
    }

    authForm.addEventListener('submit', (event) => {
      event.preventDefault();

      const selectedMode = document.getElementById('selectMode').value;

      // Check which mode was selected
      if (selectedMode === 'quick') {
        const quickRoundOption = document.getElementById('selectQuickRoundOption').value;

        if (!quickRoundOption) {
          authMessage.textContent = 'Please choose Create New or Join Existing.';
          return;
        }

        // Handle Join Existing
        if (quickRoundOption === 'join') {
          const joinCode = document.getElementById('join-code-input').value.trim();

          if (!joinCode || joinCode.length !== 4 || isNaN(joinCode)) {
            authMessage.textContent = 'Please enter a valid 4-digit code.';
            return;
          }

          authMessage.textContent = 'Finding match...';

          // Fetch match by code
          fetch(`${API_BASE_URL}/api/get_match_by_code.php?code=${joinCode}`, {
            credentials: 'include'
          })
          .then(res => res.json())
          .then(data => {
            if (data.success && data.match_id) {
              // Check round_name to determine match type
              const roundName = data.round_name || 'Best Ball';

              document.getElementById('auth-container').style.display = 'none';

              if (roundName === 'Rabbit') {
                // Store Rabbit match info
                sessionStorage.setItem('rabbit_match_id', data.match_id);
                sessionStorage.setItem('rabbit_tournament_id', data.tournament_id);
                sessionStorage.setItem('rabbit_round_id', data.round_id);
                sessionStorage.setItem('rabbit_match_code', joinCode);
                loadRabbitScoring();
              } else if (roundName === 'Wolf') {
                // Store Wolf match info
                sessionStorage.setItem('wolf_match_id', data.match_id);
                sessionStorage.setItem('wolf_tournament_id', data.tournament_id);
                sessionStorage.setItem('wolf_round_id', data.round_id);
                sessionStorage.setItem('wolf_match_code', joinCode);
                loadWolfScoring();
              } else {
                // Default to Best Ball
                sessionStorage.setItem('best_ball_match_id', data.match_id);
                sessionStorage.setItem('best_ball_tournament_id', data.tournament_id);
                sessionStorage.setItem('best_ball_round_id', data.round_id);
                sessionStorage.setItem('best_ball_match_code', joinCode);
                loadBestBallScoring();
              }
            } else {
              authMessage.textContent = 'Invalid code. Please try again.';
            }
          })
          .catch(err => {
            console.error('Error joining match:', err);
            authMessage.textContent = 'Error joining match. Please try again.';
          });

          return;
        }

        // Handle Create New
        const roundType = document.getElementById('selectRoundType').value;

        if (!roundType) {
          authMessage.textContent = 'Please select a round type.';
          return;
        }

        // Store the round type in session storage
        sessionStorage.setItem('quick_round_type', roundType);

        // Handle different round types
        if (roundType === 'best-ball') {
          // Hide auth container and show best ball setup
          document.getElementById('auth-container').style.display = 'none';
          loadBestBallSetup();
          return;
        }

        if (roundType === 'rabbit') {
          // Hide auth container and show rabbit setup
          document.getElementById('auth-container').style.display = 'none';
          loadRabbitSetup();
          return;
        }

        if (roundType === 'wolf') {
          // Hide auth container and show wolf setup
          document.getElementById('auth-container').style.display = 'none';
          loadWolfSetup();
          return;
        }
      }

      // Tournament mode handling (existing logic)
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

    
      fetch(`${API_BASE_URL}/authenticate.php`, {
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
          fetch(`${API_BASE_URL}/get_match_by_round.php`, { credentials: 'include' })
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
          fetch(`${API_BASE_URL}/api/tournament_teams.php?tournament_id=${tournamentId}&_=${Date.now()}`, {
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
  fetch(`${API_BASE_URL}/logout.php`, {
    method: 'POST',
    credentials: 'include'
  }).then(() => {
    sessionStorage.clear();

    // Hide all containers
    document.getElementById('app-content').style.display = 'none';
    document.getElementById('round-history-container').style.display = 'none';
    document.getElementById('best-ball-setup').style.display = 'none';

    // Show auth container
    document.getElementById('auth-container').style.display = 'flex';

    // Reset form
    document.getElementById('auth-form').reset();
    document.getElementById('selectMode').dispatchEvent(new Event('change'));
  });
});




