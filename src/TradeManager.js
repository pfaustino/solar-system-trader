export class TradeManager {
    constructor(game) {
        this.game = game;
        this.basePrices = new Map();
        this.prices = new Map(); // Map<locationId, Map<commodityId, price>>
    }

    init() {
        // Initialize base prices from data
        for (const item of this.game.commoditiesData.commodities) {
            this.basePrices.set(item.id, item);
        }

        // Generate initial prices for all locations
        this.regeneratePrices();
    }

    regeneratePrices() {
        for (const loc of this.game.locationsData.locations) {
            const locPrices = new Map();

            for (const item of this.game.commoditiesData.commodities) {
                // Determine local price modifiers
                let multiplier = 1.0;

                // Imports are more expensive (demand)
                if (loc.imports.includes(item.id) || loc.imports.includes('everything')) {
                    multiplier += 0.3; // +30%
                }

                // Exports are cheaper (supply)
                if (loc.exports.includes(item.id)) {
                    multiplier -= 0.3; // -30%
                }

                // Random day-to-day fluctuation
                const variance = (Math.random() * 2 - 1) * item.volatility;
                multiplier += variance;

                // Distance/Risk factor (Outer system is generally more expensive/profitable)
                const distanceMult = loc.dangerLevel * 0.05;
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
        const price = this.getPrice(this.game.currentLocation, commodityId);
        const cost = price * quantity;

        if (this.game.credits >= cost && this.game.cargo.length + quantity <= this.game.cargoMax) {
            this.game.credits -= cost;

            for (let i = 0; i < quantity; i++) {
                this.game.cargo.push(commodityId);
            }

            this.game.updateHUD();
            return true;
        }
        return false;
    }

    sell(commodityId, quantity) {
        const price = this.getPrice(this.game.currentLocation, commodityId);
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

            this.game.updateHUD();
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
