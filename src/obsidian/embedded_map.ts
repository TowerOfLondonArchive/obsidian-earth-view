import {
	MarkdownPostProcessorContext,
	Menu,
	Editor,
	MarkdownView,
	FileView,
	MenuItem,
	MarkdownFileInfo,
	TAbstractFile, TFile,
} from 'obsidian';
import * as leaflet from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import './styles.css'
import EarthPlugin from './main';
import {DistortableImageOverlay, CornersT} from "./DistortableImageOverlay"


let DefaultGeoJSON = "```geojson\n{\n    \"type\": \"FeatureCollection\",\n    \"features\": []\n}\n```\n"
let DefaultGeoJSONLineCount = (DefaultGeoJSON.match(/\n/g) || []).length;


export default class EarthCodeBlockManager {
	plugin: EarthPlugin;

	constructor(plugin: EarthPlugin){
		this.plugin = plugin;

		this.plugin.registerMarkdownCodeBlockProcessor("geojson", this.create_map.bind(this));
		this.plugin.app.workspace.on('editor-menu', this.#onContextMenu.bind(this));
	}

	#onContextMenu(menu: Menu, editor: Editor, view: MarkdownView | MarkdownFileInfo){
		if (!editor) return;
		if (view instanceof FileView) {
			menu.addItem((item: MenuItem) => {
				item.setTitle('Insert geoJSON');
				item.setIcon('search');
				item.setSection('mapview');
				item.onClick(async () => await this.#insertGeoJSON(editor));
			});
		}
	}

	async #insertGeoJSON(editor: Editor){
		editor.replaceRange(DefaultGeoJSON, editor.getCursor())
		editor.setCursor({
			line: editor.getCursor().line + DefaultGeoJSONLineCount,
			ch: 0
		})
	}

	async create_map(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
		let formatter = new GeoJSONFormatter(this.plugin);
		await formatter.wrap(source, el, ctx);
	}
}

const JPGUrlPattern = /!\[\[(?<path>.*?\.jpg)]]/
const PreviewPattern = /!\[\[(?<path>source\/.*?)#preview]]/

class TransformContext{
	map: leaflet.Map
	markers: leaflet.Marker[];

	constructor(map: leaflet.Map) {
		this.map = map;
		this.markers = [];
	}

	#addMarker(e: leaflet.LeafletMouseEvent){
		let marker = new leaflet.Marker(e.latlng, {draggable: true});
		// @ts-ignore
		marker._pmTempLayer = true;
		marker.on(
			"contextmenu",
			() => {
				this.map.removeLayer(marker);
				this.markers.remove(marker);
			}
		)

		let last_pos: leaflet.LatLng | null = null;

		marker.on("dragstart", (e) => {
			let target = e.target;
			if (target instanceof leaflet.Marker) {
				last_pos = target.getLatLng();
			}
		})

		marker.on("drag", (e) => {
			if (last_pos === null){
				// @ts-ignore
				last_pos = e.latlng;
			} else {
				// @ts-ignore
				let new_ll: leaflet.LatLng = e.latlng;
				let dlat = new_ll.lat - last_pos.lat;
				let dlng = new_ll.lng - last_pos.lng;

				function addDelta(latlngs: leaflet.LatLng[] | leaflet.LatLng[][] | leaflet.LatLng[][][]): leaflet.LatLng[] | leaflet.LatLng[][] {
					return latlngs.map((ll) => {
						if (ll instanceof leaflet.LatLng) {
							return new leaflet.LatLng(ll.lat + dlat, ll.lng + dlng);
						} else {
							return addDelta(ll);
						}
					})
				}

				this.map.eachLayer((layer) => {
					if (layer instanceof leaflet.Polygon) {
						layer.setLatLngs(addDelta(layer.getLatLngs()));
						layer.fire("edit");
					}
				})
				last_pos = new_ll;
			}
		})

		marker.on("dragend", (e) => {
			last_pos = null;
		})

		this.markers.push(marker);
		marker.addTo(this.map);
	}

	enable(){
		this.map.on("click", this.#addMarker, this);
	}
	disable(){
		this.map.off("click", this.#addMarker, this);
		this.markers.forEach(
			(marker: leaflet.Marker) => {
				this.map.removeLayer(marker);
			}
		);
		this.markers = [];
	}
}

class GeoJSONFormatter{
	plugin: EarthPlugin;

	el: HTMLElement;
	ctx: MarkdownPostProcessorContext;
	path: string;  // The path to the file
	map_el: HTMLDivElement; // The map HTML element
	map: leaflet.Map; // The map object
	img_path?: string;
	blob?: Blob;
	blob_path?: string;
	image_polygon?: leaflet.Polygon;
	image_overlay?: DistortableImageOverlay;
	transform_context: TransformContext | null;

	constructor(plugin: EarthPlugin) {
		this.plugin = plugin;
		this.transform_context = null;
	}

	markDirty() {
		let save_el = this.map_el.querySelector(".jgc-save")?.parentElement
		if (save_el) {
			save_el.style.backgroundColor = "darkorange"
		}
	}

	async #transformClick(){
		if (this.transform_context === null) {
			this.transform_context = new TransformContext(this.map);
			this.transform_context.enable();
		} else {
			this.transform_context.disable();
			this.transform_context = null;
		}
	}

	async saveMap() {
		let features: object[] = []
		let geojson = {
			"type": "FeatureCollection",
			"features": features
		};
		this.map.eachLayer((layer: leaflet.Layer) => {
			if (
				layer instanceof leaflet.Marker ||
				layer instanceof leaflet.CircleMarker ||
				layer instanceof leaflet.Polyline ||
				layer instanceof leaflet.Polygon
			) {
				features.push(layer.toGeoJSON());
			}
		})
		let selection = this.ctx.getSectionInfo(this.el);
		if (selection) {
			let text_split = selection.text.split("\n");
			let text_out = [
				...text_split.slice(0, selection.lineStart + 1),
				JSON.stringify(geojson, null, 4),
				...text_split.slice(selection.lineEnd),
			].join("\n");
			await this.plugin.app.vault.adapter.write(this.path, text_out);
		}
	}

	async rotatePolygon(){
		if (this.image_polygon){
			let lat_lngs = this.getPolygon(this.image_polygon.getLatLngs());
			if (lat_lngs){
				let new_lat_lngs: [leaflet.LatLng, leaflet.LatLng, leaflet.LatLng, leaflet.LatLng] = [lat_lngs[3], lat_lngs[0], lat_lngs[1], lat_lngs[2]];
				this.image_polygon.setLatLngs(new_lat_lngs);
				if (this.image_overlay){
					this.image_overlay.setCorners(new_lat_lngs);
				}
				this.markDirty();
			}
		}
	}

	async mirrorPolygon(){
		if (this.image_polygon){
			let lat_lngs = this.getPolygon(this.image_polygon.getLatLngs());
			if (lat_lngs){
				let new_lat_lngs: [leaflet.LatLng, leaflet.LatLng, leaflet.LatLng, leaflet.LatLng] = [lat_lngs[3], lat_lngs[2], lat_lngs[1], lat_lngs[0]];
				this.image_polygon.setLatLngs(new_lat_lngs);
				if (this.image_overlay){
					this.image_overlay.setCorners(new_lat_lngs);
				}
				this.markDirty();
			}
		}
	}

	initLayer(layer: leaflet.Layer) {
		layer.on('pm:edit', async e => {
			this.markDirty();
			if (layer instanceof leaflet.Polygon){
				if (layer == this.image_polygon){
					// Edited the image polygon
					await this.updateImageOverlay();
				} else if (!this.image_polygon && !!this.getPolygon(layer.getLatLngs())){
					// No existing polygon and a polygon has been edited
					this.image_polygon = layer;
					await this.updateImageOverlay();
				}
			} else if (layer instanceof leaflet.GeoJSON){
				let layers = layer.getLayers();
				for (let i = 0; i < layers.length; i++){
					let layer = layers[i];
					if (layer instanceof leaflet.Polygon){
						if (layer == this.image_polygon){
							// Edited the image polygon
							await this.updateImageOverlay();
							break;
						} else if (!this.image_polygon && !!this.getPolygon(layer.getLatLngs())){
							// No existing polygon and a polygon has been edited
							this.image_polygon = layer;
							await this.updateImageOverlay();
							break;
						}
					}
				}
			}
		});
		layer.on('pm:remove', e => {
			this.markDirty();
			if (layer instanceof leaflet.Polygon && layer == this.image_polygon){
				this.image_polygon = undefined;
				if (this.image_overlay){
					this.map.removeLayer(this.image_overlay);
				}
				this.image_overlay = undefined;
			}
		})
		layer.on('pm:cut', e => {
			this.initLayer(e.layer);
		})
	}

	async findImgURL(){
		let thisTFile = this.plugin.app.vault.getAbstractFileByPath(this.path);
		if (!(thisTFile instanceof TFile)){
			throw new Error("Incorrect TFile")
		}
		let file_src = await this.plugin.app.vault.read(thisTFile);
		let path = PreviewPattern.exec(file_src)?.groups?.path;
		if (typeof path == "string"){
			path = path + ".md";
			try {
				let source = await this.plugin.app.vault.adapter.read(path);
				this.img_path = JPGUrlPattern.exec(source)?.groups?.path;
			} catch (e) {}
		}
	}

	getPolygon(corners: leaflet.LatLng[] | leaflet.LatLng[][] | leaflet.LatLng[][][]): CornersT | null {
		if (corners.length == 4 && corners[0] instanceof leaflet.LatLng && corners[1] instanceof leaflet.LatLng && corners[2] instanceof leaflet.LatLng && corners[3] instanceof leaflet.LatLng){
			return [corners[0], corners[1], corners[2], corners[3]];
		} else if (corners.length == 1 && !(corners[0] instanceof leaflet.LatLng)){
			return this.getPolygon(corners[0]);
		}
		return null;
	}

	async updateImageOverlay(){
		let updated: boolean = false;
		if (this.img_path && this.image_polygon){
			let corners_or_null = this.getPolygon(this.image_polygon.getLatLngs());
			if (corners_or_null){
				let corners = corners_or_null;
				if (this.blob_path){
					if (this.image_overlay){
						this.image_overlay.setCorners(corners);
					} else {
						this.image_overlay = new DistortableImageOverlay(this.blob_path, {
							snapIgnore: true,
							opacity: 0.7
						});
						this.image_overlay.addTo(this.map);
						this.image_overlay.setCorners(corners);
					}
					updated = true;
				} else if (this.img_path) {
					this.plugin.app.vault.adapter.readBinary(this.img_path).then((jpg) => {
						this.blob = new Blob([jpg], {type: "application/jpg"});
						this.blob_path = URL.createObjectURL(this.blob);
						this.image_overlay = new DistortableImageOverlay(this.blob_path, {
							snapIgnore: true,
							opacity: 0.7
						});
						this.image_overlay.addTo(this.map);
						this.image_overlay.setCorners(corners);
					})
					updated = true;
				}
			}
		}

		if (!updated){
			this.image_polygon = undefined;
			this.image_overlay = undefined;
		}
	}

	async wrap(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
		this.el = el;
		this.ctx = ctx;
		this.path = ctx.sourcePath;
		await this.findImgURL()

		// If the file is renamed save the new file path
		this.plugin.app.vault.on("rename", (file: TAbstractFile, oldPath: string) => {
			if (oldPath == this.path){
				this.path = file.path;
			}
		})

		let geojson: leaflet.GeoJSON;

		try {
			geojson = leaflet.geoJSON(JSON.parse(source));
		} catch (e) {
			el.createEl("p").setText(e);
			return
		}

		this.map_el = el.createDiv(
			{ cls: 'geojson-map' },
			(el: HTMLDivElement) => {
				el.style.zIndex = '1';
				el.style.width = '100%';
				el.style.aspectRatio = '4/3';
			}
		);

		this.map = new leaflet.Map(this.map_el, {
			center: [0, 0],
			zoom: 0,
			worldCopyJump: true,
			maxBoundsViscosity: 1.0,
		});

		leaflet.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
			maxNativeZoom: 19,
			maxZoom: 25,
			attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
		}).addTo(this.map);

		if (this.plugin.edit_mode) {
			this.map.pm.addControls({
				position: 'topleft',
				drawCircle: false,
				drawPolyline: false,
				drawCircleMarker: false,
				drawText: false,
				drawRectangle: false
			});

			this.map.pm.Toolbar.createCustomControl({
				name: "transform",
				title: "transform",
				block: "edit",
				className: "jgc-transform",
				onClick: this.#transformClick.bind(this)
			})

			this.map.pm.Toolbar.createCustomControl({
				name: "save",
				title: "save",
				block: "custom",
				className: "jgc-save",
				onClick: this.saveMap.bind(this)
			})

			this.map.pm.Toolbar.createCustomControl({
				name: "rotate",
				title: "rotate",
				block: "custom",
				className: "jgc-img-rotate",
				onClick: this.rotatePolygon.bind(this)
			})

			this.map.pm.Toolbar.createCustomControl({
				name: "mirror",
				title: "mirror",
				block: "custom",
				className: "jgc-img-mirror",
				onClick: this.mirrorPolygon.bind(this)
			})

			this.map.on('pm:create', async ({layer}) => {
				this.markDirty();
				this.initLayer(layer);
				if (layer instanceof leaflet.Polygon){
					if (layer == this.image_polygon){
						// Edited the image polygon
						await this.updateImageOverlay();
					} else if (!this.image_polygon && !!this.getPolygon(layer.getLatLngs())){
						// No existing polygon and a polygon has been edited
						this.image_polygon = layer;
						await this.updateImageOverlay();
					}
				}
			});
			this.initLayer(geojson);
		}

		geojson.addTo(this.map);
		let layers = geojson.getLayers();
		for (let i = 0; i < layers.length; i++){
			let layer = layers[i];
			if (layer instanceof leaflet.Polygon){
				if (!this.image_polygon && !!this.getPolygon(layer.getLatLngs())){
					// No existing polygon and a polygon has been edited
					this.image_polygon = layer;
					await this.updateImageOverlay();
				}
				break;
			}
		}

		let bounds = geojson.getBounds();
		if (bounds.isValid()) {
			this.map.fitBounds(bounds, {maxZoom: 20});
		} else {
			this.map.fitBounds(this.plugin.default_bounds)
		}
		let fit = false;

		new ResizeObserver(() => {
			this.map.invalidateSize();
			if (!fit){
				let bounds = geojson.getBounds();
				if (bounds.isValid()) {
					this.map.fitBounds(bounds, {maxZoom: 20});
				} else {
					this.map.fitBounds(this.plugin.default_bounds)
				}
				fit = true;
			}
		}).observe(this.map_el);
	}
}
