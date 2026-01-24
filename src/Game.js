import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Ship } from './Ship.js';
import { Station } from './Station.js';
import { TradeManager } from './TradeManager.js';
import { QuestManager } from './QuestManager.js';
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
        this.questManager = new QuestManager(this);
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

        // HUD Status Bars
        this.hudHullBar = document.getElementById('hull-bar');
        this.hudShieldBar = document.getElementById('shield-bar');
        this.hudFuelBar = document.getElementById('fuel-bar');
    }

    async init() {
        // Load game data
        await this.loadData();

        // Init systems
        this.tradeManager.init();
        this.questManager.init();
        await this.audioManager.load(); // Load sounds

        // Load player ship
        await this.loadPlayerShip();

        // Create stations
        this.createStations();

        // Create asteroid fields
        this.createAsteroidFields();

        // Position player with save check
        if (!this.loadGame()) {
            const earthPos = this.locationsData.locations.find(l => l.id === 'earth').position;
            this.playerShip.mesh.position.set(earthPos.x + 100, earthPos.y, earthPos.z);
        } else {
            // Restore position near saved location
            const loc = this.locationsData.locations.find(l => l.id === this.currentLocation);
            if (loc) {
                // We dock automatically if saved at location? 
                // Or just spawn near? 
                // User expects to be docked?
                // Let's spawn near.
                this.playerShip.mesh.position.set(loc.position.x + 50, loc.position.y, loc.position.z + 50);
                this.playerShip.velocity.set(0, 0, 0);
            }
            this.updateHUD();
        }

        // Initialize Map
        this.createSolarMap();

        // Position camera behind ship
        this.updateCamera();
    }

    async loadData() {
        const [ships, locations, commodities, upgrades] = await Promise.all([
            fetch('./data/ships.json').then(r => r.json()),
            fetch('./data/locations.json').then(r => r.json()),
            fetch('./data/commodities.json').then(r => r.json()),
            fetch('./data/upgrades.json').then(r => r.json())
        ]);

        this.shipsData = ships;
        this.locationsData = locations;
        this.commoditiesData = commodities;
        this.upgradesData = upgrades;
    }

    async loadPlayerShip() {
        const loader = new GLTFLoader();
        const starterShip = this.shipsData.ships[0]; // Alpha - starter ship

        try {
            const gltf = await loader.loadAsync(`./assets/${starterShip.model}`);
            this.playerShip = new Ship(gltf.scene, starterShip, this.upgradesData);
            this.scene.add(this.playerShip.mesh);

            // Scale ship appropriately
            this.playerShip.mesh.scale.setScalar(5);

            this.cargoMax = this.playerShip.maxCargo;
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

        this.playerShip = new Ship(mesh, shipData, this.upgradesData);
        this.scene.add(this.playerShip.mesh);

        this.cargoMax = this.playerShip.maxCargo;
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
            if (e.code === 'Comma') this.cycleTarget(-1);
            if (e.code === 'Period') this.cycleTarget(1);
            if (e.code === 'KeyP') this.toggleAutopilot();
        });
    }

    createSolarMap() {
        const container = document.getElementById('solar-map');
        container.innerHTML = '';
        if (!this.locationsData) return;

        this.locationsData.locations.forEach(loc => {
            const node = document.createElement('div');
            node.className = 'map-node';
            node.dataset.id = loc.id;
            node.dataset.name = loc.name;
            container.appendChild(node);
        });
        this.updateSolarMap();
    }

    updateSolarMap() {
        const nodes = document.querySelectorAll('.map-node');
        nodes.forEach(n => {
            n.classList.remove('visiting', 'targeted');
            if (n.dataset.id === this.currentLocation) n.classList.add('visiting');
            if (n.dataset.id === this.selectedTargetId) n.classList.add('targeted');
        });
    }

    cycleTarget(direction) {
        if (!this.locationsData) return;

        const locs = this.locationsData.locations;
        let index = -1;

        if (this.selectedTargetId) {
            index = locs.findIndex(l => l.id === this.selectedTargetId);
        }

        let newIndex = index + direction;
        if (newIndex >= locs.length) newIndex = 0;
        if (newIndex < 0) newIndex = locs.length - 1;

        const target = locs[newIndex];
        this.selectedTargetId = target.id;

        this.audioManager.playUIBeep();

        // Update Target UI
        this.hudTargetInfo.classList.remove('hidden');
        const status = this.autopilotEnabled ? "[AP ENGAGED]" : "[SELECTED]";
        this.hudTargetName.textContent = `${target.name} ${status}`;

        // Ensure distance is shown
        if (this.playerShip) {
            // Find target pos
            // We need station object or location position?
            // Location has position.
            const dist = this.playerShip.mesh.position.distanceTo(new THREE.Vector3(target.position.x, target.position.y, target.position.z));
            this.hudTargetDistance.textContent = `${Math.floor(dist)} km`;
        }

        this.updateSolarMap();
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
            if (dist < 200 && this.currentLocation !== id) {
                this.currentLocation = id;
                this.updateSolarMap();
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

        // Record prices if computer allows
        this.tradeManager.recordPrices(this.currentLocation);
        this.questManager.generateQuests(this.currentLocation);

        this.saveGame(); // Auto-save on dock

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
            document.getElementById('ui-credits').textContent = Math.floor(this.credits);
            document.getElementById('ui-cargo').textContent = `${this.cargo.length}/${this.cargoMax}`;
            document.getElementById('ui-fuel').textContent = `${Math.floor(this.playerShip.fuel)}/${this.playerShip.maxFuel}`;
            document.getElementById('ui-hull').textContent = `${Math.floor(this.playerShip.hull)}/${Math.floor(this.playerShip.maxHull)}`;
        }

        // Action Buttons
        const refuelBtn = document.getElementById('refuel-btn');
        const repairBtn = document.getElementById('repair-btn');

        // Remove old listeners to avoid duplicates (basic way, or just use onclick)
        refuelBtn.replaceWith(refuelBtn.cloneNode(true));
        repairBtn.replaceWith(repairBtn.cloneNode(true));

        // Re-select fresh nodes
        const newRefuel = document.getElementById('refuel-btn');
        const newRepair = document.getElementById('repair-btn');

        // Dynamic Refuel Logic
        const fuelPrice = this.tradeManager.prices.get(this.dockedAt.data.id)?.get('fuel') || 30;
        // Refuel cost: 1/100th of commodity price per unit
        const pricePerUnit = fuelPrice / 100;
        const neededFuel = Math.floor(this.playerShip.maxFuel - this.playerShip.fuel);
        const refuelCost = Math.ceil(neededFuel * pricePerUnit);

        newRefuel.textContent = neededFuel > 0 ? `Refuel Ship (${Math.max(1, refuelCost)}cr)` : `Fuel Tank Full`;
        newRefuel.disabled = (neededFuel <= 0 || this.credits < refuelCost);

        newRefuel.addEventListener('click', () => {
            const cost = Math.max(1, Math.ceil((Math.floor(this.playerShip.maxFuel - this.playerShip.fuel)) * (this.tradeManager.prices.get(this.dockedAt.data.id)?.get('fuel') / 100 || 0.3)));
            if (this.credits >= cost && this.playerShip.fuel < this.playerShip.maxFuel) {
                this.credits -= cost;
                this.playerShip.fuel = this.playerShip.maxFuel;
                this.audioManager.playUIBeep();
                this.updateStationUI();
                this.updateHUD();
            }
        });

        newRepair.addEventListener('click', () => {
            const cost = 50;
            if (this.credits >= cost && this.playerShip.hull < this.playerShip.maxHull) {
                this.credits -= cost;
                this.playerShip.hull = Math.min(this.playerShip.hull + 25, this.playerShip.maxHull); // Repair 25
                this.audioManager.playUIBeep();
                this.updateStationUI();
                this.updateHUD();
            }
        });

        // Setup Tabs
        const tabs = ['trade', 'outfit', 'analysis', 'missions'];
        const elements = {};

        tabs.forEach(t => {
            const btn = document.getElementById(`tab-${t}`);
            const view = document.getElementById(`view-${t}`);
            // Clone to clear listeners
            if (btn) {
                btn.replaceWith(btn.cloneNode(true));
                elements[`btn_${t}`] = document.getElementById(`tab-${t}`);
            }
            if (view) elements[`view_${t}`] = view;
        });

        // Loop again to add listeners
        tabs.forEach(t => {
            const btn = elements[`btn_${t}`];
            if (!btn) return;

            btn.addEventListener('click', () => {
                // Deactivate all
                tabs.forEach(other => {
                    if (elements[`btn_${other}`]) elements[`btn_${other}`].classList.remove('active');
                    if (elements[`view_${other}`]) elements[`view_${other}`].classList.add('hidden');
                });

                // Activate this
                btn.classList.add('active');
                if (elements[`view_${t}`]) elements[`view_${t}`].classList.remove('hidden');

                // Render content if needed
                if (t === 'analysis') this.renderAnalysisGrid();
                if (t === 'missions') this.renderMissions();
                if (t === 'outfit') this.updateOutfitterUI();
            });
        });

        // Show Analysis tab logic
        if (this.playerShip.upgradeLevels.computer > 0) {
            elements.btn_analysis.classList.remove('hidden');
        } else {
            elements.btn_analysis.classList.add('hidden');
        }

        // Initial render checks
        if (!elements.view_analysis.classList.contains('hidden')) this.renderAnalysisGrid();
        if (!elements.view_missions.classList.contains('hidden')) this.renderMissions();
        if (!elements.view_outfit.classList.contains('hidden')) this.updateOutfitterUI();
    }

    renderMissions() {
        const container = document.getElementById('mission-list');
        container.innerHTML = '';

        // 1. Available Missions
        const available = this.questManager.getAvailable(this.currentLocation);

        if (available.length > 0) {
            const header = document.createElement('div');
            header.className = 'mission-header';
            header.textContent = 'AVAILABLE CONTRACTS';
            container.appendChild(header);

            available.forEach(q => {
                const card = document.createElement('div');
                card.className = 'mission-card';
                card.innerHTML = `
                    <div class="mission-info">
                        <div class="mission-title">${q.item}</div>
                        <div class="mission-route">To: <strong>${q.targetName}</strong></div>
                        <div class="mission-reward">${q.reward} cr</div>
                    </div>
                    <button class="btn accept-btn" data-id="${q.id}">ACCEPT</button>
                `;
                container.appendChild(card);
            });
        } else {
            const msg = document.createElement('div');
            msg.className = 'mission-empty';
            msg.textContent = 'No contracts available at this station.';
            container.appendChild(msg);
        }

        // 2. Active Missions
        const active = this.questManager.getActive();
        if (active.length > 0) {
            const header = document.createElement('div');
            header.className = 'mission-header';
            header.textContent = 'ACTIVE MISSIONS';
            header.style.marginTop = '20px';
            container.appendChild(header);

            active.forEach(q => {
                const isHere = q.target === this.currentLocation;
                const card = document.createElement('div');
                card.className = 'mission-card active-mission';
                card.innerHTML = `
                    <div class="mission-info">
                        <div class="mission-title">${q.item}</div>
                        <div class="mission-route">Dest: <strong>${q.targetName}</strong></div>
                    </div>
                    ${isHere ? `<button class="btn complete-btn" data-id="${q.id}">COMPLETE</button>` : `<div class="mission-status">En Route</div>`}
                `;
                container.appendChild(card);
            });
        }

        // Listeners
        container.querySelectorAll('.accept-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (this.questManager.acceptQuest(btn.dataset.id)) {
                    this.renderMissions();
                    this.updateHUD(); // Update Global HUD
                    // Update Station Panel Stats Manually
                    document.getElementById('ui-credits').textContent = Math.floor(this.credits);
                    document.getElementById('ui-cargo').textContent = `${this.cargo.length}/${this.cargoMax}`;
                    this.saveGame();
                }
            });
        });

        container.querySelectorAll('.complete-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (this.questManager.completeQuest(btn.dataset.id)) {
                    this.renderMissions();
                    this.updateHUD(); // Update Global HUD
                    // Update Station Panel Stats Manually
                    document.getElementById('ui-credits').textContent = Math.floor(this.credits);
                    document.getElementById('ui-cargo').textContent = `${this.cargo.length}/${this.cargoMax}`;
                    this.saveGame();
                }
            });
        });
    }

    renderAnalysisGrid() {
        const container = document.getElementById('analysis-grid');
        container.innerHTML = '';

        // ... (Simulated Analysis logic from before, assuming TradeManager handles it)
        // I need to add renderAnalysisGrid implementation if it's missing or I will break the game.
        // Wait, I implemented it in Step 1011? 
        // Step 1011 was `Game.js`.
        // I am REPLACING the tabs setup block. I should PRESERVE or RE-ADD `renderAnalysisGrid`.
        // BUT Step 1011 failed?
        // Step 1011 `replace_file_content` failed in 1013 "target content not found".
        // So `renderAnalysisGrid` DOES NOT EXIST in Game.js currently.
        // I MUST IMPLEMENT IT HERE.

        const table = document.createElement('table');
        table.className = 'analysis-table';

        // Headers
        const knownLocs = new Set(['earth', 'luna', this.currentLocation]);
        // Also add logic to pull from TradeManager...
        // For simplicity, just use all locations for now

        const thead = document.createElement('tr');
        thead.innerHTML = `<th>Item</th>`;

        const sortedLocs = this.locationsData.locations; // Show all? Or just known?
        // Let's filter to known ones if possible, but showing all is okay for "System Wide" level.
        // Let's show all for now.

        sortedLocs.forEach(l => {
            const isCurrent = l.id === this.currentLocation;
            thead.innerHTML += `<th style="${isCurrent ? 'color:#0f0' : ''}">${l.name.substring(0, 3)}</th>`;
        });
        table.appendChild(thead);

        this.commoditiesData.commodities.forEach(item => {
            const row = document.createElement('tr');
            row.innerHTML = `<td>${item.name}</td>`;

            sortedLocs.forEach(l => {
                const data = this.tradeManager.getKnownPrice(l.id, item.id);
                if (!data) {
                    row.innerHTML += `<td>-</td>`;
                } else {
                    row.innerHTML += `<td>${data.price}</td>`;
                }
            });
            table.appendChild(row);
        });

        container.appendChild(table);

        // Populate Outfitter
        this.updateOutfitterUI();
    }

    updateOutfitterUI() {
        if (!this.playerShip || !this.upgradesData) return;

        const list = document.getElementById('upgrade-list');
        list.innerHTML = '';

        for (const [sysId, sysInfo] of Object.entries(this.upgradesData.systems)) {
            const currentLevel = this.playerShip.upgradeLevels[sysId] || 0;
            const nextLevel = currentLevel + 1;
            const isMaxed = currentLevel >= sysInfo.maxLevel;

            // Calculate Cost: costBase * (costMultiplier ^ currentLevel)
            const cost = Math.floor(sysInfo.costBase * Math.pow(sysInfo.costMultiplier, currentLevel));

            const itemEl = document.createElement('div');
            itemEl.className = 'upgrade-item';

            let btnHtml = '';
            if (isMaxed) {
                btnHtml = `<button class="btn" disabled>MAX LEVEL</button>`;
            } else {
                const canAfford = this.credits >= cost;
                btnHtml = `<button class="btn upgrade-btn" data-sys="${sysId}" data-cost="${cost}" ${canAfford ? '' : 'disabled'}>
                    Upgrade (${cost.toLocaleString()}cr)
                </button>`;
            }

            itemEl.innerHTML = `
                <div class="upgrade-info">
                    <div class="upgrade-name">${sysInfo.name} <span class="level-indicator">Lvl ${currentLevel}/${sysInfo.maxLevel}</span></div>
                    <div class="upgrade-desc">${sysInfo.description}</div>
                </div>
                <div class="upgrade-stats">
                    ${btnHtml}
                </div>
            `;
            list.appendChild(itemEl);
        }

        // Add listeners
        list.querySelectorAll('.upgrade-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.buyUpgrade(btn.dataset.sys, parseInt(btn.dataset.cost));
            });
        });
    }

    buyUpgrade(sysId, cost) {
        if (this.credits >= cost) {
            this.credits -= cost;
            this.playerShip.upgradeLevels[sysId]++;
            this.playerShip.recalculateStats();

            // Sync Game stats (Cargo Max might have changed)
            this.cargoMax = this.playerShip.maxCargo;

            this.audioManager.playUIBeep();

            this.updateHUD(); // Update stats on HUD
            this.updateStationUI(); // Refresh UI (re-renders outfitter too)
            this.saveGame();
        }
    }

    saveGame() {
        if (!this.playerShip) return;

        const data = {
            credits: this.credits,
            currentLocation: this.currentLocation,
            cargo: this.cargo,
            ship: {
                hull: this.playerShip.hull,
                fuel: this.playerShip.fuel,
                shield: this.playerShip.shield,
                upgradeLevels: this.playerShip.upgradeLevels
            },
            quests: {
                active: this.questManager.activeQuests,
                available: Array.from(this.questManager.availableQuests.entries())
            },
            tradeMemory: Array.from(this.tradeManager.lastKnownPrices.entries()).map(([k, v]) => [k, Array.from(v.entries())]),
            marketState: Array.from(this.tradeManager.prices.entries()).map(([k, v]) => [k, Array.from(v.entries())])
        };
        localStorage.setItem('sst_save', JSON.stringify(data));
        console.log("Game Saved");
    }

    loadGame() {
        const json = localStorage.getItem('sst_save');
        if (!json) return false;

        try {
            const data = JSON.parse(json);

            this.credits = Number(data.credits); // Ensure number
            this.currentLocation = data.currentLocation;
            this.cargo = data.cargo;

            // Ship
            if (data.ship) {
                this.playerShip.hull = Number(data.ship.hull);
                this.playerShip.fuel = Number(data.ship.fuel);
                this.playerShip.shield = Number(data.ship.shield);
                this.playerShip.upgradeLevels = data.ship.upgradeLevels;
                this.playerShip.recalculateStats();
                this.cargoMax = this.playerShip.maxCargo;
            }

            // Quests
            if (data.quests) {
                this.questManager.activeQuests = data.quests.active || [];
                if (data.quests.available) {
                    this.questManager.availableQuests = new Map(data.quests.available);
                }
            }

            // Trade Memory
            if (data.tradeMemory) {
                const memMap = new Map();
                data.tradeMemory.forEach(([locId, items]) => {
                    memMap.set(locId, new Map(items));
                });
                this.tradeManager.lastKnownPrices = memMap;
            }

            // Market State
            if (data.marketState) {
                const markMap = new Map();
                data.marketState.forEach(([locId, items]) => {
                    markMap.set(locId, new Map(items));
                });
                this.tradeManager.prices = markMap;
            }

            console.log("Game Loaded");
            return true;
        } catch (e) {
            console.error("Failed to load save:", e);
            return false;
        }
    }

    updateHUD() {
        this.hudCredits.textContent = Math.floor(this.credits);
        this.hudCargo.textContent = this.cargo.length;
        this.hudCargoMax.textContent = this.cargoMax;

        const location = this.locationsData.locations.find(l => l.id === this.currentLocation);
        this.hudLocation.textContent = location ? location.name : 'Unknown';

        if (this.playerShip) {
            // Speed
            const speed = Math.floor(this.playerShip.velocity.length() / 10);
            this.hudSpeed.textContent = speed;

            // Stats
            const hullPct = (this.playerShip.hull / this.playerShip.maxHull) * 100;
            const shieldPct = (this.playerShip.shield / this.playerShip.maxShield) * 100;
            const fuelPct = (this.playerShip.fuel / this.playerShip.maxFuel) * 100;

            this.hudHullBar.style.width = `${Math.max(0, hullPct)}%`;
            this.hudShieldBar.style.width = `${Math.max(0, shieldPct)}%`;
            this.hudFuelBar.style.width = `${Math.max(0, fuelPct)}%`;
        }
    }
}
