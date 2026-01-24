export class AudioManager {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.3; // Default volume
        this.masterGain.connect(this.ctx.destination);

        this.enabled = false;

        // Buffers
        this.buffers = {
            laser: null,
            engine: null,
            ambient: null
        };

        // Active Source Nodes
        this.ambientSource = null;
        this.engineSource = null;
        this.engineGain = this.ctx.createGain();
        this.engineGain.connect(this.masterGain);
        this.engineGain.gain.value = 0; // Start silent

        // Resume context on user interaction
        const resumeAudio = () => {
            if (this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
            this.enabled = true;
            this.startAmbience(); // Start loops once enabled
            this.startEngine();
        };

        window.addEventListener('click', resumeAudio, { once: true });
        window.addEventListener('keydown', resumeAudio, { once: true });
    }

    async load() {
        try {
            const [laserBuf, engineBuf, ambientBuf] = await Promise.all([
                this.loadBuffer('./assets/sounds/fire-88783.mp3'),
                this.loadBuffer('./assets/sounds/space-flight-11-433378.mp3'),
                this.loadBuffer('./assets/sounds/spaceship-ambient-27988.mp3')
            ]);

            this.buffers.laser = laserBuf;
            this.buffers.engine = engineBuf;
            this.buffers.ambient = ambientBuf;

            console.log('Audio assets loaded');
        } catch (e) {
            console.error('Failed to load audio assets:', e);
        }
    }

    async loadBuffer(url) {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        return await this.ctx.decodeAudioData(arrayBuffer);
    }

    startAmbience() {
        if (!this.enabled || !this.buffers.ambient || this.ambientSource) return;

        this.ambientSource = this.ctx.createBufferSource();
        this.ambientSource.buffer = this.buffers.ambient;
        this.ambientSource.loop = true;

        const gain = this.ctx.createGain();
        gain.gain.value = 0.5;
        this.ambientSource.connect(gain);
        gain.connect(this.masterGain);

        this.ambientSource.start();
    }

    startEngine() {
        if (!this.enabled || !this.buffers.engine || this.engineSource) return;

        this.engineSource = this.ctx.createBufferSource();
        this.engineSource.buffer = this.buffers.engine;
        this.engineSource.loop = true;

        // Pitch/Rate can be modulated
        this.engineSource.connect(this.engineGain);
        this.engineSource.start();
    }

    updateEngine(thrustLevel) {
        // thrustLevel: 0 to 1
        if (!this.engineSource) return;

        const targetVol = Math.max(0, Math.min(1, thrustLevel));
        // Smooth transition
        this.engineGain.gain.setTargetAtTime(targetVol, this.ctx.currentTime, 0.1);

        // Pitch shift slightly based on thrust
        const targetRate = 0.8 + (thrustLevel * 0.4); // 0.8x to 1.2x speed
        this.engineSource.playbackRate.setTargetAtTime(targetRate, this.ctx.currentTime, 0.1);
    }

    playLaser() {
        if (!this.enabled) return;

        if (this.buffers.laser) {
            const source = this.ctx.createBufferSource();
            source.buffer = this.buffers.laser;

            // Randomize pitch slightly for variety
            source.playbackRate.value = 0.9 + Math.random() * 0.2;

            const gain = this.ctx.createGain();
            gain.gain.value = 0.4;

            source.connect(gain);
            gain.connect(this.masterGain);
            source.start();
        } else {
            // Fallback to procedural
            this.playProceduralLaser();
        }
    }

    playProceduralLaser() {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(800, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.2);
    }

    playEnemyLaser() {
        if (!this.enabled) return;
        // Keep procedural for enemy for now, or reuse laser sample
        this.playProceduralLaser();
    }

    playExplosion() {
        if (!this.enabled) return;
        // Keep procedural explosion for now
        // White noise buffer logic...
        const bufferSize = this.ctx.sampleRate * 0.5;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1000, this.ctx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.5);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(1, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.5);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        noise.start();
    }

    playUIBeep() {
        if (!this.enabled) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, this.ctx.currentTime);
        gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.1);
    }

    playError() {
        if (!this.enabled) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, this.ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(100, this.ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.2);
    }
}
