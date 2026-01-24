import * as THREE from 'three';

export class MiningManager {
    constructor(game) {
        this.game = game;
        this.isMining = false;
        this.laserBeam = null;
        this.miningTarget = null;
        this.miningTimer = 0;
        this.miningRate = 0.2; // Seconds per tick

        this.raycaster = new THREE.Raycaster();

        // Heat mechanics
        this.heat = 0;
        this.maxHeat = 100;
        this.coolRate = 20; // Heat per second
        this.heatRate = 30; // Heat per second
        this.overheated = false;

        // UI
        this.hud = document.getElementById('mining-hud');
        this.heatBar = document.getElementById('mining-heat-bar');
        this.statusText = document.getElementById('mining-status');

        this.setupLaser();
        this.setupParticles();
    }

    setupLaser() {
        // Use a cylinder for better visibility
        // Pointing down Z- which is typical forward
        // Radius 0.5, height 1 (will scale)
        const geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
        geometry.rotateX(Math.PI / 2); // Align with Z axis
        // Pivot point at the start (allow scaling Z to extend)
        geometry.translate(0, 0, 0.5);

        const material = new THREE.MeshBasicMaterial({
            color: 0xff00ff,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending
        });

        this.laserBeam = new THREE.Mesh(geometry, material);
        this.laserBeam.visible = false;
    }

    setupParticles() {
        this.particleCount = 50;
        this.particlesData = [];
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(this.particleCount * 3);

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const material = new THREE.PointsMaterial({
            color: 0xaaaaaa,
            size: 0.8,
            map: null, // Could add a texture
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending
        });

        this.particleSystem = new THREE.Points(geometry, material);
        this.game.scene.add(this.particleSystem);

        // Init data
        for (let i = 0; i < this.particleCount; i++) {
            this.particlesData.push({
                active: false,
                velocity: new THREE.Vector3(),
                life: 0
            });
            // Move off screen
            positions[i * 3] = 99999;
            positions[i * 3 + 1] = 99999;
            positions[i * 3 + 2] = 99999;
        }
    }

    spawnParticle(position, target) {
        // Find inactive particle
        const idx = this.particlesData.findIndex(p => !p.active);
        if (idx === -1) return;

        const p = this.particlesData[idx];
        p.active = true;
        p.life = 1.0;

        const posAttr = this.particleSystem.geometry.attributes.position;
        posAttr.setXYZ(idx, position.x, position.y, position.z);

        // Velocity towards target (ship)
        p.velocity.subVectors(target, position).normalize().multiplyScalar(20 + Math.random() * 30);

        // Add some random scatter
        p.velocity.x += (Math.random() - 0.5) * 5;
        p.velocity.y += (Math.random() - 0.5) * 5;
        p.velocity.z += (Math.random() - 0.5) * 5;
    }

    updateParticles(delta) {
        const posAttr = this.particleSystem.geometry.attributes.position;
        let needsUpdate = false;

        const shipPos = this.game.playerShip.mesh.position;

        for (let i = 0; i < this.particleCount; i++) {
            const p = this.particlesData[i];
            if (!p.active) continue;

            p.life -= delta;
            if (p.life <= 0) {
                p.active = false;
                posAttr.setXYZ(i, 99999, 99999, 99999);
                needsUpdate = true;
                continue;
            }

            // Move particle
            const x = posAttr.getX(i) + p.velocity.x * delta;
            const y = posAttr.getY(i) + p.velocity.y * delta;
            const z = posAttr.getZ(i) + p.velocity.z * delta;

            posAttr.setXYZ(i, x, y, z);

            // Attract to ship
            const dist = new THREE.Vector3(x, y, z).distanceTo(shipPos);
            if (dist < 5) { // Collected
                p.active = false;
                posAttr.setXYZ(i, 99999, 99999, 99999);
            }

            needsUpdate = true;
        }

        if (needsUpdate) {
            posAttr.needsUpdate = true;
        }
    }

    update(delta) {
        if (!this.game.playerShip) return;

        this.updateParticles(delta);

        // Ensure laser is attached to ship
        if (this.laserBeam.parent !== this.game.playerShip.mesh) {
            this.game.playerShip.mesh.add(this.laserBeam);
        }

        // Input: 'KeyZ' for mining laser
        const firing = this.game.keys['KeyZ'];

        // Heat Logic
        if (firing && !this.overheated) {
            this.heat += this.heatRate * delta;
            if (this.heat >= this.maxHeat) {
                this.heat = this.maxHeat;
                this.overheated = true;
                this.game.audioManager.playError();
                this.statusText.innerText = "OVERHEATED";
                this.statusText.classList.add('blink', 'warning');
                this.laserBeam.visible = false; // Cut off laser
            }
        } else {
            this.heat -= this.coolRate * delta;
            if (this.heat <= 0) {
                this.heat = 0;
                if (this.overheated) {
                    this.overheated = false;
                    this.statusText.innerText = "READY";
                    this.statusText.classList.remove('blink', 'warning');
                    this.game.audioManager.playUIBeep();
                }
            }
        }

        // Update UI
        if (this.heat > 0 || firing) {
            this.hud.classList.remove('hidden');
            this.heatBar.style.width = `${(this.heat / this.maxHeat) * 100}%`;
        } else {
            this.hud.classList.add('hidden');
        }

        // Firing Logic
        if (firing && !this.overheated) {
            this.fireLaser(delta);
        } else {
            this.laserBeam.visible = false;
            this.miningTimer = 0;
        }
    }

    fireLaser(delta) {
        this.laserBeam.visible = true;

        // Raycast forward
        const ship = this.game.playerShip.mesh;
        const origin = ship.position.clone();
        const direction = new THREE.Vector3(0, 0, 1).applyQuaternion(ship.quaternion).normalize();

        this.raycaster.set(origin, direction);
        this.raycaster.far = 2000; // Mining range

        // Check intersections with asteroid fields
        let hit = null;

        for (const field of this.game.asteroidFields) {
            const intersects = this.raycaster.intersectObject(field.mesh);
            if (intersects.length > 0) {
                const instanceId = intersects[0].instanceId;
                const asteroid = field.asteroids[instanceId];

                if (asteroid && asteroid.active) {
                    hit = { field, instanceId, point: intersects[0].point, asteroid };
                    break;
                }
            }
        }

        // Update laser visual length
        let beamLength = 2000;

        if (hit) {
            // Convert hit point to local space to get distance
            // Since laser is child of ship, local Z distance matches
            const dist = ship.position.distanceTo(hit.point);
            beamLength = dist;

            // Mine logic
            this.mineTarget(hit.field, hit.instanceId, hit.asteroid, delta, hit.point);
        }

        // Align and scale beam
        this.laserBeam.scale.set(1, 1, beamLength);
    }

    mineTarget(field, instanceId, asteroid, delta, hitPoint) {
        this.miningTimer += delta;

        // Visual FX
        if (Math.random() < 0.3) {
            this.spawnParticle(hitPoint, this.game.playerShip.mesh.position);
        }

        if (this.miningTimer >= this.miningRate) {
            this.miningTimer = 0;

            // Extract logic
            if (this.game.cargo.length < this.game.cargoMax) {
                asteroid.amount--;
                this.game.cargo.push(asteroid.resource);
                this.game.updateHUD();

                if (asteroid.amount <= 0) {
                    field.destroyAsteroid(instanceId);
                    this.game.audioManager.playExplosion();
                }
            } else {
                // Cargo full feedback?
                if (Math.random() < 0.05) {
                    // this.game.ui.showMessage("Cargo Full!");
                }
            }
        }
    }
}
