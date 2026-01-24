import * as THREE from 'three';

export class EnemyShip {
    constructor(scene, position, type = 'Raider') {
        this.scene = scene;
        this.type = type;

        // Configure stats based on type
        this.stats = this.getStats(type);

        // Create Mesh
        this.mesh = this.createMesh();
        this.mesh.position.copy(position);
        this.scene.add(this.mesh);

        // Combat State
        this.hull = this.stats.hull;
        this.isDead = false;
        this.fireCooldown = 0;
        this.velocity = new THREE.Vector3();

        // AI State
        this.target = null; // Player
        this.state = 'PATROL'; // PATROL, CHASE, ATTACK, FLEE
    }

    getStats(type) {
        switch (type) {
            case 'Dreadnought':
                return { hull: 300, speed: 1.5, turn: 0.5, damage: 20, color: 0xff0000, fireRate: 1.0, scale: 3 };
            case 'Marauder':
                return { hull: 100, speed: 2.5, turn: 1.0, damage: 10, color: 0xff8800, fireRate: 0.5, scale: 2 };
            case 'Raider':
            default:
                return { hull: 50, speed: 4.0, turn: 2.0, damage: 5, color: 0xffff00, fireRate: 0.3, scale: 1.5 };
        }
    }

    createMesh() {
        // Procedural enemy ship (spiky/aggressive look)
        const geometry = new THREE.ConeGeometry(1, 4, 4);
        geometry.rotateX(Math.PI / 2); // Point forward
        const material = new THREE.MeshStandardMaterial({
            color: this.stats.color,
            roughness: 0.3,
            metalness: 0.8
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.scale.setScalar(this.stats.scale);

        // Add engine glow (red for enemies)
        const glowGeo = new THREE.SphereGeometry(0.3, 8, 8);
        const glowMat = new THREE.MeshBasicMaterial({ color: 0xff3300 });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.position.set(0, 0, -2);
        mesh.add(glow);

        return mesh;
    }

    update(delta, playerShip) {
        if (this.isDead) return;

        this.target = playerShip;

        // AI Logic
        const dist = this.mesh.position.distanceTo(playerShip.mesh.position);

        // State Machine
        if (this.hull < this.stats.hull * 0.3 && this.type === 'Raider') {
            this.state = 'FLEE';
        } else if (dist < 800) {
            this.state = 'ATTACK';
        } else if (dist < 2000) {
            this.state = 'CHASE';
        } else {
            this.state = 'PATROL';
        }

        // Behavior
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.mesh.quaternion);
        const toTarget = playerShip.mesh.position.clone().sub(this.mesh.position).normalize();

        if (this.state === 'CHASE' || this.state === 'ATTACK') {
            // Turn towards player
            const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), toTarget);
            this.mesh.quaternion.slerp(quaternion, this.stats.turn * delta);

            // Move forward
            let speed = this.stats.speed * 50; // Scaled speed
            if (this.state === 'ATTACK' && dist < 300) speed *= 0.5; // Slow down to aim

            this.velocity.lerp(forward.multiplyScalar(speed), delta);

            // Fire
            if (this.state === 'ATTACK' && this.fireCooldown <= 0) {
                // Check angle
                if (forward.dot(toTarget) > 0.9) { // Roughly facing player
                    // Firing handled by manager polling
                }
            }
        } else if (this.state === 'FLEE') {
            // Turn away
            const away = toTarget.negate();
            const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), away);
            this.mesh.quaternion.slerp(quaternion, this.stats.turn * delta);
            this.velocity.lerp(forward.multiplyScalar(this.stats.speed * 80), delta); // Panic speed
        } else {
            // Patrol: simple circle or drift
            this.velocity.multiplyScalar(0.95); // Slow down
        }

        // Apply Physics
        this.mesh.position.add(this.velocity.clone().multiplyScalar(delta));
        if (this.fireCooldown > 0) this.fireCooldown -= delta;
    }

    canFire() {
        return this.fireCooldown <= 0 && this.state === 'ATTACK';
    }

    fire() {
        this.fireCooldown = this.stats.fireRate + Math.random() * 0.5;
        return {
            position: this.mesh.position.clone(),
            quaternion: this.mesh.quaternion.clone(),
            damage: this.stats.damage,
            isPlayer: false
        };
    }

    takeDamage(amount) {
        this.hull -= amount;
        if (this.hull <= 0) {
            this.isDead = true;
            this.scene.remove(this.mesh);
        }
    }
}
