import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class ShipyardPreview {
    constructor(game) {
        this.game = game;
        this.shipsData = null;
        this.loadedModels = new Map(); // shipId -> THREE.Group
        this.loadingPromises = new Map(); // shipId -> Promise

        // Dedicated renderer for UI overlays
        this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setClearColor(0x000000, 0); // Fully transparent
        this.renderer.autoClear = false; // We manage clearing

        const canvas = this.renderer.domElement;
        canvas.style.position = 'fixed';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.pointerEvents = 'none';
        canvas.style.zIndex = '2000'; // Above generic UI
        canvas.style.display = 'none'; // Hidden by default
        document.body.appendChild(canvas);

        // Preview rendering setup
        this.scene = new THREE.Scene();

        this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
        this.camera.position.set(0, 2, 5);
        this.camera.lookAt(0, 0, 0);

        // Lights for preview
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
        dirLight.position.set(5, 5, 5);
        this.scene.add(dirLight);

        const backLight = new THREE.DirectionalLight(0x4444ff, 0.8);
        backLight.position.set(-5, 0, -5);
        this.scene.add(backLight);

        // Handle resize
        window.addEventListener('resize', () => {
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            // Camera aspect is local to viewport, so we update it in render loop usually, 
            // but here the canvas is full screen.
        });
    }

    async init(shipsData) {
        this.shipsData = shipsData;

        // Preload all ship models
        const loader = new GLTFLoader();

        for (const ship of this.shipsData.ships) {
            if (this.loadedModels.has(ship.id)) continue;

            // Start loading
            const promise = loader.loadAsync(`./assets/${ship.model}`)
                .then(gltf => {
                    const model = gltf.scene;
                    this.loadedModels.set(ship.id, model);
                    return model;
                })
                .catch(err => {
                    console.error(`Failed to load preview for ${ship.id}`, err);
                });

            this.loadingPromises.set(ship.id, promise);
        }
    }

    render() {
        // Find all visible preview containers
        const containers = document.querySelectorAll('.ship-preview-container');

        if (containers.length === 0) {
            this.renderer.domElement.style.display = 'none';
            return;
        }

        this.renderer.domElement.style.display = 'block';

        // Clear entire canvas once
        this.renderer.clear();

        // Enable scissor test
        this.renderer.setScissorTest(true);

        // Get canvas size for coordinate mapping
        const rect = this.renderer.domElement.getBoundingClientRect();

        // Rotate ships globally for animation
        const time = Date.now() * 0.001;
        this.loadedModels.forEach(model => {
            model.rotation.y = time * 0.5;
            model.rotation.z = Math.sin(time * 0.5) * 0.1;
        });

        containers.forEach(container => {
            const shipId = container.dataset.id;
            const model = this.loadedModels.get(shipId);

            if (!model) return; // Not loaded yet

            // Calculate scissor area
            const elementRect = container.getBoundingClientRect();

            // Check if visible on screen
            if (elementRect.bottom < 0 || elementRect.top > rect.height ||
                elementRect.right < 0 || elementRect.left > rect.width) {
                return;
            }

            // WebGL coordinates are from bottom-left
            const width = elementRect.width;
            const height = elementRect.height;
            const left = elementRect.left;
            const bottom = rect.height - elementRect.bottom;

            this.renderer.setViewport(left, bottom, width, height);
            this.renderer.setScissor(left, bottom, width, height);

            // Prepare scene
            this.scene.children.forEach(c => {
                // Hide all other ships
                if (c.userData.isShip) c.visible = false;
            });

            // Ensure model is in scene and visible
            if (!model.parent) {
                model.userData.isShip = true;
                this.scene.add(model);
            }
            model.visible = true;

            // Adjust camera for this viewport
            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();

            this.renderer.render(this.scene, this.camera);

            // Hide again for cleanup (optional, but good practice)
            model.visible = false;
        });

        this.renderer.setScissorTest(false);
    }
}
