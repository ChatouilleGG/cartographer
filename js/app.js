
//================================================
// Main Classes
//================================================

/**
 * Tile :
 * Represents a single tile in the Tileset grid.
 * Empty grid items would be null. No need to create an empty Tile object for them.
 * Therefore, any non-null grid item should be a valid Tile object, pointing to a valid image.
 */
class Tile {
	// Most of the data is shared in containing Tileset, so the Tile object is very lightweight.

	// image Src in case of local image
	_src;

	// Note: for now, we don't need to serialize any tile-specific data, just their presence.
	// so they are simply saved as 0 and 1's.
	// If that changes, update function serializeToJS()
	static fromData(data) {
		return data ? new Tile() : null;
	}

	// Tile with local image
	static fromSrc(imgSrc) {
		let tile = new Tile();
		tile._src = imgSrc;
		return tile;
	}
}

/**
 * Tileset :
 * Represents a set of tiles, intended to cover the entire map for a given zoom level.
 * A Tileset can be a large grid of tiles (ex: 32x32), or a single-tile overview, or anything in-between.
 *
 * A map contains one or multiple Tilesets.
 *
 * The rendering system will attempt to fetch and display the most-fitting tiles according to current zoom level.
 * In case of missing tiles for a detailed zoom level, previous layer(s) shall remain on screen in the background.
 * It is important to properly define and preserve the scaling across tilesets.
 *
 * Typically, a map should have at least one moderately detailed Tileset (ex: 16x16) and one lightweight overview Tileset.
 * Having an overview prevents rendering all the detailed tiles when zooming out, which can be heavy.
 * For smaller maps, having just one high-resolution overview (1-4 large tiles) can also be enough.
 *
 * Grid configuration is based on a center point, from which the tiles expand around in the four directions.
 * This allows for map expansion without messing up existing coordinates data (markers).
 */
class Tileset {
	// Internal grid is an array of arrays of Tiles
	grid;

	// How the grid expands from origin towards the four directions.
	sizeW = 0;
	sizeE = 1;
	sizeN = 0;
	sizeS = 1;

	// Zoom level this Tileset is based on
	zoomLevel = 100;

	// Size of tiles (in pixels at 100% scale)
	tileWidth = 512;
	tileHeight =  512;

	// Origin shift (in pixels at 100% scale)
	offsetX = 0;
	offsetY = 0;

	// Tileset index in map data
	_index;

	// Tileset order based on sorted zoom levels
	_zOrder;

	// Construct from saved data
	static fromData(data, index) {
		let tileset = new Tileset();
		Object.assign(tileset, data);
		tileset._index = index;
		tileset.grid = (data.grid || []).map(row => row.map(Tile.fromData));
		return tileset;
	}

	// Table element
	$table;

	// Partial table rendering area information
	// We don't generate the entire table, that might get heavy with large layer(s) of tilesets
	_renderArea;

	_visible = false;

	numRows() { return this.sizeN + this.sizeS; }
	numCols() { return this.sizeW + this.sizeE; }
	getDisplayScale() { return globalZoomLevel / this.zoomLevel; }
	isVisible() { return this._visible; }
	getScaledTileWidth() { return this.tileWidth * this.getDisplayScale(); }
	getScaledTileHeight() { return this.tileHeight * this.getDisplayScale(); }

	setVisible(newVisible) {
		this._visible = newVisible;
		if (!newVisible && this.$table)
			this.remove();
	}

	setZOrder(newZOrder) {
		this._zOrder = newZOrder;
		if (this.$table)
			this.$table.css('z-index', newZOrder);
	}

	// Figure out which part of the table needs to be rendered
	computeRenderArea() {
		const renderSizeX = $renderer.width();
		const renderSizeY = $renderer.height();

		const scaledCellSizeX = this.getScaledTileWidth();
		const scaledCellSizeY = this.getScaledTileHeight();

		let result = {
			firstRow: 0, numRows: 0,
			firstCol: 0, numCols: 0,
			posX: 0, posY: 0,
		};

		// Position of the virtual full table, relative to rendering container
		// NOTE: The origin row/col of a table is naturally its sizeW/sizeN
		const fullTableX = globalOriginX + this.offsetX*this.getDisplayScale() - scaledCellSizeX * this.sizeW;
		const fullTableY = globalOriginY + this.offsetY*this.getDisplayScale() - scaledCellSizeY * this.sizeN;

		if (fullTableX < 0)
			result.firstCol = Math.floor(-fullTableX / scaledCellSizeX);
		if (fullTableY < 0)
			result.firstRow = Math.floor(-fullTableY / scaledCellSizeY);

		// Position of the rendered partial table, relative to rendering container
		result.posX = fullTableX + result.firstCol * scaledCellSizeX;
		result.posY = fullTableY + result.firstRow * scaledCellSizeY;

		result.numCols = Math.min( Math.ceil((renderSizeX-result.posX) / scaledCellSizeX), this.numCols()-result.firstCol );
		result.numRows = Math.min( Math.ceil((renderSizeY-result.posY) / scaledCellSizeY), this.numRows()-result.firstRow );

		return result;
	}

	// Compute (row,col) from (clientX,clientY) coordinates
	getCellAt(clientX, clientY) {
		const relX = clientX - $renderer.offset().left - this._renderArea.posX;
		const relY = clientY - $renderer.offset().top - this._renderArea.posY;
		return {
			col: this._renderArea.firstCol + Math.floor(relX / this.getScaledTileWidth()),
			row: this._renderArea.firstRow + Math.floor(relY / this.getScaledTileHeight()),
		};
	}

	// Returns Jquery TD element at (row,col) or null
	getElementAt(row, col) {
		if (this.$table
			&& row >= this._renderArea.firstRow && row <= this._renderArea.firstRow+this._renderArea.numRows
			&& col >= this._renderArea.firstCol && col <= this._renderArea.firstCol+this._renderArea.numCols
		) {
			return this.$table.find('tr').eq(row - this._renderArea.firstRow).find('td').eq(col - this._renderArea.firstCol);
		}
		return null;
	}

	// Returns grid Tile object at (row,col) or null
	getTileAt(row, col) {
		return this.grid[row] && this.grid[row][col];
	}

	removeTileAt(row, col) {
		if (this.grid[row] && this.grid[row][col]) {
			this.grid[row][col] = Tile.fromData(null);

			let $td = this.getElementAt(row, col);
			if ($td)
				$td.html(this.renderTableCell(row, col));
		}
	}

	getTileImageName(row, col) {
		return (row - this.sizeN) + "_" + (col-this.sizeW) + ".webp";
	}
	getTileImageSrc(row, col) {
		return this.grid[row] && this.grid[row][col] && (this.grid[row][col]._src || getTileImageUrl(this, row, col));
	}

	createLocalTile(row, col, imgSrc) {
		while (this.grid.length <= row)
			this.grid.push([]);
		let gridRow = this.grid[row];
		while (gridRow.length < col)
			gridRow.push(Tile.fromData(null));
		gridRow[col] = Tile.fromSrc(imgSrc);

		// App will use this local src (blob) until reloaded
		// If tileset is saved, the tile will save as a regular tile, assuming the image has been downloaded and placed in the tileset folder
		// The local blob is not retained

		let $td = this.getElementAt(row, col);
		if ($td)
			$td.html(this.renderTableCell(row, col));
	}

	// Returns HTML to fill a cell according to data
	renderTableCell(row, col) {
		let html = "";

		//DEBUG?
		if (false) {
			const coordX = (this.offsetX + (col-this.sizeW)*this.tileWidth) * 100/this.zoomLevel;
			const coordY = (this.offsetY + (row-this.sizeN)*this.tileHeight) * 100/this.zoomLevel;
			html += '<div class="debug">'
				+ '<div>Abs : '+row+' , '+col+'</div>'
				+ '<div>Rel : '+(row-this.sizeN)+' , '+(col-this.sizeW)+'</div>'
				+ '<div>cX : '+coordX+'</div>'
				+ '<div>cY : '+coordY+'</div>'
			+ '</div>'
		}

		let src = this.getTileImageSrc(row, col);
		if (src) {
			// TILE IMAGE
			html += '<img src="'+src+'"/>';
		}
		else {
			// UPLOAD BUTTON
			html += '<button class="upload btn btn-outline-success"><i class="fa fa-upload"></i></button>';
		}
		return html;
	}

	// Rebuild the HTML table according to renderArea
	renderTableArea(renderArea) {
		// table size unscaled
		let totalWidth = renderArea.numCols * this.tileWidth;
		let totalHeight = renderArea.numRows * this.tileHeight;

		let html = '<table><tbody>';
		for (let r=0; r<renderArea.numRows; r++) {
			html += '<tr>';
			for (let c=0; c<renderArea.numCols; c++)
				html += '<td>' + this.renderTableCell(renderArea.firstRow + r, renderArea.firstCol + c) + '</td>';
			html += '</tr>';
		}

		this.remove();

		$renderer.append(html);
		this.$table = $renderer.find('table:last-child');

		this.$table.css({
			width: totalWidth+'px',
			height: totalHeight+'px',
			zIndex: this._zOrder,
		});

		this.$table.attr('data-index', this._index);

		if (currentTileset == this)
			this.$table.addClass('current');

		// Fix cell sizes on first row/column
		this.$table.find('tr:first-child').find('td').attr('width', this.tileWidth);
		this.$table.find('td:first-child').attr('height', this.tileHeight);

		this._renderArea = renderArea;
		$renderer.trigger('table-rebuilt', [this, renderArea]);
	}

	updateRenderArea(bRedraw) {
		let newRenderArea = this.computeRenderArea();
		if (bRedraw
			|| !this.$table
			|| newRenderArea.firstRow != this._renderArea.firstRow
			|| newRenderArea.numRows != this._renderArea.numRows
			|| newRenderArea.firstCol != this._renderArea.firstCol
			|| newRenderArea.numCols != this._renderArea.numCols)
		{
			//console.log("New area", newRenderArea);
			this.renderTableArea(newRenderArea);
		}
		this._renderArea = newRenderArea;

		this.$table.css({
			left: newRenderArea.posX+'px',
			top: newRenderArea.posY+'px',
			transform: 'scale(' + this.getDisplayScale() + ')',	
		});
	}

	render(bRedraw) {
		if (this.isVisible())
			this.updateRenderArea(bRedraw);
	}

	remove() {
		if (this.$table) {
			this.$table.remove();
			delete this.$table;
		}
	}

	expand(dir, amount) {
		const propName = 'size'+dir;
		this[propName]++;

		if (dir == 'N') {
			for (let i=0; i<amount; i++)
				this.grid.splice(0,0,[]);
		}
		else if (dir == 'W') {
			for (let row of this.grid) {
				if (row) {
					for (let i=0; i<amount; i++)
						row.splice(0,0,Tile.fromData(null));
				}
			}
		}

		this.render();
		if (this.isVisible())
			$renderer.trigger('tileset-change', [this]);
	}

	// Reduces grid to used area
	trim() {
		let trimHelper = (propName, minValue, tileCount, tileGetterFn, removeFn) => {
			while (this[propName] > minValue) {
				let empty = true;
				for (let i=0; i<tileCount; i++) {
					if (tileGetterFn(i)) {
						empty = false;
						return;
					}
				}
				removeFn && removeFn();
				this[propName]--;
			}
		};
		trimHelper('sizeN', 0, this.numCols(), (i) => this.getTileAt(0,i), () => this.grid.shift());
		trimHelper('sizeS', 1, this.numCols(), (i) => this.getTileAt(this.numRows()-1,i), () => this.grid[this.numRows()-1] && this.grid.pop());
		trimHelper('sizeW', 0, this.numRows(), (i) => this.getTileAt(i,0), () => {
			for (let row of this.grid)
				row && row.shift();
		});
		trimHelper('sizeE', 1, this.numRows(), (i) => this.getTileAt(i,this.numCols()-1), () => {
			for (let row of this.grid)
				row && row[this.numCols()-1] && row.pop();
		});

		this.render();
		if (this.isVisible())
			$renderer.trigger('tileset-change', [this]);
	}

	isEmpty() {
		for (let row of this.grid) {
			for (let col of row) {
				if (col)
					return false;
			}
		}
		return true;
	}
}

/**
 * Marker :
 * Represents a marker instance placed on the map.
 * Keep this lightweight, there can be many of them.
 * Most data is "shared" in containing MarkerIconDefinition.
 */
class Marker {
	// Coordinates
	x = 0;
	y = 0;

	// Additional info line
	info;

	// Construct from saved data
	// Note: for now, markers are very lightweight, we serialize them in compact form [x,y,info]
	// If that changes, update function serializeToJS()
	static fromData(data) {
		let marker = new Marker();

		// This constructor should support both
		if (data instanceof Array)  {
			marker.x = data[0];
			marker.y = data[1];
			marker.info = data[2];
		}
		else
			Object.assign(marker, data);

		return marker;
	}
}

/**
 * MarkerIconDefinition :
 * Defines an icon/marker type for a map.
 *
 * Image resource should be stored as data-uri string form.
 * Thus, prefer very lightweight formats such as SVG or WEBP.
 *
 * TBD: Might want to rename this class -
 *  markers were originally in MapData and would reference their icon definition which was just data
 *  but after refactor, this class now encapsulates a markers array, and manages the rendering layer for them.
 */
class MarkerIconDefinition {
	imageUri;
	name = "";
	sizeX = '2.2rem';
	sizeY = '2.2rem';
	offsetX = '-1.1rem';
	offsetY = '-1.1rem';

	// Minimum zoom level to show markers of this type
	zoomLevel = 0;

	// Array of Markers
	markers;

	// Icon index in map data
	_index;

	// Each icon type has its own layer within the global markers layer
	// This allows for easy visibility manipulation (filtering) on whole sets
	// We don't really need per-marker control, except when removing a marker
	// The marker elements within layer should match markers array, so we can safely use $.index()
	$layer;

	// Construct from saved data
	static fromData(data, index) {
		let icon = new MarkerIconDefinition();
		Object.assign(icon, data);
		icon._index = index;

		icon.markers = (data.markers || []).map(Marker.fromData);

		return icon;
	}

	// Construct dynamic
	static makeSimple(name, bgColor, fgColor, label) {
		if (bgColor.startsWith('#'))
			bgColor = bgColor.slice(1);
		if (fgColor.startsWith('#'))
			fgColor = fgColor.slice(1);
		let icon = new MarkerIconDefinition();
		icon.name = name;
		label = (label || "").replace('&',"&amp;").replace('#',"%23").replace('<',"&lt;");
		icon.imageUri = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="%23'+bgColor+'" stroke="%23'+fgColor+'" stroke-width="1"/><text x="10" y="11" text-anchor="middle" dominant-baseline="middle" font-family="Courier New" font-size="15" font-weight="bold" fill="%23'+fgColor+'">'+label+'</text></svg>';
		return icon;
	}

	// Construct dynamic random
	static makeRandom(name) {
		const rng = Math.random();
		const bgColor = ('00'+Math.round(rng*0xfff).toString('16')).slice(-3);
		const fgColor = ('00'+Math.round((1-rng)*0xfff).toString('16')).slice(-3);
		const label = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ?!+-"[Math.floor(41*Math.random())];
		return makeSimple(name, bgColor, fgColor, label);
	}

	// Dynamic filtering
	_enabled = false;
	isEnabled() { return this._enabled; }
	setEnabled(newEnabled) {
		this._enabled = newEnabled;
		this.renderLayer();
	}

	// Zoom-based visibility
	_visible = true;
	isVisible() { return this._visible; }
	setVisible(newVisible) {
		this._visible = newVisible;
		this.renderLayer();
	}

	// We create the layer once, but lazily (when needed the first time)
	// Then we manipulate its visibility
	// To force a full redraw (ex: after modifying icon properties), call removeLayer() + renderLayer()
	renderLayer() {
		const show = (this.isEnabled() && this.isVisible());
		if (this.$layer)
			this.$layer.toggleClass('d-none', !show);
		else if (show) {
			this.$layer = $('<div class="layer">').attr('data-index', this._index).appendTo($markers);

			// Render all markers
			for (let marker of this.markers)
				this.renderMarker(marker, true);
		}
	}

	// Update index (used when deleting another icon)
	setIndex(newIndex) {
		this._index = newIndex;
		if (this.$layer)
			this.$layer.attr('data-index', newIndex);
	}

	removeLayer() {
		if (this.$layer)
			this.$layer.remove();
		delete this.$layer;
	}

	// Render marker in layer - returns generated Jquery element
	// bAppend : skips existence check to improve when generating the whole layer
	renderMarker(marker, bAppend) {
		if (!this.$layer)
			return;

		let title = this.name;
		if (marker.info)
			title += '<br>'+marker.info;

		let $marker = $('<img data-toggle="tooltip">').attr('src', this.imageUri).attr('title', title).css({
			width: this.sizeX,
			height: this.sizeY,
			marginLeft: this.offsetX,
			marginTop: this.offsetY,
			left: marker.x,
			top: marker.y,
			transform: 'scale('+(100/globalZoomLevel)+')',
		});

		if (bAppend) {
			$marker.appendTo(this.$layer);
		}
		else {
			let $existing = this.$layer.find('> *:nth-child('+(this.markers.indexOf(marker)+1)+')');
			if ($existing.length == 1)
				$existing.replaceWith($marker);
			else
				$marker.appendTo(this.$layer);
		}

		// Set transform-origin at anchor
		let offsetXpx = parseFloat($marker.css('margin-left'));
		let offsetYpx = parseFloat($marker.css('margin-right'));
		$marker.css('transform-origin', (-offsetXpx/$marker.width()) + " " + (-offsetYpx/$marker.height()));

		return $marker;
	}

	createNewMarker(coordX, coordY) {
		const marker = Marker.fromData([coordX,coordY]);
		this.markers.push(marker);
		this.renderMarker(marker, true);
		return marker;
	}

	removeMarker(markerIndex) {
		this.markers.splice(markerIndex, 1);
		if (this.$layer)
			this.$layer.find('> *:nth-child('+(markerIndex+1)+')').remove();
	}
}


/**
 * Notes on the coordinates system :
 *
 * There are many ways to go about this, all with pros and cons when it comes to expanding a map containing existing data.
 *
 * I choose to use an origin reference point, from which all Tilesets start and expand around, in the four directions.
 * The origin doesn't need to be specified, as it is always equal to the sizeN/sizeW (north/west expansion) of each Tileset.
 *
 * For markers placement, one unit is equal to one pixel at 100% zoom level.
 * Markers coordinates are relative to that same origin point.
 *
 * If Tileset(s) need to be expanded, adding tile(s) in the desired direction(s) should preserve all existing data.
 *
 * Tilesets do not really care about the coordinates units.
 * They start at the origin, and expand using their own grid and tile dimensions.
 * Detailed Tilesets are projected onto their parent via their zoomLevel property, which dictates their relative display scale.
 */

/**
 * Map :
 * Encapsulates an array of Tilesets, and configuration metadata to fully represent a final map.
 */
class MapData {
	// Array of Tilesets
	tilesets;

	// General background color (try to match the images general background)
	bgColor = '#111';

	// Array of MarkerIconDefinition
	icons;

	// Cache to the most-overview tileset
	_overview;

	// Construct from saved data
	static fromData(data) {
		let mapData = new MapData();

		// Assign all data, then we'll overwrite subobjects with proper constructors
		Object.assign(mapData, data);

		// Subobjects
		mapData.tilesets = (data.tilesets || [{}]).map(Tileset.fromData);
		mapData.icons = (data.icons || []).map(MarkerIconDefinition.fromData);

		mapData.updateTilesetOrder();

		return mapData;
	}

	getTilesetFromTable($table) {
		const index = parseInt($table.data('index'));
		return this.tilesets[index];
	}

	updateTilesetOrder() {
		let sorted = this.tilesets.toSorted((a,b) => a.zoomLevel-b.zoomLevel);
		for (let i=0; i<sorted.length; i++)
			sorted[i].setZOrder(i);

		this._overview = sorted[0];
	}

	createNewTileset(zoomLevel) {
		const tileset = Tileset.fromData({zoomLevel:zoomLevel}, this.tilesets.length);

		this.tilesets.push(tileset);
		this.updateTilesetOrder();

		return tileset;
	}

	cullEmptyTilesets() {
		// Note: tileset index is very important, images paths are based on it
		// So we cannot reorder or remove tilesets in the middle of the array
		// Only trim at the end
		for (let tileset=arrayLast(this.tilesets); tileset && tileset.isEmpty(); tileset=arrayLast(this.tilesets)) {
			tileset.remove();
			this.tilesets.length--;
		}
	}

	createNewIcon(iconData) {
		this.icons || (this.icons = []);

		const icon = MarkerIconDefinition.fromData(iconData, this.icons.length);
		this.icons.push(icon);

		icon.setEnabled(true);

		return icon;
	}

	removeIcon(iconOrIndex) {
		const iconIndex = (typeof(iconOrIndex) == 'number') ? iconOrIndex : this.icons.indexOf(iconOrIndex);
		if (iconIndex >= 0) {
			this.icons[iconIndex].removeLayer();
			this.icons.splice(iconIndex,1);

			// Adjust index down, no need to redraw anything
			for (let i=iconIndex; i<this.icons.length; i++)
				this.icons[i].setIndex(i);
		}
	}

	createNewMarker(iconIndex, coordX, coordY) {
		return this.icons[iconIndex].createNewMarker(coordX, coordY);
	}

	// Find {iconIndex,markerIndex} from the marker element
	findMarkerFromElement(elem) {
		return {
			iconIndex: $(elem).closest('.layer').data('index'),
			markerIndex: $(elem).index(),
		};
	}

	removeMarker(iconIndex, markerIndex) {
		return this.icons[iconIndex].removeMarker(markerIndex);
	}
}

// Generic serializer - write all properties not starting with _ or $
function serializeToJson(obj, prettyIndent) {
	return JSON.stringify(obj, (k,v) => {
		if (k.startsWith('_') || k.startsWith('$'))
			return undefined;
		return v;
	}, prettyIndent);
}

// Use our own serializer to get prettier prints
function serializeToJS(inValue, indentStr) {
	if (inValue === undefined)
		return "undefined";
	if (typeof(inValue) == 'number')
		return String(inValue);
	if (typeof(inValue) == 'string')
		return JSON.stringify(inValue);
	if (typeof(inValue) == 'object') {
		if (!inValue)
			return "null";

		indentStr || (indentStr = '');
		const indentStr2 = indentStr+'\t';

		if (inValue instanceof Array) {
			// Serialize arrays inline, if there are subobjects they will pretty themselves
			let result = '[';
			for (let i=0; i<inValue.length; i++)
				result += (i>0 ? ',' : '') + serializeToJS(inValue[i], indentStr);
			return result + ']';
		}

		// Object case
		let result = '{';
		for (let k in inValue) {
			// Skip properties starting with _ or $
			// Skip undefined values
			if (k.startsWith('_') || k.startsWith('$') || inValue[k] === undefined)
				continue;

			// No quotes around keys, JS doesn't need them when we don't use fancy names
			result += '\n'+indentStr2+k+': ';

			// Grid special case
			if (k == 'grid') {
				result += '[';
				for (let row of inValue[k])
					result += '\n'+indentStr2+'\t['+row.map(tile => tile ? 1 : 0).join(',')+'],';
				result += '\n'+indentStr2+'],';
			}
			// Markers special case
			else if (k == 'markers') {
				result += '[';
				for (let marker of inValue[k]) {
					const asArray = [marker.x,marker.y];
					if (marker.info) asArray.push(marker.info);
					result += '\n'+indentStr2+'\t' + serializeToJS(asArray)+',';
				}
				result += '\n'+indentStr2+'],';
			}
			else
				result += serializeToJS(inValue[k], indentStr2)+',';
		}
		if (result.length == 1)
			return result+'}';
		else
			return result + '\n'+indentStr+'}';
	}
	return "";
}


//================================================
// Data loading
//================================================

/**
 * Some notes on infrastructure :
 *
 * The whole thing is designed to run statically, via github pages.
 * No server code. All code is client side, and data files are stored in repository.
 *
 * Additionally, I want at least the whole *browsing* part of the app to be runnable locally,
 * so one can download the repository (or a portion of it) and open index.html in browser.
 *
 * We have to work around some security restrictions such as not being able to fetch json data files.
 *
 * For the editor part, some features may not work in local mode (to be determined).
 */

function getMapDataUrl() {
	return 'data/'+currentMapName+'/data.js';
}
function getTileImageUrl(tileset, row, col) {
	return 'data/' + currentMapName + '/' + tileset._index + '/' + tileset.getTileImageName(row, col);
}

function loadJSONP(src, jsonp_key) {
	return new Promise((resolve,reject) => {
		delete window[jsonp_key];

		let script = document.createElement('script');
		script.src = src;
		script.onerror = () => {
			script.remove();
			reject("Failed to fetch "+src+" - see console for details");
		};
		script.onload = () => {
			if (window[jsonp_key] === undefined) {
				script.remove();
				reject("Failed to retrieve '"+jsonp_key+"' from "+src+" - check console for errors");
			}
			else {
				console.log("JSONP load success");
				const result = window[jsonp_key];
				delete window[jsonp_key];
				script.remove();
				resolve(result);
			}
		};

		console.log("Fetching", src);
		document.body.appendChild(script);
	});
}

const JSONP_KEY_MAPDATA = 'jsonp_mapdata';


//================================================
// Viewer script
//================================================

// Initial URL parameters
let urlParameters = {};

// Elements refs
let $renderer;
let $origin;
let $markers;

// Current map
let currentMapName;
let currentMapData;
let currentMap;

// Current most-detailed visible tileset
let currentTileset;

let parsedBgColor;
let globalFgColor;

// Global coordinates used for panning and zooming around - all tilesets are centered on this point
let globalOriginX = 0;
let globalOriginY = 0;

// Current global zoom level
let globalZoomLevel = 100;

function globalPositionChanged() {
	$origin.css({
		left: globalOriginX+'px',
		top: globalOriginY+'px',
	});

	$markers.css({
		left: globalOriginX+'px',
		top: globalOriginY+'px',
	});

	if (!currentMap)
		return;

	for (let tileset of currentMap.tilesets)
		tileset.render();
}

function globalZoomLevelChanged() {
	$origin.css({
		left: globalOriginX+'px',
		top: globalOriginY+'px',
	});

	$('.currentZoom').text(Math.round(100*globalZoomLevel)/100);

	if (!currentMap)
		return;

	// Update Tiles

	let bestTileset = currentMap._overview;
	for (let tileset of currentMap.tilesets) {
		// Note: overview remains always visible
		if (tileset == currentMap._overview)
			tileset.setVisible(true);
		else if (tileset.getDisplayScale() > 0.7)
			tileset.setVisible(true);
		else if (tileset.getScaledTileWidth() > 0.5*$renderer.width() && tileset.getScaledTileHeight() > 0.5*$renderer.height())
			tileset.setVisible(true);
		else
			tileset.setVisible(false);

		tileset.render();

		if (tileset.isVisible() && tileset._zOrder > bestTileset._zOrder)
			bestTileset = tileset;
	}
	if (bestTileset != currentTileset)
		$renderer.trigger('tileset-change', [bestTileset]);
	currentTileset = bestTileset;

	// Zoom-based visibiltiy for markers
	for (let icon of currentMap.icons)
		icon.setVisible(globalZoomLevel >= icon.zoomLevel);

	// Note: this is most efficient way I could find for now :
	// All markers are placed onto a special layer ($markers)
	// The layer moves and scales just like a 100% Tileset.
	// No need to move the markers when moving, just move the layer.
	// When zooming, scale the layer and apply inverse scaling to markers (we can easily do all at once).
	$markers.css({
		left: globalOriginX+'px',
		top: globalOriginY+'px',
		transform: 'scale('+globalZoomLevel+'%)',
	});
	$markers.find('img').css('transform', 'scale('+(100/globalZoomLevel)+')');
}

$(document).ready(function() {

	urlParameters = parseUrlParameters();
	console.log("urlParameters", urlParameters);

	if (urlParameters.map) {
		setTimeout(() => {
			let $sel = $('.select-map');
			if ($sel.find('option[value="'+urlParameters.map+'"]').length == 0)
				$sel.append('<option value="'+urlParameters.map+'">&lt;CUSTOM&gt; '+urlParameters.map+'</option>');
			$sel.val(urlParameters.map).change();
		}, 1);
	}

	$renderer = $('.renderer');
	$origin = $renderer.find('.origin');
	$markers = $renderer.find('.markers');

	$markers.tooltip({ selector:'img', html:true });

	$renderer.on('mousedown', (event) => {
		if (event.which != 1)
			return;

		const dragStart = { clientX:event.clientX, clientY:event.clientY, orgX:globalOriginX, orgY:globalOriginY };
		//console.log(dragStart);
		$renderer.addClass('panning');
		$(window).on('mousemove', (event) => {
			globalOriginX = dragStart.orgX + event.clientX - dragStart.clientX;
			globalOriginY = dragStart.orgY + event.clientY - dragStart.clientY;
			globalPositionChanged();
		});
		$(window).one('mouseup', () => {
			$(window).off('mousemove');
			$renderer.removeClass('panning');
		});
		$renderer.focus();	//need this for keyevents
		return false;
	}).on('mousewheel', (event) => {
		let zoomMult = 0;
		if (event.originalEvent.deltaY < 0)
			zoomMult = 1.25;
		else if (event.originalEvent.deltaY > 0)
			zoomMult = 1/1.25;
		else
			return false;

		// Coordinates to zoom at, relative to the global origin
		let posX = event.originalEvent.clientX - ($renderer.offset().left + globalOriginX);
		let posY = event.originalEvent.clientY - ($renderer.offset().top + globalOriginY);

		// Scaling pivot is 0,0 (global origin) - Shift the origin left/top such that posX/posY is preserved
		globalOriginX += posX*(1-zoomMult);
		globalOriginY += posY*(1-zoomMult);

		globalZoomLevel *= zoomMult;
		globalZoomLevelChanged();

		return false;
	});

	// Legend pane filtering
	$('.legend').on('change', 'input', function() {
		let iconIndex = $(this).closest('li').index();
		currentMap.icons[iconIndex].setEnabled(this.checked);
	});

});

function onChangeMap(inMapName, inLocalMapData) {

	// Cleanup current map
	$renderer.find('table').remove();
	$renderer.css({ backgroundColor: '', color: '' });
	$markers.empty();
	delete currentMapData;
	delete currentMap;
	delete currentTileset;

	// Load new map

	currentMapName = inMapName;
	let dataPath = getMapDataUrl();
	$('.dataPath').text(dataPath);

	Promise.resolve()
	.then(() => {
		if (inLocalMapData)
			return inLocalMapData;
		else
			return loadJSONP(dataPath, JSONP_KEY_MAPDATA);
	})
	.then(data => {
		window.location.replace('#map='+inMapName);

		currentMapData = data;
		currentMap = MapData.fromData(data);

		redrawLegendPane();

		$('.bgColor').val(currentMap.bgColor).change();

		// Center map
		const ov = currentMap._overview;
		globalZoomLevel = ov.zoomLevel;
		globalOriginX = 0.5*($renderer.width() - ov.tileWidth*(ov.sizeE - ov.sizeW));
		globalOriginY = 0.5*($renderer.height() - ov.tileHeight*(ov.sizeS - ov.sizeN));

		// Render tiles
		globalZoomLevelChanged();
	})
	.catch(commonErrorHandler);
}

//TODO: We just added zoom-based visibility support for icons,
// but there's no clear UI information about it.
// Need to convey this information to the legend somehow, in a better way than title/tooltip.

function redrawLegendPane() {
	let html = "";
	if (currentMap && currentMap.icons) {
		for (let icon of currentMap.icons) {
			html += '<li>'
				+ '<img src="'+icon.imageUri.replaceAll('"',"&quot;")+'"/>'
				+ '<span>'+escapeHtml(icon.name)+'</span>'
				+ '<input type="checkbox" '+(icon.isEnabled() ? 'checked' : '')+'/>'
				+ '</li>';
		}
	}
	$('.legend').html(html);
}

// Converts (clientX,clientY) into {x,y} map coordinates
function clientPosToCoordinates(clientX, clientY) {
	return {
		x: (clientX - $renderer.offset().left - globalOriginX) * 100 / globalZoomLevel,
		y: (clientY - $renderer.offset().top - globalOriginY) * 100 / globalZoomLevel,
	};
}


//================================================
// Editor script
//================================================

let $inputFileImage;

function isEditing() {
	return $('body').hasClass('editing');
}
function isEditingTile() {
	return $('body').hasClass('editing-tile');
}

function isValidImageType(type) {
	return type && type.match(/^image\//);
}

function isCellUploadable($td) {
	return $td.find('.upload').length > 0;
}

function triggerInputFile($input, callback) {
	$input[0].form.reset();
	$input.off('change').on('change', function() {
		callback.call(this, this.files[0]);
	}).click();
}

$(document).ready(function() {

	$inputFileImage = $('.inputfile-image');

	// New map
	$('button.newmap').click(() => {
		bootbox.prompt({
			title: "New Map",
			placeholder: "New map name…",
			buttons: { confirm:{label:"Continue",className:"btn-success"} },
			callback: (displayName) => {
				if (!displayName)
					return;
				displayName = displayName.trim();
				let normalizedName = normalizeMapName(displayName);
				if (normalizedName.length < 3)
					return commonErrorHandler("Normalized name '"+normalizedName+"' is too short !");
				if ($('option[value="'+normalizedName+'"]').length > 0)
					return commonErrorHandler("Normalized name '"+normalizedName+"' already exists !");

				// Pass in an empty data object, MapData will construct itself with defaults
				onChangeMap(normalizedName, {});
				// Open edit panel
				setTimeout(() => isEditing() || $('button.edit').click(), 1);
			},
		});
	});

	// Edit panel
	const $pane = $('.editpane');

	$('button.edit').click(() => {
		if (!currentMap)
			return;

		$('body').addClass('editing');
	});
	$pane.find('button.close').click(() => {
		$('body').removeClass('editing');
	});

	// Background color update
	$('.bgColor').on('change', function() {
		currentMap.bgColor = this.value;

		$renderer.css('background-color', currentMap.bgColor);
				
		parsedBgColor = parseColor($renderer.css('background-color'));

		globalFgColor = '#fff';
		// if background is bright, use dark foreground
		if (parsedBgColor.r + parsedBgColor.g + parsedBgColor.b > 500)
			globalFgColor = '#000';

		$renderer.css('color', globalFgColor);
	});

	// Tileset info
	$renderer.on('tileset-change', (event, tileset) => {
		$renderer.find('table.current').removeClass('current');
		tileset.$table.addClass('current');

		$pane.find('.tilesetIndex').text(tileset._index);
		$pane.find('.zoomLevel').val(tileset.zoomLevel);
		$pane.find('.tileWidth').val(tileset.tileWidth);
		$pane.find('.tileHeight').val(tileset.tileHeight);
		$pane.find('.offsetX').val(tileset.offsetX);
		$pane.find('.offsetY').val(tileset.offsetY);
		$pane.find('.sizeW').text(tileset.sizeW);
		$pane.find('.sizeE').text(tileset.sizeE);
		$pane.find('.sizeN').text(tileset.sizeN);
		$pane.find('.sizeS').text(tileset.sizeS);
	});

	// Tileset editing

	$pane.find('.recenter').click(() => {
		globalOriginX = $renderer.width() / 2;
		globalOriginY = $renderer.height() / 2;
		globalPositionChanged();
	});

	$pane.find('.trim').click(() => {
		currentTileset.trim();
	});

	$pane.find('.zoomLevel').on('change', function() {
		currentTileset.zoomLevel = parseFloat(this.value);
		currentTileset.render(true);
		currentMap.updateTilesetOrder();
	});

	$pane.find('.tileWidth, .tileHeight, .offsetX, .offsetY').on('change', function() {
		currentTileset[this.classList[0]] = parseInt(this.value);
		currentTileset.render(true);
	});

	$renderer.setupContextMenu('td', /*menu*/function(event) {
		if (!isEditing())
			return null;

		let $menu = $('#cmenu-tile');

		// Remove tile
		$menu.find('.remove').addClass('d-none');
		if (isEditing() && !isEditingTile() && currentTileset == currentMap.getTilesetFromTable(this.closest('table'))) {
			const cell = currentTileset.getCellAt(event.clientX, event.clientY);
			const tile = currentTileset.getTileAt(cell.row, cell.col);
			if (tile)
				$menu.find('.remove').removeClass('d-none');
		}

		return $menu;
	}, /*callback*/function($action, initialEvent) {
		if ($action.hasClass('remove')) {
			const cell = currentTileset.getCellAt(initialEvent.clientX, initialEvent.clientY);
			currentTileset.removeTileAt(cell.row, cell.col);
		}
	});

	// New tileset

	$pane.find('.newtileset').click(() => {
		/*
		for (let tileset of currentMap.tilesets) {
			if (tileset.zoomLevel == globalZoomLevel)
				return commonErrorHandler("Tileset at zoom level " + globalZoomLevel + " already exists !");
		}
		*/
		// Note: there's no reason not to allow multiple Tilesets to co-exist at same zoomLevel
		// Just avoid overlaps, as the zIndex would be inconsistent

		currentMap.createNewTileset(globalZoomLevel);
		globalZoomLevelChanged();
	});

	// Setup "upload" buttons and dragdrop handlers

	$renderer.on('click', 'button.upload', function(event) {
		const tileset = currentMap.getTilesetFromTable($(this).closest('table'));
		const cell = tileset.getCellAt(event.clientX, event.clientY);
		triggerInputFile($inputFileImage, (file) => setupCellImageEditingWithFile(tileset, cell.row, cell.col, file));
	});

	$renderer.setupDragDrop('td', {
		enabledFn: function() { return isEditing() && !isEditingTile() && isCellUploadable($(this)) },
		validateFn: isValidImageType,
		callbackFn: function(event, file) {
			const tileset = currentMap.getTilesetFromTable($(this).closest('table'));
			//NOTE: This may not be the best way to get the cell
			const cell = tileset.getCellAt(event.clientX, event.clientY);
			setupCellImageEditingWithFile(tileset, cell.row, cell.col, file);
		},
	});

	// New icon
	setupModalEditIcon();

	// Legend pane (icons) editing
	$('.legend').setupContextMenu('li', /*menu*/() => isEditing() ? $('#cmenu-icon') : null, /*callback*/function($action) {
		let iconIndex = this.index();
		if ($action.hasClass('edit')) {
			$('#modalEditIcon').data('index', iconIndex).modal('show');
		}
		else if ($action.hasClass('remove')) {
			currentMap.removeIcon(iconIndex);
			redrawLegendPane();
		}
	});

	// Icon dragdrop into map
	$('.legend').on('mousedown', 'li', function(event) {
		if (event.which != 1 || !isEditing() || event.target.nodeName == 'INPUT')
			return;

		const iconIndex = $(this).index();
		const iconDef = currentMap.icons[iconIndex];
		if (!iconDef.isEnabled() || !iconDef.isVisible())
			return;

		const $dragIcon = $(this).find('img').clone().addClass('dragging').css({
			width: iconDef.sizeX,
			height: iconDef.sizeY,
			marginLeft: iconDef.offsetX,
			marginTop: iconDef.offsetY,
			left: event.clientX,
			top: event.clientY,
		}).appendTo('body');

		$(window).on('mousemove', (event) => {
			$dragIcon.css({ left: event.clientX, top: event.clientY });
		});
		$(window).one('mouseup', (event) => {
			$(window).off('mousemove');
			$dragIcon.remove();
			// Check that we dropped in renderer
			if (document.elementFromPoint(event.clientX, event.clientY).closest('.renderer')) {
				const coords = clientPosToCoordinates(event.clientX, event.clientY);
				currentMap.createNewMarker(iconIndex, coords.x, coords.y);
			}
		});

		return false;
	});

	// Marker events
	$renderer.setupContextMenu('.layer > *', /*menu*/() => isEditing() ? $('#cmenu-marker') : null, /*callback*/function($action) {
		let markerIdx = currentMap.findMarkerFromElement(this);
		if ($action.hasClass('edit')) {
			const icon = currentMap.icons[markerIdx.iconIndex];
			const marker = icon.markers[markerIdx.markerIndex];
			bootbox.prompt({
				title: icon.name,
				size: 'small',
				value: marker.info || "",
				placeholder: "Custom info here…",
				callback: (result) => {
					if (result === null)
						return;	//cancelled

					marker.info = result.trim();
					if (!marker.info)	//empty string
						delete marker.info;

					icon.renderMarker(marker, false);	//re-render in-place
				},
			});
		}
		else if ($action.hasClass('remove'))
			currentMap.removeMarker(markerIdx.iconIndex, markerIdx.markerIndex);
	});

	// Export map data
	$pane.find('button.export').click(() => {
		currentMap.cullEmptyTilesets();
		//let text = "window."+JSONP_KEY_MAPDATA+" = " + serializeToJson(currentMap,'\t');
		let text = "window."+JSONP_KEY_MAPDATA+" = " + serializeToJS(currentMap);
		let blob = new Blob([text], { type:'application/json' });
		downloadBlob(blob, $('.dataPath').text().split('/').pop());
	});

});

// dir is 'W' 'E' 'N' 'S'
function expandTileset(dir) {
	if (currentTileset)
		currentTileset.expand(dir, 1);
}

function setupCellImageEditingWithFile(tileset, row, col, file) {
	readFileAs(file, 'dataURL')
	.then(loadSrcIntoImg)
	.then(img => setupCellImageEditingWithLoadedImg(tileset, row, col, img))
	.catch(commonErrorHandler);
}

function setupCellImageEditingWithLoadedImg(tileset, row, col, img) {
	img.className = 'editing';
	$('body').addClass('editing-tile');

	// initial scale
	const minScale = Math.max(tileset.tileWidth/img.naturalWidth, tileset.tileHeight/img.naturalHeight);

	const minWidth = Math.round(minScale*img.naturalWidth);
	const minHeight = Math.round(minScale*img.naturalHeight);
	let imgWidth = minWidth;
	let imgHeight = minHeight;
	let imgX = (tileset.tileWidth - imgWidth) / 2;
	let imgY = (tileset.tileHeight - imgHeight) / 2;

	const $panel = $('.tile-image-editing');
	$panel.find('.srcWidth').text(img.naturalWidth);
	$panel.find('.srcHeight').text(img.naturalHeight);
	$panel.find('.imagePath').text( getTileImageUrl(tileset, row, col) );

	function updateImg() {
		imgWidth = Math.round(imgWidth);
		imgHeight = Math.round(imgHeight);
		imgX = clamp(imgX, tileset.tileWidth - imgWidth, 0);
		imgY = clamp(imgY, tileset.tileHeight - imgHeight, 0);
		$(img).css({
			width: imgWidth+'px',
			height: imgHeight+'px',
			left: imgX+'px',
			top: imgY+'px',
		});
		$panel.find('.width').val(imgWidth);
		$panel.find('.height').val(imgHeight);
	}
	updateImg();

	// We need to re-setup the handlers every time table is rebuilt
	function setupTableCellHandlers() {
		const $td = tileset.getElementAt(row, col);
		if (!$td)
			return;

		$td.html(img);

		// Use Ctrl+LMB to pan and Ctrl+Wheel to zoom
		$(img).on('mousedown', (event) => {
			if (event.which != 1 || !event.ctrlKey)
				return;

			const dragStart = { clientX:event.clientX, clientY:event.clientY, imgX:imgX, imgY:imgY };
			$(img).addClass('panning');
			$(window).on('mousemove', (event) => {
				imgX = dragStart.imgX + event.clientX - dragStart.clientX;
				imgY = dragStart.imgY + event.clientY - dragStart.clientY;
				updateImg();
			});
			$(window).one('mouseup', () => {
				$(window).off('mousemove');
				$(img).removeClass('panning');
			});
			return false;
		}).on('mousewheel', (event) => {
			if (!event.ctrlKey)
				return;

			// Scale pixel by pixel, always according to largest dimension for best precision
			if (event.originalEvent.deltaY < 0) {
				// Scale up
				if (imgWidth > imgHeight) {
					imgWidth++;
					imgHeight = imgWidth*img.naturalHeight/img.naturalWidth;
				}
				else {
					imgHeight++;
					imgWidth = imgHeight*img.naturalWidth/img.naturalHeight;
				}
			}
			else if (event.originalEvent.deltaY > 0) {
				// Scale down
				if (imgWidth > imgHeight) {
					imgWidth = Math.max(minWidth, imgWidth-1);
					imgHeight = imgWidth*img.naturalHeight/img.naturalWidth;
				}
				else {
					imgHeight = Math.max(minHeight, imgHeight-1);
					imgWidth = imgHeight*img.naturalWidth/img.naturalHeight;
				}
			}
			else
				return true;

			updateImg();
			return false;
		});
	}
	setupTableCellHandlers();

	function onTableRebuilt(ev, evTileset) {
		if (evTileset == tileset)
			setupTableCellHandlers();
	}
	$renderer.on('table-rebuilt', onTableRebuilt);

	// We can also scale by setting size values directly
	$panel.find('.width').attr('min', minWidth).off('change').on('change', function() {
		imgWidth = Math.max(minWidth, parseInt(this.value));
		imgHeight = imgWidth*img.naturalHeight/img.naturalWidth;
		updateImg();
	});
	$panel.find('.height').attr('min', minHeight).off('change').on('change', function() {
		imgHeight = Math.max(minHeight, parseInt(this.value));
		imgWidth = imgHeight*img.naturalWidth/img.naturalHeight;
		updateImg();
	});

	// Also support precise positioning with arrows
	function onKeyDown(event) {
		if (event.key == 'ArrowLeft')
			imgX--;
		else if (event.key == 'ArrowRight')
			imgX++;
		else if (event.key == 'ArrowUp')
			imgY--;
		else if (event.key == 'ArrowDown')
			imgY++;
		else
			return true;
		updateImg();
		return false;
	}
	$renderer.on('keydown', onKeyDown);

	function cleanup() {
		img.remove();

		$renderer.off('table-rebuilt', onTableRebuilt);
		$renderer.off('keydown', onKeyDown);
		$('body').removeClass('editing-tile');

		const $td = tileset.getElementAt(row, col);
		if ($td)
			$td.html(tileset.renderTableCell(row, col));

		$panel.removeClass('active');
	}

	$panel.find('.cancel').off('click').click(cleanup);
	$panel.find('.commit').off('click').click(() => {
		// Generate final tile image

		// This quality ratio seems to give best results
		// 150% tile dimensions, 80% quality
		// Good at 100% scale, good enough when zooming in on, small file size
		const quality = 0.80;
		let tileScale = 1.50;

		// Note: Avoid scaling the image UP - unless we have to
		// Scale up if image source < tile dimensions
		// Don't scale if image source < target dimensions (ie. 150% tile dimensions)
		// Scale down if image source > target dimensions
		let destWidth, destHeight;

		const croppedNaturalWidth = img.naturalWidth * tileset.tileWidth / imgWidth;
		const croppedNaturalHeight = img.naturalHeight * tileset.tileHeight / imgHeight;

		if (croppedNaturalWidth <= tileset.tileWidth || croppedNaturalHeight <= tileset.tileHeight) {
			// Scale img UP to tileWidth/tileHeight
			destWidth = tileset.tileWidth;
			destHeight = tileset.tileHeight;
		}
		else if (croppedNaturalWidth <= tileScale*tileset.tileWidth || croppedNaturalHeight <= tileScale*tileset.tileHeight) {
			// Keep img original size
			imgWidth = img.naturalWidth;
			imgHeight = img.naturalHeight;
			destWidth = croppedNaturalWidth;
			destHeight = croppedNaturalHeight;
			// Adjust crop values which are scaled
			tileScale = Math.max(destWidth/tileset.tileWidth, destHeight/tileset.tileHeight);
			imgX = Math.round(imgX*tileScale);
			imgY = Math.round(imgY*tileScale);
		}
		else {
			// Scale (down) to 150% of tile dimensions
			imgWidth = Math.round(tileScale*imgWidth);
			imgHeight = Math.round(tileScale*imgHeight);
			destWidth = Math.round(tileScale*tileset.tileWidth);
			destHeight = Math.round(tileScale*tileset.tileHeight);
			imgX = Math.round(tileScale*imgX);
			imgY = Math.round(tileScale*imgY);
		}

		//TODO: FIXME: Rounding errors are not great here
		// It should be possible to scale the image in a way that does not generate rounding errors
		// Allowing a slight overflow in the generated image, then we fix it on display with object-fit and overflow hidden.

		imageResizeCropEncode(img, {
			drawWidth: imgWidth,
			drawHeight: imgHeight,
			cropX: imgX,
			cropY: imgY,
			destWidth: destWidth,
			destHeight: destHeight,
			encodeType: 'image/webp',
			quality: 0.80,
			resultType: 'blob',
		})
		.then(blob => {

			const url = URL.createObjectURL(blob);

			// Create the Tile with local image
			tileset.createLocalTile(row, col, url);

			// Send image for download
			downloadObjectURL(url, $('.imagePath').text().split('/').pop());

			cleanup();

		});
	});
}

function setupModalEditIcon() {
	const $modal = $('#modalEditIcon');
	const $iconContainer = $modal.find('.icon-container');
	const $icon = $iconContainer.find('img');

	// Existing icon being edited if applicable
	let editingIcon;

	// Resize/re-encode icon if original image is not SVG format
	let resizeImage;

	// Cache values here until save
	let tempIcon;

	function showPage(sel) {
		$modal.find('.modal-body').addClass('d-none').filter(sel).removeClass('d-none');
	}

	$modal.on('show.bs.modal', (event) => {
		$iconContainer.css('background-color', currentMap ? currentMap.bgColor : '');

		if ($(event.relatedTarget).hasClass('newicon')) {
			// New icon
			editingIcon = null;
			tempIcon = new MarkerIconDefinition();

			showPage('.page1');

			// Offer a random placeholder
			const rng = Math.random();
			const bgColor = ('00'+Math.round(rng*0xfff).toString('16')).slice(-3);
			const fgColor = ('00'+Math.round((1-rng)*0xfff).toString('16')).slice(-3);
			const label = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ?!+-•$"[Math.floor(43*Math.random())];
			$modal.find('.ph-bgColor').val(bgColor);
			$modal.find('.ph-fgColor').val(fgColor);
			$modal.find('.ph-label').val(label).change();
		}
		else {
			// Editing icon
			const iconIndex = $modal.data('index');
			editingIcon = currentMap.icons[iconIndex];

			// Clone
			tempIcon = Object.assign({}, editingIcon);

			resizeImage = false;
			onIconSrc(editingIcon.imageUri);
		}
	});

	// Upload img / dragdrop
	$modal.find('.upload').click(() => triggerInputFile($inputFileImage, onFile));
	$modal.setupDragDrop({
		validateFn: isValidImageType,
		callbackFn: (event, file) => onFile(file),
	});
	function onFile(file) {
		console.log(file.type, file.size);
		if (file.type.startsWith('image/svg') && file.size < 10000) {
			resizeImage = false;
			readFileAs(file, 'text').then(svgToDataURL).then(onIconSrc).catch(commonErrorHandler);
		}
		else {
			resizeImage = (file.type != 'image/webp' || file.size > 9999);
			readFileAs(file, 'dataURL').then(onIconSrc).catch(commonErrorHandler);
		}
	}

	// Placeholder icon designer
	$modal.find('.ph-bgColor, .ph-fgColor, .ph-label').on('change', () => {
		let phIcon = MarkerIconDefinition.makeSimple("",
			$modal.find('.ph-bgColor').val(),
			$modal.find('.ph-fgColor').val(),
			$modal.find('.ph-label').val()
		);
		$modal.find('.icon-placeholder').attr('src', phIcon.imageUri);
	});
	$modal.find('.use-ph').click(() => {
		resizeImage = false;
		onIconSrc($modal.find('.icon-placeholder').attr('src'));
	});

	// Setup page 2 - icon properties
	function onIconSrc(src) {
		showPage('.page2');

		$modal.find('.name').val(tempIcon.name);
		$modal.find('.zoomLevel').val(tempIcon.zoomLevel);

		loadSrcIntoImg(src, $icon[0])
		.then(img => {
			if (editingIcon) {
				// For existing icon, keep saved values
				$modal.find('.sizeX').val(tempIcon.sizeX).change();
				$modal.find('.sizeY').val(tempIcon.sizeY).change();
				$modal.find('.anchorX').val(cssValueOp_negative(tempIcon.offsetX)).change();
				$modal.find('.anchorY').val(cssValueOp_negative(tempIcon.offsetY)).change();
			}
			else {
				// For new icon, pre-setup default width, height, and anchor based on img dimensions
				if (img.naturalWidth >= img.naturalHeight) {
					let remSizeX = parseFloat(tempIcon.sizeX);
					$modal.find('.sizeX').val(tempIcon.sizeX).change();
					$modal.find('.anchorX').val((remSizeX/2)+'rem').change();

					let remSizeY = Math.round(10 * remSizeX * img.naturalHeight / img.naturalWidth) / 10;
					$modal.find('.sizeY').val(remSizeY+'rem').change();
					$modal.find('.anchorY').val((remSizeY/2)+'rem').change();
				}
				else {
					let remSizeY = parseFloat(tempIcon.sizeY);
					$modal.find('.sizeY').val(tempIcon.sizeY).change();
					$modal.find('.anchorY').val((remSizeY/2)+'rem').change();

					let remSizeX = Math.round(10 * remSizeY * img.naturalWidth / img.naturalHeight) / 10;
					$modal.find('.sizeX').val(remSizeX+'rem').change();
					$modal.find('.anchorX').val((remSizeX/2)+'rem').change();
				}
			}
		})
		.catch(commonErrorHandler);
	}

	$modal.find('.sizeX').on('change', function() {
		tempIcon.sizeX = this.value;
		$iconContainer.css('width', tempIcon.sizeX);
	});
	$modal.find('.sizeY').on('change', function() {
		tempIcon.sizeY = this.value;
		$iconContainer.css('height', tempIcon.sizeY);
	});
	$modal.find('.anchorX').on('change', function() {
		$modal.find('.anchor').css('left', this.value);
		tempIcon.offsetX = cssValueOp_negative(this.value);
	});
	$modal.find('.anchorY').on('change', function() {
		$modal.find('.anchor').css('top', this.value);
		tempIcon.offsetY = cssValueOp_negative(this.value);
	});
	$modal.find('.show-anchor').hover(() => $modal.find('.anchor').removeClass('d-none'), () => $modal.find('.anchor').addClass('d-none'));

	$modal.find('form').on('submit', (event) => {
		tempIcon.name = ($modal.find('.name').val() || "").trim();
		if (!tempIcon.name)
			return $modal.find('.name').val("").closest('form')[0].reportValidity();

		tempIcon.zoomLevel = parseFloat($modal.find('.zoomLevel').val()) || 0;

		// Note: difficult to validate sizes, we can only assume they're correct
		if (!$iconContainer.width())
			return $modal.find('.sizeX').val("").closest('form')[0].reportValidity();
		if (!$iconContainer.height())
			return $modal.find('.sizeY').val("").closest('form')[0].reportValidity();

		Promise.resolve()
		.then(() => {
			if (resizeImage) {
				return imageResizeCropEncode($icon[0], {
					destWidth: $iconContainer.width(),
					destHeight: $iconContainer.height(),
					encodeType: 'image/webp',
					quality: 0.9,
					resultType: 'dataURL',
				})
			}
			else
				return $icon.attr('src');
		})
		.then((finalSrc) => {
			tempIcon.imageUri = finalSrc;
			if (editingIcon) {
				Object.assign(editingIcon, tempIcon);
				editingIcon.removeLayer();
				editingIcon.renderLayer();
			}
			else {
				currentMap.createNewIcon(tempIcon);
			}
			redrawLegendPane();
			$modal.modal('hide');
		})
		.catch(commonErrorHandler);

		return false;
	});
}


//================================================
// Utilities
//================================================

function parseUrlParameters() {
	let result = {};

	// Look for search parameters (?querystring)
	let url = URL.parse(window.location);
	url.searchParams.forEach((v,k) => result[k] = v);

	// Also look for hash parameters (#hash)
	url.search = '?' + url.hash.substr(1);
	url.searchParams.forEach((v,k) => result[k] = v);

	return result;
}

function parseColor(colorStr) {
	let $div = $('<div style="position:fixed;left:1px;top:1px;width:1px;height:1px;color:'+colorStr+'">').appendTo('body');
	let rgbStr = getComputedStyle($div[0]).color;
	$div.remove();
	rgbStr = rgbStr.replace(/\s/g, "");
	//console.log(rgbStr);
	// NOTE: RGB are bytes but Alpha is float... Hope this is somewhat consistent across browsers
	let m = rgbStr.match(/^rgba?\((?<r>\d+),(?<g>\d+),(?<b>\d+)(?:,(?<a>[\d.]+))?\)$/i);
	let result = { r:0, g:0, b:0, a:1.0 };
	if (m) {
		//console.log(m.groups);
		result.r = parseInt(m.groups.r);
		result.g = parseInt(m.groups.g);
		result.b = parseInt(m.groups.b);
		if (m.groups.a >= 0)
			result.a = parseFloat(m.groups.a);
	}
	return result;
}

function escapeHtml(text) {
	return (text || "").replaceAll('<',"&lt;").replaceAll('>',"&gt;");
}
function escapeSvg(svg) {
	return svg
		.replaceAll('%','%25')
		.replaceAll('#','%23')
		.replaceAll('&','%26')
}
function svgToDataURL(svg) {
	// Try to optimize spaces
	svg.replace(/\s/g, " ").replace(/  +/g, " ").replace(/> /g, ">").replace(/ </g, "<");
	//console.log(svg);

	return "data:image/svg+xml," + escapeSvg(svg);
}

function readFileAs(file, asType) {
	return new Promise((resolve, reject) => {
		if (!file)
			return reject("readFileAs: no file");

		const reader = new FileReader();
		reader.onload = function(event) {
			if (event.target.readyState == FileReader.DONE)
				resolve(event.target.result);
			else
				console.log("readyState?!", event.target.readyState);
		};
		reader.onerror = reject;
		if (asType == 'dataURL')
			reader.readAsDataURL(file);
		else if (asType == 'text')
			reader.readAsText(file);
		else if (asType == 'arrayBuffer')
			reader.readAsArrayBuffer(file);
		else
			reject("readFileAs: type must be 'dataURL' or 'text' or 'arrayBuffer'");
	});
}

function loadSrcIntoImg(src, img) {
	return new Promise((resolve, reject) => {
		if (!img)
			img = new Image();
		img.onload = () => resolve(img);
		img.onerror = reject;
		img.src = src;
	});
}

function clamp(val, min, max) {
	return Math.min(Math.max(val, min), max);
}

function arrayAddUnique(array, element) {
	const i = array.indexOf(element);
	if (i == -1)
		array.push(element);
}

function arrayLast(arr) {
	arr || (arr = []);
	return arr[arr.length-1];
}

function downloadObjectURL(url, fileName) {
	const link = document.createElement('a');
	link.href = url;
	link.download = fileName;
	document.body.appendChild(link);
	link.click();
	setTimeout(() => link.remove(), 1);
}

function downloadBlob(blob, fileName) {
	const url = URL.createObjectURL(blob);
	downloadObjectURL(url, fileName);
	setTimeout(() => URL.revokeObjectURL(url), 1);
}

function imageResizeCropEncode(img, args) {
	args || (args = {});
	if (!args.drawWidth) args.drawWidth = args.destWidth || img.naturalWidth;
	if (!args.drawHeight) args.drawHeight = args.destHeight || img.naturalHeight;
	if (!args.destWidth) args.destWidth = args.drawWidth;
	if (!args.destHeight) args.destHeight = args.drawHeight;
	if (!args.cropX) args.cropX = 0;
	if (!args.cropY) args.cropY = 0;
	if (!args.quality) args.quality = 1.0;
	if (!args.encodeType) args.encodeType = 'image/webp';
	if (!args.resultType) args.resultType = 'blob';

	return new Promise((resolve,reject) => {
		try {
			let canvas = document.createElement('canvas');
			canvas.width = args.destWidth;
			canvas.height = args.destHeight;
			let context = canvas.getContext('2d');
			context.drawImage(img, -Math.abs(args.cropX), -Math.abs(args.cropY), args.drawWidth, args.drawHeight);
			if (args.resultType == 'blob')
				canvas.toBlob(resolve, args.encodeType, args.quality);
			else if (args.resultType == 'dataURL')
				resolve(canvas.toDataURL(args.encodeType, args.quality));
		}
		catch(err) {
			reject(err);
		}
	});
}

function normalizeMapName(displayName) {
	return displayName.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// options.enabledFn  : optional callback to check if dragdrop should be handled at all or not
// options.validateFn : optional callback to validate input file (only available if DataTransferItemList is available)
// options.callbackFn : mandatory callback to handle result file
$.fn.setupDragDrop = function(subSelector, options) {
	if (options === undefined) {
		options = subSelector;
		subSelector = undefined;
	}
	if (typeof(options) == 'function')
		options = { callback: options };
	if (!options || !options.callbackFn)
		throw new Error("setupDragDrop: callbackFn required");

	return this.on('dragenter dragover', subSelector || undefined, function(event) {
		event.preventDefault();
		if (options.enabledFn && !options.enabledFn.call(this))
			return;

		clearTimeout(this.dropTimeout);
		if (event.originalEvent.dataTransfer.items && options.validateFn && !options.validateFn.call(this, event.originalEvent.dataTransfer.items[0].type))
			$(this).addClass('dropfail');
		else
			$(this).addClass('dropok');
	})
	.on('dragleave', subSelector || undefined, function(event) {
		event.preventDefault();
		clearTimeout(this.dropTimeout);
		// Use delay to avoid jitter when passing over child elements
		this.dropTimeout = setTimeout(() => $(this).removeClass('dropok dropfail'), 50);
	})
	.on('drop', subSelector || undefined, function(event) {
		event.preventDefault();
		clearTimeout(this.dropTimeout);
		$(this).removeClass('dropok dropfail');

		if (options.enabledFn && !options.enabledFn.call(this))
			return;

		if (event.originalEvent.dataTransfer.items) {
			// Use DataTransferItemList interface to access the file
			let item = event.originalEvent.dataTransfer.items[0];
			if (item.kind === 'file' && (!options.validateFn || options.validateFn.call(this, item.type)))
				options.callbackFn.call(this, event, item.getAsFile());
		}
		else {
			// Use DataTransfer interface to access the file
			let file = event.originalEvent.dataTransfer.files[0];
			if (!options.validateFn || options.validateFn.call(this, file.type))
				options.callbackFn.call(this, event, file);
		}
	});
}

// Returns the negative of a css value regardless of its unit
function cssValueOp_negative(cssValue) {
	cssValue = cssValue.trim();
	if (cssValue.startsWith('-'))
		return cssValue.slice(1);
	return '-'+cssValue;
}


//================================================
// Context menu
//================================================

$.fn.setupContextMenu = function(subSelector, menuResolver, actionCallback) {
	if (actionCallback === undefined) {
		actionCallback = menuResolver;
		menuResolver = subSelector;
		subSelector = undefined;
	}
	if (!menuResolver)
		throw new Error("setupContextMenu: menuResolver required");
	if (!actionCallback)
		throw new Error("setupContextMenu: actionCallback required");

	return this.off('contextmenu', subSelector).on('contextmenu', subSelector, function(event) {
		if (event.ctrlKey)
			return;	// Ctrl + right click allow default context menu

		return !$(this).openContextMenu(event, menuResolver, event.clientX, event.clientY, actionCallback);
	});
};

$.fn.openContextMenu = function(contextMenuEvent, menuResolver, x, y, actionCallback) {
	closeContextMenu();

	if (!menuResolver)
		throw new Error("openContextMenu: menuResolver required");
	if (!actionCallback)
		throw new Error("openContextMenu: actionCallback required");

	let $elem = this;

	let $menu = (typeof(menuResolver) == 'function') ? menuResolver.call($elem, contextMenuEvent) : $(menuResolver);
	if (!$menu || $menu.length == 0)
		return false;

	$menu.show()
		.css({
			position: 'absolute',
			left: __cmenu_getPos($menu, x, 'width', 'scrollLeft'),
			top : __cmenu_getPos($menu, y, 'height', 'scrollTop'),
			zIndex: 1080,	//draw over bootstrap tooltips
		})
		.off('click')
		.on('click', 'a,button', function(event) {
			event.preventDefault();
			closeContextMenu();
			actionCallback.call(/*initial target*/$elem, /*menu button*/$(this), contextMenuEvent);
		});

	setTimeout(() => $('body').one('click', closeContextMenu), 1);
	return true;
}

function closeContextMenu() {
	$('body').off('click', closeContextMenu);
	$('.dropdown-menu:visible').hide().trigger('cmenu.dismiss');
}

function __cmenu_getPos(menu, mousePos, sizeFunc, scrollFunc) {
	let menuSize = menu[sizeFunc]();
	if (mousePos + menuSize > $(window)[sizeFunc]() && menuSize < mousePos)
		return $(window)[scrollFunc]() + mousePos - menuSize;
	else
		return $(window)[scrollFunc]() + mousePos;
}


//================================================
// Error handling
//================================================

function commonErrorHandler(err) {
	console.error(err);
	err = translateError(err);
	return bootbox.alert({
		message: '<div class="bootbox-title">' + err.title + '</div>' + err.body,
		buttons: { ok:{className:'btn-danger'} },
	});
}
function translateError(err) {
	// no error information
	if (!err)
		return { title: "ERROR", body: "Unknown error" };

	// script error (exception)
	if (err.stack) {
		return {
			title: "Application Error",
			body: [
				"An internal application error occured",
				err.name,
				err.message,
				'<pre>' + err.stack + '</pre>',
			].join('<br>')
		};
	}

	// script thrown message
	if (typeof(err) == 'string')
		return { title: "ERROR", body: err };

	// server error status
	if (typeof(err.status) == 'number' || err.statusText) {
		let body1 = httpStatusText[err.status] || err.statusText || "";
		let body2 = err.responseText || "";
		if (err.responseText == err.statusText)
			body2 = "";
		return {
			title: "ERROR " + (err.status || "?"),
			body: (body1 + "\n" + body2).trim().replace(/\n/g, "<br>"),
		};
	}

	// unknown
	return { title: "ERROR", body: "Unknown error" };
}
const httpStatusText = {
	"400" : "Invalid Request",
	"401" : "Login Required",
	"403" : "Forbidden",
	"404" : "Not Found",
	"500" : "Internal Server Error",
	"0"   : "Network Error",
};