import * as THREE from 'three';

export class TradeManager {
    constructor(game) {
        this.game = game;
        this.basePrices = new Map();
        this.prices = new Map(); // Map<locationId, Map<commodityId, price>>
        this.lastKnownPrices = new Map(); // Map<locationId, Map<commodityId, {price, timestamp}>>
    }

    init() {
        // Initialize base prices from data
        for (const item of this.game.commoditiesData.commodities) {
            this.basePrices.set(item.id, item);
        }

        // Generate initial prices for all locations
        this.regeneratePrices();

        // Populate "Public Knowledge" (Earth/Luna) for Lvl 1 Computer
        // We will do this lazily or in update logic
    }

    recordPrices(locationId) {
        if (!this.game.playerShip || this.game.playerShip.upgradeLevels.computer < 1) return;

        const currentPrices = this.prices.get(locationId);
        if (!currentPrices) return;

        const snapshot = new Map();
        currentPrices.forEach((price, id) => {
            snapshot.set(id, { price: price, timestamp: Date.now() });
        });
        this.lastKnownPrices.set(locationId, snapshot);
    }

    // Returns price if known by computer, else null
    getKnownPrice(locationId, commodityId) {
        if (!this.game.playerShip) return null;

        const computerLevel = this.game.playerShip.upgradeLevels.computer;
        if (computerLevel < 1) return null;

        // Level 6+: System-Wide Real-time
        if (computerLevel >= 6) {
            const rtPrice = this.prices.get(locationId)?.get(commodityId);
            return rtPrice ? { price: rtPrice, isLive: true } : null;
        }

        // Level 2+: Neighbor Real-time
        if (computerLevel >= 2) {
            const playerPos = this.game.playerShip.mesh.position;
            const targetLoc = this.game.locationsData.locations.find(l => l.id === locationId);
            if (targetLoc) {
                const dist = playerPos.distanceTo(new THREE.Vector3(targetLoc.position.x, targetLoc.position.y, targetLoc.position.z));
                // Define "Neighbor" range. Say 3000 units?
                if (dist < 3000) {
                    const rtPrice = this.prices.get(locationId)?.get(commodityId);
                    return rtPrice ? { price: rtPrice, isLive: true } : null;
                }
            }
        }

        // Level 1+: Memory + Public Info (Earth/Luna always known)
        if (locationId === 'earth' || locationId === 'luna') {
            // Always return real-time for core worlds (or maybe just last known if we want to be strict? User said "Earth/Luna Prices unlock")
            // Let's assume Real-time for them or just "Known"
            // "Unlocks... Earth/Luna Prices" -> Implies knowledge.
            const rtPrice = this.prices.get(locationId)?.get(commodityId);
            if (rtPrice) return { price: rtPrice, isLive: true }; // Treat as live feed
        }

        // Fallback to Memory
        const memory = this.lastKnownPrices.get(locationId)?.get(commodityId);
        return memory ? { price: memory.price, isLive: false, timestamp: memory.timestamp } : null;
    }

    regeneratePrices() {
        for (const loc of this.game.locationsData.locations) {
            const locPrices = new Map();

            for (const item of this.game.commoditiesData.commodities) {
                // Determine local price modifiers
                let multiplier = 1.0;

                // Imports are much more expensive (High Demand)
                if (loc.imports.includes(item.id) || loc.imports.includes('everything')) {
                    multiplier += 0.5; // +50%
                }

                // Exports are much cheaper (High Supply)
                if (loc.exports.includes(item.id)) {
                    multiplier -= 0.5; // -50%
                }

                // Random day-to-day fluctuation
                const variance = (Math.random() * 2 - 1) * item.volatility;
                multiplier += variance;

                // Market Events (Random Booms/Crashes)
                if (Math.random() < 0.05) { // 5% chance per item
                    if (Math.random() > 0.5) {
                        multiplier *= 2.0; // Shortage! Price doubles
                        console.log(`Shortage of ${item.name} at ${loc.name}`);
                    } else {
                        multiplier *= 0.3; // Surplus! Fire sale
                        console.log(`Surplus of ${item.name} at ${loc.name}`);
                    }
                }

                // Distance/Risk factor (Outer system is generally more expensive/profitable)
                const distanceMult = loc.dangerLevel * 0.1; // Increased risk premium
                if (item.category !== 'basic') {
                    multiplier += distanceMult;
                }

                // Calculate final buy price
                let price = Math.round(item.basePrice * multiplier);
                if (price < 1) price = 1;

                locPrices.set(item.id, price);
            }
            this.prices.set(loc.id, locPrices);
        }

        console.log('Prices regenerated for new day');
    }

    getPrice(locationId, commodityId) {
        if (!this.prices.has(locationId)) return 0;
        return this.prices.get(locationId).get(commodityId) || 0;
    }

    buy(commodityId, quantity) {
        const loc = this.game.currentLocation;
        const priceMap = this.prices.get(loc);
        if (!priceMap) return false;

        const price = priceMap.get(commodityId);
        const cost = price * quantity;

        if (this.game.credits >= cost && this.game.cargo.length + quantity <= this.game.cargoMax) {
            this.game.credits -= cost;

            for (let i = 0; i < quantity; i++) {
                this.game.cargo.push(commodityId);
            }

            // Supply/Demand: Buying reduces supply -> Price Increases
            // Sensitivity: 2% per unit
            let newPrice = Math.ceil(price * (1 + (quantity * 0.02)));
            // Cap at 5x base price? Or just let it run wild? Let's cap slightly.
            const item = this.basePrices.get(commodityId);
            if (item && newPrice > item.basePrice * 10) newPrice = item.basePrice * 10;

            priceMap.set(commodityId, newPrice); // Update market

            this.game.updateHUD();
            this.game.saveGame?.();
            return true;
        }
        return false;
    }

    sell(commodityId, quantity) {
        const loc = this.game.currentLocation;
        const priceMap = this.prices.get(loc);
        if (!priceMap) return false;

        const price = priceMap.get(commodityId);
        const total = price * quantity;

        // Count how many we have
        const currentQty = this.game.cargo.filter(c => c === commodityId).length;

        if (currentQty >= quantity) {
            this.game.credits += total;

            // Remove items
            let removed = 0;
            this.game.cargo = this.game.cargo.filter(c => {
                if (c === commodityId && removed < quantity) {
                    removed++;
                    return false;
                }
                return true;
            });

            // Supply/Demand: Selling increases supply -> Price Decreases
            // Sensitivity: 2% per unit
            let newPrice = Math.floor(price * (1 - (quantity * 0.02)));
            if (newPrice < 1) newPrice = 1;

            priceMap.set(commodityId, newPrice); // Update market

            this.game.updateHUD();
            this.game.saveGame?.();
            return true;
        }
        return false;
    }

    canRefine(rawId) {
        // Simple mapping for now
        const refinementMap = {
            'ore': 'rare_metals',
            'ice': 'water',
        };
        return refinementMap[rawId] || null;
    }
}
