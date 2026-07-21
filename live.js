// live.js — public spectator page. Read-only; all data comes from
// api/live_tournament.php keyed by a tournament share code. The scoring
// helpers below are de-globalized copies of the app's (script.js) so the
// match status text here matches what players see in the app.

(function () {
  const POLL_MS = 60000;

  const state = {
    code: null,
    data: null,
    lastFetched: null,
    pollTimer: null,
    tickTimer: null,
  };

  // ── Scoring helpers (ported from script.js, parameterized) ──────────────

  // Manual handicap mode uses a sentinel pct < 0: entered handicaps are used
  // verbatim with no slope/rating math (mirrors calculatePlayingHandicap).
  function calcPlayingHandicap(handicap, slope, rating, pct) {
    if (parseFloat(pct) < 0) return parseFloat(handicap) || 0;
    if (!slope || !rating || !pct) return 0;
    const courseHandicap = (handicap * (slope / 113)) + (rating - 72);
    return Math.round((courseHandicap * pct / 100) * 10) / 10;
  }

  function buildStrokeMapForGolfer(golferHandicap, holeData) {
    const strokeMap = {};
    for (const hole of holeData) {
      const index = hole.handicap_index;
      let strokes = 0;
      if (golferHandicap >= 0) {
        if (golferHandicap >= index) strokes = 1;
        if (golferHandicap > 18 && golferHandicap - 18 >= index) strokes = 2;
      } else {
        const absHcp = Math.abs(golferHandicap);
        if (index > 18 - absHcp) strokes = -1;
      }
      strokeMap[hole.hole_number] = strokes;
    }
    return strokeMap;
  }

  // Ported from computeTeamMatchStatus; holes/slope/rating come from the
  // match's own round instead of globals.
  function computeMatchStatus(teamA, teamB, aGolfers, bGolfers, scores, round) {
    const allGolfers = aGolfers.concat(bGolfers);
    if (allGolfers.length === 0 || !round.holes.length) {
      return { text: 'No scores yet', leadColor: null };
    }

    const strokeMaps = {};
    const matchHcps = allGolfers.map(g =>
      calcPlayingHandicap(g.handicap, round.slope, round.rating, g.handicap_pct));
    const minHcp = Math.min(...matchHcps);
    allGolfers.forEach((g, i) => {
      strokeMaps[g.golfer_id] = buildStrokeMapForGolfer(matchHcps[i] - minHcp, round.holes);
    });

    const byHole = {};
    scores.forEach(s => {
      const hole = parseInt(s.hole_number);
      const g = allGolfers.find(x => x.golfer_id == s.golfer_id);
      if (!g || !strokeMaps[g.golfer_id]) return;
      const net = parseInt(s.strokes) - (strokeMaps[g.golfer_id][hole] || 0);
      if (!byHole[hole]) byHole[hole] = { a: [], b: [] };
      if (g.team_name === teamA.name) byHole[hole].a.push(net);
      else if (g.team_name === teamB.name) byHole[hole].b.push(net);
    });

    let differential = 0;
    let holesPlayed = 0;
    for (let i = 1; i <= 18; i++) {
      const h = byHole[i];
      if (!h || h.a.length === 0 || h.b.length === 0) continue;
      const aBest = Math.min(...h.a);
      const bBest = Math.min(...h.b);
      if (!isFinite(aBest) || !isFinite(bBest)) continue;
      holesPlayed++;
      if (aBest < bBest) differential++;
      else if (bBest < aBest) differential--;

      const holesRemaining = 18 - holesPlayed;
      if (Math.abs(differential) > holesRemaining) {
        const winner = differential > 0 ? teamA : teamB;
        return {
          text: `Team ${winner.name} wins ${Math.abs(differential)}&${holesRemaining}`,
          leadColor: winner.color,
        };
      }
    }

    if (holesPlayed === 0) return { text: 'No scores yet', leadColor: null };
    if (differential === 0) {
      return {
        text: holesPlayed === 18 ? 'Match Halved' : `Tied – Thru ${holesPlayed}`,
        leadColor: null,
      };
    }
    const leader = differential > 0 ? teamA : teamB;
    return {
      text: `Team ${leader.name} up ${Math.abs(differential)} – Thru ${holesPlayed}`,
      leadColor: leader.color,
    };
  }

  function pickContrastColor(hex) {
    if (!hex) return '#fff';
    let h = hex.replace(/^#/, '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const v = parseInt(h, 16);
    const brightness = (((v >> 16) & 255) * 299 + ((v >> 8) & 255) * 587 + (v & 255) * 114) / 1000;
    return brightness > 155 ? '#000' : '#fff';
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ── Data fetching / polling ──────────────────────────────────────────────

  async function fetchLive(code, { fromEntry = false } = {}) {
    let res;
    try {
      res = await fetch(`api/live_tournament.php?code=${encodeURIComponent(code)}`);
    } catch (e) {
      if (fromEntry) showCodeError('Could not reach the server. Try again.');
      else document.getElementById('reconnecting').style.display = 'inline';
      return false;
    }

    if (res.status === 404) {
      if (fromEntry) {
        showCodeError("That code wasn't found. Double-check it with your group.");
      } else {
        stopPolling();
        showSection('code-entry');
        showCodeError('Live sharing has been turned off for this tournament.');
      }
      return false;
    }
    if (!res.ok) {
      if (fromEntry) showCodeError('Something went wrong. Try again.');
      else document.getElementById('reconnecting').style.display = 'inline';
      return false;
    }

    state.data = await res.json();
    state.code = code;
    state.lastFetched = Date.now();
    document.getElementById('reconnecting').style.display = 'none';
    renderLive();
    return true;
  }

  function startPolling() {
    stopPolling();
    state.pollTimer = setInterval(() => {
      if (!document.hidden) fetchLive(state.code);
    }, POLL_MS);
    state.tickTimer = setInterval(updateAgo, 1000);
  }

  function stopPolling() {
    if (state.pollTimer) clearInterval(state.pollTimer);
    if (state.tickTimer) clearInterval(state.tickTimer);
    state.pollTimer = state.tickTimer = null;
  }

  function updateAgo() {
    if (!state.lastFetched) return;
    const s = Math.round((Date.now() - state.lastFetched) / 1000);
    document.getElementById('updated-ago').textContent =
      s < 5 ? 'Updated just now' : s < 60 ? `Updated ${s}s ago` : `Updated ${Math.floor(s / 60)}m ago`;
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.code && state.data) fetchLive(state.code);
  });

  // ── Views ────────────────────────────────────────────────────────────────

  function showSection(id) {
    for (const s of ['code-entry', 'live-view', 'scorecard-view']) {
      document.getElementById(s).style.display = s === id ? 'block' : 'none';
    }
    window.scrollTo(0, 0);
  }

  function showCodeError(msg) {
    document.getElementById('code-error').textContent = msg;
  }

  function formatDates(t) {
    const opts = { month: 'short', day: 'numeric' };
    const parse = d => { const [y, m, dd] = d.split('-'); return new Date(y, m - 1, dd); };
    if (!t.start_date) return '';
    const start = parse(t.start_date).toLocaleDateString(undefined, opts);
    if (!t.end_date || t.end_date === t.start_date) return start;
    return `${start} – ${parse(t.end_date).toLocaleDateString(undefined, opts)}`;
  }

  function formatTeeTime(timeStr) {
    let [hour, minute] = timeStr.split(':').map(Number);
    hour = hour % 12 || 12;
    return `${hour}:${String(minute).padStart(2, '0')}`;
  }

  // Derive the two teams present in a match from its own golfer list
  function matchTeams(match) {
    const teams = [];
    match.golfers.forEach(g => {
      if (g.team_name && !teams.some(t => t.name === g.team_name)) {
        teams.push({ name: g.team_name, color: g.team_color || '#6b7280', id: g.team_id });
      }
    });
    return teams;
  }

  function renderLive() {
    const d = state.data;
    document.getElementById('t-name').textContent = d.tournament.name;
    document.getElementById('t-dates').textContent =
      [formatDates(d.tournament), d.tournament.format_name].filter(Boolean).join(' · ');
    updateAgo();

    const body = document.getElementById('live-body');
    body.innerHTML = '';

    const hasTeams = d.teams.length >= 2;
    if (hasTeams) body.appendChild(renderTeamBanner(d.teams));
    body.appendChild(renderMatchups(d, hasTeams));
    if (d.gross_leaderboard.length) {
      body.appendChild(renderLeaderboard('Leaderboard — Gross', d.gross_leaderboard, 'gross'));
    }
    if (d.net_leaderboard.length) {
      body.appendChild(renderLeaderboard('Leaderboard — Net', d.net_leaderboard, 'net'));
    }

    if (document.getElementById('scorecard-view').style.display !== 'block') {
      showSection('live-view');
    }
  }

  function renderTeamBanner(teams) {
    const banner = document.createElement('div');
    banner.className = 'team-banner';
    teams.forEach(team => {
      const div = document.createElement('div');
      div.className = 'team';
      div.style.background = team.color_hex || '#6b7280';
      div.style.color = pickContrastColor(team.color_hex);
      div.innerHTML = `
        <div class="tname">${esc(team.name)}</div>
        <div class="tpoints">${team.total_points}</div>
        <div class="tplayers">${team.golfers.map(g => esc(g.first_name)).join(' · ')}</div>`;
      banner.appendChild(div);
    });
    return banner;
  }

  function renderMatchups(d, hasTeams) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `<h2 class="section-title">${hasTeams ? 'Matches' : 'Groups'}</h2>
      <p class="section-hint">Tap a ${hasTeams ? 'match' : 'group'} to see the full scorecard.</p>`;

    d.rounds.forEach(round => {
      const block = document.createElement('div');
      block.className = 'round-block';
      const dateStr = round.round_date
        ? (() => { const [y, m, dd] = round.round_date.split('-');
                   return new Date(y, m - 1, dd).toLocaleDateString(undefined, { month: 'long', day: 'numeric' }); })()
        : '';
      block.innerHTML = `
        <h3>${esc(round.round_name)}</h3>
        <div class="course-line">${[dateStr, round.course_name && esc(round.course_name)].filter(Boolean).join(' · ')}</div>`;

      let any = false;
      round.tee_times.forEach(tt => {
        if (!tt.matches.length) return;
        any = true;
        const label = document.createElement('div');
        label.className = 'tee-time-label';
        label.textContent = formatTeeTime(tt.time);
        block.appendChild(label);
        tt.matches.forEach(match => block.appendChild(renderMatchRow(match, round, hasTeams)));
      });
      if (!any) {
        const p = document.createElement('div');
        p.className = 'course-line';
        p.textContent = 'Matchups not yet assigned';
        block.appendChild(p);
      }
      card.appendChild(block);
    });
    return card;
  }

  function renderMatchRow(match, round, hasTeams) {
    const row = document.createElement('div');
    row.className = 'match-row';

    const teams = matchTeams(match);
    let statusHtml = '';
    let pairingHtml = '';

    if (hasTeams && teams.length === 2) {
      const [teamA, teamB] = teams;
      const aGolfers = match.golfers.filter(g => g.team_name === teamA.name);
      const bGolfers = match.golfers.filter(g => g.team_name === teamB.name);

      pairingHtml = `
        <div class="pairing">
          <span class="side" style="color:${esc(teamA.color)}">${aGolfers.map(g => esc(g.first_name)).join(' & ')}</span>
          <span class="vs">vs</span>
          <span class="side right" style="color:${esc(teamB.color)}">${bGolfers.map(g => esc(g.first_name)).join(' & ')}</span>
        </div>`;

      // Final result recorded? Show it; otherwise live status from hole scores.
      const t1 = match.results.find(r => r.team_id == teamA.id);
      const t2 = match.results.find(r => r.team_id == teamB.id);
      if (t1 && t2) {
        let text, color;
        if (t1.points > t2.points) { text = `Team ${teamA.name} wins`; color = teamA.color; }
        else if (t2.points > t1.points) { text = `Team ${teamB.name} wins`; color = teamB.color; }
        else { text = 'Match Halved'; color = null; }
        statusHtml = chip(text, color);
      } else {
        const status = computeMatchStatus(teamA, teamB, aGolfers, bGolfers, match.hole_scores, round);
        statusHtml = chip(status.text, status.leadColor);
      }
    } else {
      pairingHtml = `
        <div class="pairing">
          <span class="side">${match.golfers.map(g => esc(g.first_name)).join(' · ')}</span>
        </div>`;
    }

    row.innerHTML = pairingHtml + statusHtml;
    row.addEventListener('click', () => showScorecard(match, round));
    return row;
  }

  function chip(text, color) {
    if (text === 'No scores yet') return `<span class="status-chip none">${esc(text)}</span>`;
    if (!color) return `<span class="status-chip">${esc(text)}</span>`;
    return `<span class="status-chip" style="background:${esc(color)};color:${pickContrastColor(color)}">${esc(text)}</span>`;
  }

  function renderLeaderboard(title, entries, kind) {
    const card = document.createElement('div');
    card.className = 'card';

    const rows = entries
      .filter(e => e.holes_played > 0)
      .map(e => ({ ...e, toPar: (kind === 'gross' ? e.strokes : e.net_strokes) - e.par }))
      .sort((a, b) => a.toPar - b.toPar);

    let html = `<h2 class="section-title">${esc(title)}</h2>`;
    if (!rows.length) {
      html += `<div class="course-line">No scores yet</div>`;
      card.innerHTML = html;
      return card;
    }

    html += `<table class="lb"><thead><tr>
      <th>#</th><th>Player</th><th class="num">To Par</th><th class="num">Thru</th>
    </tr></thead><tbody>`;
    rows.forEach((e, i) => {
      const toPar = e.toPar === 0 ? 'E' : (e.toPar > 0 ? `+${e.toPar}` : `${e.toPar}`);
      const dot = e.team_color
        ? `<span class="team-dot" style="background:${esc(e.team_color)}"></span>` : '';
      html += `<tr>
        <td>${i + 1}</td>
        <td>${dot}${esc(e.name)}</td>
        <td class="num">${toPar}</td>
        <td class="num">${e.holes_played}</td>
      </tr>`;
    });
    html += '</tbody></table>';
    card.innerHTML = html;
    return card;
  }

  // ── Scorecard drill-down (rendered from already-fetched data) ────────────

  function showScorecard(match, round) {
    const body = document.getElementById('scorecard-body');
    const holes = round.holes;
    if (!holes.length) {
      body.innerHTML = '<div class="card">No course data for this round.</div>';
      showSection('scorecard-view');
      return;
    }

    // Match-adjusted stroke maps, same as the app's scorecard
    const matchHcps = match.golfers.map(g =>
      calcPlayingHandicap(g.handicap, round.slope, round.rating, g.handicap_pct));
    const minHcp = Math.min(...matchHcps);
    const strokeMaps = {};
    match.golfers.forEach((g, i) => {
      strokeMaps[g.golfer_id] = buildStrokeMapForGolfer(matchHcps[i] - minHcp, holes);
    });

    const scoreLookup = {};
    match.hole_scores.forEach(s => {
      scoreLookup[`${s.golfer_id}-${s.hole_number}`] = s.strokes;
    });

    // Running best-ball match-play margin per hole (team matches only), same
    // as the leftmost column on the app's scorecard.
    const teams = matchTeams(match);
    const showMatch = teams.length === 2;
    const matchByHole = computeMatchColumn(match, round, holes, strokeMaps, teams, showMatch);

    let html = `<div class="card"><h2 class="section-title">${esc(round.round_name)}</h2><div class="sc-wrap"><table class="sc"><thead><tr>`;
    if (showMatch) html += `<th class="match-col">Match</th>`;
    html += `<th class="hole-col">Hole</th><th class="hole-col">Par</th>`;
    match.golfers.forEach(g => {
      const bg = g.team_color || '#4F2185';
      html += `<th style="background:${esc(bg)};color:${pickContrastColor(bg)}">${esc(g.first_name)}</th>`;
    });
    html += '</tr></thead><tbody>';

    const totals = {};
    let parTotal = 0;
    holes.forEach(h => {
      parTotal += h.par;
      html += '<tr>';
      if (showMatch) {
        const m = matchByHole[h.hole_number];
        html += m
          ? `<td class="match-cell" style="background:${esc(m.color)};color:${m.textColor}">${m.mag}</td>`
          : `<td class="match-cell"></td>`;
      }
      html += `<td><strong>${h.hole_number}</strong></td><td>${h.par}</td>`;
      match.golfers.forEach(g => {
        const s = scoreLookup[`${g.golfer_id}-${h.hole_number}`];
        if (s !== undefined) totals[g.golfer_id] = (totals[g.golfer_id] || 0) + s;
        const dots = dotHtml(strokeMaps[g.golfer_id][h.hole_number] || 0);
        let cls = 'cell';
        if (s !== undefined) {
          if (s < h.par) cls += ' under-par';
          else if (s > h.par) cls += ' over-par';
        }
        html += `<td class="${cls}">${s !== undefined ? s : ''}${dots}</td>`;
      });
      html += '</tr>';
    });

    html += `<tr class="tot">${showMatch ? '<td></td>' : ''}<td>Tot</td><td>${parTotal}</td>`;
    match.golfers.forEach(g => {
      html += `<td>${totals[g.golfer_id] ?? ''}</td>`;
    });
    html += '</tr></tbody></table></div></div>';

    body.innerHTML = html;
    showSection('scorecard-view');
  }

  // Per-hole running match-play margin, mirroring the app's read-only
  // best-ball status column: net best ball per team, running differential,
  // magnitude shown and colored by the leading team (black when tied).
  function computeMatchColumn(match, round, holes, strokeMaps, teams, showMatch) {
    const result = {};
    if (!showMatch) return result;
    const [teamA, teamB] = teams;

    const byHole = {};
    match.hole_scores.forEach(s => {
      const g = match.golfers.find(x => x.golfer_id == s.golfer_id);
      if (!g) return;
      const net = s.strokes - (strokeMaps[g.golfer_id][s.hole_number] || 0);
      if (!byHole[s.hole_number]) byHole[s.hole_number] = { a: [], b: [] };
      if (g.team_name === teamA.name) byHole[s.hole_number].a.push(net);
      else if (g.team_name === teamB.name) byHole[s.hole_number].b.push(net);
    });

    let diff = 0;
    holes.forEach(h => {
      const hh = byHole[h.hole_number];
      if (!hh || !hh.a.length || !hh.b.length) return;
      const aBest = Math.min(...hh.a);
      const bBest = Math.min(...hh.b);
      if (aBest < bBest) diff++;
      else if (bBest < aBest) diff--;
      let color, textColor;
      if (diff === 0) { color = '#000'; textColor = '#fff'; }
      else if (diff > 0) { color = teamA.color; textColor = pickContrastColor(teamA.color); }
      else { color = teamB.color; textColor = pickContrastColor(teamB.color); }
      result[h.hole_number] = { mag: Math.abs(diff), color, textColor };
    });
    return result;
  }

  function dotHtml(strokes) {
    if (strokes === 1) return '<span class="corner-dot"></span>';
    if (strokes === 2) return '<span class="corner-dot"></span><span class="corner-dot second-dot"></span>';
    if (strokes === -1) return '<span class="corner-dot" style="background:#dc2626"></span>';
    return '';
  }

  // ── Wiring ───────────────────────────────────────────────────────────────

  async function enterCode(code) {
    code = code.trim().toUpperCase();
    if (code.length < 4) {
      showCodeError('Enter the full code.');
      return;
    }
    const btn = document.getElementById('watch-btn');
    btn.disabled = true;
    showCodeError('');
    const ok = await fetchLive(code, { fromEntry: true });
    btn.disabled = false;
    if (ok) {
      history.replaceState(null, '', `?code=${encodeURIComponent(code)}`);
      startPolling();
    }
  }

  document.getElementById('watch-btn').addEventListener('click', () => {
    enterCode(document.getElementById('code-input').value);
  });
  document.getElementById('code-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') enterCode(e.target.value);
  });
  document.getElementById('code-input').addEventListener('input', e => {
    e.target.value = e.target.value.toUpperCase();
  });
  document.getElementById('refresh-btn').addEventListener('click', () => {
    if (state.code) fetchLive(state.code);
  });
  document.getElementById('sc-back').addEventListener('click', () => {
    showSection('live-view');
  });

  const urlCode = new URLSearchParams(location.search).get('code');
  if (urlCode) {
    document.getElementById('code-input').value = urlCode.toUpperCase();
    enterCode(urlCode);
  }
})();
