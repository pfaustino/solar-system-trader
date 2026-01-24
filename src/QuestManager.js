export class QuestManager {
    constructor(game) {
        this.game = game;
        this.activeQuests = [];
        this.availableQuests = new Map(); // stationId -> [quests]
    }

    init() {
        // Nothing specific yet
    }

    generateQuests(stationId) {
        // Only generate if we don't have many active quests from here?
        // Or regenerate every time we dock (if not already present)?

        // If we have quests and list is not empty, keep them.
        // If empty, generate new ones.
        if (this.availableQuests.has(stationId) && this.availableQuests.get(stationId).length > 0) return;

        const quests = [];
        const count = Math.floor(Math.random() * 3) + 1; // 1-3 missions

        const locations = this.game.locationsData.locations.filter(l => l.id !== stationId);

        for (let i = 0; i < count; i++) {
            const target = locations[Math.floor(Math.random() * locations.length)];
            const reward = 100 + Math.floor(Math.random() * 500);

            quests.push({
                id: Math.random().toString(36).substr(2, 9),
                source: stationId,
                target: target.id,
                targetName: target.name,
                item: "Package #" + Math.floor(Math.random() * 1000), // Placeholder name
                itemId: "quest_" + Math.random().toString(36).substr(2, 5),
                reward: reward,
                description: `Deliver package to ${target.name}.`
            });
        }

        this.availableQuests.set(stationId, quests);
    }

    acceptQuest(questId) {
        // Find quest
        let quest = null;
        let stationId = this.game.currentLocation;

        const localQuests = this.availableQuests.get(stationId);
        if (localQuests) {
            quest = localQuests.find(q => q.id === questId);
        }

        if (!quest) return false;

        // Check cargo space
        if (this.game.cargo.length >= this.game.cargoMax) {
            this.game.audioManager.playError(); // explicit fail sound?
            return false;
        }

        // Accept
        this.activeQuests.push(quest);
        this.game.cargo.push(quest.itemId); // Add item

        // Remove from available
        this.availableQuests.set(stationId, localQuests.filter(q => q.id !== questId));

        this.game.audioManager.playUIBeep();
        return true;
    }

    completeQuest(questId) {
        const questIndex = this.activeQuests.findIndex(q => q.id === questId);
        if (questIndex === -1) return false;

        const quest = this.activeQuests[questIndex];

        // Check location
        if (this.game.currentLocation !== quest.target) {
            console.log("Complete Quest Failed: Wrong Location", this.game.currentLocation, quest.target);
            return false;
        }

        // Complete
        console.log("Completing Quest:", quest.id, "Reward:", quest.reward);
        this.game.credits = Number(this.game.credits) + Number(quest.reward);
        this.activeQuests.splice(questIndex, 1);

        // Remove item from cargo (just remove one instance of itemId)
        const cargoIndex = this.game.cargo.indexOf(quest.itemId);
        if (cargoIndex > -1) {
            this.game.cargo.splice(cargoIndex, 1);
        }

        this.game.audioManager.playUIBeep();
        this.game.updateHUD(); // Credits updated
        return true;
    }

    // Helper to get quests for UI
    getAvailable(stationId) {
        return this.availableQuests.get(stationId) || [];
    }

    getActive() {
        return this.activeQuests;
    }
}
