# cartographer
Serverless repository-driven collaborative cartographer web app for metroidvania games (or anything else?)

Live at https://chatouillegg.github.io/cartographer/

Also works by downloading repository and running `index.html` locally.

## Available Maps

- [AETERNA LUCIS DEMO - complete map](https://chatouillegg.github.io/cartographer/#map=aeternalucisdemo)
- [DOOMBLADE - almost complete map (missing WildFlirt?)](https://chatouillegg.github.io/cartographer/#map=doomblade)

## Map Viewer

Head to the live version or run a local version, pick your map, and navigate!

Controls are similar to Google Maps - pan with left mouse button, zoom in and out with mouse wheel.

Enable/disable marker icons from the Legend panel.

## Map Editor

Create new maps or edit existing ones with the Edit mode.

### Create new tilesets, or fill in incomplete ones with missing tile images

After selecting an image (from disk / dragdrop / paste) for a given tile, use tile-image-editing mode to fine-tune the image position and scale, to match its surroundings or background (the previous tileset).

The image being edited will appear at 50% opacity to help with placement. Drag with Ctrl+LeftMouse, and scale with Ctrl+Wheel or size inputs.

Once placement is correct, save it. The app will automatically scale, crop, compress the original image to WEBP format, and prompt for download. Save it so you can submit it later on.

If a tile image is bad, right click on it while in edit mode to remove it. You can then replace it with a better version.

### Add new icon types, improve existing icons, place markers onto the map

When creating a new icon, the app features a simple placeholder icon designer so you can quickly make a relevant icon and start placing markers.

The icon image can be replaced with a better version later on. Icons also have configurable size and anchor.

To place a marker, drag it from the Legend onto the map (while in edit mode).

If a marker is bad, right click on it to remove it.

Markers can be further customized individually with an additional label - right click on the marker (while in edit mode) to add additional info (ex: name of a Boss or an Ability).

All markers and icons, including their image data, are stored in the global map data file (ex: `data/map01/data.js`). Save it after doing changes, so you can submit it later on.

### Live changes :

Changes cannot be integrated into the live version instantaneously, as there is no server or database connection.

All changes result in a file change, either in the global map data file (ex: `data/map01/data.js`), or as an image in a tileset folder (ex: `data/map01/0/1_2.webp`).
New and modified files must be submitted to the repository in order to be visible in the live version.

If you prefer iterating on your own while preserving your changes over several sessions, download the repository and work in local mode, and save the files at the suggested paths.

## Todo list :

- Support SVG maps - several games have rather simplistic maps, which could be made into a series of paths in a single SVG image. Those would be much more lightweight than WEPB and fully scalable, completely removing the need for tilesets in those cases.

- Add non-mouse controls, as a priority for the Viewer part. Touch screens an touch pads are not supported atm. Needs at least zoom buttons, touch-panning, and pinch-zooming. Editor support for mobile does not seem relevant.
