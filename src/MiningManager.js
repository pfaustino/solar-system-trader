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

        this.setupLaser();
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
            opacity: 0.6
        });

        this.laserBeam = new THREE.Mesh(geometry, material);
        this.laserBeam.visible = false;
    }

    update(delta) {
        if (!this.game.playerShip) return;

        // Ensure laser is attached to ship
        if (this.laserBeam.parent !== this.game.playerShip.mesh) {
            this.game.playerShip.mesh.add(this.laserBeam);
        }

        // Input: 'KeyZ' for mining laser
        const firing = this.game.keys['KeyZ'];

        if (firing) {
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
            this.mineTarget(hit.field, hit.instanceId, hit.asteroid, delta);
        }

        // Align and scale beam
        this.laserBeam.scale.set(1, 1, beamLength);
    }

    mineTarget(field, instanceId, asteroid, delta) {
        this.miningTimer += delta;

        if (this.miningTimer >= this.miningRate) {
            this.miningTimer = 0;

            // Extract logic
            if (this.game.cargo.length < this.game.cargoMax) {
                asteroid.amount--;
                this.game.cargo.push(asteroid.resource);
                this.game.updateHUD();

                if (asteroid.amount <= 0) {
                    field.destroyAsteroid(instanceId);
                }
            }
        }
    }
}
