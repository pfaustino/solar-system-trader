# Solar System Trader — Architecture (full scope)

3D open-space trading sim — Elite-inspired, solar-system bound. **v0.9.6.0**.

## Stack

Three.js 0.160 (jsDelivr import map), ES modules, no bundler. Dev: `npm run dev` → `serve :3000`. Pixel aesthetic via post-process downsample shader.

## Entry split

| File | Role |
|------|------|
| `src/main.js` | WebGL renderer, `EffectComposer`, starfield, outer `animate()` |
| `src/Game.js` | Simulation orchestrator |

## Runtime (`Game.js`)

```
Game
 ├── Ship.js              (flight, fuel, hull, weapons)
 ├── Station.js           (docking, market UI)
 ├── TradeManager.js      (commodity prices, ticks, events)
 ├── QuestManager.js      (delivery missions)
 ├── MiningManager.js     (laser, heat/overheat)
 ├── CombatManager.js     (pirates)
 ├── FleetManager.js      (escorts / automation)
 ├── ShipyardPreview.js   (3D ship preview)
 ├── AudioManager.js
 └── EnemyShip.js, AsteroidField.js
```

## Game loop

`Main.animate()` → `game.update(delta)` → composer render → optional `game.postRender()`. Pointer lock flight (OrbitControls disabled). Large world scale (camera far 500k).

## Data (`data/`)

| JSON | Content |
|------|---------|
| `locations.json` | Station positions in solar system |
| `commodities.json` | Trade goods |
| `ships.json` | Hull definitions |
| `upgrades.json` | Ship upgrades |

Fetched at init; `TradeManager` simulates per-location prices with periodic ticks.

## Persistence

`localStorage` key `sst_save` — credits, cargo, ship, location, hull/shield/fuel, upgrades. Auto-save on dock and key actions.

## UI

Heavy HTML/CSS in `index.html`: docking, trade tables, shipyard, mining HUD, quest list. DOM updated from `Game.js`.

## Docs

`itch_io_metadata.md`, `docs/adr/`.
