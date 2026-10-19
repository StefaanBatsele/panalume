<script module>
  // One button per line: "target | name | icon | popup title".
  export const parseButtons = (text) => String(text || '').split('\n').map((line) => line.split('|').map((s) => s.trim())).filter(([target]) => target).map(([target, name, icon, title]) => {
    const popup = target.match(/^popup\s*:\s*(.*)$/i);
    return popup
      ? { popup: popup[1].split(',').map((s) => s.trim()).filter(Boolean), name, icon, title }
      : { entity: target, name, icon };
  });
  export const meta = {
    type: 'room', name: 'Room', icon: 'mdi:sofa', category: 'Controls',
    size: { w: 450, h: 240 }, tap: 'none', hold: 'none',
    // The button entities sit inside one text setting, so name them for the state subscription.
    watch: (p) => parseButtons(p.buttons).map((b) => b.entity).filter(Boolean),
    defaults: { name: 'Room', buttons: '', language: 'en' },
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'icon', label: 'Icon', type: 'icon' },
      { key: 'area', label: 'HA area id for the background photo (e.g. living_room)', type: 'text' },
      { key: 'image', label: 'Own background photo URL (overrides the area photo)', type: 'text' },
      { key: 'temperature', label: 'Temperature', type: 'entity', domain: 'sensor' },
      { key: 'humidity', label: 'Humidity', type: 'entity', domain: 'sensor' },
      { key: 'power', label: 'Power', type: 'entity', domain: 'sensor' },
      // One button per line: "target | name | icon | popup title". The target is
      // an entity (tap toggles, long press shows details) or "popup: id, id" with
      // the ids of cards to show in a popup.
      { key: 'buttons', label: 'Buttons, one per line: entity | name | icon   or   popup: card-id, card-id | name | icon | title', type: 'textarea' },
      { key: 'language', label: 'Language', type: 'select', options: [{ value: 'en', label: 'English' }, { value: 'nl', label: 'Nederlands' }] },
    ],
  };
</script>

<script>
  // A room: name and how many things are on, temperature / humidity and power
  // top right, a row of buttons that switch devices or open a popup with other
  // cards — on the photo of the HA area (or one of your own), like the room
  // cards of a tablet dashboard.
  import Icon from '../components/Icon.svelte';
  import { t, ent } from '../lib/tpl.js';
  import { isActive, toggle, entityIcon, formatNumber, stateText } from '../lib/entity.js';
  import { send, conn, haImage, callService } from '../lib/ha.svelte.js';
  import { app } from '../lib/config.svelte.js';
  let { props, w = 450 } = $props();

  const TXT = { en: { none: 'All off', on: (n) => `${n} on` }, nl: { none: 'Alles uit', on: (n) => `${n} aan` } };
  const L = $derived(TXT[props.language] || TXT.en);

  const buttons = $derived(parseButtons(props.buttons));
  const active = $derived(buttons.filter((b) => b.entity && isActive(ent(b.entity))).length);

  // Photo of the HA area, looked up once; an own image wins.
  let areas = $state(null);
  $effect(() => {
    if (!props.area || props.image || areas || !conn.connected) return;
    send({ type: 'config/area_registry/list' }).then((list) => (areas = list)).catch(() => (areas = []));
  });
  const photo = $derived(t(props.image) || areas?.find((a) => a.area_id === props.area)?.picture || '');
  // Absolute, because a relative url() in a CSS variable resolves against the stylesheet.
  const bg = $derived(photo ? new URL(photo.startsWith('/') ? haImage(photo) : photo, location.href).href : '');

  const num = (id, unit, digits) => {
    const e = ent(id);
    const v = Number(e?.state);
    return e && Number.isFinite(v) ? `${formatNumber(v, digits)} ${e.attributes.unit_of_measurement || unit}` : null;
  };
  const climate = $derived([num(props.temperature, '°C', 1), num(props.humidity, '%', 1)].filter(Boolean));
  const power = $derived.by(() => {
    const e = ent(props.power);
    if (!e) return null;
    const v = Number(e.state), u = e.attributes.unit_of_measurement || '';
    if (!Number.isFinite(v)) return stateText(e);
    return u === 'W' && v >= 1000 ? `${formatNumber(v / 1000, 2)} kW` : `${formatNumber(v, 0)} ${u}`;
  });

  const details = (id) => id && (app.popup = { entity: id });
  function press(b) {
    if (b.popup) return void (app.popup = { cards: b.popup, title: b.title || b.name });
    const e = ent(b.entity);
    if (!e) return;
    // A room button switches a TV or speaker on and off rather than play / pause.
    if (e.entity_id.startsWith('media_player.')) callService('media_player', e.state === 'off' ? 'turn_on' : 'turn_off', {}, { entity_id: e.entity_id });
    else toggle(e);
  }
  const narrow = $derived(w < 340);
</script>

<div class="room" class:photo={!!bg} class:narrow style={bg ? `--bg:url("${bg}")` : ''}>
  <div class="top">
    <div class="head">
      <span class="ic" class:on={active > 0}><Icon icon={props.icon || 'mdi:door'} size="1.3em" /></span>
      <span class="txt"><b>{t(props.name)}</b><small>{active ? L.on(active) : L.none}</small></span>
    </div>
    <div class="badges">
      {#if climate.length}<button class="clim" data-stop onclick={() => details(props.temperature || props.humidity)}>{climate.join(' ')}</button>{/if}
      {#if power}<button class="pow" data-stop onclick={() => details(props.power)}><Icon icon="mdi:flash" size="1em" />{power}</button>{/if}
    </div>
  </div>
  <div class="btns">
    {#each buttons as b, i (i)}
      {@const e = b.entity ? ent(b.entity) : null}
      {@const on = !!e && isActive(e)}
      <div class="b">
        <button class:on data-stop title={b.entity ? `${b.name || e?.attributes.friendly_name || b.entity}: ${stateText(e)}` : b.name || ''}
          onclick={() => press(b)} oncontextmenu={(ev) => { if (b.entity) { ev.preventDefault(); details(b.entity); } }}>
          <Icon icon={b.icon || (b.popup ? 'mdi:dots-horizontal' : e ? entityIcon(e) : 'mdi:help')} size="1.6em" />
        </button>
        <span>{b.name || e?.attributes.friendly_name || b.entity || ''}</span>
      </div>
    {/each}
  </div>
</div>

<style>
  .room { position: relative; height: 100%; display: flex; flex-direction: column; justify-content: space-between; gap: 14px; isolation: isolate; }
  /* The photo fills the whole card (padding included), darkened top and bottom so the text stays readable. */
  .photo::before { content: ''; position: absolute; inset: calc(var(--pad, 16px) * -1); z-index: -1; border-radius: inherit; background: linear-gradient(180deg, rgba(0,0,0,.65) 0%, rgba(0,0,0,.25) 50%, rgba(0,0,0,.7) 100%), var(--bg) center / cover; }
  .top { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; gap: 8px; }
  .head { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .ic { width: 2.4em; height: 2.4em; border-radius: 14px; display: grid; place-items: center; flex: none; background: rgba(255,255,255,.08); transition: color .3s; }
  .ic.on { color: var(--on, #ffc861); }
  .txt { display: flex; flex-direction: column; min-width: 0; }
  .txt b { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .txt small { font-size: .78em; color: var(--muted); }
  .badges { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .badges button { all: unset; cursor: pointer; font-size: .82em; white-space: nowrap; }
  .clim { padding: 6px 4px; }
  .pow { display: flex; align-items: center; gap: 4px; padding: 6px 10px !important; border-radius: 12px; background: rgba(255,255,255,.08); }
  .pow :global(svg) { color: #ff9a3c; }
  .btns { display: flex; flex-wrap: wrap; gap: 10px; }
  .b { display: flex; flex-direction: column; align-items: center; gap: 6px; width: 60px; }
  .b button { all: unset; cursor: pointer; width: 52px; height: 52px; border-radius: 16px; display: grid; place-items: center; background: rgba(255,255,255,.08); transition: background .2s, color .2s; }
  .b button.on { background: var(--on, #ffc861); color: #1c1c1f; }
  .b button:focus-visible { outline: 2px solid var(--accent); }
  .b span { font-size: .7em; color: var(--muted); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .photo .b span, .photo .txt small { color: rgba(255,255,255,.75); }
  .narrow .b { width: 52px; }
  .narrow .b button { width: 46px; height: 46px; }
</style>
