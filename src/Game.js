import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Ship } from './Ship.js';
import { Station } from './Station.js';
import { TradeManager } from './TradeManager.js';
import { MiningManager } from './MiningManager.js';
import { CombatManager } from './CombatManager.js';
import { AsteroidField } from './AsteroidField.js';
import { AudioManager } from './AudioManager.js';

export class Game {
    constructor(scene, camera, renderer) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;

        // Game state
        this.credits = 1000;
        this.cargo = [];
        this.cargoMax = 20;
        this.currentLocation = 'earth';
        this.dockedAt = null;

        this.selectedTargetId = null;
        this.autopilotEnabled = false;

        // Data
        this.shipsData = null;
        this.locationsData = null;
        this.commoditiesData = null;

        // Game objects
        this.playerShip = null;
        this.stations = new Map();
        this.asteroidFields = [];

        // Systems
        this.tradeManager = new TradeManager(this);
        this.miningManager = new MiningManager(this);
        this.combatManager = new CombatManager(this);
        this.audioManager = new AudioManager();

        // Input state
        this.keys = {};
        this.mouseDelta = new THREE.Vector2(); // Stores movement since last frame
        this.setupInput();

        // HUD elements
        this.hudCredits = document.getElementById('credits-value');
        this.hudCargo = document.getElementById('cargo-value');
        this.hudCargoMax = document.getElementById('cargo-max');
        this.hudLocation = document.getElementById('location-value');
        this.hudSpeed = document.getElementById('speed-value');
        this.hudTargetInfo = document.getElementById('target-info');
        this.hudTargetName = document.getElementById('target-name');
        this.hudTargetDistance = document.getElementById('target-distance');

        // Navigation Elements
        this.radarElement = document.getElementById('radar');
        this.waypointsContainer = document.getElementById('waypoints');
        this.radarBlips = [];
        this.waypointElements = new Map();
    }

    async init() {
        // Load game data
        await this.loadData();

        // Init systems
        this.tradeManager.init();
        await this.audioManager.load(); // Load sounds

        // Load player ship
        await this.loadPlayerShip();

        // Create stations
        this.createStations();

        // Create asteroid fields
        this.createAsteroidFields();

        // Position player at Earth
        const earthPos = this.locationsData.locations.find(l => l.id === 'earth').position;
        this.playerShip.mesh.position.set(earthPos.x + 100, earthPos.y, earthPos.z);

        // Position camera behind ship
        this.updateCamera();
    }

    async loadData() {
        const [ships, locations, commodities] = await Promise.all([
            fetch('./data/ships.json').then(r => r.json()),
            fetch('./data/locations.json').then(r => r.json()),
            fetch('./data/commodities.json').then(r => r.json())
        ]);

        this.shipsData = ships;
        this.locationsData = locations;
        this.commoditiesData = commodities;
    }

    async loadPlayerShip() {
        const loader = new GLTFLoader();
        const starterShip = this.shipsData.ships[0]; // Alpha - starter ship

        try {
            const gltf = await loader.loadAsync(`./assets/${starterShip.model}`);
            this.playerShip = new Ship(gltf.scene, starterShip);
            this.scene.add(this.playerShip.mesh);

            // Scale ship appropriately
            this.playerShip.mesh.scale.setScalar(5);

            this.cargoMax = starterShip.cargo;
            this.updateHUD();
        } catch (error) {
            console.error('Failed to load ship model:', error);
            // Create placeholder ship
            this.createPlaceholderShip(starterShip);
        }
    }

    createPlaceholderShip(shipData) {
        const geometry = new THREE.ConeGeometry(2, 8, 8);
        geometry.rotateX(Math.PI / 2);
        const material = new THREE.MeshStandardMaterial({
            color: 0x00ff00,
            emissive: 0x003300,
            flatShading: true
        });
        const mesh = new THREE.Mesh(geometry, material);

        this.playerShip = new Ship(mesh, shipData);
        this.scene.add(this.playerShip.mesh);

        this.cargoMax = shipData.cargo;
        this.updateHUD();
    }

    createStations() {
        for (const locationData of this.locationsData.locations) {
            const station = new Station(locationData);
            station.mesh.position.set(
                locationData.position.x,
                locationData.position.y,
                locationData.position.z
            );
            this.scene.add(station.mesh);
            this.stations.set(locationData.id, station);
        }
    }

    createAsteroidFields() {
        // Add field near Asteroid Belt Depot
        const beltLoc = this.locationsData.locations.find(l => l.id === 'asteroid_belt');
        if (beltLoc) {
            const field = new AsteroidField(
                this.scene,
                new THREE.Vector3(beltLoc.position.x, beltLoc.position.y, beltLoc.position.z),
                500, // count
                1000 // radius
            );
            this.asteroidFields.push(field);
        }

        // Add field near Saturn Rings
        const ringLoc = this.locationsData.locations.find(l => l.id === 'saturn');
        if (ringLoc) {
            const field = new AsteroidField(
                this.scene,
                new THREE.Vector3(ringLoc.position.x, ringLoc.position.y, ringLoc.position.z),
                300,
                800
            );
            this.asteroidFields.push(field);
        }
    }

    setupInput() {
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                // Prevent scrolling when shooting
                // e.preventDefault(); 
                if (this.playerShip && this.playerShip.canFire()) {
                    // Fire logic handled in update loop
                }
            }
            this.keys[e.code] = true;
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;

            // Toggle docking
            if (e.code === 'KeyF') {
                this.tryDocking();
            }
        });

        // Pointer Lock Request on click
        document.body.addEventListener('click', () => {
            if (!this.dockedAt) {
                document.body.requestPointerLock();
            }
        });

        document.addEventListener('pointerlockerror', () => {
            console.error('Pointer lock failed');
        });

        window.addEventListener('mousemove', (e) => {
            if (document.pointerLockElement === document.body) {
                this.mouseDelta.x += e.movementX;
                this.mouseDelta.y += e.movementY;
            }
        });

        // UI Listeners
        document.getElementById('close-station-btn').addEventListener('click', () => {
            this.undock();
            // Don't auto-lock here, let user click again or something
        });

        // Target Selection & Autopilot Keys
        window.addEventListener('keydown', (e) => {
            if (e.code === 'BracketRight') this.cycleTarget(1);
            if (e.code === 'BracketLeft') this.cycleTarget(-1);
            if (e.code === 'Slash' || e.key === '/') this.cycleTarget(1);
            if (e.code === 'KeyP') this.toggleAutopilot();
        });
    }

    cycleTarget(dir) {
        const stationIds = Array.from(this.stations.keys());
        if (stationIds.length === 0) return;

        let currentIndex = stationIds.indexOf(this.selectedTargetId);
        if (currentIndex === -1) currentIndex = 0;
        else currentIndex += dir;

        // Wrap around
        if (currentIndex >= stationIds.length) currentIndex = 0;
        if (currentIndex < 0) currentIndex = stationIds.length - 1;

        this.selectedTargetId = stationIds[currentIndex];
        this.audioManager.playUIBeep();

        // Show target immediately
        const station = this.stations.get(this.selectedTargetId);
        this.hudTargetInfo.classList.remove('hidden');

        const status = this.autopilotEnabled ? "[AP ENGAGED]" : "[SELECTED]";
        this.hudTargetName.textContent = `${station.data.name} ${status}`;

        // Ensure distance is shown if available
        const dist = this.playerShip.mesh.position.distanceTo(station.mesh.position);
        this.hudTargetDistance.textContent = `${Math.floor(dist)} km`;
    }

    toggleAutopilot() {
        if (!this.selectedTargetId) {
            this.cycleTarget(1); // Select first if none
        }
        this.autopilotEnabled = !this.autopilotEnabled;

        const station = this.stations.get(this.selectedTargetId);
        if (station) {
            this.hudTargetName.textContent = station.data.name + (this.autopilotEnabled ? " [AP ENGAGED]" : " [TARGET]");
        }

        if (this.autopilotEnabled) {
            this.audioManager.playUIBeep(); // Confirmation sound
            console.log("Autopilot Engaged");
        } else {
            console.log("Autopilot Disengaged");
        }
    }

    updateAutopilot(delta) {
        if (!this.autopilotEnabled || !this.selectedTargetId || !this.playerShip) return;

        const targetStation = this.stations.get(this.selectedTargetId);
        if (!targetStation) return;

        const shipPos = this.playerShip.mesh.position;
        const targetPos = targetStation.mesh.position;
        const distance = shipPos.distanceTo(targetPos);

        // 1. Steering
        // Calculate desired look rotation
        // We act as if the "eye" is the target looking at the ship.
        // This makes the resulting Z axis point FROM ship TO target.
        // Since our ship moves along +Z (thrust is (0,0,1)), this aligns movement with target.
        const desiredMatrix = new THREE.Matrix4();
        desiredMatrix.lookAt(targetPos, shipPos, new THREE.Vector3(0, 1, 0));
        const targetRot = new THREE.Quaternion();
        targetRot.setFromRotationMatrix(desiredMatrix);

        // Lerp ship's target quaternion towards destination alignment
        // We override the mouse input here
        this.playerShip.targetQuaternion.slerp(targetRot, 2.0 * delta);

        // 2. Thrust Management (PD Controller)
        let thrust = 0;
        const forwardDir = new THREE.Vector3(0, 0, 1).applyQuaternion(this.playerShip.mesh.quaternion);
        const toTarget = targetPos.clone().sub(shipPos).normalize();
        const alignment = forwardDir.dot(toTarget);

        // Only move if facing roughly towards target
        if (alignment > 0.8) {
            // Determine desired speed based on distance (Braking Curve)
            // v^2 = 2 * a * d  =>  v = sqrt(2 * a * d)
            // We want to arrive with 0 speed.
            let desiredSpeed = Math.sqrt(2 * (this.playerShip.acceleration * 0.5) * distance);

            // Cap at max speed
            desiredSpeed = Math.min(desiredSpeed, this.playerShip.maxSpeed);

            // Stop if arrived
            if (distance < 100) {
                desiredSpeed = 0;
                if (this.playerShip.velocity.length() < 10) {
                    // Close and slow enough to dock
                    this.autopilotEnabled = false;
                    this.tryDocking();
                    return; // Stop update
                }
            }

            // Current forward speed
            const currentSpeed = this.playerShip.velocity.dot(forwardDir);

            // Proportional Control for Thrust
            const speedError = desiredSpeed - currentSpeed;

            // Gain factor: How aggressively to accelerate/brake
            const kP = 2.0;

            // Calculate thrust (-1 to 1)
            thrust = (speedError / this.playerShip.maxSpeed) * kP;

            // Clamp thrust
            thrust = Math.max(-1, Math.min(1, thrust));

            // Boost if asking for max thrust and far away
            this.playerShip.boosting = (thrust > 0.9 && distance > 5000);

        } else {
            // Slow down to turn if misaligned
            thrust = 0.1;
            // Or brake if moving fast in wrong direction?
            if (this.playerShip.velocity.length() > 100) thrust = -0.5;
        }

        this.playerShip.thrust(thrust, delta);
        this.audioManager.updateEngine(thrust > 0 ? thrust : 0);
    }

    update(delta) {
        if (!this.playerShip) return;

        // If docked, don't update ship physics or camera
        if (this.dockedAt) {
            // Ensure mouse is unlocked if docked
            if (document.pointerLockElement === document.body) {
                document.exitPointerLock();
            }
            this.audioManager.updateEngine(0);
            return;
        }

        // Handle input
        if (this.autopilotEnabled) {
            this.updateAutopilot(delta);
            // Disable manual mouse/key inputs for flight, but maybe keep camera?
            // For now, let autopilot helper override ship physics directly
        } else {
            this.handleInput(delta);
        }

        // Update ship
        this.playerShip.update(delta);

        // Audio Logic: Engine Sound
        const isThrusting = this.keys['KeyW'] || this.keys['KeyS'];
        const isBoosting = this.playerShip.boosting;
        let targetThrust = 0;

        if (isThrusting) {
            targetThrust = isBoosting ? 1.0 : 0.6;
        } else {
            const speedRatio = Math.min(1, this.playerShip.velocity.length() / this.playerShip.maxSpeed);
            targetThrust = speedRatio * 0.2;
        }
        this.audioManager.updateEngine(targetThrust);

        // Update Mining
        this.miningManager.update(delta);

        // Update Combat
        this.combatManager.update(delta);

        // Update camera to follow ship
        this.updateCamera();

        // Check proximity to stations
        this.checkStationProximity();

        // Update HUD
        this.updateHUD();

        // Update Navigation
        this.updateNavigation();

        // Reset mouse delta after processing
        this.mouseDelta.set(0, 0);

        // Reset crosshair logic since pointer is locked
        this.updateCrosshair();
    }

    updateNavigation() {
        // Clear old blips
        this.radarElement.innerHTML = '<div id="radar-center"></div>';

        const shipPos = this.playerShip.mesh.position;
        const shipQuat = this.playerShip.mesh.quaternion.clone().invert(); // To rotate world relative to ship facing
        const range = 5000; // Radar range

        // 1. Stations
        this.stations.forEach((station, id) => {
            // Radar
            this.updateRadarBlip(station.mesh.position, 'station', range, shipPos, shipQuat);

            // Waypoints
            this.updateWaypoint(id, station.mesh.position, station.data.name);
        });

        // 2. Enemies
        this.combatManager.enemies.forEach((enemy, i) => {
            this.updateRadarBlip(enemy.mesh.position, 'enemy', range, shipPos, shipQuat);
        });
    }

    updateRadarBlip(targetPos, type, range, shipPos, shipQuat) {
        const relPos = targetPos.clone().sub(shipPos);
        const distance = relPos.length();

        if (distance > range) return;

        // Rotate relative position to match ship facing (so UP on radar is ALWAYS forward)
        relPos.applyQuaternion(shipQuat);

        // Map to radar coordinates (-100 to 100)
        const x = (relPos.x / range) * 90;
        const y = (relPos.z / range) * -90; // Z is forward/back, flip for screen Y

        const blip = document.createElement('div');
        blip.className = `radar-blip ${type}`;
        blip.style.left = `${50 + x}%`;
        blip.style.top = `${50 + y}%`;

        this.radarElement.appendChild(blip);
    }

    updateWaypoint(id, position, labelText) {
        // Project 3D position to 2D screen space
        const vector = position.clone();
        vector.project(this.camera);

        // Check if behind camera
        if (vector.z > 1) {
            // Hide if behind
            if (this.waypointElements.has(id)) {
                this.waypointElements.get(id).style.display = 'none';
            }
            return;
        }

        const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-(vector.y * 0.5) + 0.5) * window.innerHeight;

        let el = this.waypointElements.get(id);
        if (!el) {
            el = document.createElement('div');
            el.className = 'waypoint';
            el.innerHTML = `<div class="waypoint-marker"></div><div>${labelText}</div>`;
            this.waypointsContainer.appendChild(el);
            this.waypointElements.set(id, el);
        }

        el.style.display = 'block';
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;

        // Scale/fade by distance
        const dist = this.playerShip.mesh.position.distanceTo(position);
        const scale = Math.max(0.5, Math.min(1, 5000 / dist));
        el.style.opacity = scale;
        el.style.transform = `translate(-50%, -50%) scale(${scale})`;
    }

    updateCrosshair() {
        const crosshair = document.getElementById('crosshair');
        // In Pointer Lock mode, crosshair is always center
        crosshair.style.left = '50%';
        crosshair.style.top = '50%';
        crosshair.style.transform = 'translate(-50%, -50%)';
    }

    handleInput(delta) {
        const ship = this.playerShip;

        // Thrust (W/S)
        if (this.keys['KeyW']) {
            ship.thrust(1, delta);
        }
        if (this.keys['KeyS']) {
            ship.thrust(-0.5, delta);
        }

        // Strafe (A/D)
        if (this.keys['KeyA']) {
            ship.strafe(1, delta);
        }
        if (this.keys['KeyD']) {
            ship.strafe(-1, delta);
        }

        // Vertical Strafe (R/C)
        if (this.keys['KeyR']) {
            ship.strafeVertical(1, delta);
        }
        if (this.keys['KeyC']) {
            ship.strafeVertical(-1, delta);
        }

        // Pointer Lock Steering (Mouse Deltas)
        if (document.pointerLockElement === document.body) {
            const sensitivity = 0.002;
            const yawInput = -this.mouseDelta.x * sensitivity;
            const pitchInput = -this.mouseDelta.y * sensitivity; // Mouse UP (negative Y) should Pitch UP (positive rot X)??
            // Usually Pitch Up is rotating X positively (nose up), but mouse delta Y- is up.
            // So -Y * sens = +X rot. Correct. Or depends on THREE orientation.

            // Apply rotation directly
            // Note: delta is already time-independent effectively since it's per-frame movement distance? 
            // No, mouseDelta is pixels moved this frame.
            // So we apply rotation proportional to pixels moved.
            // We do NOT multiply by delta time because movementX is already discrete displacement.

            ship.yaw(yawInput * 8, delta);
            ship.pitch(pitchInput * 8, delta);

            // Auto-Leveling Logic
            // Calculate a target "Up" vector that combats roll drift and banks into turns.

            // 1. Get Ship's Local Orientation Vectors
            // IMPORTANT: Use targetQuaternion (control state) not mesh.quaternion (visual state)
            // Using visual state causes oscillation because it lags behind the control target (Slerp)
            const localRight = new THREE.Vector3(1, 0, 0).applyQuaternion(ship.targetQuaternion);
            const localUp = new THREE.Vector3(0, 1, 0).applyQuaternion(ship.targetQuaternion);
            const localForward = new THREE.Vector3(0, 0, 1).applyQuaternion(ship.targetQuaternion);

            // 2. Define World Up (or Ecliptic Normal)
            const worldUp = new THREE.Vector3(0, 1, 0);

            // 3. Project World Up onto plane perpendicular to forward direction
            // "projectedUp" points "Up" relative to the ship's current heading
            const projectedUp = worldUp.clone().sub(localForward.clone().multiplyScalar(worldUp.dot(localForward))).normalize();

            // Handle gimbal lock (looking straight up/down)
            if (projectedUp.lengthSq() < 0.01) {
                // If degenerate, skip leveling or maintain current up?
                // Just use current localUp to avoid nan
                projectedUp.copy(localUp);
            } else {
                projectedUp.normalize();
            }

            // 4. Determine "Level Right" vector
            // To bank, we want to tilt "Projected Up" by our bank angle
            // Simple: just measure roll error and add banking offset

            // Calculate current roll angle 
            // Angle between localRight and the horizontal plane defined by projectedUp
            // Or simpler: Angle between localUp and projectedUp
            // Dot product gives cosine of angle
            let currentRoll = Math.atan2(localRight.y, localRight.x); // Fallback

            // Accurate roll relative to horizon:
            const horizonRight = localForward.clone().cross(projectedUp).normalize();

            // Roll is angle between localRight and horizonRight
            // Use cross product to get sign
            const rightCross = localRight.clone().cross(horizonRight);
            const rollSign = rightCross.dot(localForward);

            const dot = Math.max(-1, Math.min(1, localRight.dot(horizonRight)));
            let rollError = Math.acos(dot);
            if (rollSign < 0) rollError = -rollError;

            // Desired Bank Angle based on Yaw
            // Yaw Left (+Input) -> Bank Left (Roll +? or -?)
            // Roll is Z rotation. CCW is positive?
            // Standard: Roll Right (CW) is negative Z? 
            // Let's assume standard conventions: 
            // To turn Left, we want left wing down. Right wing up.
            // That means rotating Z positively? No, CCW looking forward.
            // Right Hand Rule on Z (Backwards) -> Thumb back, fingers curl CCW.
            // So positive Z rot is Roll Left.

            let targetBank = yawInput * 15; // Increased banking factor
            const maxBank = 0.8; // ~45 degrees
            targetBank = Math.max(-maxBank, Math.min(maxBank, targetBank));

            // Total correction needed
            // We want rollError to match targetBank
            // Since rollError is "Current Roll", we want (Target - Current)

            const rollCorrection = targetBank - rollError;

            // Apply correction
            ship.roll(rollCorrection * 2, delta);
        }

        // Manual Roll Override
        if (this.keys['KeyQ']) {
            ship.roll(1, delta);
        }
        if (this.keys['KeyE']) {
            ship.roll(-1, delta);
        }

        // Boost (Shift)
        ship.boosting = this.keys['ShiftLeft'] || this.keys['ShiftRight'];
    }

    updateCamera() {
        if (!this.playerShip) return;

        // Camera follows behind and slightly above ship
        const shipPos = this.playerShip.mesh.position;
        const shipDir = new THREE.Vector3(0, 0, 1);
        shipDir.applyQuaternion(this.playerShip.mesh.quaternion);

        // Moved camera further back (-80) and up (30) to make ship look smaller
        const cameraOffset = shipDir.clone().multiplyScalar(-80);
        cameraOffset.y += 30;

        const targetPos = shipPos.clone().add(cameraOffset);
        this.camera.position.lerp(targetPos, 0.1);

        // Look ahead of ship
        const lookTarget = shipPos.clone().add(shipDir.multiplyScalar(100));
        this.camera.lookAt(lookTarget);
    }

    checkStationProximity() {
        let nearestStation = null;
        let nearestDist = Infinity;

        for (const [id, station] of this.stations) {
            const dist = this.playerShip.mesh.position.distanceTo(station.mesh.position);

            if (dist < nearestDist) {
                nearestDist = dist;
                nearestStation = station;
            }

            // Update current location if very close
            if (dist < 200) {
                this.currentLocation = id;
            }
        }

        // Show target info for nearest station OR selected target
        const targetToDisplay = this.selectedTargetId ? this.stations.get(this.selectedTargetId) : nearestStation;

        if (targetToDisplay) {
            const dist = this.playerShip.mesh.position.distanceTo(targetToDisplay.mesh.position);
            this.hudTargetInfo.classList.remove('hidden');
            let label = targetToDisplay.data.name;
            if (this.autopilotEnabled && targetToDisplay.data.id === this.selectedTargetId) label += " [AP ENGAGED]";
            else if (this.selectedTargetId === targetToDisplay.data.id) label += " [TARGET]";

            this.hudTargetName.textContent = label;
            this.hudTargetDistance.textContent = `${Math.floor(dist)} km`;
        } else {
            this.hudTargetInfo.classList.add('hidden');
        }

        // Show dock prompt
        this.nearestStation = nearestStation; // Store for docking
        const dockPrompt = document.getElementById('dock-prompt');
        if (nearestDist < 200) { // Docking range
            dockPrompt.classList.remove('hidden');
            this.canDock = true;
        } else {
            dockPrompt.classList.add('hidden');
            this.canDock = false;
        }
    }

    tryDocking() {
        if (this.canDock && this.nearestStation && !this.dockedAt) {
            this.dock(this.nearestStation);
        }
    }

    dock(station) {
        this.dockedAt = station;
        this.currentLocation = station.data.id;
        document.getElementById('dock-prompt').classList.add('hidden');
        document.getElementById('station-ui').classList.remove('hidden');
        this.updateStationUI();

        // Stop ship
        if (this.playerShip) {
            this.playerShip.velocity.set(0, 0, 0);
            this.playerShip.angularVelocity.set(0, 0, 0);
        }
    }

    undock() {
        this.dockedAt = null;
        document.getElementById('station-ui').classList.add('hidden');
    }

    updateStationUI() {
        if (!this.dockedAt) return;

        document.getElementById('station-name').textContent = this.dockedAt.data.name;
        document.getElementById('ui-credits').textContent = this.credits.toLocaleString();
        document.getElementById('ui-cargo').textContent = `${this.cargo.length}/${this.cargoMax}`;

        // Render Market
        const marketList = document.getElementById('market-list');
        marketList.innerHTML = '';

        const priceMap = this.tradeManager.prices.get(this.dockedAt.data.id);

        this.commoditiesData.commodities.forEach(item => {
            if (!item.legal && this.dockedAt.data.type !== 'smuggler') return; // Hide contraband in lawful stations

            const price = priceMap.get(item.id);
            const playerAmount = this.cargo.filter(c => c === item.id).length;

            const itemEl = document.createElement('div');
            itemEl.className = 'market-item';
            itemEl.innerHTML = `
                <div class="item-info">
                    <div class="item-name">${item.name} (${item.category})</div>
                    <div class="item-price">${price} cr</div>
                </div>
                <div class="trade-stats">
                    On Ship: ${playerAmount}
                </div>
                <div class="trade-actions">
                    <button class="btn buy-btn" data-id="${item.id}">Buy</button>
                    ${playerAmount > 0 ? `<button class="btn sell-btn" data-id="${item.id}">Sell</button>` : ''}
                </div>
            `;

            marketList.appendChild(itemEl);
        });

        // Add listeners
        marketList.querySelectorAll('.buy-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (this.tradeManager.buy(e.target.dataset.id, 1)) {
                    this.updateStationUI();
                    this.updateHUD();
                    this.audioManager.playUIBeep();
                }
            });
        });

        marketList.querySelectorAll('.sell-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (this.tradeManager.sell(e.target.dataset.id, 1)) {
                    this.updateStationUI();
                    this.updateHUD();
                    this.audioManager.playUIBeep();
                }
            });
        });

        // Update stats
        if (this.playerShip) {
            document.getElementById('ui-fuel').textContent = '100'; // Placeholder
            document.getElementById('ui-hull').textContent = `${Math.floor(this.playerShip.hull)}/${Math.floor(this.playerShip.maxHull)}`;
        }
    }

    updateHUD() {
        this.hudCredits.textContent = this.credits.toLocaleString();
        this.hudCargo.textContent = this.cargo.length;
        this.hudCargoMax.textContent = this.cargoMax;

        const location = this.locationsData.locations.find(l => l.id === this.currentLocation);
        this.hudLocation.textContent = location ? location.name : 'Unknown';

        if (this.playerShip) {
            this.hudSpeed.textContent = Math.floor(this.playerShip.velocity.length());
        }
    }
}
