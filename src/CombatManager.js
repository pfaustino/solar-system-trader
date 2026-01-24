import * as THREE from 'three';
import { EnemyShip } from './EnemyShip.js';

export class CombatManager {
    constructor(game) {
        this.game = game;
        this.projectiles = [];
        this.enemies = [];
        this.spawnTimer = 0;
        this.spawnInterval = 10; // Try to spawn every 10s

        // Laser material
        this.playerLaserMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        this.enemyLaserMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        this.laserGeo = new THREE.CylinderGeometry(0.5, 0.5, 10, 4);
        this.laserGeo.rotateX(Math.PI / 2); // Point forward
    }

    update(delta) {
        if (!this.game.playerShip) return;

        // Spawn Enemies
        this.spawnLogic(delta);

        // Update Enemies
        this.enemies.forEach((enemy, index) => {
            enemy.update(delta, this.game.playerShip);

            // Enemy Fire
            if (enemy.canFire()) {
                const data = enemy.fire();
                this.spawnProjectile(data);
                this.game.audioManager.playEnemyLaser();
            }

            // Remove dead enemies
            if (enemy.isDead) {
                this.enemies.splice(index, 1);
                // Reward
                this.game.credits += 100 * (enemy.stats.scale);
                this.game.updateHUD();
                this.game.audioManager.playExplosion(); // Explosion Sound
            }
        });

        // Update Projectiles
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.mesh.position.add(p.velocity.clone().multiplyScalar(delta));
            p.life -= delta;

            // Collision Detection
            if (p.isPlayer) {
                // Check vs Enemies
                for (const enemy of this.enemies) {
                    if (p.mesh.position.distanceTo(enemy.mesh.position) < 10 * enemy.stats.scale) {
                        enemy.takeDamage(p.damage);
                        this.removeProjectile(i);
                        break;
                    }
                }
            } else {
                // Check vs Player
                if (p.mesh.position.distanceTo(this.game.playerShip.mesh.position) < 10) {
                    this.game.playerShip.takeDamage(p.damage);
                    this.removeProjectile(i);
                    this.game.updateHUD(); // Update hull display
                }
            }

            if (p.life <= 0) {
                this.removeProjectile(i);
            }
        }

        // Player Fire Input
        if (this.game.keys['Space']) {
            if (this.game.playerShip.canFire()) {
                const data = this.game.playerShip.fire();
                this.spawnProjectile(data);
                this.game.audioManager.playLaser();
            }
        }

        // Auto-Defense System
        if (this.game.playerShip.upgradeLevels && this.game.playerShip.upgradeLevels.defense > 0) {
            this.handleAutoDefense(delta);
        }
    }

    handleAutoDefense(delta) {
        if (!this.autoDefenseTimer) this.autoDefenseTimer = 0;
        this.autoDefenseTimer -= delta;

        if (this.autoDefenseTimer > 0) return;

        const level = this.game.playerShip.upgradeLevels.defense;
        const range = 500 + (level * 200); // 700 to 2500
        const fireRate = Math.max(0.1, 2.0 - (level * 0.15)); // 1.85s down to 0.5s

        // Find nearest enemy
        let nearest = null;
        let minDest = range;

        for (const enemy of this.enemies) {
            const dist = this.game.playerShip.mesh.position.distanceTo(enemy.mesh.position);
            if (dist < minDest) {
                minDest = dist;
                nearest = enemy;
            }
        }

        if (nearest) {
            // Calculate direction to enemy with predictive aim?
            // Simple direct aim for now
            const direction = nearest.mesh.position.clone().sub(this.game.playerShip.mesh.position).normalize();

            // Create quaternion from direction
            const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);

            // Offset slightly so it's visible (outside ship hull)
            const startPos = this.game.playerShip.mesh.position.clone().add(direction.clone().multiplyScalar(3));

            // Spawn projectile
            this.spawnProjectile({
                position: startPos,
                quaternion: quaternion,
                damage: 5 + (level * 2), // Damage scales
                isPlayer: true
            });

            // Turret Sound
            if (Math.random() > 0.5) this.game.audioManager.playTurret();

            this.autoDefenseTimer = fireRate;
        }
    }

    spawnLogic(delta) {
        // Only spawn if in dangerous area (outer system) or random chance
        // For testing, spawn if few enemies

        // Check danger level of current location
        const loc = this.game.locationsData.locations.find(l => l.id === this.game.currentLocation);
        const danger = loc ? loc.dangerLevel : 1;

        if (this.enemies.length < danger) {
            this.spawnTimer += delta;
            if (this.spawnTimer > this.spawnInterval / danger) {
                this.spawnTimer = 0;
                this.spawnEnemy();
            }
        }
    }

    spawnEnemy() {
        // Spawn near player but not too close
        const offset = new THREE.Vector3(
            (Math.random() - 0.5) * 1000,
            (Math.random() - 0.5) * 200,
            (Math.random() - 0.5) * 1000
        );
        // Ensure min distance
        if (offset.length() < 500) offset.setLength(500);

        const pos = this.game.playerShip.mesh.position.clone().add(offset);

        const types = ['Raider', 'Marauder', 'Dreadnought'];
        const type = types[Math.floor(Math.random() * Math.min(types.length, 2))]; // Mainly raiders/marauders

        const enemy = new EnemyShip(this.game.scene, pos, type);
        this.enemies.push(enemy);
    }

    spawnProjectile(data) {
        const mesh = new THREE.Mesh(this.laserGeo, data.isPlayer ? this.playerLaserMat : this.enemyLaserMat);
        mesh.position.copy(data.position);
        mesh.quaternion.copy(data.quaternion);

        const speed = 1000;
        const velocity = new THREE.Vector3(0, 0, 1).applyQuaternion(data.quaternion).multiplyScalar(speed);

        this.game.scene.add(mesh);

        this.projectiles.push({
            mesh: mesh,
            velocity: velocity,
            life: 2.0, // 2 seconds range
            damage: data.damage,
            isPlayer: data.isPlayer
        });
    }

    removeProjectile(index) {
        const p = this.projectiles[index];
        this.game.scene.remove(p.mesh);
        this.projectiles.splice(index, 1);
    }
}
