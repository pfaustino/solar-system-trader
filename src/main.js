import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Game } from './Game.js';

// Pixelation shader
const PixelShader = {
    uniforms: {
        'tDiffuse': { value: null },
        'resolution': { value: new THREE.Vector2(256, 144) }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform vec2 resolution;
        varying vec2 vUv;
        void main() {
            vec2 dxy = 1.0 / resolution;
            vec2 coord = dxy * floor(vUv / dxy);
            gl_FragColor = texture2D(tDiffuse, coord);
        }
    `
};

// Star Trail Shader
const StarTrailShader = {
    uniforms: {
        velocity: { value: new THREE.Vector3() },
        color: { value: new THREE.Color(0xffffff) }
    },
    vertexShader: `
        uniform vec3 velocity;
        attribute float trailIndex; // 0 = head, 1 = tail
        varying float vAlpha;
        
        void main() {
            vec3 pos = position;
            // Stretch tail opposite to velocity
            // Factor 0.2 determines trail length per unit of speed
            vec3 displacement = velocity * -0.2 * trailIndex;
            
            vec3 newPos = pos + displacement;
            
            vAlpha = 1.0 - trailIndex; // Head is opaque, tail transparent
            
            gl_Position = projectionMatrix * modelViewMatrix * vec4(newPos, 1.0);
        }
    `,
    fragmentShader: `
        uniform vec3 color;
        varying float vAlpha;
        
        void main() {
            gl_FragColor = vec4(color, vAlpha);
        }
    `
};

class Main {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.loadingScreen = document.getElementById('loading-screen');
        this.loadingProgress = document.querySelector('.loading-progress');
        this.loadingText = document.getElementById('loading-text');

        this.init();
    }

    async init() {
        // Setup renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: false
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(1); // Force low resolution for pixel effect
        this.renderer.setClearColor(0x000000);

        // Setup scene
        this.scene = new THREE.Scene();

        // Setup camera
        this.camera = new THREE.PerspectiveCamera(
            60,
            window.innerWidth / window.innerHeight,
            0.1,
            50000
        );
        this.camera.position.set(0, 10, 30);

        // Setup post-processing
        this.setupPostProcessing();

        // Create starfield (Points + Trails)
        this.createStarfield();

        // Add lights
        this.setupLights();

        // Initialize game
        this.updateLoading(50, 'Initializing game systems...');
        this.game = new Game(this.scene, this.camera, this.renderer);
        await this.game.init();

        // Hide loading screen
        this.updateLoading(100, 'Ready!');
        setTimeout(() => {
            this.loadingScreen.classList.add('hidden');
        }, 500);

        // Setup controls (temporary for testing)
        this.controls = new OrbitControls(this.camera, this.canvas);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.enabled = false; // Disable by default, use ship controls

        // Handle resize
        window.addEventListener('resize', () => this.onResize());

        // Start game loop
        this.clock = new THREE.Clock();
        this.animate();
    }

    setupPostProcessing() {
        this.composer = new EffectComposer(this.renderer);

        const renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(renderPass);

        // Pixelation pass
        this.pixelPass = new ShaderPass(PixelShader);
        this.pixelPass.uniforms.resolution.value.set(
            Math.floor(window.innerWidth / 4),
            Math.floor(window.innerHeight / 4)
        );
        this.composer.addPass(this.pixelPass);
    }

    createStarfield() {
        const starCount = 10000;

        // 1. Static Points (Background)
        const pointsGeo = new THREE.BufferGeometry();
        const positions = new Float32Array(starCount * 3);
        const colors = new Float32Array(starCount * 3);

        for (let i = 0; i < starCount; i++) {
            const i3 = i * 3;
            // Random positions in a large sphere
            const radius = 20000 + Math.random() * 20000;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);

            const x = radius * Math.sin(phi) * Math.cos(theta);
            const y = radius * Math.sin(phi) * Math.sin(theta);
            const z = radius * Math.cos(phi);

            positions[i3] = x;
            positions[i3 + 1] = y;
            positions[i3 + 2] = z;

            const brightness = 0.5 + Math.random() * 0.5;
            colors[i3] = brightness;
            colors[i3 + 1] = brightness;
            colors[i3 + 2] = brightness + Math.random() * 0.2;
        }

        pointsGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        pointsGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const starMaterial = new THREE.PointsMaterial({
            size: 50,
            vertexColors: true,
            sizeAttenuation: true
        });

        this.stars = new THREE.Points(pointsGeo, starMaterial);
        this.scene.add(this.stars);

        // 2. Trail Lines (Dynamic)
        // Each star has a line segment (2 vertices)
        // Vertices share the same 'position' attribute, but have different 'trailIndex'
        const trailGeo = new THREE.BufferGeometry();

        // Duplicate positions for head and tail
        const trailPositions = new Float32Array(starCount * 3 * 2);
        const trailIndices = new Float32Array(starCount * 2);

        for (let i = 0; i < starCount; i++) {
            const i3 = i * 3;
            const t6 = i * 6; // 2 vertices * 3 coords
            const t2 = i * 2;

            // Head vertex
            trailPositions[t6] = positions[i3];
            trailPositions[t6 + 1] = positions[i3 + 1];
            trailPositions[t6 + 2] = positions[i3 + 2];
            trailIndices[t2] = 0.0;

            // Tail vertex
            trailPositions[t6 + 3] = positions[i3];
            trailPositions[t6 + 4] = positions[i3 + 1];
            trailPositions[t6 + 5] = positions[i3 + 2];
            trailIndices[t2 + 1] = 1.0;
        }

        trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
        trailGeo.setAttribute('trailIndex', new THREE.BufferAttribute(trailIndices, 1));

        this.trailMaterial = new THREE.ShaderMaterial({
            uniforms: THREE.UniformsUtils.clone(StarTrailShader.uniforms),
            vertexShader: StarTrailShader.vertexShader,
            fragmentShader: StarTrailShader.fragmentShader,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthTest: false // Draw on top or behind doesn't matter much for stars, but false helps transparency
        });

        this.trails = new THREE.LineSegments(trailGeo, this.trailMaterial);
        // Ensure trails are rendered even if bounding box is static
        this.trails.frustumCulled = false;
        this.scene.add(this.trails);
    }

    setupLights() {
        // Ambient light (increased intensity)
        const ambient = new THREE.AmbientLight(0x404040, 1.5); // Soft white light
        this.scene.add(ambient);

        // Hemisphere light (Sky color, Ground color, Intensity)
        // Adds a nice gradient fill
        const hemiLight = new THREE.HemisphereLight(0xffffbb, 0x080820, 1);
        this.scene.add(hemiLight);

        // Sun (PointLight radiating from the center)
        // High intensity and distance for solar system scale
        const sun = new THREE.PointLight(0xffffcc, 2.5, 50000, 0.5);
        sun.position.set(0, 0, 0);
        this.scene.add(sun);

        // Sun glow (Visual only)
        const sunGeo = new THREE.SphereGeometry(200, 32, 32);
        const sunMat = new THREE.MeshBasicMaterial({ color: 0xffffaa });
        const sunMesh = new THREE.Mesh(sunGeo, sunMat);
        this.scene.add(sunMesh);
    }

    updateLoading(percent, text) {
        this.loadingProgress.style.width = `${percent}%`;
        this.loadingText.textContent = text;
    }

    onResize() {
        const width = window.innerWidth;
        const height = window.innerHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(width, height);
        this.composer.setSize(width, height);

        // Update pixel shader resolution
        this.pixelPass.uniforms.resolution.value.set(
            Math.floor(width / 4),
            Math.floor(height / 4)
        );
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        const delta = this.clock.getDelta();

        // Update game
        let shipVelocity = new THREE.Vector3();

        if (this.game) {
            this.game.update(delta);
            if (this.game.playerShip) {
                shipVelocity.copy(this.game.playerShip.velocity);
            }
        }

        // Update Star Trails
        if (this.trailMaterial) {
            this.trailMaterial.uniforms.velocity.value.copy(shipVelocity);
        }

        // Update controls if enabled
        if (this.controls.enabled) {
            this.controls.update();
        }

        // Render with post-processing
        this.composer.render();
    }
}

// Start the game
window.addEventListener('DOMContentLoaded', () => {
    new Main();
});
