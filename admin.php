<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">

  <title>Sandbagger Scoring - Admin</title>
  <link rel="stylesheet" href="/css/admin.css">
  <link rel="icon" href="/favicon.png" type="image/png">


</head>
<body>

  <!-- 1) Header with top‐level nav -->
  <header class="admin-header">
    <div class="brand">Sandbagger Scoring Admin</div>
    <nav class="top-nav">
      <button data-section="tournaments" class="nav-btn active">Tournaments</button>
      <button data-section="golfers"    class="nav-btn">Golfers</button>
      <button data-section="courses"    class="nav-btn">Courses</button>
      <!-- add more as you build -->
    </nav>

  </header>

  <!-- 2) Main content area, sections shown/hidden by JS -->
  <main class="admin-main">
    
    <!-- Tournaments Section -->
    <section id="section-tournaments" class="admin-section">




      <!-- List of existing tournaments -->
      <table id="tourney-list" class="admin-table">
      <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Dates</th>
            <th>HCP %</th>
            <th>Format</th>
            <th>Rounds</th>
            <th>Golfers</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <!-- JS will inject rows here -->
        </tbody>
      </table>

      <button id="open-tourney-modal" class="btn-primary">
        + Create New Tournament
      </button>
    </section>
    
    <!-- create new tournament modal -->

    <!-- Modal Overlay -->
    <div id="tourney-modal" class="modal hidden">
      <div class="modal-backdrop"></div>
      <div class="modal-content">
        <button class="modal-close">&times;</button>
        <h2>Create New Tournament</h2>
        <form id="tourney-create-modal-form" class="admin-form">
          <div class="form-row">
            <label for="m-t-name">Tournament Name</label>
            <input type="text" id="m-t-name" required>
          </div>
          <div class="form-row">
            <label for="m-t-start">Start Date</label>
            <input type="date" id="m-t-start" required>
          </div>
          <div class="form-row">
            <label for="m-t-end">End Date</label>
            <input type="date" id="m-t-end" required>
          </div>
          <div class="form-row">
            <label for="m-t-hcp">Handicap %</label>
            <input type="number" id="m-t-hcp" value="80" required>
          </div>
          <div class="form-row">
            <label for="m-t-format">Format</label>
            <select id="m-t-format" required>
              <option value="">-- Choose Format --</option>
            </select>
          </div>

          <div class="form-actions">
            <button type="submit" class="btn-primary">Create</button>
            <button type="button" class="btn-secondary modal-close">Cancel</button>
          </div>
        </form>
      </div>
    </div>



    <!-- Placeholder for Golfers Section -->
<section id="section-golfers" class="admin-section" hidden>




  <!-- Golfers List -->
  <table id="golfer-list" class="admin-table">
    <thead>
      <tr>
        <th>ID</th>
        <th>First Name</th>
        <th>Last Name</th>
        <th>Handicap</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      <!-- injected by JS -->
    </tbody>
  </table>

      <button id="open-golfer-modal" class="btn-primary">
        + Create New Golfer
      </button>

    <!-- Create Golfer Form -->
     <div id="golfer-modal" class="modal hidden">
      <div class="modal-backdrop"></div>
      <div class="modal-content">
        <button class="modal-close">&times;</button>
        <h2>Create New Golfer</h2>
        <form id="golfer-create-form" class="admin-form">
          <div class="form-row">
            <label for="g-first-name">First Name</label>
            <input type="text" id="g-first-name" required>
          </div>
          <div class="form-row">
            <label for="g-last-name">Last Name</label>
            <input type="text" id="g-last-name" required>
          </div>
          <div class="form-row">
            <label for="g-handicap">Handicap</label>
            <input type="number" id="g-handicap" step="0.1" required>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn-primary">Create</button>
            <button type="button" class="btn-secondary modal-close">Cancel</button>
          </div>
        </form>
      </div>


</section>


    <!-- Placeholder for Courses Section -->
<section id="section-courses" class="admin-section" hidden>




  <!-- Courses List -->
  <table id="course-list" class="admin-table">
    <thead>
      <tr>
        <th>ID</th>
        <th>Name</th>
        <th>Par</th>
        <th>Tees</th>
        <th>Slope</th>
        <th>Rating</th>
        <th>Yardage</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      <!-- injected by JS -->
    </tbody>
  </table>

    <button id="open-course-modal" class="btn-primary">
    + Create New Course
  </button>

  <div id="course-modal" class="modal hidden">
    <div class="modal-backdrop"></div>
    <div class="modal-content">
      <button class="modal-close">&times;</button>
      <h2>Create New Course</h2>
      <form id="course-create-form" class="admin-form">
        <div class="form-row">
          <label for="c-name">Course Name</label>
          <input type="text" id="c-name" required>
        </div>
        <div class="form-row">
          <label for="c-par-total">Par Total</label>
          <input type="number" id="c-par-total" required>
        </div>
        <div class="form-row">
          <label for="c-tees">Tees</label>
          <input type="text" id="c-tees" required>
        </div>
        <div class="form-row">
          <label for="c-slope">Slope</label>
          <input type="number" id="c-slope" required>
        </div>
        <div class="form-row">
          <label for="c-rating">Rating</label>
          <input type="number" step="0.01" id="c-rating" required>
        </div>
        <div class="form-row">
          <label for="c-yardage">Total Yardage</label>
          <input type="number" id="c-yardage" required>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn-primary">Create</button>
          <button type="button" class="btn-secondary modal-close">Cancel</button>
        </div>
      </form>



  </div>


</section>

<!-- Tournament Detail Section -->
<section id="section-tourney-detail" class="admin-section" hidden>
  <h2 id="detail-title" class="tourney-head">Tournament</h2>


  <!-- Sub-nav for this tournament -->
  <nav class="sub-nav">
    <button data-tab="teams" class="tab-btn active">Team Setup</button>
    <button data-tab="roster" class="tab-btn">Rosters</button>
    <button data-tab="rounds" class="tab-btn">Rounds</button>
    <button data-tab="settings" class="tab-btn">Settings</button>
    <!-- add more as you build -->
  </nav>

  <!-- Teams tab -->
   <div id="tab-teams" class="tab-content">

    <div class="actions">
      <button id="newTeamBtn" class="btn-primary">New Team</button>
    </div>

    <!-- Teams Table -->
    <table id="teams-table" class="admin-table">
      <thead>
        <tr>
          <th>Team Name</th>
          <th>Color</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        <!-- JS will inject rows here -->
      </tbody>
    </table>
  </div>

 
  <!-- Roster tab -->
  <div id="tab-roster" class="tab-content" hidden>
        <div id="actions" class="actions">
          <button id="saveBtn" class="btn-primary">Save Assignments</button>
        </div>
        

          <div class="zones">
          <!-- Available golfers box -->
          <div id="available" class="zone">
              <h3>Unassigned golfers</h3>
              <div class="cards-container">
              <!-- JS will inject .card items here -->
              </div>
          </div>

          <!-- Team A box -->
          <div id="teamA" class="zone" data-team-id="">
              <h3 id="teamATitle">Team A</h3>
              <div class="cards-container">
              <!-- JS will inject .card items here -->
              </div>
          </div>

          <!-- Team B box -->
          <div id="teamB" class="zone" data-team-id="">
              <h3 id="teamBTitle">Team B</h3>
              <div class="cards-container">
              <!-- JS will inject .card items here -->
              </div>
          </div>
          </div>


  </div>

  <!-- Rounds tab -->
  <div id="tab-rounds" class="tab-content" hidden>

    <div class="actions">
      <button id="newRoundBtn" class="btn-primary">New Round</button>
    </div>


  <!-- Rounds Table -->
  <table id="rounds-table" class="admin-table">
    <thead>
      <tr>
        <th>Round Date</th>
        <th>Round Name</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      <!-- JS will inject rows here -->
    </tbody>
  </table>
</div>

<div id="round-modal" class="modal hidden">
  <div class="modal-backdrop"></div>
  <div class="modal-content">
    <button class="modal-close">&times;</button>
    <h2>Create New Round</h2>
    <form id="round-create-form" class="admin-form">
      <div class="form-row">
        <label for="r-date">Round Date</label>
        <input type="date" id="r-date" required>
      </div>
      <div class="form-row">
        <label for="r-course">Course</label>
        <select id="r-course" required>
          <option value="">-- Select Course --</option>
        </select>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn-primary">Create</button>
        <button type="button" class="btn-secondary modal-close">Cancel</button>
      </div>
    </form>
  </div>
</div>

<!-- Matches tab -->
<div id="tab-matches" class="tab-content" hidden>
  <h2 id="matches-title">Match Editor</h2>
  <h2 id="roundTitle">Round Title</h2>
  <div class="actions">
    <button id="newMatchBtn" class="btn-primary">New Match</button>
    <button id="saveAllBtn" class="btn-primary">Save All Matches</button>
  </div>

  <div class="pools-wrapper">
    <h2>Available Golfers</h2>
    <div id="pools" class="container"></div>
  </div>
  <div id="board" class="board"></div>
</div>





  <!-- Settings tab -->
  <div id="tab-settings" class="tab-content" hidden>

    <!-- e.g. checkbox for skins_enabled -->
    <label>
      <input type="checkbox" id="setting-skins"> Enable Skins
    </label>
    <!-- more settings… -->
    <button id="settings-save-btn">Save Settings</button>
  </div>




  </main>
  <script src="https://cdn.jsdelivr.net/npm/sortablejs@1.14.0/Sortable.min.js"></script>
  <script src="/js/admin.js"></script>

  <script src="/js/assign_matches.js"></script>

</body>
</html>
