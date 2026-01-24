import * as THREE from 'three';

export class Ship {
    constructor(mesh, data, upgradesData) {
        this.mesh = mesh;
        this.data = data;
        this.upgradesData = upgradesData; // Store upgrade definitions

        // Upgrade State
        this.upgradeLevels = {
            engine: 0,
            cargo: 0,
            hull: 0,
            shield: 0,
            computer: 0,
            defense: 0
        };

        // Physics
        this.velocity = new THREE.Vector3();
        this.angularVelocity = new THREE.Vector3();

        // Rotation Smoothing
        this.targetQuaternion = this.mesh.quaternion.clone();
        this.rotationSpeed = 2.0;
        this.damping = 0.1;

        // Init Stats (Defaults before recalc)
        this.maxHull = 100;
        this.hull = this.maxHull;
        this.maxShield = 50 + (data.combat * 25);
        this.shield = this.maxShield;
        this.maxFuel = 1000;
        this.fuel = this.maxFuel;
        this.maxCargo = data.cargo;

        this.recalculateStats();

        // State
        this.boosting = false;
        this.boostMultiplier = 2;
        this.isDead = false;

        // Add engine glow
        this.createEngineGlow();
    }

    recalculateStats() {
        // Safe Data Access
        const d = this.data || {};
        const baseSpeed = (d.speed || 4) * 300;
        const baseAccel = (d.speed || 4) * 150;
        const baseStrafe = (d.speed || 4) * 50;
        const baseHull = 100;
        const baseShield = 50 + ((d.combat || 1) * 25);
        const baseCargo = d.cargo || 20;

        // Upgrade Multipliers (Safe Defaults)
        let engineMult = 1;
        let cargoBonus = 0;
        let hullBonus = 0;
        let shieldBonus = 0;

        // Calculate bonuses if data exists
        if (this.upgradesData && this.upgradesData.systems) {
            const u = this.upgradeLevels || { engine: 0, cargo: 0, hull: 0, shield: 0 };
            const sys = this.upgradesData.systems;

            if (sys.engine) engineMult = 1 + (u.engine || 0) * (sys.engine.statMultiplier || 0.1);
            if (sys.cargo) cargoBonus = (u.cargo || 0) * (sys.cargo.statBonus || 10);
            if (sys.hull) hullBonus = (u.hull || 0) * (sys.hull.statBonus || 25);
            if (sys.shield) shieldBonus = (u.shield || 0) * (sys.shield.statBonus || 15);
        }

        // Apply Stats & Sanitize
        this.maxSpeed = baseSpeed * engineMult;
        this.acceleration = baseAccel * engineMult;
        this.strafeSpeed = baseStrafe * engineMult;
        this.turnSpeed = 1.5 * (1 + (this.upgradeLevels?.engine || 0) * 0.05);

        // Cargo
        this.maxCargo = baseCargo + cargoBonus;
        if (isNaN(this.maxCargo)) this.maxCargo = 20;

        // Hull
        this.maxHull = baseHull + hullBonus;
        if (isNaN(this.maxHull)) this.maxHull = 100;
        // Clamp current hull
        if (this.hull > this.maxHull) this.hull = this.maxHull;
        if (isNaN(this.hull) || this.hull < 0) this.hull = this.maxHull;

        // Shield
        this.maxShield = baseShield + shieldBonus;
        if (isNaN(this.maxShield)) this.maxShield = 50;
        if (this.shield > this.maxShield) this.shield = this.maxShield;
        if (isNaN(this.shield) || this.shield < 0) this.shield = this.maxShield;

        this.shieldRechargeRate = 5 + ((this.upgradeLevels?.shield || 0) * 1);

        // Fuel
        this.maxFuel = 1000;
        if (this.fuel > this.maxFuel) this.fuel = this.maxFuel;
        if (isNaN(this.fuel) || this.fuel < 0) this.fuel = this.maxFuel;

        this.fuelConsumption = 5;

        // Combat
        this.weaponDamage = 10 + ((d.combat || 1) * 5);
        this.fireRate = 0.2;
        this.fireCooldown = 0;
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
            // Boost consumes more fuel
            if (this.fuel > 0) this.fuel -= this.fuelConsumption * 2 * delta;
        } else if (direction !== 0) {
            if (this.fuel > 0) this.fuel -= this.fuelConsumption * delta;
        }

        // If out of fuel, reduce thrust efficacy
        if (this.fuel <= 0) {
            this.fuel = 0;
            accel *= 0.1; // Limp mode
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
        const dragFactor = Math.pow(0.5, delta); // Lose 50% speed per second
        this.velocity.multiplyScalar(dragFactor);

        // Fuel Consumption logic
        // We don't have direct access to "thrusting" boolean here easily unless we store it or check acceleration?
        // Actually Game.js calls thrust(). Let's add fuel drain there instead?
        // Or just drain if velocity is high? No, that's bad for drifting.
        // Let's handle fuel drain in thrust() method.

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
