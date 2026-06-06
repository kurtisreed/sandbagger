// Configure API base URL for mobile vs web
let API_BASE_URL = '';

function initializeApiUrl() {
  const cap = window.Capacitor;
  const isCapacitorApp = cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform();
  const platform = cap && typeof cap.getPlatform === 'function' ? cap.getPlatform() : 'web';

  if (isCapacitorApp) {
    API_BASE_URL = 'https://sandbaggerscoring.com';
  } else {
    API_BASE_URL = '';
  }

  console.log('[Sandbagger] platform:', platform, '| isNative:', isCapacitorApp, '| API_BASE_URL:', API_BASE_URL || '(relative)');
}

// Initialize immediately — bridge should be ready on Android
// DOMContentLoaded re-runs to catch iOS WKWebView late init
initializeApiUrl();
document.addEventListener('DOMContentLoaded', () => {
  initializeApiUrl();
  initOfflineBanner();
});

// ── Offline score save helper ─────────────────────────────────────────────────

function updateOfflineBanner() {
  const banner = document.getElementById('offline-banner');
  const countEl = document.getElementById('offline-pending-count');
  if (!banner) return;

  if (!navigator.onLine) {
    banner.style.display = 'block';
    getPendingCount().then(n => {
      countEl.textContent = n > 0 ? ` (${n} pending)` : '';
    });
  } else {
    banner.style.display = 'none';
    countEl.textContent = '';
  }
}

function initOfflineBanner() {
  updateOfflineBanner();

  window.addEventListener('offline', updateOfflineBanner);

  window.addEventListener('online', async () => {
    const synced = await syncPendingScores(API_BASE_URL);
    if (synced > 0) console.log(`Synced ${synced} offline score(s)`);
    updateOfflineBanner();
  });
}

async function saveScore(payload, onSuccess) {
  if (navigator.onLine) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/save_score.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        onSuccess();
      } else {
        console.error('Save failed:', data.message);
      }
    } catch {
      // Network error despite being "online" — queue it
      await queueScore(payload);
      updateOfflineBanner();
      onSuccess(); // update UI optimistically
    }
  } else {
    await queueScore(payload);
    updateOfflineBanner();
    onSuccess(); // update UI optimistically
  }
}

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

// ── Global 401 interceptor ────────────────────────────────────────────────────
// Any API call that returns 401 while the user appears logged-in means the
// PHP session has expired. Instead of silently showing a blank screen, we
// immediately show the login screen with an explanatory message.
//
// This covers the case where the session file was garbage-collected by the
// shared host before the database-session fix could take effect, or any
// future edge-case where a session is invalidated server-side.
(function () {
  const _origFetch = window.fetch.bind(window);
  let _expiredNotified = false; // prevent duplicate toasts from parallel requests

  window.fetch = async function (url, options) {
    const res = await _origFetch(url, options);

    // Only intercept 401s from our own API while the user is supposed to be logged in.
    // Skips login/register/join/forgot-password calls where 401 is expected.
    if (
      res.status === 401 &&
      typeof url === 'string' &&
      url.includes('/api/') &&
      !_expiredNotified &&
      typeof currentUser !== 'undefined' && currentUser !== null
    ) {
      _expiredNotified = true;
      console.warn('[Sandbagger] 401 from', url, '— session expired, redirecting to login');
      if (typeof handleSessionExpired === 'function') {
        handleSessionExpired();
      }
    }

    return res; // always return the original response so callers can inspect it
  };

  // Reset the flag when the user successfully logs back in.
  // Called from proceedAfterAuth() so parallel 401s don't block re-login.
  window._resetSessionExpiredFlag = function () {
    _expiredNotified = false;
  };
})();


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

    // Branch on format
    const formatId = parseInt(sessionStorage.getItem('selected_format_id'));
    if (formatId === 5) {
      loadSkinsMatch();
    } else if (formatId === 4) {
      loadGuysTripMatch();
    } else {
      loadTodaysMatch();
    }
  } else if (page === 'today') {
    const container = document.createElement("div");
    container.id = "today-summary";
    content.appendChild(container);

    const formatId = parseInt(sessionStorage.getItem('selected_format_id'));
    if (formatId === 5) {
      loadSkinsSummary();
    } else if (formatId === 4) {
      loadGuysTripSummary();
    } else {
      loadTodaySummary();
    }
  } else if (page === 'tournament') {
      const container = document.createElement("div");
      container.id = "tournament";
      content.appendChild(container);

      const formatId = parseInt(sessionStorage.getItem('selected_format_id'));
      if (formatId === 5) {
        loadSkinsTournamentPage(container);
      } else if (formatId === 4) {
        loadGuysTripTournamentPage(container);
      } else {
        loadTournamentPage(container);
      }
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

// Function to assign CSS color variables for team colors and calculate text colors
function assignCSSColors(primary, secondary) {
  const primaryColor = primary || '#4F2683';
  const secondaryColor = secondary || '#FFC62F';

  document.documentElement.style.setProperty('--primary-team-color', primaryColor);
  document.documentElement.style.setProperty('--secondary-team-color', secondaryColor);

  // Calculate and set text colors for contrast
  document.documentElement.style.setProperty('--primary-text-color', pickContrastColorFromHex(primaryColor));
  document.documentElement.style.setProperty('--secondary-text-color', pickContrastColorFromHex(secondaryColor));
}

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
  console.log('Fetching golfers from:', `${API_BASE_URL}/api/get_golfers.php`);
  console.log('Fetching courses from:', `${API_BASE_URL}/api/courses.php`);
  Promise.all([
    fetch(`${API_BASE_URL}/api/get_golfers.php`)
      .then(res => {
        console.log('Golfers response status:', res.status, res.statusText);
        if (!res.ok) throw new Error(`Golfers HTTP ${res.status}: ${res.statusText}`);
        return res.json();
      })
      .then(data => {
        console.log('Golfers data received:', data ? data.length : 0, 'golfers');
        return data;
      }),
    fetch(`${API_BASE_URL}/api/courses.php`)
      .then(res => {
        console.log('Courses response status:', res.status, res.statusText);
        if (!res.ok) throw new Error(`Courses HTTP ${res.status}: ${res.statusText}`);
        return res.json();
      })
      .then(data => {
        console.log('Courses data received:', data ? data.length : 0, 'courses');
        return data;
      })
  ])
  .then(([golfers, courses]) => {
    allGolfers = golfers;
    allCourses = courses;

      const golferOptions = golfers.map(g => `<option value="${g.golfer_id}">${g.first_name} ${g.last_name} (${g.handicap})</option>`).join('');
      const courseOptions = courses.map(c => `<option value="${c.course_id}">${c.name}</option>`).join('');

      setupContent.innerHTML = `
        <div class="setup-wrapper">
          <h2 class="page-title">Best Ball Setup</h2>

          <div class="setup-section">
            <h3 style="margin:0 0 var(--space-3); font-size:var(--font-size-base); font-weight:800; text-transform:uppercase; letter-spacing:0.05em; color:var(--color-text-secondary);">Team 1</h3>
            <div style="margin-bottom: 1rem;">
              <label class="form-label">Player 1:</label>
              <div class="setup-player-row">
                <select id="team1-player1" class="player-select form-input" style="flex:1;">
                  <option value="">-- Select Player --</option>
                  ${golferOptions}
                  <option value="new-player">+ New Player</option>
                </select>
                <button class="edit-player-btn" data-select="team1-player1" class="btn-edit-player">✏️</button>
              </div>
            </div>
            <div>
              <label class="form-label">Player 2:</label>
              <div class="setup-player-row">
                <select id="team1-player2" class="player-select form-input" style="flex:1;">
                  <option value="">-- Select Player --</option>
                  ${golferOptions}
                  <option value="new-player">+ New Player</option>
                </select>
                <button class="edit-player-btn" data-select="team1-player2" class="btn-edit-player">✏️</button>
              </div>
            </div>
          </div>

          <div class="setup-section">
            <h3 style="margin:0 0 var(--space-3); font-size:var(--font-size-base); font-weight:800; text-transform:uppercase; letter-spacing:0.05em; color:var(--color-text-secondary);">Team 2</h3>
            <div style="margin-bottom: 1rem;">
              <label class="form-label">Player 1:</label>
              <div class="setup-player-row">
                <select id="team2-player1" class="player-select form-input" style="flex:1;">
                  <option value="">-- Select Player --</option>
                  ${golferOptions}
                  <option value="new-player">+ New Player</option>
                </select>
                <button class="edit-player-btn" data-select="team2-player1" class="btn-edit-player">✏️</button>
              </div>
            </div>
            <div>
              <label class="form-label">Player 2:</label>
              <div class="setup-player-row">
                <select id="team2-player2" class="player-select form-input" style="flex:1;">
                  <option value="">-- Select Player --</option>
                  ${golferOptions}
                  <option value="new-player">+ New Player</option>
                </select>
                <button class="edit-player-btn" data-select="team2-player2" class="btn-edit-player">✏️</button>
              </div>
            </div>
          </div>

          <div class="setup-section">
            <h3 style="margin:0 0 var(--space-3); font-size:var(--font-size-base); font-weight:800; text-transform:uppercase; letter-spacing:0.05em; color:var(--color-text-secondary);">Course</h3>
            <div style="margin-bottom: 1rem;">
              <label class="form-label">Select Course:</label>
              <select id="select-course" class="form-input form-select">
                <option value="">-- Select Course --</option>
                ${courseOptions}
              </select>
            </div>
            <div id="tee-selection" style="display: none;">
              <label class="form-label">Select Tees:</label>
              <select id="select-tee" class="form-input form-select">
                <option value="">-- Select Tees --</option>
              </select>
            </div>
          </div>

          <div class="setup-section">
            <h3 style="margin:0 0 var(--space-3); font-size:var(--font-size-base); font-weight:800; text-transform:uppercase; letter-spacing:0.05em; color:var(--color-text-secondary);">Handicap Adjustment</h3>
            <div>
              <label class="form-label">Handicap Percentage: <span id="handicap-value" style="font-weight: bold;">100%</span></label>
              <input type="range" id="handicap-slider" min="0" max="100" step="10" value="100" style="width: 100%; height: 8px; border-radius: 5px; background: #ddd; outline: none; cursor: pointer;">
            </div>
          </div>

          <div style="display:flex; gap:var(--space-3); justify-content:center; flex-wrap:wrap;">
            <button id="start-best-ball" class="btn btn-success btn-auto">
              Start Round
            </button>
            <button id="cancel-best-ball" class="btn btn-neutral btn-auto">
              Cancel
            </button>
          </div>
          <div id="setup-message" style="margin-top: 1rem; text-align: center; color: red;"></div>
        </div>

        <!-- New Player Modal -->
        <div id="new-player-modal" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:1000; align-items:center; justify-content:center;">
          <div class="modal-box" style="max-width:400px;">
            <h3 id="player-modal-title" class="modal-title" style="margin-bottom:var(--space-5);">Add New Player</h3>
            <input type="hidden" id="edit-player-id" value="">
            <div style="margin-bottom: 1rem;">
              <label class="form-label">First Name:</label>
              <input type="text" id="new-player-first-name" class="form-input">
            </div>
            <div style="margin-bottom: 1rem;">
              <label class="form-label">Last Name:</label>
              <input type="text" id="new-player-last-name" class="form-input">
            </div>
            <div style="margin-bottom: 1rem;">
              <label class="form-label">Handicap:</label>
              <input type="number" id="new-player-handicap" step="0.1" class="form-input">
            </div>
            <div id="new-player-message" style="margin-bottom: 1rem; color: red; text-align: center;"></div>
            <div style="text-align: center;">
              <button id="save-new-player" class="btn btn-success btn-auto">
                Save
              </button>
              <button id="cancel-new-player" class="btn btn-neutral btn-auto">
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
        document.getElementById('user-dashboard').style.display = 'block';
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
      console.error('Error name:', err.name);
      console.error('Error message:', err.message);
      console.error('Error stack:', err.stack);
      setupContent.innerHTML = `<p style="color: red; text-align: center;">Error loading golfers: ${err.message}. Please try again.</p>`;
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

  const endpoint = isEditing ? '/api/update_golfer.php' : '/api/add_golfer.php';

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
  console.log('Fetching golfers from:', `${API_BASE_URL}/api/get_golfers.php`);
  console.log('Fetching courses from:', `${API_BASE_URL}/api/courses.php`);
  Promise.all([
    fetch(`${API_BASE_URL}/api/get_golfers.php`)
      .then(res => {
        console.log('Golfers response status:', res.status, res.statusText);
        if (!res.ok) throw new Error(`Golfers HTTP ${res.status}: ${res.statusText}`);
        return res.json();
      })
      .then(data => {
        console.log('Golfers data received:', data ? data.length : 0, 'golfers');
        return data;
      }),
    fetch(`${API_BASE_URL}/api/courses.php`)
      .then(res => {
        console.log('Courses response status:', res.status, res.statusText);
        if (!res.ok) throw new Error(`Courses HTTP ${res.status}: ${res.statusText}`);
        return res.json();
      })
      .then(data => {
        console.log('Courses data received:', data ? data.length : 0, 'courses');
        return data;
      })
  ])
  .then(([golfers, courses]) => {
    allGolfers = golfers;
    allCourses = courses;

    const golferOptions = golfers.map(g => `<option value="${g.golfer_id}">${g.first_name} ${g.last_name} (${g.handicap})</option>`).join('');
    const courseOptions = courses.map(c => `<option value="${c.course_id}">${c.name}</option>`).join('');

    setupContent.innerHTML = `
      <div class="setup-wrapper">
        <h2 class="page-title">Rabbit Setup</h2>

        <div class="setup-section">
          <h3 style="margin:0 0 var(--space-3); font-size:var(--font-size-base); font-weight:800; text-transform:uppercase; letter-spacing:0.05em; color:var(--color-text-secondary);">Players</h3>

          <div style="margin-bottom: 1rem;">
            <label class="form-label">Player 1:</label>
            <div class="setup-player-row">
              <select id="rabbit-player1" class="player-select form-input" style="flex:1;">
                <option value="">-- Select Player --</option>
                ${golferOptions}
                <option value="new-player">+ New Player</option>
              </select>
              <button class="edit-player-btn" data-select="rabbit-player1" class="btn-edit-player">✏️</button>
            </div>
          </div>

          <div style="margin-bottom: 1rem;">
            <label class="form-label">Player 2:</label>
            <div class="setup-player-row">
              <select id="rabbit-player2" class="player-select form-input" style="flex:1;">
                <option value="">-- Select Player --</option>
                ${golferOptions}
                <option value="new-player">+ New Player</option>
              </select>
              <button class="edit-player-btn" data-select="rabbit-player2" class="btn-edit-player">✏️</button>
            </div>
          </div>

          <div style="margin-bottom: 1rem;">
            <label class="form-label">Player 3:</label>
            <div class="setup-player-row">
              <select id="rabbit-player3" class="player-select form-input" style="flex:1;">
                <option value="">-- Select Player --</option>
                ${golferOptions}
                <option value="new-player">+ New Player</option>
              </select>
              <button class="edit-player-btn" data-select="rabbit-player3" class="btn-edit-player">✏️</button>
            </div>
          </div>

          <div style="margin-bottom: 1rem;">
            <label class="form-label">Player 4:</label>
            <div class="setup-player-row">
              <select id="rabbit-player4" class="player-select form-input" style="flex:1;">
                <option value="">-- Select Player --</option>
                ${golferOptions}
                <option value="new-player">+ New Player</option>
              </select>
              <button class="edit-player-btn" data-select="rabbit-player4" class="btn-edit-player">✏️</button>
            </div>
          </div>
        </div>

        <div class="setup-section">
          <h3 style="margin:0 0 var(--space-3); font-size:var(--font-size-base); font-weight:800; text-transform:uppercase; letter-spacing:0.05em; color:var(--color-text-secondary);">Course</h3>
          <div style="margin-bottom: 1rem;">
            <label class="form-label">Select Course:</label>
            <select id="select-course" class="form-input form-select">
              <option value="">-- Select Course --</option>
              ${courseOptions}
            </select>
          </div>
          <div id="tee-selection" style="display: none;">
            <label class="form-label">Select Tees:</label>
            <select id="select-tee" class="form-input form-select">
              <option value="">-- Select Tees --</option>
            </select>
          </div>
        </div>

        <div class="setup-section">
          <h3 style="margin:0 0 var(--space-3); font-size:var(--font-size-base); font-weight:800; text-transform:uppercase; letter-spacing:0.05em; color:var(--color-text-secondary);">Handicap Adjustment</h3>
          <div>
            <label class="form-label">Handicap Percentage: <span id="handicap-value" style="font-weight: bold;">100%</span></label>
            <input type="range" id="handicap-slider" min="0" max="100" step="10" value="100" style="width: 100%; height: 8px; border-radius: 5px; background: #ddd; outline: none; cursor: pointer;">
          </div>
        </div>

        <div style="display:flex; gap:var(--space-3); justify-content:center; flex-wrap:wrap;">
          <button id="start-rabbit" class="btn btn-success btn-auto">
            Start Round
          </button>
          <button id="cancel-rabbit" class="btn btn-neutral btn-auto">
            Cancel
          </button>
        </div>
        <div id="setup-message" style="margin-top: 1rem; text-align: center; color: red;"></div>
      </div>

      <!-- New Player Modal (reused) -->
      <div id="new-player-modal" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:1000; align-items:center; justify-content:center;">
        <div class="modal-box" style="max-width:400px;">
          <h3 id="player-modal-title" class="modal-title" style="margin-bottom:var(--space-5);">Add New Player</h3>
          <input type="hidden" id="edit-player-id" value="">
          <div style="margin-bottom: 1rem;">
            <label class="form-label">First Name:</label>
            <input type="text" id="new-player-first-name" class="form-input">
          </div>
          <div style="margin-bottom: 1rem;">
            <label class="form-label">Last Name:</label>
            <input type="text" id="new-player-last-name" class="form-input">
          </div>
          <div style="margin-bottom: 1rem;">
            <label class="form-label">Handicap:</label>
            <input type="number" id="new-player-handicap" step="0.1" class="form-input">
          </div>
          <div id="new-player-message" style="margin-bottom: 1rem; color: red; text-align: center;"></div>
          <div style="text-align: center;">
            <button id="save-new-player" class="btn btn-success btn-auto">
              Save
            </button>
            <button id="cancel-new-player" class="btn btn-neutral btn-auto">
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
      document.getElementById('user-dashboard').style.display = 'block';
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
  console.log('Fetching golfers from:', `${API_BASE_URL}/api/get_golfers.php`);
  console.log('Fetching courses from:', `${API_BASE_URL}/api/courses.php`);
  Promise.all([
    fetch(`${API_BASE_URL}/api/get_golfers.php`)
      .then(res => {
        console.log('Golfers response status:', res.status, res.statusText);
        if (!res.ok) throw new Error(`Golfers HTTP ${res.status}: ${res.statusText}`);
        return res.json();
      })
      .then(data => {
        console.log('Golfers data received:', data ? data.length : 0, 'golfers');
        return data;
      }),
    fetch(`${API_BASE_URL}/api/courses.php`)
      .then(res => {
        console.log('Courses response status:', res.status, res.statusText);
        if (!res.ok) throw new Error(`Courses HTTP ${res.status}: ${res.statusText}`);
        return res.json();
      })
      .then(data => {
        console.log('Courses data received:', data ? data.length : 0, 'courses');
        return data;
      })
  ])
  .then(([golfers, courses]) => {
    allGolfers = golfers;
    allCourses = courses;

    const golferOptions = golfers.map(g => `<option value="${g.golfer_id}">${g.first_name} ${g.last_name} (${g.handicap})</option>`).join('');
    const courseOptions = courses.map(c => `<option value="${c.course_id}">${c.name}</option>`).join('');

    setupContent.innerHTML = `
      <div class="setup-wrapper">
        <h2 class="page-title">Wolf Setup</h2>

        <div class="setup-section">
          <h3 style="margin:0 0 var(--space-3); font-size:var(--font-size-base); font-weight:800; text-transform:uppercase; letter-spacing:0.05em; color:var(--color-text-secondary);">Playing Order (4 Players Required)</h3>
          <p style="font-size: 0.9rem; color: #666; margin-bottom: 1rem;">The Wolf rotates each hole. Player 4 is the Wolf on Hole 1.</p>

          <div style="margin-bottom: 1rem;">
            <label class="form-label">Player 1: <span style="color: red;">*</span></label>
            <div class="setup-player-row">
              <select id="wolf-player1" class="player-select form-input" style="flex:1;">
                <option value="">-- Select Player --</option>
                ${golferOptions}
                <option value="new-player">+ New Player</option>
              </select>
              <button class="edit-player-btn" data-select="wolf-player1" class="btn-edit-player">✏️</button>
            </div>
          </div>

          <div style="margin-bottom: 1rem;">
            <label class="form-label">Player 2: <span style="color: red;">*</span></label>
            <div class="setup-player-row">
              <select id="wolf-player2" class="player-select form-input" style="flex:1;">
                <option value="">-- Select Player --</option>
                ${golferOptions}
                <option value="new-player">+ New Player</option>
              </select>
              <button class="edit-player-btn" data-select="wolf-player2" class="btn-edit-player">✏️</button>
            </div>
          </div>

          <div style="margin-bottom: 1rem;">
            <label class="form-label">Player 3: <span style="color: red;">*</span></label>
            <div class="setup-player-row">
              <select id="wolf-player3" class="player-select form-input" style="flex:1;">
                <option value="">-- Select Player --</option>
                ${golferOptions}
                <option value="new-player">+ New Player</option>
              </select>
              <button class="edit-player-btn" data-select="wolf-player3" class="btn-edit-player">✏️</button>
            </div>
          </div>

          <div style="margin-bottom: 1rem;">
            <label class="form-label">Player 4 🐺: <span style="color: red;">*</span></label>
            <div class="setup-player-row">
              <select id="wolf-player4" class="player-select form-input" style="flex:1;">
                <option value="">-- Select Player --</option>
                ${golferOptions}
                <option value="new-player">+ New Player</option>
              </select>
              <button class="edit-player-btn" data-select="wolf-player4" class="btn-edit-player">✏️</button>
            </div>
          </div>
        </div>

        <div class="setup-section">
          <h3 style="margin:0 0 var(--space-3); font-size:var(--font-size-base); font-weight:800; text-transform:uppercase; letter-spacing:0.05em; color:var(--color-text-secondary);">Course</h3>
          <div style="margin-bottom: 1rem;">
            <label class="form-label">Select Course:</label>
            <select id="select-course" class="form-input form-select">
              <option value="">-- Select Course --</option>
              ${courseOptions}
            </select>
          </div>
          <div id="tee-selection" style="display: none;">
            <label class="form-label">Select Tees:</label>
            <select id="select-tee" class="form-input form-select">
              <option value="">-- Select Tees --</option>
            </select>
          </div>
        </div>

        <div class="setup-section">
          <h3 style="margin:0 0 var(--space-3); font-size:var(--font-size-base); font-weight:800; text-transform:uppercase; letter-spacing:0.05em; color:var(--color-text-secondary);">Handicap Adjustment</h3>
          <div>
            <label class="form-label">Handicap Percentage: <span id="handicap-value" style="font-weight: bold;">100%</span></label>
            <input type="range" id="handicap-slider" min="0" max="100" step="10" value="100" style="width: 100%; height: 8px; border-radius: 5px; background: #ddd; outline: none; cursor: pointer;">
          </div>
        </div>

        <div style="display:flex; gap:var(--space-3); justify-content:center; flex-wrap:wrap;">
          <button id="start-wolf" class="btn btn-success btn-auto">
            Start Round
          </button>
          <button id="cancel-wolf" class="btn btn-neutral btn-auto">
            Cancel
          </button>
        </div>
        <div id="setup-message" style="margin-top: 1rem; text-align: center; color: red;"></div>
      </div>

      <!-- New Player Modal (reused) -->
      <div id="new-player-modal" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:1000; align-items:center; justify-content:center;">
        <div class="modal-box" style="max-width:400px;">
          <h3 id="player-modal-title" class="modal-title" style="margin-bottom:var(--space-5);">Add New Player</h3>
          <input type="hidden" id="edit-player-id" value="">
          <div style="margin-bottom: 1rem;">
            <label class="form-label">First Name:</label>
            <input type="text" id="new-player-first-name" class="form-input">
          </div>
          <div style="margin-bottom: 1rem;">
            <label class="form-label">Last Name:</label>
            <input type="text" id="new-player-last-name" class="form-input">
          </div>
          <div style="margin-bottom: 1rem;">
            <label class="form-label">Handicap:</label>
            <input type="number" id="new-player-handicap" step="0.1" class="form-input">
          </div>
          <div id="new-player-message" style="margin-bottom: 1rem; color: red; text-align: center;"></div>
          <div style="text-align: center;">
            <button id="save-new-player" class="btn btn-success btn-auto">
              Save
            </button>
            <button id="cancel-new-player" class="btn btn-neutral btn-auto">
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
      document.getElementById('user-dashboard').style.display = 'block';
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
      sessionStorage.removeItem('quick_round_read_only'); // Clear read-only flag
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
  console.log('loadWolfScoring called');
  const matchId = sessionStorage.getItem('wolf_match_id');
  const matchCode = sessionStorage.getItem('wolf_match_code');

  if (!matchId) {
    console.error('No match ID found');
    return;
  }

  // Hide setup container and show scoring interface
  const setupContainer = document.getElementById('best-ball-setup');
  if (setupContainer) {
    setupContainer.style.display = 'none';
  }

  const appContent = document.getElementById('app-content');
  if (!appContent) {
    console.error('app-content element not found!');
    alert('Error: app-content not found. Please refresh the page.');
    return;
  }
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
      userBar.style.display = 'none';
    }
  }

  // Hide round bar for quick rounds
  const roundBar = document.getElementById('round-bar');
  if (roundBar) {
    roundBar.style.display = 'none';
  }

  const container = document.getElementById('score-entry-content');
  if (!container) {
    console.error('score-entry-content element not found!');
    console.log('app-content:', appContent);
    console.log('app-content display:', appContent.style.display);
    alert('Error: score-entry-content not found. Please refresh the page.');
    return;
  }
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
                        const dots = strokeDots(stroke);

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
        <code>(Handicap × (Slope / 113) + (Rating - 72)) × ${tournamentHandicapPct}%</code><br>
      `;
      container.appendChild(explanation);

      // Load existing scores and partner selections
      fetch(`${API_BASE_URL}/api/get_scores.php?match_id=${matchId}`, {
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
        applyPendingScores(matchId);

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

          saveScore(payload, () => {
            updateTotalScores();
            updateScoreCellClasses();
            calculateWolfPoints();
          });
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
      sessionStorage.removeItem('quick_round_read_only'); // Clear read-only flag
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
  console.log('loadRabbitScoring called');
  const matchId = sessionStorage.getItem('rabbit_match_id');
  const matchCode = sessionStorage.getItem('rabbit_match_code');

  if (!matchId) {
    console.error('No match ID found');
    return;
  }

  // Hide setup container and show scoring interface
  const setupContainer = document.getElementById('best-ball-setup');
  if (setupContainer) {
    setupContainer.style.display = 'none';
  }

  const appContent = document.getElementById('app-content');
  if (!appContent) {
    console.error('app-content element not found!');
    alert('Error: app-content not found. Please refresh the page.');
    return;
  }
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
      userBar.style.display = 'none';
    }
  }

  // Hide round bar for quick rounds
  const roundBar = document.getElementById('round-bar');
  if (roundBar) {
    roundBar.style.display = 'none';
  }

  const container = document.getElementById('score-entry-content');
  if (!container) {
    console.error('score-entry-content element not found!');
    console.log('app-content:', appContent);
    console.log('app-content display:', appContent.style.display);
    alert('Error: score-entry-content not found. Please refresh the page.');
    return;
  }
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
                    const dots = strokeDots(stroke);
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
        <code>(Handicap × (Slope / 113) + (Rating - 72)) × ${tournamentHandicapPct}%</code><br>
      `;
      container.appendChild(handicapExplanation);

      // Load existing scores
      fetch(`${API_BASE_URL}/api/get_scores.php?match_id=${matchId}`, {
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
        applyPendingScores(matchId);
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

          saveScore(payload, () => {
            updateTotalScores();
            updateScoreCellClasses();
            calculateRabbitWinners();
          });
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
      userBar.style.display = 'none';
    }
  }

  // Hide round bar for quick rounds
  const roundBar = document.getElementById('round-bar');
  if (roundBar) {
    roundBar.style.display = 'none';
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
      golfers = adjustHandicapsForMatch(
        Array.from(golferMap.values()).sort((a, b) => a.order - b.order)
      );

      // Build stroke maps from adjusted handicaps
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
      fetch(`${API_BASE_URL}/api/get_scores.php?match_id=${matchId}`, {
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
                            const dots = strokeDots(stroke);

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
      userBar.style.display = 'none';
    }
  }

  // Hide round bar for quick rounds
  const roundBar = document.getElementById('round-bar');
  if (roundBar) {
    roundBar.style.display = 'none';
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
      golfers = adjustHandicapsForMatch(Array.from(golferMap.values()));

      // Build stroke maps from adjusted handicaps
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
      fetch(`${API_BASE_URL}/api/get_scores.php?match_id=${matchId}`, {
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
                        const dots = strokeDots(stroke);
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

  // Validation — at least 1 player per team required, second slot is optional
  if (!team1p1 || !team2p1) {
    message.textContent = 'Please select at least one player for each team.';
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

  // Duplicate check on filled slots only
  const filledPlayers = [team1p1, team1p2, team2p1, team2p2].filter(Boolean);
  if (new Set(filledPlayers).size !== filledPlayers.length) {
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
      sessionStorage.removeItem('quick_round_read_only'); // Clear read-only flag
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

    // Hide user bar
    const userBar = headerElement.querySelector('#user-bar');
    if (userBar) {
      userBar.style.display = 'none';
    }
  }

  // Hide round bar for quick rounds
  const roundBar = document.getElementById('round-bar');
  if (roundBar) {
    roundBar.style.display = 'none';
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

                    const dots = strokeDots(strokeCount);
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
          fetch(`${API_BASE_URL}/api/finalize_match_result.php`, {
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
              showMatchResultsModal('bestball', () => loadBestBallScoring());
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
        <code>(Handicap × (Slope / 113) + (Rating - 72)) × ${tournamentHandicapPct}%</code><br>
      `;
      container.appendChild(handicapExplanation);

      // Load existing scores
      fetch(`${API_BASE_URL}/api/get_scores.php?match_id=${matchId}`, {
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
        applyPendingScores(matchId);
        updateTotalScores();
        updateFinalizeButtonVisibility();
        calculateBestBallStatus();
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

          saveScore(payload, () => {
            updateTotalScores();
            updateFinalizeButtonVisibility();
            updateScoreCellClasses();
            calculateBestBallStatus();
          });
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

    // Hide user bar
    const userBar = headerElement.querySelector('#user-bar');
    if (userBar) {
      userBar.style.display = 'none';
    }
  }

  // Hide round bar for quick rounds
  const roundBar = document.getElementById('round-bar');
  if (roundBar) {
    roundBar.style.display = 'none';
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
                    const dots = strokeDots(stroke);
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
        <code>(Handicap × (Slope / 113) + (Rating - 72)) × ${tournamentHandicapPct}%</code><br>
      `;
      container.appendChild(handicapExplanation);

      // Fetch scores
      fetch(`${API_BASE_URL}/api/get_scores.php?match_id=${matchId}`, { credentials: 'include' })
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
                            const dots = strokeDots(stroke);
              cell.innerHTML = `${dots}${strokes}`;
            }
          });

          applyPendingScores(matchId);
          updateTotalScoresReadOnly(golfers, holeInfo);
          calculateBestBallStatusReadOnly(golfers, strokeMaps);
        });
    })
    .catch(err => {
      console.error("Error loading Best Ball match:", err);
      container.innerHTML = '<p>Error loading match data. Please try again.</p>';
    });
}

// Called when the session is confirmed dead — show login with a message.
function handleSessionExpired() {
  stopSessionHeartbeat();
  localStorage.removeItem('sb_golfer');
  currentUser = null;
  // Show login screen with an explanatory message
  showLoginScreen();
  const err = document.getElementById('login-error');
  if (err) {
    err.textContent = 'Your session expired. Please sign in again.';
    err.style.display = 'block';
  }
}

// Ping keep_alive.php to extend the session cookie on the server.
// Called on a timer AND whenever the app comes back to the foreground.
async function pingKeepAlive() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/keep_alive.php`, { credentials: 'include' });
    if (res.status === 401) {
      handleSessionExpired();
    }
  } catch {
    // Network error — don't log out, user may just be offline temporarily
  }
}

function startSessionHeartbeat() {
  if (sessionHeartbeatInterval) clearInterval(sessionHeartbeatInterval);
  // Ping every 10 minutes — well within the 30-day window, but frequent
  // enough to keep the session alive through normal app usage gaps.
  sessionHeartbeatInterval = setInterval(pingKeepAlive, 10 * 60 * 1000);
}

function stopSessionHeartbeat() {
  if (sessionHeartbeatInterval) {
    clearInterval(sessionHeartbeatInterval);
    sessionHeartbeatInterval = null;
  }
}

// When the app comes back from background (phone locked, tab switched),
// immediately check if the session is still alive rather than waiting
// for the next heartbeat interval.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && currentUser) {
    pingKeepAlive();
  }
});



//checks session state
fetch(`${API_BASE_URL}/api/check_session.php`, {
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
      tournamentId = data.tournament_id || sessionStorage.getItem('selected_tournament_id') || 1;
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
    
    fetch(`${API_BASE_URL}/api/get_match_by_round.php`, { credentials: 'include' })
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
    const roundName = data?.round_name || sessionStorage.getItem("round_name");
    
    const tournamentBar = document.getElementById("tournament-bar");
    const tournamentSpan = document.getElementById("tournament-name");
    
    let info = `${tournamentName}<br>${roundName}`;
    
    tournamentSpan.innerHTML = info;

    
      tournamentBar.style.display = "block";
}



//data for the Score Entry tab
function loadTodaysMatch() {
  const roundId = sessionStorage.getItem('selected_round_id');
  const tournamentId = sessionStorage.getItem('selected_tournament_id');
  const golferId = currentUser?.golfer_id || sessionStorage.getItem('golfer_id');

  if (!roundId || !tournamentId || !golferId) {
    const container = document.getElementById("score-entry-content");
    container.innerHTML = "<p>Missing round, tournament, or golfer information.</p>";
    return;
  }

  const url = `${API_BASE_URL}/api/get_match_by_round.php?round_id=${roundId}&tournament_id=${tournamentId}&golfer_id=${golferId}`;

  fetch(url, { credentials: 'include' })
    .then(res => res.json())
    .then(data => {
      const matchGolfers = data.match;
      holeInfo = data.holes;
      if (data.error || !matchGolfers || matchGolfers.length === 0) {
        const container = document.getElementById("score-entry-content");
        container.innerHTML = `
          <div class="no-match-card">
            <img src="/images/cartoon.png" alt="Sandbagger" class="no-match-img">
            <h2 class="no-match-title">No Matchups Yet</h2>
            <p class="no-match-msg">The commissioner hasn't assigned matchups for this round. Check back soon!</p>
          </div>`;
        return;
      }

      // Set course data and tournament handicap percentage for handicap calculations
      const firstMatch = data.match[0];
      courses = {
        course_name: firstMatch.course_name,
        slope: firstMatch.slope,
        rating: firstMatch.rating,
        par: firstMatch.par
      };
      tournamentHandicapPct = parseFloat(data.tournament_handicap_pct || 100);

      // Check if finalized
      const match = data.match && data.match[0];
      if (match && match.finalized && parseInt(match.finalized) === 1) {
        loadMatchScorecard(match.match_id, "score-entry-content");
        return;
      }
      const container = document.getElementById("score-entry-content");
      currentMatchId = data.match[0].match_id;

      // Build golfer list with match-adjusted handicaps
      const rawGolfers = [...new Set(matchGolfers.map(row => ({
        id: row.golfer_id,
        name: row.first_name,
        team: row.team_name,
        handicap: calculatePlayingHandicap(row.handicap),
      })))];
      golfers = adjustHandicapsForMatch(rawGolfers);

      strokeMaps = {};
      golfers.forEach(g => {
        strokeMaps[g.id] = buildStrokeMapForGolfer(g.handicap, holeInfo);
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

                        const dots = strokeDots(strokeCount);
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
        fetch(`${API_BASE_URL}/api/finalize_match_result.php`, {
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
            showMatchResultsModal('tournament', () => {
              document.getElementById("finalize-results-btn").style.display = "none";
              loadTodaysMatch();
            });
          } else {
            alert("Error finalizing results: " + (data.error || "Unknown error"));
          }
        });
      };
      
      fetch(`${API_BASE_URL}/api/get_scores.php?match_id=${data.match[0].match_id}`, {
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
          applyPendingScores(data.match[0].match_id);
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

          saveScore(payload, () => {
            refreshScores();
            calculateBestBallStatus();
            updateTotalScores();
            updateFinalizeButtonVisibility();
            updateScoreCellClasses();
          });
        });
      });
    })
    .catch(err => {
      console.error("Error loading match:", err);
    });
}

function loadSkinsMatch() {
  const roundId      = sessionStorage.getItem('selected_round_id');
  const tournamentId = sessionStorage.getItem('selected_tournament_id');
  const golferId     = currentUser?.golfer_id || sessionStorage.getItem('golfer_id');
  const container    = document.getElementById('score-entry-content');

  if (!roundId || !tournamentId || !golferId) {
    container.innerHTML = '<p>Missing round, tournament, or golfer information.</p>';
    return;
  }

  const url = `${API_BASE_URL}/api/get_match_by_round.php?round_id=${roundId}&tournament_id=${tournamentId}&golfer_id=${golferId}`;

  fetch(url, { credentials: 'include' })
    .then(res => res.json())
    .then(data => {
      const matchGolfers = data.match;
      holeInfo = data.holes;

      if (data.error || !matchGolfers || matchGolfers.length === 0) {
        container.innerHTML = `
          <div class="no-match-card">
            <img src="/images/cartoon.png" alt="Sandbagger" class="no-match-img">
            <h2 class="no-match-title">No Group Yet</h2>
            <p class="no-match-msg">You haven't been assigned to a group for this round yet. Check back soon!</p>
          </div>`;
        return;
      }

      const firstMatch = matchGolfers[0];
      courses = {
        course_name: firstMatch.course_name,
        slope:       firstMatch.slope,
        rating:      firstMatch.rating,
        par:         firstMatch.par
      };
      tournamentHandicapPct = parseFloat(data.tournament_handicap_pct || 100);

      // If already finalized, show scorecard
      if (firstMatch.finalized && parseInt(firstMatch.finalized) === 1) {
        loadMatchScorecard(firstMatch.match_id, 'score-entry-content');
        return;
      }

      currentMatchId = firstMatch.match_id;

      // All players play their full calculated handicap — no lowest-handicap adjustment
      golfers = matchGolfers.map((row, idx) => ({
        id:           row.golfer_id,
        name:         row.first_name,
        handicap:     calculatePlayingHandicap(row.handicap),
        player_order: idx + 1
      }));

      strokeMaps = {};
      golfers.forEach(g => {
        strokeMaps[g.id] = buildStrokeMapForGolfer(g.handicap, holeInfo);
      });

      // ── Build table ──────────────────────────────────────────────────────────
      const table = document.createElement('table');
      table.classList.add('score-table');

      // Header: # | P | HI | Golfer1 | Golfer2 | …
      const header = document.createElement('tr');
      header.innerHTML = `<th>#</th><th>P</th><th>HI</th>` + golfers.map(g =>
        `<th style="background:var(--color-brand-primary); color:#fff;">${g.name} (${parseFloat(g.handicap).toFixed(1)})</th>`
      ).join('');
      table.appendChild(header);

      const frontPar = holeInfo.filter(h => h.hole_number <= 9).reduce((s, h) => s + (h.par || 0), 0);
      const backPar  = holeInfo.filter(h => h.hole_number >= 10).reduce((s, h) => s + (h.par || 0), 0);

      for (let i = 1; i <= 18; i++) {
        const par = holeInfo.find(h => h.hole_number === i)?.par || '-';
        const hi  = holeInfo.find(h => h.hole_number === i)?.handicap_index || '-';

        const row = document.createElement('tr');
        row.innerHTML = `<td>${i}</td><td>${par}</td><td>${hi}</td>` + golfers.map(g => {
          const dots   = strokeDots(strokeMaps[g.id]?.[i] || 0);
          const select = `<select data-hole="${i}" data-golfer="${g.id}">
            <option value="">–</option>
            ${[...Array(12).keys()].map(n => `<option value="${n+1}">${n+1}</option>`).join('')}
          </select>`;
          return `<td>${dots}${select}</td>`;
        }).join('');
        table.appendChild(row);

        // Out subtotal after hole 9
        if (i === 9) {
          const outRow = document.createElement('tr');
          outRow.classList.add('subtotal-row');
          outRow.innerHTML = `<td>Out</td><td>${frontPar}</td><td></td>` +
            golfers.map(g => `<td class="out-subtotal-cell" data-golfer="${g.id}">–</td>`).join('');
          table.appendChild(outRow);
        }

        // In subtotal after hole 18
        if (i === 18) {
          const inRow = document.createElement('tr');
          inRow.classList.add('subtotal-row');
          inRow.innerHTML = `<td>In</td><td>${backPar}</td><td></td>` +
            golfers.map(g => `<td class="in-subtotal-cell" data-golfer="${g.id}">–</td>`).join('');
          table.appendChild(inRow);
        }
      }

      // Total row
      const totalRow = document.createElement('tr');
      totalRow.id = 'totals-row';
      totalRow.innerHTML = `<td colspan="3" style="font-weight:700; text-align:left; padding-left:0.5rem;">Total</td>` +
        golfers.map(g => `<td class="totals-cell" data-golfer="${g.id}">–</td>`).join('');
      table.appendChild(totalRow);

      container.appendChild(table);

      // Finalize button
      let finalizeButton = document.getElementById('finalize-results-btn');
      if (!finalizeButton) {
        finalizeButton = document.createElement('button');
        finalizeButton.id = 'finalize-results-btn';
        finalizeButton.textContent = 'Finalize Round';
        finalizeButton.style.display = 'none';
        container.appendChild(finalizeButton);
      }
      finalizeButton.onclick = function() {
        fetch(`${API_BASE_URL}/api/finalize_match_result.php`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ match_id: currentMatchId, points: [] })
        })
        .then(res => res.json())
        .then(result => {
          if (result.success) {
            finalizeButton.style.display = 'none';
            loadSkinsMatch();
          } else {
            alert('Error finalizing: ' + (result.error || 'Unknown error'));
          }
        });
      };

      // Load existing scores
      fetch(`${API_BASE_URL}/api/get_scores.php?match_id=${currentMatchId}`, { credentials: 'include' })
        .then(res => res.json())
        .then(scores => {
          scores.forEach(score => {
            const sel = document.querySelector(`select[data-hole="${score.hole_number}"][data-golfer="${score.golfer_id}"]`);
            if (sel) {
              sel.value = score.strokes;
              const cell = sel.closest('td');
              if (cell) {
                const par = holeInfo.find(h => h.hole_number == score.hole_number)?.par;
                const strokes = parseInt(score.strokes);
                cell.classList.remove('score-birdie', 'score-bogey', 'score-par', 'score-eagle');
                if (!isNaN(par) && !isNaN(strokes)) {
                  if (strokes <= par - 2) cell.classList.add('score-eagle');
                  else if (strokes === par - 1) cell.classList.add('score-birdie');
                  else if (strokes === par) cell.classList.add('score-par');
                  else cell.classList.add('score-bogey');
                }
              }
            }
          });
          applyPendingScores(currentMatchId);
          updateTotalScores();
          updateFinalizeButtonVisibility();
        })
        .catch(err => console.error('Error loading scores:', err));

      // Change listeners
      table.querySelectorAll('select').forEach(select => {
        select.addEventListener('change', function() {
          const strokes   = this.value;
          const hole      = this.dataset.hole;
          const golfer_id = this.dataset.golfer;
          if (!strokes || !golfer_id || !hole) return;

          saveScore({
            match_id:  currentMatchId,
            golfer_id: parseInt(golfer_id),
            hole:      parseInt(hole),
            strokes:   parseInt(strokes)
          }, () => {
            refreshScores();
            updateTotalScores();
            updateFinalizeButtonVisibility();
            updateScoreCellClasses();
          });
        });
      });
    })
    .catch(err => console.error('Error loading Skins match:', err));
}

function loadGuysTripMatch() {
  const roundId = sessionStorage.getItem('selected_round_id');
  const tournamentId = sessionStorage.getItem('selected_tournament_id');
  const golferId = currentUser?.golfer_id || sessionStorage.getItem('golfer_id');

  if (!roundId || !tournamentId || !golferId) {
    const container = document.getElementById("score-entry-content");
    container.innerHTML = "<p>Missing round, tournament, or golfer information.</p>";
    return;
  }

  const url = `${API_BASE_URL}/api/get_match_by_round.php?round_id=${roundId}&tournament_id=${tournamentId}&golfer_id=${golferId}`;

  fetch(url, { credentials: 'include' })
    .then(res => res.json())
    .then(data => {
      const matchGolfers = data.match;
      holeInfo = data.holes;

      if (data.error || !matchGolfers || matchGolfers.length === 0) {
        const container = document.getElementById("score-entry-content");
        container.innerHTML = `
          <div class="no-match-card">
            <img src="/images/cartoon.png" alt="Sandbagger" class="no-match-img">
            <h2 class="no-match-title">No Matchups Yet</h2>
            <p class="no-match-msg">The commissioner hasn't assigned matchups for this round. Check back soon!</p>
          </div>`;
        return;
      }

      // Set course data and tournament handicap percentage
      const firstMatch = matchGolfers[0];
      courses = {
        course_name: firstMatch.course_name,
        slope: firstMatch.slope,
        rating: firstMatch.rating,
        par: firstMatch.par
      };
      tournamentHandicapPct = parseFloat(data.tournament_handicap_pct || 100);

      // Check if finalized
      if (firstMatch && firstMatch.finalized && parseInt(firstMatch.finalized) === 1) {
        loadMatchScorecard(firstMatch.match_id, "score-entry-content");
        return;
      }

      const container = document.getElementById("score-entry-content");
      currentMatchId = firstMatch.match_id;

      // Group golfers by player_order
      // player_order 1,2 = Partnership 1
      // player_order 3,4 = Partnership 2
      const partnership1 = [];
      const partnership2 = [];

      matchGolfers.forEach(row => {
        const playerOrder = parseInt(row.player_order) || 1;
        const golferData = {
          id: row.golfer_id,
          name: row.first_name,
          handicap: calculatePlayingHandicap(row.handicap),
          player_order: playerOrder
        };

        if (playerOrder <= 2) {
          partnership1.push(golferData);
        } else {
          partnership2.push(golferData);
        }
      });

      // Combine all golfers for display, then adjust handicaps relative to lowest
      golfers = adjustHandicapsForMatch([...partnership1, ...partnership2]);

      // Build stroke maps from adjusted handicaps
      strokeMaps = {};
      golfers.forEach(g => {
        strokeMaps[g.id] = buildStrokeMapForGolfer(g.handicap, holeInfo);
      });

      // Create table
      const table = document.createElement("table");
      table.classList.add("score-table");

      // Build header row
      const header = document.createElement("tr");
      header.innerHTML = `<th></th><th>#</th><th>P</th><th>HI</th>` + golfers.map(golfer => {
        const bg = golfer.player_order <= 2 ? '#007bff' : '#28a745';
        const textColor = '#ffffff';
        return `<th style="background-color: ${bg}; color: ${textColor};">${golfer.name} (${parseFloat(golfer.handicap).toFixed(1)})</th>`;
      }).join("");
      table.appendChild(header);

      // Build score rows
      for (let i = 1; i <= 18; i++) {
        const row = document.createElement("tr");
        const par = holeInfo.find(h => h.hole_number === i)?.par || "-";
        const index = holeInfo.find(h => h.hole_number === i)?.handicap_index || "-";

        row.innerHTML = `<td class="match-result-cell" data-hole="${i}"></td><td>${i}</td><td>${par}</td><td>${index}</td>` + golfers.map(golfer => {
          const strokeCount = strokeMaps[golfer.id]?.[i] || 0;
          const select = `
            <select data-hole="${i}" data-golfer="${golfer.id}">
              <option value="">–</option>
              ${[...Array(12).keys()].map(n => `<option value="${n + 1}">${n + 1}</option>`).join("")}
            </select>
          `;

                    const dots = strokeDots(strokeCount);
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

          // Add team best-ball Out row
          const teamOutRow = document.createElement("tr");
          teamOutRow.classList.add("team-score-row");
          teamOutRow.style.fontWeight = "bold";
          teamOutRow.style.backgroundColor = "#f0f0f0";
          teamOutRow.innerHTML = `<td></td><td colspan="3" style="text-align: left; padding-left: 0.5rem;">Team (out)</td>` +
            `<td colspan="2" class="team-out-cell" data-partnership="1" style="background-color: #007bff; color: #ffffff; text-align: center;">–</td>` +
            `<td colspan="2" class="team-out-cell" data-partnership="2" style="background-color: #28a745; color: #ffffff; text-align: center;">–</td>`;
          table.appendChild(teamOutRow);
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

          // Add team best-ball In row
          const teamInRow = document.createElement("tr");
          teamInRow.classList.add("team-score-row");
          teamInRow.style.fontWeight = "bold";
          teamInRow.style.backgroundColor = "#f0f0f0";
          teamInRow.innerHTML = `<td></td><td colspan="3" style="text-align: left; padding-left: 0.5rem;">Team (in)</td>` +
            `<td colspan="2" class="team-in-cell" data-partnership="1" style="background-color: #007bff; color: #ffffff; text-align: center;">–</td>` +
            `<td colspan="2" class="team-in-cell" data-partnership="2" style="background-color: #28a745; color: #ffffff; text-align: center;">–</td>`;
          table.appendChild(teamInRow);
        }
      }

      // Totals row
      const totalsRow = document.createElement("tr");
      totalsRow.id = "totals-row";
      totalsRow.innerHTML = `<td></td><td></td><td></td><td></td>` + golfers.map(g => {
        return `<td class="totals-cell" data-golfer="${g.id}">–</td>`;
      }).join("");
      table.appendChild(totalsRow);

      // Add team best-ball Total row
      const teamTotalRow = document.createElement("tr");
      teamTotalRow.classList.add("team-score-row");
      teamTotalRow.style.fontWeight = "bold";
      teamTotalRow.style.backgroundColor = "#f0f0f0";
      teamTotalRow.innerHTML = `<td></td><td colspan="3" style="text-align: left; padding-left: 0.5rem;">Team (total)</td>` +
        `<td colspan="2" class="team-total-cell" data-partnership="1" style="background-color: #007bff; color: #ffffff; text-align: center;">–</td>` +
        `<td colspan="2" class="team-total-cell" data-partnership="2" style="background-color: #28a745; color: #ffffff; text-align: center;">–</td>`;
      table.appendChild(teamTotalRow);

      container.appendChild(table);

      // Finalize button
      let finalizeButton = document.getElementById("finalize-results-btn");
      if (!finalizeButton) {
        finalizeButton = document.createElement("button");
        finalizeButton.id = "finalize-results-btn";
        finalizeButton.textContent = "Finalize Match Results";
        finalizeButton.style.display = "none";
        container.appendChild(finalizeButton);
      }

      finalizeButton.onclick = function() {
        const points = calculateMatchPoints();
        fetch(`${API_BASE_URL}/api/finalize_match_result.php`, {
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
            showMatchResultsModal('guystrip', () => {
              finalizeButton.style.display = "none";
              loadGuysTripMatch();
            });
          } else {
            alert("Error finalizing results: " + (data.error || "Unknown error"));
          }
        });
      };

      // Load existing scores
      fetch(`${API_BASE_URL}/api/get_scores.php?match_id=${currentMatchId}`, {
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
        applyPendingScores(currentMatchId);
        calculateGuysTripBestBall();
        updateTotalScores();
        updateFinalizeButtonVisibility();
      })
      .catch(err => console.error("Error loading scores:", err));

      // Add change listeners
      table.querySelectorAll("select").forEach(select => {
        select.addEventListener("change", function() {
          const strokes = this.value;
          const hole = this.dataset.hole;
          const golfer_id = this.dataset.golfer;

          if (!strokes || !golfer_id || !hole) return;

          const payload = {
            match_id: currentMatchId,
            golfer_id: parseInt(golfer_id),
            hole: parseInt(hole),
            strokes: parseInt(strokes)
          };

          saveScore(payload, () => {
            refreshScores();
            calculateGuysTripBestBall();
            updateTotalScores();
            updateFinalizeButtonVisibility();
            updateScoreCellClasses();
          });
        });
      });
    })
    .catch(err => {
      console.error("Error loading Guys Trip match:", err);
    });
}

function calculateGuysTripBestBall() {
  // Similar to calculateBestBallStatus but uses player_order instead of team names
  const scoreMap = {}; // { holeNumber: { partnership1: [scores], partnership2: [scores] } }

  // Step 1: Organize NET scores by partnership and hole
  document.querySelectorAll("select[data-hole][data-golfer]").forEach(select => {
    const hole = parseInt(select.dataset.hole);
    const golferId = parseInt(select.dataset.golfer);
    const score = parseInt(select.value);
    if (!score || isNaN(score)) return;

    const golfer = golfers.find(g => g.id === golferId);
    if (!golfer) return;

    // Initialize scoreMap for the hole if it doesn't exist
    if (!scoreMap[hole]) {
      scoreMap[hole] = { partnership1: [], partnership2: [] };
    }

    // Subtract strokes for this golfer on this hole (NET score)
    const strokes = strokeMaps[golferId]?.[hole] || 0;
    const netScore = score - strokes;

    // Add to appropriate partnership based on player_order
    if (golfer.player_order <= 2) {
      scoreMap[hole].partnership1.push(netScore);
    } else {
      scoreMap[hole].partnership2.push(netScore);
    }
  });

  // Step 2: Walk through each hole and determine the score differential
  let differential = 0;

  for (let hole = 1; hole <= 18; hole++) {
    const holeCell = document.querySelector(`.match-result-cell[data-hole="${hole}"]`);
    if (!holeCell || !scoreMap[hole]) continue;

    const p1Best = Math.min(...scoreMap[hole].partnership1);
    const p2Best = Math.min(...scoreMap[hole].partnership2);

    if (!isFinite(p1Best) || !isFinite(p2Best)) continue; // not all scores in

    if (p1Best < p2Best) {
      differential += 1;
    } else if (p2Best < p1Best) {
      differential -= 1;
    }

    // Step 3: Update UI in the left column
    holeCell.textContent = Math.abs(differential); // show lead magnitude
    if (differential === 0) {
      holeCell.style.backgroundColor = "#000"; // tie = black
      holeCell.style.color = "#fff";
    } else if (differential > 0) {
      holeCell.style.backgroundColor = '#007bff'; // Partnership 1 lead (blue)
      holeCell.style.color = '#ffffff';
    } else {
      holeCell.style.backgroundColor = '#28a745'; // Partnership 2 lead (green)
      holeCell.style.color = '#ffffff';
    }
  }

  // Update team stroke play scores
  updateGuysTripTeamScores(scoreMap);
}

function updateGuysTripTeamScores(scoreMap) {
  // Calculate best-ball stroke play scores for each partnership
  const teamScores = {
    partnership1: { front9: 0, back9: 0, total: 0, front9ToPar: 0, back9ToPar: 0, totalToPar: 0, front9Count: 0, back9Count: 0, totalCount: 0 },
    partnership2: { front9: 0, back9: 0, total: 0, front9ToPar: 0, back9ToPar: 0, totalToPar: 0, front9Count: 0, back9Count: 0, totalCount: 0 }
  };

  // Calculate best ball scores for each hole
  for (let hole = 1; hole <= 18; hole++) {
    if (!scoreMap[hole]) continue;

    const p1Best = Math.min(...scoreMap[hole].partnership1);
    const p2Best = Math.min(...scoreMap[hole].partnership2);
    const holePar = holeInfo.find(h => h.hole_number === hole)?.par || 0;

    if (isFinite(p1Best)) {
      teamScores.partnership1.total += p1Best;
      teamScores.partnership1.totalToPar += (p1Best - holePar);
      teamScores.partnership1.totalCount++;
      if (hole <= 9) {
        teamScores.partnership1.front9 += p1Best;
        teamScores.partnership1.front9ToPar += (p1Best - holePar);
        teamScores.partnership1.front9Count++;
      } else {
        teamScores.partnership1.back9 += p1Best;
        teamScores.partnership1.back9ToPar += (p1Best - holePar);
        teamScores.partnership1.back9Count++;
      }
    }

    if (isFinite(p2Best)) {
      teamScores.partnership2.total += p2Best;
      teamScores.partnership2.totalToPar += (p2Best - holePar);
      teamScores.partnership2.totalCount++;
      if (hole <= 9) {
        teamScores.partnership2.front9 += p2Best;
        teamScores.partnership2.front9ToPar += (p2Best - holePar);
        teamScores.partnership2.front9Count++;
      } else {
        teamScores.partnership2.back9 += p2Best;
        teamScores.partnership2.back9ToPar += (p2Best - holePar);
        teamScores.partnership2.back9Count++;
      }
    }
  }

  // Helper function to format score like individual player scores
  function formatScore(strokes, toPar) {
    if (toPar === 0) {
      return `${strokes} (E)`;
    }
    return `${strokes} (${toPar > 0 ? "+" : ""}${toPar})`;
  }

  // Update front 9 scores
  const p1OutCell = document.querySelector('.team-out-cell[data-partnership="1"]');
  const p2OutCell = document.querySelector('.team-out-cell[data-partnership="2"]');
  if (p1OutCell) {
    p1OutCell.textContent = teamScores.partnership1.front9Count > 0
      ? formatScore(teamScores.partnership1.front9, teamScores.partnership1.front9ToPar)
      : '–';
  }
  if (p2OutCell) {
    p2OutCell.textContent = teamScores.partnership2.front9Count > 0
      ? formatScore(teamScores.partnership2.front9, teamScores.partnership2.front9ToPar)
      : '–';
  }

  // Update back 9 scores
  const p1InCell = document.querySelector('.team-in-cell[data-partnership="1"]');
  const p2InCell = document.querySelector('.team-in-cell[data-partnership="2"]');
  if (p1InCell) {
    p1InCell.textContent = teamScores.partnership1.back9Count > 0
      ? formatScore(teamScores.partnership1.back9, teamScores.partnership1.back9ToPar)
      : '–';
  }
  if (p2InCell) {
    p2InCell.textContent = teamScores.partnership2.back9Count > 0
      ? formatScore(teamScores.partnership2.back9, teamScores.partnership2.back9ToPar)
      : '–';
  }

  // Update total scores
  const p1TotalCell = document.querySelector('.team-total-cell[data-partnership="1"]');
  const p2TotalCell = document.querySelector('.team-total-cell[data-partnership="2"]');
  if (p1TotalCell) {
    p1TotalCell.textContent = teamScores.partnership1.totalCount > 0
      ? formatScore(teamScores.partnership1.total, teamScores.partnership1.totalToPar)
      : '–';
  }
  if (p2TotalCell) {
    p2TotalCell.textContent = teamScores.partnership2.totalCount > 0
      ? formatScore(teamScores.partnership2.total, teamScores.partnership2.totalToPar)
      : '–';
  }
}

function updateGuysTripTeamScoresReadOnly(golfers, strokeMaps, holeInfo) {
  // Calculate best-ball stroke play scores for each partnership (read-only version)
  const teamScores = {
    partnership1: { front9: 0, back9: 0, total: 0, front9ToPar: 0, back9ToPar: 0, totalToPar: 0, front9Count: 0, back9Count: 0, totalCount: 0 },
    partnership2: { front9: 0, back9: 0, total: 0, front9ToPar: 0, back9ToPar: 0, totalToPar: 0, front9Count: 0, back9Count: 0, totalCount: 0 }
  };

  // Organize NET scores by partnership and hole
  const scoreMap = {}; // { holeNumber: { partnership1: [scores], partnership2: [scores] } }

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
      scoreMap[hole] = { partnership1: [], partnership2: [] };
    }

    // Subtract strokes for this golfer on this hole (NET score)
    const strokes = strokeMaps[golferId]?.[hole] || 0;
    const netScore = score - strokes;

    // Add to appropriate partnership based on player_order
    if (golfer.player_order <= 2) {
      scoreMap[hole].partnership1.push(netScore);
    } else {
      scoreMap[hole].partnership2.push(netScore);
    }
  });

  // Calculate best ball scores for each hole
  for (let hole = 1; hole <= 18; hole++) {
    if (!scoreMap[hole]) continue;

    const p1Best = Math.min(...scoreMap[hole].partnership1);
    const p2Best = Math.min(...scoreMap[hole].partnership2);
    const holePar = holeInfo.find(h => h.hole_number === hole)?.par || 0;

    if (isFinite(p1Best)) {
      teamScores.partnership1.total += p1Best;
      teamScores.partnership1.totalToPar += (p1Best - holePar);
      teamScores.partnership1.totalCount++;
      if (hole <= 9) {
        teamScores.partnership1.front9 += p1Best;
        teamScores.partnership1.front9ToPar += (p1Best - holePar);
        teamScores.partnership1.front9Count++;
      } else {
        teamScores.partnership1.back9 += p1Best;
        teamScores.partnership1.back9ToPar += (p1Best - holePar);
        teamScores.partnership1.back9Count++;
      }
    }

    if (isFinite(p2Best)) {
      teamScores.partnership2.total += p2Best;
      teamScores.partnership2.totalToPar += (p2Best - holePar);
      teamScores.partnership2.totalCount++;
      if (hole <= 9) {
        teamScores.partnership2.front9 += p2Best;
        teamScores.partnership2.front9ToPar += (p2Best - holePar);
        teamScores.partnership2.front9Count++;
      } else {
        teamScores.partnership2.back9 += p2Best;
        teamScores.partnership2.back9ToPar += (p2Best - holePar);
        teamScores.partnership2.back9Count++;
      }
    }
  }

  // Helper function to format score like individual player scores
  function formatScore(strokes, toPar) {
    if (toPar === 0) {
      return `${strokes} (E)`;
    }
    return `${strokes} (${toPar > 0 ? "+" : ""}${toPar})`;
  }

  // Update front 9 scores
  const p1OutCell = document.querySelector('.team-out-cell-readonly[data-partnership="1"]');
  const p2OutCell = document.querySelector('.team-out-cell-readonly[data-partnership="2"]');
  if (p1OutCell) {
    p1OutCell.textContent = teamScores.partnership1.front9Count > 0
      ? formatScore(teamScores.partnership1.front9, teamScores.partnership1.front9ToPar)
      : '–';
  }
  if (p2OutCell) {
    p2OutCell.textContent = teamScores.partnership2.front9Count > 0
      ? formatScore(teamScores.partnership2.front9, teamScores.partnership2.front9ToPar)
      : '–';
  }

  // Update back 9 scores
  const p1InCell = document.querySelector('.team-in-cell-readonly[data-partnership="1"]');
  const p2InCell = document.querySelector('.team-in-cell-readonly[data-partnership="2"]');
  if (p1InCell) {
    p1InCell.textContent = teamScores.partnership1.back9Count > 0
      ? formatScore(teamScores.partnership1.back9, teamScores.partnership1.back9ToPar)
      : '–';
  }
  if (p2InCell) {
    p2InCell.textContent = teamScores.partnership2.back9Count > 0
      ? formatScore(teamScores.partnership2.back9, teamScores.partnership2.back9ToPar)
      : '–';
  }

  // Update total scores
  const p1TotalCell = document.querySelector('.team-total-cell-readonly[data-partnership="1"]');
  const p2TotalCell = document.querySelector('.team-total-cell-readonly[data-partnership="2"]');
  if (p1TotalCell) {
    p1TotalCell.textContent = teamScores.partnership1.totalCount > 0
      ? formatScore(teamScores.partnership1.total, teamScores.partnership1.totalToPar)
      : '–';
  }
  if (p2TotalCell) {
    p2TotalCell.textContent = teamScores.partnership2.totalCount > 0
      ? formatScore(teamScores.partnership2.total, teamScores.partnership2.totalToPar)
      : '–';
  }
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

// ── Match Results Modal ────────────────────────────────────────────────────

function buildMatchResultsData() {
  // Snapshot scores from the DOM before the page reloads
  const rawScores = {};
  document.querySelectorAll('select[data-hole][data-golfer]').forEach(sel => {
    const hole = parseInt(sel.dataset.hole);
    const gid  = parseInt(sel.dataset.golfer);
    const strokes = parseInt(sel.value);
    if (!isNaN(strokes) && strokes > 0) {
      if (!rawScores[gid]) rawScores[gid] = {};
      rawScores[gid][hole] = strokes;
    }
  });

  return golfers.map(g => {
    let gross = 0;
    let totalHcpStrokes = 0;
    const birdiesAndBetter = [];

    for (let h = 1; h <= 18; h++) {
      const strokes = rawScores[g.id]?.[h];
      if (!strokes) continue;
      const par       = holeInfo.find(hi => hi.hole_number === h)?.par || 4;
      const hcpStrokes = strokeMaps[g.id]?.[h] || 0;

      gross         += strokes;
      totalHcpStrokes += hcpStrokes;

      if (strokes <= par - 1) {
        const diff = strokes - par;
        birdiesAndBetter.push({
          hole: h, par, strokes, diff,
          label: diff <= -3 ? 'Albatross' : diff <= -2 ? 'Eagle' : 'Birdie',
          icon:  diff <= -2 ? '🦅' : '🐦'
        });
      }
    }

    return {
      golfer: g,
      gross: gross || null,
      net:   gross ? gross - totalHcpStrokes : null,
      birdiesAndBetter
    };
  });
}

function calculateMatchPlayResult(matchType) {
  // Compute hole-by-hole best-ball match play differential.
  // Returns { winnerNames, resultString } or { winnerNames: null, resultString: 'All Square' }.
  // matchType controls how golfers are grouped into two sides:
  //   'bestball'   – golfer.team === primaryTeamName / secondaryTeamName
  //   'tournament' – same (real team names from DB)
  //   'guystrip'   – player_order ≤ 2  vs  player_order > 2

  const localMaps = {};
  golfers.forEach(g => {
    localMaps[g.id] = buildStrokeMapForGolfer(g.handicap, holeInfo);
  });

  const byHole = {};
  document.querySelectorAll('select[data-hole][data-golfer]').forEach(sel => {
    const strokes = parseInt(sel.value);
    const h  = parseInt(sel.dataset.hole);
    const gid = parseInt(sel.dataset.golfer);
    const g  = golfers.find(x => x.id == gid);
    if (!g || isNaN(strokes) || strokes <= 0) return;
    const net = strokes - (localMaps[g.id]?.[h] || 0);
    if (!byHole[h]) byHole[h] = { g1: [], g2: [] };

    if (matchType === 'guystrip') {
      const side = g.player_order <= 2 ? 'g1' : 'g2';
      byHole[h][side].push(net);
    } else {
      // bestball & tournament: use golfer.team string
      if (g.team === primaryTeamName)   byHole[h].g1.push(net);
      else if (g.team === secondaryTeamName) byHole[h].g2.push(net);
    }
  });

  let diff = 0; // positive = side 1 leads, negative = side 2 leads
  let endedAt = null;

  for (let h = 1; h <= 18; h++) {
    const hole = byHole[h];
    if (!hole || !hole.g1.length || !hole.g2.length) continue;
    const t1 = Math.min(...hole.g1);
    const t2 = Math.min(...hole.g2);
    if (!isFinite(t1) || !isFinite(t2)) continue;
    if (t1 < t2) diff++;
    else if (t2 < t1) diff--;
    if (Math.abs(diff) > (18 - h)) { endedAt = h; break; }
  }

  const holesUp      = Math.abs(diff);
  const resultString = diff === 0 ? 'All Square'
    : endedAt !== null ? `${holesUp}&${18 - endedAt}`
    : `${holesUp} UP`;

  if (diff === 0) return { winnerNames: null, resultString };

  // Build winner display name(s)
  let winnerNames;
  if (matchType === 'guystrip') {
    const winners = diff > 0
      ? golfers.filter(g => g.player_order <= 2)
      : golfers.filter(g => g.player_order > 2);
    winnerNames = winners.map(g => g.name).join(' and ');
  } else if (matchType === 'bestball') {
    const winnerTeam = diff > 0 ? primaryTeamName : secondaryTeamName;
    winnerNames = golfers.filter(g => g.team === winnerTeam).map(g => g.name).join(' and ');
  } else {
    // tournament (Ryder Cup): use the team name itself
    winnerNames = diff > 0 ? primaryTeamName : secondaryTeamName;
  }

  return { winnerNames, resultString };
}

function showMatchResultsModal(matchType, onDone) {
  const results = buildMatchResultsData();

  // Determine winner headline using match play format for all contexts
  let winnerHtml = '';
  try {
    const { winnerNames, resultString } = calculateMatchPlayResult(matchType);
    if (winnerNames === null) {
      winnerHtml = `<p class="winner-display">All Square 🤝</p>`;
    } else {
      // "team name wins" (singular) vs "player names win" (plural)
      const verb = matchType === 'tournament' ? 'wins' : 'win';
      winnerHtml = `<p class="winner-display">${winnerNames} ${verb} ${resultString}! 🏆</p>`;
    }
  } catch (e) { /* skip if data not available */ }

  // Score table — sorted by net (ascending), then gross as tiebreaker
  const withScores = results.filter(r => r.gross !== null);
  withScores.sort((a, b) => a.net - b.net || a.gross - b.gross);
  const medals = ['🥇', '🥈', '🥉'];

  const scoreRows = withScores.map((r, i) => `
    <tr>
      <td>${medals[i] || ''} <strong>${r.golfer.name} ${r.golfer.lastName || ''}</strong></td>
      <td>${r.gross}</td>
      <td style="font-weight:700;">${r.net}</td>
    </tr>`).join('');

  // Birdies & better — all golfers, sorted by hole
  const allBirdies = [];
  results.forEach(r => {
    r.birdiesAndBetter.forEach(b => {
      allBirdies.push({ ...b, golferName: `${r.golfer.name} ${r.golfer.lastName || ''}` });
    });
  });
  allBirdies.sort((a, b) => a.hole - b.hole);

  const birdieHtml = allBirdies.length > 0 ? `
    <div style="margin-top:var(--space-6);">
      <h3 class="section-header">Birdies &amp; Better</h3>
      <div style="display:flex; flex-direction:column; gap:var(--space-2); margin-top:var(--space-3);">
        ${allBirdies.map(b => `
          <div class="birdie-item">
            ${b.icon} <strong>${b.golferName}</strong> &mdash; ${b.label} on Hole ${b.hole}
            <span style="color:var(--color-text-muted); font-size:var(--font-size-xs);">&nbsp;(${b.strokes} on par ${b.par})</span>
          </div>`).join('')}
      </div>
    </div>` : `
    <div style="margin-top:var(--space-6); text-align:center; color:var(--color-text-muted); font-size:var(--font-size-sm);">
      No birdies this round — get &rsquo;em next time! ⛳
    </div>`;

  document.getElementById('match-results-body').innerHTML = `
    <div style="text-align:center; margin-bottom:var(--space-5);">
      <div style="font-size:3rem; line-height:1; margin-bottom:var(--space-3);">🏆</div>
      <h2 class="modal-title">Match Complete!</h2>
      ${courses && courses.course_name
        ? `<p class="tournament-card-dates" style="margin-top:var(--space-1);">${courses.course_name}</p>`
        : ''}
      ${winnerHtml}
    </div>

    <h3 class="section-header">Scores</h3>
    <table class="results-score-table">
      <thead>
        <tr>
          <th>Golfer</th>
          <th>Gross</th>
          <th>Net</th>
        </tr>
      </thead>
      <tbody>${scoreRows}</tbody>
    </table>

    ${birdieHtml}
  `;

  // Wire Done button
  const doneBtn = document.getElementById('match-results-done-btn');
  doneBtn.onclick = function() {
    document.getElementById('match-results-modal').style.display = 'none';
    if (typeof onDone === 'function') onDone();
  };

  document.getElementById('match-results-modal').style.display = 'flex';
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
  const roundId = sessionStorage.getItem('selected_round_id');
  const tournamentId = sessionStorage.getItem('selected_tournament_id');

  if (!roundId || !tournamentId) {
    const container = document.getElementById("today-summary");
    container.innerHTML = "<p>Missing round or tournament information.</p>";
    return;
  }

  fetch(`${API_BASE_URL}/api/get_round_matches.php?round_id=${roundId}&tournament_id=${tournamentId}`, { credentials: 'include' })
    .then(res => res.json())
    .then(matches => {
      const container = document.getElementById("today-summary");
      container.innerHTML = "";

      if (!Array.isArray(matches) || matches.length === 0) {
        container.innerHTML = `
          <div class="no-match-card">
            <img src="/images/cartoon.png" alt="Sandbagger" class="no-match-img">
            <h2 class="no-match-title">No Matchups Yet</h2>
            <p class="no-match-msg">The commissioner hasn't assigned matchups for this round. Check back soon!</p>
          </div>`;
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
            fetch(`${API_BASE_URL}/api/get_individual_skins.php?round_id=${roundId}&tournament_id=${tournamentId}`, { credentials: 'include' })
              .then(res => res.json())
              .then(data => {
                // Handle both new format (object with skins and skins_total) and old format (array)
                const skins = Array.isArray(data) ? data : (data.skins || []);
                const skinsTotal = data.skins_total || 450; // fallback to 450 if not set
                
                skinsContainer.innerHTML = `<h3>Individual Skins (handicap counts for 0.5)</h3>`;
                
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
            
                skinsContainer.innerHTML = `<h3>Individual Skins (handicap counts for 0.5)</h3>`;
                skinsContainer.appendChild(table);
              })
              .catch(err => {
                console.error("Error loading skins:", err);
                skinsContainer.innerHTML += "<p>Error loading skins.</p>";
              });
              
        fetch(`${API_BASE_URL}/api/get_gross_leaderboard.php?round_id=${roundId}&tournament_id=${tournamentId}`, { credentials: 'include' })
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
        fetch(`${API_BASE_URL}/api/get_net_leaderboard.php?round_id=${roundId}&tournament_id=${tournamentId}`, { credentials: 'include' })
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

function loadSkinsGroupScorecard(matchId) {
  const container    = document.getElementById('today-summary');
  const tournamentId = sessionStorage.getItem('selected_tournament_id');

  container.innerHTML = '<p style="color:var(--color-text-muted); text-align:center; padding:2rem;">Loading scorecard…</p>';

  // Back button
  const backBtn = document.createElement('button');
  backBtn.className = 'history-back-btn';
  backBtn.textContent = '← Back to Round';
  backBtn.style.marginBottom = 'var(--space-4)';
  backBtn.addEventListener('click', () => loadSkinsSummary());

  fetch(`${API_BASE_URL}/api/get_match_by_id.php?match_id=${matchId}&tournament_id=${tournamentId}`, { credentials: 'include' })
    .then(r => r.json())
    .then(data => {
      const matchGolfers = data.match;
      holeInfo = data.holes || holeInfo;

      container.innerHTML = '';
      container.appendChild(backBtn);

      if (!matchGolfers || matchGolfers.length === 0) {
        container.innerHTML += '<p>No scorecard data available.</p>';
        return;
      }

      // Build golfer list — straight playing handicaps, no adjustment
      const localGolfers = matchGolfers
        .filter((row, idx, arr) => arr.findIndex(r => r.golfer_id === row.golfer_id) === idx)
        .sort((a, b) => a.player_order - b.player_order)
        .map(row => ({
          id:       row.golfer_id,
          name:     row.first_name,
          handicap: calculatePlayingHandicap(parseFloat(row.handicap))
        }));

      const localStrokeMaps = {};
      localGolfers.forEach(g => {
        localStrokeMaps[g.id] = buildStrokeMapForGolfer(g.handicap, holeInfo);
      });

      const frontPar = holeInfo.filter(h => h.hole_number <= 9).reduce((s, h) => s + (h.par || 0), 0);
      const backPar  = holeInfo.filter(h => h.hole_number >= 10).reduce((s, h) => s + (h.par || 0), 0);

      // Group name heading
      const groupNames = localGolfers.map(g => g.name).join(', ');
      const heading = document.createElement('h3');
      heading.className = 'section-header';
      heading.style.marginBottom = 'var(--space-4)';
      heading.textContent = groupNames;
      container.appendChild(heading);

      // Table — no match-result column
      const table = document.createElement('table');
      table.classList.add('score-table');

      // Header
      const header = document.createElement('tr');
      header.innerHTML = `<th>#</th><th>P</th><th>HI</th>` + localGolfers.map(g =>
        `<th style="background:var(--color-brand-primary); color:#fff;">${g.name} (${parseFloat(g.handicap).toFixed(1)})</th>`
      ).join('');
      table.appendChild(header);

      for (let i = 1; i <= 18; i++) {
        const par = holeInfo.find(h => h.hole_number === i)?.par || '-';
        const hi  = holeInfo.find(h => h.hole_number === i)?.handicap_index || '-';

        const row = document.createElement('tr');
        row.innerHTML = `<td>${i}</td><td>${par}</td><td>${hi}</td>` + localGolfers.map(g => {
          const dots = strokeDots(localStrokeMaps[g.id]?.[i] || 0);
          return `<td class="readonly-score-cell" data-hole="${i}" data-golfer="${g.id}" style="position:relative;">${dots}</td>`;
        }).join('');
        table.appendChild(row);

        if (i === 9) {
          const outRow = document.createElement('tr');
          outRow.classList.add('subtotal-row');
          outRow.innerHTML = `<td>Out</td><td>${frontPar}</td><td></td>` +
            localGolfers.map(g => `<td class="out-subtotal-cell-readonly" data-golfer="${g.id}">–</td>`).join('');
          table.appendChild(outRow);
        }
        if (i === 18) {
          const inRow = document.createElement('tr');
          inRow.classList.add('subtotal-row');
          inRow.innerHTML = `<td>In</td><td>${backPar}</td><td></td>` +
            localGolfers.map(g => `<td class="in-subtotal-cell-readonly" data-golfer="${g.id}">–</td>`).join('');
          table.appendChild(inRow);
        }
      }

      // Total row
      const totalRow = document.createElement('tr');
      totalRow.innerHTML = `<td colspan="3" style="font-weight:700; text-align:left; padding-left:0.5rem;">Total</td>` +
        localGolfers.map(g => `<td class="totals-cell" data-golfer="${g.id}">–</td>`).join('');
      table.appendChild(totalRow);

      container.appendChild(table);

      // Load and populate scores
      fetch(`${API_BASE_URL}/api/get_scores.php?match_id=${matchId}`, { credentials: 'include' })
        .then(r => r.json())
        .then(scores => {
          scores.forEach(score => {
            const cell = container.querySelector(`td.readonly-score-cell[data-hole="${score.hole_number}"][data-golfer="${score.golfer_id}"]`);
            if (cell) {
              const par     = holeInfo.find(h => h.hole_number == score.hole_number)?.par;
              const strokes = parseInt(score.strokes);
              cell.classList.remove('score-birdie', 'score-bogey', 'score-par', 'score-eagle');
              if (!isNaN(par) && !isNaN(strokes)) {
                if (strokes <= par - 2)      cell.classList.add('score-eagle');
                else if (strokes === par - 1) cell.classList.add('score-birdie');
                else if (strokes === par)     cell.classList.add('score-par');
                else                          cell.classList.add('score-bogey');
              }
              const dots = strokeDots(localStrokeMaps[score.golfer_id]?.[score.hole_number] || 0);
              cell.innerHTML = `${dots}${strokes}`;
            }
          });
          updateTotalScoresReadOnly(localGolfers, holeInfo);
        })
        .catch(err => console.error('Error loading scorecard scores:', err));
    })
    .catch(err => {
      console.error('Error loading Skins scorecard:', err);
      container.innerHTML = '<p>Error loading scorecard.</p>';
    });
}

function loadSkinsSummary() {
  const roundId      = sessionStorage.getItem('selected_round_id');
  const tournamentId = sessionStorage.getItem('selected_tournament_id');
  const golferId     = currentUser?.golfer_id || sessionStorage.getItem('golfer_id');
  const container    = document.getElementById('today-summary');

  if (!roundId || !tournamentId) {
    container.innerHTML = '<p>Missing round or tournament information.</p>';
    return;
  }

  container.innerHTML = '<p style="color:var(--color-text-muted); text-align:center; padding:2rem;">Loading…</p>';

  // Always fetch match data so we have course info (slope/rating/pct) for handicap calc
  const matchDataPromise = fetch(
    `${API_BASE_URL}/api/get_match_by_round.php?round_id=${roundId}&tournament_id=${tournamentId}&golfer_id=${golferId}`,
    { credentials: 'include' }
  ).then(r => r.json()).then(d => {
    if (d.holes) holeInfo = d.holes;
    // Capture course globals needed by calculatePlayingHandicap
    if (d.match && d.match[0]) {
      courses = {
        course_name: d.match[0].course_name,
        slope:       d.match[0].slope,
        rating:      d.match[0].rating,
        par:         d.match[0].par
      };
    }
    if (d.tournament_handicap_pct != null) {
      tournamentHandicapPct = parseFloat(d.tournament_handicap_pct);
    }
    return d;
  }).catch(() => ({}));

  Promise.all([
    fetch(`${API_BASE_URL}/api/get_net_leaderboard.php?round_id=${roundId}&tournament_id=${tournamentId}`, { credentials: 'include' }).then(r => r.json()),
    fetch(`${API_BASE_URL}/api/get_gross_leaderboard.php?round_id=${roundId}&tournament_id=${tournamentId}`, { credentials: 'include' }).then(r => r.json()),
    fetch(`${API_BASE_URL}/api/get_individual_skins.php?round_id=${roundId}&tournament_id=${tournamentId}`, { credentials: 'include' }).then(r => r.json()),
    fetch(`${API_BASE_URL}/api/get_round_matches.php?round_id=${roundId}&tournament_id=${tournamentId}`, { credentials: 'include' }).then(r => r.json()),
    matchDataPromise
  ])
  .then(([netData, grossData, skinsData, roundMatches]) => {
    container.innerHTML = '';

    // ── Helpers ───────────────────────────────────────────────────────────────
    const section = (title) => {
      const h = document.createElement('h3');
      h.className = 'section-header';
      h.style.marginBottom = 'var(--space-4)';
      h.textContent = title;
      return h;
    };

    const toParStr = (diff) => diff === 0 ? 'E' : (diff > 0 ? `+${diff}` : `${diff}`);
    const thruStr  = (holes) => holes >= 18 ? 'F' : (holes || 0);

    // ── Net best-ball calculator for a group ────────────────────────────────
    // Returns { toPar, holesPlayed } using straight playing handicaps
    const calcGroupBestBall = (golfers, scores) => {
      if (!courses || !courses.slope || !holeInfo || holeInfo.length === 0) return null;

      const slope  = parseFloat(courses.slope);
      const rating = parseFloat(courses.rating);
      const pct    = parseFloat(tournamentHandicapPct || 100);

      // Playing handicap + stroke map per golfer
      const localStrokeMaps = {};
      golfers.forEach(g => {
        const courseHcp  = (parseFloat(g.handicap) * (slope / 113)) + (rating - 72);
        const playingHcp = Math.round(courseHcp * pct / 100 * 10) / 10;
        localStrokeMaps[g.golfer_id] = buildStrokeMapForGolfer(playingHcp, holeInfo);
      });

      // Group scores by hole
      const byHole = {};
      scores.forEach(s => {
        if (!byHole[s.hole_number]) byHole[s.hole_number] = [];
        byHole[s.hole_number].push(s);
      });

      let bestBallTotal = 0;
      let parTotal      = 0;
      let holesPlayed   = 0;

      holeInfo.forEach(hole => {
        const holeScores = byHole[hole.hole_number] || [];
        if (holeScores.length === 0) return;
        let bestNet = Infinity;
        holeScores.forEach(s => {
          const strokes = parseInt(s.strokes);
          if (isNaN(strokes)) return;
          const strokeAdj = localStrokeMaps[s.golfer_id]?.[hole.hole_number] || 0;
          const net = strokes - strokeAdj;
          if (net < bestNet) bestNet = net;
        });
        if (isFinite(bestNet)) {
          bestBallTotal += bestNet;
          parTotal      += (hole.par || 0);
          holesPlayed++;
        }
      });

      return holesPlayed === 0 ? null : { toPar: bestBallTotal - parTotal, holesPlayed };
    };

    // ── Groups in this round ─────────────────────────────────────────────────
    const groupsDiv = document.createElement('div');
    groupsDiv.style.marginBottom = 'var(--space-6)';
    groupsDiv.appendChild(section('Groups'));

    const matches = Array.isArray(roundMatches) ? roundMatches : [];
    if (matches.length === 0) {
      groupsDiv.innerHTML += '<p style="color:var(--color-text-muted); font-size:var(--font-size-sm);">No groups assigned yet.</p>';
    } else {
      matches.forEach((match, idx) => {
        const sortedGolfers = (match.golfers || []).sort((a, b) => a.player_order - b.player_order);
        const names = sortedGolfers.map(g => g.first_name || g.name).join(', ');

        const bb = calcGroupBestBall(sortedGolfers, match.scores || []);
        const bbLabel = bb
          ? `<span style="font-size:var(--font-size-xs); font-weight:700; color:${bb.toPar <= 0 ? 'var(--color-action-success)' : 'var(--color-action-danger)'};">
               Team Best Ball: ${toParStr(bb.toPar)} thru ${bb.holesPlayed}
             </span>`
          : `<span style="font-size:var(--font-size-xs); color:var(--color-text-muted);">No scores yet</span>`;

        const card = document.createElement('div');
        card.className = 'match-summary';
        card.style.cssText = 'cursor:pointer; display:flex; justify-content:space-between; align-items:center; gap:0.5rem;';
        card.innerHTML = `
          <div style="flex:1; min-width:0;">
            <div style="font-weight:700; font-size:var(--font-size-base);">Group ${idx + 1}</div>
            <div style="font-size:var(--font-size-sm); color:var(--color-text-secondary); margin-top:1px;">${names}</div>
            <div style="margin-top:4px;">${bbLabel}</div>
          </div>
          <span style="font-size:var(--font-size-sm); color:var(--color-brand-primary); font-weight:700; flex-shrink:0;">Scorecard →</span>
        `;
        card.addEventListener('click', () => loadSkinsGroupScorecard(match.match_id));
        groupsDiv.appendChild(card);
      });
    }
    container.appendChild(groupsDiv);

    // ── Net Leaderboard ───────────────────────────────────────────────────────
    const netDiv = document.createElement('div');
    netDiv.style.marginBottom = 'var(--space-6)';
    netDiv.appendChild(section('Net Leaderboard'));

    const netGolfers = Array.isArray(netData) ? netData : [];
    if (netGolfers.length === 0) {
      netDiv.innerHTML += '<p style="color:var(--color-text-muted); font-size:var(--font-size-sm);">No scores entered yet.</p>';
    } else {
      netGolfers.sort((a, b) => (a.net_strokes - a.par) - (b.net_strokes - b.par));
      const t = document.createElement('table');
      t.classList.add('leaderboard-table');
      t.innerHTML = '<tr><th>Rank</th><th>Player</th><th>Net</th><th>Thru</th></tr>';
      netGolfers.forEach((g, i) => {
        const diff = g.net_strokes - g.par;
        t.innerHTML += `<tr><td>${i + 1}</td><td>${g.name}</td><td>${toParStr(diff)}</td><td>${thruStr(g.holes_played)}</td></tr>`;
      });
      netDiv.appendChild(t);
    }
    container.appendChild(netDiv);

    // ── Gross Leaderboard ─────────────────────────────────────────────────────
    const grossDiv = document.createElement('div');
    grossDiv.style.marginBottom = 'var(--space-6)';
    grossDiv.appendChild(section('Gross Leaderboard'));

    const grossGolfers = Array.isArray(grossData) ? grossData : [];
    if (grossGolfers.length === 0) {
      grossDiv.innerHTML += '<p style="color:var(--color-text-muted); font-size:var(--font-size-sm);">No scores entered yet.</p>';
    } else {
      grossGolfers.sort((a, b) => (a.strokes - a.par) - (b.strokes - b.par));
      const t = document.createElement('table');
      t.classList.add('leaderboard-table');
      t.innerHTML = '<tr><th>Rank</th><th>Player</th><th>Gross</th><th>Thru</th></tr>';
      grossGolfers.forEach((g, i) => {
        const diff = g.strokes - g.par;
        t.innerHTML += `<tr><td>${i + 1}</td><td>${g.name}</td><td>${toParStr(diff)}</td><td>${thruStr(g.holes_played)}</td></tr>`;
      });
      grossDiv.appendChild(t);
    }
    container.appendChild(grossDiv);

    // ── Skins ─────────────────────────────────────────────────────────────────
    const skinsDiv = document.createElement('div');
    skinsDiv.style.marginBottom = 'var(--space-6)';
    skinsDiv.appendChild(section('Skins'));

    const skins = Array.isArray(skinsData) ? skinsData : (skinsData.skins || []);
    if (skins.length === 0) {
      skinsDiv.innerHTML += '<p style="color:var(--color-text-muted); font-size:var(--font-size-sm);">No skins won yet.</p>';
    } else {
      const t = document.createElement('table');
      t.classList.add('skins-table');
      t.innerHTML = '<tr><th>Hole</th><th>Player</th><th>Net</th></tr>';
      skins.forEach(s => {
        t.innerHTML += `<tr><td>${s.hole}</td><td>${s.golfer_name}</td><td>${s.net_score}</td></tr>`;
      });
      skinsDiv.appendChild(t);
    }
    container.appendChild(skinsDiv);
  })
  .catch(err => {
    console.error('Error loading Skins summary:', err);
    container.innerHTML = '<p style="color:var(--color-action-danger);">Error loading round data.</p>';
  });
}

function loadGuysTripSummary() {
  const roundId = sessionStorage.getItem('selected_round_id');
  const tournamentId = sessionStorage.getItem('selected_tournament_id');
  const golferId = currentUser?.golfer_id || sessionStorage.getItem('golfer_id');

  if (!roundId || !tournamentId) {
    const container = document.getElementById("today-summary");
    container.innerHTML = "<p>Missing round or tournament information.</p>";
    return;
  }

  // Fetch holes data if not already available
  const holesPromise = holeInfo && holeInfo.length > 0
    ? Promise.resolve(holeInfo)
    : fetch(`${API_BASE_URL}/api/get_match_by_round.php?round_id=${roundId}&tournament_id=${tournamentId}&golfer_id=${golferId}`, { credentials: 'include' })
        .then(res => res.json())
        .then(data => {
          if (data.holes) {
            holeInfo = data.holes;
            return data.holes;
          }
          return [];
        })
        .catch(() => []);

  Promise.all([
    fetch(`${API_BASE_URL}/api/get_round_matches.php?round_id=${roundId}&tournament_id=${tournamentId}`, { credentials: 'include' }).then(res => res.json()),
    holesPromise
  ])
    .then(([matches, holes]) => {
      const container = document.getElementById("today-summary");
      container.innerHTML = "";

      if (!Array.isArray(matches) || matches.length === 0) {
        container.innerHTML = `
          <div class="no-match-card">
            <img src="/images/cartoon.png" alt="Sandbagger" class="no-match-img">
            <h2 class="no-match-title">No Matchups Yet</h2>
            <p class="no-match-msg">The commissioner hasn't assigned matchups for this round. Check back soon!</p>
          </div>`;
        return;
      }

      container.innerHTML = "<h3>Matches (click match to see scorecard)</h3>";

      // Render matches - we'll use holeInfo from global scope if available
      matches.forEach(match => {
        const div = document.createElement("div");
        div.className = "match-summary";

        // Filter golfers by player_order (1,2 = Partnership 1, 3,4 = Partnership 2)
        const partnership1Golfers = match.golfers.filter(g => {
          const order = parseInt(g.player_order) || 1;
          return order <= 2;
        });
        const partnership2Golfers = match.golfers.filter(g => {
          const order = parseInt(g.player_order) || 1;
          return order > 2;
        });

        const partnership1Names = partnership1Golfers.map(g => g.first_name).join(" & ");
        const partnership2Names = partnership2Golfers.map(g => g.first_name).join(" & ");

        // Header with names
        const header = `
          <div class="teams-row">
            <div class="team-box" style="background-color: #007bff; color: white;">${partnership1Names}</div>
            <div class="vs">vs</div>
            <div class="team-box" style="background-color: #28a745; color: white;">${partnership2Names}</div>
          </div>`;

        // Get status - for Guys Trip, show stroke play scores
        const status = calculateGuysTripMatchStatus(partnership1Golfers, partnership2Golfers, match.scores);
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
      fetch(`${API_BASE_URL}/api/get_individual_skins.php?round_id=${roundId}&tournament_id=${tournamentId}`, { credentials: 'include' })
        .then(res => res.json())
        .then(data => {
          // Handle both new format (object with skins and skins_total) and old format (array)
          const skins = Array.isArray(data) ? data : (data.skins || []);
          const skinsTotal = data.skins_total || 450; // fallback to 450 if not set

          skinsContainer.innerHTML = `<h3>Individual Skins (handicap counts for 0.5)</h3>`;

          if (!Array.isArray(skins) || skins.length === 0) {
            skinsContainer.innerHTML += "<p>No skins awarded yet.</p>";
            return;
          }

          const table = document.createElement("table");
          table.classList.add("skins-table");

          const header = document.createElement("tr");
          header.innerHTML = "<th>Hole</th><th>Player</th><th>Net Score</th>";
          table.appendChild(header);

          skins.forEach(skin => {
            const row = document.createElement("tr");
            row.innerHTML = `
              <td>${skin.hole}</td>
              <td>${skin.golfer_name}</td>
              <td>${skin.net_score}</td>
            `;
            table.appendChild(row);
          });

          skinsContainer.innerHTML = `<h3>Individual Skins (handicap counts for 0.5)</h3>`;
          skinsContainer.appendChild(table);
        })
        .catch(err => {
          console.error("Error loading skins:", err);
          skinsContainer.innerHTML += "<p>Error loading skins.</p>";
        });

      // Individual Gross Leaderboard
      fetch(`${API_BASE_URL}/api/get_gross_leaderboard.php?round_id=${roundId}&tournament_id=${tournamentId}`, { credentials: 'include' })
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

          const header = `<tr><th>Rank</th><th>Name</th><th>To Par</th><th>Thru</th></tr>`;
          table.innerHTML = header;

          golfers.forEach((g, i) => {
            const toPar = g.strokes - g.par;
            const toParStr = toPar === 0 ? "E" : (toPar > 0 ? `+${toPar}` : `${toPar}`);

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
              <td>${toParStr}</td>
              <td>${thruNum}</td>
            `;
            table.appendChild(row);
          });

          leaderboardDiv.appendChild(table);
          document.getElementById("today-summary").appendChild(leaderboardDiv);
        })
        .catch(err => console.error("Gross leaderboard error:", err));

      // Individual Net Leaderboard
      fetch(`${API_BASE_URL}/api/get_net_leaderboard.php?round_id=${roundId}&tournament_id=${tournamentId}`, { credentials: 'include' })
        .then(res => res.json())
        .then(golfers => {
          if (!Array.isArray(golfers) || golfers.length === 0) return;

          const netDiv = document.createElement("div");
          netDiv.className = "net-leaderboard";
          netDiv.innerHTML = "<h3>Individual Round Leaderboard - Net</h3>";

          const table = document.createElement("table");
          table.classList.add("leaderboard-table");

          // Sort golfers by net score to par
          golfers.sort((a, b) => (a.net_strokes - a.par) - (b.net_strokes - b.par));

          const header = `<tr><th>Rank</th><th>Name</th><th>To Par</th><th>Thru</th></tr>`;
          table.innerHTML = header;

          golfers.forEach((g, i) => {
            const toPar = g.net_strokes - g.par;
            const toParStr = toPar === 0 ? "E" : (toPar > 0 ? `+${toPar}` : `${toPar}`);

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
              <td>${toParStr}</td>
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




// Calculate Guys Trip stroke play status for match cards
function calculateGuysTripMatchStatus(partnership1Golfers, partnership2Golfers, scores, holes) {
  // If no hole info available, use global holeInfo if it exists
  const holesData = holes || holeInfo;
  if (!holesData) {
    return "No scores yet";
  }

  const allGolfers = partnership1Golfers.concat(partnership2Golfers);

  // Build stroke maps using match-adjusted handicaps (lowest = 0)
  const strokeMaps = {};
  const guysTripPlayingHcps = allGolfers.map(g => calculatePlayingHandicap(g.handicap));
  const guysTripMinHcp = Math.min(...guysTripPlayingHcps);
  allGolfers.forEach((golfer, i) => {
    strokeMaps[golfer.golfer_id] = buildStrokeMapForGolfer(guysTripPlayingHcps[i] - guysTripMinHcp, holesData);
  });

  // Organize NET scores by partnership and hole
  const scoresByHole = {}; // { holeNumber: { partnership1: [scores], partnership2: [scores] } }

  scores.forEach(s => {
    const holeNum = parseInt(s.hole_number);
    const golfer = allGolfers.find(g => g.golfer_id == s.golfer_id);
    if (!golfer || !strokeMaps[golfer.golfer_id]) return;

    const strokesReceived = strokeMaps[golfer.golfer_id][holeNum] || 0;
    const netScore = parseInt(s.strokes) - strokesReceived;

    if (!scoresByHole[holeNum]) {
      scoresByHole[holeNum] = { partnership1: [], partnership2: [] };
    }

    // Determine partnership based on player_order
    const playerOrder = parseInt(golfer.player_order) || 1;
    const partnership = playerOrder <= 2 ? 'partnership1' : 'partnership2';
    scoresByHole[holeNum][partnership].push(netScore);
  });

  // Calculate best-ball stroke play scores
  const teamScores = {
    partnership1: { total: 0, toPar: 0, count: 0 },
    partnership2: { total: 0, toPar: 0, count: 0 }
  };

  for (let hole = 1; hole <= 18; hole++) {
    if (!scoresByHole[hole]) continue;

    const p1Best = scoresByHole[hole].partnership1.length > 0 ? Math.min(...scoresByHole[hole].partnership1) : null;
    const p2Best = scoresByHole[hole].partnership2.length > 0 ? Math.min(...scoresByHole[hole].partnership2) : null;
    const holePar = holesData.find(h => h.hole_number === hole)?.par || 0;

    if (p1Best !== null && isFinite(p1Best)) {
      teamScores.partnership1.total += p1Best;
      teamScores.partnership1.toPar += (p1Best - holePar);
      teamScores.partnership1.count++;
    }

    if (p2Best !== null && isFinite(p2Best)) {
      teamScores.partnership2.total += p2Best;
      teamScores.partnership2.toPar += (p2Best - holePar);
      teamScores.partnership2.count++;
    }
  }

  // If no scores yet
  if (teamScores.partnership1.count === 0 && teamScores.partnership2.count === 0) {
    return "No scores yet";
  }

  // Format score display
  function formatScore(strokes, toPar) {
    if (toPar === 0) {
      return `${strokes} (E)`;
    }
    return `${strokes} (${toPar > 0 ? "+" : ""}${toPar})`;
  }

  const p1Display = teamScores.partnership1.count > 0
    ? formatScore(teamScores.partnership1.total, teamScores.partnership1.toPar)
    : "–";
  const p2Display = teamScores.partnership2.count > 0
    ? formatScore(teamScores.partnership2.total, teamScores.partnership2.toPar)
    : "–";

  return `${p1Display} vs ${p2Display}`;
}


//used to show status of matches in today tab
function calculateMatchStatus(primaryTeamGolfers, secondaryTeamGolfers, scores) {


  const allGolfers = primaryTeamGolfers.concat(secondaryTeamGolfers);




  strokeMaps = {}; // golfer_id -> [0,1,...]

  // Build stroke maps using match-adjusted handicaps (lowest = 0)
  const matchPlayingHcps = allGolfers.map(g => calculatePlayingHandicap(g.handicap));
  const matchMinHcp = Math.min(...matchPlayingHcps);
  allGolfers.forEach((golfer, i) => {
    strokeMaps[golfer.golfer_id] = buildStrokeMapForGolfer(matchPlayingHcps[i] - matchMinHcp, holeInfo);
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



function strokeDots(stroke) {
  if (stroke === 1) return '<span class="corner-dot"></span>';
  if (stroke === 2) return '<span class="corner-dot"></span><span class="corner-dot second-dot"></span>';
  if (stroke === -1) return '<span class="corner-dot penalty-dot"></span>';
  return '';
}

// Adjust handicaps within a match so the lowest handicap player becomes 0
// and all others are reduced by the same amount.
// Pass in an array of golfer objects with a .handicap property (already playing handicap).
// Returns a new array with adjusted .handicap values.
function adjustHandicapsForMatch(golfers) {
  if (!golfers || golfers.length === 0) return golfers;
  const min = Math.min(...golfers.map(g => g.handicap));
  return golfers.map(g => ({ ...g, handicap: g.handicap - min }));
}

//stroke maps for golfers
function buildStrokeMapForGolfer(golferHandicap, holeData) {

  const strokeMap = {};


  for (let hole of holeData) {
    const index = hole.handicap_index;
    const holeNum = hole.hole_number;

    let strokes = 0;
    if (golferHandicap >= 0) {
      // Positive handicap: receive strokes on lowest-index (hardest) holes
      if (golferHandicap >= index) strokes = 1;
      if (golferHandicap > 18 && golferHandicap - 18 >= index) strokes = 2;
    } else {
      // Plus handicapper: pay penalty strokes on highest-index (easiest) holes
      const absHcp = Math.abs(golferHandicap);
      if (index > 18 - absHcp) strokes = -1;
    }

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

// Guys Trip versions - without Team column
function renderGuysTripGrossLeaderboard(parentContainer, golfers) {
    if (!Array.isArray(golfers) || golfers.length === 0) return;
    const { container, body } = createWidgetContainer('Individual Tournament Leaderboard - Gross', 'gross-leaderboard');

      const leaderboardDiv = document.createElement("div");
      leaderboardDiv.className = "gross-leaderboard";
      const table = document.createElement("table");
      table.classList.add("leaderboard-table");

      // Sort golfers by score to par
      golfers.sort((a, b) => (a.strokes - a.par) - (b.strokes - b.par));

      const header = `<tr><th>Rank</th><th>Name</th><th>To Par</th><th>Thru</th></tr>`;
      table.innerHTML = header;

      golfers.forEach((g, i) => {
        const toPar = g.strokes - g.par;
        const toParStr = toPar === 0 ? "E" : (toPar > 0 ? `+${toPar}` : `${toPar}`);
        let thruNum = g.holes_played;

        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${i + 1}</td>
          <td>${g.name}</td>
          <td>${toParStr}</td>
          <td>${thruNum}</td>
        `;
        table.appendChild(row);
      });

      leaderboardDiv.appendChild(table);
      container.appendChild(leaderboardDiv);
    parentContainer.appendChild(container);
}

function renderGuysTripNetLeaderboard(parentContainer, players) {
    if (!Array.isArray(players) || players.length === 0) return;
    const { container, body } = createWidgetContainer('Individual Tournament Leaderboard - Net', 'net-leaderboard');

      const netDiv = document.createElement("div");
      netDiv.className = "net-leaderboard";
      const table = document.createElement("table");
      table.classList.add("leaderboard-table");
      table.innerHTML = `<tr>
        <th>Rank</th><th>Name</th>
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

        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${i + 1}</td>
          <td>${p.name}</td>
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

function renderGuysTripRoundsAndMatchups(parentContainer, rounds) {
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
      row.innerHTML = `<td colspan="2" style="text-align:center;">No tee times</td>`;
      table.appendChild(row);
    } else {
      round.tee_times.forEach(teeTime => {
        if (teeTime.matches.length === 0) {
          const row = document.createElement("tr");
          const formattedTime = formatTeeTime(teeTime.time);
          row.innerHTML = `<td>${formattedTime}</td><td style="text-align:center;">Matchups not yet assigned</td>`;
          table.appendChild(row);
        } else {
          teeTime.matches.forEach((match, idx) => {
            // Group golfers by player_order
            const partnership1 = match.golfers.filter(g => g.player_order === 1 || g.player_order === 2);
            const partnership2 = match.golfers.filter(g => g.player_order === 3 || g.player_order === 4);

            // Sort each partnership by player_order
            partnership1.sort((a, b) => a.player_order - b.player_order);
            partnership2.sort((a, b) => a.player_order - b.player_order);

            const p1Color = "#007bff"; // blue
            const p2Color = "#28a745"; // green
            const p1TextColor = pickContrastColorFromHex(p1Color);
            const p2TextColor = pickContrastColorFromHex(p2Color);

            const p1Names = partnership1.map(g => g.name).join(' & ');
            const p2Names = partnership2.map(g => g.name).join(' & ');

            const row = document.createElement("tr");

            // Make the row clickable if there's a match_id
            if (match.match_id) {
                row.dataset.matchId = match.match_id;
                row.style.cursor = 'pointer';
                row.title = "Click to view scorecard";

                row.addEventListener('click', () => {
                    parentContainer.innerHTML = '<h2>Loading Scorecard...</h2>';
                    loadMatchScorecard(match.match_id, parentContainer.id);
                });
            }

            const formattedTime = formatTeeTime(teeTime.time);
            if (idx === 0) {
              row.innerHTML = `
                <td rowspan="${teeTime.matches.length}">${formattedTime}</td>
                <td>
                  <span style="background:${p1Color};color:${p1TextColor};padding:2px 6px;border-radius:3px;margin-right:5px;">${p1Names}</span>
                  vs
                  <span style="background:${p2Color};color:${p2TextColor};padding:2px 6px;border-radius:3px;margin-left:5px;">${p2Names}</span>
                </td>
              `;
            } else {
              row.innerHTML = `
                <td>
                  <span style="background:${p1Color};color:${p1TextColor};padding:2px 6px;border-radius:3px;margin-right:5px;">${p1Names}</span>
                  vs
                  <span style="background:${p2Color};color:${p2TextColor};padding:2px 6px;border-radius:3px;margin-left:5px;">${p2Names}</span>
                </td>
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
            const pct = parseFloat(course.handicap_pct || tournamentHandicapPct || 100);
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
        const displayPct = parseFloat(tournamentHandicapPct || 100);
        explanation.innerHTML = `
          <strong>How Playing Handicap is Calculated:</strong><br>
          Each golfer's <b>course handicap</b> is calculated according to USGA guidelines using the formula:<br>
          <code>(Handicap &times; (Slope / 113) + (Rating - 72))</code><br>
          For this tournament, we are using <b>${displayPct}%</b> of the course handicap to calculate the <b>playing handicap</b>.<br>
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
            fetch(`${API_BASE_URL}/api/get_tournament_scoreboard.php?tournament_id=${tournamentId}`, { credentials: 'include' }).then(res => res.json()),
            fetch(`${API_BASE_URL}/api/get_gross_leaderboard_all.php?tournament_id=${tournamentId}`, { credentials: 'include' }).then(res => res.json()),
            fetch(`${API_BASE_URL}/api/get_net_leaderboard_all.php?tournament_id=${tournamentId}`, { credentials: 'include' }).then(res => res.json()),
            fetch(`${API_BASE_URL}/api/get_tournament_rounds.php?tournament_id=${tournamentId}`, { credentials: 'include' }).then(res => res.json()),
            // The handicap table needs two fetches, so we wrap them in their own Promise.all
            Promise.all([
                fetch(`${API_BASE_URL}/api/get_tournament_courses.php?tournament_id=${tournamentId}`, { credentials: 'include' }).then(res => res.json()),
                fetch(`${API_BASE_URL}/api/get_tournament_golfers.php?tournament_id=${tournamentId}`, { credentials: 'include' }).then(res => res.json())
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
            // Set tournamentHandicapPct from the courses data (each course row carries it)
            if (Array.isArray(courses) && courses.length > 0 && courses[0].handicap_pct != null) {
                tournamentHandicapPct = parseFloat(courses[0].handicap_pct);
            }
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

function renderSkinsRoundsAndGroups(parentContainer, rounds) {
  if (!Array.isArray(rounds) || rounds.length === 0) return;
  const { container } = createWidgetContainer('Rounds & Groups', 'tournament-rounds-table-container');

  const roundsDiv = document.createElement('div');
  roundsDiv.className = 'tournament-rounds-table-container';

  rounds.forEach(round => {
    const heading = document.createElement('h4');
    const [year, month, day] = round.round_date.split('-');
    const dateObj  = new Date(year, month - 1, day);
    const monthDay = dateObj.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
    heading.innerHTML = `${round.round_name}<br>${monthDay}`;
    heading.style.textAlign = 'center';
    roundsDiv.appendChild(heading);

    const table = document.createElement('table');
    table.className = 'leaderboard-table matchup-table';

    if (!round.tee_times || round.tee_times.length === 0) {
      table.innerHTML = '<tr><td colspan="2" style="text-align:center;">No tee times</td></tr>';
    } else {
      round.tee_times.forEach(teeTime => {
        if (!teeTime.matches || teeTime.matches.length === 0) {
          const row = document.createElement('tr');
          row.innerHTML = `<td>${formatTeeTime(teeTime.time)}</td><td style="text-align:center;">Groups not yet assigned</td>`;
          table.appendChild(row);
        } else {
          teeTime.matches.forEach((match, idx) => {
            // All golfers are individual — just list names
            const names = match.golfers
              .sort((a, b) => a.player_order - b.player_order)
              .map(g => g.name).join(', ');

            const row = document.createElement('tr');
            if (match.match_id) {
              row.style.cursor = 'pointer';
              row.title = 'Click to view scorecard';
              row.addEventListener('click', () => {
                parentContainer.innerHTML = '<p>Loading scorecard…</p>';
                loadMatchScorecard(match.match_id, parentContainer.id);
              });
            }

            if (idx === 0) {
              row.innerHTML = `<td rowspan="${teeTime.matches.length}">${formatTeeTime(teeTime.time)}</td><td>${names}</td>`;
            } else {
              row.innerHTML = `<td>${names}</td>`;
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

async function loadSkinsTournamentPage(container) {
  container.innerHTML = '<p style="color:var(--color-text-muted); text-align:center; padding:2rem;">Loading…</p>';

  const tournamentId = sessionStorage.getItem('selected_tournament_id');
  if (!tournamentId) {
    container.innerHTML = '<p>Error: No tournament selected.</p>';
    return;
  }

  try {
    const results = await Promise.allSettled([
      fetch(`${API_BASE_URL}/api/get_gross_leaderboard_all.php?tournament_id=${tournamentId}`, { credentials: 'include' }).then(r => r.json()),
      fetch(`${API_BASE_URL}/api/get_net_leaderboard_all.php?tournament_id=${tournamentId}`, { credentials: 'include' }).then(r => r.json()),
      fetch(`${API_BASE_URL}/api/get_tournament_rounds.php?tournament_id=${tournamentId}`, { credentials: 'include' }).then(r => r.json()),
      Promise.all([
        fetch(`${API_BASE_URL}/api/get_tournament_courses.php?tournament_id=${tournamentId}`, { credentials: 'include' }).then(r => r.json()),
        fetch(`${API_BASE_URL}/api/get_tournament_golfers.php?tournament_id=${tournamentId}`, { credentials: 'include' }).then(r => r.json())
      ])
    ]);

    container.innerHTML = '';

    const [grossResult, netResult, roundsResult, handicapResult] = results;

    // Net Leaderboard (most important for skins — show first)
    if (netResult.status === 'fulfilled') {
      renderGuysTripNetLeaderboard(container, netResult.value);
    } else {
      renderErrorWidget(container, 'Net Leaderboard');
    }

    // Gross Leaderboard
    if (grossResult.status === 'fulfilled') {
      renderGuysTripGrossLeaderboard(container, grossResult.value);
    } else {
      renderErrorWidget(container, 'Gross Leaderboard');
    }

    // Rounds & Groups
    if (roundsResult.status === 'fulfilled') {
      renderSkinsRoundsAndGroups(container, roundsResult.value);
    } else {
      renderErrorWidget(container, 'Rounds & Groups');
    }

    // Playing Handicaps
    if (handicapResult.status === 'fulfilled') {
      const [courses, golfers] = handicapResult.value;
      if (Array.isArray(courses) && courses.length > 0 && courses[0].handicap_pct != null) {
        tournamentHandicapPct = parseFloat(courses[0].handicap_pct);
      }
      renderHandicapTable(container, courses, golfers);
      renderCoursePDFLinks(container, courses);
    } else {
      renderErrorWidget(container, 'Handicap Table');
    }

  } catch (err) {
    container.innerHTML = '<p>A critical error occurred while loading the tournament.</p>';
    console.error('Fatal error in loadSkinsTournamentPage:', err);
  }
}

async function loadGuysTripTournamentPage(container) {
    // Guys Trip version - no scoreboard, no team columns in leaderboards
    container.innerHTML = '<h2>Loading Tournament Data...</h2>';

    const tournamentId = sessionStorage.getItem('selected_tournament_id');
    if (!tournamentId) {
        container.innerHTML = '<h2>Error: No tournament selected.</h2>';
        return;
    }

    try {
        // Fetch all data (no scoreboard for Guys Trip)
        const promises = [
            fetch(`${API_BASE_URL}/api/get_gross_leaderboard_all.php?tournament_id=${tournamentId}`, { credentials: 'include' }).then(res => res.json()),
            fetch(`${API_BASE_URL}/api/get_net_leaderboard_all.php?tournament_id=${tournamentId}`, { credentials: 'include' }).then(res => res.json()),
            fetch(`${API_BASE_URL}/api/get_tournament_rounds.php?tournament_id=${tournamentId}`, { credentials: 'include' }).then(res => res.json()),
            Promise.all([
                fetch(`${API_BASE_URL}/api/get_tournament_courses.php?tournament_id=${tournamentId}`, { credentials: 'include' }).then(res => res.json()),
                fetch(`${API_BASE_URL}/api/get_tournament_golfers.php?tournament_id=${tournamentId}`, { credentials: 'include' }).then(res => res.json())
            ])
        ];

        const results = await Promise.allSettled(promises);
        container.innerHTML = '';

        const [
            grossLeaderboardResult,
            netLeaderboardResult,
            roundsResult,
            handicapResult
        ] = results;

        // Render Rounds & Matchups (Guys Trip version)
        if (roundsResult.status === 'fulfilled') {
            renderGuysTripRoundsAndMatchups(container, roundsResult.value);
        } else {
            console.error("Rounds/Matchups Error:", roundsResult.reason);
            renderErrorWidget(container, 'Rounds & Matchups');
        }

        // Render Gross Leaderboard (Guys Trip version without Team column)
        if (grossLeaderboardResult.status === 'fulfilled') {
            renderGuysTripGrossLeaderboard(container, grossLeaderboardResult.value);
        } else {
            console.error("Gross Leaderboard Error:", grossLeaderboardResult.reason);
            renderErrorWidget(container, 'Gross Leaderboard');
        }

        // Render Net Leaderboard (Guys Trip version without Team column)
        if (netLeaderboardResult.status === 'fulfilled') {
            renderGuysTripNetLeaderboard(container, netLeaderboardResult.value);
        } else {
            console.error("Net Leaderboard Error:", netLeaderboardResult.reason);
            renderErrorWidget(container, 'Net Leaderboard');
        }

        // Render Handicap Table
        if (handicapResult.status === 'fulfilled') {
            const [courses, golfers] = handicapResult.value;
            // Set tournamentHandicapPct from the courses data (each course row carries it)
            if (Array.isArray(courses) && courses.length > 0 && courses[0].handicap_pct != null) {
                tournamentHandicapPct = parseFloat(courses[0].handicap_pct);
            }
            renderHandicapTable(container, courses, golfers);
            renderCoursePDFLinks(container, courses);
        } else {
            console.error("Handicap Table Error:", handicapResult.reason);
            renderErrorWidget(container, 'Handicap Table');
        }

    } catch (error) {
        container.innerHTML = '<h2>A critical error occurred while loading the page.</h2>';
        console.error("Fatal error in loadGuysTripTournamentPage:", error);
    }
}




function loadMatchScorecard(match_id, container_id = "today-summary") {
  const tournamentId = sessionStorage.getItem('selected_tournament_id');
  const formatId = parseInt(sessionStorage.getItem('selected_format_id'));
  const isGuysTripFormat = formatId === 4;

  fetch(`${API_BASE_URL}/api/get_match_by_id.php?match_id=${match_id}&tournament_id=${tournamentId}`, { credentials: 'include' })
    .then(res => res.json())
    .then(data => {

      const matchGolfers = data.match;
      holeInfo = data.holes;
      const container = document.getElementById(container_id);
      container.innerHTML = ""; // Replace match list



        const golferMap = new Map();

        matchGolfers.forEach(row => {
          if (!golferMap.has(row.golfer_id)) {
            // For Guys Trip, determine team color by player_order
            let teamColor = row.team_color;
            let teamName = row.team_name;

            if (isGuysTripFormat) {
              // Partnership 1: player_order 1 or 2 (blue)
              // Partnership 2: player_order 3 or 4 (green)
              if (row.player_order === 1 || row.player_order === 2) {
                teamColor = "#007bff"; // blue
                teamName = "Partnership 1";
              } else if (row.player_order === 3 || row.player_order === 4) {
                teamColor = "#28a745"; // green
                teamName = "Partnership 2";
              }
            }

            golferMap.set(row.golfer_id, {
              id: row.golfer_id,
              name: row.first_name,
              team: teamName,
              team_color: teamColor,
              handicap: calculatePlayingHandicap(parseFloat(row.handicap)),
              player_order: row.player_order // Keep for reference
            });
          }
        });



        const golfers = Array.from(golferMap.values());

        // For Guys Trip, sort by player_order to group partnerships
        // For other formats, the database query already sorted by team name
        if (isGuysTripFormat) {
          golfers.sort((a, b) => a.player_order - b.player_order);

          // Set global team variables for best-ball calculation
          primaryTeamName = "Partnership 1";
          secondaryTeamName = "Partnership 2";
          primaryTeamColor = "#007bff"; // blue
          secondaryTeamColor = "#28a745"; // green
        } else {
          // For Ryder Cup and other tournaments, set team variables from golfer data
          // Get unique teams from golfers
          const teamMap = new Map();
          golfers.forEach(g => {
            if (!teamMap.has(g.team)) {
              teamMap.set(g.team, g.team_color);
            }
          });
          const uniqueTeams = Array.from(teamMap.entries()).map(([name, color]) => ({ name, color }));

          if (uniqueTeams.length >= 1) {
            primaryTeamName = uniqueTeams[0].name;
            primaryTeamColor = uniqueTeams[0].color;
          }
          if (uniqueTeams.length >= 2) {
            secondaryTeamName = uniqueTeams[1].name;
            secondaryTeamColor = uniqueTeams[1].color;
          }
        }


      // Adjust handicaps relative to lowest in this match
      const minHcpMatch = Math.min(...golfers.map(g => g.handicap));
      golfers.forEach(g => { g.handicap = g.handicap - minHcpMatch; });

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
        row.innerHTML = `<td class="match-result-cell" data-hole="${i}"></td><td>${i}</td><td>${par}</td><td>${index}</td>` + golfers.map(golfer => {
          const stroke = strokeMaps[golfer.id]?.[i] || 0;
                        const dots = strokeDots(stroke);
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

          // Add team best-ball Out row for Guys Trip
          if (isGuysTripFormat) {
            const teamOutRow = document.createElement("tr");
            teamOutRow.classList.add("team-score-row");
            teamOutRow.style.fontWeight = "bold";
            teamOutRow.style.backgroundColor = "#f0f0f0";
            teamOutRow.innerHTML = `<td></td><td colspan="3" style="text-align: left; padding-left: 0.5rem;">Team (out)</td>` +
              `<td colspan="2" class="team-out-cell-readonly" data-partnership="1" style="background-color: #007bff; color: #ffffff; text-align: center;">–</td>` +
              `<td colspan="2" class="team-out-cell-readonly" data-partnership="2" style="background-color: #28a745; color: #ffffff; text-align: center;">–</td>`;
            table.appendChild(teamOutRow);
          }
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

          // Add team best-ball In row for Guys Trip
          if (isGuysTripFormat) {
            const teamInRow = document.createElement("tr");
            teamInRow.classList.add("team-score-row");
            teamInRow.style.fontWeight = "bold";
            teamInRow.style.backgroundColor = "#f0f0f0";
            teamInRow.innerHTML = `<td></td><td colspan="3" style="text-align: left; padding-left: 0.5rem;">Team (in)</td>` +
              `<td colspan="2" class="team-in-cell-readonly" data-partnership="1" style="background-color: #007bff; color: #ffffff; text-align: center;">–</td>` +
              `<td colspan="2" class="team-in-cell-readonly" data-partnership="2" style="background-color: #28a745; color: #ffffff; text-align: center;">–</td>`;
            table.appendChild(teamInRow);
          }
        }
      }

      // Totals row
      const totalsRow = document.createElement("tr");
      totalsRow.innerHTML = `<td></td><td></td><td></td><td></td>` + golfers.map(g => {
        return `<td class="totals-cell" data-golfer="${g.id}">–</td>`;
      }).join("");
      table.appendChild(totalsRow);

      // Add team best-ball Total row for Guys Trip
      if (isGuysTripFormat) {
        const teamTotalRow = document.createElement("tr");
        teamTotalRow.classList.add("team-score-row");
        teamTotalRow.style.fontWeight = "bold";
        teamTotalRow.style.backgroundColor = "#f0f0f0";
        teamTotalRow.innerHTML = `<td></td><td colspan="3" style="text-align: left; padding-left: 0.5rem;">Team (total)</td>` +
          `<td colspan="2" class="team-total-cell-readonly" data-partnership="1" style="background-color: #007bff; color: #ffffff; text-align: center;">–</td>` +
          `<td colspan="2" class="team-total-cell-readonly" data-partnership="2" style="background-color: #28a745; color: #ffffff; text-align: center;">–</td>`;
        table.appendChild(teamTotalRow);
      }

      container.appendChild(table);
    
      // Fetch scores
      fetch(`${API_BASE_URL}/api/get_scores.php?match_id=${match_id}`, { credentials: 'include' })
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
                                const dots = strokeDots(stroke);
                cell.innerHTML = `${dots}${strokes}`;
            }
          });

          updateTotalScoresReadOnly(golfers, holeInfo);
          calculateBestBallStatusReadOnly(golfers, strokeMaps);

          // Update team scores for Guys Trip
          if (isGuysTripFormat) {
            updateGuysTripTeamScoresReadOnly(golfers, strokeMaps, holeInfo);
          }
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
    // Use data-hole attribute directly — robust regardless of extra subtotal rows in the table
    const holeCell = document.querySelector(`.match-result-cell[data-hole="${hole}"]`);
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
  fetch(`${API_BASE_URL}/api/get_scores.php?match_id=${currentMatchId}`, {
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
// User Dashboard Functions
let currentUser = null;

function loadUserDashboard(golfer) {
  currentUser = golfer;
  sessionStorage.setItem('current_user', JSON.stringify(golfer));

  // Persist login across sessions
  localStorage.setItem('sb_golfer', JSON.stringify(golfer));

  document.getElementById('pin-container').style.display = 'none';
  document.getElementById('auth-container').style.display = 'none';
  document.getElementById('user-dashboard').style.display = 'block';

  const userHeaderBar = document.getElementById('user-header-bar');
  userHeaderBar.style.display = 'block';
  document.getElementById('user-header-name').textContent = `${golfer.first_name} ${golfer.last_name}`;
  const orgEl = document.getElementById('user-header-org');
  if (orgEl) {
    orgEl.textContent = golfer.org_name || '';
    // Wire up switch-group modal on the org name — check if user has multiple orgs
    orgEl.classList.remove('switchable');
    orgEl.onclick = null;
    fetch(`${API_BASE_URL}/api/my_orgs.php`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (data.orgs && data.orgs.length > 1) {
          orgEl.classList.add('switchable');
          orgEl.title = 'Switch group';
          orgEl.onclick = (e) => { e.stopPropagation(); openSwitchGroupModal(data.orgs); };
        }
      })
      .catch(() => {});
  }

  // Show +New Tournament button for admins only
  const newTournamentBtn = document.getElementById('create-tournament-btn');
  if (newTournamentBtn) {
    newTournamentBtn.style.display = golfer.role === 'admin' ? 'block' : 'none';
  }

  loadActiveQuickRounds();
  loadUserTournaments(golfer.golfer_id);
  if (golfer.role === 'admin') loadAdminChecklist();
}

function loadAdminChecklist() {
  const container = document.getElementById('admin-setup-checklist');
  if (!container) return;

  // If admin has previously dismissed after completing all steps, stay hidden
  const orgId = currentUser && currentUser.org_id;
  const dismissKey = `sb_setup_dismissed_${orgId}`;
  if (localStorage.getItem(dismissKey)) {
    container.innerHTML = '';
    return;
  }

  // Fetch golfer count, course count, and tournament count in parallel
  Promise.all([
    fetch(`${API_BASE_URL}/api/golfers.php`, { credentials: 'include' }).then(r => r.json()),
    fetch(`${API_BASE_URL}/api/courses.php`, { credentials: 'include' }).then(r => r.json()),
    fetch(`${API_BASE_URL}/api/get_user_tournaments.php?golfer_id=${currentUser.golfer_id}`, { credentials: 'include' }).then(r => r.json())
  ])
  .then(([golferData, courseData, tourneyData]) => {
    const golferCount  = Array.isArray(golferData) ? golferData.length : 0;
    const courseCount  = Array.isArray(courseData) ? courseData.length : 0;
    const tourneyCount = (tourneyData.tournaments || []).length;

    const steps = [
      {
        label: 'Create your group',
        hint:  'You\'re here — this one\'s done.',
        done:  true,
        action: null
      },
      {
        label: `Add your golfers`,
        hint:  golferCount > 1 ? `${golferCount} golfers added` : 'Add everyone who\'ll be scoring',
        done:  golferCount > 1,
        action: () => {
          showEditGroupPage().then(() => {
            const btn = document.getElementById('edit-group-golfers-btn');
            if (btn) btn.click();
          });
        }
      },
      {
        label: 'Add a course',
        hint:  courseCount > 0 ? `${courseCount} course${courseCount !== 1 ? 's' : ''} added` : 'Add the course(s) you\'ll be playing',
        done:  courseCount > 0,
        action: () => {
          showEditGroupPage().then(() => {
            const btn = document.getElementById('manage-courses-btn');
            if (btn) btn.click();
          });
        }
      },
      {
        label: 'Create your first tournament',
        hint:  tourneyCount > 0 ? `${tourneyCount} tournament${tourneyCount !== 1 ? 's' : ''} set up` : 'Set up a Ryder Cup, Best Ball, or Guys Trip',
        done:  tourneyCount > 0,
        action: () => {
          const btn = document.getElementById('create-tournament-btn');
          if (btn) btn.click();
        }
      }
    ];

    const doneCount = steps.filter(s => s.done).length;
    const allDone   = doneCount === steps.length;

    // If everything is already done, auto-dismiss and never show
    if (allDone) {
      localStorage.setItem(dismissKey, '1');
      container.innerHTML = '';
      return;
    }

    const pct = Math.round((doneCount / steps.length) * 100);

    const itemsHtml = steps.map((step, i) => `
      <div class="setup-checklist-item ${step.done ? 'done' : ''}" data-step="${i}">
        <div class="setup-checklist-check">${step.done ? '✓' : ''}</div>
        <div class="setup-checklist-item-text">
          <div class="setup-checklist-item-label">${step.label}</div>
          <div class="setup-checklist-item-hint">${step.hint}</div>
        </div>
        <span class="setup-checklist-arrow">→</span>
      </div>
    `).join('');

    container.innerHTML = `
      <div class="setup-checklist-card">
        <div class="setup-checklist-header">
          <h3 class="setup-checklist-title">🏌️ Set up your group</h3>
          <button class="setup-checklist-dismiss" id="checklist-dismiss-btn" title="Dismiss">✕</button>
        </div>
        <p class="setup-checklist-subtitle">${allDone ? 'You\'re all set — go play some golf! 🎉' : 'Complete these steps to get your group ready.'}</p>
        <div class="setup-checklist-progress">
          <div class="setup-checklist-progress-bar" style="width:${pct}%"></div>
        </div>
        <div class="setup-checklist-items">${itemsHtml}</div>
      </div>
    `;

    // Wire up step clicks
    container.querySelectorAll('.setup-checklist-item:not(.done)').forEach(el => {
      const idx = parseInt(el.dataset.step);
      if (steps[idx].action) {
        el.addEventListener('click', steps[idx].action);
      }
    });

    // Dismiss button — hide permanently for this org
    document.getElementById('checklist-dismiss-btn').addEventListener('click', () => {
      localStorage.setItem(dismissKey, '1');
      container.innerHTML = '';
    });
  })
  .catch(() => {
    container.innerHTML = '';
  });
}

function loadActiveQuickRounds() {
  const container = document.getElementById('active-quick-rounds');
  if (!container) return;

  fetch(`${API_BASE_URL}/api/get_active_quick_rounds.php`, { credentials: 'include' })
    .then(res => res.json())
    .then(data => {
      const rounds = data.rounds || [];
      if (rounds.length === 0) {
        container.innerHTML = '';
        return;
      }

      let html = '<div style="display:flex; flex-direction:column; gap:var(--space-4); margin-bottom:var(--space-4);">';
      rounds.forEach(round => {
        const dateDisplay = round.round_date
          ? new Date(round.round_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
          : 'Today';

        html += `
          <div class="tournament-card quick-round-card">
            <div class="quick-round-header">
              <div style="flex:1; min-width:0;">
                <h4 class="tournament-card-title">${round.round_name}</h4>
                <p class="tournament-card-dates">${round.course_name} · ${dateDisplay}</p>
                <p class="tournament-card-meta">${round.players}</p>
              </div>
              <span class="quick-round-badge">Active</span>
            </div>
            <button class="btn btn-success btn-auto"
              onclick="loadQuickRoundFromTournament(${round.tournament_id}, '${round.round_name}')">
              Resume Round →
            </button>
          </div>`;
      });
      html += '</div>';
      container.innerHTML = html;
    })
    .catch(() => {
      // Silently ignore — don't break the dashboard if this fails
      container.innerHTML = '';
    });
}

function loadUserTournaments(golferId) {
  const tournamentsList = document.getElementById('tournaments-list');
  tournamentsList.innerHTML = '<p>Loading...</p>';

  fetch(`${API_BASE_URL}/api/get_user_tournaments.php?golfer_id=${golferId}`, {
    credentials: 'include'
  })
    .then(res => res.json())
    .then(data => {
      if (data.error || !data.tournaments || data.tournaments.length === 0) {
        tournamentsList.innerHTML = '<p style="color: #666; font-style: italic;">No active tournaments</p>';
        return;
      }

      let html = '<div style="display:flex; flex-direction:column; gap:var(--space-4);">';
      data.tournaments.forEach(tournament => {
        const isRyderCupCard = parseInt(tournament.format_id) === 3;
        const teams = tournament.teams || [];

        // Build team vs team subtitle for Ryder Cup (keep dynamic colors)
        let teamSubtitle = '';
        if (isRyderCupCard && teams.length >= 2) {
          teamSubtitle = `
            <p style="margin:var(--space-1) 0 var(--space-2); font-size:var(--font-size-sm); font-weight:700;">
              <span style="color:${teams[0].color_hex};">${teams[0].name}</span>
              <span style="color:var(--color-text-muted);"> vs </span>
              <span style="color:${teams[1].color_hex};">${teams[1].name}</span>
            </p>`;
        }

        const isAdminCard = currentUser && currentUser.role === 'admin';
        const isMember    = tournament.is_member !== false; // true for all non-admin; false when admin not enrolled
        html += `
          <div class="tournament-card${isMember ? '' : ' tournament-card-observer'}">
            <div style="position:relative; margin-bottom:var(--space-1);">
              <h4 class="tournament-card-title" style="padding-right:${isAdminCard ? '4rem' : '0'};">${tournament.tournament_name}</h4>
              ${isAdminCard ? `
                <button class="btn-badge btn-badge-edit edit-tournament-btn" data-tournament-id="${tournament.tournament_id}">Edit</button>
              ` : ''}
            </div>
            ${!isMember ? `<p class="tournament-not-enrolled-badge">👀 Admin view — not enrolled</p>` : ''}
            ${currentUser && currentUser.org_name ? `<p class="tournament-card-meta">${currentUser.org_name}</p>` : ''}
            ${teamSubtitle}
            <p class="tournament-card-dates">${tournament.start_date} — ${tournament.end_date}</p>
        `;

        html += '<div class="tournament-card-rounds">';

        if (tournament.rounds && tournament.rounds.length > 0) {
          tournament.rounds.forEach(round => {
            const isAdmin = currentUser && currentUser.role === 'admin';
            const isGuysTrip = tournament.format_id === 4;
            const isRyderCup = tournament.format_id === 3;
            const isSkins    = tournament.format_id === 5;
            const hasEditButton = isGuysTrip || isRyderCup || isSkins;
            const hasScores = round.has_scores || false;
            const isLocked = hasScores;

            const teeTimesDisplay = (round.tee_times && round.tee_times.length > 0)
              ? round.tee_times.map(t => {
                  const [h, m] = t.split(':');
                  const hour = parseInt(h);
                  const ampm = hour >= 12 ? 'PM' : 'AM';
                  const hour12 = hour % 12 || 12;
                  return `${hour12}:${m} ${ampm}`;
                }).join(', ')
              : 'not yet assigned';

            const roundDateDisplay = round.round_date
              ? new Date(round.round_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
              : '';

            html += `
              <div style="position:relative;">
                <button class="tournament-round-btn" data-tournament-id="${tournament.tournament_id}" data-round-id="${round.round_id}" data-round-name="${round.round_name}" data-format-id="${tournament.format_id || ''}" style="padding-right:${isAdmin && hasEditButton ? '4.5rem' : 'var(--space-4)'};">
                  <div>${round.round_name}</div>
                  ${roundDateDisplay ? `<div class="round-meta">${roundDateDisplay}</div>` : ''}
                  <div class="round-meta">Tee times: ${teeTimesDisplay}</div>
                </button>
                ${isAdmin && hasEditButton ? (
                  isLocked ? `
                    <button class="btn-badge btn-badge-locked locked-round-btn">Locked</button>
                  ` : `
                    <button class="btn-badge btn-badge-edit edit-round-btn" data-tournament-id="${tournament.tournament_id}" data-round-id="${round.round_id}" data-format-id="${tournament.format_id || ''}">Edit</button>
                  `
                ) : ''}
              </div>
            `;
          });
        } else {
          html += `<p style="font-size:var(--font-size-sm); color:var(--color-text-muted); margin:var(--space-2) 0;">No rounds scheduled</p>`;
        }

        // Add Round button for admins
        if (currentUser && currentUser.role === 'admin') {
          html += `
            <button class="add-round-btn" data-tournament-id="${tournament.tournament_id}" data-format-id="${tournament.format_id || ''}">+ Add Round</button>
          `;
        }

        html += '</div></div>';
      });
      html += '</div>';

      tournamentsList.innerHTML = html;

      // Add click handlers for tournament rounds
      document.querySelectorAll('.tournament-round-btn').forEach(btn => {
        btn.addEventListener('click', function() {
          const roundId = this.dataset.roundId;
          const tournamentId = this.dataset.tournamentId;
          const roundName = this.dataset.roundName;
          const formatId = this.dataset.formatId ? parseInt(this.dataset.formatId) : null;

          // Check if this is a Quick Round (Best Ball, Rabbit, Wolf)
          const isQuickRound = ['Best Ball', 'Rabbit', 'Wolf'].includes(roundName);

          sessionStorage.setItem('selected_golfer_id', currentUser.golfer_id);
          sessionStorage.setItem('selected_round_id', roundId);

          if (isQuickRound) {
            // Load Quick Round view
            loadQuickRoundFromTournament(tournamentId, roundName);
          } else if (formatId === 4) {
            // Guys Trip tournament
            loadGuysTripTournamentRound(roundId, tournamentId, roundName, formatId);
          } else if (formatId === 5) {
            // Skins tournament — round view coming soon
            loadGuysTripTournamentRound(roundId, tournamentId, roundName, formatId);
          } else {
            // Load regular tournament round
            loadTournamentRound(roundId, tournamentId, roundName);
          }
        });
      });

      // Add click handlers for "+ Add Round" buttons
      document.querySelectorAll('.add-round-btn').forEach(btn => {
        btn.addEventListener('click', function() {
          const tournamentId = this.dataset.tournamentId;
          sessionStorage.setItem('add_round_format_id', this.dataset.formatId || '');
          showAddRoundForm(tournamentId);
        });
      });

      // Add click handlers for "Edit Tournament" buttons
      document.querySelectorAll('.edit-tournament-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          const tournamentId = this.dataset.tournamentId;
          const tournament = data.tournaments.find(t => String(t.tournament_id) === String(tournamentId));
          if (tournament) showEditTournamentForm(tournament);
        });
      });

      // Add click handlers for "Edit" buttons
      document.querySelectorAll('.edit-round-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
          e.stopPropagation(); // Prevent triggering the round button click
          const tournamentId = this.dataset.tournamentId;
          const roundId = this.dataset.roundId;
          sessionStorage.setItem('add_round_format_id', this.dataset.formatId || '');
          editRound(tournamentId, roundId);
        });
      });

    })
    .catch(err => {
      console.error('Error loading tournaments:', err);
      tournamentsList.innerHTML = '<p style="color: red;">Error loading tournaments</p>';
    });
}

async function showEditTournamentForm(tournament) {
  document.getElementById('user-dashboard').style.display = 'none';
  const container = document.getElementById('edit-tournament-container');
  container.style.display = 'block';

  const content = document.getElementById('edit-tournament-content');
  content.innerHTML = '<p style="color:#666;">Loading...</p>';

  const isRyderCup = parseInt(tournament.format_id) === 3;

  // Fetch teams, all golfers, tournament golfers, and locked handicaps in parallel
  const [teams, allGolfers, tournamentGolfers, lockedHcps] = await Promise.all([
    fetch(`${API_BASE_URL}/api/tournament_teams.php?tournament_id=${tournament.tournament_id}`, { credentials: 'include' }).then(r => r.json()),
    fetch(`${API_BASE_URL}/api/golfers.php`, { credentials: 'include' }).then(r => r.json()),
    fetch(`${API_BASE_URL}/api/tournament_golfers.php?tournament_id=${tournament.tournament_id}`, { credentials: 'include' }).then(r => r.json()),
    fetch(`${API_BASE_URL}/api/lock_handicaps.php?tournament_id=${tournament.tournament_id}`, { credentials: 'include' }).then(r => r.json()).catch(() => []),
  ]);

  const assignedMap = {}; // golfer_id → team_id (or null)
  tournamentGolfers.forEach(tg => { assignedMap[tg.golfer_id] = tg.team_id || null; });

  const lockedHcpMap = {}; // golfer_id → { live, locked (null if never explicitly set) }
  lockedHcps.forEach(row => {
    lockedHcpMap[row.golfer_id] = {
      live:   parseFloat(row.live_handicap),
      locked: row.handicap_at_assignment !== null ? parseFloat(row.handicap_at_assignment) : null,
    };
  });

  // Build teams section (Ryder Cup only)
  let teamsHtml = '';
  if (isRyderCup && teams.length > 0) {
    teamsHtml = `<div style="margin-bottom:1.5rem;">
      <h3 style="margin:0 0 0.75rem 0; font-size:1rem; border-bottom:1px solid #eee; padding-bottom:0.4rem;">Teams</h3>`;
    teams.forEach(team => {
      teamsHtml += `
        <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.5rem;">
          <input type="text" class="team-name-input" data-team-id="${team.team_id}" value="${team.name}"
            style="flex:1; padding:0.5rem; font-size:0.95rem; border:1px solid #ccc; border-radius:4px;">
          <input type="color" class="team-color-input" data-team-id="${team.team_id}" value="${team.color_hex}"
            style="width:2.5rem; height:2.2rem; padding:0.1rem; border:1px solid #ccc; border-radius:4px; cursor:pointer;">
        </div>`;
    });
    teamsHtml += '</div>';
  }

  // Build golfer roster table
  const thStyle = 'padding:0.4rem 0.5rem; font-size:0.78rem; color:#888; font-weight:600; text-align:left; border-bottom:2px solid #eee; white-space:nowrap; line-height:1.2;';
  const tdStyle = 'padding:0.45rem 0.5rem; font-size:0.88rem; vertical-align:middle;';

  let rosterRows = '';
  allGolfers.forEach(g => {
    const isChecked = g.golfer_id in assignedMap;
    const teamId    = assignedMap[g.golfer_id];
    const hcpData   = lockedHcpMap[g.golfer_id];
    const liveHcp   = parseFloat(g.handicap);
    const lockedHcp = hcpData?.locked;

    const lockedCell = isChecked
      ? (lockedHcp !== null && lockedHcp !== undefined
          ? `<span style="font-weight:bold;${lockedHcp !== liveHcp ? ' color:#b8860b;' : ''}">${lockedHcp}</span>`
          : `<span style="color:#aaa;">—</span>`)
      : `<span style="color:#ddd;">—</span>`;

    let teamCell = '—';
    if (isRyderCup && teams.length > 0) {
      const opts = teams.map(t =>
        `<option value="${t.team_id}" ${teamId == t.team_id ? 'selected' : ''}>${t.name}</option>`
      ).join('');
      teamCell = `<select class="golfer-team-select" data-golfer-id="${g.golfer_id}"
        style="padding:0.2rem 0.3rem; font-size:0.82rem; border:1px solid #ccc; border-radius:4px; ${isChecked ? '' : 'display:none;'}">
        <option value="">— no team —</option>${opts}
      </select>`;
    }

    rosterRows += `
      <tr style="border-bottom:1px solid #f2f2f2;${isChecked ? '' : ' opacity:0.5;'}">
        <td style="${tdStyle}">
          <label style="display:flex; align-items:center; gap:0.4rem; cursor:pointer; margin:0;">
            <input type="checkbox" class="golfer-checkbox" data-golfer-id="${g.golfer_id}" ${isChecked ? 'checked' : ''}
              style="width:1rem; height:1rem; cursor:pointer; flex-shrink:0;">
            <span>${g.first_name} ${g.last_name}</span>
          </label>
        </td>
        <td style="${tdStyle} text-align:center; color:#555;">${liveHcp}</td>
        <td style="${tdStyle} text-align:center;">${lockedCell}</td>
        <td style="${tdStyle}">${teamCell}</td>
      </tr>`;
  });

  const teamHeader = isRyderCup ? `<th style="${thStyle}">Team</th>` : '';

  let rosterHtml = `<div style="margin-bottom:1.5rem;">
    <h3 style="margin:0 0 0.75rem 0; font-size:1rem; border-bottom:1px solid #eee; padding-bottom:0.4rem;">Golfers</h3>
    <div style="max-height:360px; overflow-y:auto; border:1px solid #eee; border-radius:6px;">
      <table style="width:100%; border-collapse:collapse;">
        <thead style="position:sticky; top:0; background:#fafafa; z-index:1;">
          <tr>
            <th style="${thStyle}">Name</th>
            <th style="${thStyle} text-align:center; white-space:normal; width:4rem;">Current<br>Hdcp</th>
            <th style="${thStyle} text-align:center; white-space:normal; width:4rem;">Locked<br>Hdcp</th>
            ${teamHeader}
          </tr>
        </thead>
        <tbody>${rosterRows}</tbody>
      </table>
    </div>
  </div>`;

  content.innerHTML = `
    <div style="margin-bottom:1rem;">
      <label style="display:block; margin-bottom:0.4rem; font-weight:bold;">Tournament Name</label>
      <input type="text" id="edit-tournament-name" value="${tournament.tournament_name}"
        style="width:100%; padding:0.6rem; font-size:1rem; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;">
    </div>
    <div style="display:flex; gap:0.75rem; margin-bottom:1rem;">
      <div style="flex:1;">
        <label style="display:block; margin-bottom:0.4rem; font-weight:bold;">Start Date</label>
        <input type="date" id="edit-tournament-start" value="${tournament.start_date}"
          style="width:100%; padding:0.6rem; font-size:1rem; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;">
      </div>
      <div style="flex:1;">
        <label style="display:block; margin-bottom:0.4rem; font-weight:bold;">End Date</label>
        <input type="date" id="edit-tournament-end" value="${tournament.end_date}"
          style="width:100%; padding:0.6rem; font-size:1rem; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;">
      </div>
    </div>
    <div style="margin-bottom:1.5rem;">
      <label style="display:block; margin-bottom:0.4rem; font-weight:bold;">Handicap %</label>
      <input type="number" id="edit-tournament-handicap" value="${tournament.handicap_pct ?? 80}" min="0" max="100"
        style="width:100%; padding:0.6rem; font-size:1rem; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;">
    </div>
    ${teamsHtml}
    ${rosterHtml}
    <button id="save-edit-tournament-btn" style="width:100%; padding:0.75rem; background:#4F2185; color:white; border:none; border-radius:4px; font-size:1rem; font-weight:bold; cursor:pointer; margin-bottom:0.5rem;">
      Save Changes
    </button>
    <button id="lock-handicaps-btn" style="width:100%; padding:0.75rem; background:white; color:#4F2185; border:2px solid #4F2185; border-radius:4px; font-size:1rem; font-weight:bold; cursor:pointer; margin-top:0.5rem;">
      Lock Handicaps for Tournament
    </button>
    <div id="edit-tournament-status" style="margin-top:0.5rem; font-size:0.9rem; text-align:center;"></div>
    <hr style="border:none; border-top:1px solid var(--color-border); margin:var(--space-5) 0;">
    <button id="delete-tournament-btn" class="btn btn-danger">🗑 Delete This Tournament</button>
  `;

  // Checkbox toggles row dim + team dropdown visibility
  content.querySelectorAll('.golfer-checkbox').forEach(cb => {
    cb.addEventListener('change', function() {
      const row = this.closest('tr');
      if (row) row.style.opacity = this.checked ? '1' : '0.5';
      if (isRyderCup) {
        const sel = content.querySelector(`.golfer-team-select[data-golfer-id="${this.dataset.golferId}"]`);
        if (sel) sel.style.display = this.checked ? '' : 'none';
      }
    });
  });

  document.getElementById('save-edit-tournament-btn').addEventListener('click', () => {
    saveEditTournament(tournament, teams, isRyderCup);
  });

  document.getElementById('lock-handicaps-btn').addEventListener('click', () => {
    showLockHandicapsScreen(tournament);
  });

  document.getElementById('delete-tournament-btn').addEventListener('click', () => {
    showDeleteTournamentModal(tournament.tournament_id, tournament.tournament_name);
  });
}

async function showLockHandicapsScreen(tournament) {
  const content = document.getElementById('edit-tournament-content');
  content.innerHTML = '<p style="color:#666;">Loading golfers…</p>';

  let golfers;
  try {
    const res = await fetch(`${API_BASE_URL}/api/lock_handicaps.php?tournament_id=${tournament.tournament_id}`, { credentials: 'include' });
    golfers = await res.json();
  } catch {
    content.innerHTML = '<p style="color:red;">Error loading golfers. Please try again.</p>';
    return;
  }

  if (!golfers.length) {
    content.innerHTML = '<p style="color:#666;">No golfers are assigned to this tournament yet.</p>';
    return;
  }

  const rows = golfers.map(g => {
    const locked = g.handicap_at_assignment !== null ? parseFloat(g.handicap_at_assignment) : parseFloat(g.live_handicap);
    const live   = parseFloat(g.live_handicap);
    const differs = locked !== live;
    return `
      <tr style="border-bottom:1px solid #eee;">
        <td style="padding:0.6rem 0.4rem; font-size:0.95rem;">${g.first_name} ${g.last_name}</td>
        <td style="padding:0.6rem 0.4rem; font-size:0.9rem; color:#888; text-align:center;">${live}</td>
        <td style="padding:0.6rem 0.4rem; text-align:center;">
          <input type="number" step="0.1"
            class="hdcp-lock-input"
            data-golfer-id="${g.golfer_id}"
            value="${locked}"
            style="width:5rem; padding:0.35rem 0.4rem; font-size:0.95rem; border:1px solid ${differs ? '#FFC62F' : '#ccc'}; border-radius:4px; text-align:center; font-weight:${differs ? 'bold' : 'normal'};">
        </td>
      </tr>`;
  }).join('');

  content.innerHTML = `
    <button id="back-from-lock-handicaps" style="margin-bottom:1rem; padding:0.4rem 1rem; background:#eee; border:none; border-radius:4px; cursor:pointer; font-size:0.9rem;">← Back</button>
    <h3 style="margin:0 0 0.25rem;">Lock Handicaps</h3>
    <p style="margin:0 0 1rem; font-size:0.85rem; color:#666;">Edit each golfer's handicap for this tournament. Highlighted values differ from their current live handicap.</p>
    <table style="width:100%; border-collapse:collapse; margin-bottom:1rem;">
      <thead>
        <tr style="border-bottom:2px solid #eee;">
          <th style="padding:0.5rem 0.4rem; text-align:left; font-size:0.85rem; color:#888;">Golfer</th>
          <th style="padding:0.5rem 0.4rem; text-align:center; font-size:0.85rem; color:#888;">Live Hdcp</th>
          <th style="padding:0.5rem 0.4rem; text-align:center; font-size:0.85rem; color:#888;">Locked Hdcp</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <button id="save-lock-handicaps-btn" style="width:100%; padding:0.75rem; background:#4F2185; color:white; border:none; border-radius:4px; font-size:1rem; font-weight:bold; cursor:pointer;">
      Lock Handicaps
    </button>
    <div id="lock-handicaps-status" style="margin-top:0.75rem; font-size:0.9rem; text-align:center;"></div>
  `;

  document.getElementById('back-from-lock-handicaps').addEventListener('click', () => {
    showEditTournamentForm(tournament);
  });

  // Highlight row when value differs from live
  content.querySelectorAll('.hdcp-lock-input').forEach(input => {
    const golferId = input.dataset.golferId;
    const golfer = golfers.find(g => g.golfer_id == golferId);
    const live = parseFloat(golfer.live_handicap);
    input.addEventListener('input', function() {
      const val = parseFloat(this.value);
      const differs = !isNaN(val) && val !== live;
      this.style.borderColor = differs ? '#FFC62F' : '#ccc';
      this.style.fontWeight  = differs ? 'bold' : 'normal';
    });
  });

  document.getElementById('save-lock-handicaps-btn').addEventListener('click', async () => {
    const btn    = document.getElementById('save-lock-handicaps-btn');
    const status = document.getElementById('lock-handicaps-status');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    status.textContent = '';

    const payload = [];
    content.querySelectorAll('.hdcp-lock-input').forEach(input => {
      payload.push({
        golfer_id: parseInt(input.dataset.golferId),
        handicap_at_assignment: parseFloat(input.value)
      });
    });

    try {
      const res  = await fetch(`${API_BASE_URL}/api/lock_handicaps.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournament_id: tournament.tournament_id, golfers: payload }),
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success) {
        status.textContent = '✓ Handicaps locked successfully!';
        status.style.color = '#4CAF50';
        btn.textContent = 'Lock Handicaps';
        btn.disabled = false;
        setTimeout(() => showEditTournamentForm(tournament), 1500);
      } else {
        throw new Error(data.error || 'Unknown error');
      }
    } catch (err) {
      status.textContent = 'Error: ' + err.message;
      status.style.color = 'red';
      btn.textContent = 'Lock Handicaps';
      btn.disabled = false;
    }
  });
}

async function saveEditTournament(tournament, teams, isRyderCup) {
  const status = document.getElementById('edit-tournament-status');
  const btn = document.getElementById('save-edit-tournament-btn');
  btn.disabled = true;
  status.textContent = 'Saving…';
  status.style.color = '#666';

  const name       = document.getElementById('edit-tournament-name').value.trim();
  const startDate  = document.getElementById('edit-tournament-start').value;
  const endDate    = document.getElementById('edit-tournament-end').value;
  const handicapPct = parseInt(document.getElementById('edit-tournament-handicap').value) || 80;

  if (!name || !startDate || !endDate) {
    status.textContent = 'Name and dates are required.';
    status.style.color = 'red';
    btn.disabled = false;
    return;
  }

  try {
    // 1. Save tournament name, dates, and handicap %
    await fetch(`${API_BASE_URL}/api/tournaments.php?tournament_id=${tournament.tournament_id}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, start_date: startDate, end_date: endDate, handicap_pct: handicapPct }),
    });

    // 2. Save team names + colors (Ryder Cup)
    if (isRyderCup && teams.length > 0) {
      await Promise.all(teams.map(team => {
        const nameInput = document.querySelector(`.team-name-input[data-team-id="${team.team_id}"]`);
        const colorInput = document.querySelector(`.team-color-input[data-team-id="${team.team_id}"]`);
        return fetch(`${API_BASE_URL}/api/tournament_teams.php?team_id=${team.team_id}`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: nameInput.value.trim(), color: colorInput.value }),
        });
      }));
    }

    // 3. Save golfer roster + team assignments
    const checkboxes = document.querySelectorAll('.golfer-checkbox:checked');
    const assignments = Array.from(checkboxes).map(cb => {
      const golferId = parseInt(cb.dataset.golferId);
      const teamSel = document.querySelector(`.golfer-team-select[data-golfer-id="${golferId}"]`);
      const teamId = teamSel && teamSel.value ? parseInt(teamSel.value) : null;
      return { golfer_id: golferId, team_id: teamId };
    });

    await fetch(`${API_BASE_URL}/api/save_tournament_assignments.php`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tournament_id: tournament.tournament_id, assignments }),
    });

    status.textContent = 'Saved!';
    status.style.color = 'green';
    setTimeout(() => {
      document.getElementById('edit-tournament-container').style.display = 'none';
      document.getElementById('user-dashboard').style.display = 'block';
      loadUserTournaments(currentUser.golfer_id);
    }, 800);

  } catch (err) {
    console.error('Error saving tournament:', err);
    status.textContent = 'Error saving. Please try again.';
    status.style.color = 'red';
    btn.disabled = false;
  }
}

function showAddRoundForm(tournamentId) {
  // Ensure we're in "new round" mode, not editing
  isEditingRound = false;
  editingRoundId = null;

  // Hide dashboard, show add round form
  document.getElementById('user-dashboard').style.display = 'none';
  document.getElementById('add-round-container').style.display = 'block';

  // Store tournament ID for later use
  sessionStorage.setItem('add_round_tournament_id', tournamentId);

  // Reset form
  document.getElementById('add-round-form').reset();
  document.getElementById('add-round-tees').innerHTML = '<option value="">-- Select Tees --</option>';

  // Hide delete button (new round — nothing to delete yet)
  const deleteBtn = document.getElementById('delete-round-btn');
  const deleteDivider = document.getElementById('delete-round-divider');
  if (deleteBtn) { deleteBtn.style.display = 'none'; deleteDivider.style.display = 'none'; }

  // Reset submit and save-only buttons to clean state
  const submitBtn = document.querySelector('#add-round-form button[type="submit"]');
  if (submitBtn) submitBtn.textContent = 'Continue to Matches';
  const saveOnlyBtn = document.getElementById('save-round-only-btn');
  if (saveOnlyBtn) { saveOnlyBtn.disabled = false; saveOnlyBtn.textContent = 'Save Round (skip matches & tee times)'; saveOnlyBtn.style.background = ''; saveOnlyBtn.style.opacity = '1'; }

  // Load courses
  fetch(`${API_BASE_URL}/api/courses.php`, {
    credentials: 'include'
  })
    .then(res => res.json())
    .then(courses => {
      const courseSelect = document.getElementById('add-round-course');
      courseSelect.innerHTML = '<option value="">-- Select Course --</option>';
      courses.forEach(course => {
        const option = document.createElement('option');
        option.value = course.course_id;
        option.textContent = course.name;
        courseSelect.appendChild(option);
      });
    })
    .catch(err => {
      console.error('Error loading courses:', err);
      alert('Error loading courses. Please try again.');
    });
}

let matchesData = [];
let tournamentPlayers = [];
let tournamentTeams = [];
let teeTimesData = [];
let isEditingRound = false;
let editingRoundId = null;

async function editRound(tournamentId, roundId) {
  isEditingRound = true;
  editingRoundId = roundId;

  // Hide dashboard, show add round form
  document.getElementById('user-dashboard').style.display = 'none';
  document.getElementById('add-round-container').style.display = 'block';

  // Store tournament ID
  sessionStorage.setItem('add_round_tournament_id', tournamentId);

  try {
    // Fetch round details
    const roundResponse = await fetch(`${API_BASE_URL}/api/rounds.php?round_id=${roundId}`, {
      credentials: 'include'
    });
    const roundData = await roundResponse.json();

    // Load courses
    const coursesResponse = await fetch(`${API_BASE_URL}/api/courses.php`, {
      credentials: 'include'
    });
    const courses = await coursesResponse.json();

    // Populate course dropdown
    const courseSelect = document.getElementById('add-round-course');
    courseSelect.innerHTML = '<option value="">-- Select Course --</option>';
    courses.forEach(course => {
      const option = document.createElement('option');
      option.value = course.course_id;
      option.textContent = course.name;
      if (course.course_id == roundData.course_id) {
        option.selected = true;
      }
      courseSelect.appendChild(option);
    });

    // Load tees for the selected course
    if (roundData.course_id) {
      const teesResponse = await fetch(`${API_BASE_URL}/api/get_course_tees.php?course_id=${roundData.course_id}`, {
        credentials: 'include'
      });
      const teesData = await teesResponse.json();

      const teesSelect = document.getElementById('add-round-tees');
      teesSelect.innerHTML = '<option value="">-- Select Tees --</option>';
      if (teesData.tees && teesData.tees.length > 0) {
        teesData.tees.forEach(tee => {
          const option = document.createElement('option');
          option.value = tee.tee_id;
          option.textContent = `${tee.tee_name} (${tee.slope}/${tee.rating}, ${tee.yardage} yds)`;
          if (tee.tee_id == roundData.tee_id) {
            option.selected = true;
          }
          teesSelect.appendChild(option);
        });
      }
    }

    // Set round date
    document.getElementById('add-round-date').value = roundData.round_date;

    // Change button text to "Continue"
    const submitBtn = document.querySelector('#add-round-form button[type="submit"]');
    submitBtn.textContent = 'Continue';

    // Show delete button (editing only)
    const deleteBtn   = document.getElementById('delete-round-btn');
    const deleteDivider = document.getElementById('delete-round-divider');
    if (deleteBtn) {
      deleteBtn.style.display = 'block';
      deleteDivider.style.display = 'block';
      // Remove prior listeners by cloning
      const fresh = deleteBtn.cloneNode(true);
      deleteBtn.replaceWith(fresh);
      fresh.addEventListener('click', () => {
        const roundName = roundData.round_name || 'this round';
        showDeleteRoundModal(roundId, tournamentId, roundName);
      });
    }

  } catch (err) {
    console.error('Error loading round data:', err);
    alert('Error loading round data. Please try again.');
    document.getElementById('add-round-container').style.display = 'none';
    document.getElementById('user-dashboard').style.display = 'block';
  }
}

async function loadExistingMatches(tournamentId, roundId) {
  try {
    const formatId   = parseInt(sessionStorage.getItem('add_round_format_id'));
    const isRyderCup = formatId === 3;
    const isSkins    = formatId === 5;
    tournamentTeams  = [];

    // Load tournament players and (for Ryder Cup) teams in parallel with existing matches
    const fetches = [
      fetch(`${API_BASE_URL}/api/tournament_golfers.php?tournament_id=${tournamentId}`, { credentials: 'include' }).then(r => r.json()),
      fetch(`${API_BASE_URL}/api/matches.php?round_id=${roundId}`, { credentials: 'include' }).then(r => r.json())
    ];
    if (isRyderCup) {
      fetches.push(fetch(`${API_BASE_URL}/api/tournament_teams.php?tournament_id=${tournamentId}`, { credentials: 'include' }).then(r => r.json()));
    }
    const results = await Promise.all(fetches);
    tournamentPlayers = results[0];
    const existingMatches = results[1];
    if (isRyderCup && results[2]) tournamentTeams = results[2];

    // Reset and populate matchesData
    matchesData = [];

    if (existingMatches && existingMatches.length > 0) {
      existingMatches.forEach(match => {
        const golfers = (match.golfers || []).sort((a, b) => a.team_position - b.team_position);

        if (isSkins) {
          // Skins: restore as players[] array ordered by team_position
          matchesData.push({
            match_id: match.match_id,
            players:  golfers.map(g => g.golfer_id)
          });
        } else {
          // Standard team-based formats
          const p1 = golfers.find(g => g.team_position === 1);
          const p2 = golfers.find(g => g.team_position === 2);
          const p3 = golfers.find(g => g.team_position === 3);
          const p4 = golfers.find(g => g.team_position === 4);
          matchesData.push({
            match_id:      match.match_id,
            team1_player1: p1 ? p1.golfer_id : '',
            team1_player2: p2 ? p2.golfer_id : '',
            team2_player1: p3 ? p3.golfer_id : '',
            team2_player2: p4 ? p4.golfer_id : ''
          });
        }
      });
    }

    // Apply Skins-specific labels (same as showMatchesScreen)
    const matchesTitle = document.querySelector('#add-matches-container h2');
    const addMatchBtn  = document.getElementById('add-match-btn');
    if (matchesTitle) matchesTitle.textContent = isSkins ? 'Groups' : 'Matches';
    if (addMatchBtn)  addMatchBtn.textContent  = isSkins ? '+ Add Group' : '+ Add Match';

    // Show matches screen
    document.getElementById('add-matches-container').style.display = 'block';
    renderMatches();

  } catch (err) {
    console.error('Error loading matches:', err);
    alert('Error loading matches. Please try again.');
  }
}

async function showMatchesScreen(tournamentId) {
  const formatId   = parseInt(sessionStorage.getItem('add_round_format_id'));
  const isRyderCup = formatId === 3;
  const isSkins    = formatId === 5;

  document.getElementById('add-matches-container').style.display = 'block';

  // Adjust labels for Skins
  const matchesTitle = document.querySelector('#add-matches-container h2');
  const addMatchBtn  = document.getElementById('add-match-btn');
  if (matchesTitle) matchesTitle.textContent = isSkins ? 'Groups' : 'Matches';
  if (addMatchBtn)  addMatchBtn.textContent  = isSkins ? '+ Add Group' : '+ Add Match';

  // Reset save buttons to clean state
  const saveFromMatchesBtn = document.getElementById('save-round-from-matches-btn');
  if (saveFromMatchesBtn) { saveFromMatchesBtn.disabled = false; saveFromMatchesBtn.textContent = 'Save Round (skip tee times)'; saveFromMatchesBtn.style.background = ''; saveFromMatchesBtn.style.opacity = '1'; }

  matchesData = [];
  tournamentTeams = [];

  try {
    const fetches = [
      fetch(`${API_BASE_URL}/api/tournament_golfers.php?tournament_id=${tournamentId}`, { credentials: 'include' }).then(r => r.json())
    ];
    if (isRyderCup) {
      fetches.push(fetch(`${API_BASE_URL}/api/tournament_teams.php?tournament_id=${tournamentId}`, { credentials: 'include' }).then(r => r.json()));
    }
    const [players, teams] = await Promise.all(fetches);
    tournamentPlayers = players;
    if (isRyderCup && teams) tournamentTeams = teams;
    renderMatches();
  } catch (err) {
    console.error('Error loading players:', err);
    alert('Error loading players. Please try again.');
  }
}

function addNewMatch() {
  const formatId  = parseInt(sessionStorage.getItem('add_round_format_id'));
  const matchIndex = matchesData.length;
  const matchId   = `new-${Date.now()}-${matchIndex}`;

  if (formatId === 5) {
    // Skins: individual players, no teams — start with 4 empty slots
    matchesData.push({ match_id: matchId, players: ['', '', '', ''] });
  } else {
    matchesData.push({
      match_id: matchId,
      team1_player1: '', team1_player2: '',
      team2_player1: '', team2_player2: ''
    });
  }
  renderMatches();
}

function renderSkinsMatches() {
  const matchesList = document.getElementById('matches-list');
  matchesList.innerHTML = '';

  // All golfer IDs already assigned across all groups
  const assignedSet = new Set();
  matchesData.forEach(m => (m.players || []).forEach(id => { if (id) assignedSet.add(String(id)); }));

  matchesData.forEach((match, groupIdx) => {
    const players = match.players || ['', '', '', ''];
    const groupDiv = document.createElement('div');
    groupDiv.style.cssText = 'border:1px solid #ddd; padding:1rem; border-radius:8px; margin-bottom:1rem; background:white;';

    const playerRows = players.map((pid, slotIdx) => {
      const opts = tournamentPlayers.map(p => {
        const taken = assignedSet.has(String(p.golfer_id)) && String(p.golfer_id) !== String(pid);
        const hcp   = parseFloat(p.handicap) % 1 === 0 ? parseInt(p.handicap) : parseFloat(p.handicap).toFixed(1);
        return `<option value="${p.golfer_id}" ${String(p.golfer_id) === String(pid) ? 'selected' : ''} ${taken ? 'disabled' : ''}>${p.first_name} ${p.last_name} (HCP ${hcp})${taken ? ' — assigned' : ''}</option>`;
      }).join('');
      return `
        <div style="display:flex; gap:0.5rem; align-items:center; margin-bottom:0.5rem;">
          <select class="skins-player-select" data-group="${groupIdx}" data-slot="${slotIdx}"
            style="flex:1; padding:0.5rem; font-size:0.95rem; border:1px solid #ccc; border-radius:4px;">
            <option value="">-- Player ${slotIdx + 1} --</option>
            ${opts}
          </select>
          ${players.length > 1 ? `<button class="skins-remove-slot-btn" data-group="${groupIdx}" data-slot="${slotIdx}"
            style="background:#dc3545; color:white; border:none; padding:0.35rem 0.6rem; border-radius:4px; cursor:pointer; font-size:0.85rem; flex-shrink:0;">✕</button>` : ''}
        </div>`;
    }).join('');

    groupDiv.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
        <h3 style="margin:0; font-size:1.1rem;">Group ${groupIdx + 1}</h3>
        <button class="skins-remove-group-btn" data-group="${groupIdx}"
          style="background:#dc3545; color:white; border:none; padding:0.25rem 0.75rem; border-radius:4px; cursor:pointer; font-size:0.9rem;">Remove</button>
      </div>
      ${playerRows}
      <button class="skins-add-slot-btn" data-group="${groupIdx}"
        style="width:100%; padding:0.4rem; background:#e8e8e8; color:#333; border:1px dashed #aaa; border-radius:4px; cursor:pointer; font-size:0.9rem; margin-top:0.25rem;">+ Add Player</button>
    `;
    matchesList.appendChild(groupDiv);
  });

  // Player select changes
  matchesList.querySelectorAll('.skins-player-select').forEach(sel => {
    sel.addEventListener('change', function() {
      matchesData[+this.dataset.group].players[+this.dataset.slot] = this.value;
      renderSkinsMatches();
    });
  });

  // Remove player slot
  matchesList.querySelectorAll('.skins-remove-slot-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      matchesData[+this.dataset.group].players.splice(+this.dataset.slot, 1);
      renderSkinsMatches();
    });
  });

  // Add player slot
  matchesList.querySelectorAll('.skins-add-slot-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      matchesData[+this.dataset.group].players.push('');
      renderSkinsMatches();
    });
  });

  // Remove whole group
  matchesList.querySelectorAll('.skins-remove-group-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      matchesData.splice(+this.dataset.group, 1);
      renderSkinsMatches();
    });
  });
}

function renderMatches() {
  const formatId = parseInt(sessionStorage.getItem('add_round_format_id'));
  if (formatId === 5) { renderSkinsMatches(); return; }

  const matchesList = document.getElementById('matches-list');
  matchesList.innerHTML = '';

  // Resolve team metadata — use DB teams for Ryder Cup, defaults otherwise
  const team1 = tournamentTeams[0] || { name: 'Team 1', color_hex: '#4F2185', team_id: null };
  const team2 = tournamentTeams[1] || { name: 'Team 2', color_hex: '#4F2185', team_id: null };

  // Build a set of all assigned golfer IDs across all matches
  // Convert to strings for consistent comparison
  const assignedGolfers = new Set();
  matchesData.forEach(match => {
    if (match.team1_player1) assignedGolfers.add(String(match.team1_player1));
    if (match.team1_player2) assignedGolfers.add(String(match.team1_player2));
    if (match.team2_player1) assignedGolfers.add(String(match.team2_player1));
    if (match.team2_player2) assignedGolfers.add(String(match.team2_player2));
  });

  matchesData.forEach((match, index) => {
    const matchDiv = document.createElement('div');
    matchDiv.style.cssText = 'border: 1px solid #ddd; padding: 1rem; border-radius: 8px; margin-bottom: 1rem; background: white;';

    // Helper function to generate player options filtered by team when applicable
    const generatePlayerOptions = (currentSelection, teamId = null) => {
      const eligible = teamId
        ? tournamentPlayers.filter(p => String(p.team_id) === String(teamId))
        : tournamentPlayers;
      return eligible.map(p => {
        const isAssigned = assignedGolfers.has(String(p.golfer_id)) && p.golfer_id != currentSelection;
        return `<option value="${p.golfer_id}" ${currentSelection == p.golfer_id ? 'selected' : ''} ${isAssigned ? 'disabled' : ''}>${p.first_name} ${p.last_name} (${p.handicap})${isAssigned ? ' (Assigned)' : ''}</option>`;
      }).join('');
    };

    matchDiv.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <h3 style="margin: 0; font-size: 1.1rem;">Match ${index + 1}</h3>
        <button class="remove-match-btn" data-index="${index}" style="background: #dc3545; color: white; border: none; padding: 0.25rem 0.75rem; border-radius: 4px; cursor: pointer; font-size: 0.9rem;">Remove</button>
      </div>

      <div style="margin-bottom: 1rem;">
        <label style="display: block; margin-bottom: 0.5rem; font-weight: bold; color: ${team1.color_hex};">${team1.name}</label>
        <div style="margin-bottom: 0.5rem;">
          <select class="match-player-select" data-match-index="${index}" data-team="1" data-position="1" style="width: 100%; padding: 0.5rem; font-size: 0.95rem; border: 1px solid #ccc; border-radius: 4px; margin-bottom: 0.5rem;">
            <option value="">-- Select Player 1 --</option>
            ${generatePlayerOptions(match.team1_player1, team1.team_id)}
          </select>
          <select class="match-player-select" data-match-index="${index}" data-team="1" data-position="2" style="width: 100%; padding: 0.5rem; font-size: 0.95rem; border: 1px solid #ccc; border-radius: 4px;">
            <option value="">-- Select Player 2 --</option>
            ${generatePlayerOptions(match.team1_player2, team1.team_id)}
          </select>
        </div>
      </div>

      <div style="margin-bottom: 0;">
        <label style="display: block; margin-bottom: 0.5rem; font-weight: bold; color: ${team2.color_hex};">${team2.name}</label>
        <div>
          <select class="match-player-select" data-match-index="${index}" data-team="2" data-position="1" style="width: 100%; padding: 0.5rem; font-size: 0.95rem; border: 1px solid #ccc; border-radius: 4px; margin-bottom: 0.5rem;">
            <option value="">-- Select Player 1 --</option>
            ${generatePlayerOptions(match.team2_player1, team2.team_id)}
          </select>
          <select class="match-player-select" data-match-index="${index}" data-team="2" data-position="2" style="width: 100%; padding: 0.5rem; font-size: 0.95rem; border: 1px solid #ccc; border-radius: 4px;">
            <option value="">-- Select Player 2 --</option>
            ${generatePlayerOptions(match.team2_player2, team2.team_id)}
          </select>
        </div>
      </div>
    `;

    matchesList.appendChild(matchDiv);
  });

  // Add event listeners for player selection
  document.querySelectorAll('.match-player-select').forEach(select => {
    select.addEventListener('change', function() {
      const matchIndex = parseInt(this.dataset.matchIndex);
      const team = this.dataset.team;
      const position = this.dataset.position;
      const key = `team${team}_player${position}`;
      matchesData[matchIndex][key] = this.value;
      // Re-render to update disabled states
      renderMatches();
    });
  });

  // Add event listeners for remove buttons
  document.querySelectorAll('.remove-match-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const index = parseInt(this.dataset.index);
      matchesData.splice(index, 1);
      renderMatches();
    });
  });
}

async function loadExistingTeeTimes() {
  try {
    // Load tee time assignments
    const response = await fetch(`${API_BASE_URL}/api/get_tee_time_assignments.php?round_id=${editingRoundId}`, {
      credentials: 'include'
    });
    const data = await response.json();

    // Reset tee times data
    teeTimesData = [];

    if (data.tee_times && data.tee_times.length > 0) {
      // Map match_id → index in matchesData
      const matchIdToIndex = {};
      data.matches.forEach((match, idx) => {
        matchIdToIndex[match.match_id] = idx;
      });

      // Group all assigned matches by tee_time_id (supports multiple matches per tee time)
      const matchesByTeeTime = {};
      data.matches.forEach(match => {
        if (match.tee_time_id) {
          if (!matchesByTeeTime[match.tee_time_id]) matchesByTeeTime[match.tee_time_id] = [];
          matchesByTeeTime[match.tee_time_id].push(`match-${matchIdToIndex[match.match_id]}`);
        }
      });

      data.tee_times.forEach(tt => {
        const timeParts = tt.time.split(':');
        teeTimesData.push({
          tee_time_id: tt.tee_time_id,
          hour: timeParts[0].padStart(2, '0'),
          minute: timeParts[1].padStart(2, '0'),
          match_ids: matchesByTeeTime[tt.tee_time_id] || []
        });
      });
    }

    if (teeTimesData.length === 0) {
      // No existing tee times, start with one empty
      addNewTeeTime();
    }

    // Show tee times screen
    document.getElementById('add-tee-times-container').style.display = 'block';
    renderTeeTimes();

  } catch (err) {
    console.error('Error loading tee times:', err);
    alert('Error loading tee times. Please try again.');
  }
}

function showTeeTimesScreen() {
  document.getElementById('add-tee-times-container').style.display = 'block';

  // Reset save button to clean state
  const saveAllBtn = document.getElementById('save-all-btn');
  if (saveAllBtn) { saveAllBtn.disabled = false; saveAllBtn.textContent = 'Save All'; saveAllBtn.style.background = ''; saveAllBtn.style.opacity = '1'; }

  // Reset tee times data
  teeTimesData = [];

  // Start with one empty tee time
  addNewTeeTime();
}

function addNewTeeTime() {
  const teeTimeIndex = teeTimesData.length;
  const teeTimeId = `new-${Date.now()}-${teeTimeIndex}`;

  teeTimesData.push({
    tee_time_id: teeTimeId,
    hour: '08',
    minute: '00',
    match_ids: []
  });

  renderTeeTimes();
}

function getMatchDisplayName(match) {
  // Skins format: players[] array, no teams
  if (Array.isArray(match.players)) {
    const names = match.players
      .map(id => tournamentPlayers.find(p => p.golfer_id == id))
      .filter(Boolean)
      .map(p => p.first_name);
    return names.length ? names.join(', ') : 'Empty Group';
  }

  // Standard team-based format
  const p1 = tournamentPlayers.find(p => p.golfer_id == match.team1_player1);
  const p2 = tournamentPlayers.find(p => p.golfer_id == match.team1_player2);
  const p3 = tournamentPlayers.find(p => p.golfer_id == match.team2_player1);
  const p4 = tournamentPlayers.find(p => p.golfer_id == match.team2_player2);

  const team1 = [p1, p2].filter(Boolean).map(p => p.first_name).join(' & ') || 'TBD';
  const team2 = [p3, p4].filter(Boolean).map(p => p.first_name).join(' & ') || 'TBD';

  return `${team1} vs ${team2}`;
}

function renderTeeTimes() {
  const teeTimesList = document.getElementById('tee-times-list');
  teeTimesList.innerHTML = '';

  const _ttFormatId = parseInt(sessionStorage.getItem('add_round_format_id'));
  const _isSkinsTT  = _ttFormatId === 5;
  const _matchLabel = _isSkinsTT ? 'Group' : 'Match';

  // Build set of all assigned match IDs across all tee times
  const allAssigned = new Set();
  teeTimesData.forEach(tt => {
    (tt.match_ids || []).forEach(mid => { if (mid) allAssigned.add(mid); });
  });

  // Generate match/group options for a specific slot
  const generateMatchOptions = (currentMatchId) => {
    return matchesData.map((match, matchIdx) => {
      const matchId = `match-${matchIdx}`;
      const isTaken = allAssigned.has(matchId) && matchId !== currentMatchId;
      return `<option value="${matchId}" ${currentMatchId === matchId ? 'selected' : ''} ${isTaken ? 'disabled' : ''}>${getMatchDisplayName(match)}${isTaken ? ' (Assigned)' : ''}</option>`;
    }).join('');
  };

  teeTimesData.forEach((teeTime, index) => {
    const teeTimeDiv = document.createElement('div');
    teeTimeDiv.style.cssText = 'border:1px solid #ddd; padding:1rem; border-radius:8px; margin-bottom:1rem; background:white; overflow:hidden; box-sizing:border-box;';

    const matchSlots = (teeTime.match_ids || []).map((matchId, slotIdx) => `
      <div style="display:flex; gap:0.5rem; margin-bottom:0.5rem; align-items:center; overflow:hidden;">
        <select class="tee-time-match-select" data-tee-index="${index}" data-slot-index="${slotIdx}" style="flex:1; min-width:0; padding:0.5rem; font-size:0.95rem; border:1px solid #ccc; border-radius:4px; overflow:hidden; text-overflow:ellipsis;">
          <option value="">-- Select ${_matchLabel} --</option>
          ${generateMatchOptions(matchId)}
        </select>
        <button class="remove-match-from-tee-btn" data-tee-index="${index}" data-slot-index="${slotIdx}" style="background:#dc3545; color:white; border:none; padding:0.4rem 0.6rem; border-radius:4px; cursor:pointer; font-size:0.85rem; flex-shrink:0;">✕</button>
      </div>
    `).join('');

    teeTimeDiv.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <h3 style="margin: 0; font-size: 1.1rem;">Tee Time ${index + 1}</h3>
        ${teeTimesData.length > 1 ? `<button class="remove-tee-time-btn" data-index="${index}" style="background: #dc3545; color: white; border: none; padding: 0.25rem 0.75rem; border-radius: 4px; cursor: pointer; font-size: 0.9rem;">Remove</button>` : ''}
      </div>

      <div style="margin-bottom: 1rem;">
        <label style="display: block; margin-bottom: 0.5rem; font-weight: bold;">Time</label>
        <div style="display: flex; gap: 0.5rem;">
          <select class="tee-time-hour-select" data-index="${index}" style="flex: 1; padding: 0.5rem; font-size: 0.95rem; border: 1px solid #ccc; border-radius: 4px;">
            ${Array.from({length: 12}, (_, i) => {
              const hour = String(i + 6).padStart(2, '0');
              return `<option value="${hour}" ${teeTime.hour === hour ? 'selected' : ''}>${hour}</option>`;
            }).join('')}
          </select>
          <span style="font-size: 1.2rem; font-weight: bold;">:</span>
          <select class="tee-time-minute-select" data-index="${index}" style="flex: 1; padding: 0.5rem; font-size: 0.95rem; border: 1px solid #ccc; border-radius: 4px;">
            ${Array.from({length: 60}, (_, i) => String(i).padStart(2, '0')).map(min =>
              `<option value="${min}" ${teeTime.minute === min ? 'selected' : ''}>${min}</option>`
            ).join('')}
          </select>
        </div>
      </div>

      <div>
        <label style="display: block; margin-bottom: 0.5rem; font-weight: bold;">${_matchLabel}s</label>
        ${matchSlots}
        <button class="add-match-to-tee-btn" data-tee-index="${index}" style="width: 100%; padding: 0.4rem; background: #e8e8e8; color: #333; border: 1px dashed #aaa; border-radius: 4px; cursor: pointer; font-size: 0.9rem;">+ Add ${_matchLabel}</button>
      </div>
    `;

    teeTimesList.appendChild(teeTimeDiv);
  });

  // Time selects
  document.querySelectorAll('.tee-time-hour-select').forEach(select => {
    select.addEventListener('change', function() {
      teeTimesData[parseInt(this.dataset.index)].hour = this.value;
    });
  });

  document.querySelectorAll('.tee-time-minute-select').forEach(select => {
    select.addEventListener('change', function() {
      teeTimesData[parseInt(this.dataset.index)].minute = this.value;
    });
  });

  // Match slot selects
  document.querySelectorAll('.tee-time-match-select').forEach(select => {
    select.addEventListener('change', function() {
      const teeIdx = parseInt(this.dataset.teeIndex);
      const slotIdx = parseInt(this.dataset.slotIndex);
      teeTimesData[teeIdx].match_ids[slotIdx] = this.value;
      renderTeeTimes();
    });
  });

  // Remove a match slot from a tee time
  document.querySelectorAll('.remove-match-from-tee-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const teeIdx = parseInt(this.dataset.teeIndex);
      const slotIdx = parseInt(this.dataset.slotIndex);
      teeTimesData[teeIdx].match_ids.splice(slotIdx, 1);
      renderTeeTimes();
    });
  });

  // Add a match slot to a tee time
  document.querySelectorAll('.add-match-to-tee-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const teeIdx = parseInt(this.dataset.teeIndex);
      teeTimesData[teeIdx].match_ids.push('');
      renderTeeTimes();
    });
  });

  // Remove entire tee time
  document.querySelectorAll('.remove-tee-time-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      teeTimesData.splice(parseInt(this.dataset.index), 1);
      renderTeeTimes();
    });
  });
}

function loadTournamentHistory(golferId) {
  const dashboardContainer = document.getElementById('user-dashboard');
  const historyContainer = document.getElementById('tournament-history-container');
  const historyContent = document.getElementById('tournament-history-content');

  // Hide other containers, show history
  dashboardContainer.style.display = 'none';
  document.getElementById('app-content').style.display = 'none';
  document.getElementById('best-ball-setup').style.display = 'none';
  document.getElementById('round-history-container').style.display = 'none';
  document.getElementById('edit-user-container').style.display = 'none';
  historyContainer.style.display = 'block';
  historyContent.innerHTML = '<p>Loading...</p>';

  // Fetch ALL tournaments for this user
  fetch(`${API_BASE_URL}/api/get_all_user_tournaments.php?golfer_id=${golferId}`, {
    credentials: 'include'
  })
    .then(res => res.json())
    .then(data => {
      if (data.error || !data.tournaments || data.tournaments.length === 0) {
        historyContent.innerHTML = '<p style="color: #666; font-style: italic;">No tournaments found</p>';
        return;
      }

      let html = '<div style="display: flex; flex-direction: column; gap: 1rem;">';

      data.tournaments.forEach(tournament => {
        // Check if this is a Quick Round (Best Ball, Rabbit, Wolf)
        const isQuickRound = tournament.rounds && tournament.rounds.length > 0 &&
                            ['Best Ball', 'Rabbit', 'Wolf'].includes(tournament.rounds[0].round_name);

        const cardClass = isQuickRound ? 'tournament-history-quick-round' : 'tournament-history-tournament';

        if (isQuickRound) {
          // Quick Round - single clickable card
          html += `
            <div class="${cardClass}"
                 data-tournament-id="${tournament.tournament_id}"
                 data-is-quick-round="true"
                 data-round-name="${tournament.rounds[0].round_name}"
                 style="border: 1px solid #ddd; padding: 1rem; border-radius: 8px; background: white; cursor: pointer; transition: all 0.2s;"
                 onmouseover="this.style.boxShadow='0 4px 8px rgba(0,0,0,0.1)'; this.style.transform='translateY(-2px)';"
                 onmouseout="this.style.boxShadow='none'; this.style.transform='translateY(0)';">
              <div style="display: flex; justify-content: space-between; align-items: start;">
                <h4 style="margin: 0 0 0.25rem 0;">${tournament.tournament_name}</h4>
                <span style="background: #FFC62F; color: black; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.85rem;">Quick Round</span>
              </div>
              ${currentUser && currentUser.org_name ? `<p style="margin: 0 0 0.25rem 0; font-size: 0.8rem; color: #999; font-weight: 500; text-transform: uppercase; letter-spacing: 0.03em;">${currentUser.org_name}</p>` : ''}
              <p style="margin: 0; font-size: 0.9rem; color: #666;">${tournament.start_date} to ${tournament.end_date}</p>
            </div>
          `;
        } else {
          // Regular tournament - show round buttons
          html += `
            <div style="border: 1px solid #ddd; padding: 1rem; border-radius: 8px; background: white;">
              <h4 style="margin: 0 0 0.25rem 0;">${tournament.tournament_name}</h4>
              ${currentUser && currentUser.org_name ? `<p style="margin: 0 0 0.25rem 0; font-size: 0.8rem; color: #999; font-weight: 500; text-transform: uppercase; letter-spacing: 0.03em;">${currentUser.org_name}</p>` : ''}
              <p style="margin: 0 0 0.5rem 0; font-size: 0.9rem; color: #666;">${tournament.start_date} to ${tournament.end_date}</p>
          `;

          if (tournament.rounds && tournament.rounds.length > 0) {
            html += '<div style="margin-top: 0.5rem;">';
            tournament.rounds.forEach(round => {
              html += `
                <button class="tournament-round-btn" data-tournament-id="${tournament.tournament_id}" data-round-id="${round.round_id}" data-round-name="${round.round_name}" data-format-id="${tournament.format_id || ''}" style="display: block; width: 100%; margin-bottom: 0.5rem; padding: 0.5rem; background: #4F2185; color: white; border: none; border-radius: 4px; cursor: pointer; text-align: left;">
                  ${round.round_name}
                </button>
              `;
            });
            html += '</div>';
          } else {
            html += '<p style="margin: 0.5rem 0 0 0; font-size: 0.9rem; color: #999;">No rounds scheduled</p>';
          }

          html += '</div>';
        }
      });

      html += '</div>';
      historyContent.innerHTML = html;

      // Add click handlers for Quick Round cards
      document.querySelectorAll('.tournament-history-quick-round').forEach(card => {
        card.addEventListener('click', function() {
          const tournamentId = this.dataset.tournamentId;
          const roundName = this.dataset.roundName;
          loadQuickRoundFromTournament(tournamentId, roundName);
        });
      });

      // Add click handlers for tournament round buttons (same as dashboard)
      historyContent.querySelectorAll('.tournament-round-btn').forEach(btn => {
        btn.addEventListener('click', function() {
          const roundId = this.dataset.roundId;
          const tournamentId = this.dataset.tournamentId;
          const roundName = this.dataset.roundName;
          const formatId = this.dataset.formatId ? parseInt(this.dataset.formatId) : null;

          // Check if this is a Quick Round
          const isQuickRound = ['Best Ball', 'Rabbit', 'Wolf'].includes(roundName);

          sessionStorage.setItem('selected_golfer_id', currentUser.golfer_id);
          sessionStorage.setItem('selected_round_id', roundId);

          if (isQuickRound) {
            loadQuickRoundFromTournament(tournamentId, roundName);
          } else if (formatId === 4) {
            // Guys Trip tournament
            loadGuysTripTournamentRound(roundId, tournamentId, roundName, formatId);
          } else {
            // Regular tournament (Ryder Cup, etc.)
            loadTournamentRound(roundId, tournamentId, roundName);
          }
        });
      });
    })
    .catch(err => {
      console.error('Error loading tournament history:', err);
      historyContent.innerHTML = '<p style="color: red;">Error loading tournament history</p>';
    });
}

function loadQuickRoundFromTournament(tournamentId, roundName) {
  // Determine which container was visible (dashboard or history)
  const dashboardWasVisible = document.getElementById('user-dashboard').style.display !== 'none';
  const historyWasVisible = document.getElementById('tournament-history-container').style.display !== 'none';

  // Hide dashboard and tournament history
  document.getElementById('user-dashboard').style.display = 'none';
  document.getElementById('tournament-history-container').style.display = 'none';

  // Clear and recreate score-entry-content div (needed for scoring functions)
  const mainContent = document.getElementById('content');
  mainContent.innerHTML = '';
  const scoreEntryDiv = document.createElement('div');
  scoreEntryDiv.id = 'score-entry-content';
  scoreEntryDiv.style.paddingBottom = '2rem';
  mainContent.appendChild(scoreEntryDiv);

  // Find the match for this tournament and load the appropriate view
  fetch(`${API_BASE_URL}/api/get_match_by_tournament.php?tournament_id=${tournamentId}`, {
    credentials: 'include'
  })
    .then(res => res.json())
    .then(data => {
      if (data.success && data.match_id) {
        const isFinalized = parseInt(data.finalized) === 1;

        if (roundName === 'Best Ball') {
          sessionStorage.setItem('best_ball_match_id', data.match_id);
          sessionStorage.setItem('best_ball_tournament_id', tournamentId);

          if (isFinalized) {
            // Load read-only version for finalized matches
            sessionStorage.setItem('quick_round_read_only', 'true');
            loadBestBallScorecardReadOnly();
          } else {
            // Load editable version for active matches
            sessionStorage.removeItem('quick_round_read_only');
            loadBestBallScoring();
          }
        } else if (roundName === 'Rabbit') {
          sessionStorage.setItem('rabbit_match_id', data.match_id);
          sessionStorage.setItem('rabbit_tournament_id', tournamentId);

          if (isFinalized) {
            sessionStorage.setItem('quick_round_read_only', 'true');
            loadRabbitScorecardReadOnly();
          } else {
            sessionStorage.removeItem('quick_round_read_only');
            loadRabbitScoring();
          }
        } else if (roundName === 'Wolf') {
          sessionStorage.setItem('wolf_match_id', data.match_id);
          sessionStorage.setItem('wolf_tournament_id', tournamentId);

          if (isFinalized) {
            sessionStorage.setItem('quick_round_read_only', 'true');
            loadWolfScorecardReadOnly();
          } else {
            sessionStorage.removeItem('quick_round_read_only');
            loadWolfScoring();
          }
        }
      } else {
        alert('Could not load match data');
        // Restore whichever container was visible before
        if (dashboardWasVisible) {
          document.getElementById('user-dashboard').style.display = 'block';
        } else if (historyWasVisible) {
          document.getElementById('tournament-history-container').style.display = 'block';
        }
      }
    })
    .catch(err => {
      console.error('Error loading quick round:', err);
      alert('Error loading quick round');
      // Restore whichever container was visible before
      if (dashboardWasVisible) {
        document.getElementById('user-dashboard').style.display = 'block';
      } else if (historyWasVisible) {
        document.getElementById('tournament-history-container').style.display = 'block';
      }
    });
}

function loadFullTournamentView(tournamentId) {
  // Hide tournament history
  document.getElementById('tournament-history-container').style.display = 'none';

  // TODO: Load full tournament view (leaderboard, scorecards, etc.)
  console.log('Load full tournament:', tournamentId);
  alert('Full tournament view coming soon!');
  document.getElementById('tournament-history-container').style.display = 'block';
}

function loadDefaultMatchTab(roundId, tournamentId, golferId) {
  const url = `${API_BASE_URL}/api/get_match_by_round.php?round_id=${roundId}&tournament_id=${tournamentId}&golfer_id=${golferId}`;
  fetch(url, { credentials: 'include' })
    .then(res => res.json())
    .then(data => {
      const hasMatch = data.match && data.match.length > 0;
      const page = hasMatch ? 'my-match' : 'tournament';
      document.querySelectorAll('.tabs button').forEach(btn => btn.classList.remove('active'));
      const tabBtn = document.querySelector(`button[data-page="${page}"]`);
      if (tabBtn) tabBtn.classList.add('active');
      loadPage(page);
    })
    .catch(() => {
      document.querySelectorAll('.tabs button').forEach(btn => btn.classList.remove('active'));
      const btn = document.querySelector('button[data-page="my-match"]');
      if (btn) btn.classList.add('active');
      loadPage('my-match');
    });
}

function loadTournamentRound(roundId, tournamentId, roundName = '') {
  // Hide dashboard and other containers
  document.getElementById('user-dashboard').style.display = 'none';
  document.getElementById('round-history-container').style.display = 'none';
  document.getElementById('best-ball-setup').style.display = 'none';
  document.getElementById('tournament-history-container').style.display = 'none';
  document.getElementById('edit-user-container').style.display = 'none';

  // Store tournament and round info in sessionStorage
  sessionStorage.setItem('selected_round_id', roundId);
  sessionStorage.setItem('selected_tournament_id', tournamentId);
  sessionStorage.setItem('selected_round_name', roundName);
  sessionStorage.setItem('golfer_id', currentUser.golfer_id);
  sessionStorage.removeItem('selected_format_id'); // Clear format_id for non-Guys Trip tournaments

  // Set the round name in the subheader and show round bar
  const roundNameEl = document.getElementById('round-name');
  if (roundNameEl) {
    roundNameEl.textContent = roundName;
  }
  const roundBar = document.getElementById('round-bar');
  if (roundBar) {
    roundBar.style.display = 'block';
  }

  // Ensure nav tabs are visible (they get hidden by Quick Rounds)
  const appContent = document.getElementById('app-content');
  const navElement = appContent.querySelector('nav');
  if (navElement) {
    navElement.style.display = 'block';
  }

  // Fetch tournament teams and user's team assignment before loading the page
  Promise.all([
    fetch(`${API_BASE_URL}/api/tournament_teams.php?tournament_id=${tournamentId}`, { credentials: 'include' }).then(res => res.json()),
    fetch(`${API_BASE_URL}/api/tournament_golfers.php?tournament_id=${tournamentId}`, { credentials: 'include' }).then(res => res.json())
  ])
  .then(([teams, golfers]) => {
    // Find the current user's team assignment
    const userGolfer = golfers.find(g => g.golfer_id == currentUser.golfer_id);
    const userTeamId = userGolfer ? userGolfer.team_id : null;

    // Set primary team (user's team) and secondary team
    teams.forEach(team => {
      if (team.team_id == userTeamId) {
        primaryTeamName = team.name;
        primaryTeamColor = team.color_hex;
        primaryTeamId = team.team_id;
      } else {
        secondaryTeamName = team.name;
        secondaryTeamColor = team.color_hex;
        secondaryTeamId = team.team_id;
      }
    });

    // Store in sessionStorage
    sessionStorage.setItem('primary_team_name', primaryTeamName);
    sessionStorage.setItem('primary_team_color', primaryTeamColor);
    sessionStorage.setItem('secondary_team_name', secondaryTeamName);
    sessionStorage.setItem('secondary_team_color', secondaryTeamColor);
    sessionStorage.setItem('primary_team_id', primaryTeamId);
    sessionStorage.setItem('secondary_team_id', secondaryTeamId);
    sessionStorage.setItem('team_id', userTeamId);

    assignCSSColors(primaryTeamColor, secondaryTeamColor);

    // Set round bar text color based on primary team color
    const roundBar = document.getElementById('round-bar');
    if (roundBar && primaryTeamColor) {
      roundBar.style.color = pickContrastColorFromHex(primaryTeamColor);
    }

    // Show the app content
    document.getElementById('app-content').style.display = 'block';

    // Default to My Match, but fall back to Tournament tab if no matchups assigned yet
    loadDefaultMatchTab(roundId, tournamentId, currentUser.golfer_id);
  })
  .catch(err => {
    console.error('Error loading tournament data:', err);
    document.getElementById('app-content').style.display = 'block';
    loadDefaultMatchTab(roundId, tournamentId, currentUser.golfer_id);
  });
}

function loadGuysTripTournamentRound(roundId, tournamentId, roundName = '', formatId = 4) {
  console.log('Loading Guys Trip tournament round:', { roundId, tournamentId, roundName, formatId });

  // Hide dashboard and other containers
  document.getElementById('user-dashboard').style.display = 'none';
  document.getElementById('round-history-container').style.display = 'none';
  document.getElementById('best-ball-setup').style.display = 'none';
  document.getElementById('tournament-history-container').style.display = 'none';
  document.getElementById('edit-user-container').style.display = 'none';

  // Store tournament and round info in sessionStorage
  sessionStorage.setItem('selected_round_id', roundId);
  sessionStorage.setItem('selected_tournament_id', tournamentId);
  sessionStorage.setItem('selected_round_name', roundName);
  sessionStorage.setItem('selected_format_id', formatId); // Store format_id so we can check it later
  sessionStorage.setItem('golfer_id', currentUser.golfer_id);

  // Set the round name in the subheader and show round bar
  const roundNameEl = document.getElementById('round-name');
  if (roundNameEl) {
    roundNameEl.textContent = roundName;
  }
  const roundBar = document.getElementById('round-bar');
  if (roundBar) {
    roundBar.style.display = 'block';
  }

  // Ensure nav tabs are visible (they get hidden by Quick Rounds)
  const appContent = document.getElementById('app-content');
  const navElement = appContent.querySelector('nav');
  if (navElement) {
    navElement.style.display = 'block';
  }

  // For Guys Trip, we don't have traditional teams but we still want to set default colors
  // Use purple as default primary color
  primaryTeamName = 'Guys Trip';
  primaryTeamColor = '#4F2185';
  primaryTeamId = null;
  secondaryTeamName = '';
  secondaryTeamColor = '#FFC62F';
  secondaryTeamId = null;

  // Store in sessionStorage
  sessionStorage.setItem('primary_team_name', primaryTeamName);
  sessionStorage.setItem('primary_team_color', primaryTeamColor);
  sessionStorage.setItem('secondary_team_name', secondaryTeamName);
  sessionStorage.setItem('secondary_team_color', secondaryTeamColor);
  sessionStorage.setItem('primary_team_id', '');
  sessionStorage.setItem('secondary_team_id', '');
  sessionStorage.setItem('team_id', '');

  assignCSSColors(primaryTeamColor, secondaryTeamColor);

  // Set round bar text color based on primary team color
  if (roundBar && primaryTeamColor) {
    roundBar.style.color = pickContrastColorFromHex(primaryTeamColor);
  }

  // Show the app content
  document.getElementById('app-content').style.display = 'block';

  // Rename "My Match" tab to "My Group" for Skins
  const myMatchTabBtn = document.querySelector('button[data-page="my-match"]');
  if (myMatchTabBtn) {
    myMatchTabBtn.textContent = formatId === 5 ? 'My Group' : 'My Match';
  }

  // Default to My Match, but fall back to Tournament tab if no matchups assigned yet
  loadDefaultMatchTab(roundId, tournamentId, currentUser.golfer_id);
}

// ── New Tournament — shared cancel ───────────────────────────────────────────
function cancelNewTournament() {
  window._newTournamentData = null;
  ['create-tournament-container', 'create-tournament-step2', 'create-tournament-step3', 'create-tournament-gt-step2']
    .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
  document.getElementById('user-dashboard').style.display = 'block';
}

// ── New Tournament — Step 1 ───────────────────────────────────────────────────
async function showNewTournamentStep1() {
  document.getElementById('user-dashboard').style.display = 'none';
  document.getElementById('create-tournament-container').style.display = 'block';

  // Populate format dropdown if not already done
  const formatSelect = document.getElementById('nt-format');
  if (formatSelect.options.length <= 1) {
    try {
      const res  = await fetch(`${API_BASE_URL}/api/formats.php`, { credentials: 'include' });
      const data = await res.json();
      (Array.isArray(data) ? data : []).forEach(f => {
        const opt = document.createElement('option');
        opt.value       = f.format_id;
        opt.textContent = f.label || f.name;
        formatSelect.appendChild(opt);
      });
    } catch (e) {
      console.error('Failed to load formats:', e);
    }
  }

  // Clear previous values
  document.getElementById('nt-name').value      = '';
  document.getElementById('nt-start-date').value = '';
  document.getElementById('nt-end-date').value   = '';
  document.getElementById('nt-handicap').value   = '80';
  formatSelect.value = '';
  document.getElementById('nt-error').style.display = 'none';
}

// ── New Tournament — Step 2 ───────────────────────────────────────────────────
function showNewTournamentStep2() {
  document.getElementById('create-tournament-container').style.display = 'none';
  document.getElementById('create-tournament-step2').style.display = 'block';

  // Show format name as subtitle
  const subtitle = document.getElementById('nt-step2-subtitle');
  if (subtitle) subtitle.textContent = window._newTournamentData.formatName || '';

  // Reset to defaults
  document.getElementById('nt-team1-name').value  = '';
  document.getElementById('nt-team2-name').value  = '';
  document.getElementById('nt-team1-color').value = '#1565C0';
  document.getElementById('nt-team2-color').value = '#C62828';
  document.getElementById('nt-step2-error').style.display = 'none';
}

// ── New Tournament — Step 3 ───────────────────────────────────────────────────
async function showNewTournamentStep3() {
  document.getElementById('create-tournament-step2').style.display = 'none';
  document.getElementById('create-tournament-step3').style.display = 'block';
  document.getElementById('nt-step3-error').style.display = 'none';

  // Show format name as subtitle
  const subtitle = document.getElementById('nt-step3-subtitle');
  if (subtitle) subtitle.textContent = window._newTournamentData.formatName || '';

  const content = document.getElementById('nt-step3-content');
  content.innerHTML = '<p style="color: rgba(255,255,255,0.7); text-align: center;">Loading players…</p>';

  const teams = window._newTournamentData.teams;
  const team1 = teams[0];
  const team2 = teams[1];

  // assignments: golfer_id → 1 or 2 (or 0 = unassigned)
  if (!window._newTournamentData.assignments) {
    window._newTournamentData.assignments = {};
  }

  let golfers = [];
  try {
    const res = await fetch(`${API_BASE_URL}/api/golfers.php`, { credentials: 'include' });
    golfers = await res.json();
    if (!Array.isArray(golfers)) golfers = [];
  } catch (e) {
    content.innerHTML = '<p style="color: #ffcccc;">Failed to load players. Please go back and try again.</p>';
    return;
  }

  function renderStep3() {
    const assignments = window._newTournamentData.assignments;

    const unassigned = golfers.filter(g => !assignments[g.golfer_id]);
    const inTeam1    = golfers.filter(g => assignments[g.golfer_id] === 1);
    const inTeam2    = golfers.filter(g => assignments[g.golfer_id] === 2);

    const golferRow = (g, assigned) => `
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.6rem 0; border-bottom: 1px solid #eee;">
        <span style="font-weight: 500; color: #333;">${g.first_name} ${g.last_name} <span style="font-weight: 400; color: #999; font-size: 0.85rem;">HCP ${parseFloat(g.handicap) % 1 === 0 ? parseInt(g.handicap) : parseFloat(g.handicap)}</span></span>
        <div style="display: flex; gap: 0.4rem;">
          <button class="nt-assign-btn" data-golfer-id="${g.golfer_id}" data-team="1"
            style="padding: 0.3rem 0.7rem; border: 2px solid ${team1.color}; border-radius: 4px; cursor: pointer; font-size: 0.85rem; font-weight: 600;
                   background: ${assigned === 1 ? team1.color : 'white'}; color: ${assigned === 1 ? 'white' : team1.color};">
            ${team1.name}
          </button>
          <button class="nt-assign-btn" data-golfer-id="${g.golfer_id}" data-team="2"
            style="padding: 0.3rem 0.7rem; border: 2px solid ${team2.color}; border-radius: 4px; cursor: pointer; font-size: 0.85rem; font-weight: 600;
                   background: ${assigned === 2 ? team2.color : 'white'}; color: ${assigned === 2 ? 'white' : team2.color};">
            ${team2.name}
          </button>
        </div>
      </div>`;

    const section = (title, color, list, emptyMsg) => `
      <div style="background: white; border-radius: 8px; padding: 1rem; margin-bottom: 0.75rem;">
        <h3 style="margin: 0 0 0.5rem 0; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.05em; color: ${color};">${title}</h3>
        ${list.length ? list.map(g => golferRow(g, window._newTournamentData.assignments[g.golfer_id] || 0)).join('') : `<p style="color:#999; margin:0; font-size:0.9rem;">${emptyMsg}</p>`}
      </div>`;

    content.innerHTML =
      section(team1.name, team1.color, inTeam1, 'No players yet') +
      section(team2.name, team2.color, inTeam2, 'No players yet') +
      section('Unassigned', '#666', unassigned, 'All players assigned ✓');

    // Bind assign buttons
    content.querySelectorAll('.nt-assign-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const gId  = parseInt(btn.dataset.golferId);
        const team = parseInt(btn.dataset.team);
        // Toggle off if already on this team, otherwise assign
        if (window._newTournamentData.assignments[gId] === team) {
          delete window._newTournamentData.assignments[gId];
        } else {
          window._newTournamentData.assignments[gId] = team;
        }
        renderStep3();
      });
    });
  }

  renderStep3();
}

// ── New Tournament — Guys Trip Step 2: Choose Players ────────────────────────
async function showGuysTripStep2() {
  document.getElementById('create-tournament-container').style.display = 'none';
  const step = document.getElementById('create-tournament-gt-step2');
  step.style.display = 'block';

  const subtitle = document.getElementById('nt-gt-subtitle');
  if (subtitle) subtitle.textContent = window._newTournamentData.formatName || '';

  const listEl     = document.getElementById('nt-gt-players-list');
  const countEl    = document.getElementById('nt-gt-selected-count');
  const errorEl    = document.getElementById('nt-gt-error');
  errorEl.style.display = 'none';

  if (!window._newTournamentData.selectedGolfers) {
    window._newTournamentData.selectedGolfers = new Set();
  }

  listEl.innerHTML = '<p style="color:#888; text-align:center;">Loading players…</p>';

  let golfers = [];
  try {
    const res = await fetch(`${API_BASE_URL}/api/golfers.php`, { credentials: 'include' });
    golfers = await res.json();
    if (!Array.isArray(golfers)) golfers = [];
  } catch (e) {
    listEl.innerHTML = '<p style="color:red;">Failed to load players. Please go back and try again.</p>';
    return;
  }

  function updateCount() {
    const n = window._newTournamentData.selectedGolfers.size;
    countEl.textContent = `${n} player${n !== 1 ? 's' : ''} selected`;
  }

  function renderPlayers() {
    const selected = window._newTournamentData.selectedGolfers;
    listEl.innerHTML = golfers.map(g => {
      const checked = selected.has(g.golfer_id);
      const hcp = parseFloat(g.handicap) % 1 === 0 ? parseInt(g.handicap) : parseFloat(g.handicap).toFixed(1);
      return `
        <label data-golfer-id="${g.golfer_id}"
          style="display:flex; align-items:center; gap:0.75rem; padding:0.7rem 0.5rem;
                 border-bottom:1px solid #f0f0f0; cursor:pointer;
                 background:${checked ? '#f4f0fa' : 'transparent'}; border-radius:6px;">
          <input type="checkbox" data-golfer-id="${g.golfer_id}" ${checked ? 'checked' : ''}
            style="width:1.2rem; height:1.2rem; accent-color:#4F2185; cursor:pointer; flex-shrink:0;">
          <span style="flex:1; font-size:0.95rem; font-weight:500; color:#1a1a1a;">
            ${g.first_name} ${g.last_name}
          </span>
          <span style="font-size:0.82rem; color:#888;">HCP ${hcp}</span>
        </label>`;
    }).join('');

    listEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        const gId = parseInt(cb.dataset.golferId);
        if (cb.checked) {
          window._newTournamentData.selectedGolfers.add(gId);
        } else {
          window._newTournamentData.selectedGolfers.delete(gId);
        }
        updateCount();
        // Update row background without full re-render
        const lbl = listEl.querySelector(`label[data-golfer-id="${gId}"]`);
        if (lbl) lbl.style.background = cb.checked ? '#f4f0fa' : 'transparent';
      });
    });

    updateCount();
  }

  renderPlayers();

  // Select All toggle
  const selectAllBtn = document.getElementById('nt-gt-select-all-btn');
  selectAllBtn.onclick = () => {
    const allSelected = window._newTournamentData.selectedGolfers.size === golfers.length;
    if (allSelected) {
      window._newTournamentData.selectedGolfers.clear();
      selectAllBtn.textContent = 'Select All';
    } else {
      golfers.forEach(g => window._newTournamentData.selectedGolfers.add(g.golfer_id));
      selectAllBtn.textContent = 'Deselect All';
    }
    renderPlayers();
  };

  // Back
  document.getElementById('nt-gt-back-btn').onclick = () => {
    step.style.display = 'none';
    document.getElementById('create-tournament-container').style.display = 'block';
  };

  // Cancel
  document.getElementById('nt-gt-cancel-btn').onclick = cancelNewTournament;

  // Create Tournament
  const createBtn = document.getElementById('nt-gt-create-btn');
  createBtn.onclick = async () => {
    const selected = window._newTournamentData.selectedGolfers;
    if (selected.size === 0) {
      errorEl.textContent = 'Please select at least one player.';
      errorEl.style.display = 'block';
      return;
    }
    errorEl.style.display = 'none';
    createBtn.disabled = true;
    createBtn.textContent = 'Creating…';

    try {
      const d = window._newTournamentData;

      // 1. Create the tournament
      const tRes  = await fetch(`${API_BASE_URL}/api/tournaments.php`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:         d.name,
          start_date:   d.startDate,
          end_date:     d.endDate,
          handicap_pct: parseFloat(d.handicap),
          format_id:    parseInt(d.formatId),
        }),
      });
      const tData = await tRes.json();
      if (!tData.inserted_id) throw new Error('Tournament creation failed');

      // 2. Save golfer list (no teams)
      const gRes = await fetch(`${API_BASE_URL}/api/save_guys_trip_golfers.php`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tournament_id: tData.inserted_id,
          golfer_ids:    [...selected],
        }),
      });
      const gData = await gRes.json();
      if (!gData.success) throw new Error(gData.error || 'Failed to save players');

      // Done
      window._newTournamentData = null;
      ['create-tournament-container', 'create-tournament-step2', 'create-tournament-step3', 'create-tournament-gt-step2']
        .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
      document.getElementById('user-dashboard').style.display = 'block';
      loadUserTournaments(currentUser.golfer_id);

    } catch (err) {
      console.error('Tournament creation error:', err);
      errorEl.textContent = 'Error creating tournament. Please try again.';
      errorEl.style.display = 'block';
      createBtn.disabled = false;
      createBtn.textContent = 'Create Tournament';
    }
  };
}

// ── Edit Group page ───────────────────────────────────────────────────────────
// ── Course Manager ─────────────────────────────────────────────────────────

async function showCourseManager() {
  document.getElementById('edit-group-container').style.display    = 'none';
  document.getElementById('course-form-container').style.display   = 'none';
  const container = document.getElementById('manage-courses-container');
  container.style.display = 'block';

  const listEl = document.getElementById('courses-list');
  listEl.innerHTML = '<p style="color:var(--color-text-muted); text-align:center;">Loading…</p>';

  let courses = [];
  try {
    const res = await fetch(`${API_BASE_URL}/api/courses.php`, { credentials: 'include' });
    courses = await res.json();
    if (!Array.isArray(courses)) courses = [];
  } catch (e) {
    listEl.innerHTML = '<p style="color:var(--color-action-danger);">Failed to load courses.</p>';
    return;
  }

  if (courses.length === 0) {
    listEl.innerHTML = '<p style="color:var(--color-text-muted); text-align:center; font-style:italic;">No courses yet — add one below.</p>';
  } else {
    listEl.innerHTML = courses.map(c => `
      <div class="course-card">
        <div class="course-card-info">
          <p class="course-card-name">${c.name}</p>
        </div>
        <div class="course-card-actions">
          <button class="btn btn-neutral btn-sm btn-auto edit-course-btn" data-id="${c.course_id}">Edit</button>
          <button class="btn btn-danger btn-sm btn-auto delete-course-btn" data-id="${c.course_id}" data-name="${c.name.replace(/"/g,'&quot;')}">Delete</button>
        </div>
      </div>`).join('');

    listEl.querySelectorAll('.edit-course-btn').forEach(btn => {
      btn.addEventListener('click', () => showCourseForm(parseInt(btn.dataset.id)));
    });
    listEl.querySelectorAll('.delete-course-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm(`Delete "${btn.dataset.name}"? This cannot be undone.`)) return;
        await fetch(`${API_BASE_URL}/api/courses.php?course_id=${btn.dataset.id}`, {
          method: 'DELETE', credentials: 'include'
        });
        showCourseManager();
      });
    });
  }

  document.getElementById('courses-back-btn').onclick = () => {
    container.style.display = 'none';
    showEditGroupPage();
  };
  document.getElementById('add-course-btn').onclick = () => showCourseForm(null);
}

// _courseTeesData: array of tee objects managed while the form is open
let _courseTeesData = [];

function _renderCourseTeesUI() {
  const list = document.getElementById('cf-tees-list');
  if (_courseTeesData.length === 0) {
    list.innerHTML = '<p style="color:var(--color-text-muted); font-size:var(--font-size-sm); margin:0;">No tees yet — add one below.</p>';
    return;
  }

  list.innerHTML = _courseTeesData.map((t, i) => `
    <div class="tee-card tee-row" data-tee-index="${i}">
      <div style="display:flex; align-items:center; gap:var(--space-2); margin-bottom:var(--space-3);">
        <input type="text" class="tee-name form-input" value="${(t.tee_name || '').replace(/"/g,'&quot;')}"
          placeholder="Tee name (e.g. Blue, White, Red)" maxlength="50" style="flex:1;">
        <button class="btn-remove-tee" data-index="${i}" title="Remove tee">✕</button>
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-3);">
        <div>
          <label class="form-label">Slope</label>
          <input type="number" class="tee-slope form-input" value="${t.slope || ''}"
            placeholder="113" min="55" max="155">
        </div>
        <div>
          <label class="form-label">Rating</label>
          <input type="number" class="tee-rating form-input" value="${t.rating || ''}"
            placeholder="72.0" step="0.1" min="60" max="82">
        </div>
        <div>
          <label class="form-label">Par</label>
          <input type="number" class="tee-par form-input" value="${t.par || 72}"
            placeholder="72" min="27" max="82">
        </div>
        <div>
          <label class="form-label">Yardage</label>
          <input type="number" class="tee-yardage form-input" value="${t.yardage || ''}"
            placeholder="6500" min="1000" max="9000">
        </div>
      </div>
    </div>`).join('');

  // Sync changes back to _courseTeesData on input
  list.querySelectorAll('.tee-row').forEach(row => {
    const i = parseInt(row.dataset.teeIndex);
    row.querySelector('.tee-name').oninput    = e => { _courseTeesData[i].tee_name = e.target.value; };
    row.querySelector('.tee-slope').oninput   = e => { _courseTeesData[i].slope    = e.target.value; };
    row.querySelector('.tee-rating').oninput  = e => { _courseTeesData[i].rating   = e.target.value; };
    row.querySelector('.tee-par').oninput     = e => { _courseTeesData[i].par      = e.target.value; };
    row.querySelector('.tee-yardage').oninput = e => { _courseTeesData[i].yardage  = e.target.value; };
    row.querySelector('.btn-remove-tee').onclick = e => {
      _courseTeesData.splice(parseInt(e.target.dataset.index), 1);
      _renderCourseTeesUI();
    };
  });
}

async function showCourseForm(courseId) {
  document.getElementById('manage-courses-container').style.display = 'none';
  const container = document.getElementById('course-form-container');
  container.style.display = 'block';

  document.getElementById('course-form-title').textContent = courseId ? 'Edit Course' : 'Add Course';
  document.getElementById('cf-name').value = '';
  document.getElementById('cf-error').style.display = 'none';
  _courseTeesData = [];

  // Build the 18-hole input grid
  const tbody = document.getElementById('cf-holes-body');
  tbody.innerHTML = Array.from({length: 18}, (_, i) => {
    const h = i + 1;
    return `
      <tr>
        <td class="hole-num">${h}</td>
        <td>
          <select class="hole-par-select" data-hole="${h}">
            <option value="3">3</option>
            <option value="4" selected>4</option>
            <option value="5">5</option>
            <option value="6">6</option>
          </select>
        </td>
        <td>
          <input type="number" class="hole-hi-input" data-hole="${h}"
            placeholder="–" min="1" max="18" style="width:3.2rem;">
        </td>
      </tr>`;
  }).join('');

  _renderCourseTeesUI();

  // Pre-fill if editing
  if (courseId) {
    container.dataset.courseId = courseId;
    try {
      const [courseRes, teesRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/courses.php?course_id=${courseId}`, { credentials: 'include' }),
        fetch(`${API_BASE_URL}/api/get_course_tees.php?course_id=${courseId}`, { credentials: 'include' })
      ]);
      const courseData = await courseRes.json();
      const teeData    = await teesRes.json();

      if (courseData && courseData.name) {
        document.getElementById('cf-name').value = courseData.name;
      }
      if (teeData.holes) {
        teeData.holes.forEach(hole => {
          const parSel = tbody.querySelector(`select[data-hole="${hole.hole_number}"]`);
          const hiIn   = tbody.querySelector(`input[data-hole="${hole.hole_number}"]`);
          if (parSel) parSel.value = hole.par;
          if (hiIn && hole.handicap_index != null) hiIn.value = hole.handicap_index;
        });
      }
      if (teeData.tees && teeData.tees.length > 0) {
        _courseTeesData = teeData.tees.map(t => ({ ...t }));
        _renderCourseTeesUI();
      }
    } catch (e) {
      document.getElementById('cf-error').textContent = 'Failed to load course data.';
      document.getElementById('cf-error').style.display = 'block';
    }
  } else {
    delete container.dataset.courseId;
  }

  // Show/hide API search card (new course only)
  const searchCard = document.getElementById('cf-search-card');
  if (searchCard) searchCard.style.display = courseId ? 'none' : 'block';

  // GolfCourseAPI search
  const apiSearchInput = document.getElementById('cf-api-search');
  const apiResults     = document.getElementById('cf-api-results');
  const apiStatus      = document.getElementById('cf-api-status');
  if (apiSearchInput) {
    apiSearchInput.value = '';
    apiResults.style.display = 'none';
    apiStatus.textContent = '';

    let _searchTimer = null;
    apiSearchInput.addEventListener('input', () => {
      clearTimeout(_searchTimer);
      const q = apiSearchInput.value.trim();
      if (q.length < 2) { apiResults.style.display = 'none'; apiStatus.textContent = ''; return; }
      apiStatus.textContent = 'Searching…';
      _searchTimer = setTimeout(() => {
        fetch(`${API_BASE_URL}/api/search_golf_courses.php?q=${encodeURIComponent(q)}`, { credentials: 'include' })
          .then(r => r.json())
          .then(data => {
            if (data.error) { apiStatus.textContent = data.error; apiResults.style.display = 'none'; return; }
            const courses = data.courses || [];
            apiStatus.textContent = courses.length ? `${courses.length} result${courses.length !== 1 ? 's' : ''} found` : 'No courses found.';
            if (!courses.length) { apiResults.style.display = 'none'; return; }
            apiResults.innerHTML = courses.slice(0, 12).map(c => `
              <div class="course-api-result-item" data-id="${c.id}">
                <div class="course-api-result-name">${c.course_name || c.club_name}</div>
                <div class="course-api-result-club">${c.club_name}${c.location ? ' — ' + [c.location.city, c.location.state, c.location.country].filter(Boolean).join(', ') : ''}</div>
              </div>`).join('');
            apiResults.style.display = 'block';

            apiResults.querySelectorAll('.course-api-result-item').forEach(item => {
              item.addEventListener('click', () => {
                const courseApiId = item.dataset.id;
                apiStatus.textContent = 'Loading course data…';
                apiResults.style.display = 'none';
                apiSearchInput.value = item.querySelector('.course-api-result-name').textContent;

                fetch(`${API_BASE_URL}/api/get_golf_course.php?id=${courseApiId}`, { credentials: 'include' })
                  .then(r => r.json())
                  .then(res => {
                    const course = res.course || res;
                    if (!course || res.error) { apiStatus.textContent = res.error || 'Failed to load course.'; return; }

                    // Fill course name
                    const nameVal = course.course_name || course.club_name || '';
                    document.getElementById('cf-name').value = nameVal;

                    // Collect all tees (male + female)
                    const allTees = [
                      ...(course.tees?.male   || []),
                      ...(course.tees?.female || [])
                    ];

                    // Populate holes from first tee that has hole data
                    const teesWithHoles = allTees.find(t => t.holes && t.holes.length === 18);
                    if (teesWithHoles) {
                      teesWithHoles.holes.forEach((hole, idx) => {
                        const hNum = idx + 1;
                        const parSel = tbody.querySelector(`select[data-hole="${hNum}"]`);
                        const hiIn   = tbody.querySelector(`input[data-hole="${hNum}"]`);
                        if (parSel && hole.par) parSel.value = hole.par;
                        if (hiIn  && hole.handicap != null) hiIn.value = hole.handicap;
                      });
                    }

                    // Populate tees
                    _courseTeesData = allTees.map(t => ({
                      tee_id:   null,
                      tee_name: t.tee_name || '',
                      slope:    t.slope_rating   || '',
                      rating:   t.course_rating  || '',
                      par:      t.par_total       || 72,
                      yardage:  t.total_yards     || ''
                    }));
                    _renderCourseTeesUI();

                    const teeCount = allTees.length;
                    apiStatus.textContent = `✓ Loaded — ${teeCount} tee${teeCount !== 1 ? 's' : ''} imported. Review and save.`;
                  })
                  .catch(() => { apiStatus.textContent = 'Failed to load course data.'; });
              });
            });
          })
          .catch(() => { apiStatus.textContent = 'Search failed.'; apiResults.style.display = 'none'; });
      }, 350);
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', function _closeApiResults(e) {
      if (!apiResults.contains(e.target) && e.target !== apiSearchInput) {
        apiResults.style.display = 'none';
      }
    });
  }

  // Back button
  document.getElementById('course-form-back-btn').onclick = () => {
    container.style.display = 'none';
    showCourseManager();
  };

  // Add tee
  document.getElementById('cf-add-tee-btn').onclick = () => {
    _courseTeesData.push({ tee_id: null, tee_name: '', slope: '', rating: '', par: 72, yardage: '' });
    _renderCourseTeesUI();
  };

  // Save
  document.getElementById('cf-save-btn').onclick = () => saveCourseForm();
}

async function saveCourseForm() {
  const errEl    = document.getElementById('cf-error');
  const saveBtn  = document.getElementById('cf-save-btn');
  const name     = document.getElementById('cf-name').value.trim();
  const container = document.getElementById('course-form-container');
  const existingCourseId = container.dataset.courseId ? parseInt(container.dataset.courseId) : null;

  errEl.style.display = 'none';

  if (!name) {
    errEl.textContent = 'Please enter a course name.';
    errEl.style.display = 'block';
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  try {
    // 1. Save / update course name
    let courseId = existingCourseId;
    if (courseId) {
      await fetch(`${API_BASE_URL}/api/courses.php?course_id=${courseId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name })
      });
    } else {
      const res  = await fetch(`${API_BASE_URL}/api/courses.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name })
      });
      const data = await res.json();
      courseId   = data.course_id;
    }

    // 2. Save holes (batch)
    const holes = [];
    document.querySelectorAll('#cf-holes-body tr').forEach(row => {
      const h  = row.querySelector('.hole-par-select');
      const hi = row.querySelector('.hole-hi-input');
      if (!h) return;
      holes.push({
        hole_number:    parseInt(h.dataset.hole),
        par:            parseInt(h.value),
        handicap_index: hi.value !== '' ? parseInt(hi.value) : null
      });
    });
    await fetch(`${API_BASE_URL}/api/save_course_holes.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ course_id: courseId, holes })
    });

    // 3. Save tees
    // Sync any unsaved input values first
    document.querySelectorAll('#cf-tees-list .tee-row').forEach(row => {
      const i = parseInt(row.dataset.teeIndex);
      if (_courseTeesData[i]) {
        _courseTeesData[i].tee_name = row.querySelector('.tee-name').value;
        _courseTeesData[i].slope    = row.querySelector('.tee-slope').value;
        _courseTeesData[i].rating   = row.querySelector('.tee-rating').value;
        _courseTeesData[i].par      = row.querySelector('.tee-par').value;
        _courseTeesData[i].yardage  = row.querySelector('.tee-yardage').value;
      }
    });

    for (const tee of _courseTeesData) {
      if (!tee.tee_name.trim()) continue;
      const payload = {
        course_id: courseId,
        tee_name:  tee.tee_name.trim(),
        slope:     parseInt(tee.slope)   || 0,
        rating:    parseFloat(tee.rating) || 0,
        par:       parseInt(tee.par)     || 72,
        yardage:   parseInt(tee.yardage) || 0
      };
      if (tee.tee_id) {
        await fetch(`${API_BASE_URL}/api/course_tees.php?tee_id=${tee.tee_id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload)
        });
      } else {
        await fetch(`${API_BASE_URL}/api/course_tees.php`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload)
        });
      }
    }

    container.style.display = 'none';
    showCourseManager();

  } catch (e) {
    errEl.textContent = 'Save failed. Please try again.';
    errEl.style.display = 'block';
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Course';
  }
}

async function showEditGroupPage() {
  // Hide other views
  document.getElementById('user-dashboard').style.display = 'none';
  document.getElementById('edit-user-container').style.display = 'none';
  document.getElementById('edit-golfers-container').style.display = 'none';
  document.getElementById('round-history-container').style.display = 'none';
  document.getElementById('tournament-history-container').style.display = 'none';
  document.getElementById('manage-courses-container').style.display = 'none';
  document.getElementById('course-form-container').style.display = 'none';

  const container = document.getElementById('edit-group-container');
  container.dataset.open = 'true';
  container.style.display = 'block';

  const content = document.getElementById('edit-group-content');
  content.innerHTML = '<p style="color:#666; text-align:center;">Loading…</p>';

  // Fetch org info + members
  let orgData;
  try {
    const res = await fetch(`${API_BASE_URL}/api/org_members.php`, { credentials: 'include' });
    orgData   = await res.json();
  } catch (e) {
    content.innerHTML = '<p style="color:red;">Failed to load group info.</p>';
    return;
  }

  const { org_name, avatar_url, created_at, members } = orgData;
  const createdDate = created_at
    ? new Date(created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '—';

  // Build members rows — names are clickable for admin editing
  const memberRows = (members || []).map(m => `
    <div style="display:flex; justify-content:space-between; align-items:center; padding:0.6rem 0; border-bottom:1px solid #f0f0f0;">
      <div style="flex:1; min-width:0;">
        <button class="member-detail-btn" data-user-id="${m.user_id}"
          style="background:none; border:none; padding:0; cursor:pointer; text-align:left; font-size:0.95rem; color:#4F2185; font-weight:600; text-decoration:underline; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%;">
          ${m.name}
        </button>
        <div style="font-size:0.8rem; color:#888; margin-top:0.1rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${m.email}</div>
      </div>
      <span style="font-size:0.75rem; font-weight:600; color:${m.role === 'admin' ? '#4F2185' : '#666'}; text-transform:uppercase; letter-spacing:0.04em; margin-left:0.75rem;">${m.role}</span>
    </div>
  `).join('');

  // ── Avatar rendering helper (shared across Edit Group + My Groups) ──────────
  const renderAvatarHtml = (url, name, size = 52) => {
    const initial = (name || '?').charAt(0).toUpperCase();
    const radius  = 'var(--radius-md)';
    const base    = `width:${size}px; height:${size}px; border-radius:${radius}; flex-shrink:0;`;
    if (!url) {
      return `<div style="${base} background:linear-gradient(135deg,var(--color-brand-primary) 0%,#6b35a8 100%);
                color:#fff; font-size:${Math.round(size*0.38)}px; font-weight:800;
                display:flex; align-items:center; justify-content:center;">${initial}</div>`;
    }
    if (url.startsWith('icon:')) {
      return `<div style="${base} background:var(--color-bg-muted); font-size:${Math.round(size*0.5)}px;
                display:flex; align-items:center; justify-content:center;">${url.slice(5)}</div>`;
    }
    return `<img src="${url}" alt="${name}" style="${base} object-fit:cover;">`;
  };

  const AVATAR_ICONS = ['⛳','🏌️','🏆','🎯','🦅','🐦','🌲','🏔️','☀️','🍺','🌊','🏅'];

  // Track current avatar so the card stays in sync after modal saves
  let _liveAvatarUrl  = avatar_url;
  let _liveOrgName    = org_name;

  content.innerHTML = `
    <!-- Group info card -->
    <div style="background:#fff; border:1px solid #e0e0e0; border-radius:12px; padding:1.25rem; margin-bottom:1rem; box-shadow:0 1px 4px rgba(0,0,0,0.06);">
      <div style="display:flex; align-items:center; gap:var(--space-4); margin-bottom:var(--space-4);">
        <div id="eg-header-avatar">${renderAvatarHtml(avatar_url, org_name, 52)}</div>
        <div style="flex:1; min-width:0;">
          <h3 id="eg-header-name" style="margin:0 0 var(--space-1); font-size:1.15rem; font-weight:800; color:var(--color-text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${org_name}</h3>
          <p style="margin:0; font-size:var(--font-size-xs); color:var(--color-text-muted);">Created ${createdDate}</p>
        </div>
        <button id="eg-edit-info-btn" class="btn btn-neutral btn-sm btn-auto">Edit</button>
      </div>

      <span style="font-size:0.8rem; font-weight:600; color:#888; text-transform:uppercase; letter-spacing:0.05em;">Members (${(members || []).length})</span>
      <div style="margin-top:0.25rem;">${memberRows || '<p style="color:#aaa; font-size:0.9rem;">No members found.</p>'}</div>
    </div>

    <!-- Edit Golfers button -->
    <div style="background:#fff; border:1px solid #e0e0e0; border-radius:12px; padding:1.25rem; margin-bottom:1rem; box-shadow:0 1px 4px rgba(0,0,0,0.06);">
      <h3 style="margin:0 0 0.5rem; font-size:1.1rem; color:#1a1a1a;">Golfers</h3>
      <p style="margin:0 0 1rem; font-size:0.9rem; color:#666;">Add, edit, or remove golfers in your group.</p>
      <button id="edit-group-golfers-btn" style="width:100%; padding:0.65rem; background:#4F2185; color:white; border:none; border-radius:8px; font-size:1rem; font-weight:bold; cursor:pointer;">Edit Golfers</button>
    </div>

    <!-- Courses card -->
    <div style="background:#fff; border:1px solid #e0e0e0; border-radius:12px; padding:1.25rem; margin-bottom:1rem; box-shadow:0 1px 4px rgba(0,0,0,0.06);">
      <h3 style="margin:0 0 0.5rem; font-size:1.1rem; color:#1a1a1a;">Courses</h3>
      <p style="margin:0 0 1rem; font-size:0.9rem; color:#666;">Manage golf courses and tees for your group.</p>
      <button id="manage-courses-btn" style="width:100%; padding:0.65rem; background:#4F2185; color:white; border:none; border-radius:8px; font-size:1rem; font-weight:bold; cursor:pointer;">Manage Courses</button>
    </div>

    <!-- Invite members card -->
    <div style="background:#fff; border:1px solid #e0e0e0; border-radius:12px; padding:1.25rem; margin-bottom:1rem; box-shadow:0 1px 4px rgba(0,0,0,0.06);">
      <h3 style="margin:0 0 0.5rem; font-size:1.1rem; color:#1a1a1a;">Invite Members</h3>
      <p style="margin:0 0 1rem; font-size:0.9rem; color:#666;">Share the code or link below — anyone with it can join your group.</p>
      <div id="invite-link-loading" style="color:#aaa; font-size:0.9rem; text-align:center; padding:0.5rem 0;">Loading…</div>
      <div id="invite-link-block" style="display:none;">

        <!-- Prominent code display -->
        <div style="background:#f4f0fa; border:2px solid #4F2185; border-radius:10px; padding:1rem;
                    text-align:center; margin-bottom:1rem;">
          <p style="margin:0 0 0.25rem; font-size:0.75rem; font-weight:700; color:#4F2185;
                    text-transform:uppercase; letter-spacing:0.08em;">Invite Code</p>
          <p id="group-invite-code-display" style="margin:0; font-size:2rem; font-weight:800;
              color:#4F2185; letter-spacing:0.18em; font-family:monospace;"></p>
        </div>

        <!-- Copy buttons -->
        <div style="display:flex; gap:0.6rem; margin-bottom:1rem;">
          <button id="group-copy-code-btn" style="flex:1; padding:0.65rem; background:#4F2185; color:white;
              border:none; border-radius:8px; font-size:0.95rem; font-weight:bold; cursor:pointer;">Copy Code</button>
          <button id="group-copy-link-btn" style="flex:1; padding:0.65rem; background:white; color:#4F2185;
              border:2px solid #4F2185; border-radius:8px; font-size:0.95rem; font-weight:bold; cursor:pointer;">Copy Link</button>
        </div>

        <!-- Full link (smaller, read-only) -->
        <input type="text" id="group-invite-link-display" readonly
          style="width:100%; padding:0.55rem; border:1px solid #ddd; border-radius:6px; font-size:0.78rem;
                 box-sizing:border-box; margin-bottom:1rem; background:#f9f9f9; color:#666;">

        <!-- Regenerate -->
        <button id="group-regenerate-invite-btn" style="width:100%; padding:0.6rem; background:#fff;
            color:#c0392b; border:1px solid #c0392b; border-radius:8px; font-size:0.88rem; cursor:pointer;">
          Generate New Code (deprecates current)
        </button>
        <div id="group-regen-confirm" style="display:none; margin-top:0.75rem; background:#fff3f3;
             border:1px solid #f5c6c6; border-radius:8px; padding:0.85rem;">
          <p style="margin:0 0 0.6rem; font-size:0.9rem; font-weight:600; color:#c0392b;">Are you sure?</p>
          <p style="margin:0 0 0.75rem; font-size:0.85rem; color:#555;">The current code will stop working immediately. Anyone who hasn't joined yet will need the new code.</p>
          <div style="display:flex; gap:0.6rem;">
            <button id="group-regen-yes-btn" style="flex:1; padding:0.6rem; background:#c0392b; color:white;
                border:none; border-radius:6px; font-size:0.9rem; font-weight:bold; cursor:pointer;">Yes, Generate New</button>
            <button id="group-regen-cancel-btn" style="flex:1; padding:0.6rem; background:#eee; color:#333;
                border:none; border-radius:6px; font-size:0.9rem; cursor:pointer;">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Load invite link
  _loadGroupInviteLink();

  // ── Edit Group Info modal ──────────────────────────────────────────────────
  const modal        = document.getElementById('edit-group-info-modal');
  const closeModalBtn = document.getElementById('close-edit-group-info-modal');
  const saveBtn      = document.getElementById('egi-save-btn');
  const statusEl     = document.getElementById('egi-status');
  const nameInput    = document.getElementById('egi-group-name');
  const iconGrid     = document.getElementById('egi-icon-grid');
  const avatarFileIn = document.getElementById('egi-avatar-file');
  const previewEl    = document.getElementById('egi-avatar-preview');

  // Track staged changes in the modal (not committed until Save)
  let _stagedAvatarUrl  = null;  // null = no icon change staged
  let _stagedAvatarFile = null;  // File reference for photo upload

  const _refreshModalPreview = () => {
    const url = _stagedAvatarUrl ?? _liveAvatarUrl;
    previewEl.innerHTML = renderAvatarHtml(url, nameInput.value || _liveOrgName, 80);
    iconGrid.querySelectorAll('.avatar-icon-btn').forEach(b => {
      b.classList.toggle('selected', _stagedAvatarUrl === 'icon:' + b.dataset.icon);
    });
  };

  const _setModalStatus = (msg, isError) => {
    statusEl.textContent   = msg;
    statusEl.style.color   = isError ? 'var(--color-action-danger)' : 'var(--color-action-success)';
    statusEl.style.display = msg ? 'block' : 'none';
  };

  // Open modal
  document.getElementById('eg-edit-info-btn').onclick = () => {
    _stagedAvatarUrl  = null;
    _stagedAvatarFile = null;
    nameInput.value   = _liveOrgName;
    _setModalStatus('', false);

    // Populate icon grid
    iconGrid.innerHTML = AVATAR_ICONS.map(icon => `
      <button class="avatar-icon-btn" data-icon="${icon}">${icon}</button>`).join('');
    _refreshModalPreview();
    modal.style.display = 'flex';
  };

  closeModalBtn.onclick = () => { modal.style.display = 'none'; };
  modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });

  // Icon tap — stage the selection
  iconGrid.addEventListener('click', e => {
    const btn = e.target.closest('.avatar-icon-btn');
    if (!btn) return;
    _stagedAvatarUrl  = 'icon:' + btn.dataset.icon;
    _stagedAvatarFile = null;
    _refreshModalPreview();
  });

  // Photo selected — stage the file and show a local preview
  avatarFileIn.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    _stagedAvatarFile = file;
    _stagedAvatarUrl  = null; // clear any icon selection
    // Local preview via object URL
    const objUrl = URL.createObjectURL(file);
    const sz = 80, r = 'var(--radius-md)';
    previewEl.innerHTML = `<img src="${objUrl}" style="width:${sz}px;height:${sz}px;border-radius:${r};object-fit:cover;">`;
    iconGrid.querySelectorAll('.avatar-icon-btn').forEach(b => b.classList.remove('selected'));
    e.target.value = '';
  });

  // Save — commit name + avatar together
  saveBtn.onclick = async () => {
    const newName = nameInput.value.trim();
    if (!newName) { _setModalStatus('Group name cannot be empty.', true); return; }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    _setModalStatus('', false);

    try {
      // 1. Avatar — only if something changed
      if (_stagedAvatarFile) {
        const form = new FormData();
        form.append('avatar', _stagedAvatarFile);
        const r = await fetch(`${API_BASE_URL}/api/update_org_avatar.php`, {
          method: 'POST', credentials: 'include', body: form
        });
        const d = await r.json();
        if (!d.success) throw new Error(d.error || 'Avatar upload failed');
        _liveAvatarUrl = d.avatar_url;
      } else if (_stagedAvatarUrl !== null) {
        const icon = _stagedAvatarUrl.slice(5); // strip 'icon:'
        const r = await fetch(`${API_BASE_URL}/api/update_org_avatar.php`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ icon })
        });
        const d = await r.json();
        if (!d.success) throw new Error(d.error || 'Avatar save failed');
        _liveAvatarUrl = d.avatar_url;
      }

      // 2. Name — only if changed
      if (newName !== _liveOrgName) {
        const r = await fetch(`${API_BASE_URL}/api/rename_group.php`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newName })
        });
        const d = await r.json();
        if (!d.success) throw new Error(d.error || 'Rename failed');
        _liveOrgName = newName;
      }

      // Update the group info card header without a full reload
      document.getElementById('eg-header-avatar').innerHTML = renderAvatarHtml(_liveAvatarUrl, _liveOrgName, 52);
      document.getElementById('eg-header-name').textContent = _liveOrgName;

      modal.style.display = 'none';

    } catch (err) {
      _setModalStatus(err.message || 'Save failed. Please try again.', true);
    } finally {
      saveBtn.disabled    = false;
      saveBtn.textContent = 'Save Changes';
    }
  };

  // Edit Golfers button
  document.getElementById('edit-group-golfers-btn').addEventListener('click', () => {
    container.style.display = 'none';
    loadEditGolfersPage();
  });

  // Manage Courses button
  document.getElementById('manage-courses-btn').addEventListener('click', () => {
    container.style.display = 'none';
    showCourseManager();
  });

  // Copy code
  document.getElementById('group-copy-code-btn').addEventListener('click', () => {
    const code = document.getElementById('group-invite-code-display').textContent.trim();
    const btn  = document.getElementById('group-copy-code-btn');
    navigator.clipboard.writeText(code).then(() => {
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy Code'; }, 2000);
    }).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = code; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy Code'; }, 2000);
    });
  });

  // Copy link
  document.getElementById('group-copy-link-btn').addEventListener('click', () => {
    const link = document.getElementById('group-invite-link-display').value;
    const btn  = document.getElementById('group-copy-link-btn');
    navigator.clipboard.writeText(link).then(() => {
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy Link'; }, 2000);
    }).catch(() => {
      const input = document.getElementById('group-invite-link-display');
      input.select(); document.execCommand('copy');
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy Link'; }, 2000);
    });
  });

  // Regenerate — show confirmation panel first
  document.getElementById('group-regenerate-invite-btn').addEventListener('click', () => {
    document.getElementById('group-regen-confirm').style.display = 'block';
    document.getElementById('group-regenerate-invite-btn').style.display = 'none';
  });

  document.getElementById('group-regen-cancel-btn').addEventListener('click', () => {
    document.getElementById('group-regen-confirm').style.display = 'none';
    document.getElementById('group-regenerate-invite-btn').style.display = 'block';
  });

  document.getElementById('group-regen-yes-btn').addEventListener('click', async () => {
    const btn = document.getElementById('group-regen-yes-btn');
    btn.disabled = true;
    btn.textContent = 'Generating…';
    await _loadGroupInviteLink(true);
    document.getElementById('group-regen-confirm').style.display = 'none';
    document.getElementById('group-regenerate-invite-btn').style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Yes, Generate New';
  });

  // Member name click → member detail page
  document.querySelectorAll('.member-detail-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const userId = parseInt(btn.dataset.userId);
      const member = (members || []).find(m => m.user_id === userId);
      if (member) showMemberDetailPage(member);
    });
  });

  // Back button
  document.getElementById('back-from-edit-group-btn').onclick = () => {
    container.dataset.open = 'false';
    container.style.display = 'none';
    document.getElementById('user-dashboard').style.display = 'block';
  };
}

async function _loadGroupInviteLink(regenerate = false) {
  const loadingEl  = document.getElementById('invite-link-loading');
  const blockEl    = document.getElementById('invite-link-block');
  const codeEl     = document.getElementById('group-invite-code-display');
  const linkInput  = document.getElementById('group-invite-link-display');
  if (loadingEl) loadingEl.style.display = 'block';
  if (blockEl)   blockEl.style.display   = 'none';

  const url = `${API_BASE_URL}/api/create_invite.php${regenerate ? '?regenerate=1' : ''}`;
  try {
    const res  = await fetch(url, { method: 'POST', credentials: 'include' });
    const data = await res.json();
    if (data.success) {
      const origin = window.location.origin;
      const path   = window.location.pathname.replace(/\/$/, '');
      const link   = `${origin}${path}?join=${data.code}`;
      if (codeEl)    codeEl.textContent = data.code;
      if (linkInput) linkInput.value    = link;
      if (loadingEl) loadingEl.style.display = 'none';
      if (blockEl)   blockEl.style.display   = 'block';
    } else {
      if (loadingEl) loadingEl.textContent = 'Failed to load invite code.';
    }
  } catch (e) {
    if (loadingEl) loadingEl.textContent = 'Failed to load invite code.';
  }
}

function showMemberDetailPage(member) {
  const container = document.getElementById('edit-group-container');
  const content   = document.getElementById('edit-group-content');

  // Update heading
  document.querySelector('#edit-group-container h2').textContent = 'Member';

  content.innerHTML = `
    <!-- Edit name / email card -->
    <div style="background:#fff; border:1px solid #e0e0e0; border-radius:12px; padding:1.25rem; margin-bottom:1rem; box-shadow:0 1px 4px rgba(0,0,0,0.06);">
      <h3 style="margin:0 0 1rem; font-size:1.1rem; color:#1a1a1a;">Edit Info</h3>

      <label style="font-size:0.85rem; color:#555; display:block; margin-bottom:0.25rem;">Name</label>
      <input type="text" id="member-edit-name" value="${member.name.replace(/"/g, '&quot;')}"
        style="width:100%; padding:0.6rem; border:1px solid #ccc; border-radius:6px; font-size:1rem; box-sizing:border-box; margin-bottom:1rem;">

      <label style="font-size:0.85rem; color:#555; display:block; margin-bottom:0.25rem;">Email</label>
      <input type="email" id="member-edit-email" value="${member.email.replace(/"/g, '&quot;')}"
        style="width:100%; padding:0.6rem; border:1px solid #ccc; border-radius:6px; font-size:1rem; box-sizing:border-box; margin-bottom:0.75rem;">

      <p id="member-edit-status" style="display:none; font-size:0.875rem; text-align:center; margin:0 0 0.75rem;"></p>
      <button id="member-save-btn" style="width:100%; padding:0.65rem; background:#4F2185; color:white; border:none; border-radius:8px; font-size:1rem; font-weight:bold; cursor:pointer;">Save Changes</button>
    </div>

    <!-- Password reset card -->
    <div style="background:#fff; border:1px solid #e0e0e0; border-radius:12px; padding:1.25rem; margin-bottom:1rem; box-shadow:0 1px 4px rgba(0,0,0,0.06);">
      <h3 style="margin:0 0 0.5rem; font-size:1.1rem; color:#1a1a1a;">Reset Password</h3>
      <p style="margin:0 0 1rem; font-size:0.9rem; color:#666;">Generate a one-time reset link to share with this member. It expires in 24 hours.</p>
      <button id="member-reset-btn" style="width:100%; padding:0.65rem; background:#fff; color:#4F2185; border:1px solid #4F2185; border-radius:8px; font-size:1rem; font-weight:bold; cursor:pointer;">Generate Reset Link</button>
      <div id="member-reset-link-block" style="display:none; margin-top:1rem;">
        <input type="text" id="member-reset-link-display" readonly
          style="width:100%; padding:0.6rem; border:1px solid #ccc; border-radius:6px; font-size:0.8rem; box-sizing:border-box; margin-bottom:0.5rem; background:#f5f5f5;">
        <p id="member-reset-expiry" style="margin:0 0 0.75rem; font-size:0.8rem; color:#888; text-align:center;"></p>
        <button id="member-copy-reset-btn" style="width:100%; padding:0.65rem; background:#4F2185; color:white; border:none; border-radius:8px; font-size:1rem; font-weight:bold; cursor:pointer;">Copy Reset Link</button>
      </div>
    </div>
  `;

  // Save name/email
  document.getElementById('member-save-btn').addEventListener('click', async () => {
    const btn      = document.getElementById('member-save-btn');
    const statusEl = document.getElementById('member-edit-status');
    const name     = document.getElementById('member-edit-name').value.trim();
    const email    = document.getElementById('member-edit-email').value.trim();

    statusEl.style.display = 'none';
    if (!name || !email) {
      statusEl.textContent   = 'Name and email are required.';
      statusEl.style.color   = '#c00';
      statusEl.style.display = 'block';
      return;
    }

    btn.disabled    = true;
    btn.textContent = 'Saving…';
    try {
      const res  = await fetch(`${API_BASE_URL}/api/admin_update_member.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: member.user_id, name, email }),
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        member.name  = name;
        member.email = email;
        statusEl.textContent   = '✓ Saved.';
        statusEl.style.color   = '#2e7d32';
        statusEl.style.display = 'block';
      } else {
        statusEl.textContent   = data.error || 'Save failed.';
        statusEl.style.color   = '#c00';
        statusEl.style.display = 'block';
      }
    } catch {
      statusEl.textContent   = 'Connection error. Please try again.';
      statusEl.style.color   = '#c00';
      statusEl.style.display = 'block';
    }
    btn.disabled    = false;
    btn.textContent = 'Save Changes';
  });

  // Generate reset link
  document.getElementById('member-reset-btn').addEventListener('click', async () => {
    const btn = document.getElementById('member-reset-btn');
    btn.disabled    = true;
    btn.textContent = 'Generating…';
    try {
      const res  = await fetch(`${API_BASE_URL}/api/admin_reset_password.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: member.user_id }),
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        document.getElementById('member-reset-link-display').value = data.reset_link;
        document.getElementById('member-reset-expiry').textContent = `Expires in ${data.expires_in}`;
        document.getElementById('member-reset-link-block').style.display = 'block';
        btn.textContent = 'Regenerate Link';
      } else {
        alert(data.error || 'Could not generate reset link.');
        btn.textContent = 'Generate Reset Link';
      }
    } catch {
      alert('Connection error. Please try again.');
      btn.textContent = 'Generate Reset Link';
    }
    btn.disabled = false;
  });

  // Copy reset link
  document.getElementById('member-copy-reset-btn').addEventListener('click', () => {
    const input = document.getElementById('member-reset-link-display');
    navigator.clipboard.writeText(input.value).then(() => {
      const btn = document.getElementById('member-copy-reset-btn');
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy Reset Link'; }, 2000);
    }).catch(() => { input.select(); document.execCommand('copy'); });
  });

  // Back → return to Edit Group (re-render it)
  document.getElementById('back-from-edit-group-btn').onclick = () => {
    document.querySelector('#edit-group-container h2').textContent = 'Administration';
    showEditGroupPage();
  };
}

function loadEditGolfersPage() {
  // Hide all other views
  document.getElementById('user-dashboard').style.display = 'none';
  document.getElementById('app-content').style.display = 'none';
  document.getElementById('round-history-container').style.display = 'none';
  document.getElementById('tournament-history-container').style.display = 'none';
  document.getElementById('best-ball-setup').style.display = 'none';
  document.getElementById('edit-user-container').style.display = 'none';

  const container = document.getElementById('edit-golfers-container');
  container.style.display = 'block';

  // Reset add-golfer form
  document.getElementById('add-golfer-form').style.display = 'none';
  document.getElementById('add-golfer-btn').style.display = 'block';
  ['new-golfer-first', 'new-golfer-last', 'new-golfer-hcp'].forEach(id => {
    document.getElementById(id).value = '';
  });

  refreshGolferList();
}

function refreshGolferList() {
  const list   = document.getElementById('edit-golfers-list');
  const status = document.getElementById('edit-golfers-status');
  list.innerHTML = '<p style="color:#888; text-align:center;">Loading…</p>';
  status.textContent = '';

  fetch(`${API_BASE_URL}/api/golfers.php`, { credentials: 'include' })
    .then(r => r.json())
    .then(golfers => {
      list.innerHTML = '';
      // Show legend only if any golfer lacks an account
      if (golfers.some(g => !g.user_id)) {
        const legend = document.createElement('p');
        legend.style.cssText = 'font-size:0.8rem; color:#888; margin:0 0 0.75rem; text-align:center;';
        legend.textContent = 'Golfers marked "Pending" haven\'t created an account yet.';
        list.appendChild(legend);
      }
      golfers.forEach(g => renderGolferCard(g, list));
    })
    .catch(() => {
      list.innerHTML = '<p style="color:red; text-align:center;">Error loading golfers.</p>';
    });
}

function renderGolferCard(g, list) {
  const card = document.createElement('div');
  card.dataset.golferId = g.golfer_id;
  card.style.cssText = 'background:#fff; border:1px solid #eee; border-radius:8px; padding:0.75rem 1rem; margin-bottom:0.6rem; box-shadow:0 1px 3px rgba(0,0,0,0.05);';

  function showView() {
    const pendingBadge = !g.user_id
      ? `<span title="This golfer hasn't created an account yet" style="font-size:0.7rem; font-weight:600; color:#888; background:#f0f0f0; border:1px solid #ddd; border-radius:4px; padding:0.1rem 0.4rem; margin-left:0.4rem; vertical-align:middle;">Pending</span>`
      : '';
    card.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:0.5rem;">
        <div>
          <span style="font-weight:600; font-size:1rem;">${g.first_name} ${g.last_name}</span>${pendingBadge}
          <span style="color:#888; font-size:0.85rem; margin-left:0.5rem;">Hdcp: ${g.handicap}</span>
        </div>
        <div style="display:flex; gap:0.4rem; flex-shrink:0;">
          <button class="golfer-edit-btn" style="padding:0.35rem 0.75rem; background:#f0e6ff; color:#4F2185; border:none; border-radius:4px; font-size:0.85rem; font-weight:bold; cursor:pointer;">Edit</button>
          <button class="golfer-delete-btn" style="padding:0.35rem 0.75rem; background:#fff0f0; color:#c0392b; border:none; border-radius:4px; font-size:0.85rem; font-weight:bold; cursor:pointer;">Delete</button>
        </div>
      </div>`;

    card.querySelector('.golfer-edit-btn').addEventListener('click', showEditView);
    card.querySelector('.golfer-delete-btn').addEventListener('click', showDeleteConfirm);
  }

  function showEditView() {
    card.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:0.5rem;">
        <div style="display:flex; gap:0.4rem;">
          <input class="ef-first" type="text" value="${g.first_name}" placeholder="First Name"
            style="flex:1; padding:0.5rem; font-size:0.95rem; border:1px solid #ccc; border-radius:4px;">
          <input class="ef-last" type="text" value="${g.last_name}" placeholder="Last Name"
            style="flex:1; padding:0.5rem; font-size:0.95rem; border:1px solid #ccc; border-radius:4px;">
        </div>
        <input class="ef-hcp" type="number" step="0.1" value="${g.handicap}" placeholder="Handicap"
          style="width:100%; padding:0.5rem; font-size:0.95rem; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;">
        <div style="display:flex; gap:0.4rem;">
          <button class="ef-save" style="flex:1; padding:0.55rem; background:#4F2185; color:white; border:none; border-radius:4px; font-size:0.9rem; font-weight:bold; cursor:pointer;">Save</button>
          <button class="ef-cancel" style="flex:1; padding:0.55rem; background:#eee; color:#333; border:none; border-radius:4px; font-size:0.9rem; cursor:pointer;">Cancel</button>
        </div>
        <div class="ef-status" style="font-size:0.85rem; text-align:center;"></div>
      </div>`;

    card.querySelector('.ef-cancel').addEventListener('click', showView);
    card.querySelector('.ef-save').addEventListener('click', () => {
      const first  = card.querySelector('.ef-first').value.trim();
      const last   = card.querySelector('.ef-last').value.trim();
      const hcp    = parseFloat(card.querySelector('.ef-hcp').value);
      const efStatus = card.querySelector('.ef-status');
      if (!first || !last) { efStatus.textContent = 'Name is required.'; efStatus.style.color = 'red'; return; }

      card.querySelector('.ef-save').disabled = true;
      card.querySelector('.ef-save').textContent = 'Saving…';

      fetch(`${API_BASE_URL}/api/golfers.php?golfer_id=${g.golfer_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ first_name: first, last_name: last, handicap: hcp }),
        credentials: 'include'
      })
        .then(r => r.json())
        .then(() => {
          g.first_name = first; g.last_name = last; g.handicap = hcp;
          showView();
          document.getElementById('edit-golfers-status').textContent = `✓ ${first} ${last} updated.`;
          document.getElementById('edit-golfers-status').style.color = '#4CAF50';
        })
        .catch(() => { efStatus.textContent = 'Error saving. Please try again.'; efStatus.style.color = 'red'; });
    });
  }

  function showDeleteConfirm() {
    card.innerHTML = `
      <div style="background:#fff3f3; border-radius:6px; padding:0.75rem;">
        <p style="margin:0 0 0.5rem; font-weight:bold; color:#c0392b;">Delete ${g.first_name} ${g.last_name}?</p>
        <p style="margin:0 0 0.75rem; font-size:0.85rem; color:#555;">Their scoring history will be preserved.</p>
        <div style="display:flex; gap:0.5rem;">
          <button class="del-confirm" style="flex:1; padding:0.55rem; background:#c0392b; color:white; border:none; border-radius:4px; font-weight:bold; cursor:pointer;">Yes, Delete</button>
          <button class="del-cancel" style="flex:1; padding:0.55rem; background:#eee; color:#333; border:none; border-radius:4px; cursor:pointer;">Cancel</button>
        </div>
      </div>`;

    card.querySelector('.del-cancel').addEventListener('click', showView);
    card.querySelector('.del-confirm').addEventListener('click', () => {
      card.querySelector('.del-confirm').disabled = true;
      card.querySelector('.del-confirm').textContent = 'Deleting…';

      fetch(`${API_BASE_URL}/api/delete_golfer.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ golfer_id: g.golfer_id }),
        credentials: 'include'
      })
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            card.remove();
            document.getElementById('edit-golfers-status').textContent = `✓ ${g.first_name} ${g.last_name} removed.`;
            document.getElementById('edit-golfers-status').style.color = '#4CAF50';
          } else {
            showView();
          }
        })
        .catch(() => showView());
    });
  }

  showView();
  list.appendChild(card);
}

// DOMContentLoaded: Edit Golfers page wiring
document.addEventListener('DOMContentLoaded', () => {
  const backBtn = document.getElementById('back-from-edit-golfers-btn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      document.getElementById('edit-golfers-container').style.display = 'none';
      const editGroupContainer = document.getElementById('edit-group-container');
      if (editGroupContainer && editGroupContainer.dataset.open === 'true') {
        editGroupContainer.style.display = 'block';
      } else {
        document.getElementById('user-dashboard').style.display = 'block';
      }
    });
  }

  const addBtn      = document.getElementById('add-golfer-btn');
  const addForm     = document.getElementById('add-golfer-form');
  const cancelNewBtn = document.getElementById('cancel-new-golfer-btn');
  const saveNewBtn  = document.getElementById('save-new-golfer-btn');

  if (addBtn) addBtn.addEventListener('click', () => {
    addForm.style.display = 'block';
    addBtn.style.display = 'none';
    document.getElementById('new-golfer-first').focus();
  });

  if (cancelNewBtn) cancelNewBtn.addEventListener('click', () => {
    addForm.style.display = 'none';
    addBtn.style.display = 'block';
    ['new-golfer-first', 'new-golfer-last', 'new-golfer-hcp'].forEach(id => {
      document.getElementById(id).value = '';
    });
  });

  if (saveNewBtn) saveNewBtn.addEventListener('click', () => {
    const first = document.getElementById('new-golfer-first').value.trim();
    const last  = document.getElementById('new-golfer-last').value.trim();
    const hcp   = parseFloat(document.getElementById('new-golfer-hcp').value) || 0;
    const status = document.getElementById('edit-golfers-status');

    if (!first || !last) {
      status.textContent = 'First and last name are required.';
      status.style.color = 'red';
      return;
    }

    saveNewBtn.disabled = true;
    saveNewBtn.textContent = 'Saving…';

    fetch(`${API_BASE_URL}/api/golfers.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ first_name: first, last_name: last, handicap: hcp }),
      credentials: 'include'
    })
      .then(r => r.json())
      .then(data => {
        saveNewBtn.disabled = false;
        saveNewBtn.textContent = 'Save';
        if (data.inserted_id) {
          // Add card to top of list
          const newGolfer = { golfer_id: data.inserted_id, first_name: first, last_name: last, handicap: hcp };
          const list = document.getElementById('edit-golfers-list');
          renderGolferCard(newGolfer, list); // appends, then we move it
          list.prepend(list.lastChild);

          addForm.style.display = 'none';
          document.getElementById('add-golfer-btn').style.display = 'block';
          ['new-golfer-first', 'new-golfer-last', 'new-golfer-hcp'].forEach(id => {
            document.getElementById(id).value = '';
          });
          status.textContent = `✓ ${first} ${last} added.`;
          status.style.color = '#4CAF50';
        }
      })
      .catch(() => {
        saveNewBtn.disabled = false;
        saveNewBtn.textContent = 'Save';
        status.textContent = 'Error adding golfer. Please try again.';
        status.style.color = 'red';
      });
  });
});

function returnToDashboard() {
  const hamburgerDropdown = document.getElementById('hamburger-dropdown');
  if (hamburgerDropdown) hamburgerDropdown.classList.remove('show');
  const allPages = [
    'app-content',
    'add-round-container',
    'add-matches-container',
    'add-tee-times-container',
    'edit-group-container',
    'edit-tournament-container',
    'round-history-container',
    'tournament-history-container',
    'edit-user-container',
    'edit-golfers-container',
    'best-ball-setup',
    'quick-round-type-selector',
    'create-tournament-container',
    'create-tournament-step2',
    'create-tournament-step3',
    'create-tournament-gt-step2',
    'manage-courses-container',
    'course-form-container',
  ];
  allPages.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const editGroupContainer = document.getElementById('edit-group-container');
  if (editGroupContainer) {
    editGroupContainer.dataset.open = 'false';
    const h2 = editGroupContainer.querySelector('h2');
    if (h2) h2.textContent = 'Edit Group';
  }
  document.getElementById('user-dashboard').style.display = 'block';
}

function loadEditUserPage() {
  returnToDashboard();
  const editUserContainer = document.getElementById('edit-user-container');
  editUserContainer.style.display = 'block';
  document.getElementById('user-dashboard').style.display = 'none';

  // Populate read-only profile display
  function refreshProfileDisplay() {
    document.getElementById('profile-display-first-name').textContent = currentUser.first_name || '';
    document.getElementById('profile-display-last-name').textContent  = currentUser.last_name  || '';
    document.getElementById('profile-display-email').textContent      = currentUser.email      || '';
    document.getElementById('profile-display-handicap').textContent   = currentUser.handicap != null ? parseFloat(currentUser.handicap).toFixed(1) : '0.0';
  }
  refreshProfileDisplay();

  // Clear password fields and status messages
  ['current-password', 'new-password', 'confirm-new-password'].forEach(id => {
    document.getElementById(id).value = '';
  });
  const profileMsg  = document.getElementById('edit-user-message');
  const passwordMsg = document.getElementById('change-password-message');
  profileMsg.style.display  = 'none';
  passwordMsg.style.display = 'none';

  // Edit Profile modal wiring
  const editProfileModal      = document.getElementById('edit-profile-modal');
  const openEditProfileBtn    = document.getElementById('open-edit-profile-btn');
  const closeEditProfileModal = document.getElementById('close-edit-profile-modal');

  function openEditProfile() {
    document.getElementById('edit-first-name').value = currentUser.first_name || '';
    document.getElementById('edit-last-name').value  = currentUser.last_name  || '';
    document.getElementById('edit-email').value      = currentUser.email      || '';
    document.getElementById('edit-handicap').value   = currentUser.handicap   ?? 0;
    profileMsg.style.display = 'none';
    editProfileModal.style.display = 'flex';
  }

  if (openEditProfileBtn) openEditProfileBtn.addEventListener('click', openEditProfile);
  if (closeEditProfileModal) closeEditProfileModal.addEventListener('click', () => { editProfileModal.style.display = 'none'; });
  editProfileModal.addEventListener('click', (e) => { if (e.target === editProfileModal) editProfileModal.style.display = 'none'; });

  // Change Password modal wiring
  const modal         = document.getElementById('change-password-modal');
  const openModalBtn  = document.getElementById('open-change-password-btn');
  const closeModalBtn = document.getElementById('close-change-password-modal');

  function openChangePasswordModal() {
    ['current-password', 'new-password', 'confirm-new-password'].forEach(id => {
      document.getElementById(id).value = '';
    });
    passwordMsg.style.display = 'none';
    modal.style.display = 'flex';
  }

  function closeChangePasswordModal() {
    modal.style.display = 'none';
  }

  if (openModalBtn) openModalBtn.addEventListener('click', openChangePasswordModal);
  if (closeModalBtn) closeModalBtn.addEventListener('click', closeChangePasswordModal);
  // Close on backdrop click
  modal.addEventListener('click', (e) => { if (e.target === modal) closeChangePasswordModal(); });

  // Load My Groups
  loadMyGroups();

  // Wire up join group flow
  initJoinGroupForm();

  // Wire up create new group modal
  initCreateGroupModal();
}

function loadMyGroups() {
  const list = document.getElementById('my-groups-list');
  if (!list) return;
  list.innerHTML = '<p style="color:var(--color-text-muted); font-size:var(--font-size-sm);">Loading groups…</p>';

  fetch(`${API_BASE_URL}/api/my_orgs.php`, { credentials: 'include' })
    .then(r => r.json())
    .then(data => {
      if (!data.orgs || data.orgs.length === 0) {
        list.innerHTML = '<p style="color:var(--color-text-muted); font-size:var(--font-size-sm);">No groups found.</p>';
        return;
      }

      list.innerHTML = data.orgs.map(org => {
        // Avatar: icon emoji, uploaded image, or initials fallback
        const initial = (org.org_name || '?').charAt(0).toUpperCase();
        let avatarHtml;
        if (!org.avatar_url) {
          avatarHtml = `<div class="group-avatar-initials">${initial}</div>`;
        } else if (org.avatar_url.startsWith('icon:')) {
          avatarHtml = `<div class="group-avatar-initials" style="background:var(--color-bg-muted); font-size:1.75rem;">${org.avatar_url.slice(5)}</div>`;
        } else {
          avatarHtml = `<img src="${org.avatar_url}" alt="${org.org_name}" class="group-avatar">`;
        }

        const leaderHtml = org.admin_name
          ? `<p class="group-card-leader">Led by ${org.admin_name}</p>`
          : '';

        const badges = `
          <div class="group-card-badges">
            <span class="group-badge group-badge-role">${org.role}</span>
            ${org.is_current ? '<span class="group-badge group-badge-active">Active</span>' : ''}
          </div>`;

        const chevron = org.is_current ? '' : '<span class="group-card-chevron">›</span>';

        return `
          <div class="group-card ${org.is_current ? 'is-current' : ''}"
               data-org-id="${org.org_id}" data-is-current="${org.is_current ? '1' : '0'}">
            ${avatarHtml}
            <div class="group-card-body">
              <p class="group-card-name">${org.org_name}</p>
              ${leaderHtml}
              ${badges}
            </div>
            ${chevron}
          </div>`;
      }).join('');

      // Wire up tap to switch (non-current cards only)
      list.querySelectorAll('.group-card[data-is-current="0"]').forEach(card => {
        card.addEventListener('click', () => switchGroup(parseInt(card.dataset.orgId)));
      });
    })
    .catch(() => {
      list.innerHTML = '<p style="color:var(--color-action-danger); font-size:var(--font-size-sm);">Could not load groups.</p>';
    });
}

function showDeleteTournamentModal(tournamentId, tournamentName) {
  const modal      = document.getElementById('delete-tournament-modal');
  const bodyEl     = document.getElementById('delete-tournament-modal-body');
  const confirmBtn = document.getElementById('delete-tournament-confirm-btn');
  const cancelBtn  = document.getElementById('delete-tournament-cancel-btn');

  bodyEl.textContent = `"${tournamentName}" and all its rounds, matches, and scores will be permanently removed. This cannot be undone.`;
  modal.style.display = 'flex';

  // Reset state before cloning so the clone always starts clean
  confirmBtn.textContent = 'Yes, delete this tournament';
  confirmBtn.disabled = false;

  const newConfirm = confirmBtn.cloneNode(true);
  const newCancel  = cancelBtn.cloneNode(true);
  confirmBtn.replaceWith(newConfirm);
  cancelBtn.replaceWith(newCancel);

  const closeModal = () => { modal.style.display = 'none'; };

  newCancel.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  newConfirm.addEventListener('click', () => {
    newConfirm.textContent = 'Deleting…';
    newConfirm.disabled = true;

    fetch(`${API_BASE_URL}/api/delete_tournament.php`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tournament_id: parseInt(tournamentId) })
    })
    .then(r => r.json())
    .then(data => {
      closeModal();
      if (data.success) {
        document.getElementById('edit-tournament-container').style.display = 'none';
        document.getElementById('user-dashboard').style.display = 'block';
        loadUserTournaments(currentUser.golfer_id);
      } else {
        alert(data.error || 'Failed to delete tournament.');
      }
    })
    .catch(() => {
      closeModal();
      alert('Network error — tournament was not deleted.');
    });
  });
}

function showDeleteRoundModal(roundId, tournamentId, roundName) {
  const modal      = document.getElementById('delete-round-modal');
  const bodyEl     = document.getElementById('delete-round-modal-body');
  const confirmBtn = document.getElementById('delete-round-confirm-btn');
  const cancelBtn  = document.getElementById('delete-round-cancel-btn');

  bodyEl.textContent = `"${roundName}" and all its matches, scores, and tee times will be permanently removed. This cannot be undone.`;
  modal.style.display = 'flex';

  // Reset state before cloning so the clone always starts clean
  confirmBtn.textContent = 'Yes, delete this round';
  confirmBtn.disabled = false;

  // Clone buttons to remove any prior listeners
  const newConfirm = confirmBtn.cloneNode(true);
  const newCancel  = cancelBtn.cloneNode(true);
  confirmBtn.replaceWith(newConfirm);
  cancelBtn.replaceWith(newCancel);

  const closeModal = () => { modal.style.display = 'none'; };

  newCancel.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  newConfirm.addEventListener('click', () => {
    newConfirm.textContent = 'Deleting…';
    newConfirm.disabled = true;

    fetch(`${API_BASE_URL}/api/delete_round.php`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ round_id: parseInt(roundId), tournament_id: parseInt(tournamentId) })
    })
    .then(r => r.json())
    .then(data => {
      closeModal();
      if (data.success) {
        // Return to dashboard and refresh
        document.getElementById('add-round-container').style.display = 'none';
        document.getElementById('user-dashboard').style.display = 'block';
        loadUserTournaments(currentUser.golfer_id);
      } else {
        alert(data.error || 'Failed to delete round.');
      }
    })
    .catch(() => {
      closeModal();
      alert('Network error — round was not deleted.');
    });
  });
}

function openSwitchGroupModal(orgs) {
  const modal = document.getElementById('switch-group-modal');
  const list  = document.getElementById('switch-group-list');
  const closeBtn = document.getElementById('close-switch-group-modal');

  const _avatarHtml = (url, name, size = 38) => {
    const initial = (name || '?').charAt(0).toUpperCase();
    const base = `width:${size}px; height:${size}px; border-radius:var(--radius-md); flex-shrink:0;`;
    if (!url) {
      return `<div style="${base} background:linear-gradient(135deg,var(--color-brand-primary) 0%,#6b35a8 100%);
                color:#fff; font-size:${Math.round(size*0.38)}px; font-weight:800;
                display:flex; align-items:center; justify-content:center;">${initial}</div>`;
    }
    if (url.startsWith('icon:')) {
      return `<div style="${base} background:var(--color-bg-muted); font-size:${Math.round(size*0.5)}px;
                display:flex; align-items:center; justify-content:center;">${url.slice(5)}</div>`;
    }
    return `<img src="${url}" alt="${name}" style="${base} object-fit:cover;">`;
  };

  list.innerHTML = orgs.map(org => {
    const avatar = _avatarHtml(org.avatar_url, org.org_name);
    if (org.is_current) {
      return `
        <div style="display:flex; align-items:center; gap:0.75rem;
                    padding:0.75rem 0; border-bottom:1px solid #f0f0f0;">
          ${avatar}
          <div style="flex:1; min-width:0;">
            <span style="font-size:1rem; font-weight:700; color:#1a1a1a;">${org.org_name}</span>
            <span style="margin-left:0.5rem; font-size:0.75rem; background:#4F2185; color:white;
                         border-radius:4px; padding:1px 6px;">Active</span>
          </div>
        </div>`;
    }
    return `
      <div onclick="switchGroup(${org.org_id}); document.getElementById('switch-group-modal').style.display='none';"
           style="display:flex; align-items:center; gap:0.75rem;
                  padding:0.75rem 0; border-bottom:1px solid #f0f0f0; cursor:pointer;">
        ${avatar}
        <span style="flex:1; font-size:1rem; color:#4F2185; font-weight:500; min-width:0;">${org.org_name}</span>
        <span style="font-size:0.8rem; color:#888; flex-shrink:0;">Switch →</span>
      </div>`;
  }).join('');

  modal.style.display = 'flex';

  closeBtn.onclick = () => { modal.style.display = 'none'; };
  modal.onclick    = (e) => { if (e.target === modal) modal.style.display = 'none'; };
}

function switchGroup(orgId) {
  fetch(`${API_BASE_URL}/api/select_org.php`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ org_id: orgId })
  })
    .then(r => r.json())
    .then(data => {
      if (data.success) {
        // Merge new group info into currentUser and reload everything
        currentUser = { ...currentUser, ...(data.golfer || {}), org_name: data.org_name, role: data.role };
        sessionStorage.setItem('current_user', JSON.stringify(currentUser));
        localStorage.setItem('sb_golfer', JSON.stringify(currentUser));
        returnToDashboard();
        loadUserDashboard(currentUser);
      } else {
        alert(data.error || 'Could not switch group.');
      }
    })
    .catch(() => alert('Connection error. Please try again.'));
}

function initJoinGroupForm() {
  const codeInput      = document.getElementById('join-group-code');
  const joinBtn        = document.getElementById('join-group-btn');
  const preview        = document.getElementById('join-group-preview');
  const message        = document.getElementById('join-group-message');
  const confirmBtn     = document.getElementById('join-group-confirm-btn');
  if (!codeInput || !joinBtn) return;

  // Reset state
  preview.style.display    = 'none';
  message.style.display    = 'none';
  confirmBtn.style.display = 'none';
  codeInput.value          = '';

  let pendingCode = null;

  joinBtn.onclick = () => {
    const code = codeInput.value.trim().toUpperCase();
    if (!code) return;
    preview.style.display    = 'none';
    message.style.display    = 'none';
    confirmBtn.style.display = 'none';
    joinBtn.disabled         = true;
    joinBtn.textContent      = '…';

    fetch(`${API_BASE_URL}/api/join_existing.php?code=${encodeURIComponent(code)}`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        joinBtn.disabled    = false;
        joinBtn.textContent = 'Join';
        if (data.error) {
          message.textContent   = data.error;
          message.style.color   = '#c0392b';
          message.style.display = 'block';
          return;
        }
        if (data.already_member) {
          message.textContent   = `You're already a member of ${data.org_name}.`;
          message.style.color   = '#888';
          message.style.display = 'block';
          return;
        }
        pendingCode            = code;
        preview.textContent    = `✓ Found group: ${data.org_name}`;
        preview.style.display  = 'block';
        confirmBtn.style.display = 'block';
      })
      .catch(() => {
        joinBtn.disabled    = false;
        joinBtn.textContent = 'Join';
        message.textContent   = 'Connection error. Please try again.';
        message.style.color   = '#c0392b';
        message.style.display = 'block';
      });
  }; // end joinBtn.onclick

  async function doJoinExisting(code, claimGolferId = null) {
    const body = { code };
    if (claimGolferId !== null) body.claim_golfer_id = claimGolferId;

    confirmBtn.disabled    = true;
    confirmBtn.textContent = 'Joining…';

    try {
      const res  = await fetch(`${API_BASE_URL}/api/join_existing.php`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      confirmBtn.disabled    = false;
      confirmBtn.textContent = 'Confirm & Join';

      if (!data.success) {
        message.textContent   = data.error || 'Could not join group.';
        message.style.color   = '#c0392b';
        message.style.display = 'block';
        return;
      }

      if (data.needs_claim) {
        // Show inline claim UI below the confirm button
        preview.style.display    = 'none';
        confirmBtn.style.display = 'none';
        message.style.display    = 'none';

        const claimDiv = document.createElement('div');
        claimDiv.id = 'inline-claim-panel';
        claimDiv.style.cssText = 'margin-top:0.75rem; border-top:1px solid #eee; padding-top:0.75rem;';
        claimDiv.innerHTML = `
          <p style="margin:0 0 0.6rem; font-size:0.9rem; font-weight:600; color:#333;">Are you one of these golfers?</p>
          <p style="margin:0 0 0.75rem; font-size:0.82rem; color:#666;">Your name wasn't found in the roster. Select your profile or create a new one.</p>
          ${data.candidates.map(g => {
            const hcp = parseFloat(g.handicap) % 1 === 0 ? parseInt(g.handicap) : parseFloat(g.handicap).toFixed(1);
            return `<button class="inline-claim-btn" data-golfer-id="${g.golfer_id}"
              style="display:flex; align-items:center; justify-content:space-between; width:100%;
                     padding:0.65rem 0.9rem; margin-bottom:0.4rem; background:#f4f0fa;
                     border:1px solid #c5a8f0; border-radius:8px; cursor:pointer; font-size:0.92rem;">
              <span style="font-weight:600; color:#1a1a1a;">${g.first_name} ${g.last_name}</span>
              <span style="font-size:0.8rem; color:#888;">HCP ${hcp}</span>
            </button>`;
          }).join('')}
          <button id="inline-claim-none"
            style="width:100%; margin-top:0.25rem; padding:0.55rem; background:transparent;
                   border:1px solid #ccc; border-radius:8px; font-size:0.85rem; color:#666; cursor:pointer;">
            I'm not listed — create a new profile
          </button>`;

        const joinFormEl = document.getElementById('join-group-form');
        joinFormEl.appendChild(claimDiv);

        claimDiv.querySelectorAll('.inline-claim-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            claimDiv.remove();
            await doJoinExisting(code, parseInt(btn.dataset.golferId));
          });
        });

        document.getElementById('inline-claim-none').addEventListener('click', async () => {
          claimDiv.remove();
          await doJoinExisting(code, 0);
        });

      } else {
        // Success — clean up
        message.textContent      = `✓ Joined ${data.org_name}!`;
        message.style.color      = '#2e7d32';
        message.style.display    = 'block';
        preview.style.display    = 'none';
        confirmBtn.style.display = 'none';
        codeInput.value          = '';
        pendingCode              = null;
        document.getElementById('inline-claim-panel')?.remove();
        loadMyGroups();
      }
    } catch {
      confirmBtn.disabled    = false;
      confirmBtn.textContent = 'Confirm & Join';
      message.textContent   = 'Connection error. Please try again.';
      message.style.color   = '#c0392b';
      message.style.display = 'block';
    }
  }

  confirmBtn.onclick = () => {
    if (!pendingCode) return;
    doJoinExisting(pendingCode);
  };
}

function initCreateGroupModal() {
  const modal     = document.getElementById('create-group-modal');
  const openBtn   = document.getElementById('open-create-group-btn');
  const closeBtn  = document.getElementById('close-create-group-modal');
  const submitBtn = document.getElementById('create-group-submit-btn');
  const nameInput = document.getElementById('new-group-name');
  const msgEl     = document.getElementById('create-group-message');
  if (!modal || !openBtn) return;

  function openModal() {
    nameInput.value       = '';
    msgEl.style.display   = 'none';
    submitBtn.disabled    = false;
    submitBtn.textContent = 'Create Group';
    modal.style.display   = 'flex';
    setTimeout(() => nameInput.focus(), 50);
  }

  function closeModal() {
    modal.style.display = 'none';
  }

  openBtn.onclick  = openModal;
  closeBtn.onclick = closeModal;
  modal.onclick    = (e) => { if (e.target === modal) closeModal(); };

  // Submit on Enter key
  nameInput.onkeydown = (e) => { if (e.key === 'Enter') submitBtn.click(); };

  submitBtn.onclick = async () => {
    const name = nameInput.value.trim();
    msgEl.style.display = 'none';
    if (!name) {
      msgEl.textContent   = 'Please enter a group name.';
      msgEl.style.color   = '#c0392b';
      msgEl.style.display = 'block';
      return;
    }

    submitBtn.disabled    = true;
    submitBtn.textContent = 'Creating…';

    try {
      const res  = await fetch(`${API_BASE_URL}/api/create_org.php`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();

      if (data.success) {
        msgEl.textContent   = `✓ "${data.org_name}" created! You can switch to it from the list below.`;
        msgEl.style.color   = '#2e7d32';
        msgEl.style.display = 'block';
        submitBtn.textContent = 'Created!';
        loadMyGroups(); // refresh the list
        setTimeout(() => closeModal(), 2000);
      } else {
        msgEl.textContent   = data.error || 'Could not create group.';
        msgEl.style.color   = '#c0392b';
        msgEl.style.display = 'block';
        submitBtn.disabled    = false;
        submitBtn.textContent = 'Create Group';
      }
    } catch {
      msgEl.textContent   = 'Connection error. Please try again.';
      msgEl.style.color   = '#c0392b';
      msgEl.style.display = 'block';
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Create Group';
    }
  };
}

function showQuickRoundTypeSelector() {
  // Hide dashboard
  document.getElementById('user-dashboard').style.display = 'none';

  // Show round type selector
  document.getElementById('quick-round-type-selector').style.display = 'block';

  // Reset the dropdown
  document.getElementById('round-type-select').value = '';
}

document.addEventListener('DOMContentLoaded', () => {
  const authForm = document.getElementById('auth-form');
  const authMessage = document.getElementById('auth-message');
  const selectUser = document.getElementById('selectUser');
  const newGolferForm = document.getElementById('new-golfer-form');

  // Set up hamburger menu event listeners (needed for all views)
  const hamburgerBtn = document.getElementById('hamburger-menu-btn');
  const hamburgerDropdown = document.getElementById('hamburger-dropdown');

  hamburgerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    hamburgerDropdown.classList.toggle('show');
    const isAdmin = currentUser && currentUser.role === 'admin';
    const editGroupBtn = document.getElementById('menu-edit-group');
    if (editGroupBtn) editGroupBtn.style.display = isAdmin ? 'block' : 'none';
  });

  // Close menu when clicking outside
  document.addEventListener('click', (e) => {
    if (!hamburgerDropdown.contains(e.target) && !hamburgerBtn.contains(e.target)) {
      hamburgerDropdown.classList.remove('show');
    }
    // Also close round dropdown when clicking outside
    const roundBar = document.getElementById('round-bar');
    const roundDropdown = document.getElementById('round-dropdown');
    if (roundDropdown && !roundBar.contains(e.target)) {
      roundDropdown.style.display = 'none';
    }
  });

  // Round bar dropdown functionality
  const roundBar = document.getElementById('round-bar');
  const roundDropdown = document.getElementById('round-dropdown');

  roundBar.addEventListener('click', (e) => {
    e.stopPropagation();

    // Toggle dropdown visibility
    if (roundDropdown.style.display === 'none') {
      // Fetch rounds for current tournament and populate dropdown
      const tournamentId = sessionStorage.getItem('selected_tournament_id');
      const currentRoundId = sessionStorage.getItem('selected_round_id');

      if (!tournamentId) return;

      fetch(`${API_BASE_URL}/api/get_tournament_rounds.php?tournament_id=${tournamentId}`, { credentials: 'include' })
        .then(res => res.json())
        .then(rounds => {
          if (!Array.isArray(rounds) || rounds.length === 0) {
            roundDropdown.innerHTML = '<div class="round-dropdown-item">No rounds available</div>';
          } else {
            roundDropdown.innerHTML = rounds.map(round => {
              const isActive = round.round_id == currentRoundId;
              return `
                <div class="round-dropdown-item ${isActive ? 'active' : ''}"
                     data-round-id="${round.round_id}"
                     data-round-name="${round.round_name}">
                  ${round.round_name}
                </div>
              `;
            }).join('');

            // Add click handlers for dropdown items
            roundDropdown.querySelectorAll('.round-dropdown-item').forEach(item => {
              item.addEventListener('click', (e) => {
                e.stopPropagation();
                const roundId = item.dataset.roundId;
                const roundName = item.dataset.roundName;
                roundDropdown.style.display = 'none';

                // Load the selected round - check format to call correct function
                const formatId = parseInt(sessionStorage.getItem('selected_format_id'));
                if (formatId === 4) {
                  loadGuysTripTournamentRound(roundId, tournamentId, roundName, formatId);
                } else {
                  loadTournamentRound(roundId, tournamentId, roundName);
                }
              });
            });
          }
          roundDropdown.style.display = 'block';
        })
        .catch(err => {
          console.error('Error loading rounds:', err);
          roundDropdown.innerHTML = '<div class="round-dropdown-item">Error loading rounds</div>';
          roundDropdown.style.display = 'block';
        });
    } else {
      roundDropdown.style.display = 'none';
    }
  });

  // Menu option: Dashboard
  document.getElementById('menu-dashboard').addEventListener('click', returnToDashboard);

  document.getElementById('user-header-name').addEventListener('click', returnToDashboard);

  // Menu option: My History
  document.getElementById('menu-my-history').addEventListener('click', () => {
    hamburgerDropdown.classList.remove('show');
    if (currentUser) {
      loadTournamentHistory(currentUser.golfer_id);
    }
  });

  // Menu option: Edit User
  document.getElementById('menu-edit-user').addEventListener('click', () => {
    hamburgerDropdown.classList.remove('show');
    if (currentUser) {
      loadEditUserPage();
    }
  });

  // Menu option: Edit Group (admin only)
  document.getElementById('menu-edit-group').addEventListener('click', () => {
    hamburgerDropdown.classList.remove('show');
    showEditGroupPage();
  });

  // Menu option: Logout
  document.getElementById('menu-logout').addEventListener('click', () => {
    hamburgerDropdown.classList.remove('show');
    document.getElementById('user-dashboard').style.display = 'none';
    document.getElementById('app-content').style.display = 'none';
    document.getElementById('round-history-container').style.display = 'none';
    document.getElementById('best-ball-setup').style.display = 'none';
    document.getElementById('tournament-history-container').style.display = 'none';
    document.getElementById('edit-user-container').style.display = 'none';
    document.getElementById('user-header-bar').style.display = 'none';
    document.getElementById('auth-container').style.display = 'none';
    document.getElementById('auth-form').reset();
    newGolferForm.style.display = 'none';
    // Return to login screen and clear persisted login
    localStorage.removeItem('sb_golfer');
    fetch(`${API_BASE_URL}/api/logout.php`, { method: 'POST', credentials: 'include' }).catch(() => {});
    document.getElementById('login-form').style.display = '';
    document.getElementById('signup-chooser').style.display = 'none';
    document.getElementById('register-form').style.display = 'none';
    document.getElementById('join-form').style.display = 'none';
    document.getElementById('org-picker').style.display = 'none';
    document.getElementById('login-email').value = '';
    document.getElementById('login-password').value = '';
    document.getElementById('login-error').style.display = 'none';
    document.getElementById('pin-container').style.display = 'flex';
    sessionStorage.clear();
    currentUser = null;
  });

  // ── Login screen & session auto-login ─────────────────────────────────────

  function showLoginScreen() {
    document.getElementById('login-form').style.display = '';
    document.getElementById('reset-form').style.display = 'none';
    document.getElementById('signup-chooser').style.display = 'none';
    document.getElementById('register-form').style.display = 'none';
    document.getElementById('join-form').style.display = 'none';
    document.getElementById('org-picker').style.display = 'none';
    document.getElementById('pin-container').style.display = 'flex';
  }


  function showSignupChooser() {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('signup-chooser').style.display = '';
    document.getElementById('register-form').style.display = 'none';
    document.getElementById('join-form').style.display = 'none';
    document.getElementById('org-picker').style.display = 'none';
    document.getElementById('pin-container').style.display = 'flex';
  }

  function showJoinForm(prefilledCode) {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('signup-chooser').style.display = 'none';
    document.getElementById('register-form').style.display = 'none';
    document.getElementById('join-form').style.display = '';
    document.getElementById('org-picker').style.display = 'none';
    document.getElementById('pin-container').style.display = 'flex';
    const codeInput = document.getElementById('join-code-input');
    if (prefilledCode) {
      codeInput.value = prefilledCode.toUpperCase();
      codeInput.readOnly = true;
    } else {
      codeInput.value = '';
      codeInput.readOnly = false;
      document.getElementById('join-org-label').textContent = 'Join a group';
      document.getElementById('join-code-status').style.display = 'none';
    }
  }

  function proceedAfterAuth(golfer) {
    document.getElementById('pin-container').style.display = 'none';
    if (typeof window._resetSessionExpiredFlag === 'function') {
      window._resetSessionExpiredFlag(); // allow 401 detection again after re-login
    }
    startSessionHeartbeat(); // Keep the PHP session alive from this point on
    if (golfer) {
      // API returned a linked golfer — go straight to dashboard
      localStorage.setItem('sb_golfer', JSON.stringify(golfer));
      loadUserDashboard(golfer);
    } else {
      // Fall back to localStorage (covers existing users not yet linked in DB)
      const stored = localStorage.getItem('sb_golfer');
      if (stored) {
        const storedGolfer = JSON.parse(stored);
        // Establish the DB link in the background so API works next time
        fetch(`${API_BASE_URL}/api/link_golfer.php`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ golfer_id: storedGolfer.golfer_id }),
          credentials: 'include'
        }).catch(() => {});
        loadUserDashboard(storedGolfer);
      } else {
        // No golfer known — show the picker
        document.getElementById('auth-container').style.display = 'flex';
      }
    }
  }

  // Check URL params
  const urlParams  = new URLSearchParams(window.location.search);
  let joinCode     = urlParams.get('join');
  const resetToken = urlParams.get('reset');

  // On app load — check if session is already active
  fetch(`${API_BASE_URL}/api/me.php`, { credentials: 'include' })
    .then(r => r.json())
    .then(data => {
      if (resetToken) {
        // Password reset link — validate token and show reset form regardless of session
        fetch(`${API_BASE_URL}/api/reset_password.php?token=${encodeURIComponent(resetToken)}`, { credentials: 'include' })
          .then(r => r.json())
          .then(info => {
            if (info.valid) {
              const firstName = info.name ? info.name.split(' ')[0] : '';
              document.getElementById('reset-greeting').textContent = firstName
                ? `Hi ${firstName}, set a new password`
                : 'Set a new password';
              document.getElementById('login-form').style.display = 'none';
              document.getElementById('reset-form').style.display = '';
              document.getElementById('pin-container').style.display = 'flex';
            } else {
              // Invalid/expired token — show login with an error hint
              showLoginScreen();
              const err = document.getElementById('login-error');
              err.textContent = 'That reset link has expired. Please request a new one.';
              err.style.display = 'block';
            }
          })
          .catch(() => showLoginScreen());
        return; // Don't fall through to normal session check
      }

      if (data.authenticated) {
        proceedAfterAuth(data.golfer ? { ...data.golfer, org_name: data.org_name } : null);
      } else if (joinCode) {
        // Validate the URL invite code and show the join form with it pre-filled
        fetch(`${API_BASE_URL}/api/join.php?code=${encodeURIComponent(joinCode)}`, { credentials: 'include' })
          .then(r => r.json())
          .then(inv => {
            if (inv.valid) {
              showJoinForm(joinCode);
              document.getElementById('join-org-label').textContent = `Join ${inv.org_name}`;
              document.getElementById('join-code-status').textContent = `✓ ${inv.org_name}`;
              document.getElementById('join-code-status').style.color = '#c8e6c9';
              document.getElementById('join-code-status').style.display = '';
            } else {
              showLoginScreen();
            }
          })
          .catch(() => showLoginScreen());
      } else {
        showLoginScreen();
      }
    })
    .catch(() => showLoginScreen());

  // ── Join code input: auto-verify when 8 chars entered ─────────────────────
  document.getElementById('join-code-input').addEventListener('input', async (e) => {
    const code      = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    e.target.value  = code;
    const statusEl  = document.getElementById('join-code-status');
    const labelEl   = document.getElementById('join-org-label');

    if (code.length === 8) {
      statusEl.textContent = 'Checking…';
      statusEl.style.color = 'rgba(255,255,255,0.6)';
      statusEl.style.display = '';
      try {
        const res  = await fetch(`${API_BASE_URL}/api/join.php?code=${encodeURIComponent(code)}`, { credentials: 'include' });
        const data = await res.json();
        if (data.valid) {
          joinCode = code;
          labelEl.textContent      = `Join ${data.org_name}`;
          statusEl.textContent     = `✓ ${data.org_name}`;
          statusEl.style.color     = '#c8e6c9';
        } else {
          joinCode = null;
          labelEl.textContent      = 'Join a group';
          statusEl.textContent     = 'Invalid or expired code';
          statusEl.style.color     = '#ffcdd2';
        }
      } catch {
        joinCode = null;
        statusEl.textContent = 'Could not verify code';
        statusEl.style.color = '#ffcdd2';
      }
    } else {
      joinCode = null;
      statusEl.style.display = 'none';
      labelEl.textContent    = 'Join a group';
    }
  });

  // ── Join form ───────────────────────────────────────────────────────────────
  document.getElementById('join-signin-link').addEventListener('click', (e) => {
    e.preventDefault();
    showLoginScreen();
  });

  document.getElementById('join-back-link').addEventListener('click', (e) => {
    e.preventDefault();
    showSignupChooser();
  });

  // Stores pending join data while the claim step is shown
  let _pendingJoin = null;

  async function submitJoin(payload) {
    const errorEl = document.getElementById('join-error');
    const btn     = document.getElementById('join-submit-btn');
    errorEl.style.display = 'none';
    if (btn) { btn.disabled = true; btn.textContent = 'Joining…'; }

    try {
      const res  = await fetch(`${API_BASE_URL}/api/join.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include'
      });
      const data = await res.json();

      if (data.needs_claim) {
        // Show claim step
        _pendingJoin = payload;
        showClaimStep(data.candidates, payload.code);
      } else if (!res.ok || !data.success) {
        errorEl.textContent = data.error || 'Could not join group. Please try again.';
        errorEl.style.display = 'block';
        if (btn) { btn.disabled = false; btn.textContent = 'Join Group'; }
      } else {
        window.history.replaceState({}, '', window.location.pathname);
        proceedAfterAuth(data.golfer ? { ...data.golfer, org_name: data.org_name } : null);
      }
    } catch (err) {
      errorEl.textContent = 'Connection error. Please try again.';
      errorEl.style.display = 'block';
      if (btn) { btn.disabled = false; btn.textContent = 'Join Group'; }
    }
  }

  function showClaimStep(candidates, code) {
    document.getElementById('join-form').style.display = 'none';
    const claimForm  = document.getElementById('claim-profile-form');
    const listEl     = document.getElementById('claim-candidates-list');
    claimForm.style.display = '';

    listEl.innerHTML = candidates.map(g => {
      const hcp = parseFloat(g.handicap) % 1 === 0 ? parseInt(g.handicap) : parseFloat(g.handicap).toFixed(1);
      return `
        <button class="claim-candidate-btn" data-golfer-id="${g.golfer_id}"
          style="display:flex; align-items:center; justify-content:space-between; width:100%;
                 padding:0.75rem 1rem; margin-bottom:0.5rem; background:rgba(255,255,255,0.12);
                 border:1px solid rgba(255,255,255,0.3); border-radius:8px; cursor:pointer;
                 color:white; font-size:0.95rem; text-align:left;">
          <span style="font-weight:600;">${g.first_name} ${g.last_name}</span>
          <span style="font-size:0.82rem; opacity:0.75;">HCP ${hcp}</span>
        </button>`;
    }).join('');

    listEl.querySelectorAll('.claim-candidate-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const golferId = parseInt(btn.dataset.golferId);
        document.getElementById('claim-error').style.display = 'none';
        listEl.querySelectorAll('.claim-candidate-btn').forEach(b => b.disabled = true);
        document.getElementById('claim-none-btn').disabled = true;
        btn.textContent = 'Joining…';
        await submitJoin({ ..._pendingJoin, claim_golfer_id: golferId });
      });
    });

    document.getElementById('claim-none-btn').onclick = async () => {
      document.getElementById('claim-error').style.display = 'none';
      document.getElementById('claim-none-btn').disabled = true;
      await submitJoin({ ..._pendingJoin, claim_golfer_id: 0 });
    };
  }

  document.getElementById('join-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const firstName  = document.getElementById('join-first-name').value.trim();
    const lastName   = document.getElementById('join-last-name').value.trim();
    const email      = document.getElementById('join-email').value.trim();
    const password   = document.getElementById('join-password').value.trim();
    const handicap   = parseFloat(document.getElementById('join-handicap').value) || 0;
    const errorEl    = document.getElementById('join-error');
    const codeToUse  = joinCode || document.getElementById('join-code-input').value.trim().toUpperCase();

    if (!codeToUse) {
      errorEl.textContent = 'Please enter a valid invite code.';
      errorEl.style.display = 'block';
      return;
    }

    await submitJoin({ code: codeToUse, first_name: firstName, last_name: lastName, email, password, handicap });
  });

  // ── Reset password form (admin-generated link: ?reset=TOKEN) ────────────────
  document.getElementById('reset-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const password  = document.getElementById('reset-password').value.trim();
    const confirm   = document.getElementById('reset-password-confirm').value.trim();
    const errorEl   = document.getElementById('reset-error');
    const btn       = document.getElementById('reset-submit-btn');

    errorEl.style.display = 'none';

    if (password !== confirm) {
      errorEl.textContent = 'Passwords do not match.';
      errorEl.style.display = 'block';
      return;
    }
    if (password.length < 8) {
      errorEl.textContent = 'Password must be at least 8 characters.';
      errorEl.style.display = 'block';
      return;
    }

    btn.disabled    = true;
    btn.textContent = 'Setting password…';

    try {
      const res  = await fetch(`${API_BASE_URL}/api/reset_password.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, password }),
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success) {
        // Clean the token from URL, then go to login
        window.history.replaceState({}, '', window.location.pathname);
        showLoginScreen();
        const err = document.getElementById('login-error');
        // Reuse login-error div as a success message (green)
        err.style.color   = '#c8e6c9';
        err.textContent   = 'Password updated! Sign in with your new password.';
        err.style.display = 'block';
      } else {
        errorEl.textContent = data.error || 'Password reset failed. Please try again.';
        errorEl.style.display = 'block';
        btn.disabled    = false;
        btn.textContent = 'Set Password';
      }
    } catch {
      errorEl.textContent = 'Connection error. Please try again.';
      errorEl.style.display = 'block';
      btn.disabled    = false;
      btn.textContent = 'Set Password';
    }
  });

  // ── Signup flow navigation ──────────────────────────────────────────────────
  document.getElementById('show-signup-link').addEventListener('click', (e) => {
    e.preventDefault();
    showSignupChooser();
  });

  document.getElementById('chooser-signin-link').addEventListener('click', (e) => {
    e.preventDefault();
    showLoginScreen();
  });

  document.getElementById('chooser-create-btn').addEventListener('click', () => {
    document.getElementById('signup-chooser').style.display = 'none';
    document.getElementById('register-form').style.display = '';
  });

  document.getElementById('chooser-join-btn').addEventListener('click', () => {
    showJoinForm(null);
  });

  document.getElementById('register-back-link').addEventListener('click', (e) => {
    e.preventDefault();
    showSignupChooser();
  });

  document.getElementById('show-login-link').addEventListener('click', (e) => {
    e.preventDefault();
    showLoginScreen();
  });

  // ── Login form submission ───────────────────────────────────────────────────
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value.trim();
    const errorEl  = document.getElementById('login-error');
    const btn      = document.getElementById('login-submit-btn');

    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Signing in…';

    try {
      const res  = await fetch(`${API_BASE_URL}/api/login.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        credentials: 'include'
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        errorEl.textContent = data.error || 'Invalid email or password';
        errorEl.style.display = 'block';
      } else if (data.needs_org_select) {
        // Show org picker
        document.getElementById('login-form').style.display = 'none';
        document.getElementById('org-picker').style.display = '';
        const list = document.getElementById('org-picker-list');
        list.innerHTML = '';
        data.orgs.forEach(org => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = org.org_name;
          btn.style.cssText = 'width:100%; margin-bottom:0.5rem; padding:0.75rem; background:#4F2185; color:#fff; border:none; border-radius:6px; font-size:1rem; font-weight:bold; cursor:pointer;';
          btn.addEventListener('click', async () => {
            const r = await fetch(`${API_BASE_URL}/api/select_org.php`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ org_id: org.org_id }),
              credentials: 'include'
            });
            const d = await r.json();
            if (d.success) proceedAfterAuth(d.golfer ? { ...d.golfer, org_name: d.org_name } : null);
          });
          list.appendChild(btn);
        });
      } else {
        proceedAfterAuth(data.golfer ? { ...data.golfer, org_name: data.org_name } : null);
      }
    } catch (err) {
      errorEl.textContent = 'Connection error. Please try again.';
      errorEl.style.display = 'block';
    }

    btn.disabled = false;
    btn.textContent = 'Sign In';
  });

  // ── Register form submission ────────────────────────────────────────────────
  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const firstName = document.getElementById('reg-first-name').value.trim();
    const lastName  = document.getElementById('reg-last-name').value.trim();
    const email     = document.getElementById('reg-email').value.trim();
    const password  = document.getElementById('reg-password').value.trim();
    const groupName = document.getElementById('reg-group-name').value.trim();
    const errorEl   = document.getElementById('register-error');
    const btn       = document.getElementById('register-submit-btn');

    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Creating…';

    try {
      const res  = await fetch(`${API_BASE_URL}/api/register.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ first_name: firstName, last_name: lastName, email, password, group_name: groupName }),
        credentials: 'include'
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        errorEl.textContent = data.error || 'Registration failed. Please try again.';
        errorEl.style.display = 'block';
      } else {
        proceedAfterAuth(data.golfer ? { ...data.golfer, org_name: data.org_name } : null);
      }
    } catch (err) {
      errorEl.textContent = 'Connection error. Please try again.';
      errorEl.style.display = 'block';
    }

    btn.disabled = false;
    btn.textContent = 'Create Group';
  });

  // ── Clear any Quick Round session data on page load - Quick Rounds don't persist across refreshes
  sessionStorage.removeItem('best_ball_match_id');
  sessionStorage.removeItem('rabbit_match_id');
  sessionStorage.removeItem('wolf_match_id');
  sessionStorage.removeItem('quick_round_read_only');
  sessionStorage.removeItem('best_ball_tournament_id');
  sessionStorage.removeItem('rabbit_tournament_id');
  sessionStorage.removeItem('wolf_tournament_id');

  // Load golfers into dropdown (only when authenticated — silently skip on 401)
  fetch(`${API_BASE_URL}/api/get_golfers.php`, { credentials: 'include' })
    .then(response => response.ok ? response.json() : [])
    .then(golfers => {
      if (!Array.isArray(golfers)) return;
      golfers.forEach(golfer => {
        const option = document.createElement('option');
        option.value = golfer.golfer_id;
        option.textContent = `${golfer.first_name} ${golfer.last_name}`;
        option.dataset.golfer = JSON.stringify(golfer);
        selectUser.appendChild(option);
      });
    })
    .catch(() => {}); // silently ignore — user may simply not be logged in yet

  // Get the continue button reference
  const continueBtn = authForm.querySelector('button[type="submit"]');
  // Hide continue button by default (only needed for new golfer creation)
  continueBtn.style.display = 'none';

  // Handle user selection
  selectUser.addEventListener('change', function() {
    if (this.value === 'new') {
      newGolferForm.style.display = 'flex';
      continueBtn.style.display = 'block';
    } else if (this.value) {
      // Existing golfer selected - immediately load dashboard
      newGolferForm.style.display = 'none';
      continueBtn.style.display = 'none';
      const selectedOption = this.options[this.selectedIndex];
      const golfer = JSON.parse(selectedOption.dataset.golfer);
      loadUserDashboard(golfer);
    } else {
      // Empty selection
      newGolferForm.style.display = 'none';
      continueBtn.style.display = 'none';
    }
  });

  // Handle auth form submission
  authForm.addEventListener('submit', (event) => {
    event.preventDefault();
    authMessage.textContent = '';

    const selectedValue = selectUser.value;

    if (!selectedValue) {
      authMessage.textContent = 'Please select a golfer';
      return;
    }

    if (selectedValue === 'new') {
      // Create new golfer
      const firstName = document.getElementById('new-golfer-first-name').value.trim();
      const lastName = document.getElementById('new-golfer-last-name').value.trim();
      const handicap = document.getElementById('new-golfer-handicap').value;
      const email = document.getElementById('new-golfer-email').value.trim();

      if (!firstName || !lastName) {
        authMessage.textContent = 'Please enter first and last name';
        return;
      }

      authMessage.textContent = 'Creating golfer...';

      fetch(`${API_BASE_URL}/api/create_golfer.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          handicap: parseFloat(handicap) || 0,
          email: email || null
        }),
        credentials: 'include'
      })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            const golfer = {
              golfer_id: data.golfer_id,
              first_name: firstName,
              last_name: lastName,
              handicap: parseFloat(handicap) || 0,
              email: email || ''
            };
            // Link this new golfer to the user account permanently
            fetch(`${API_BASE_URL}/api/link_golfer.php`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ golfer_id: data.golfer_id }),
              credentials: 'include'
            }).catch(() => {});
            loadUserDashboard(golfer);
          } else {
            authMessage.textContent = 'Error creating golfer: ' + (data.error || 'Unknown error');
          }
        })
        .catch(err => {
          console.error('Error creating golfer:', err);
          authMessage.textContent = 'Error creating golfer. Please try again.';
        });
    } else {
      // Load existing golfer and link to user account permanently
      const selectedOption = selectUser.options[selectUser.selectedIndex];
      const golfer = JSON.parse(selectedOption.dataset.golfer);
      fetch(`${API_BASE_URL}/api/link_golfer.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ golfer_id: golfer.golfer_id }),
        credentials: 'include'
      }).catch(() => {});
      loadUserDashboard(golfer);
    }
  });

  document.getElementById('create-quick-round-btn').addEventListener('click', () => {
    document.getElementById('user-dashboard').style.display = 'none';
    // Show round type selector
    showQuickRoundTypeSelector();
  });

  // ── New Tournament button ────────────────────────────────────────────────────
  document.getElementById('create-tournament-btn').addEventListener('click', () => {
    showNewTournamentStep1();
  });

  document.getElementById('create-tournament-back-btn').addEventListener('click', () => {
    document.getElementById('create-tournament-container').style.display = 'none';
    document.getElementById('user-dashboard').style.display = 'block';
  });
  document.getElementById('nt-cancel-btn').addEventListener('click', cancelNewTournament);
  document.getElementById('nt-step2-cancel-btn').addEventListener('click', cancelNewTournament);
  document.getElementById('nt-step3-cancel-btn').addEventListener('click', cancelNewTournament);

  document.getElementById('nt-step2-back-btn').addEventListener('click', () => {
    document.getElementById('create-tournament-step2').style.display = 'none';
    document.getElementById('create-tournament-container').style.display = 'block';
  });

  document.getElementById('nt-step3-back-btn').addEventListener('click', () => {
    document.getElementById('create-tournament-step3').style.display = 'none';
    document.getElementById('create-tournament-step2').style.display = 'block';
  });

  document.getElementById('nt-step3-continue-btn').addEventListener('click', async () => {
    const assignments = window._newTournamentData.assignments || {};
    const team1Count  = Object.values(assignments).filter(t => t === 1).length;
    const team2Count  = Object.values(assignments).filter(t => t === 2).length;
    const errorEl     = document.getElementById('nt-step3-error');
    const btn         = document.getElementById('nt-step3-continue-btn');

    if (team1Count === 0 || team2Count === 0) {
      errorEl.textContent = 'Please assign at least one player to each team.';
      errorEl.style.display = 'block';
      return;
    }
    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Creating…';

    try {
      const d = window._newTournamentData;

      // 1. Create the tournament
      const tRes  = await fetch(`${API_BASE_URL}/api/tournaments.php`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:          d.name,
          start_date:    d.startDate,
          end_date:      d.endDate,
          handicap_pct:  parseFloat(d.handicap),
          format_id:     parseInt(d.formatId),
        }),
      });
      const tData = await tRes.json();
      if (!tData.inserted_id) throw new Error('Tournament creation failed');
      const tournamentId = tData.inserted_id;

      // 2. Create both teams and capture their IDs
      const teamResults = await Promise.all(d.teams.map(team =>
        fetch(`${API_BASE_URL}/api/tournament_teams.php`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tournament_id: tournamentId, name: team.name, color: team.color }),
        }).then(r => r.json())
      ));
      // teamResults[0] → team 1 (index 1 in assignments), teamResults[1] → team 2 (index 2)
      const teamIdMap = {
        1: teamResults[0].team_id,
        2: teamResults[1].team_id,
      };

      // 3. Build assignments array and save
      const golferAssignments = Object.entries(assignments).map(([golferId, teamNum]) => ({
        golfer_id: parseInt(golferId),
        team_id:   teamIdMap[teamNum],
      }));

      await fetch(`${API_BASE_URL}/api/save_tournament_assignments.php`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournament_id: tournamentId, assignments: golferAssignments }),
      });

      // Done — clean up and return to dashboard
      window._newTournamentData = null;
      ['create-tournament-container', 'create-tournament-step2', 'create-tournament-step3']
        .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
      document.getElementById('user-dashboard').style.display = 'block';
      loadUserTournaments(currentUser.golfer_id);

    } catch (err) {
      console.error('Tournament creation error:', err);
      errorEl.textContent = 'Error creating tournament. Please try again.';
      errorEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Create Tournament';
    }
  });

  document.getElementById('nt-step2-continue-btn').addEventListener('click', () => {
    const team1Name  = document.getElementById('nt-team1-name').value.trim();
    const team2Name  = document.getElementById('nt-team2-name').value.trim();
    const team1Color = document.getElementById('nt-team1-color').value || '#1565C0';
    const team2Color = document.getElementById('nt-team2-color').value || '#C62828';
    const errorEl    = document.getElementById('nt-step2-error');

    if (!team1Name || !team2Name) {
      errorEl.textContent = 'Please enter a name for both teams.';
      errorEl.style.display = 'block';
      return;
    }
    if (team1Color === team2Color) {
      errorEl.textContent = 'Please choose a different color for each team.';
      errorEl.style.display = 'block';
      return;
    }
    errorEl.style.display = 'none';

    window._newTournamentData = {
      ...window._newTournamentData,
      teams: [
        { name: team1Name, color: team1Color },
        { name: team2Name, color: team2Color },
      ],
      assignments: {}, // reset assignments when teams change
    };
    showNewTournamentStep3();
  });

  document.getElementById('nt-continue-btn').addEventListener('click', () => {
    const name      = document.getElementById('nt-name').value.trim();
    const startDate = document.getElementById('nt-start-date').value;
    const endDate   = document.getElementById('nt-end-date').value;
    const handicap  = document.getElementById('nt-handicap').value;
    const formatId  = document.getElementById('nt-format').value;
    const errorEl   = document.getElementById('nt-error');

    if (!name || !startDate || !endDate || !formatId) {
      errorEl.textContent = 'Please fill in all fields.';
      errorEl.style.display = 'block';
      return;
    }
    errorEl.style.display = 'none';

    // Capture the human-readable format name from the selected option
    const formatSelect = document.getElementById('nt-format');
    const formatName   = formatSelect.options[formatSelect.selectedIndex]?.text || '';

    // Store for use in subsequent steps
    window._newTournamentData = { name, startDate, endDate, handicap, formatId, formatName };

    // Branch wizard based on format
    const fId = parseInt(formatId);
    if (fId === 3) {
      // Ryder Cup → Team Setup → Player Assignment
      showNewTournamentStep2();
    } else if (fId === 4) {
      // Guys Trip → Player Selection → Create
      showGuysTripStep2();
    } else if (fId === 5) {
      // Skins → Player Selection → Create (same UI as Guys Trip, no teams)
      showGuysTripStep2();
    } else {
      errorEl.textContent = `Setup for "${formatName}" tournaments is coming soon.`;
      errorEl.style.display = 'block';
    }
  });

  // Round History back button
  const backFromHistoryBtn = document.getElementById('back-from-history-btn');
  if (backFromHistoryBtn) {
    backFromHistoryBtn.addEventListener('click', () => {
      sessionStorage.removeItem('best_ball_match_id');
      sessionStorage.removeItem('rabbit_match_id');
      sessionStorage.removeItem('wolf_match_id');
      document.getElementById('round-history-container').style.display = 'none';
      if (currentUser) {
        document.getElementById('user-dashboard').style.display = 'block';
      } else {
        document.getElementById('auth-container').style.display = 'flex';
      }
    });
  }

  // Tournament History back button
  const backFromTournamentHistoryBtn = document.getElementById('back-from-tournament-history-btn');
  if (backFromTournamentHistoryBtn) {
    backFromTournamentHistoryBtn.addEventListener('click', () => {
      document.getElementById('tournament-history-container').style.display = 'none';
      if (currentUser) {
        document.getElementById('user-dashboard').style.display = 'block';
      } else {
        document.getElementById('auth-container').style.display = 'flex';
      }
    });
  }

  // Edit User back button
  const backFromEditUserBtn = document.getElementById('back-from-edit-user-btn');
  if (backFromEditUserBtn) {
    backFromEditUserBtn.addEventListener('click', () => {
      document.getElementById('edit-user-container').style.display = 'none';
      if (currentUser) {
        document.getElementById('user-dashboard').style.display = 'block';
      } else {
        document.getElementById('auth-container').style.display = 'flex';
      }
    });
  }

  // Edit User form submission
  // ── Save Profile ──────────────────────────────────────────────────────────
  const saveProfileBtn = document.getElementById('save-profile-btn');
  if (saveProfileBtn) {
    saveProfileBtn.addEventListener('click', async () => {
      const msgEl     = document.getElementById('edit-user-message');
      const firstName = document.getElementById('edit-first-name').value.trim();
      const lastName  = document.getElementById('edit-last-name').value.trim();
      const email     = document.getElementById('edit-email').value.trim();
      const handicap  = parseFloat(document.getElementById('edit-handicap').value) || 0;

      msgEl.style.display = 'none';
      if (!firstName || !lastName || !email) {
        msgEl.textContent   = 'First name, last name, and email are required.';
        msgEl.style.color   = '#c00';
        msgEl.style.display = 'block';
        return;
      }

      saveProfileBtn.disabled    = true;
      saveProfileBtn.textContent = 'Saving…';
      try {
        const res  = await fetch(`${API_BASE_URL}/api/update_account.php`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ first_name: firstName, last_name: lastName, email, handicap }),
          credentials: 'include',
        });
        const data = await res.json();
        if (data.success) {
          currentUser.first_name = firstName;
          currentUser.last_name  = lastName;
          currentUser.email      = email;
          currentUser.handicap   = handicap;
          document.getElementById('user-header-name').textContent = `${firstName} ${lastName}`;
          // Refresh the read-only display and close the modal
          document.getElementById('profile-display-first-name').textContent = firstName;
          document.getElementById('profile-display-last-name').textContent  = lastName;
          document.getElementById('profile-display-email').textContent      = email;
          document.getElementById('profile-display-handicap').textContent   = parseFloat(handicap).toFixed(1);
          msgEl.textContent   = '✓ Profile saved.';
          msgEl.style.color   = '#2e7d32';
          msgEl.style.display = 'block';
          setTimeout(() => {
            const modal = document.getElementById('edit-profile-modal');
            if (modal) modal.style.display = 'none';
          }, 1000);
        } else {
          msgEl.textContent   = data.error || 'Save failed.';
          msgEl.style.color   = '#c00';
          msgEl.style.display = 'block';
        }
      } catch {
        msgEl.textContent   = 'Connection error. Please try again.';
        msgEl.style.color   = '#c00';
        msgEl.style.display = 'block';
      }
      saveProfileBtn.disabled    = false;
      saveProfileBtn.textContent = 'Save Profile';
    });
  }

  // ── Change Password ────────────────────────────────────────────────────────
  const savePasswordBtn = document.getElementById('save-password-btn');
  if (savePasswordBtn) {
    savePasswordBtn.addEventListener('click', async () => {
      const msgEl          = document.getElementById('change-password-message');
      const currentPw      = document.getElementById('current-password').value;
      const newPw          = document.getElementById('new-password').value;
      const confirmPw      = document.getElementById('confirm-new-password').value;

      msgEl.style.display = 'none';
      if (!currentPw || !newPw || !confirmPw) {
        msgEl.textContent   = 'All password fields are required.';
        msgEl.style.color   = '#c00';
        msgEl.style.display = 'block';
        return;
      }
      if (newPw.length < 8) {
        msgEl.textContent   = 'New password must be at least 8 characters.';
        msgEl.style.color   = '#c00';
        msgEl.style.display = 'block';
        return;
      }
      if (newPw !== confirmPw) {
        msgEl.textContent   = 'New passwords do not match.';
        msgEl.style.color   = '#c00';
        msgEl.style.display = 'block';
        return;
      }

      savePasswordBtn.disabled    = true;
      savePasswordBtn.textContent = 'Saving…';
      try {
        const res  = await fetch(`${API_BASE_URL}/api/change_password.php`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ current_password: currentPw, new_password: newPw }),
          credentials: 'include',
        });
        const data = await res.json();
        if (data.success) {
          ['current-password', 'new-password', 'confirm-new-password'].forEach(id => {
            document.getElementById(id).value = '';
          });
          msgEl.textContent   = '✓ Password changed.';
          msgEl.style.color   = '#2e7d32';
          msgEl.style.display = 'block';
          // Close modal after a brief moment so user sees the success message
          setTimeout(() => {
            const modal = document.getElementById('change-password-modal');
            if (modal) modal.style.display = 'none';
          }, 1200);
        } else {
          msgEl.textContent   = data.error || 'Could not change password.';
          msgEl.style.color   = '#c00';
          msgEl.style.display = 'block';
        }
      } catch {
        msgEl.textContent   = 'Connection error. Please try again.';
        msgEl.style.color   = '#c00';
        msgEl.style.display = 'block';
      }
      savePasswordBtn.disabled    = false;
      savePasswordBtn.textContent = 'Change Password';
    });
  }

  // Delete Account
  const deleteAccountBtn = document.getElementById('delete-account-btn');
  const deleteAccountConfirm = document.getElementById('delete-account-confirm');
  const deleteAccountConfirmBtn = document.getElementById('delete-account-confirm-btn');
  const deleteAccountCancelBtn = document.getElementById('delete-account-cancel-btn');

  if (deleteAccountBtn) {
    deleteAccountBtn.addEventListener('click', () => {
      deleteAccountConfirm.style.display = 'block';
      deleteAccountBtn.style.display = 'none';
    });
  }

  if (deleteAccountCancelBtn) {
    deleteAccountCancelBtn.addEventListener('click', () => {
      deleteAccountConfirm.style.display = 'none';
      deleteAccountBtn.style.display = 'block';
    });
  }

  if (deleteAccountConfirmBtn) {
    deleteAccountConfirmBtn.addEventListener('click', () => {
      deleteAccountConfirmBtn.disabled = true;
      deleteAccountConfirmBtn.textContent = 'Deleting…';

      fetch(`${API_BASE_URL}/api/delete_golfer.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ golfer_id: currentUser.golfer_id }),
        credentials: 'include'
      })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            localStorage.removeItem('sb_golfer');
            currentUser = null;
            document.getElementById('edit-user-container').style.display = 'none';
            document.getElementById('user-header-bar').style.display = 'none';
            document.getElementById('pin-container').style.display = 'flex';
          } else {
            deleteAccountConfirmBtn.disabled = false;
            deleteAccountConfirmBtn.textContent = 'Yes, Delete My Account';
            alert('Error deleting account: ' + (data.error || 'Please try again.'));
          }
        })
        .catch(() => {
          deleteAccountConfirmBtn.disabled = false;
          deleteAccountConfirmBtn.textContent = 'Yes, Delete My Account';
          alert('Connection error. Please try again.');
        });
    });
  }

  // Round Type Selector event handlers
  const continueRoundTypeBtn = document.getElementById('continue-round-type-btn');
  if (continueRoundTypeBtn) {
    continueRoundTypeBtn.addEventListener('click', () => {
      const roundTypeSelect = document.getElementById('round-type-select');
      const selectedType = roundTypeSelect.value;

      if (!selectedType) {
        alert('Please select a round type');
        return;
      }

      // Hide round type selector
      document.getElementById('quick-round-type-selector').style.display = 'none';

      // Load the appropriate setup
      if (selectedType === 'best-ball') {
        loadBestBallSetup();
      } else if (selectedType === 'rabbit') {
        loadRabbitSetup();
      } else if (selectedType === 'wolf') {
        loadWolfSetup();
      }
    });
  }

  const cancelRoundTypeBtn = document.getElementById('cancel-round-type-btn');
  if (cancelRoundTypeBtn) {
    cancelRoundTypeBtn.addEventListener('click', () => {
      document.getElementById('quick-round-type-selector').style.display = 'none';
      document.getElementById('user-dashboard').style.display = 'block';
    });
  }

  const backFromRoundTypeBtn = document.getElementById('back-from-round-type-btn');
  if (backFromRoundTypeBtn) {
    backFromRoundTypeBtn.addEventListener('click', () => {
      document.getElementById('quick-round-type-selector').style.display = 'none';
      document.getElementById('user-dashboard').style.display = 'block';
    });
  }

  // Add Round form event handlers
  const addRoundCourseSelect = document.getElementById('add-round-course');
  if (addRoundCourseSelect) {
    addRoundCourseSelect.addEventListener('change', function() {
      const courseId = this.value;
      const teesSelect = document.getElementById('add-round-tees');

      if (!courseId) {
        teesSelect.innerHTML = '<option value="">-- Select Tees --</option>';
        return;
      }

      // Load tees for selected course
      fetch(`${API_BASE_URL}/api/get_course_tees.php?course_id=${courseId}`, {
        credentials: 'include'
      })
        .then(res => res.json())
        .then(data => {
          teesSelect.innerHTML = '<option value="">-- Select Tees --</option>';
          if (data.tees && data.tees.length > 0) {
            data.tees.forEach(tee => {
              const option = document.createElement('option');
              option.value = tee.tee_id;
              option.textContent = `${tee.tee_name} (${tee.slope}/${tee.rating}, ${tee.yardage} yds)`;
              teesSelect.appendChild(option);
            });
          } else {
            teesSelect.innerHTML = '<option value="">No tees available</option>';
          }
        })
        .catch(err => {
          console.error('Error loading tees:', err);
          teesSelect.innerHTML = '<option value="">Error loading tees</option>';
        });
    });
  }

  // Reads and validates the Round Info form, returns a roundData object or null
  async function prepareRoundData() {
    const tournamentId = sessionStorage.getItem('add_round_tournament_id');
    const roundDate = document.getElementById('add-round-date').value;
    const courseId = document.getElementById('add-round-course').value;
    const teeId = document.getElementById('add-round-tees').value;

    if (!roundDate || !courseId || !teeId) {
      alert('Please fill in all fields');
      return null;
    }

    const courseSelect = document.getElementById('add-round-course');
    const courseName = courseSelect.options[courseSelect.selectedIndex].textContent;
    const teeSelect = document.getElementById('add-round-tees');
    const teeName = teeSelect.options[teeSelect.selectedIndex].textContent.split('(')[0].trim();

    let roundName;
    if (isEditingRound) {
      const existingRound = await fetch(`${API_BASE_URL}/api/rounds.php?round_id=${editingRoundId}`, {
        credentials: 'include'
      }).then(r => r.json());
      const courseChanged = parseInt(courseId) !== parseInt(existingRound.course_id);
      const teesChanged = parseInt(teeId) !== parseInt(existingRound.tee_id);
      if (courseChanged || teesChanged) {
        const roundNumMatch = existingRound.round_name.match(/^Round (\d+)/);
        const roundNum = roundNumMatch ? roundNumMatch[1] : '1';
        roundName = `Round ${roundNum} at ${courseName}`;
      } else {
        roundName = existingRound.round_name;
      }
    } else {
      const rounds = await fetch(`${API_BASE_URL}/api/rounds.php?tournament_id=${tournamentId}`, {
        credentials: 'include'
      }).then(r => r.json());
      roundName = `Round ${rounds.length + 1} at ${courseName}`;
    }

    return {
      round_id: isEditingRound ? editingRoundId : null,
      tournament_id: parseInt(tournamentId),
      course_id: parseInt(courseId),
      tee_id: parseInt(teeId),
      round_name: roundName,
      round_date: roundDate
    };
  }

  const addRoundForm = document.getElementById('add-round-form');
  if (addRoundForm) {
    addRoundForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      const roundData = await prepareRoundData();
      if (!roundData) return;

      sessionStorage.setItem('pending_round_data', JSON.stringify(roundData));
      document.getElementById('add-round-container').style.display = 'none';

      if (isEditingRound) {
        await loadExistingMatches(roundData.tournament_id, editingRoundId);
      } else {
        showMatchesScreen(roundData.tournament_id);
      }
    });
  }

  // "Save Round" button on Round Info screen — skips matches and tee times entirely
  const saveRoundOnlyBtn = document.getElementById('save-round-only-btn');
  if (saveRoundOnlyBtn) {
    saveRoundOnlyBtn.addEventListener('click', async () => {
      const roundData = await prepareRoundData();
      if (!roundData) return;

      const originalText = saveRoundOnlyBtn.textContent;
      saveRoundOnlyBtn.disabled = true;
      saveRoundOnlyBtn.textContent = isEditingRound ? 'Updating...' : 'Creating...';
      saveRoundOnlyBtn.style.opacity = '0.6';

      try {
        if (isEditingRound) {
          const res = await fetch(`${API_BASE_URL}/api/rounds.php?round_id=${editingRoundId}`, {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(roundData)
          });
          const result = await res.json();
          if (!result.affected_rows && result.affected_rows !== 0) {
            throw new Error('Failed to update round');
          }
        } else {
          const res = await fetch(`${API_BASE_URL}/api/rounds.php`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(roundData)
          });
          const result = await res.json();
          if (!result.inserted_id) {
            throw new Error('Failed to create round');
          }
        }

        saveRoundOnlyBtn.textContent = isEditingRound ? '✓ Updated' : '✓ Created';
        saveRoundOnlyBtn.style.background = '#28a745';
        saveRoundOnlyBtn.style.opacity = '1';

        setTimeout(() => {
          document.getElementById('add-round-container').style.display = 'none';
          document.getElementById('user-dashboard').style.display = 'block';
          sessionStorage.removeItem('add_round_tournament_id');
          isEditingRound = false;
          editingRoundId = null;
          saveRoundOnlyBtn.disabled = false;
          saveRoundOnlyBtn.textContent = originalText;
          saveRoundOnlyBtn.style.background = '#17a2b8';
          if (currentUser) loadUserTournaments(currentUser.golfer_id);
        }, 1000);

      } catch (err) {
        console.error('Error saving round:', err);
        alert('Error saving round. Please try again.');
        saveRoundOnlyBtn.disabled = false;
        saveRoundOnlyBtn.textContent = originalText;
        saveRoundOnlyBtn.style.opacity = '1';
      }
    });
  }

  const backFromEditTournamentBtn = document.getElementById('back-from-edit-tournament-btn');
  if (backFromEditTournamentBtn) {
    backFromEditTournamentBtn.addEventListener('click', () => {
      document.getElementById('edit-tournament-container').style.display = 'none';
      document.getElementById('user-dashboard').style.display = 'block';
    });
  }

  const backFromAddRoundBtn = document.getElementById('back-from-add-round-btn');
  if (backFromAddRoundBtn) {
    backFromAddRoundBtn.addEventListener('click', () => {
      document.getElementById('add-round-container').style.display = 'none';
      document.getElementById('user-dashboard').style.display = 'block';
      sessionStorage.removeItem('add_round_tournament_id');
    });
  }

  const cancelAddRoundBtn = document.getElementById('cancel-add-round-btn');
  if (cancelAddRoundBtn) {
    cancelAddRoundBtn.addEventListener('click', () => {
      document.getElementById('add-round-container').style.display = 'none';
      document.getElementById('user-dashboard').style.display = 'block';
      sessionStorage.removeItem('add_round_tournament_id');
      // Reset editing flags
      isEditingRound = false;
      editingRoundId = null;
    });
  }

  // Matches screen event handlers
  const addMatchBtn = document.getElementById('add-match-btn');
  if (addMatchBtn) {
    addMatchBtn.addEventListener('click', () => {
      addNewMatch();
    });
  }

  const continueToTeeTimesBtn = document.getElementById('continue-to-tee-times-btn');
  if (continueToTeeTimesBtn) {
    continueToTeeTimesBtn.addEventListener('click', async () => {
      // Check for duplicate players across all matches/groups (ignoring empty slots)
      const _checkFormatId = parseInt(sessionStorage.getItem('add_round_format_id'));
      const allPlayers = [];
      matchesData.forEach(match => {
        const slots = _checkFormatId === 5
          ? (match.players || [])
          : [match.team1_player1, match.team1_player2, match.team2_player1, match.team2_player2];
        slots.filter(p => p).forEach(p => allPlayers.push(p));
      });
      const uniquePlayers = new Set(allPlayers);
      if (uniquePlayers.size !== allPlayers.length) {
        alert('A player cannot be in multiple groups. Please check your selections.');
        return;
      }

      // Move to tee times screen
      document.getElementById('add-matches-container').style.display = 'none';

      if (isEditingRound) {
        await loadExistingTeeTimes();
      } else {
        showTeeTimesScreen();
      }
    });
  }

  const backFromMatchesBtn = document.getElementById('back-from-matches-btn');
  if (backFromMatchesBtn) {
    backFromMatchesBtn.addEventListener('click', () => {
      document.getElementById('add-matches-container').style.display = 'none';
      document.getElementById('add-round-container').style.display = 'block';
    });
  }

  const cancelMatchesBtn = document.getElementById('cancel-matches-btn');
  if (cancelMatchesBtn) {
    cancelMatchesBtn.addEventListener('click', () => {
      document.getElementById('add-matches-container').style.display = 'none';
      document.getElementById('user-dashboard').style.display = 'block';
      sessionStorage.removeItem('add_round_tournament_id');
      sessionStorage.removeItem('pending_round_data');
      // Reset editing flags
      isEditingRound = false;
      editingRoundId = null;
    });
  }

  // Tee Times screen event handlers
  const addTeeTimeBtn = document.getElementById('add-tee-time-btn');
  if (addTeeTimeBtn) {
    addTeeTimeBtn.addEventListener('click', () => {
      addNewTeeTime();
    });
  }

  // Shared save logic used by both "Save Round" buttons (matches screen and tee times screen)
  async function performSave(includeTeeTimes) {
    const roundData = JSON.parse(sessionStorage.getItem('pending_round_data'));
    let roundId;
    let matchesResult = { success: true, id_mapping: {} };

    // Step 1: Create or update the round
    if (isEditingRound) {
      const updateResponse = await fetch(`${API_BASE_URL}/api/rounds.php?round_id=${editingRoundId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(roundData)
      });
      const updateResult = await updateResponse.json();
      if (!updateResult.affected_rows && updateResult.affected_rows !== 0) {
        throw new Error('Failed to update round');
      }
      roundId = editingRoundId;

      // Only delete existing tee times when we're replacing them with new ones
      if (includeTeeTimes) {
        const existingTeeTimes = await fetch(`${API_BASE_URL}/api/get_tee_time_assignments.php?round_id=${roundId}`, {
          credentials: 'include'
        }).then(r => r.json());
        if (existingTeeTimes.tee_times) {
          for (const tt of existingTeeTimes.tee_times) {
            await fetch(`${API_BASE_URL}/api/delete_tee_time.php?tee_time_id=${tt.tee_time_id}`, {
              method: 'DELETE',
              credentials: 'include'
            });
          }
        }
      }
    } else {
      const roundResponse = await fetch(`${API_BASE_URL}/api/rounds.php`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(roundData)
      });
      const roundResult = await roundResponse.json();
      if (!roundResult.inserted_id) {
        throw new Error('Failed to create round');
      }
      roundId = roundResult.inserted_id;
    }

    // Step 2: Save matches (always call when editing so removed matches get deleted)
    if (isEditingRound || matchesData.length > 0) {
      const saveFormatId = parseInt(sessionStorage.getItem('add_round_format_id'));
      const isSkinsSave  = saveFormatId === 5;

      const matchesPayload = matchesData.map((match, index) => ({
        match_id: match.match_id || null,
        match_name: isSkinsSave ? `Group ${index + 1}` : `Match ${index + 1} in ${roundData.round_name}`,
        golfers: isSkinsSave
          ? (match.players || [])
              .map((id, i) => ({ golfer_id: parseInt(id), team_position: i + 1 }))
              .filter(g => !isNaN(g.golfer_id) && g.golfer_id > 0)
          : [
              { golfer_id: parseInt(match.team1_player1), team_position: 1 },
              { golfer_id: parseInt(match.team1_player2), team_position: 2 },
              { golfer_id: parseInt(match.team2_player1), team_position: 3 },
              { golfer_id: parseInt(match.team2_player2), team_position: 4 }
            ].filter(g => !isNaN(g.golfer_id) && g.golfer_id > 0)
      }));

      const matchesResponse = await fetch(`${API_BASE_URL}/api/save_guys_trip_matches.php`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          round_id: roundId,
          tournament_id: roundData.tournament_id,
          matches: matchesPayload
        })
      });

      matchesResult = await matchesResponse.json();
      if (!matchesResult.success) {
        throw new Error('Failed to save matches');
      }
    }

    // Step 3: Save tee times only if requested and any were added
    if (includeTeeTimes && teeTimesData.length > 0) {
      const teeTimeIds = {};
      for (let i = 0; i < teeTimesData.length; i++) {
        const tt = teeTimesData[i];
        const teeTimeResponse = await fetch(`${API_BASE_URL}/api/tee_times.php`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ round_id: roundId, time: `${tt.hour}:${tt.minute}` })
        });
        const teeTimeResult = await teeTimeResponse.json();
        if (teeTimeResult.success && teeTimeResult.tee_time_id) {
          teeTimeIds[tt.tee_time_id] = teeTimeResult.tee_time_id;
        }
      }

      const assignments = [];
      teeTimesData.forEach(tt => {
        if (!teeTimeIds[tt.tee_time_id]) return;
        (tt.match_ids || []).filter(mid => mid).forEach(mid => {
          const matchIndex = parseInt(mid.replace('match-', ''));
          const matchData = matchesData[matchIndex];
          let actualMatchId;
          if (matchData.match_id && !matchData.match_id.toString().startsWith('new-')) {
            actualMatchId = matchData.match_id;
          } else {
            if (matchesResult.id_mapping) {
              const newMatchId = matchesResult.id_mapping[matchData.match_id];
              actualMatchId = newMatchId || Object.values(matchesResult.id_mapping)[matchIndex];
            } else {
              actualMatchId = matchIndex + 1;
            }
          }
          assignments.push({ match_id: actualMatchId, tee_time_id: teeTimeIds[tt.tee_time_id] });
        });
      });

      if (assignments.length > 0) {
        await fetch(`${API_BASE_URL}/api/save_tee_time_assignments.php`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ round_id: roundId, assignments: assignments })
        });
      }
    }

    return { roundId, matchesResult };
  }

  // "Save Round" button on tee times screen (full save including tee times)
  const saveAllBtn = document.getElementById('save-all-btn');
  if (saveAllBtn) {
    saveAllBtn.addEventListener('click', async () => {
      const originalText = saveAllBtn.textContent;
      saveAllBtn.disabled = true;
      saveAllBtn.textContent = isEditingRound ? 'Updating...' : 'Creating...';
      saveAllBtn.style.opacity = '0.6';

      try {
        await performSave(true);

        saveAllBtn.textContent = isEditingRound ? '✓ Updated' : '✓ Created';
        saveAllBtn.style.background = '#28a745';
        saveAllBtn.style.opacity = '1';

        setTimeout(() => {
          document.getElementById('add-tee-times-container').style.display = 'none';
          document.getElementById('user-dashboard').style.display = 'block';
          sessionStorage.removeItem('add_round_tournament_id');
          sessionStorage.removeItem('pending_round_data');
          isEditingRound = false;
          editingRoundId = null;
          saveAllBtn.disabled = false;
          saveAllBtn.textContent = originalText;
          saveAllBtn.style.background = '#4F2185';
          if (currentUser) loadUserTournaments(currentUser.golfer_id);
        }, 1000);

      } catch (err) {
        console.error('Error saving round:', err);
        alert('Error saving round. Please try again.');
        saveAllBtn.disabled = false;
        saveAllBtn.textContent = originalText;
        saveAllBtn.style.opacity = '1';
      }
    });
  }

  // "Save Round (skip tee times)" button on matches screen
  const saveRoundFromMatchesBtn = document.getElementById('save-round-from-matches-btn');
  if (saveRoundFromMatchesBtn) {
    saveRoundFromMatchesBtn.addEventListener('click', async () => {
      // Check for duplicate players across matches/groups (ignoring empty slots)
      if (matchesData.length > 1) {
        const _fmt = parseInt(sessionStorage.getItem('add_round_format_id'));
        const allPlayers = matchesData.flatMap(m =>
          _fmt === 5
            ? (m.players || []).filter(p => p)
            : [m.team1_player1, m.team1_player2, m.team2_player1, m.team2_player2].filter(p => p)
        );
        if (new Set(allPlayers).size !== allPlayers.length) {
          alert('A player cannot be in multiple groups. Please check your selections.');
          return;
        }
      }

      const originalText = saveRoundFromMatchesBtn.textContent;
      saveRoundFromMatchesBtn.disabled = true;
      saveRoundFromMatchesBtn.textContent = isEditingRound ? 'Updating...' : 'Creating...';
      saveRoundFromMatchesBtn.style.opacity = '0.6';

      try {
        await performSave(false);

        saveRoundFromMatchesBtn.textContent = isEditingRound ? '✓ Updated' : '✓ Created';
        saveRoundFromMatchesBtn.style.background = '#28a745';
        saveRoundFromMatchesBtn.style.opacity = '1';

        setTimeout(() => {
          document.getElementById('add-matches-container').style.display = 'none';
          document.getElementById('user-dashboard').style.display = 'block';
          sessionStorage.removeItem('add_round_tournament_id');
          sessionStorage.removeItem('pending_round_data');
          isEditingRound = false;
          editingRoundId = null;
          saveRoundFromMatchesBtn.disabled = false;
          saveRoundFromMatchesBtn.textContent = originalText;
          saveRoundFromMatchesBtn.style.background = '#17a2b8';
          if (currentUser) loadUserTournaments(currentUser.golfer_id);
        }, 1000);

      } catch (err) {
        console.error('Error saving round:', err);
        alert('Error saving round. Please try again.');
        saveRoundFromMatchesBtn.disabled = false;
        saveRoundFromMatchesBtn.textContent = originalText;
        saveRoundFromMatchesBtn.style.opacity = '1';
      }
    });
  }

  const backFromTeeTimesBtn = document.getElementById('back-from-tee-times-btn');
  if (backFromTeeTimesBtn) {
    backFromTeeTimesBtn.addEventListener('click', () => {
      document.getElementById('add-tee-times-container').style.display = 'none';
      document.getElementById('add-matches-container').style.display = 'block';
    });
  }

  const cancelTeeTimesBtn = document.getElementById('cancel-tee-times-btn');
  if (cancelTeeTimesBtn) {
    cancelTeeTimesBtn.addEventListener('click', () => {
      document.getElementById('add-tee-times-container').style.display = 'none';
      document.getElementById('user-dashboard').style.display = 'block';
      sessionStorage.removeItem('add_round_tournament_id');
      sessionStorage.removeItem('pending_round_data');
      // Reset editing flags
      isEditingRound = false;
      editingRoundId = null;
    });
  }
});

//logout button
document.getElementById('logout-button').addEventListener('click', () => {
  stopSessionHeartbeat();
  fetch(`${API_BASE_URL}/api/logout.php`, {
    method: 'POST',
    credentials: 'include'
  }).then(() => {
    sessionStorage.clear();

    // Hide all containers
    document.getElementById('app-content').style.display = 'none';
    document.getElementById('round-history-container').style.display = 'none';
    document.getElementById('best-ball-setup').style.display = 'none';
    document.getElementById('user-dashboard').style.display = 'none';
    document.getElementById('tournament-history-container').style.display = 'none';
    document.getElementById('edit-user-container').style.display = 'none';
    document.getElementById('user-header-bar').style.display = 'none';

    // Show auth container
    document.getElementById('auth-container').style.display = 'flex';

    // Reset form and user
    document.getElementById('auth-form').reset();
    document.getElementById('new-golfer-form').style.display = 'none';
    currentUser = null;
  });
});




