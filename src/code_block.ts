import { MarkdownPostProcessorContext } from 'obsidian';
import leaflet from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';

export function geojsonFormatter(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
	// The map does not display correctly if it is created immediately.
	setTimeout(function () {
		initMap(source, el);
	}, 100);
}

function initMap(source: string, el: HTMLElement){
	let geojson;

	try {
		geojson = leaflet.geoJSON(
			JSON.parse(source),
			{
				pointToLayer: (feature: object, latlng: object) => {
					return leaflet.marker(latlng, { icon: new leaflet.Icon.Default() });
				}
			}
		);
	} catch (e) {
		el.createEl("p").setText(e);
		return
	}

	const map_el = el.createDiv(
		{ cls: 'geojson-map' },
		(el: HTMLDivElement) => {
			el.style.zIndex = '1';
			el.style.width = '100%';
			el.style.aspectRatio = '16/9';
		}
	);

	const map = new leaflet.Map(map_el, {
		center: 0,
		zoom: 0,
		zoomControl: false,
		worldCopyJump: true,
		maxBoundsViscosity: 1.0,
	});

	map.setView([0, 0], 0);

	leaflet.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
		maxZoom: 19,
		attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
	}).addTo(map);

	geojson.addTo(map);

	map.invalidateSize();
	map.fitBounds(geojson.getBounds(), {maxZoom: 50});

	map.pm.addControls({
		position: 'topleft',
		drawCircle: false,
	});
}
