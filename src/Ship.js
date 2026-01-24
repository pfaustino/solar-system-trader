import * as THREE from 'three';

export class Ship {
    constructor(mesh, data) {
        this.mesh = mesh;
        this.data = data;

        // Physics
        this.velocity = new THREE.Vector3();
        this.angularVelocity = new THREE.Vector3();

        // Stats from data
        // Increased base speed multiplier
        this.maxSpeed = data.speed * 300; // Was 100
        this.acceleration = data.speed * 150; // Was 20 (Faster accel)
        this.turnSpeed = 1.5;
        this.strafeSpeed = data.speed * 50;

        // Combat Stats
        this.maxHull = 100;
        this.hull = this.maxHull;
        this.maxShield = 50 + (data.combat * 25);
        this.shield = this.maxShield;
        this.shieldRechargeRate = 5;
        this.shieldRechargeDelay = 0;

        this.weaponDamage = 10 + (data.combat * 5);
        this.fireRate = 0.2; // Seconds
        this.fireCooldown = 0;

        // State
        this.boosting = false;
        this.boostMultiplier = 2;
        this.isDead = false;

        // Rotation Smoothing
        this.targetQuaternion = this.mesh.quaternion.clone();
        this.rotationSpeed = 2.0;
        this.damping = 0.1; // Slerp factor (lower = smoother/heavier)

        // Add engine glow
        this.createEngineGlow();
    }

    createEngineGlow() {
        const glowGeometry = new THREE.SphereGeometry(0.5, 8, 8);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.8
        });

        this.engineGlow = new THREE.Mesh(glowGeometry, glowMaterial);
        this.engineGlow.position.set(0, 0, -1);
        this.mesh.add(this.engineGlow);
    }

    canFire() {
        return this.fireCooldown <= 0;
    }

    fire() {
        this.fireCooldown = this.fireRate;
        return {
            position: this.mesh.position.clone(),
            quaternion: this.mesh.quaternion.clone(),
            damage: this.weaponDamage,
            isPlayer: true
        };
    }

    takeDamage(amount) {
        // Shield absorbs damage first
        if (this.shield > 0) {
            this.shield -= amount;
            this.shieldRechargeDelay = 3; // 3 seconds before recharge
            if (this.shield < 0) {
                // Shield break
                const overflow = -this.shield;
                this.shield = 0;
                this.hull -= overflow;
            }
        } else {
            this.hull -= amount;
        }

        if (this.hull <= 0) {
            this.hull = 0;
            this.isDead = true;
            // Explosion visual would be triggered by manager
        }
    }

    thrust(direction, delta) {
        const forward = new THREE.Vector3(0, 0, 1);
        forward.applyQuaternion(this.mesh.quaternion);

        let accel = this.acceleration * direction * delta;
        if (this.boosting && direction > 0) {
            accel *= this.boostMultiplier;
        }

        this.velocity.add(forward.multiplyScalar(accel));

        // Clamp speed
        const maxSpd = this.boosting ? this.maxSpeed * this.boostMultiplier : this.maxSpeed;
        if (this.velocity.length() > maxSpd) {
            this.velocity.setLength(maxSpd);
        }

        // Update engine glow
        this.engineGlow.material.opacity = direction > 0 ? 0.9 : 0.3;
        this.engineGlow.scale.setScalar(direction > 0 ? (this.boosting ? 2 : 1.2) : 0.5);
    }

    strafe(direction, delta) {
        const right = new THREE.Vector3(1, 0, 0);
        right.applyQuaternion(this.mesh.quaternion);
        this.velocity.add(right.multiplyScalar(this.strafeSpeed * direction * delta));
    }

    strafeVertical(direction, delta) {
        const up = new THREE.Vector3(0, 1, 0);
        up.applyQuaternion(this.mesh.quaternion);
        this.velocity.add(up.multiplyScalar(this.strafeSpeed * direction * delta));
    }

    pitch(amount, delta) {
        // Rotate target quaternion on X axis
        const axis = new THREE.Vector3(1, 0, 0);
        axis.applyQuaternion(this.mesh.quaternion); // Rotate axis to match ship
        // Wait, for local pitch we want local X axis. 
        // But if we modify targetQuaternion, we should apply relative to IT?
        // Simpler: Create a delta quaternion and multiply.

        const q = new THREE.Quaternion();
        q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), amount * this.rotationSpeed * delta);
        this.targetQuaternion.multiply(q);
    }

    yaw(amount, delta) {
        const q = new THREE.Quaternion();
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), amount * this.rotationSpeed * delta);
        this.targetQuaternion.multiply(q);
    }

    roll(amount, delta) {
        const q = new THREE.Quaternion();
        q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), amount * this.rotationSpeed * delta);
        this.targetQuaternion.multiply(q);
    }

    update(delta) {
        // Slerp rotation towards target for smooth, weighty feel
        this.mesh.quaternion.slerp(this.targetQuaternion, this.damping);

        // Apply velocity
        this.mesh.position.add(this.velocity.clone().multiplyScalar(delta));

        // Apply drag (Use delta for frame-rate independence)
        // Drag equation: F = -coefficient * v
        // New velocity = v * (1 - drag * delta)
        const dragFactor = Math.pow(0.5, delta); // Lose 50% speed per second
        this.velocity.multiplyScalar(dragFactor);

        // Cooldowns
        if (this.fireCooldown > 0) this.fireCooldown -= delta;

        // Shield Recharge
        if (this.shieldRechargeDelay > 0) {
            this.shieldRechargeDelay -= delta;
        } else if (this.shield < this.maxShield) {
            this.shield += this.shieldRechargeRate * delta;
            if (this.shield > this.maxShield) this.shield = this.maxShield;
        }

        // Dim engine when not thrusting
        this.engineGlow.material.opacity *= 0.95;
        if (this.engineGlow.material.opacity < 0.2) {
            this.engineGlow.material.opacity = 0.2;
        }
    }
}
