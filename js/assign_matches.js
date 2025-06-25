let board = null;
    class MatchBoard {
      constructor({ poolA, poolB, matches, containers, assignments = {}, maxTeamSize = 2, teamConfig = {}, roundName = '' }) {
        this.poolA = poolA;
        this.poolB = poolB;
        this.matches = matches;
        this.assignments = assignments;
        this.containers = containers;
        this.maxTeamSize = maxTeamSize;
        this.teamConfig = {
          A: { name: teamConfig.A?.name || 'Team A', color: teamConfig.A?.color || '#007bff' },
          B: { name: teamConfig.B?.name || 'Team B', color: teamConfig.B?.color || '#28a745' }
        };
        this.roundName = roundName;
        this._init();
      }

      _init() {
        this._renderPools();
        this._renderMatches();
        this._initDragDrop();
      }

      _createZone(id, title, items = [], headerColor = null) {
        const zone = document.createElement('div'); zone.className = 'zone'; zone.id = id;
        const header = document.createElement('h3'); header.textContent = title;
        if (headerColor) { header.style.backgroundColor = headerColor; header.style.color = '#fff'; }
        zone.appendChild(header);
        items.forEach(item => {
          const card = document.createElement('div'); card.className = 'card';
          card.textContent = `${item.name} (${item.handicap})`;
          card.dataset.id = item.id;
          card.dataset.handicap = item.handicap;
          zone.appendChild(card);
        });
        return zone;
      }

      _renderPools() {
        const el = document.getElementById(this.containers.pools); el.innerHTML = '';
        const assigned = new Set();
        Object.values(this.assignments).forEach(a => a.teamA.concat(a.teamB).forEach(g => g && assigned.add(g.id)));
        const availA = this.poolA.filter(g => !assigned.has(g.id));
        const availB = this.poolB.filter(g => !assigned.has(g.id));
        el.appendChild(this._createZone('poolA', this.teamConfig.A.name, availA, this.teamConfig.A.color));
        el.appendChild(this._createZone('poolB', this.teamConfig.B.name, availB, this.teamConfig.B.color));
      }

      _renderMatches() {
        const boardEl = document.getElementById(this.containers.board); boardEl.innerHTML = '';
        this.matches.forEach(({ id, locked }, idx) => {
            const matchEl = document.createElement('div'); matchEl.className = 'match'; matchEl.dataset.matchId = id;
            const matchTitle = `Match ${idx + 1} in ${this.roundName || 'Round'}`;
            const title = document.createElement('h2'); title.textContent = matchTitle; matchEl.appendChild(title);
            this.matches[idx].name = matchTitle;

            // Only show delete button if not locked
            if (!locked) {
            const del = document.createElement('button'); del.className = 'delete-match-btn'; del.textContent = '×';
            del.addEventListener('click', () => this.deleteMatch(id)); matchEl.appendChild(del);
            } else {
            // Optionally, show a lock icon or message
            const lockMsg = document.createElement('div');
            lockMsg.textContent = 'Scores entered. Editing locked.';
            lockMsg.style.color = '#e74c3c';
            lockMsg.style.textAlign = 'center';
            matchEl.appendChild(lockMsg);
            }

            const row = document.createElement('div'); row.className = 'container';
            const aItems = this.assignments[id]?.teamA || [];
            const bItems = this.assignments[id]?.teamB || [];
            row.appendChild(this._createZone(`teamA-${id}`, this.teamConfig.A.name, aItems, this.teamConfig.A.color));
            row.appendChild(this._createZone(`teamB-${id}`, this.teamConfig.B.name, bItems, this.teamConfig.B.color));
            matchEl.appendChild(row); boardEl.appendChild(matchEl);

            // Optionally, disable drag/drop for locked matches
            if (locked) {
            row.querySelectorAll('.zone').forEach(zone => zone.classList.add('locked-zone'));
            }
        });
        }

      _applyServerDiff(newIdMap = {}, deletedIds = []) {
        // 1) Remap provisional → real IDs
        Object.entries(newIdMap).forEach(([oldIdStr, newId]) => {
            const oldId = Number(oldIdStr);

            // —— Update your internal data structures —— 
            // Move assignments[oldId] → assignments[newId]
            this.assignments[newId] = this.assignments[oldId];
            delete this.assignments[oldId];

            // Replace in your matches array
            const idx = this.matches.indexOf(oldId);
            if (idx !== -1) this.matches[idx] = newId;

            // —— Update the DOM attributes —— 
            document
            .querySelectorAll(`[data-match-id="${oldId}"]`)
            .forEach(el => el.setAttribute('data-match-id', newId));
        });

        // 2) Remove any matches the server told us were deleted
        deletedIds.forEach(id => {
            // —— Remove from your internal data —— 
            this.matches = this.matches.filter(mid => mid !== id);
            delete this.assignments[id];

            // —— Remove from the DOM —— 
            document
            .querySelectorAll(`[data-match-id="${id}"]`)
            .forEach(el => el.remove());
        });
        }


        _initDragDrop() {
            const config = [
                { id: 'poolA', group: 'grpA' },
                { id: 'poolB', group: 'grpB' }
            ];
            // Only add team zones for matches that are not locked
            this.matches.forEach(({ id, locked }) => {
                if (!locked) {
                config.push({ id: `teamA-${id}`, group: 'grpA' });
                config.push({ id: `teamB-${id}`, group: 'grpB' });
                }
            });
            config.forEach(({ id, group }) => {
                const el = document.getElementById(id);
                if (el) {
                Sortable.create(el, {
                    group,
                    animation: 150,
                    ghostClass: 'sortable-ghost',
                    draggable: '.card',
                    onAdd: evt => this._handleAdd(evt)
                });
                }
            });
            }

      _handleAdd(evt) {
        const dest=evt.to; if(dest.id.startsWith('team')){
          const count=dest.querySelectorAll('.card').length;
          if(count>this.maxTeamSize){alert(`Team is full (max ${this.maxTeamSize})!`);evt.from.appendChild(evt.item);}
        }
      }

      _buildAssignments() {
        const all=[...this.poolA,...this.poolB];
        return this.matches.reduce((acc,{id})=>{
          const aIds=[...document.querySelectorAll(`#teamA-${id} .card`)].map(c=>c.dataset.id);
          const bIds=[...document.querySelectorAll(`#teamB-${id} .card`)].map(c=>c.dataset.id);
          acc[id]={teamA:aIds.map(i=>all.find(g=>g.id.toString()===i)),teamB:bIds.map(i=>all.find(g=>g.id.toString()===i))};return acc;
        },{});
      }

      saveAll(){
        this.assignments=this._buildAssignments();
        const payload={assignments:{}, matchNames: {}};
        this.matches.forEach((m, idx) => {
            payload.matchNames[m.id] = m.name; // send match name keyed by match id
        });

        Object.entries(this.assignments).forEach(([mid,teams])=>{
            payload.assignments[mid]={
                teamA:teams.teamA.map(g=>g.id),
                teamB:teams.teamB.map(g=>g.id)
            }
        });
        console.log('Saving:', payload);
        fetch(`/api/saveAllMatchData.php?round_id=${this.roundId}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
        .then(res=>res.json())
        .then(json => {
            if (!json.success) {
                console.error('Save failed:', json.error);
                return;
            }
            // Instead of refreshing the board with old data, reload from server:
            MatchBoard.loadFromServer({
                containers: this.containers,
                teamConfig: this.teamConfig,
                maxTeamSize: this.maxTeamSize,
                roundId: this.roundId
            });
        })
        .catch(err => console.error(err));
      }

      addMatch() {
        // Optionally, build assignments before saving
        this.assignments = this._buildAssignments();

        // Add a new provisional match to the local array
        const max = this.matches.reduce((m, x) => x.id > m ? x.id : m, 0);
        const nextId = max + 1;
        this.matches.push({ id: nextId });
        this._refreshBoard();

        }

      deleteMatch(matchId){
        this.assignments=this._buildAssignments();
        delete this.assignments[matchId];
        this.matches = this.matches.filter(m => m.id !== matchId);
        const aEl=document.getElementById(`teamA-${matchId}`),bEl=document.getElementById(`teamB-${matchId}`),pA=document.getElementById('poolA'),pB=document.getElementById('poolB');
        if(aEl)Array.from(aEl.querySelectorAll('.card')).forEach(c=>pA.appendChild(c));if(bEl)Array.from(bEl.querySelectorAll('.card')).forEach(c=>pB.appendChild(c));this.matches=this.matches.filter(m=>m.id!==matchId);this._refreshBoard();}

      _refreshBoard(){this._renderPools();this._renderMatches();this._initDragDrop();}

      static loadFromServer({containers,teamConfig,maxTeamSize=2,roundId}){
        return fetch(`/api/get_match_data.php?round_id=${roundId}`)
        .then(res=>res.json())
        .then(data=>{
            const roundTitle = document.getElementById('roundTitle');
            if (roundTitle) {
                roundTitle.textContent = `${data.round_name} - ${data.round_date}`;
                // Prevent any other code from modifying this title
                roundTitle.dataset.locked = 'true';
            }
          const roundName = data.round_name || 'Round Title';

            // Assign standardized match names
            data.matches.forEach((m, idx) => {
            m.name = `Match ${idx + 1} in ${roundName}`;
            }); 

          const [teamAObj,teamBObj]=data.teams;
          const poolA=teamAObj.golfers, poolB=teamBObj.golfers;
          const config={A:{name:teamAObj.name,color:teamAObj.color_hex},B:{name:teamBObj.name,color:teamBObj.color_hex}};
                    const asg = {};
                    data.matches.forEach(({id}) => {
                        const raw = data.assignments[id] || { teamA: [], teamB: [] };
                        // combine both arrays:
                        const allIds = [...raw.teamA, ...raw.teamB];
                        const aObjs = [], bObjs = [];

                        allIds.forEach(gid => {
                            const ga = poolA.find(g => g.id === gid);
                            if (ga) return aObjs.push(ga);
                            const gb = poolB.find(g => g.id === gid);
                            if (gb) bObjs.push(gb);
                        });

                        asg[id] = { teamA: aObjs, teamB: bObjs };
                        });

          const board = new MatchBoard({poolA,poolB,matches:data.matches,assignments:asg,containers,maxTeamSize,teamConfig:config, roundName});
          board.roundId=roundId;

          return board;
        });
      }
    }

    document.addEventListener('DOMContentLoaded', () => {


        // Attach listeners ONCE
        document.getElementById('saveAllBtn').addEventListener('click', () => board && board.saveAll());
        document.getElementById('newMatchBtn').addEventListener('click', () => board && board.addMatch());


        });