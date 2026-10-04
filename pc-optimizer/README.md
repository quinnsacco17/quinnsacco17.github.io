# Setup Optimizer

Enter your exact setup (or auto-detect it), pick a game and a goal, get the settings that hit that goal.

## What it accounts for

| Area | Inputs | Effect modeled |
|---|---|---|
| Silicon | CPU, GPU (130+ CPUs, 120+ GPUs incl. laptop and integrated), custom index for anything else | GPU/CPU frametime, RT efficiency per architecture, VRAM, DLSS/FSR/XeSS tiers, frame gen tiers |
| Prebuilts / handhelds | ROG Ally / Ally X / Xbox Ally, Steam Deck, Legion Go, MSI Claw, gaming laptops, prebuilt desktops | Fills parts, built-in display, shared-power CPU behavior, TDP/power mode scaling |
| Memory | Capacity, channels, speed | CPU-bound fps, iGPU bandwidth, stutter |
| GPU link | PCIe gen/lanes, OCuLink, Thunderbolt 3/4/5 eGPU | Bandwidth loss, VRAM-overflow sensitivity |
| Storage | NVMe, SATA, USB SSD, microSD, HDD | 1% lows, streaming stutter |
| Monitors | Count, resolution, refresh, VRR type, HDR, cable (HDMI 1.4 to DP 2.1 UHBR20, USB-C alt mode), DSC, video on secondaries | Bandwidth check with max achievable refresh, desktop composition cost, frame-cap advice |
| Peripherals | Mouse connection and polling rate, hub type and load, controller, audio, webcam, capture card, VR | CPU time, polling drops, bandwidth starvation |
| Laptop | MUX / Optimus / Advanced Optimus, battery | Fps and latency loss |
| Software | Discord, browser video, RGB suites, OBS NVENC vs x264 | CPU/GPU overhead |
| Power / thermal | PSU watts, airflow | Shutdown risk, sustained clocks |
| Network | Ethernet, Wi-Fi 5/6/6E/7, powerline, hotspot | Latency notes |

## Per game

50 games with individual setting costs (GPU, CPU, VRAM, visual value), RT modes, upscaler support, engine caps, and tips. The recommender searches RT x upscaler x frame-gen combinations and greedily drops the lowest-value-per-fps settings until the goal is met, then ranks by visual quality. Goals: match refresh, max quality at 60, custom fps, competitive, balanced, battery.

Output: average fps with a range, estimated 1% lows, bottleneck, VRAM use, a per-setting table with a live preview and "what you'll notice" notes, frame cap / sync / Reflex advice, and alternative configurations.

## Accuracy

Uncalibrated: about +/-15%. Enter one measured fps in the Calibrate tab and the model rescales to your machine (about +/-7% afterwards). Numbers are anchored to published review averages; patches, drivers, scene, and thermals move real numbers.

## Apply to game

The Windows app writes the recommended values into the game's config file after a timestamped backup. Supported: Cyberpunk 2077, Fortnite, Marvel Rivals, THE FINALS, Palworld, Black Myth: Wukong, S.T.A.L.K.E.R. 2, Oblivion Remastered, Expedition 33, PUBG, Counter-Strike 2, Apex Legends, Minecraft Java, Elden Ring, Overwatch 2. Other games: "Copy settings list". Close the game first.

## Run

```
cd pc-optimizer
npm install
npm start          # desktop app
npm test           # engine tests
npm run dist:win   # Windows installer + portable exe in dist/
npm run dist:mac   # macOS dmg (run on a Mac)
```

The `src/` folder is a plain static site. Open `src/index.html` through any web server to use everything except hardware detection and apply-to-game.

GitHub Actions builds the Windows installer on every push to main that touches this folder; download it from the workflow run's artifacts.
