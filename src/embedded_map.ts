import {
	MarkdownPostProcessorContext,
	Menu,
	Editor,
	MarkdownView,
	FileView,
	MenuItem,
	MarkdownFileInfo,
} from 'obsidian';
import * as leaflet from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import './styles.css'
import EarthPlugin from './main';


export default class EarthCodeBlockManager {
	plugin: EarthPlugin;

	constructor(plugin: EarthPlugin){
		this.plugin = plugin;
		this.plugin.registerMarkdownCodeBlockProcessor("geojson", this.#geojsonFormatter.bind(this));
	}

	#geojsonFormatter(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
		let manager = this;

		let geojson: leaflet.GeoJSON;

		try {
			geojson = leaflet.geoJSON(JSON.parse(source));
		} catch (e) {
			el.createEl("p").setText(e);
			return
		}

		const map_el = el.createDiv(
			{ cls: 'geojson-map' },
			(el: HTMLDivElement) => {
				el.style.zIndex = '1';
				el.style.width = '100%';
				el.style.aspectRatio = '4/3';
			}
		);

		const map = new leaflet.Map(map_el, {
			center: [0, 0],
			zoom: 0,
			worldCopyJump: true,
			maxBoundsViscosity: 1.0,
		});

		leaflet.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
			maxNativeZoom: 19,
			maxZoom: 25,
			attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
		}).addTo(map);

		map.pm.addControls({
			position: 'topleft',
			drawCircle: false,
			drawPolyline: false,
			drawCircleMarker: false,
			drawText: false,
			drawRectangle: false
		});

		function markDirty(){
			let save_el = map_el.querySelector(".jgc-save")?.parentElement
			if (save_el){
				save_el.style.backgroundColor = "darkorange"
			}
		}

		async function saveMap() {
			let features: object[] = []
			let geojson = {
				"type": "FeatureCollection",
				"features": features
			};
			map.eachLayer((layer: leaflet.Layer) => {
				if (
					layer instanceof leaflet.Marker ||
					layer instanceof leaflet.CircleMarker ||
					layer instanceof leaflet.Polyline ||
					layer instanceof leaflet.Polygon
				){
					features.push(layer.toGeoJSON());
				}
			})
			let selection = ctx.getSectionInfo(el);
			if (selection){
				let text_split = selection.text.split("\n");
				let text_out = [
					...text_split.slice(0, selection.lineStart+1),
					JSON.stringify(geojson, null, 4),
					...text_split.slice(selection.lineEnd),
				].join("\n");
				await manager.plugin.app.vault.adapter.write(ctx.sourcePath, text_out);
			}
		}

		map.pm.Toolbar.createCustomControl({
			name: "save",
			title: "save",
			block: "custom",
			className: "jgc-save",
			onClick: saveMap
		})

		function registerChange(layer: leaflet.Layer){
			layer.on('pm:edit', e => {
				markDirty()
			});
			layer.on('pm:remove', e => {
				markDirty()
			})
			layer.on('pm:cut', e => {
				registerChange(e.layer);
			})
		}

		map.on('pm:create', ({layer}) => {
			markDirty();
			registerChange(layer);
		});
		registerChange(geojson);

		geojson.addTo(map);
		let bounds = geojson.getBounds();
		if (bounds.isValid()) {
			map.fitBounds(bounds, {maxZoom: 20});
		} else {
			map.fitBounds(this.plugin.default_bounds)
		}
		let fit = false;

		new ResizeObserver(() => {
			map.invalidateSize();
			if (!fit){
				let bounds = geojson.getBounds();
				if (bounds.isValid()) {
					map.fitBounds(bounds, {maxZoom: 20});
				} else {
					map.fitBounds(this.plugin.default_bounds)
				}
				fit = true;
			}
		}).observe(map_el);
	}
}
