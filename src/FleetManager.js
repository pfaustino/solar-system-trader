export class FleetManager {
    constructor(game) {
        this.game = game;
        this.ownedShips = []; // List of ship objects or data structures
        this.activeShipId = null; // ID of the ship the player is currently piloting
    }

    init() {
        // Init UI
        this.setupUI();
    }

    setupUI() {
        // Tab switching is handled by Game.js now

        // Action Buttons
        const missionBtn = document.getElementById('btn-fleet-mission');
        if (missionBtn) {
            missionBtn.addEventListener('click', () => {
                if (this.selectedShipId) {
                    this.assignRandomMission(this.selectedShipId);
                    this.updateUI();
                }
            });
        }

        // ... switch button ...

        document.getElementById('btn-fleet-switch').addEventListener('click', () => {
            if (this.selectedShipId) {
                this.switchShip(this.selectedShipId);
            }
        });
    }

    addShip(shipData, state = null) {
        const newShip = {
            id: 'ship_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
            data: shipData, // The static data (stats, model path)
            name: shipData.name + ' ' + (this.ownedShips.length + 1),
            status: 'docked', // docked, mission, transit
            location: this.game.currentLocation, // Should always be where we bought it
            mission: null,
            missionTimer: 0,
            condition: state ? (state.hull / (state.maxHull || 100)) * 100 : 100,
            state: state || {} // Store full state (upgrades, etc)
        };
        this.ownedShips.push(newShip);
        console.log("Ship added to fleet:", newShip.name);
        return newShip;
    }

    startMission(shipId, mission) {
        const ship = this.ownedShips.find(s => s.id === shipId);
        if (!ship || ship.status !== 'docked') {
            console.warn("Cannot start mission: Ship not found or not docked");
            return false;
        }

        ship.status = 'mission';
        ship.mission = mission;

        // Duration: Distance / Speed
        // Mock distance for now (e.g. 10000)
        // Speed: ship.data.speed * 100?
        const speed = (ship.data.speed || 5) * 50;
        const distance = 50000; // Average trip
        const duration = distance / speed;

        ship.missionDuration = duration;
        ship.missionTimer = duration;

        console.log(`Ship ${ship.name} started mission: ${mission.name} (${Math.ceil(duration)}s)`);

        // Save game state to persist mission
        this.game.saveGame();

        this.updateUI();
        return true;
    }

    assignRandomMission(shipId) {
        if (!this.game.locationsData) return;

        // Pick a random location
        const locs = this.game.locationsData.locations;
        const target = locs[Math.floor(Math.random() * locs.length)];

        const mission = {
            name: `Trade Run to ${target.name}`,
            targetId: target.id,
            reward: 500 + Math.floor(Math.random() * 1000),
            difficulty: 1
        };

        this.startMission(shipId, mission);
    }

    switchShip(shipId) {
        console.log("Attempting to switch to ship:", shipId);
        const shipIndex = this.ownedShips.findIndex(s => s.id === shipId);
        if (shipIndex === -1) {
            console.error("Ship ID not found in fleet:", shipId);
            return;
        }

        const targetShip = this.ownedShips[shipIndex];
        console.log("Target Ship found:", targetShip.name, "Status:", targetShip.status, "Location:", targetShip.location);

        if (targetShip.status !== 'docked') {
            console.warn("Ship not docked.");
            this.game.showMessage("Cannot switch to ship on mission!", "error");
            return;
        }

        if (targetShip.location !== this.game.currentLocation) {
            console.warn("Location mismatch. Ship:", targetShip.location, "Player:", this.game.currentLocation);
            const sysName = this.game.locationsData.locations.find(l => l.id === targetShip.location)?.name || targetShip.location;
            this.game.showMessage(`Ship is stored at ${sysName}. Travel there to switch.`, "error");
            return;
        }

        // 1. Capture Current Ship State
        const currentShip = this.game.playerShip;
        console.log("Capturing current ship state:", currentShip.data.name);

        try {
            const currentState = {
                hull: currentShip.hull,
                maxHull: currentShip.maxHull,
                shield: currentShip.shield,
                fuel: currentShip.fuel,
                upgradeLevels: JSON.parse(JSON.stringify(currentShip.upgradeLevels))
            };

            // 2. Add current ship to fleet
            const oldShipEntry = {
                id: 'ship_legacy_' + Date.now(), // Unique ID
                data: currentShip.data,
                name: currentShip.data.name + ' (Stored)',
                status: 'docked',
                location: this.game.currentLocation,
                condition: (currentShip.hull / currentShip.maxHull) * 100,
                state: currentState
            };

            this.ownedShips.push(oldShipEntry);

            // 3. Remove new ship from fleet list (it becomes active)
            this.ownedShips.splice(shipIndex, 1);

            // 4. Load the new ship with its state
            console.log("Loading new player ship...");
            this.game.loadPlayerShip(targetShip.data.id, targetShip.state).then(() => {
                console.log("Ship switched successfully.");
                this.game.showMessage(`Switched to ${targetShip.name || targetShip.data.name}`, "info");
                this.updateUI();
                this.game.saveGame();
            }).catch(err => {
                console.error("Error loading ship:", err);
            });
        } catch (e) {
            console.error("Error during switchShip state capture:", e);
        }
    }

    update(delta) {
        let changed = false;
        this.ownedShips.forEach(ship => {
            if (ship.status === 'mission') {
                ship.missionTimer -= delta;
                if (ship.missionTimer <= 0) {
                    this.completeMission(ship);
                    changed = true;
                }
            }
        });

        // Throttle UI updates (run max 2 times per second)
        this.uiTimer = (this.uiTimer || 0) + delta;
        const isFleetTabVisible = !document.getElementById('view-fleet').classList.contains('hidden');

        if (changed || (isFleetTabVisible && this.uiTimer > 0.5)) {
            this.updateUI();
            this.uiTimer = 0;
        }
    }

    completeMission(ship) {
        console.log(`Ship ${ship.name} returned from mission.`);
        ship.status = 'docked';

        // Reward
        const reward = ship.mission.reward || 100;
        this.game.credits += reward;
        this.game.showMessage(`${ship.name} returned: +${reward} cr`, "success");
        this.game.updateHUD();

        ship.mission = null;
        this.game.saveGame();
    }

    getFleetList() {
        return this.ownedShips;
    }

    load(fleetList) {
        if (fleetList && Array.isArray(fleetList)) {
            this.ownedShips = fleetList;
            console.log("Fleet loaded:", this.ownedShips.length, "ships.");
            this.updateUI();
        }
    }

    updateUI() {
        const list = document.getElementById('fleet-list');
        if (!list) return; // UI not ready

        // If we are rebuilding the list every frame, input is lost? 
        // Just rebuild for now.
        list.innerHTML = '';

        if (this.ownedShips.length === 0) {
            list.innerHTML = '<div style="padding:10px; color:#666;">No idle ships in fleet.</div>';
            return;
        }

        this.ownedShips.forEach(ship => {
            const el = document.createElement('div');
            el.className = 'fleet-item ' + (this.selectedShipId === ship.id ? 'selected' : '');

            // Check location match
            let locDisplay = '';
            const isHere = ship.location === this.game.currentLocation;
            if (!isHere) {
                // Find readable name
                const sysName = this.game.locationsData.locations.find(l => l.id === ship.location)?.name || ship.location;
                locDisplay = `<div style="color:#f88; font-size:11px;">@ ${sysName}</div>`;
            }

            el.innerHTML = `
                <div>
                    <div class="fleet-item-name">${ship.name}</div>
                    <div class="fleet-item-status">${ship.status.toUpperCase()} ${ship.status === 'mission' ? Math.ceil(ship.missionTimer) + 's' : ''}</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:12px; color:${ship.status === 'docked' ? '#0f0' : '#f00'}">${ship.data.name}</div>
                    ${locDisplay}
                </div>
            `;

            el.addEventListener('click', () => {
                this.selectedShipId = ship.id;
                this.updateDetails(ship);
                this.updateUI(); // to highlight selection
            });

            list.appendChild(el);
        });

        // Update details if selected
        if (this.selectedShipId) {
            const ship = this.ownedShips.find(s => s.id === this.selectedShipId);
            if (ship) this.updateDetails(ship);
        }
    }

    updateDetails(ship) {
        const container = document.getElementById('fleet-selected-info');
        const nameTitle = document.getElementById('fleet-selected-name');
        const actions = document.getElementById('fleet-actions');

        nameTitle.textContent = ship.name;
        actions.classList.remove('hidden');

        // Enable/Disable buttons based on status
        document.getElementById('btn-fleet-mission').disabled = (ship.status !== 'docked');
        document.getElementById('btn-fleet-switch').disabled = (ship.status !== 'docked');

        container.innerHTML = `
            <div class="fleet-detail-row"><span class="fleet-detail-label">Type:</span> <span class="fleet-detail-value">${ship.data.name}</span></div>
            <div class="fleet-detail-row"><span class="fleet-detail-label">Class:</span> <span class="fleet-detail-value">${ship.data.class || 'N/A'}</span></div>
            <div class="fleet-detail-row"><span class="fleet-detail-label">Status:</span> 
                <span class="fleet-detail-value" style="color:${ship.status === 'docked' ? '#0f0' : '#f80'}">${ship.status.toUpperCase()}</span>
            </div>
            ${ship.mission ? `
            <div style="margin-top:10px; border-top:1px solid #333; padding-top:5px;">
                <div class="fleet-detail-label">CURRENT MISSION</div>
                <div>${ship.mission.name}</div>
                <div>ETA: ${Math.ceil(ship.missionTimer)}s</div>
                <div>Reward: ${ship.mission.reward}cr</div>
            </div>
            ` : ''}
        `;
    }
}
