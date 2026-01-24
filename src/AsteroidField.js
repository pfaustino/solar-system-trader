import * as THREE from 'three';

export class AsteroidField {
    constructor(scene, position, count = 100, radius = 500) {
        this.scene = scene;
        this.position = position; // vector3 center
        this.count = count;
        this.radius = radius;

        this.asteroids = []; // Metadata for each asteroid
        this.mesh = null;

        this.init();
    }

    init() {
        // Create geometry - simple dodecahedron for low poly look
        const geometry = new THREE.DodecahedronGeometry(1, 0);

        // Material
        const material = new THREE.MeshStandardMaterial({
            color: 0x888888,
            roughness: 0.8,
            metalness: 0.2,
            flatShading: true
        });

        // Instanced Mesh
        this.mesh = new THREE.InstancedMesh(geometry, material, this.count);
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

        const dummy = new THREE.Object3D();
        const color = new THREE.Color();

        for (let i = 0; i < this.count; i++) {
            // Random position in sphere
            const r = Math.cbrt(Math.random()) * this.radius; // Uniform distribution
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);

            const x = this.position.x + r * Math.sin(phi) * Math.cos(theta);
            const y = this.position.y + r * Math.sin(phi) * Math.sin(theta);
            const z = this.position.z + r * Math.cos(phi);

            dummy.position.set(x, y, z);

            // Random rotation
            dummy.rotation.set(
                Math.random() * Math.PI,
                Math.random() * Math.PI,
                Math.random() * Math.PI
            );

            // Random scale
            const scale = 5 + Math.random() * 15;
            dummy.scale.set(scale, scale, scale);

            dummy.updateMatrix();
            this.mesh.setMatrixAt(i, dummy.matrix);

            // Store data
            this.asteroids.push({
                id: i,
                position: new THREE.Vector3(x, y, z),
                scale: scale,
                resource: 'ore', // Default
                amount: Math.floor(scale * 2), // Resource amount based on size
                active: true
            });
        }

        this.mesh.computeBoundingSphere();
        this.scene.add(this.mesh);
    }

    destroyAsteroid(index) {
        if (!this.asteroids[index].active) return;

        this.asteroids[index].active = false;

        // Scale to 0 to "remove"
        const dummy = new THREE.Object3D();
        dummy.scale.set(0, 0, 0);
        dummy.updateMatrix();
        this.mesh.setMatrixAt(index, dummy.matrix);
        this.mesh.instanceMatrix.needsUpdate = true;
    }

    update(delta) {
        // Optional: Slow rotation for dynamic feel? 
        // Expensive to update 1000 matrices every frame. 
        // Maybe just rotating the whole field slightly?
        this.mesh.rotation.y += delta * 0.01;
    }
}
