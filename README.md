# Solar System Trader

A 3D trading sim set inside one solar system. You fly the distance yourself, buy low, sell high, and keep the hull in one piece.

**Play:** https://pfaustino.github.io/solar-system-trader/

**itch.io:** https://pfaustino.itch.io/solar-system-trader

## What it does

You start at Earth Orbital in the Alpha, with 1,000 credits and 20 cargo. Thirteen stations run from Mercury Station out to Pluto Station. Click a station on the solar map, or cycle targets, then fly there on autopilot or by hand. Autopilot slows and docks when you arrive. Press F when the dock prompt is up.

Docked, a station has five tabs:

- **Market.** Prices move on their own. Each station exports some goods and pays more for others. Weapons and Contraband only appear at Neptune Haven.
- **Outfitter.** Engines, cargo, hull, shields, a trade computer, and an auto-defense turret. The trade computer opens the Analysis tab: nearby prices at level 2, system-wide prices at level 6.
- **Shipyard.** Bravo (hauler, 15,000), Delta (balanced, 25,000), Charlie (combat, 40,000), and Echo (100,000). Bought ships join the fleet.
- **Missions.** Delivery jobs. The package takes a cargo slot, and you get paid at the destination.
- **Fleet.** Send another ship on a trade run, or fly it yourself if it is docked at your current station.

Out in space, hold Z on an asteroid to mine. The laser overheats. Fields sit at the Asteroid Belt Depot and Saturn Rings. Mineable goods are Raw Ore, Rare Metals, Ice, Crystals, and Exotic Gases. Space fires the guns. Pirates (Raider, Marauder, Dreadnought) show up where the local danger level is above zero. Earth Orbital and Luna Base stay quiet.

Refuel is 10 credits and repair is 50. Thrust burns fuel, and boost burns it faster. The game saves to `localStorage` under `sst_save` when you dock or finish a trade. A first visit with no save walks through target, autopilot, dock, and a trade. Add `?tutorial` to the URL to run that again.

Stations, goods, hulls, and upgrades live in `data/locations.json`, `data/commodities.json`, `data/ships.json`, and `data/upgrades.json`.

## Controls

Click the game to capture the mouse.

| Key | Action |
|-----|--------|
| Mouse | Steer |
| W / S | Thrust forward / back |
| A / D | Strafe |
| R / C | Up / down |
| Q / E | Roll |
| Shift | Boost |
| Space | Fire |
| Z | Mining laser |
| , / . | Cycle targets |
| P | Autopilot |
| F | Dock |

## Run

```bash
npm install
npm run dev
```

Open http://localhost:5178.

The dev server is Vite. A production build uses the base path `/solar-system-trader/` for GitHub Pages. The picture is a low-resolution Three.js scene with a pixelation pass.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite on port 5178 |
| `npm run build` | Production build in `dist/` |
| `npm run preview` | Serve the production build |
| `npm run check` | Smoke check that the entry files and ship data load |
| `npm run test:e2e` | Playwright |
