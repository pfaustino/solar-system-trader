import * as THREE from 'three';

export class Station {
    constructor(data) {
        this.data = data;
        this.mesh = this.createMesh();
    }

    createMesh() {
        const group = new THREE.Group();

        // Station type determines appearance
        let color, size;
        switch (this.data.type) {
            case 'hub':
                color = 0x4488ff;
                size = 80;
                break;
            case 'mining':
                color = 0xaa6633;
                size = 40;
                break;
            case 'industrial':
                color = 0x888888;
                size = 60;
                break;
            case 'refinery':
                color = 0xff8844;
                size = 50;
                break;
            case 'research':
                color = 0x44ff88;
                size = 35;
                break;
            case 'smuggler':
                color = 0x880044;
                size = 45;
                break;
            case 'edge':
                color = 0x8844ff;
                size = 30;
                break;
            default:
                color = 0x666666;
                size = 40;
        }

        // Main structure (octahedron for sci-fi look)
        const mainGeometry = new THREE.OctahedronGeometry(size, 0);
        const mainMaterial = new THREE.MeshStandardMaterial({
            color: color,
            flatShading: true,
            emissive: color,
            emissiveIntensity: 0.2
        });
        const main = new THREE.Mesh(mainGeometry, mainMaterial);
        group.add(main);

        // Ring around station
        const ringGeometry = new THREE.TorusGeometry(size * 1.5, size * 0.1, 8, 16);
        const ringMaterial = new THREE.MeshStandardMaterial({
            color: 0x444444,
            flatShading: true
        });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.rotation.x = Math.PI / 2;
        group.add(ring);

        // Docking lights
        const lightGeometry = new THREE.SphereGeometry(size * 0.1, 4, 4);
        const lightMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });

        for (let i = 0; i < 4; i++) {
            const light = new THREE.Mesh(lightGeometry, lightMaterial);
            const angle = (i / 4) * Math.PI * 2;
            light.position.set(
                Math.cos(angle) * size * 1.5,
                0,
                Math.sin(angle) * size * 1.5
            );
            group.add(light);
        }

        // Add a point light for visibility
        const pointLight = new THREE.PointLight(color, 1, size * 10);
        group.add(pointLight);

        // Add Planet (Landmark)
        const planetGeo = new THREE.SphereGeometry(size * 30, 32, 32);
        const planetMat = new THREE.MeshStandardMaterial({
            color: color,
            roughness: 0.8,
            metalness: 0.1,
            flatShading: true
        });
        const planet = new THREE.Mesh(planetGeo, planetMat);

        // Offset so station orbits it
        // Planet is HUGE (size * 30), so offset must be larger to not clip
        planet.position.set(size * 40, -size * 20, -size * 40);
        group.add(planet);

        return group;
    }

    update(delta) {
        // Slowly rotate
        this.mesh.rotation.y += delta * 0.1;
    }
}
