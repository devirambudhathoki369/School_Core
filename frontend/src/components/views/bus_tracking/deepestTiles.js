import L from 'leaflet';
import { enlargedTile } from './tracking';

// How many levels above itself a square may be cut from (16 times enlarged).
const CLIMB = 4;
// A transparent pixel — not Leaflet's own, which it uses to mark a tile as let go.
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const named = ({ z, x, y }) => `${z}/${x}/${y}`;
// What each map service has shown itself to lack, for as long as the page is
// open: switching between satellite and street map does not start over.
const LEARNT = {};

/**
 * Esri has not drawn every place at every zoom: around Dang the satellite
 * picture stops at level 18 and the street map at 17, and past that it serves
 * a grey "Map data not yet available" square. Asked with `blankTile=false` it
 * answers 404 instead, and the square is then cut from the deepest tile that
 * does exist and enlarged — so every zoom shows the sharpest picture there is
 * of that spot, square by square, and a town drawn deeper keeps its detail.
 *
 * A 404 takes about as long as a picture, so the depth found for one square is
 * where its neighbours start: they are drawn at once from that level, and
 * only then asked, out of sight, whether anything deeper exists for them.
 */
const DeepestTiles = L.TileLayer.extend({
    createTile(coords, done) {
        const tile = document.createElement('img');
        tile.alt = '';
        const learnt = LEARNT[this._url] || (LEARNT[this._url] = { absent: new Set() });
        const { absent } = learnt;
        const size = this.getTileSize().x;
        const from = up => enlargedTile(coords, up, size);
        const address = up => `${L.Util.template(this._url, from(up))}?blankTile=false`;
        // Nothing lies beneath a tile that is not there: start above the
        // highest one known to be missing, and no deeper than the last find.
        let up = learnt.deepest < coords.z ? Math.min(CLIMB, coords.z - learnt.deepest) : 0;
        for (let level = up; level < CLIMB; level++) if (absent.has(named(from(level)))) up = level + 1;
        const refused = [];
        // Leaflet empties a tile it is letting go of; nothing more is owed to it.
        const dropped = () => tile.getAttribute('src') === L.Util.emptyImageUrl;
        // Pictures from above are fetched apart from the square and put in only
        // once they have arrived.
        const ask = (level, arrived, refusal) => {
            const picture = new Image();
            picture.onload = () => dropped() || arrived();
            picture.onerror = event => dropped() || refusal(event);
            picture.src = address(level);
        };
        // An enlarged picture is the square's background, so the square keeps
        // its own size and meets its neighbours exactly as any tile does.
        const place = () => {
            const { full, left, top } = from(up);
            Object.assign(tile.style, up
                ? { background: `url("${address(up)}") ${-left}px ${-top}px / ${full}px ${full}px no-repeat` }
                : { background: '' });
            tile.src = up ? BLANK : address(0);
        };
        const sharpen = () => {
            if (!up || absent.has(named(from(up - 1)))) return;
            ask(up - 1, () => {
                up -= 1;
                place();
                learnt.deepest = Math.max(learnt.deepest || 0, coords.z - up);
                sharpen();
            }, () => absent.add(named(from(up - 1))));
        };
        const arrive = () => {
            // A picture came, so what was refused beneath it is missing rather
            // than a dropped connection, and is not asked for again.
            if (absent.size > 5000) absent.clear();
            refused.forEach(level => absent.add(named(from(level))));
            if (refused.length) learnt.deepest = coords.z - up;
            place();
            done(null, tile);
            sharpen();
        };
        const refuse = (event) => {
            if (up >= CLIMB || coords.z <= up) { done(event, tile); return; }
            refused.push(up);
            up += 1;
            ask(up, arrive, refuse);
        };
        if (up) {
            ask(up, arrive, refuse);
        } else {
            // The usual case is an ordinary tile, loaded the way Leaflet loads one.
            tile.onload = () => { tile.onload = tile.onerror = null; if (!dropped()) done(null, tile); };
            tile.onerror = (event) => { tile.onload = tile.onerror = null; refuse(event); };
            tile.src = address(0);
        }
        return tile;
    },
});

export default function deepestTiles(url, options) {
    return new DeepestTiles(url, options);
}
