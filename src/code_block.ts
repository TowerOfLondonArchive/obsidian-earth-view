import {MarkdownPostProcessorContext} from 'obsidian';
import * as leaflet from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import './styles.css'
import EarthPlugin from './main';


export default class EarthCodeBlockManager {
	plugin: EarthPlugin;

	constructor(plugin: EarthPlugin){
		this.plugin = plugin;
		this.plugin.registerMarkdownCodeBlockProcessor("geojson", this.geojsonFormatter.bind(this));
	}

	async geojsonFormatter(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
		await new Promise(r => setTimeout(r, 100));

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
			maxZoom: 19,
			attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
		}).addTo(map);

		geojson.addTo(map);

		map.fitBounds(geojson.getBounds(), {maxZoom: 50});

		map.pm.addControls({
			position: 'topleft',
			drawCircle: false,
			drawPolyline: false,
			drawCircleMarker: false,
			drawText: false,
			drawRectangle: false
		});

		geojson.on('pm:edit', async (e) => {
			let selection = ctx.getSectionInfo(el);
			if (selection){
				let text_split = selection.text.split("\n");
				let text_out = [
					...text_split.slice(0, selection.lineStart+1),
					JSON.stringify(geojson.toGeoJSON(), null, 4),
					...text_split.slice(selection.lineEnd),
				].join("\n");
				console.log(text_out);
				//console.log(text_split.slice(selection.lineStart+1, selection.lineEnd));
				await this.plugin.app.vault.adapter.write(ctx.sourcePath, text_out);
			}
			// console.log();
			// console.log(JSON.stringify(geojson.toGeoJSON(), null, 4));
		});
	}
}
